import {
    type EmbeddedMediaSpec,
    type HotspotController,
    type HotspotRecord,
    type HotspotWorldPoint,
    type ProjectedScreenPoint
} from '../OT_Shared/hotspot';

export type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

export type WorldPoint = { x: number; y: number; z: number; opacity?: number };

export type TourPoi = {
    poiId: string;
    poiName: string;
    sortOrder: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    targetYaw: number;
    targetPitch: number;
    targetFov: number;
    moveSpeedMps: number;
    dwellMs: number;
    content: string;
    ttsLang: string;
    promptTemplate?: string;
    screenshotDataUrl?: string;
    screenshotUpdatedAt?: string;
    contentUpdatedAt?: string;
    promptUpdatedAt?: string;
    hotspots?: HotspotRecord[];
};

export type LlmProvider = 'gemini' | 'qwen';

export type ProviderConfig = {
    modelName: string;
    apiKey: string;
};

export type LlmConfigState = {
    selectedProvider: LlmProvider;
    gemini: ProviderConfig;
    qwen: ProviderConfig;
    updatedAt: string | null;
    promptUpdatedAt: string | null;
};

export type PromptEditorContext =
    | { scope: 'global' }
    | { scope: 'poi'; poiId: string };

export type CinematicWorkspaceOptions = {
    launcherButton?: HTMLButtonElement;
    getModelFilename: () => string | null;
    getWorldSamplePoints?: () => WorldPoint[];
    getLiveCameraPose?: () => { pose: CameraPose; fovDeg: number } | null;
    setLiveCameraPose?: (pose: CameraPose, fovDeg: number) => Promise<void> | void;
    getCaptureCanvas?: () => HTMLCanvasElement | null;
    requestCaptureRender?: () => void;
    captureScreenshotPng?: () => Promise<string>;
    pickWorldPointAtScreen?: (x: number, y: number) => Promise<HotspotWorldPoint | null>;
    projectWorldToScreen?: (point: HotspotWorldPoint) => ProjectedScreenPoint | null;
    showEmbeddedMedia?: (spec: EmbeddedMediaSpec | null) => void;
    resolveAssetUrl?: (value: string) => string;
    apiBaseUrl?: string;
    onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
};

export type CinematicWorkspaceController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
    openCinematicWorkspace: () => Promise<void>;
    closeCinematicWorkspace: () => void;
};

export type JobState = {
    jobId: string | null;
    paused: boolean;
    streaming: boolean;
};

export type MapBounds = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

export type CsvVersionSummary = {
    id: number;
    modelFilename: string;
    versionNo: number;
    status: string;
    source: string;
    llmModel: string | null;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
    csvChars: number;
};

export type CsvVersionDetail = CsvVersionSummary & {
    csvText: string;
    csvPromptTemplate: string | null;
    movePromptTemplate: string | null;
};

export type TtsVoiceOption = {
    value: string;
    label: string;
    subtitle: string;
    group: string;
};

export type CsvVoiceConfigState = {
    enabled: boolean;
    mode: 'fixed' | 'shuffle_round_robin';
    model: string;
    fixedVoice: string;
    voicePool: string[];
};

export type CsvTimingConfigState = {
    enabled: boolean;
    targetDurationSec: number;
};

export type CsvTimingSummary = {
    enabled: boolean;
    targetDurationSec: number;
    minimumAchievableSec: number | null;
    estimatedDurationSec: number | null;
};

export type CinematicKeyframe = {
    keyframeId: string;
    shotId: string;
    t: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    fov: number;
    moveSpeedMps: number;
    mediaObject?: CinematicMediaObjectConfig | null;
    cameraBehavior?: CinematicCameraBehavior | null;
};

export type CinematicCameraBehavior = {
    type: 'orbit' | 'approach' | 'reveal' | 'follow';
    target: 'mediaObject';
    radius?: number;
    angleDeg?: number;
    heightOffset?: number;
};

export type CinematicMediaObjectConfig = {
    enabled: boolean;
    src: string;
    fileName: string;
    anchorWorld: HotspotWorldPoint | null;
    scale: number;
    yaw: number;
    pitch: number;
    roll: number;
    depthOffset: number;
    placeholder?: boolean;
    placeholderLabel?: string;
};

export type CinematicShot = {
    shotId: string;
    label: string;
    intent: string;
    durationSec: number;
    speechText: string;
    speechMode: 'INTERRUPTIBLE' | 'BLOCKING';
    speechMatchEnabled?: boolean;
    speechAudioUrl?: string | null;
    speechMetrics?: {
        durationSec: number;
        charsPerSecond: number;
        measuredChars: number;
        updatedAt: string;
        ttsModel?: string;
        ttsVoice?: string;
    } | null;
    keyframes: CinematicKeyframe[];
};

export type CinematicBgmConfig = {
    audioPath: string;
    audioStartSeconds: number;
    audioEndSeconds: number;
    audioPlaybackRate: number;
    targetMusicDurationSeconds: number | null;
    audioDisplayName?: string;
    sourceKey?: string;
    sourceType?: 'directory' | 'file' | 'legacy';
    audioRelativePath?: string;
    directoryName?: string;
};

export type CinematicPlan = {
    version: string;
    modelFilename: string;
    selectedPoiIds: string[];
    sceneDescription: string;
    storyBackground: string;
    styleText: string;
    targetDurationSec: number;
    bgm: CinematicBgmConfig | null;
    bounds: {
        top: { xMin: number; xMax: number; zMin: number; zMax: number };
        front: { xMin: number; xMax: number; yMin: number; yMax: number };
    };
    shots: CinematicShot[];
};

export type CinematicBgmLibraryItem = {
    id: string;
    name: string;
    audioPath: string;
    audioUrl: string;
    source: 'folder' | 'path';
    sourceKey?: string;
    sourceType?: 'directory' | 'file' | 'legacy';
    audioRelativePath?: string;
    directoryName?: string;
};

export type CinematicVersionSummary = {
    id: number;
    modelFilename: string;
    versionNo: number;
    status: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
    planChars: number;
};

export type CinematicVersionDetail = CinematicVersionSummary & {
    simplePrompt: string;
    plannerPrompt: string;
    sceneDescription: string;
    storyBackground: string;
    styleText: string;
    targetDurationSec: number | null;
    selectedPoiIds: string[];
    plan: CinematicPlan | null;
    csvText: string;
};

export type Mp4CompressionPreset = 'original' | 'fast_export' | 'balanced' | 'archive_smallest' | 'target_10mb';

export type CinematicRecordingSettings = {
    frameRate: number;
    videoBitsPerSecond: number;
    audioBitsPerSecond: number;
    mp4CompressionPreset: Mp4CompressionPreset;
    includeTts: boolean;
    autoPlay: boolean;
    stopWithPlayback: boolean;
    hidePanelDuringRecording: boolean;
    disableInterrupts: boolean;
    masterVolume: number;
    ttsVolume: number;
    bgmVolume: number;
    subtitlesEnabled: boolean;
    subtitleFont: string;
    subtitleFontSize: number;
    subtitleColor: string;
};

export type CinematicRecordingRuntime = {
    settings: CinematicRecordingSettings;
    recorder: MediaRecorder;
    stream: MediaStream;
    displayStream: MediaStream | null;
    chunks: BlobPart[];
    startedAt: number;
    mimeType: string;
    extension: string;
    bytesWritten: number;
    lastProgressLogAt: number;
    paused: boolean;
    pausedAt: number | null;
    pausedDurationMs: number;
};

export type CinematicRecordingAudioMixRuntime = {
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    masterGain: GainNode;
    bgmGain: GainNode;
    duckGain: GainNode;
    speechGain: GainNode;
    compressor: DynamicsCompressorNode;
    sources: WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>;
};

export type CinematicStoredRecordingEntry = {
    id: string;
    name: string;
    status: 'processing' | 'ready' | 'mp4_failed';
    transcodeJobId?: string;
    transcodePercent?: number;
    transcodeEtaSec?: number | null;
    transcodeHeartbeatAt?: number | null;
    transcodePhase?: string;
    mimeType: string;
    extension: string;
    size: number;
    durationSec: number;
    width: number;
    height: number;
    createdAt: number;
    thumbnailDataUrl: string;
    note?: string;
    blob: Blob;
};
