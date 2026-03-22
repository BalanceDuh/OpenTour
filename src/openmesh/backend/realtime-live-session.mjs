import { WebSocketServer } from 'ws';
import { ActivityHandling, GoogleGenAI, Modality } from '@google/genai';

import { buildStaticViewContextText, buildViewAtlasFromCaptures } from './camera-control.mjs';
import { getLlmConfig } from './db-config.mjs';

const LIVE_SESSION_PATH = '/api/cinematic-lite/realtime/live-session';
const SUPPORTED_PROVIDER = 'gemini_live';
const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-2.0-flash-live-preview-04-09';
const VIEW_IDS = new Set(['front', 'right', 'back', 'left', 'top', 'bottom']);

const sendJson = (socket, payload) => {
    if (socket.readyState !== 1) return;
    socket.send(JSON.stringify(payload));
};

const parseJson = (raw) => {
    try {
        return JSON.parse(String(raw || ''));
    } catch {
        return null;
    }
};

const sanitizeCaptures = captures => Array.isArray(captures) ? captures.map((capture) => ({
    captureId: String(capture?.captureId || '').trim() || undefined,
    view: VIEW_IDS.has(String(capture?.view || '').trim()) ? String(capture.view).trim() : 'front',
    note: String(capture?.note || '').trim(),
    source: String(capture?.source || 'manual').trim() || 'manual',
    imageDataUrl: String(capture?.imageDataUrl || ''),
    camera: capture?.camera || null
})).filter(capture => capture.imageDataUrl) : [];

const sanitizeContext = (context) => ({
    captures: sanitizeCaptures(context?.captures),
    modelContext: context?.modelContext && typeof context.modelContext === 'object' ? context.modelContext : {},
    currentSegment: context?.currentSegment && typeof context.currentSegment === 'object' ? context.currentSegment : null
});

const normalizeModel = (model) => {
    const raw = String(model || '').trim();
    return raw || DEFAULT_GEMINI_LIVE_MODEL;
};

const buildSystemInstruction = (context) => {
    const viewAtlas = buildViewAtlasFromCaptures(context.captures, context.modelContext);
    const staticContext = buildStaticViewContextText({ viewAtlas, modelContext: context.modelContext });
    const currentSegment = context.currentSegment
        ? `当前播放片段：${String(context.currentSegment?.text || '').trim()} | 部位=${String(context.currentSegment?.focusPart || '整体')} | 视角=${String(context.currentSegment?.focusView || 'front')}`
        : '当前播放片段：无';
    return [
        staticContext,
        currentSegment,
        '你是实时中文导览助手。',
        '用户会直接打字或说话，你只需要正常回答，不要输出 JSON，不要输出 Markdown。',
        '回答要求：简洁、自然、口语化，优先 1 到 2 句。',
        '如果用户在追问当前内容，优先承接当前讲解语境。'
    ].join('\n\n');
};

const buildTurnPrompt = ({ text, context }) => {
    const currentSegment = context?.currentSegment
        ? `当前片段：${String(context.currentSegment?.text || '').trim()} | 部位=${String(context.currentSegment?.focusPart || '整体')} | 视角=${String(context.currentSegment?.focusView || 'front')}`
        : '当前片段：无';
    return [
        currentSegment,
        '请直接回答下面这句用户输入，不要复述上下文。',
        `用户输入：${String(text || '').trim()}`
    ].join('\n');
};

const extractMessageText = (message) => {
    if (typeof message?.text === 'string' && message.text) return message.text;
    const parts = Array.isArray(message?.serverContent?.modelTurn?.parts) ? message.serverContent.modelTurn.parts : [];
    return parts.map((part) => String(part?.text || '')).join('');
};

const createGeminiLiveConnection = async ({ socket, model, context }) => {
    const llmConfig = getLlmConfig('gemini');
    if (!llmConfig.configured || !llmConfig.apiKey) {
        throw new Error('Gemini API key not configured in database');
    }

    const ai = new GoogleGenAI({ apiKey: llmConfig.apiKey, timeout: 120000, maxRetries: 1 });
    let responseText = '';
    let transcriptText = '';

    const session = await ai.live.connect({
        model: normalizeModel(model),
        config: {
            responseModalities: [Modality.TEXT],
            systemInstruction: buildSystemInstruction(context),
            inputAudioTranscription: { languageCodes: ['zh-CN'] },
            realtimeInputConfig: {
                activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS
            }
        },
        callbacks: {
            onopen: () => {},
            onmessage: (message) => {
                if (message?.setupComplete) {
                    sendJson(socket, {
                        type: 'session_ready',
                        provider: SUPPORTED_PROVIDER,
                        model: normalizeModel(model),
                        sessionId: message.setupComplete.sessionId
                    });
                }
                const voiceActivityType = String(message?.voiceActivity?.voiceActivityType || '');
                if (voiceActivityType === 'ACTIVITY_START') sendJson(socket, { type: 'voice_activity', value: 'start' });
                if (voiceActivityType === 'ACTIVITY_END') sendJson(socket, { type: 'voice_activity', value: 'end' });

                const content = message?.serverContent;
                const transcript = String(content?.inputTranscription?.text || '').trim();
                if (transcript) {
                    transcriptText = transcript;
                    sendJson(socket, {
                        type: content?.inputTranscription?.finished ? 'transcript_final' : 'transcript_partial',
                        text: transcript
                    });
                }

                const delta = extractMessageText(message);
                if (delta) {
                    responseText += delta;
                    sendJson(socket, {
                        type: 'response_partial',
                        delta,
                        text: responseText
                    });
                }

                if (content?.interrupted) {
                    sendJson(socket, {
                        type: 'debug',
                        detail: { interrupted: true, responseText, transcriptText }
                    });
                }

                if (content?.turnComplete) {
                    sendJson(socket, {
                        type: 'response_final',
                        text: responseText.trim(),
                        transcript: transcriptText.trim() || undefined,
                        reason: content?.turnCompleteReason || null
                    });
                    responseText = '';
                    transcriptText = '';
                }
            },
            onerror: (event) => {
                const message = event?.error?.message || event?.message || 'Gemini Live error';
                sendJson(socket, { type: 'error', message: String(message) });
            },
            onclose: () => {
                sendJson(socket, { type: 'debug', detail: 'Gemini Live session closed' });
            }
        }
    });

    return session;
};

const createRealtimeLiveConnection = (socket) => {
    let provider = SUPPORTED_PROVIDER;
    let model = DEFAULT_GEMINI_LIVE_MODEL;
    let context = sanitizeContext(null);
    let session = null;

    const closeSession = () => {
        try {
            session?.close();
        } catch {}
        session = null;
    };

    const ensureSession = async () => {
        if (session) return session;
        if (provider !== SUPPORTED_PROVIDER) throw new Error(`Unsupported live provider: ${provider}`);
        session = await createGeminiLiveConnection({ socket, model, context });
        return session;
    };

    socket.on('message', async (payload, isBinary) => {
        try {
            if (isBinary) {
                const activeSession = await ensureSession();
                activeSession.sendRealtimeInput({
                    audio: new Blob([payload], { type: 'audio/pcm;rate=16000' })
                });
                return;
            }

            const message = parseJson(payload);
            if (!message || typeof message !== 'object') return;
            const type = String(message.type || '');

            if (type === 'session_start') {
                provider = String(message.provider || SUPPORTED_PROVIDER).trim() || SUPPORTED_PROVIDER;
                model = normalizeModel(message.model);
                context = sanitizeContext(message.context);
                await ensureSession();
                return;
            }

            if (type === 'context_update') {
                context = sanitizeContext(message.context);
                sendJson(socket, { type: 'debug', detail: { contextUpdated: true, currentSegment: context.currentSegment } });
                return;
            }

            if (type === 'text_turn') {
                const activeSession = await ensureSession();
                const nextContext = sanitizeContext(message.context || context);
                context = nextContext;
                const prompt = buildTurnPrompt({ text: message.text, context: nextContext });
                activeSession.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: prompt }] }],
                    turnComplete: true
                });
                return;
            }

            if (type === 'audio_end') {
                const activeSession = await ensureSession();
                activeSession.sendRealtimeInput({ audioStreamEnd: true });
                return;
            }

            if (type === 'session_stop') {
                closeSession();
                sendJson(socket, { type: 'session_stopped' });
                return;
            }

            if (type === 'ping') {
                sendJson(socket, { type: 'pong', now: Date.now() });
            }
        } catch (error) {
            sendJson(socket, { type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    });

    socket.on('close', () => closeSession());
};

export const attachRealtimeLiveSessionServer = (server) => {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket) => createRealtimeLiveConnection(socket));

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== LIVE_SESSION_PATH) return;
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    return wss;
};
