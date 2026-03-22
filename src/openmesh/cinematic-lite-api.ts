import type { CaptureItem, ChatMessage, JobSnapshot, RealtimeTurnResult, SegmentPlan } from './cinematic-lite-types';

const parseJson = async (response: Response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
        throw new Error(String(data?.error?.message || `HTTP ${response.status}`));
    }
    return data;
};

export const fetchConfig = async () => {
    const response = await fetch('/api/cinematic-lite/config', { cache: 'no-store' });
    return parseJson(response);
};

export const fetchRealtimeLiveAuth = async () => {
    const response = await fetch('/api/cinematic-lite/realtime/live-auth', { cache: 'no-store' });
    return parseJson(response) as Promise<{ provider: string; apiKey: string; model: string; }>;
};

export const transcribeRealtimeAudio = async (audioBlob: Blob, model?: string) => {
    const response = await fetch('/api/cinematic-lite/realtime/transcribe', {
        method: 'POST',
        headers: {
            'Content-Type': audioBlob.type || 'audio/webm',
            'X-File-Name': 'realtime.webm',
            ...(model ? { 'X-ASR-Model': model } : {})
        },
        body: audioBlob
    });
    return parseJson(response);
};

export const createRealtimeTurn = async (payload: {
    question: string;
    provider: 'gemini' | 'qwen';
    model: string;
    history: ChatMessage[];
    captures: CaptureItem[];
    modelContext: Record<string, unknown>;
    currentSegment: SegmentPlan | null;
}, signal?: AbortSignal): Promise<RealtimeTurnResult> => {
    const response = await fetch('/api/cinematic-lite/realtime/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
    return parseJson(response) as Promise<RealtimeTurnResult>;
};

export const createRealtimeSegment = async (payload: {
    question: string;
    answer: string;
    captures: CaptureItem[];
    modelContext: Record<string, unknown>;
    currentSegment: SegmentPlan | null;
}, signal?: AbortSignal): Promise<RealtimeTurnResult> => {
    const response = await fetch('/api/cinematic-lite/realtime/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });
    return parseJson(response) as Promise<RealtimeTurnResult>;
};

export const synthesizeRealtimeSpeech = async (payload: {
    text: string;
    tts: {
        model: string;
        voice: string;
    };
}) => {
    const response = await fetch('/api/cinematic-lite/realtime/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response) as Promise<{ audioUrl: string | null; tts: { model: string; voice: string; format: string; }; }>;
};

export const expandPrompt = async (payload: { simplePrompt: string; narrationText: string; }) => {
    const response = await fetch('/api/cinematic-lite/prompts/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const createJob = async (payload: {
    modelFilename: string;
    simplePrompt: string;
    complexPrompt: string;
    captures: CaptureItem[];
    tts: { model: string; voice: string; };
    modelContext: Record<string, unknown>;
}) => {
    const response = await fetch('/api/cinematic-lite/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const getNarration = async (modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/narration?modelFilename=${encodeURIComponent(modelFilename)}`, { cache: 'no-store' });
    return parseJson(response);
};

export const saveNarration = async (payload: { modelFilename: string; narrationText: string; }) => {
    const response = await fetch('/api/cinematic-lite/narration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const saveCaptures = async (payload: { modelFilename: string; captures: CaptureItem[]; }) => {
    const response = await fetch('/api/cinematic-lite/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const listCaptures = async (modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/captures?modelFilename=${encodeURIComponent(modelFilename)}`, { cache: 'no-store' });
    return parseJson(response);
};

export const listCsvVersions = async (modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/csv/versions?modelFilename=${encodeURIComponent(modelFilename)}`, { cache: 'no-store' });
    return parseJson(response);
};

export const clearModelData = async (modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/reset?modelFilename=${encodeURIComponent(modelFilename)}`, {
        method: 'DELETE',
        cache: 'no-store'
    });
    return parseJson(response);
};

export const createCsvVersion = async (payload: { modelFilename: string; versionName: string; csvText: string; }) => {
    const response = await fetch('/api/cinematic-lite/csv/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const updateCsvVersion = async (id: string, payload: { modelFilename: string; versionName: string; csvText: string; }) => {
    const response = await fetch(`/api/cinematic-lite/csv/versions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJson(response);
};

export const deleteCsvVersion = async (id: string, modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/csv/versions/${encodeURIComponent(id)}?modelFilename=${encodeURIComponent(modelFilename)}`, {
        method: 'DELETE'
    });
    return parseJson(response);
};

export const getCsvVersion = async (id: string, modelFilename: string) => {
    const response = await fetch(`/api/cinematic-lite/csv/versions/${encodeURIComponent(id)}?modelFilename=${encodeURIComponent(modelFilename)}`, { cache: 'no-store' });
    return parseJson(response);
};

export const fetchJob = async (jobId: string): Promise<JobSnapshot> => {
    const response = await fetch(`/api/cinematic-lite/jobs/${encodeURIComponent(jobId)}`);
    const data = await parseJson(response);
    return data.job as JobSnapshot;
};

export const cancelJob = async (jobId: string) => {
    const response = await fetch(`/api/cinematic-lite/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    return parseJson(response);
};
