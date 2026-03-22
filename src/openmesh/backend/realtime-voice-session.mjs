import { WebSocketServer } from 'ws';

import { createAliyunAudioStream } from './asr-aliyun.mjs';
import { getAsrConfig } from './db-config.mjs';

const VOICE_STREAM_PATH = '/api/cinematic-lite/realtime/voice-stream';
const DEFAULT_ASR_MODEL = 'fun-asr-realtime';

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

const createVoiceConnection = (socket) => {
    const sessions = new Map();
    let activeUtteranceId = null;
    let configuredModel = DEFAULT_ASR_MODEL;

    const stopSession = (utteranceId) => {
        const session = sessions.get(utteranceId);
        if (!session) return;
        session.stream.close();
        sessions.delete(utteranceId);
        if (activeUtteranceId === utteranceId) activeUtteranceId = null;
    };

    const startUtterance = (utteranceId, model) => {
        const asrConfig = getAsrConfig();
        if (!asrConfig?.configured || !asrConfig.apiKey) {
            throw new Error('Aliyun API key not configured in database');
        }
        stopSession(utteranceId);
        const resolvedModel = model || configuredModel || asrConfig.model || DEFAULT_ASR_MODEL;
        const stream = createAliyunAudioStream({
            apiKey: asrConfig.apiKey,
            endpoint: asrConfig.endpoint,
            model: resolvedModel,
            onPartial: (text) => sendJson(socket, { type: 'asr_partial', utteranceId, text }),
            onFinal: (text) => {
                sendJson(socket, { type: 'asr_final', utteranceId, text });
                sessions.delete(utteranceId);
            },
            onDebug: (detail) => sendJson(socket, { type: 'debug', utteranceId, detail }),
            onError: (error) => sendJson(socket, { type: 'error', utteranceId, message: error instanceof Error ? error.message : String(error) })
        });
        sessions.set(utteranceId, { stream });
        activeUtteranceId = utteranceId;
        void stream.ready().then(() => {
            sendJson(socket, { type: 'utterance_ready', utteranceId });
        }).catch((error) => {
            sendJson(socket, { type: 'error', utteranceId, message: error instanceof Error ? error.message : String(error) });
            stopSession(utteranceId);
        });
    };

    socket.on('message', (payload, isBinary) => {
        if (isBinary) {
            if (!activeUtteranceId) return;
            const session = sessions.get(activeUtteranceId);
            if (!session) return;
            session.stream.appendAudio(payload);
            return;
        }

        const message = parseJson(payload);
        if (!message || typeof message !== 'object') return;
        const type = String(message.type || '');

        try {
            if (type === 'session_start') {
                configuredModel = String(message.model || getAsrConfig().model || DEFAULT_ASR_MODEL).trim() || DEFAULT_ASR_MODEL;
                sendJson(socket, { type: 'session_ready', provider: 'aliyun', model: configuredModel });
                return;
            }
            if (type === 'utterance_start') {
                const utteranceId = String(message.utteranceId || '').trim();
                if (!utteranceId) return;
                startUtterance(utteranceId, String(message.model || configuredModel || DEFAULT_ASR_MODEL).trim() || DEFAULT_ASR_MODEL);
                sendJson(socket, { type: 'speech_start_ack', utteranceId });
                return;
            }
            if (type === 'utterance_end') {
                const utteranceId = String(message.utteranceId || activeUtteranceId || '').trim();
                const session = utteranceId ? sessions.get(utteranceId) : null;
                if (!session) return;
                if (activeUtteranceId === utteranceId) activeUtteranceId = null;
                session.stream.finish();
                sendJson(socket, { type: 'speech_end_ack', utteranceId });
                return;
            }
            if (type === 'session_stop') {
                sessions.forEach((_value, utteranceId) => stopSession(utteranceId));
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

    socket.on('close', () => {
        sessions.forEach((_value, utteranceId) => stopSession(utteranceId));
    });
};

export const attachRealtimeVoiceSessionServer = (server) => {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket) => createVoiceConnection(socket));

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== VOICE_STREAM_PATH) return;
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    return wss;
};
