import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

export const DASHSCOPE_TTS_WS_URL = process.env.DASHSCOPE_TTS_WS_URL || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
export const DEFAULT_TTS_FORMAT = 'mp3';
export const TTS_CONNECT_TIMEOUT_MS = 30000;
export const TTS_MODEL_FALLBACKS = {
    'cosyvoice-v3-plus': ['cosyvoice-v3-flash']
};

const wsDataToBuffer = async (data) => {
    if (!data) return null;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (typeof Blob !== 'undefined' && data instanceof Blob) return Buffer.from(await data.arrayBuffer());
    if (typeof data === 'string') return null;
    return null;
};

const resolveFormat = (format) => String(format || DEFAULT_TTS_FORMAT).trim().toLowerCase() === 'wav' ? 'wav' : 'mp3';

export const synthesizeDashscopeSpeech = async ({ apiKey, model, voice, format, text }) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        return { audioUrl: null, debug: { status: 'skipped', reason: 'empty-text' } };
    }
    return new Promise((resolve, reject) => {
        const taskId = randomUUID();
        const chunks = [];
        let settled = false;
        let continued = false;
        const timeoutId = setTimeout(() => fail(new Error('Alibaba TTS timeout')), TTS_CONNECT_TIMEOUT_MS);

        const cleanup = () => {
            clearTimeout(timeoutId);
            try {
                ws.close();
            } catch {
                // ignore close failure
            }
        };

        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
        };

        const succeed = () => {
            if (settled) return;
            settled = true;
            cleanup();
            const audioBuffer = Buffer.concat(chunks);
            if (audioBuffer.length < 1) {
                reject(new Error('Alibaba TTS returned empty audio'));
                return;
            }
            const resolvedFormat = resolveFormat(format);
            const mimeType = resolvedFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
            resolve({
                audioUrl: `data:${mimeType};base64,${audioBuffer.toString('base64')}`,
                debug: {
                    status: 'ok',
                    provider: 'aliyun',
                    endpoint: DASHSCOPE_TTS_WS_URL,
                    model,
                    voice,
                    format: resolvedFormat,
                    taskId,
                    bytes: audioBuffer.length,
                    textLength: trimmed.length
                }
            });
        };

        const ws = new WebSocket(DASHSCOPE_TTS_WS_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
            handshakeTimeout: TTS_CONNECT_TIMEOUT_MS
        });
        ws.binaryType = 'arraybuffer';

        ws.on('open', () => {
            ws.send(JSON.stringify({
                header: {
                    action: 'run-task',
                    task_id: taskId,
                    streaming: 'duplex'
                },
                payload: {
                    task_group: 'audio',
                    task: 'tts',
                    function: 'SpeechSynthesizer',
                    model,
                    parameters: {
                        text_type: 'PlainText',
                        voice,
                        format: resolveFormat(format)
                    },
                    input: {}
                }
            }));
        });

        ws.on('message', (data, isBinary) => {
            void (async () => {
                const maybeBuffer = isBinary ? await wsDataToBuffer(data) : null;
                if (maybeBuffer) {
                    chunks.push(maybeBuffer);
                    return;
                }

                const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
                if (!raw) return;

                let payload = null;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    return;
                }

                const eventName = String(
                    payload?.header?.event
                    || payload?.header?.name
                    || payload?.header?.status
                    || payload?.event
                    || payload?.type
                    || ''
                ).toLowerCase();
                const errorMessage = payload?.header?.error_message || payload?.payload?.error?.message || payload?.message || '';

                if (eventName.includes('failed') || errorMessage) {
                    fail(new Error(String(errorMessage || 'Alibaba TTS failed')));
                    return;
                }

                if (!continued && eventName.includes('started')) {
                    continued = true;
                    ws.send(JSON.stringify({
                        header: {
                            action: 'continue-task',
                            task_id: taskId,
                            streaming: 'duplex'
                        },
                        payload: {
                            input: {
                                text: trimmed
                            }
                        }
                    }));
                    ws.send(JSON.stringify({
                        header: {
                            action: 'finish-task',
                            task_id: taskId,
                            streaming: 'duplex'
                        },
                        payload: {
                            input: {}
                        }
                    }));
                    return;
                }

                if (eventName.includes('finished')) succeed();
            })().catch(fail);
        });

        ws.on('error', (error) => {
            fail(new Error(`Alibaba TTS websocket error: ${String(error?.message || 'unknown')}`));
        });

        ws.on('close', (code) => {
            if (settled) return;
            if (chunks.length > 0) {
                succeed();
                return;
            }
            fail(new Error(`Alibaba TTS websocket closed (${code})`));
        });
    });
};

export const synthesizeDashscopeSpeechWithFallback = async ({ apiKey, model, voice, format, text, modelFallbacks = TTS_MODEL_FALLBACKS }) => {
    const candidates = [model, ...((modelFallbacks && modelFallbacks[model]) || [])].filter(Boolean);
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
        const candidateModel = candidates[index];
        try {
            const result = await synthesizeDashscopeSpeech({
                apiKey,
                model: candidateModel,
                voice,
                format,
                text
            });
            return {
                audioUrl: result.audioUrl,
                debug: {
                    ...result.debug,
                    requestedModel: model,
                    effectiveModel: candidateModel,
                    fallbackUsed: candidateModel !== model,
                    fallbackCandidates: candidates.slice(1)
                }
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const message = String(lastError.message || '');
            const canFallback = index < candidates.length - 1 && /418|InvalidParameter/i.test(message);
            if (!canFallback) throw lastError;
        }
    }
    throw lastError || new Error('Alibaba TTS failed');
};

export const synthesizeSegments = async ({ ttsConfig, plan, onProgress, isCancelled }) => {
    const segments = Array.isArray(plan?.segments) ? plan.segments : [];
    if (!ttsConfig?.apiKey) return plan;
    for (let index = 0; index < segments.length; index += 1) {
        if (isCancelled?.()) throw new Error('cancelled');
        const segment = segments[index];
        onProgress?.({ stage: 'tts', segmentId: segment.segmentId, index, total: segments.length });
        const response = await synthesizeDashscopeSpeechWithFallback({
            apiKey: ttsConfig.apiKey,
            model: ttsConfig.model,
            voice: ttsConfig.voice,
            format: ttsConfig.format || DEFAULT_TTS_FORMAT,
            text: segment.text
        });
        segment.audioUrl = String(response?.audioUrl || '');
        segment.tts = {
            provider: 'aliyun',
            model: String(response?.debug?.effectiveModel || ttsConfig.model || ''),
            voice: String(ttsConfig.voice || ''),
            format: String(ttsConfig.format || DEFAULT_TTS_FORMAT),
            bytes: String(segment.audioUrl || '').length
        };
    }
    return plan;
};
