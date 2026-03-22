import { createHash } from 'node:crypto';

import { GoogleGenAI } from '@google/genai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

import { buildStaticViewContextText, buildViewAtlasFromCaptures, correctFocusViewBySemantics, inferHeuristicDecision, synthesizeCameraFromDecision } from './camera-control.mjs';
import { synthesizeDashscopeSpeechWithFallback } from './tts-dashscope.mjs';

const VIEW_IDS = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const VIEW_ID_SET = new Set(VIEW_IDS);
const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSION_COUNT = 24;
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
const DEFAULT_GEMINI_CACHE_TTL = '600s';
const STRATEGY_OVERRIDE = String(process.env.RTC_CONVERSATION_STRATEGY || '').trim();

const STRATEGY_BY_PROVIDER = {
    gemini: 'gemini_context_cache',
    qwen: 'ali_session_cache'
};

const proxyUrl = String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const sessionStore = new Map();

const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

const parseDataUrl = (dataUrl) => {
    const text = String(dataUrl || '');
    const match = text.match(/^data:([^;,]+);base64,(.+)$/);
    return match ? { mime: match[1], base64: match[2] } : { mime: 'image/png', base64: '' };
};

const parseModelJson = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return {};
    let payload = trimmed;
    if (trimmed.startsWith('```')) {
        const firstNewline = trimmed.indexOf('\n');
        const closingFence = trimmed.lastIndexOf('```');
        if (firstNewline >= 0 && closingFence > firstNewline) {
            payload = trimmed.slice(firstNewline + 1, closingFence).trim();
        }
    }
    try {
        return JSON.parse(payload);
    } catch {
        const firstBrace = payload.indexOf('{');
        const lastBrace = payload.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(payload.slice(firstBrace, lastBrace + 1));
        }
        throw new Error('Realtime model returned invalid JSON');
    }
};

const hashObject = value => createHash('sha1').update(JSON.stringify(value)).digest('hex');

const guessProvider = model => (String(model || '').toLowerCase().startsWith('qwen') ? 'qwen' : 'gemini');

const summarizeHistory = history => (history || []).slice(-6).map(item => ({
    role: String(item?.role || 'user'),
    content: String(item?.content || '').trim()
})).filter(item => item.content);


const buildDynamicTurnPrompt = ({ question, history, currentSegment, currentCamera }) => {
    const historySummary = summarizeHistory(history);
    return [
        '请只返回 JSON，不要 Markdown，不要解释。',
        'JSON 结构必须为：',
        '{"answer":"...","focusView":"front|back|left|right|top|bottom","focusPart":"...","framing":"wide|medium|close","verticalBias":"up|level|down","orbitBias":"slight_left|center|slight_right","speechMode":"BLOCKING|INTERRUPTIBLE","reasonShort":"..."}',
        '规则：',
        '1. 优先根据问题语义选择最合适的固定视角。',
        '2. 回答必须简洁自然，使用中文。',
        '3. 不要输出 cameraX、yawDeg、pitchDeg、mview 等相机数值。',
        '4. 若问题与当前讲解连续，尽量延续当前语境。',
        `用户问题：${String(question || '').trim()}`,
        currentSegment ? `当前主播放片段：${currentSegment.text} | 部位=${currentSegment.focusPart} | 视角=${currentSegment.focusView}` : '当前主播放片段：无',
        currentCamera ? `当前相机：${JSON.stringify(currentCamera)}` : '当前相机：无',
        historySummary.length ? `最近对话：${JSON.stringify(historySummary)}` : '最近对话：无'
    ].join('\n');
};

const buildLegacyPrompt = ({ question, captures, modelContext, currentSegment, history }) => {
    const captureSummary = (captures || []).map(capture => `- ${capture.view}: ${capture.note}`).join('\n');
    const historySummary = summarizeHistory(history).map(item => `${item.role}: ${item.content}`).join('\n');
    return [
        '你是 Cinematic Lite 的实时导览助手。',
        '用户会在主 CSV 播放过程中提问，你要快速回答，并决定应该切到哪个视角和哪个部位。',
        '请只返回 JSON，不要 Markdown，不要解释。',
        'JSON 结构必须为：',
        '{"answer":"...","focusView":"front|back|left|right|top|bottom","focusPart":"...","moveBeforeSec":1.1,"moveSpeedMps":0.8,"camera":{...},"speechMode":"BLOCKING"}',
        'camera 必须包含：cameraX,cameraY,cameraZ,lookAtX,lookAtY,lookAtZ,yawDeg,pitchDeg,fovDeg,radius,sweepYawDeg,sweepPitchDeg。',
        '回答要求：',
        '1. 用中文，简洁自然，优先直接回答用户。',
        '2. focusView 和 camera 要对应最适合观察该问题相关部位的位置。',
        '3. 如果问题是在追问当前内容，尽量延续当前讲解语境。',
        '4. 如果看不出来，也要给出合理回答，并选择最相关的整体视角。',
        `用户问题：${String(question || '').trim()}`,
        currentSegment ? `当前主播放片段：${currentSegment.text} | 部位=${currentSegment.focusPart} | 视角=${currentSegment.focusView}` : '当前主播放片段：无',
        historySummary ? `最近对话：\n${historySummary}` : '最近对话：无',
        captureSummary ? `六面截图说明：\n${captureSummary}` : '六面截图说明：无',
        `模型空间信息：${JSON.stringify(modelContext || {})}`
    ].join('\n');
};

const sessionTextForQwen = (session) => {
    const turns = session.turns || [];
    return turns.map(turn => `${turn.role}: ${turn.content}`).join('\n');
};

const buildSessionKey = ({ provider, model, captures, modelContext }) => hashObject({
    provider,
    model,
    captures: (captures || []).map(capture => ({
        captureId: capture.captureId || null,
        view: capture.view,
        note: capture.note,
        imageHash: hashObject(String(capture.imageDataUrl || '').slice(0, 120))
    })),
    modelContext: {
        center: modelContext?.center || [],
        bounds: modelContext?.bounds || {}
    }
});

const ensureSessionCapacity = () => {
    if (sessionStore.size < MAX_SESSION_COUNT) return;
    const sessions = [...sessionStore.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    while (sessions.length && sessionStore.size >= MAX_SESSION_COUNT) {
        const oldest = sessions.shift();
        if (oldest) sessionStore.delete(oldest.key);
    }
};

const pruneExpiredSessions = () => {
    const now = Date.now();
    for (const [key, session] of sessionStore.entries()) {
        if ((now - session.updatedAt) > DEFAULT_SESSION_TTL_MS) sessionStore.delete(key);
    }
};

const createSession = ({ key, provider, model, captures, modelContext }) => {
    ensureSessionCapacity();
    const viewAtlas = buildViewAtlasFromCaptures(captures, modelContext);
    const session = {
        sessionId: `rtc_${Date.now().toString(36)}_${key.slice(0, 8)}`,
        key,
        provider,
        model,
        strategy: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        turnCount: 0,
        turns: [],
        staticContext: {
            captures,
            modelContext,
            viewAtlas,
            staticText: buildStaticViewContextText({ viewAtlas, modelContext }),
            fingerprint: hashObject({ viewAtlas, modelContext })
        },
        providerState: {
            gemini: {
                cacheName: null,
                cacheCreatedAt: 0
            },
            qwen: {
                previousResponseId: null,
                sessionCacheEnabled: false,
                cachedTokens: 0
            }
        }
    };
    sessionStore.set(key, session);
    return session;
};

const getOrCreateSession = ({ provider, model, captures, modelContext }) => {
    pruneExpiredSessions();
    const key = buildSessionKey({ provider, model, captures, modelContext });
    const existing = sessionStore.get(key);
    if (existing) {
        existing.updatedAt = Date.now();
        return { session: existing, created: false };
    }
    return { session: createSession({ key, provider, model, captures, modelContext }), created: true };
};

const rememberTurn = (session, role, content) => {
    session.turns.push({ role, content: String(content || '').trim(), at: Date.now() });
    if (session.turns.length > 12) session.turns.splice(0, session.turns.length - 12);
    session.updatedAt = Date.now();
};

const createGeminiClient = apiKey => new GoogleGenAI({ apiKey, timeout: 120000, maxRetries: 1 });

const normalizeGeminiModel = (model) => {
    const raw = String(model || '').trim();
    if (!raw) return DEFAULT_GEMINI_MODEL;
    if (raw === 'gemini-2.5-flash') return DEFAULT_GEMINI_MODEL;
    if (raw === 'gemini-3-pro-preview') return 'gemini-3.1-pro-preview';
    return raw;
};

const ensureGeminiCache = async ({ client, model, session }) => {
    if (session.providerState.gemini.cacheName) return { cacheCreated: false, cacheName: session.providerState.gemini.cacheName };
    const parts = [{ text: session.staticContext.staticText }];
    VIEW_IDS.forEach((viewId) => {
        const item = session.staticContext.viewAtlas[viewId];
        if (!item?.imageDataUrl) return;
        const parsed = parseDataUrl(item.imageDataUrl);
        if (!parsed.base64) return;
        parts.push({ inlineData: { mimeType: parsed.mime || 'image/png', data: parsed.base64 } });
    });
    const cache = await client.caches.create({
        model,
        config: {
            displayName: `rtc-${session.sessionId}`,
            ttl: DEFAULT_GEMINI_CACHE_TTL,
            systemInstruction: 'You are a cinematic realtime assistant. Use the cached six-view context to decide the correct fixed view. Return strict JSON only.',
            contents: [{ role: 'user', parts }]
        }
    });
    const geminiState = session.providerState.gemini;
    geminiState.cacheName = cache.name || null;
    geminiState.cacheCreatedAt = Date.now();
    return { cacheCreated: true, cacheName: geminiState.cacheName };
};

const callGeminiViewDecisionWithCache = async ({ llmConfig, session, prompt }) => {
    const client = createGeminiClient(llmConfig.apiKey);
    const model = normalizeGeminiModel(llmConfig.model);
    const cacheState = await ensureGeminiCache({ client, model, session });
    const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            cachedContent: session.providerState.gemini.cacheName,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'low' }
        }
    });
    return {
        rawText: String(response.text || '').trim(),
        cacheState,
        usage: response.usageMetadata || null,
        model
    };
};

const callGeminiViewDecisionWithoutCache = async ({ llmConfig, session, prompt }) => {
    const client = createGeminiClient(llmConfig.apiKey);
    const model = normalizeGeminiModel(llmConfig.model);
    const parts = [{ text: `${session.staticContext.staticText}\n\n${prompt}` }];
    VIEW_IDS.forEach((viewId) => {
        const item = session.staticContext.viewAtlas[viewId];
        if (!item?.imageDataUrl) return;
        const parsed = parseDataUrl(item.imageDataUrl);
        if (!parsed.base64) return;
        parts.push({ inlineData: { mimeType: parsed.mime || 'image/png', data: parsed.base64 } });
    });
    const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'low' }
        }
    });
    return {
        rawText: String(response.text || '').trim(),
        cacheState: { cacheCreated: false, cacheName: null },
        usage: response.usageMetadata || null,
        model
    };
};

const parseQwenResponsesOutput = (data) => {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
    if (Array.isArray(data?.output)) {
        const text = data.output.flatMap(item => (Array.isArray(item?.content) ? item.content : []))
        .map(item => item?.text || item?.content || '')
        .filter(Boolean)
        .join('')
        .trim();
        if (text) return text;
    }
    return '';
};

const getQwenResponseError = (response, data) => {
    const bodyMessage = String(data?.error?.message || '').trim();
    const bodyCode = String(data?.error?.code || '').trim();
    const status = String(data?.status || '').trim();
    if (bodyMessage) return bodyCode ? `${bodyCode}: ${bodyMessage}` : bodyMessage;
    if (!response.ok) return `Qwen Responses HTTP ${response.status}`;
    if (status && status !== 'completed') return `Qwen response status=${status}`;
    return '';
};

const createQwenRequestInput = ({ session, prompt, includeStaticContext }) => {
    if (!includeStaticContext) {
        return [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }];
    }
    const staticUserContent = [{ type: 'input_text', text: session.staticContext.staticText }];
    if (session.turns.length) {
        staticUserContent.push({ type: 'input_text', text: `会话摘要：\n${sessionTextForQwen(session)}` });
    }
    VIEW_IDS.forEach((viewId) => {
        const item = session.staticContext.viewAtlas[viewId];
        if (!item?.imageDataUrl) return;
        staticUserContent.push({ type: 'input_image', image_url: item.imageDataUrl });
    });
    staticUserContent.push({ type: 'input_text', text: prompt });
    return [
        {
            role: 'system',
            content: [{ type: 'input_text', text: '你是 Cinematic Lite 的实时导览助手。请严格根据六视图和用户问题回答，并且只返回 JSON。' }]
        },
        { role: 'user', content: staticUserContent }
    ];
};

const callQwenResponsesTurn = async ({ llmConfig, session, prompt, includeStaticContext }) => {
    const input = createQwenRequestInput({ session, prompt, includeStaticContext });
    const body = {
        model: llmConfig.model,
        input,
        enable_thinking: false
    };
    if (!includeStaticContext && session.providerState.qwen.previousResponseId) {
        body.previous_response_id = session.providerState.qwen.previousResponseId;
    }
    const response = await fetch('https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${llmConfig.apiKey}`,
            'x-dashscope-session-cache': 'enable'
        },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    const responseError = getQwenResponseError(response, data);
    if (responseError) {
        const error = new Error(responseError);
        error.qwenRequest = {
            model: body.model,
            includeStaticContext,
            previousResponseId: body.previous_response_id || null,
            inputRoles: input.map(item => item.role),
            inputContentTypes: input.map(item => Array.isArray(item.content) ? item.content.map(part => part.type) : typeof item.content)
        };
        error.qwenResponse = data;
        throw error;
    }
    const qwenState = session.providerState.qwen;
    qwenState.previousResponseId = String(data?.id || qwenState.previousResponseId || '');
    qwenState.sessionCacheEnabled = true;
    qwenState.cachedTokens = Number(data?.usage?.input_tokens_details?.cached_tokens || data?.usage?.prompt_tokens_details?.cached_tokens || 0);
    return {
        rawText: parseQwenResponsesOutput(data),
        responseId: qwenState.previousResponseId,
        cachedTokens: qwenState.cachedTokens,
        responseStatus: String(data?.status || ''),
        responseBody: data,
        requestSummary: {
            includeStaticContext,
            previousResponseId: body.previous_response_id || null,
            inputRoles: input.map(item => item.role),
            inputContentTypes: input.map(item => Array.isArray(item.content) ? item.content.map(part => part.type) : typeof item.content)
        }
    };
};

const callQwenLegacyTurn = async ({ model, apiKey, prompt, imageDataUrls }) => {
    const content = [{ type: 'text', text: prompt }];
    imageDataUrls.filter(Boolean).forEach(url => content.push({ type: 'image_url', image_url: { url } }));
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 1200,
            messages: [
                { role: 'system', content: 'You are a cinematic realtime assistant. Return strict JSON only.' },
                { role: 'user', content }
            ]
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error?.message || `Qwen HTTP ${response.status}`));
    return String(data?.choices?.[0]?.message?.content || '').trim();
};

const clampLegacyCamera = (camera, modelContext) => {
    const bounds = modelContext?.bounds || { min: [-5, -5, -5], max: [5, 5, 5] };
    const center = modelContext?.center || [0, 0, 0];
    return {
        cameraX: clamp(camera?.cameraX, Number(bounds.min?.[0] ?? -5) - 6, Number(bounds.max?.[0] ?? 5) + 6, Number(center[0] || 0) + 2),
        cameraY: clamp(camera?.cameraY, Number(bounds.min?.[1] ?? -5) - 6, Number(bounds.max?.[1] ?? 5) + 6, Number(center[1] || 0) + 1.2),
        cameraZ: clamp(camera?.cameraZ, Number(bounds.min?.[2] ?? -5) - 6, Number(bounds.max?.[2] ?? 5) + 6, Number(center[2] || 0) + 2),
        lookAtX: clamp(camera?.lookAtX, Number(bounds.min?.[0] ?? -5), Number(bounds.max?.[0] ?? 5), Number(center[0] || 0)),
        lookAtY: clamp(camera?.lookAtY, Number(bounds.min?.[1] ?? -5), Number(bounds.max?.[1] ?? 5), Number(center[1] || 0)),
        lookAtZ: clamp(camera?.lookAtZ, Number(bounds.min?.[2] ?? -5), Number(bounds.max?.[2] ?? 5), Number(center[2] || 0)),
        yawDeg: clamp(camera?.yawDeg, -180, 180, 0),
        pitchDeg: clamp(camera?.pitchDeg, -85, 85, -8),
        fovDeg: clamp(camera?.fovDeg, 24, 70, 40),
        radius: clamp(camera?.radius, 0.3, 30, modelContext?.recommendedRadius || 2.5),
        sweepYawDeg: clamp(camera?.sweepYawDeg, -20, 20, 4),
        sweepPitchDeg: clamp(camera?.sweepPitchDeg, -12, 12, 2)
    };
};

const legacyFullPayloadStrategy = async ({ llmConfig, session, question, history, modelContext, currentSegment }) => {
    const prompt = buildLegacyPrompt({
        question,
        captures: session.staticContext.captures,
        modelContext,
        currentSegment,
        history
    });
    const imageDataUrls = (session.staticContext.captures || []).map(capture => String(capture?.imageDataUrl || '')).filter(Boolean);
    const provider = guessProvider(llmConfig.model);
    let rawText = '';
    let providerDebug = {};
    if (provider === 'qwen') {
        rawText = await callQwenLegacyTurn({ model: llmConfig.model, apiKey: llmConfig.apiKey, prompt, imageDataUrls });
    } else {
        const response = await callGeminiViewDecisionWithoutCache({ llmConfig, session, prompt });
        rawText = response.rawText;
        providerDebug = { usage: response.usage, model: response.model };
    }
    const parsed = parseModelJson(rawText);
    const answer = String(parsed?.answer || '').trim() || '我先带你看一下这个部位。';
    const segment = {
        segmentId: `chat_${Date.now().toString(36)}`,
        text: answer,
        focusView: VIEW_ID_SET.has(String(parsed?.focusView || '')) ? String(parsed.focusView) : (currentSegment?.focusView || 'front'),
        focusPart: String(parsed?.focusPart || currentSegment?.focusPart || '整体').trim() || '整体',
        moveBeforeSec: clamp(parsed?.moveBeforeSec, 0.4, 2.4, 1.0),
        moveSpeedMps: clamp(parsed?.moveSpeedMps, 0.2, 1.8, 0.8),
        speechMode: parsed?.speechMode === 'INTERRUPTIBLE' ? 'INTERRUPTIBLE' : 'BLOCKING',
        audioUrl: null,
        camera: clampLegacyCamera(parsed?.camera, modelContext)
    };
    return {
        answer,
        segment,
        debug: {
            strategy: 'legacy_full_payload',
            provider,
            rawText,
            ...providerDebug
        }
    };
};

const viewFirstThenCameraStrategy = async ({ provider, llmConfig, session, question, history, modelContext, currentSegment }) => {
    const prompt = buildDynamicTurnPrompt({
        question,
        history,
        currentSegment,
        currentCamera: currentSegment?.camera?.mview || currentSegment?.camera || null
    });
    let rawText = '';
    let providerDebug = {};
    if (provider === 'qwen') {
        rawText = await callQwenLegacyTurn({
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            prompt: `${session.staticContext.staticText}\n\n${prompt}`,
            imageDataUrls: VIEW_IDS.map(viewId => session.staticContext.viewAtlas[viewId]?.imageDataUrl).filter(Boolean)
        });
    } else {
        const response = await callGeminiViewDecisionWithoutCache({ llmConfig, session, prompt });
        rawText = response.rawText;
        providerDebug = { usage: response.usage, model: response.model };
    }
    let decision = inferHeuristicDecision({ question, currentSegment });
    if (rawText) {
        decision = {
            ...decision,
            ...parseModelJson(rawText)
        };
    }
    decision = correctFocusViewBySemantics({ decision, question, currentSegment });
    const camera = synthesizeCameraFromDecision({ decision, viewAtlas: session.staticContext.viewAtlas, modelContext, currentSegment });
    const answer = String(decision.answer || '').trim() || `我先带你看一下${decision.focusPart}。`;
    return {
        answer,
        segment: {
            segmentId: `chat_${Date.now().toString(36)}`,
            text: answer,
            focusView: decision.focusView,
            focusPart: decision.focusPart,
            moveBeforeSec: 0.9,
            moveSpeedMps: 0.8,
            speechMode: decision.speechMode,
            audioUrl: null,
            camera
        },
        debug: {
            strategy: 'view_first_then_camera',
            provider,
            rawText,
            normalizedDecision: decision,
            synthesizedCamera: camera,
            ...providerDebug
        }
    };
};

const geminiContextCacheStrategy = async ({ llmConfig, session, question, history, modelContext, currentSegment }) => {
    const prompt = buildDynamicTurnPrompt({
        question,
        history,
        currentSegment,
        currentCamera: currentSegment?.camera?.mview || currentSegment?.camera || null
    });
    try {
        const response = await callGeminiViewDecisionWithCache({ llmConfig, session, prompt });
        let decision = inferHeuristicDecision({ question, currentSegment });
        if (response.rawText) decision = { ...decision, ...parseModelJson(response.rawText) };
        decision = correctFocusViewBySemantics({ decision, question, currentSegment });
        const camera = synthesizeCameraFromDecision({ decision, viewAtlas: session.staticContext.viewAtlas, modelContext, currentSegment });
        const answer = String(decision.answer || '').trim() || `我先带你看一下${decision.focusPart}。`;
        return {
            answer,
            segment: {
                segmentId: `chat_${Date.now().toString(36)}`,
                text: answer,
                focusView: decision.focusView,
                focusPart: decision.focusPart,
                moveBeforeSec: 0.8,
                moveSpeedMps: 0.85,
                speechMode: decision.speechMode,
                audioUrl: null,
                camera
            },
            debug: {
                strategy: 'gemini_context_cache',
                provider: 'gemini',
                rawText: response.rawText,
                normalizedDecision: decision,
                synthesizedCamera: camera,
                cacheState: response.cacheState,
                usage: response.usage,
                model: response.model
            }
        };
    } catch (error) {
        const fallback = await viewFirstThenCameraStrategy({
            provider: 'gemini',
            llmConfig,
            session,
            question,
            history,
            modelContext,
            currentSegment
        });
        fallback.debug = {
            ...fallback.debug,
            fallbackFrom: 'gemini_context_cache',
            fallbackReason: String(error?.message || error || '')
        };
        return fallback;
    }
};

const aliSessionCacheStrategy = async ({ llmConfig, session, question, history, modelContext, currentSegment }) => {
    const prompt = buildDynamicTurnPrompt({
        question,
        history,
        currentSegment,
        currentCamera: currentSegment?.camera?.mview || currentSegment?.camera || null
    });
    try {
        const response = await callQwenResponsesTurn({
            llmConfig,
            session,
            prompt,
            includeStaticContext: !session.providerState.qwen.previousResponseId
        });
        let decision = inferHeuristicDecision({ question, currentSegment });
        if (response.rawText) decision = { ...decision, ...parseModelJson(response.rawText) };
        decision = correctFocusViewBySemantics({ decision, question, currentSegment });
        const camera = synthesizeCameraFromDecision({ decision, viewAtlas: session.staticContext.viewAtlas, modelContext, currentSegment });
        const answer = String(decision.answer || '').trim() || `我先带你看一下${decision.focusPart}。`;
        return {
            answer,
            segment: {
                segmentId: `chat_${Date.now().toString(36)}`,
                text: answer,
                focusView: decision.focusView,
                focusPart: decision.focusPart,
                moveBeforeSec: 0.8,
                moveSpeedMps: 0.85,
                speechMode: decision.speechMode,
                audioUrl: null,
                camera
            },
            debug: {
                strategy: 'ali_session_cache',
                provider: 'qwen',
                rawText: response.rawText,
                normalizedDecision: decision,
                synthesizedCamera: camera,
                responseId: response.responseId,
                cachedTokens: response.cachedTokens,
                sessionCacheEnabled: session.providerState.qwen.sessionCacheEnabled,
                responseStatus: response.responseStatus,
                qwenRequest: response.requestSummary,
                qwenResponse: response.responseBody
            }
        };
    } catch (error) {
        const fallback = await viewFirstThenCameraStrategy({
            provider: 'qwen',
            llmConfig,
            session,
            question,
            history,
            modelContext,
            currentSegment
        });
        fallback.debug = {
            ...fallback.debug,
            fallbackFrom: 'ali_session_cache',
            fallbackReason: String(error?.message || error || ''),
            qwenRequest: error?.qwenRequest,
            qwenResponse: error?.qwenResponse
        };
        return fallback;
    }
};

const resolveStrategy = (provider) => {
    if (STRATEGY_OVERRIDE) return STRATEGY_OVERRIDE;
    return STRATEGY_BY_PROVIDER[provider] || 'view_first_then_camera';
};

const synthesizeRealtimeSpeech = async ({ answer, ttsConfig, segment }) => {
    if (!ttsConfig?.configured) return segment;
    const tts = await synthesizeDashscopeSpeechWithFallback({
        apiKey: ttsConfig.apiKey,
        model: ttsConfig.model,
        voice: ttsConfig.voice,
        format: ttsConfig.format,
        text: answer
    });
    return {
        ...segment,
        audioUrl: tts.audioUrl || null
    };
};

export const createRealtimeSegmentFromAnswer = async ({ answer, question, captures, modelContext, currentSegment, ttsConfig }) => {
    const seededDecision = inferHeuristicDecision({ question, currentSegment });
    const decision = correctFocusViewBySemantics({
        decision: {
            ...seededDecision,
            answer,
            speechMode: 'INTERRUPTIBLE'
        },
        question: `${question || ''}\n${answer || ''}`,
        currentSegment
    });
    const viewAtlas = buildViewAtlasFromCaptures(captures, modelContext);
    const camera = synthesizeCameraFromDecision({ decision, viewAtlas, modelContext, currentSegment });
    const segment = await synthesizeRealtimeSpeech({
        answer,
        ttsConfig,
        segment: {
            segmentId: `live_${Date.now().toString(36)}`,
            text: String(answer || '').trim() || '我先带你看一下这个部位。',
            focusView: decision.focusView,
            focusPart: decision.focusPart,
            moveBeforeSec: 0.55,
            moveSpeedMps: 0.9,
            speechMode: 'INTERRUPTIBLE',
            audioUrl: null,
            camera
        }
    });
    return {
        answer: segment.text,
        segment,
        debug: {
            provider: 'gemini_live',
            strategy: 'live_segment_heuristic',
            normalizedDecision: decision,
            synthesizedCamera: camera
        }
    };
};

const STRATEGIES = {
    legacy_full_payload: legacyFullPayloadStrategy,
    view_first_then_camera: viewFirstThenCameraStrategy,
    gemini_context_cache: geminiContextCacheStrategy,
    ali_session_cache: aliSessionCacheStrategy
};

export const createRealtimeTurn = async ({ llmConfig, ttsConfig, question, history, captures, modelContext, currentSegment }) => {
    const provider = guessProvider(llmConfig.model);
    const { session, created } = getOrCreateSession({ provider, model: llmConfig.model, captures, modelContext });
    const strategy = resolveStrategy(provider);
    session.strategy = strategy;
    rememberTurn(session, 'user', question);
    const runner = STRATEGIES[strategy] || STRATEGIES.view_first_then_camera;
    const result = await runner({
        provider,
        llmConfig,
        ttsConfig,
        question,
        history,
        captures,
        modelContext,
        currentSegment,
        session
    });
    const answer = String(result?.answer || '').trim() || '我先带你看一下这个部位。';
    const segmentWithAudio = await synthesizeRealtimeSpeech({ answer, ttsConfig, segment: result.segment });
    rememberTurn(session, 'assistant', answer);
    session.turnCount += 1;
    session.updatedAt = Date.now();
    return {
        answer,
        segment: segmentWithAudio,
        debug: {
            provider,
            model: llmConfig.model,
            strategy,
            sessionId: session.sessionId,
            sessionCreated: created,
            sessionTurnCount: session.turnCount,
            viewAtlasViews: Object.keys(session.staticContext.viewAtlas),
            ...result.debug
        }
    };
};
