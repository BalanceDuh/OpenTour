import { GoogleGenAI } from '@google/genai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

import { buildCsv, buildPlanPrompt } from './prompts.mjs';
import { planResponseSchema } from './schema.mjs';

const parseModelText = (text) => {
    const trimmed = String(text || '').trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const payload = fenced ? fenced[1].trim() : trimmed;
    try {
        return JSON.parse(payload);
    } catch {
        const firstBrace = payload.indexOf('{');
        const lastBrace = payload.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(payload.slice(firstBrace, lastBrace + 1));
        }
        throw new Error('Gemini returned invalid JSON');
    }
};

const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

const finiteOr = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const normalizeAngleDeg = (value) => {
    let result = value % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
};

const clampPitchDeg = (value) => Math.max(-89, Math.min(89, value));

const radToDeg = (value) => value * 180 / Math.PI;

const deriveCameraState = (mview) => {
    const radius = Math.max(0.001, finiteOr(mview?.radius, 1));
    const pitch = finiteOr(mview?.rotation?.[0], 0);
    const yaw = finiteOr(mview?.rotation?.[1], 0);
    const pivot = Array.isArray(mview?.pivot) ? mview.pivot : [0, 0, 0];
    const cosPitch = Math.cos(pitch);
    const cameraX = finiteOr(pivot[0], 0) + radius * Math.sin(yaw) * cosPitch;
    const cameraY = finiteOr(pivot[1], 0) - radius * Math.sin(pitch);
    const cameraZ = finiteOr(pivot[2], 0) + radius * Math.cos(yaw) * cosPitch;
    return {
        mview: {
            pivot: [finiteOr(pivot[0], 0), finiteOr(pivot[1], 0), finiteOr(pivot[2], 0)],
            rotation: [pitch, yaw],
            radius,
            fov: finiteOr(mview?.fov, 40)
        },
        cameraX,
        cameraY,
        cameraZ,
        lookAtX: finiteOr(pivot[0], 0),
        lookAtY: finiteOr(pivot[1], 0),
        lookAtZ: finiteOr(pivot[2], 0),
        yawDeg: normalizeAngleDeg(radToDeg(yaw)),
        pitchDeg: clampPitchDeg(normalizeAngleDeg(radToDeg(pitch))),
        fovDeg: finiteOr(mview?.fov, 40),
        radius
    };
};

const degToRad = (value) => value * Math.PI / 180;

const deriveMviewFromLegacyCamera = (camera, fallbackMview) => {
    const basePivot = fallbackMview?.pivot || [0, 0, 0];
    const baseRotation = fallbackMview?.rotation || [0, 0];
    const pivotX = finiteOr(camera?.lookAtX, basePivot[0]);
    const pivotY = finiteOr(camera?.lookAtY, basePivot[1]);
    const pivotZ = finiteOr(camera?.lookAtZ, basePivot[2]);
    const hasCameraPosition = [camera?.cameraX, camera?.cameraY, camera?.cameraZ, camera?.lookAtX, camera?.lookAtY, camera?.lookAtZ]
        .every((value) => Number.isFinite(Number(value)));
    const fallbackRadius = finiteOr(fallbackMview?.radius, 1);
    const fallbackPitchDeg = radToDeg(finiteOr(baseRotation[0], 0));
    const fallbackYawDeg = radToDeg(finiteOr(baseRotation[1], 0));
    const seededRadius = Math.max(0.001, finiteOr(camera?.radius, fallbackRadius));
    const seededPitchDeg = clampPitchDeg(finiteOr(camera?.pitchDeg, fallbackPitchDeg));
    const seededYawDeg = normalizeAngleDeg(finiteOr(camera?.yawDeg, fallbackYawDeg));
    const seededCosPitch = Math.cos(degToRad(seededPitchDeg));
    const seededCameraX = pivotX + seededRadius * Math.sin(degToRad(seededYawDeg)) * seededCosPitch;
    const seededCameraY = pivotY - seededRadius * Math.sin(degToRad(seededPitchDeg));
    const seededCameraZ = pivotZ + seededRadius * Math.cos(degToRad(seededYawDeg)) * seededCosPitch;
    const dx = (hasCameraPosition ? finiteOr(camera?.cameraX, seededCameraX) : seededCameraX) - pivotX;
    const dy = (hasCameraPosition ? finiteOr(camera?.cameraY, seededCameraY) : seededCameraY) - pivotY;
    const dz = (hasCameraPosition ? finiteOr(camera?.cameraZ, seededCameraZ) : seededCameraZ) - pivotZ;
    const derivedRadius = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    const radius = Math.max(0.001, Number.isFinite(derivedRadius) && derivedRadius > 0 ? derivedRadius : seededRadius);
    const derivedYawDeg = normalizeAngleDeg(radToDeg(Math.atan2(dx, dz)));
    const derivedPitchDeg = clampPitchDeg(radToDeg(Math.atan2(-dy, Math.sqrt((dx * dx) + (dz * dz)) || 0.0001)));
    const pitchDeg = Number.isFinite(derivedPitchDeg) ? derivedPitchDeg : seededPitchDeg;
    const yawDeg = Number.isFinite(derivedYawDeg) ? derivedYawDeg : seededYawDeg;
    return {
        pivot: [pivotX, pivotY, pivotZ],
        rotation: [degToRad(pitchDeg), degToRad(yawDeg)],
        radius,
        fov: finiteOr(camera?.fovDeg, finiteOr(fallbackMview?.fov, 40))
    };
};

const hasUsableMview = (mview) => Array.isArray(mview?.pivot)
    && Array.isArray(mview?.rotation)
    && [mview.pivot[0], mview.pivot[1], mview.pivot[2], mview.rotation[0], mview.rotation[1], mview.radius, mview.fov]
        .some((value, index) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > (index >= 5 ? 0.001 : 0.000001));

const hasUsableLegacyCamera = (camera) => [
    camera?.cameraX,
    camera?.cameraY,
    camera?.cameraZ,
    camera?.lookAtX,
    camera?.lookAtY,
    camera?.lookAtZ,
    camera?.yawDeg,
    camera?.pitchDeg
].some((value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.000001);

const buildFallbackSegment = (source, index, captureList, modelContext) => {
    const orderedViews = ['front', 'right', 'back', 'left', 'top', 'bottom'];
    const captureByView = new Map((captureList || []).map((capture) => [capture.view, capture]));
    const capture = captureByView.get(orderedViews[index % orderedViews.length]) || captureList?.[index % Math.max(captureList.length, 1)] || captureList?.[0] || null;
    return {
        segmentId: source.segmentId,
        text: source.text,
        focusView: capture?.view || 'front',
        focusPart: '整体',
        moveBeforeSec: 1.6,
        moveSpeedMps: 0.8,
        speechMode: 'BLOCKING',
        camera: clampCamera(null, modelContext, capture?.camera?.mview),
        rationale: '模型未返回该分句的有效镜头，系统使用参考视角补全。'
    };
};

const clampCamera = (camera, modelContext, fallbackCaptureMview) => {
    const bounds = modelContext?.bounds || { min: [-5, -5, -5], max: [5, 5, 5] };
    const center = modelContext?.center || [0, 0, 0];
    const fallbackMview = {
        pivot: Array.isArray(fallbackCaptureMview?.pivot) ? fallbackCaptureMview.pivot : [Number(center[0] || 0), Number(center[1] || 0), Number(center[2] || 0)],
        rotation: Array.isArray(fallbackCaptureMview?.rotation) ? fallbackCaptureMview.rotation : [0, 0],
        radius: Number(fallbackCaptureMview?.radius || modelContext?.recommendedRadius || 2.5),
        fov: Number(fallbackCaptureMview?.fov || 42)
    };
    const sourceMview = hasUsableMview(camera?.mview)
        ? camera.mview
        : (hasUsableLegacyCamera(camera) ? deriveMviewFromLegacyCamera(camera, fallbackMview) : fallbackMview);
    const mview = {
        pivot: [
            clamp(sourceMview?.pivot?.[0], Number(bounds.min?.[0] ?? -5), Number(bounds.max?.[0] ?? 5), Number(center[0] || 0)),
            clamp(sourceMview?.pivot?.[1], Number(bounds.min?.[1] ?? -5), Number(bounds.max?.[1] ?? 5), Number(center[1] || 0)),
            clamp(sourceMview?.pivot?.[2], Number(bounds.min?.[2] ?? -5), Number(bounds.max?.[2] ?? 5), Number(center[2] || 0))
        ],
        rotation: [
            finiteOr(sourceMview?.rotation?.[0], 0),
            finiteOr(sourceMview?.rotation?.[1], 0)
        ],
        radius: clamp(sourceMview?.radius, 0.3, 60, modelContext?.recommendedRadius || 2.5),
        fov: clamp(sourceMview?.fov, 24, 70, 42)
    };
    return {
        ...deriveCameraState(mview),
        sweepYawDeg: clamp(camera?.sweepYawDeg, -20, 20, 0),
        sweepPitchDeg: clamp(camera?.sweepPitchDeg, -12, 12, 0)
    };
};

const normalizePlan = (plan, segments, modelContext, captures) => {
    const inputSegments = Array.isArray(segments) ? segments : [];
    const captureList = Array.isArray(captures) ? captures : [];
    const byId = new Map(inputSegments.map((segment) => [segment.segmentId, segment]));
    const captureByView = new Map(captureList.map((capture) => [capture.view, capture]));
    const firstCapture = captureList[0] || null;
    const out = {
        title: String(plan?.title || '东汉铜车马讲解运镜').trim() || '东汉铜车马讲解运镜',
        summary: String(plan?.summary || '').trim(),
        segments: []
    };
    const generatedSegments = Array.isArray(plan?.segments) ? plan.segments : [];
    const generatedByNormalizedId = new Map();
    generatedSegments.forEach((segment, index) => {
        const rawId = String(segment?.segmentId || '').trim();
        const normalizedId = rawId.startsWith('seg-') ? rawId : (rawId ? `seg-${rawId.replace(/^seg-/, '')}` : '');
        if (normalizedId) generatedByNormalizedId.set(normalizedId, segment);
        generatedByNormalizedId.set(`__index_${index}`, segment);
    });
    inputSegments.forEach((source, index) => {
        const segment = generatedByNormalizedId.get(source.segmentId) || generatedByNormalizedId.get(`__index_${index}`) || null;
        if (!segment) {
            out.segments.push(buildFallbackSegment(source, index, captureList, modelContext));
            return;
        }
        const normalizedFocusView = ['front', 'back', 'left', 'right', 'top', 'bottom'].includes(segment.focusView) ? segment.focusView : 'front';
        const fallbackCapture = captureByView.get(normalizedFocusView) || firstCapture;
        out.segments.push({
            segmentId: source.segmentId,
            text: source.text,
            focusView: normalizedFocusView,
            focusPart: String(segment.focusPart || '整体').trim() || '整体',
            moveBeforeSec: clamp(segment.moveBeforeSec, 1.0, 2.6, 1.6),
            moveSpeedMps: clamp(segment.moveSpeedMps, 0.3, 1.8, 0.8),
            speechMode: segment.speechMode === 'INTERRUPTIBLE' ? 'INTERRUPTIBLE' : 'BLOCKING',
            camera: clampCamera(segment?.camera, modelContext, fallbackCapture?.camera?.mview),
            rationale: String(segment.rationale || '').trim() || '根据讲解词与参考视角生成镜头。'
        });
    });
    if (out.segments.length < 1) throw new Error('Gemini returned empty segment plan');
    return out;
};

const proxyUrl = String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const createClient = (apiKey) => new GoogleGenAI({
    apiKey,
    timeout: 10 * 60 * 1000,
    maxRetries: 2
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableGeminiError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return [
        'connection error',
        'fetch failed',
        'econnreset',
        'etimedout',
        'socket hang up',
        'network',
        'proxy',
        '503',
        '502',
        '500'
    ].some((token) => message.includes(token));
};

const withGeminiRetry = async (run, onRetry) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
            if (attempt >= 2 || !isRetryableGeminiError(error)) throw error;
            onRetry?.(attempt + 1, error);
            await wait(900 * (attempt + 1));
        }
    }
    throw lastError || new Error('Gemini request failed');
};

export const createExpandedPrompt = async ({ geminiConfig, simplePrompt, narrationText }) => {
    const runtimeModel = String(geminiConfig.model || '').includes('pro') ? 'gemini-3-flash-preview' : geminiConfig.model;
    const client = createClient(geminiConfig.apiKey);
    const interaction = await withGeminiRetry(() => client.interactions.create({
        model: runtimeModel,
        input: [
            {
                type: 'text',
                text: [
                    '你是博物馆文物镜头设计的提示词工程师。',
                    '请把用户给的简单提示词扩展成一段用于复杂提示词模板中的“运镜风格补充”。',
                    '要求：',
                    '1. 输出纯文本，不要 Markdown。',
                    '2. 保持中文。',
                    '3. 只描述镜头风格、节奏、导览感和重点部位偏好，不要改写输出协议。',
                    '4. 不要提及 JSON、schema、segmentId、segments_json、mview、cameraX、lookAtX、yaw、pitch、fov 等字段名。',
                    '5. 强调镜头克制、展陈导览感、先移动后讲解、每句讲解对应一个合适观看面。',
                    '6. 适当结合当前讲解词涉及的主题，例如地位、车制、轻薄、工艺、马的动态。',
                    '7. 控制在 80 到 160 字。',
                    `简单提示词：${String(simplePrompt || '').trim()}`,
                    `讲解词：${String(narrationText || '').trim()}`
                ].join('\n')
            }
        ],
        generation_config: {
            temperature: 0.3,
            thinking_level: 'low',
            thinking_summaries: 'none'
        },
        store: false
    }));
    const text = Array.isArray(interaction.outputs)
        ? interaction.outputs.filter((item) => item.type === 'text').map((item) => item.text || '').join('').trim()
        : '';
    return {
        model: runtimeModel,
        styleGuidance: text
    };
};

export const createStreamingPlan = async ({ geminiConfig, simplePrompt, complexPrompt, narrationText, captures, modelContext, onProgress, isCancelled }) => {
    const request = buildPlanPrompt({ simplePrompt, complexPrompt, narrationText, captures, modelContext });
    onProgress?.({
        stage: 'gemini_request_ready',
        requestPrompt: request.prompt,
        requestMaterials: request.materials,
        partialText: ''
    });
    const runtimeModel = String(geminiConfig.model || '').includes('pro') ? 'gemini-3-flash-preview' : geminiConfig.model;
    const client = createClient(geminiConfig.apiKey);

    const stream = await withGeminiRetry(
        () => client.interactions.create({
            model: runtimeModel,
            input: [
                { type: 'text', text: request.prompt },
                ...captures.filter((capture) => capture.imageDataUrl).map((capture) => ({
                    type: 'image',
                    data: String(capture.imageDataUrl).replace(/^data:image\/png;base64,/, ''),
                    mime_type: 'image/png'
                }))
            ],
            generation_config: {
                temperature: 0.35,
                thinking_level: 'low',
                thinking_summaries: 'none'
            },
            response_format: planResponseSchema,
            stream: true,
            store: false
        }),
        (attempt, error) => onProgress?.({
            stage: 'gemini_retry',
            partialText: `Gemini connection retry ${attempt}: ${String(error?.message || error || '')}`
        })
    );

    const outputs = new Map();
    let interactionId = null;
    let usage = null;

    for await (const chunk of stream) {
        if (isCancelled?.()) throw new Error('cancelled');
        if (chunk.event_type === 'interaction.start') {
            interactionId = chunk.interaction?.id || interactionId;
            onProgress?.({ stage: 'gemini_stream_start', interactionId, partialText: '' });
        } else if (chunk.event_type === 'content.start') {
            outputs.set(chunk.index, { type: chunk.content.type, text: '' });
        } else if (chunk.event_type === 'content.delta') {
            const output = outputs.get(chunk.index) || { type: chunk.delta?.type || 'text', text: '' };
            if (chunk.delta.type === 'text') {
                output.text = `${output.text || ''}${chunk.delta.text || ''}`;
                outputs.set(chunk.index, output);
                onProgress?.({ stage: 'gemini_streaming', interactionId, partialText: output.text });
            }
        } else if (chunk.event_type === 'interaction.complete') {
            usage = chunk.interaction?.usage || null;
            onProgress?.({ stage: 'gemini_complete', interactionId, usage });
        }
    }

    const finalText = [...outputs.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, output]) => output.text || '')
        .join('')
        .trim();

    onProgress?.({
        stage: 'gemini_response_ready',
        partialText: finalText,
        rawResponse: finalText,
        requestPrompt: request.prompt,
        requestMaterials: request.materials,
        interactionId
    });

    const normalized = normalizePlan(parseModelText(finalText), request.segments, modelContext, captures);
    return {
        interactionId,
        model: runtimeModel,
        usage,
        partialText: finalText,
        requestPrompt: request.prompt,
        requestMaterials: request.materials,
        plan: normalized,
        csvText: buildCsv(normalized)
    };
};
