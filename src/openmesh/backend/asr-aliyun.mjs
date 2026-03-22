import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import WebSocket from 'ws';

const DASHSCOPE_ASR_WS_URL = process.env.DASHSCOPE_ASR_WS_URL
    || (String(process.env.CINEMATIC_LITE_ASR_REGION || '').trim().toLowerCase() === 'intl'
        ? 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference'
        : 'wss://dashscope.aliyuncs.com/api-ws/v1/inference');
const ASR_CONNECT_TIMEOUT_MS = 40000;
const ASR_MODEL = process.env.CINEMATIC_LITE_ASR_MODEL || 'fun-asr-realtime';

const ASR_MODEL_PROFILES = {
    'fun-asr-realtime': {
        format: 'pcm',
        sampleRate: 16000,
        transcriptionEnabled: true,
        translationEnabled: false,
        semanticPunctuationEnabled: true,
        mode: 'continuous',
        family: 'fun-asr',
        fallbackModel: 'fun-asr-realtime'
    },
    'fun-asr-realtime-2026-02-28': {
        format: 'pcm',
        sampleRate: 16000,
        transcriptionEnabled: true,
        translationEnabled: false,
        semanticPunctuationEnabled: true,
        mode: 'continuous',
        family: 'fun-asr',
        fallbackModel: 'fun-asr-realtime-2026-02-28'
    },
    'paraformer-realtime-v2': {
        format: 'pcm',
        sampleRate: 16000,
        transcriptionEnabled: true,
        translationEnabled: false,
        semanticPunctuationEnabled: true,
        mode: 'continuous',
        family: 'paraformer',
        fallbackModel: 'paraformer-realtime-v2'
    },
    'gummy-realtime-v1': {
        format: 'pcm',
        sampleRate: 16000,
        transcriptionEnabled: true,
        translationEnabled: false,
        sourceLanguage: 'auto',
        mode: 'continuous',
        family: 'gummy',
        fallbackModel: 'gummy-realtime-v1'
    },
    'gummy-chat-v1': {
        format: 'pcm',
        sampleRate: 16000,
        transcriptionEnabled: true,
        translationEnabled: false,
        sourceLanguage: 'auto',
        mode: 'chat',
        family: 'gummy',
        fallbackModel: 'fun-asr-realtime'
    },
    'fun-asr-flash-8k-realtime': {
        format: 'pcm',
        sampleRate: 8000,
        transcriptionEnabled: true,
        translationEnabled: false,
        semanticPunctuationEnabled: true,
        mode: 'continuous',
        family: 'fun-asr',
        fallbackModel: 'fun-asr-flash-8k-realtime'
    }
};

const resolveAsrModelProfile = (model) => {
    const name = String(model || ASR_MODEL).trim() || ASR_MODEL;
    const base = ASR_MODEL_PROFILES[name] ? name : ASR_MODEL;
    return {
        model: base,
        ...((ASR_MODEL_PROFILES[base]) || ASR_MODEL_PROFILES[ASR_MODEL])
    };
};

const buildRecognitionParameters = (profile, formatOverride) => {
    const parameters = {
        format: formatOverride || profile.format,
        sample_rate: profile.sampleRate,
        transcription_enabled: profile.transcriptionEnabled,
        translation_enabled: profile.translationEnabled
    };
    if (profile.sourceLanguage) parameters.source_language = profile.sourceLanguage;
    if (typeof profile.semanticPunctuationEnabled === 'boolean') {
        parameters.semantic_punctuation_enabled = profile.semanticPunctuationEnabled;
    }
    return parameters;
};

const ffmpegPath = () => process.env.FFMPEG_PATH || ffmpegInstaller.path || 'ffmpeg';

const transcodeToWavMono = async (inputBuffer, inputExt, sampleRate = 16000) => {
    const dir = await mkdtemp(join(tmpdir(), 'cinelite-asr-'));
    const sourcePath = join(dir, `input${inputExt || '.webm'}`);
    const outputPath = join(dir, 'output.wav');
    try {
        await writeFile(sourcePath, inputBuffer);
        await new Promise((resolve, reject) => {
            const child = spawn(ffmpegPath(), [
                '-y',
                '-i', sourcePath,
                '-ac', '1',
                '-ar', String(sampleRate),
                '-f', 'wav',
                outputPath
            ], { stdio: 'ignore' });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited with code ${code}`));
            });
        });
        return await readFile(outputPath);
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
};

const chunkBuffer = (buffer, size) => {
    const chunks = [];
    for (let offset = 0; offset < buffer.length; offset += size) {
        chunks.push(buffer.subarray(offset, Math.min(buffer.length, offset + size)));
    }
    return chunks;
};

const normalizeAudioExt = (mimeType, fileName) => {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg')) return '.ogg';
    if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
    if (mime.includes('mp4') || mime.includes('aac')) return '.m4a';
    if (mime.includes('wav')) return '.wav';
    const match = String(fileName || '').match(/\.[a-z0-9]+$/i);
    return match ? match[0].toLowerCase() : '.webm';
};

const pcm16ToWav = (pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) => {
    const blockAlign = channels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([header, pcmBuffer]);
};

const resolveAsrText = (frame) => {
    const sentence = frame?.payload?.output?.sentence
        || frame?.payload?.output?.transcription_result
        || frame?.payload?.output?.transcriptionResult
        || null;
    return String(sentence?.text || frame?.payload?.output?.text || '').trim();
};

export const createAliyunAudioStream = ({ apiKey, endpoint = DASHSCOPE_ASR_WS_URL, model = ASR_MODEL, onPartial, onFinal, onDebug, onError }) => {
    if (!apiKey) throw new Error('Aliyun ASR key missing');
    const profile = resolveAsrModelProfile(model);
    const taskId = randomUUID();
    const pendingChunks = [];
    let ws = null;
    let started = false;
    let finished = false;
    let closed = false;
    let sentBytes = 0;
    let lastText = '';
    const rawChunks = [];

    const openPromise = new Promise((resolve, reject) => {
        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error instanceof Error ? error : new Error(String(error)));
        };
        const succeed = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        ws = new WebSocket(endpoint, {
            headers: { Authorization: `Bearer ${apiKey}` },
            handshakeTimeout: ASR_CONNECT_TIMEOUT_MS
        });

        ws.on('open', () => {
            ws.send(JSON.stringify({
                header: {
                    action: 'run-task',
                    task_id: taskId,
                    streaming: 'duplex'
                },
                payload: {
                    task_group: 'audio',
                    task: 'asr',
                    function: 'recognition',
                    model: profile.model,
                    parameters: buildRecognitionParameters(profile, 'pcm'),
                    input: {}
                }
            }));
        });

        ws.on('message', (data, isBinary) => {
            void (async () => {
                if (isBinary) return;
                let frame = null;
                try {
                    frame = JSON.parse(Buffer.from(data).toString('utf8'));
                } catch {
                    return;
                }
                const event = String(frame?.header?.event || '').toLowerCase();
                const text = resolveAsrText(frame);
                if (text && text !== lastText) {
                    lastText = text;
                    onPartial?.(text, frame);
                }
                if (event === 'task-started') {
                    started = true;
                    while (pendingChunks.length > 0) {
                        const chunk = pendingChunks.shift();
                        if (chunk) ws.send(chunk, { binary: true });
                    }
                    onDebug?.({ type: 'task-started', taskId, model: profile.model, endpoint, profile });
                    succeed();
                    return;
                }
                if (event === 'task-finished') {
                    finished = true;
                    let finalText = lastText.trim();
                    let fallbackUsed = false;
                    if (!finalText && rawChunks.length > 0) {
                        fallbackUsed = true;
                        const fallback = await transcribeAliyunAudio({
                            apiKey,
                            endpoint,
                            model: profile.fallbackModel || profile.model,
                            audioBuffer: pcm16ToWav(Buffer.concat(rawChunks), profile.sampleRate),
                            mimeType: 'audio/wav',
                            fileName: 'stream.wav'
                        }).catch((error) => {
                            onDebug?.({ type: 'fallback-failed', taskId, model: profile.model, fallbackModel: profile.fallbackModel || profile.model, message: error instanceof Error ? error.message : String(error) });
                            return null;
                        });
                        finalText = String(fallback?.text || '').trim();
                    }
                    onFinal?.(finalText, frame);
                    onDebug?.({ type: 'task-finished', taskId, model: profile.model, bytes: sentBytes, text: finalText, fallbackUsed, sampleRate: profile.sampleRate, endpoint });
                    try {
                        ws.close();
                    } catch {
                        // ignore close failure
                    }
                    return;
                }
                if (event === 'task-failed') {
                    const error = new Error(String(frame?.payload?.error?.message || 'Aliyun ASR task failed'));
                    onError?.(error);
                    fail(error);
                }
            })().catch((error) => {
                const wrapped = error instanceof Error ? error : new Error(String(error));
                onError?.(wrapped);
                fail(wrapped);
            });
        });

        ws.on('error', (error) => {
            const wrapped = error instanceof Error ? error : new Error(String(error));
            onError?.(wrapped);
            fail(wrapped);
        });

        ws.on('close', (code) => {
            if (closed || finished || code === 1000) return;
            const error = new Error(`Aliyun ASR websocket closed (${code})`);
            onError?.(error);
            fail(error);
        });
    });

    return {
        ready: () => openPromise,
        appendAudio(chunk) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (buffer.length < 1 || closed || finished) return;
            sentBytes += buffer.length;
            rawChunks.push(buffer);
            if (started && ws?.readyState === WebSocket.OPEN) {
                ws.send(buffer, { binary: true });
                return;
            }
            pendingChunks.push(buffer);
        },
        finish() {
            if (closed || finished) return;
            const sendFinish = () => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                ws.send(JSON.stringify({
                    header: {
                        action: 'finish-task',
                        task_id: taskId,
                        streaming: 'duplex'
                    },
                    payload: { input: {} }
                }));
            };
            if (started) {
                sendFinish();
                return;
            }
            void openPromise.then(sendFinish).catch(() => {});
        },
        close() {
            if (closed) return;
            closed = true;
            finished = true;
            try {
                ws?.close();
            } catch {
                // ignore close failure
            }
        }
    };
};

export const transcribeAliyunAudio = async ({ apiKey, endpoint = DASHSCOPE_ASR_WS_URL, model = ASR_MODEL, audioBuffer, mimeType, fileName }) => {
    if (!apiKey) throw new Error('Aliyun ASR key missing');
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 1) throw new Error('audioBuffer required');
    const profile = resolveAsrModelProfile(model);
    const wavBuffer = await transcodeToWavMono(audioBuffer, normalizeAudioExt(mimeType, fileName), profile.sampleRate);
    return new Promise((resolve, reject) => {
        const taskId = randomUUID();
        const pieces = [];
        let finalText = '';
        let settled = false;
        let sentAudio = false;
        const timeoutId = setTimeout(() => fail(new Error('Aliyun ASR timeout')), ASR_CONNECT_TIMEOUT_MS);

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
            const text = finalText.trim() || pieces.join('').trim();
            resolve({
                text,
                debug: {
                    provider: 'aliyun',
                    endpoint,
                    model: profile.model,
                    profile,
                    requestBytes: audioBuffer.length,
                    wavBytes: wavBuffer.length,
                    textLength: text.length
                }
            });
        };

        const ws = new WebSocket(endpoint, {
            headers: { Authorization: `Bearer ${apiKey}` },
            handshakeTimeout: ASR_CONNECT_TIMEOUT_MS
        });

        ws.on('open', () => {
            ws.send(JSON.stringify({
                header: {
                    action: 'run-task',
                    task_id: taskId,
                    streaming: 'duplex'
                },
                payload: {
                    task_group: 'audio',
                    task: 'asr',
                    function: 'recognition',
                    model: profile.model,
                    parameters: buildRecognitionParameters(profile, 'wav'),
                    input: {}
                }
            }));
        });

        ws.on('message', (data, isBinary) => {
            if (isBinary) return;
            let frame = null;
            try {
                frame = JSON.parse(Buffer.from(data).toString('utf8'));
            } catch {
                return;
            }
            const event = String(frame?.header?.event || '').toLowerCase();
            if (event === 'task-started' && !sentAudio) {
                sentAudio = true;
                for (const chunk of chunkBuffer(wavBuffer, 3200)) {
                    ws.send(chunk, { binary: true });
                }
                ws.send(JSON.stringify({
                    header: {
                        action: 'finish-task',
                        task_id: taskId,
                        streaming: 'duplex'
                    },
                    payload: { input: {} }
                }));
                return;
            }
            const sentence = frame?.payload?.output?.sentence || frame?.payload?.output?.transcription_result || frame?.payload?.output?.transcriptionResult || null;
            const text = String(sentence?.text || frame?.payload?.output?.text || '').trim();
            if (text) {
                pieces.push(text);
                finalText = text;
            }
            if (event === 'task-finished') {
                succeed();
                return;
            }
            if (event === 'task-failed') {
                fail(new Error(String(frame?.payload?.error?.message || 'Aliyun ASR task failed')));
            }
        });

        ws.on('error', fail);
        ws.on('close', (code) => {
            if (!settled && code !== 1000) fail(new Error(`Aliyun ASR websocket closed (${code})`));
        });
    });
};
