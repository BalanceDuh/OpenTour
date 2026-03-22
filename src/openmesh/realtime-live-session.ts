import { fetchRealtimeLiveAuth } from './cinematic-lite-api';

export type RealtimeLiveState = 'idle' | 'connecting' | 'connected' | 'listening' | 'closed' | 'error';

export type RealtimeContextSnapshot = {
    captures?: unknown[];
    modelContext?: Record<string, unknown>;
    currentSegment?: unknown;
};

export type RealtimeLiveEvent =
    | { type: 'state'; value: RealtimeLiveState; }
    | { type: 'level'; level: number; }
    | { type: 'session_ready'; provider: string; model: string; sessionId?: string; }
    | { type: 'voice_activity'; value: 'start' | 'end'; }
    | { type: 'transcript_partial'; text: string; }
    | { type: 'transcript_final'; text: string; }
    | { type: 'response_partial'; text: string; delta: string; }
    | { type: 'response_final'; text: string; transcript?: string; }
    | { type: 'debug'; detail: unknown; }
    | { type: 'error'; message: string; };

export interface RealtimeLiveSessionOptions {
    provider: string;
    model: string;
}

type Listener = (event: RealtimeLiveEvent) => void;

const TARGET_SAMPLE_RATE = 16000;
const LIVE_API_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const downsampleTo16k = (input: Float32Array, sourceSampleRate: number) => {
    if (sourceSampleRate === TARGET_SAMPLE_RATE) {
        const buffer = new Int16Array(input.length);
        for (let index = 0; index < input.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, input[index] || 0));
            buffer[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        return buffer;
    }
    const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < output.length) {
        const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
        let accum = 0;
        let count = 0;
        for (let index = offsetBuffer; index < nextOffsetBuffer; index += 1) {
            accum += input[index] || 0;
            count += 1;
        }
        const sample = count > 0 ? accum / count : 0;
        const clamped = Math.max(-1, Math.min(1, sample));
        output[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        offsetResult += 1;
        offsetBuffer = nextOffsetBuffer;
    }
    return output;
};

const frameRms = (input: Float32Array) => {
    let sum = 0;
    for (let index = 0; index < input.length; index += 1) sum += (input[index] || 0) ** 2;
    return Math.sqrt(sum / Math.max(1, input.length));
};

const buildSystemInstruction = (context?: RealtimeContextSnapshot) => {
    const currentSegment = context?.currentSegment && typeof context.currentSegment === 'object'
        ? context.currentSegment as { text?: string; focusPart?: string; focusView?: string; }
        : null;
    return [
        '你是一个中文实时导览助手。',
        '用户会通过麦克风直接说话，或者通过输入框发送文字。',
        '请直接给出简洁、自然、口语化的中文回答。',
        '不要输出 JSON，不要输出 Markdown。',
        '优先使用 1 到 2 句完成回答。',
        currentSegment
            ? `当前讲解上下文：${String(currentSegment.text || '').trim()} | 部位=${String(currentSegment.focusPart || '整体')} | 视角=${String(currentSegment.focusView || 'front')}`
            : '当前讲解上下文：无'
    ].join('\n');
};

const extractMessageText = (message: any) => {
    if (typeof message?.text === 'string' && message.text) return message.text;
    const parts = Array.isArray(message?.serverContent?.modelTurn?.parts) ? message.serverContent.modelTurn.parts : [];
    return parts.map((part: any) => String(part?.text || '')).join('');
};

const toBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
};

export class RealtimeLiveSession {
    private readonly listeners = new Set<Listener>();

    private provider: string;

    private model: string;

    private apiKey = '';

    private socket: WebSocket | null = null;

    private mediaStream: MediaStream | null = null;

    private audioContext: AudioContext | null = null;

    private sourceNode: MediaStreamAudioSourceNode | null = null;

    private processorNode: ScriptProcessorNode | null = null;

    private micActive = false;

    private responseText = '';

    private transcriptText = '';

    constructor(options: RealtimeLiveSessionOptions) {
        this.provider = options.provider;
        this.model = options.model;
    }

    onEvent(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    updateOptions(options: Partial<Pick<RealtimeLiveSessionOptions, 'provider' | 'model'>>) {
        if (options.provider) this.provider = options.provider;
        if (options.model) this.model = options.model;
    }

    private normalizedModel() {
        return this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    }

    async connect(context?: RealtimeContextSnapshot) {
        if (this.socket?.readyState === WebSocket.OPEN) return;
        this.emit({ type: 'state', value: 'connecting' });
        const auth = await fetchRealtimeLiveAuth();
        this.apiKey = String(auth.apiKey || '').trim();
        this.model = this.model || String(auth.model || '').trim();
        if (!this.apiKey) throw new Error('Gemini Live API key missing');
        this.responseText = '';
        this.transcriptText = '';
        const wsUrl = `${LIVE_API_WS_BASE}?key=${encodeURIComponent(this.apiKey)}`;
        this.socket = await new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(wsUrl);
            let settled = false;
            let failureMessage = 'Gemini Live 握手失败';
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({
                    setup: {
                        model: this.normalizedModel(),
                        generationConfig: {
                            responseModalities: ['TEXT']
                        },
                        systemInstruction: {
                            role: 'system',
                            parts: [{ text: buildSystemInstruction(context) }]
                        },
                        inputAudioTranscription: {},
                        realtimeInputConfig: {
                            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
                        }
                    }
                }));
            }, { once: true });
            socket.addEventListener('message', (event) => {
                const payload = typeof event.data === 'string' ? event.data : '';
                if (!payload) return;
                let message: any = null;
                try {
                    message = JSON.parse(payload);
                } catch {
                    return;
                }
                this.handleMessage(message);
                if (message?.error && !settled) {
                    settled = true;
                    const detail = typeof message.error === 'string'
                        ? message.error
                        : (message.error?.message || JSON.stringify(message.error));
                    failureMessage = `Gemini Live 握手失败：${detail}`;
                    reject(new Error(failureMessage));
                    try { socket.close(); } catch {}
                    return;
                }
                if (message?.setupComplete && !settled) {
                    settled = true;
                    resolve(socket);
                }
            });
            socket.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                reject(new Error('Gemini Live 连接失败'));
            }, { once: true });
            socket.addEventListener('close', (event) => {
                this.socket = null;
                this.micActive = false;
                this.emit({ type: 'state', value: 'closed' });
                if (!settled) {
                    const suffix = event.code || event.reason ? ` (code=${event.code || 0}${event.reason ? `, reason=${event.reason}` : ''})` : '';
                    reject(new Error(`${failureMessage}${suffix}`));
                }
            });
        });
        this.emit({ type: 'state', value: 'connected' });
    }

    async startMicrophone(context?: RealtimeContextSnapshot) {
        await this.connect(context);
        if (this.micActive) return;
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        this.audioContext = new AudioContext();
        await this.audioContext.resume().catch(() => {});
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processorNode.onaudioprocess = (event) => this.handleAudioProcess(event.inputBuffer);
        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);
        this.micActive = true;
        this.emit({ type: 'state', value: 'listening' });
    }

    sendTextTurn(text: string, _context?: RealtimeContextSnapshot) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Live session not connected');
        this.responseText = '';
        this.socket.send(JSON.stringify({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: true
            }
        }));
    }

    updateContext(_context: RealtimeContextSnapshot) {}

    async stopMicrophone() {
        if (this.micActive && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                realtimeInput: {
                    audioStreamEnd: true
                }
            }));
        }
        this.micActive = false;
        this.processorNode?.disconnect();
        this.sourceNode?.disconnect();
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        await this.audioContext?.close().catch(() => {});
        this.processorNode = null;
        this.sourceNode = null;
        this.mediaStream = null;
        this.audioContext = null;
        if (this.socket?.readyState === WebSocket.OPEN) this.emit({ type: 'state', value: 'connected' });
    }

    async close() {
        await this.stopMicrophone();
        this.socket?.close();
        this.socket = null;
        this.emit({ type: 'state', value: 'closed' });
    }

    private emit(event: RealtimeLiveEvent) {
        this.listeners.forEach((listener) => listener(event));
    }

    private handleMessage(message: any) {
        if (message?.setupComplete) {
            this.emit({
                type: 'session_ready',
                provider: this.provider,
                model: this.model,
                sessionId: message.setupComplete.sessionId ? String(message.setupComplete.sessionId) : undefined
            });
        }

        const voiceActivityType = String(message?.voiceActivity?.voiceActivityType || '');
        if (voiceActivityType === 'ACTIVITY_START') this.emit({ type: 'voice_activity', value: 'start' });
        if (voiceActivityType === 'ACTIVITY_END') this.emit({ type: 'voice_activity', value: 'end' });

        const content = message?.serverContent;
        const transcript = String(content?.inputTranscription?.text || '').trim();
        if (transcript) {
            this.transcriptText = transcript;
            this.emit({ type: content?.inputTranscription?.finished ? 'transcript_final' : 'transcript_partial', text: transcript });
        }

        const delta = extractMessageText(message);
        if (delta) {
            this.responseText += delta;
            this.emit({ type: 'response_partial', text: this.responseText, delta });
        }

        if (content?.turnComplete) {
            this.emit({
                type: 'response_final',
                text: this.responseText.trim(),
                transcript: this.transcriptText.trim() || undefined
            });
            this.responseText = '';
            this.transcriptText = '';
        }

        if (message?.usageMetadata) this.emit({ type: 'debug', detail: { usageMetadata: message.usageMetadata } });
    }

    private handleAudioProcess(inputBuffer: AudioBuffer) {
        if (!this.micActive || !this.socket || this.socket.readyState !== WebSocket.OPEN || !this.audioContext) return;
        const channel = inputBuffer.getChannelData(0);
        const rms = frameRms(channel);
        this.emit({ type: 'level', level: Math.max(0, Math.min(1, rms * 8)) });
        const pcm = downsampleTo16k(channel, this.audioContext.sampleRate);
        this.socket.send(JSON.stringify({
            realtimeInput: {
                audio: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: toBase64(new Uint8Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)))
                }
            }
        }));
    }
}

export const createRealtimeLiveSession = (options: RealtimeLiveSessionOptions) => new RealtimeLiveSession(options);
