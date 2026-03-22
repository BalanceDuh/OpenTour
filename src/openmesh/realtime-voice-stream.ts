export type VoiceStreamState = 'idle' | 'connecting' | 'listening' | 'processing' | 'closed' | 'error';

export type VoiceStreamEvent =
    | { type: 'state'; value: VoiceStreamState; }
    | { type: 'level'; level: number; }
    | { type: 'speech_start'; utteranceId: string; }
    | { type: 'speech_end'; utteranceId: string; }
    | { type: 'utterance_blob'; utteranceId: string; blob: Blob; }
    | { type: 'asr_partial'; utteranceId: string; text: string; }
    | { type: 'asr_final'; utteranceId: string; text: string; }
    | { type: 'debug'; detail: unknown; utteranceId?: string; }
    | { type: 'error'; message: string; utteranceId?: string; };

export interface RealtimeVoiceStreamOptions {
    model: string;
    sampleRate?: number;
    wsUrl?: string;
    silenceMs?: number;
    minSpeechMs?: number;
    voiceThreshold?: number;
    preRollMs?: number;
}

type Listener = (event: VoiceStreamEvent) => void;

const DEFAULT_SILENCE_MS = 820;
const DEFAULT_MIN_SPEECH_MS = 260;
const DEFAULT_VOICE_THRESHOLD = 0.02;
const DEFAULT_PRE_ROLL_MS = 240;
const DEFAULT_TARGET_SAMPLE_RATE = 16000;

const createWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/cinematic-lite/realtime/voice-stream`;
};

const downsampleToPcm = (input: Float32Array, sourceSampleRate: number, targetSampleRate: number) => {
    if (sourceSampleRate === targetSampleRate) {
        const buffer = new Int16Array(input.length);
        for (let index = 0; index < input.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, input[index] || 0));
            buffer[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        return buffer;
    }
    const ratio = sourceSampleRate / targetSampleRate;
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

const pcmToBuffer = (pcm: Int16Array) => pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);

const frameRms = (input: Float32Array) => {
    let sum = 0;
    for (let index = 0; index < input.length; index += 1) sum += (input[index] || 0) ** 2;
    return Math.sqrt(sum / Math.max(1, input.length));
};

export class RealtimeVoiceStream {
    private readonly options: Required<RealtimeVoiceStreamOptions>;

    private readonly listeners = new Set<Listener>();

    private socket: WebSocket | null = null;

    private mediaStream: MediaStream | null = null;

    private audioContext: AudioContext | null = null;

    private sourceNode: MediaStreamAudioSourceNode | null = null;

    private processorNode: ScriptProcessorNode | null = null;

    private started = false;

    private currentState: VoiceStreamState = 'idle';

    private currentUtteranceId = '';

    private currentSpeechMs = 0;

    private trailingSilenceMs = 0;

    private preRollFrames: Int16Array[] = [];

    private preRollSamples = 0;

    private utteranceRecorder: MediaRecorder | null = null;

    private utteranceRecorderChunks: Blob[] = [];

    private utteranceRecorderId = '';

    constructor(options: RealtimeVoiceStreamOptions) {
        this.options = {
            wsUrl: options.wsUrl || createWsUrl(),
            model: options.model,
            sampleRate: options.sampleRate ?? DEFAULT_TARGET_SAMPLE_RATE,
            silenceMs: options.silenceMs ?? DEFAULT_SILENCE_MS,
            minSpeechMs: options.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS,
            voiceThreshold: options.voiceThreshold ?? DEFAULT_VOICE_THRESHOLD,
            preRollMs: options.preRollMs ?? DEFAULT_PRE_ROLL_MS
        };
    }

    onEvent(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async start() {
        if (this.started) return;
        this.started = true;
        this.emit({ type: 'state', value: 'connecting' });
        this.socket = await this.openSocket();
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
        this.emit({ type: 'state', value: 'listening' });
    }

    async stop() {
        if (!this.started) return;
        this.started = false;
        this.finishCurrentUtterance();
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'session_stop' }));
        }
        this.processorNode?.disconnect();
        this.sourceNode?.disconnect();
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        await this.audioContext?.close().catch(() => {});
        this.socket?.close();
        this.processorNode = null;
        this.sourceNode = null;
        this.mediaStream = null;
        this.audioContext = null;
        this.socket = null;
        this.currentUtteranceId = '';
        this.currentSpeechMs = 0;
        this.trailingSilenceMs = 0;
        this.preRollFrames = [];
        this.preRollSamples = 0;
        this.utteranceRecorder = null;
        this.utteranceRecorderChunks = [];
        this.utteranceRecorderId = '';
        this.emit({ type: 'state', value: 'closed' });
    }

    updateModel(model: string, sampleRate?: number) {
        this.options.model = model;
        if (Number.isFinite(sampleRate) && Number(sampleRate) > 0) this.options.sampleRate = Number(sampleRate);
    }

    private emit(event: VoiceStreamEvent) {
        if (event.type === 'state') this.currentState = event.value;
        this.listeners.forEach((listener) => listener(event));
    }

    private async openSocket() {
        return new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(this.options.wsUrl);
            socket.binaryType = 'arraybuffer';
            let settled = false;
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({ type: 'session_start', model: this.options.model }));
            });
            socket.addEventListener('message', (event) => {
                const payload = typeof event.data === 'string' ? event.data : '';
                if (!payload) return;
                let message: any = null;
                try {
                    message = JSON.parse(payload);
                } catch {
                    return;
                }
                if (message.type === 'session_ready') {
                    settled = true;
                    resolve(socket);
                    return;
                }
                if (message.type === 'asr_partial') {
                    this.emit({ type: 'asr_partial', utteranceId: String(message.utteranceId || ''), text: String(message.text || '') });
                    return;
                }
                if (message.type === 'asr_final') {
                    this.emit({ type: 'state', value: 'listening' });
                    this.emit({ type: 'asr_final', utteranceId: String(message.utteranceId || ''), text: String(message.text || '') });
                    return;
                }
                if (message.type === 'debug') {
                    this.emit({ type: 'debug', utteranceId: message.utteranceId ? String(message.utteranceId) : undefined, detail: message.detail });
                    return;
                }
                if (message.type === 'error') {
                    const err = String(message.message || 'voice stream error');
                    this.emit({ type: 'state', value: 'error' });
                    this.emit({ type: 'error', utteranceId: message.utteranceId ? String(message.utteranceId) : undefined, message: err });
                    return;
                }
            });
            socket.addEventListener('close', () => {
                if (!settled) reject(new Error('语音流握手失败'));
                if (this.started) this.emit({ type: 'state', value: 'closed' });
            });
            socket.addEventListener('error', () => {
                settled = true;
                reject(new Error('语音流连接失败'));
            }, { once: true });
        });
    }

    private handleAudioProcess(inputBuffer: AudioBuffer) {
        if (!this.started || !this.socket || this.socket.readyState !== WebSocket.OPEN || !this.audioContext) return;
        const channel = inputBuffer.getChannelData(0);
        const rms = frameRms(channel);
        this.emit({ type: 'level', level: Math.max(0, Math.min(1, rms * 8)) });
        const pcm = downsampleToPcm(channel, this.audioContext.sampleRate, this.options.sampleRate);
        const frameMs = (pcm.length / this.options.sampleRate) * 1000;
        if (!this.currentUtteranceId) {
            this.pushPreRoll(pcm);
            if (rms >= this.options.voiceThreshold) {
                this.beginUtterance();
                this.flushPreRoll();
                this.currentSpeechMs = frameMs;
                this.trailingSilenceMs = 0;
            }
            return;
        }

        this.socket.send(pcmToBuffer(pcm));
        this.currentSpeechMs += frameMs;
        if (rms >= this.options.voiceThreshold) {
            this.trailingSilenceMs = 0;
            return;
        }
        this.trailingSilenceMs += frameMs;
        if (this.trailingSilenceMs >= this.options.silenceMs && this.currentSpeechMs >= this.options.minSpeechMs) {
            this.finishCurrentUtterance();
        }
    }

    private pushPreRoll(frame: Int16Array) {
        this.preRollFrames.push(frame);
        this.preRollSamples += frame.length;
        const maxSamples = Math.round((this.options.preRollMs / 1000) * this.options.sampleRate);
        while (this.preRollSamples > maxSamples && this.preRollFrames.length > 0) {
            const removed = this.preRollFrames.shift();
            if (removed) this.preRollSamples -= removed.length;
        }
    }

    private flushPreRoll() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.preRollFrames.forEach((frame) => this.socket?.send(pcmToBuffer(frame)));
        this.preRollFrames = [];
        this.preRollSamples = 0;
    }

    private beginUtterance() {
        this.currentUtteranceId = `utt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        this.currentSpeechMs = 0;
        this.trailingSilenceMs = 0;
        this.startUtteranceRecorder(this.currentUtteranceId);
        this.socket?.send(JSON.stringify({ type: 'utterance_start', utteranceId: this.currentUtteranceId, model: this.options.model }));
        this.emit({ type: 'speech_start', utteranceId: this.currentUtteranceId });
        this.emit({ type: 'state', value: 'processing' });
    }

    private finishCurrentUtterance() {
        if (!this.currentUtteranceId) return;
        const utteranceId = this.currentUtteranceId;
        this.socket?.send(JSON.stringify({ type: 'utterance_end', utteranceId }));
        this.stopUtteranceRecorder();
        this.emit({ type: 'speech_end', utteranceId });
        this.currentUtteranceId = '';
        this.currentSpeechMs = 0;
        this.trailingSilenceMs = 0;
        this.preRollFrames = [];
        this.preRollSamples = 0;
    }

    private startUtteranceRecorder(utteranceId: string) {
        if (!this.mediaStream || typeof MediaRecorder === 'undefined') return;
        this.stopUtteranceRecorder();
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
        this.utteranceRecorderChunks = [];
        this.utteranceRecorderId = utteranceId;
        try {
            this.utteranceRecorder = mimeType ? new MediaRecorder(this.mediaStream, { mimeType }) : new MediaRecorder(this.mediaStream);
        } catch {
            this.utteranceRecorder = null;
            return;
        }
        this.utteranceRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) this.utteranceRecorderChunks.push(event.data);
        };
        this.utteranceRecorder.onstop = () => {
            const blob = new Blob(this.utteranceRecorderChunks, { type: this.utteranceRecorder?.mimeType || mimeType || 'audio/webm' });
            if (blob.size > 0 && this.utteranceRecorderId) {
                this.emit({ type: 'utterance_blob', utteranceId: this.utteranceRecorderId, blob });
            }
            this.utteranceRecorder = null;
            this.utteranceRecorderChunks = [];
            this.utteranceRecorderId = '';
        };
        this.utteranceRecorder.start();
    }

    private stopUtteranceRecorder() {
        if (!this.utteranceRecorder) return;
        if (this.utteranceRecorder.state !== 'inactive') this.utteranceRecorder.stop();
    }
}

export const createRealtimeVoiceStream = (options: RealtimeVoiceStreamOptions) => new RealtimeVoiceStream(options);
