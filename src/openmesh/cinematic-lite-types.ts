export type ViewId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface MviewCameraState {
    pivot: [number, number, number];
    rotation: [number, number];
    radius: number;
    fov: number;
}

export interface CameraState {
    mview: MviewCameraState;
    cameraX: number;
    cameraY: number;
    cameraZ: number;
    lookAtX: number;
    lookAtY: number;
    lookAtZ: number;
    yawDeg: number;
    pitchDeg: number;
    fovDeg: number;
    radius: number;
}

export interface CaptureItem {
    captureId?: string;
    view: ViewId;
    note: string;
    modelFilename?: string;
    source?: 'auto' | 'manual';
    imageDataUrl: string;
    camera: CameraState;
}

export interface SegmentPlan {
    segmentId: string;
    text: string;
    focusView: ViewId;
    focusPart: string;
    moveBeforeSec: number;
    moveSpeedMps: number;
    speechMode: 'INTERRUPTIBLE' | 'BLOCKING';
    audioUrl?: string | null;
    camera: CameraState & {
        sweepYawDeg: number;
        sweepPitchDeg: number;
    };
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}

export interface RealtimeTurnResult {
    answer: string;
    segment: SegmentPlan;
    debug?: Record<string, unknown>;
}

export interface PlanResult {
    title: string;
    summary: string;
    plan: {
        title: string;
        summary: string;
        segments: SegmentPlan[];
    };
    csvText: string;
    geminiInteractionId?: string | null;
    geminiRequestPrompt?: string;
    geminiRequestMaterials?: Record<string, unknown> | null;
    geminiRawResponse?: string;
    ttsConfigured?: boolean;
    ttsWarning?: string | null;
    tts?: {
        provider: string;
        model: string;
        voice: string;
        voiceOptions?: string[];
    };
}

export interface JobSnapshot {
    jobId: string;
    status: string;
    stage: string;
    progress: number;
    heartbeatAt: string;
    partialText: string;
    geminiRequestPrompt?: string;
    geminiRequestMaterials?: Record<string, unknown> | null;
    geminiRawResponse?: string;
    result?: PlanResult;
    error?: { message: string } | null;
}

export interface CsvRow {
    seq: number;
    segment_id: string;
    focus_view: string;
    focus_part: string;
    action: string;
    audio_mode: string;
    move_before_sec: string;
    pivot_x: string;
    pivot_y: string;
    pivot_z: string;
    rotation_pitch: string;
    rotation_yaw: string;
    radius: string;
    fov: string;
    target_x: string;
    target_y: string;
    target_z: string;
    look_at_x: string;
    look_at_y: string;
    look_at_z: string;
    target_yaw: string;
    target_pitch: string;
    target_fov: string;
    target_radius: string;
    move_speed_mps: string;
    sweep_yaw_deg: string;
    sweep_pitch_deg: string;
    content: string;
}
