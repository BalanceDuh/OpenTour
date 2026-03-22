import { clearCameraTesterSnapshots, clearCinematicLiteModelData, createCsvVersion, deleteCameraTesterSnapshot, deleteCsvVersion, getAsrConfig, getCapture, getCsvVersion, getDbStatus, getGeminiConfig, getLlmConfig, getNarration, getRealtimeConfig, getTtsConfig, listCameraTesterSnapshots, listCaptures, listCsvVersions, normalizeTtsSelection, updateCsvVersion, upsertCameraTesterSnapshot, upsertCapture, upsertNarration } from './db-config.mjs';
import { randomUUID } from 'node:crypto';
import { createExpandedPrompt, createStreamingPlan } from './gemini-interactions.mjs';
import { JobStore } from './jobs.mjs';
import { synthesizeDashscopeSpeechWithFallback, synthesizeSegments } from './tts-dashscope.mjs';
import { transcribeAliyunAudio } from './asr-aliyun.mjs';
import { createRealtimeSegmentFromAnswer, createRealtimeTurn } from './realtime-interactions.mjs';

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(payload);
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

const readBodyBuffer = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});

const fail = (res, status, message, details = {}) => {
    json(res, status, { ok: false, error: { message, details } });
};

const sanitizeCaptures = (captures) => Array.isArray(captures) ? captures.map((capture) => ({
    captureId: String(capture?.captureId || '').trim() || undefined,
    view: String(capture?.view || '').trim(),
    note: String(capture?.note || '').trim(),
    source: String(capture?.source || 'manual').trim() || 'manual',
    imageDataUrl: String(capture?.imageDataUrl || ''),
    camera: {
        mview: {
            pivot: [
                Number(capture?.camera?.mview?.pivot?.[0] ?? capture?.camera?.lookAtX ?? 0),
                Number(capture?.camera?.mview?.pivot?.[1] ?? capture?.camera?.lookAtY ?? 0),
                Number(capture?.camera?.mview?.pivot?.[2] ?? capture?.camera?.lookAtZ ?? 0)
            ],
            rotation: [
                Number(capture?.camera?.mview?.rotation?.[0] ?? 0),
                Number(capture?.camera?.mview?.rotation?.[1] ?? 0)
            ],
            radius: Number(capture?.camera?.mview?.radius ?? capture?.camera?.radius ?? 1),
            fov: Number(capture?.camera?.mview?.fov ?? capture?.camera?.fovDeg ?? 40)
        },
        cameraX: Number(capture?.camera?.cameraX || 0),
        cameraY: Number(capture?.camera?.cameraY || 0),
        cameraZ: Number(capture?.camera?.cameraZ || 0),
        lookAtX: Number(capture?.camera?.lookAtX || 0),
        lookAtY: Number(capture?.camera?.lookAtY || 0),
        lookAtZ: Number(capture?.camera?.lookAtZ || 0),
        yawDeg: Number(capture?.camera?.yawDeg || 0),
        pitchDeg: Number(capture?.camera?.pitchDeg || 0),
        fovDeg: Number(capture?.camera?.fovDeg || 40),
        radius: Number(capture?.camera?.radius || 1)
    }
})).filter((capture) => capture.view && capture.imageDataUrl) : [];

const sanitizeCameraTesterSnapshot = (snapshot) => ({
    snapshotId: String(snapshot?.snapshotId || '').trim() || undefined,
    name: String(snapshot?.name || '').trim() || 'Untitled Snapshot',
    note: String(snapshot?.note || '').trim(),
    source: String(snapshot?.source || 'manual').trim() || 'manual',
    camera: {
        mview: {
            pivot: [
                Number(snapshot?.camera?.mview?.pivot?.[0] ?? snapshot?.camera?.lookAtX ?? 0),
                Number(snapshot?.camera?.mview?.pivot?.[1] ?? snapshot?.camera?.lookAtY ?? 0),
                Number(snapshot?.camera?.mview?.pivot?.[2] ?? snapshot?.camera?.lookAtZ ?? 0)
            ],
            rotation: [
                Number(snapshot?.camera?.mview?.rotation?.[0] ?? 0),
                Number(snapshot?.camera?.mview?.rotation?.[1] ?? 0)
            ],
            radius: Number(snapshot?.camera?.mview?.radius ?? snapshot?.camera?.radius ?? 1),
            fov: Number(snapshot?.camera?.mview?.fov ?? snapshot?.camera?.fovDeg ?? 40)
        },
        cameraX: Number(snapshot?.camera?.cameraX ?? 0),
        cameraY: Number(snapshot?.camera?.cameraY ?? 0),
        cameraZ: Number(snapshot?.camera?.cameraZ ?? 0),
        lookAtX: Number(snapshot?.camera?.lookAtX ?? 0),
        lookAtY: Number(snapshot?.camera?.lookAtY ?? 0),
        lookAtZ: Number(snapshot?.camera?.lookAtZ ?? 0),
        yawDeg: Number(snapshot?.camera?.yawDeg ?? 0),
        pitchDeg: Number(snapshot?.camera?.pitchDeg ?? 0),
        fovDeg: Number(snapshot?.camera?.fovDeg ?? 40),
        radius: Number(snapshot?.camera?.radius ?? snapshot?.camera?.mview?.radius ?? 1)
    }
});

const store = new JobStore();

const toJobResponse = (job) => ({
    ok: true,
    job: job ? {
        jobId: job.jobId,
        kind: job.kind,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        heartbeatAt: job.heartbeatAt,
        partialText: job.partialText,
        geminiRequestPrompt: job.geminiRequestPrompt,
        geminiRequestMaterials: job.geminiRequestMaterials,
        geminiRawResponse: job.geminiRawResponse,
        result: job.result,
        error: job.error,
        cancelRequested: job.cancelRequested,
        events: job.events
    } : null
});

export const handleCinematicLiteApi = async (req, res, rawPath) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,PUT,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return true;
    }

    if (rawPath === '/api/cinematic-lite/health' && req.method === 'GET') {
        json(res, 200, { ok: true, service: 'cinematic-lite', status: 'ready' });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/config' && req.method === 'GET') {
        const status = getDbStatus();
        json(res, 200, {
            ok: true,
            config: {
                gemini: {
                    configured: status.gemini.configured,
                    selectedProvider: status.gemini.selectedProvider,
                    model: status.gemini.model,
                    updatedAt: status.gemini.updatedAt
                },
                tts: {
                    configured: status.tts.configured,
                    provider: status.tts.provider,
                    model: status.tts.model,
                    voice: status.tts.voice,
                    updatedAt: status.tts.updatedAt,
                    models: status.ttsCatalog.models,
                    voicesByModel: status.ttsCatalog.voicesByModel
                },
                realtime: getRealtimeConfig()
            }
        });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/realtime/transcribe' && req.method === 'POST') {
        const mimeType = String(req.headers['content-type'] || '').trim();
        const fileName = String(req.headers['x-file-name'] || 'audio.webm').trim() || 'audio.webm';
        const audioBuffer = await readBodyBuffer(req);
        if (audioBuffer.length < 1) {
            fail(res, 400, 'audio body required');
            return true;
        }
        const asrConfig = getAsrConfig();
        if (!asrConfig.configured) {
            fail(res, 400, 'Aliyun API key not configured in database');
            return true;
        }
        const result = await transcribeAliyunAudio({
            apiKey: asrConfig.apiKey,
            model: String(req.headers['x-asr-model'] || asrConfig.model || '').trim() || asrConfig.model,
            audioBuffer,
            mimeType,
            fileName,
            endpoint: asrConfig.endpoint
        });
        json(res, 200, { ok: true, text: result.text, debug: result.debug });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/realtime/live-auth' && req.method === 'GET') {
        const llmConfig = getLlmConfig('gemini');
        if (!llmConfig.configured) {
            fail(res, 400, 'Gemini API key not configured in database');
            return true;
        }
        json(res, 200, {
            ok: true,
            provider: 'gemini_live',
            apiKey: llmConfig.apiKey,
            model: 'gemini-2.0-flash-live-preview-04-09'
        });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/realtime/tts' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const text = String(body.text || '').trim();
        if (!text) {
            fail(res, 400, 'text required');
            return true;
        }
        const persistedTtsConfig = getTtsConfig();
        if (!persistedTtsConfig.configured) {
            fail(res, 400, 'Aliyun API key not configured in database');
            return true;
        }
        const selected = normalizeTtsSelection({ model: body.tts?.model, voice: body.tts?.voice });
        const result = await synthesizeDashscopeSpeechWithFallback({
            apiKey: persistedTtsConfig.apiKey,
            model: selected.model,
            voice: selected.voice,
            format: persistedTtsConfig.format,
            text
        });
        json(res, 200, {
            ok: true,
            audioUrl: result.audioUrl,
            tts: {
                model: selected.model,
                voice: selected.voice,
                format: persistedTtsConfig.format
            },
            debug: result.debug
        });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/realtime/turn' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const question = String(body.question || '').trim();
        const provider = String(body.provider || 'gemini').trim() === 'qwen' ? 'qwen' : 'gemini';
        const model = String(body.model || '').trim();
        const captures = sanitizeCaptures(body.captures);
        const history = Array.isArray(body.history) ? body.history.map((item) => ({ role: String(item?.role || 'user'), content: String(item?.content || '') })) : [];
        const currentSegment = body.currentSegment || null;
        const modelContext = body.modelContext || {};
        if (!question) {
            fail(res, 400, 'question required');
            return true;
        }
        const llmConfig = getLlmConfig(provider);
        if (!llmConfig.configured) {
            fail(res, 400, `${provider} API key not configured in database`);
            return true;
        }
        const ttsConfig = getTtsConfig();
        const result = await createRealtimeTurn({
            llmConfig: { ...llmConfig, model: model || llmConfig.model },
            ttsConfig,
            question,
            history,
            captures,
            modelContext,
            currentSegment
        });
        json(res, 200, { ok: true, ...result });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/realtime/segment' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const question = String(body.question || '').trim();
        const answer = String(body.answer || '').trim();
        const captures = sanitizeCaptures(body.captures);
        const currentSegment = body.currentSegment || null;
        const modelContext = body.modelContext || {};
        if (!answer) {
            fail(res, 400, 'answer required');
            return true;
        }
        const ttsConfig = getTtsConfig();
        const result = await createRealtimeSegmentFromAnswer({
            answer,
            question,
            captures,
            modelContext,
            currentSegment,
            ttsConfig
        });
        json(res, 200, { ok: true, ...result });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/prompts/expand' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const simplePrompt = String(body.simplePrompt || '').trim();
        const narrationText = String(body.narrationText || '').trim();
        if (!simplePrompt) {
            fail(res, 400, 'simplePrompt required');
            return true;
        }
        const geminiConfig = getGeminiConfig();
        if (!geminiConfig.configured) {
            fail(res, 400, 'Gemini API key not configured in database');
            return true;
        }
        const result = await createExpandedPrompt({ geminiConfig, simplePrompt, narrationText });
        json(res, 200, {
            ok: true,
            styleGuidance: result.styleGuidance,
            model: result.model
        });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/captures' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        const captures = sanitizeCaptures(body.captures);
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        if (captures.length < 1) return fail(res, 400, 'captures required'), true;
        captures.forEach((capture) => upsertCapture({ modelFilename, capture }));
        json(res, 200, { ok: true, captures: listCaptures(modelFilename) });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/narration' && req.method === 'GET') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        json(res, 200, { ok: true, narration: getNarration(modelFilename) });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/narration' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        const narrationText = String(body.narrationText || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        if (!narrationText) return fail(res, 400, 'narrationText required'), true;
        json(res, 200, { ok: true, narration: upsertNarration({ modelFilename, narrationText }) });
        return true;
    }

    if (rawPath.startsWith('/api/cinematic-lite/captures') && req.method === 'GET') {
        const url = new URL(`http://localhost${rawPath}${String(req.url || '').includes('?') ? String(req.url).slice(String(req.url).indexOf('?')) : ''}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        const viewId = String(url.searchParams.get('viewId') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        if (viewId) {
            json(res, 200, { ok: true, capture: getCapture(modelFilename, viewId) });
            return true;
        }
        json(res, 200, { ok: true, captures: listCaptures(modelFilename) });
        return true;
    }

    if (rawPath.startsWith('/api/cinematic-lite/reset') && req.method === 'DELETE') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        json(res, 200, { ok: true, ...clearCinematicLiteModelData(modelFilename) });
        return true;
    }

    if (rawPath === '/api/camera-tester/snapshots' && req.method === 'GET') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        json(res, 200, { ok: true, snapshots: listCameraTesterSnapshots(modelFilename) });
        return true;
    }

    if (rawPath === '/api/camera-tester/snapshots' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const snapshot = sanitizeCameraTesterSnapshot(body.snapshot || {});
        const saved = upsertCameraTesterSnapshot({ modelFilename, snapshot });
        json(res, 200, { ok: true, snapshot: saved, snapshots: listCameraTesterSnapshots(modelFilename) });
        return true;
    }

    if (rawPath.startsWith('/api/camera-tester/snapshots/') && req.method === 'DELETE') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const snapshotId = decodeURIComponent(rawPath.split('/').pop() || '').trim();
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!snapshotId) return fail(res, 400, 'snapshotId required'), true;
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const deleted = deleteCameraTesterSnapshot(snapshotId, modelFilename) > 0;
        json(res, 200, { ok: true, deleted, snapshots: listCameraTesterSnapshots(modelFilename) });
        return true;
    }

    if (rawPath.startsWith('/api/camera-tester/reset') && req.method === 'DELETE') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const deleted = clearCameraTesterSnapshots(modelFilename);
        json(res, 200, { ok: true, deleted, snapshots: [] });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/csv/versions' && req.method === 'GET') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        json(res, 200, { ok: true, versions: listCsvVersions(modelFilename) });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/csv/versions' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        const versionName = String(body.versionName || '').trim() || 'Untitled';
        const csvText = String(body.csvText || '');
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const version = createCsvVersion({ id: randomUUID(), modelFilename, versionName, csvText });
        json(res, 200, { ok: true, version, versions: listCsvVersions(modelFilename) });
        return true;
    }

    const csvVersionMatch = rawPath.match(/^\/api\/cinematic-lite\/csv\/versions\/([^/]+)$/);
    if (csvVersionMatch && req.method === 'GET') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const version = getCsvVersion(decodeURIComponent(csvVersionMatch[1]), modelFilename);
        json(res, 200, { ok: true, version });
        return true;
    }

    if (csvVersionMatch && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        const versionName = String(body.versionName || '').trim() || 'Untitled';
        const csvText = String(body.csvText || '');
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        const version = updateCsvVersion({ id: decodeURIComponent(csvVersionMatch[1]), modelFilename, versionName, csvText });
        json(res, 200, { ok: true, version, versions: listCsvVersions(modelFilename) });
        return true;
    }

    if (csvVersionMatch && req.method === 'DELETE') {
        const url = new URL(`http://localhost${req.url || rawPath}`);
        const modelFilename = String(url.searchParams.get('modelFilename') || '').trim();
        if (!modelFilename) return fail(res, 400, 'modelFilename required'), true;
        deleteCsvVersion(decodeURIComponent(csvVersionMatch[1]), modelFilename);
        json(res, 200, { ok: true, versions: listCsvVersions(modelFilename) });
        return true;
    }

    if (rawPath === '/api/cinematic-lite/jobs' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const modelFilename = String(body.modelFilename || '').trim();
        const simplePrompt = String(body.simplePrompt || '').trim();
        const complexPrompt = String(body.complexPrompt || '').trim();
        const captures = sanitizeCaptures(body.captures);
        const modelContext = body.modelContext || {};
        const requestedTts = normalizeTtsSelection(body.tts || {});
        if (!modelFilename) {
            fail(res, 400, 'modelFilename required');
            return true;
        }
        const savedNarration = getNarration(modelFilename);
        const narrationText = String(savedNarration?.narration_text || '').trim();
        if (!narrationText) {
            fail(res, 400, 'saved narrationText required');
            return true;
        }
        if (captures.length < 6) {
            fail(res, 400, 'six captures required');
            return true;
        }

        const geminiConfig = getGeminiConfig();
        if (!geminiConfig.configured) {
            fail(res, 400, 'Gemini API key not configured in database');
            return true;
        }

        const baseTtsConfig = getTtsConfig();
        const ttsConfig = {
            ...baseTtsConfig,
            model: requestedTts.model,
            voice: requestedTts.voice
        };
        const job = store.create('plan_and_tts', { modelFilename, narrationText, simplePrompt, complexPrompt, captureCount: captures.length }, async (ctx) => {
            ctx.update({ stage: 'generating_plan', progress: 0.08 });
            const generation = await createStreamingPlan({
                geminiConfig,
                simplePrompt,
                complexPrompt,
                narrationText,
                captures,
                modelContext,
                isCancelled: ctx.isCancelled,
                onProgress: ({ stage, interactionId, partialText, usage, requestPrompt, requestMaterials, rawResponse }) => {
                    const patch = {
                        stage,
                        progress: stage === 'gemini_complete' ? 0.56 : 0.2,
                        partialText: partialText || '',
                        interactionId,
                        usage: usage || null
                    };
                    if (typeof requestPrompt === 'string') patch.geminiRequestPrompt = requestPrompt;
                    if (requestMaterials) patch.geminiRequestMaterials = requestMaterials;
                    if (typeof rawResponse === 'string') patch.geminiRawResponse = rawResponse;
                    else if (typeof partialText === 'string' && partialText) patch.geminiRawResponse = partialText;
                    ctx.update(patch);
                }
            });

            let plan = generation.plan;
            let ttsWarning = null;
            if (ttsConfig.configured) {
                ctx.update({ stage: 'generating_tts', progress: 0.62 });
                try {
                    plan = await synthesizeSegments({
                        ttsConfig,
                        plan,
                        isCancelled: ctx.isCancelled,
                        onProgress: ({ index, total, segmentId }) => {
                            const ratio = total > 0 ? (index + 1) / total : 1;
                            ctx.update({
                                stage: `tts:${segmentId}`,
                                progress: 0.62 + (ratio * 0.34)
                            });
                        }
                    });
                } catch (error) {
                    ttsWarning = error instanceof Error ? error.message : String(error);
                    ctx.update({ stage: 'tts_fallback', progress: 0.96 });
                }
            }

            return {
                title: generation.plan.title,
                summary: generation.plan.summary,
                geminiInteractionId: generation.interactionId,
                geminiRequestPrompt: generation.requestPrompt,
                geminiRequestMaterials: generation.requestMaterials,
                geminiRawResponse: generation.partialText,
                plan,
                csvText: generation.csvText,
                ttsConfigured: ttsConfig.configured,
                ttsWarning,
                tts: {
                    provider: ttsConfig.provider,
                    model: ttsConfig.model,
                    voice: ttsConfig.voice,
                    voiceOptions: requestedTts.voiceOptions
                }
            };
        });

        json(res, 202, { ok: true, jobId: job.jobId, status: job.status });
        return true;
    }

    const jobMatch = rawPath.match(/^\/api\/cinematic-lite\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === 'GET') {
        const job = store.get(decodeURIComponent(jobMatch[1]));
        if (!job) {
            fail(res, 404, 'job not found');
            return true;
        }
        json(res, 200, toJobResponse(job));
        return true;
    }

    const cancelMatch = rawPath.match(/^\/api\/cinematic-lite\/jobs\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
        const job = store.cancel(decodeURIComponent(cancelMatch[1]));
        if (!job) {
            fail(res, 404, 'job not found');
            return true;
        }
        json(res, 200, toJobResponse(job));
        return true;
    }

    return false;
};
