import { buildStep3RuntimeFromDbCalibration } from '../OT_ModelLoader/algorithms/otml_step3_runtime_from_db_images';

type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type QueueTaskStatus = 'COMPLETED' | 'SKIPPED' | 'FAILED';

type QueueBehavior = 'BLOCKING' | 'INTERRUPTIBLE';

type QueueDispatchTask = {
    task_id: string;
    type: 'MOVE' | 'LOOK' | 'SPEAK' | 'PAUSE' | 'EMPHASIZE' | 'END';
    poi_id: string | null;
    poi_name?: string | null;
    coordinates: { x: number; y: number; z: number };
    look?: { yaw: number | null; pitch: number | null } | null;
    content: { text: string; audio_url: string | null };
    execution_mode: QueueBehavior;
    move_speed_mps?: number | null;
    dwell_ms?: number | null;
    tts_lang?: string | null;
    tts_voice?: string | null;
    interrupt_flag: boolean;
    tts_debug?: Record<string, unknown> | null;
};

type QueueViewTask = {
    id: string;
    action: string;
    behavior: string;
    poiId: string | null;
    poiName?: string | null;
    source: 'SCRIPT' | 'INTERRUPT';
};

type QueueSnapshot = {
    sessionId: string;
    runningTask: { id: string; action: string; behavior: string; poiId: string | null; poiName?: string | null } | null;
    scriptQueue: QueueViewTask[];
    priorityQueue: QueueViewTask[];
    version: number;
};

type TranscriptRole = 'system' | 'user' | 'narrator';
type TranscriptFilter = 'ALL' | 'CHAT' | 'SYSTEM';

type TranscriptLog = {
    role: TranscriptRole;
    message: string;
    timestamp: string;
};

type RoutePoint = {
    taskId: string;
    poiId: string;
    x: number;
    z: number;
    yaw: number;
};

type RecordingButtonVariant = 'A' | 'B';

type RecordingAudioItem = {
    id: string;
    file: File;
    name: string;
    url: string;
    durationSec: number;
};

type Mp4CompressionPreset = 'original' | 'fast_export' | 'balanced' | 'archive_smallest' | 'target_10mb';

type RecordingSettings = {
    frameRate: number;
    videoBitsPerSecond: number;
    audioBitsPerSecond: number;
    mp4CompressionPreset: Mp4CompressionPreset;
    includeTts: boolean;
    includeMusic: boolean;
    autoPlay: boolean;
    stopWithPlayback: boolean;
    musicLoop: boolean;
    hidePanelDuringRecording: boolean;
    disableInterrupts: boolean;
    masterVolume: number;
    ttsVolume: number;
    musicVolume: number;
    subtitlesEnabled: boolean;
    subtitleFont: string;
    subtitleFontSize: number;
    subtitleColor: string;
    selectedVariant: RecordingButtonVariant;
};

type RecordingRuntime = {
    settings: RecordingSettings;
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
};

type StoredRecordingEntry = {
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

type TtsConfig = {
    provider: 'aliyun';
    model: string;
    voice: string;
    apiKey: string;
    format: string;
    updatedAt: string | null;
};

type TtsModelOption = {
    value: string;
    label: string;
    description: string;
};

type TtsVoiceOption = {
    value: string;
    label: string;
    subtitle: string;
    group: string;
};

type TourPlayerPanelOptions = {
    launcherButton?: HTMLButtonElement;
    getModelFilename: () => string | null;
    getCaptureCanvas?: () => HTMLCanvasElement | null;
    requestCaptureRender?: () => void;
    getLiveCameraPose?: () => { pose: CameraPose; fovDeg: number } | null;
    setLiveCameraPose?: (pose: CameraPose, fovDeg: number) => Promise<void> | void;
    apiBaseUrl?: string;
    onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
};

type TourPlayerPanelController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
};

const STYLE_ID = 'ot-tour-player-style';
const PANEL_ID = 'ot-tour-player-panel';
const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
const DEFAULT_TTS_VOICE = 'longyuan_v3';

const TTS_MODEL_OPTIONS: TtsModelOption[] = [
    {
        value: 'cosyvoice-v3-plus',
        label: '高质量语音',
        description: '音质更好，适合正式讲解与旁白'
    },
    {
        value: 'cosyvoice-v3-flash',
        label: '低延迟语音',
        description: '响应更快，适合实时播报'
    }
];

const TTS_VOICE_OPTIONS_BY_MODEL: Record<string, TtsVoiceOption[]> = {
    'cosyvoice-v3-plus': [
        { value: 'longyuan_v3', label: '龙媛', subtitle: '温暖治愈女', group: '旁白 / 有声书' },
        { value: 'longyue_v3', label: '龙悦', subtitle: '温暖磁性女', group: '旁白 / 有声书' },
        { value: 'longsanshu_v3', label: '龙三叔', subtitle: '沉稳质感男', group: '旁白 / 有声书' },
        { value: 'longshuo_v3', label: '龙硕', subtitle: '博才干练男', group: '新闻播报' },
        { value: 'loongbella_v3', label: 'Bella3.0', subtitle: '精准干练女', group: '新闻播报' },
        { value: 'longxiaochun_v3', label: '龙小淳', subtitle: '知性积极女', group: '语音助手' },
        { value: 'longxiaoxia_v3', label: '龙小夏', subtitle: '沉稳权威女', group: '语音助手' },
        { value: 'longanwen_v3', label: '龙安温', subtitle: '优雅知性女', group: '语音助手' },
        { value: 'longanli_v3', label: '龙安莉', subtitle: '利落从容女', group: '语音助手' },
        { value: 'longanlang_v3', label: '龙安朗', subtitle: '清爽利落男', group: '语音助手' },
        { value: 'longyingling_v3', label: '龙应聆', subtitle: '温和共情女', group: '客服' },
        { value: 'longanzhi_v3', label: '龙安智', subtitle: '睿智轻熟男', group: '社交陪伴' }
    ],
    'cosyvoice-v3-flash': [
        { value: 'longyuan_v3', label: '龙媛', subtitle: '温暖治愈女', group: '旁白 / 有声书' },
        { value: 'longyue_v3', label: '龙悦', subtitle: '温暖磁性女', group: '旁白 / 有声书' },
        { value: 'longsanshu_v3', label: '龙三叔', subtitle: '沉稳质感男', group: '旁白 / 有声书' },
        { value: 'longshuo_v3', label: '龙硕', subtitle: '博才干练男', group: '新闻播报' },
        { value: 'loongbella_v3', label: 'Bella3.0', subtitle: '精准干练女', group: '新闻播报' },
        { value: 'longxiaochun_v3', label: '龙小淳', subtitle: '知性积极女', group: '语音助手' },
        { value: 'longxiaoxia_v3', label: '龙小夏', subtitle: '沉稳权威女', group: '语音助手' },
        { value: 'longanwen_v3', label: '龙安温', subtitle: '优雅知性女', group: '语音助手' },
        { value: 'longanli_v3', label: '龙安莉', subtitle: '利落从容女', group: '语音助手' },
        { value: 'longanlang_v3', label: '龙安朗', subtitle: '清爽利落男', group: '语音助手' },
        { value: 'longyingling_v3', label: '龙应聆', subtitle: '温和共情女', group: '客服' },
        { value: 'longanzhi_v3', label: '龙安智', subtitle: '睿智轻熟男', group: '社交陪伴' }
    ]
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const csvEscape = (value: string | number) => {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

const hasCjk = (text: string) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ''));

const safeJson = (value: unknown, max = 2000) => {
    try {
        const text = JSON.stringify(value);
        if (!text) return '';
        return text.length > max ? `${text.slice(0, max)}...` : text;
    } catch {
        return String(value);
    }
};

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --otp-bg: #1a1a20;
            --otp-card: #23232a;
            --otp-input: #151519;
            --otp-border: #33333e;
            --otp-text: #e2e2e9;
            --otp-muted: #8b8b99;
            --otp-main: #3b82f6;
            --otp-main-2: #60a5fa;
            --otp-pri: #f59e0b;
        }
        #${PANEL_ID} {
            position: fixed;
            right: 56px;
            top: 86px;
            width: min(980px, calc(100vw - 84px));
            height: min(78vh, 640px);
            border-radius: 14px;
            border: 1px solid var(--otp-border);
            background: var(--otp-bg);
            color: var(--otp-text);
            box-shadow: 0 24px 60px rgba(0,0,0,0.55);
            z-index: 176;
            pointer-events: auto;
            display: flex;
            flex-direction: column;
            font-family: "Segoe UI", "Noto Sans", sans-serif;
            overflow: hidden;
        }
        #${PANEL_ID}.hidden { display: none; }
        #${PANEL_ID} .hidden { display: none !important; }
        #${PANEL_ID}.transcript-only {
            width: min(420px, calc(100vw - 18px));
            max-width: calc(100vw - 18px);
        }
        #${PANEL_ID}.transcript-only .otp-main {
            grid-template-columns: 1fr !important;
        }
        #${PANEL_ID}.transcript-only .otp-script-col,
        #${PANEL_ID}.transcript-only .otp-priority-col { display: none; }
        #${PANEL_ID}.transcript-only .otp-transcript-col {
            border-right: none;
            width: 100%;
            min-width: 0;
        }
        #${PANEL_ID} * { box-sizing: border-box; }
        .otp-header {
            height: 52px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:0 14px;
            border-bottom:1px solid var(--otp-border);
            background:rgba(0,0,0,0.22);
            cursor:move;
        }
        .otp-header-left,
        .otp-header-right { display:flex; align-items:center; gap:8px; }
        .otp-brand { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; letter-spacing:0.01em; margin-right: 10px; }
        .otp-dot { width:8px; height:8px; border-radius:50%; background:var(--otp-main); box-shadow:0 0 10px rgba(59,130,246,0.9); }
        .otp-btn {
            height:30px;
            border:1px solid var(--otp-border);
            border-radius:8px;
            background:var(--otp-input);
            color:var(--otp-text);
            padding:0 10px;
            font-size:12px;
            font-weight:600;
            cursor:pointer;
        }
        .otp-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .otp-icon-btn {
            width:30px;
            height:30px;
            border:1px solid var(--otp-border);
            border-radius:8px;
            background:var(--otp-input);
            color:var(--otp-text);
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:14px;
            cursor:pointer;
            line-height: 1;
        }
        .otp-icon {
            width: 15px;
            height: 15px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .otp-icon-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .otp-icon-btn.playing { color: #8ec3ff; border-color: rgba(59,130,246,0.6); background: rgba(59,130,246,0.12); }
        .otp-icon-btn.stop { color:#ffd3d3; border-color:rgba(239,68,68,0.55); }
        .otp-main { flex:1; display:grid; grid-template-columns:1.2fr 1fr 1fr; min-height:0; }
        .otp-col { display:flex; flex-direction:column; min-width:0; min-height:0; border-right:1px solid var(--otp-border); background:#151519; }
        .otp-col:last-child { border-right:none; }
        .otp-title {
            height:40px;
            padding:0 12px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            border-bottom:1px solid var(--otp-border);
            background:var(--otp-card);
            font-size:12px;
            font-weight:700;
            gap: 8px;
        }
        .otp-transcript-filter-row { display:flex; align-items:center; justify-content:space-between; width:100%; gap:10px; }
        .otp-transcript-tools { display:flex; align-items:center; gap:8px; margin-left:auto; }
        .otp-tabs { display:flex; gap:4px; padding:2px; border:1px solid var(--otp-border); border-radius:8px; background:var(--otp-input); }
        .otp-tab { border:none; background:transparent; color:var(--otp-muted); font-size:10px; height:22px; border-radius:6px; padding:0 8px; cursor:pointer; }
        .otp-tab.active { color:#fff; background:#2d2d37; }
        .otp-badge { font-size:10px; color:var(--otp-muted); padding:2px 6px; border-radius:999px; border:1px solid var(--otp-border); background:var(--otp-input); }
        .otp-list { flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:6px; min-height:0; }
        .otp-transcript-body {
            position: relative;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .otp-item { border:1px solid var(--otp-border); border-radius:8px; background:#1e1e25; padding:8px; font-size:11px; line-height:1.45; }
        .otp-item.running { border-color:rgba(59,130,246,0.55); background:rgba(59,130,246,0.12); }
        .otp-item.priority { border-color:rgba(245,158,11,0.55); background:rgba(245,158,11,0.12); }
        .otp-empty { color:var(--otp-muted); font-size:11px; text-align:center; padding:24px 10px; opacity:0.8; }
        .otp-map-panel {
            position: absolute;
            right: 12px;
            top: 10px;
            width: 260px;
            border: 1px solid var(--otp-border);
            border-radius: 10px;
            background: rgba(25, 27, 36, 0.98);
            box-shadow: 0 16px 30px rgba(0, 0, 0, 0.45);
            z-index: 3;
            overflow: hidden;
        }
        .otp-map-panel.hidden { display: none; }
        .otp-map-head {
            height: 30px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--otp-border);
            background: var(--otp-card);
            font-size: 12px;
            font-weight: 600;
        }
        .otp-map-canvas {
            width: 100%;
            height: 170px;
            display: block;
            background: #0b0f19;
        }
        .otp-map-tools {
            display: inline-flex;
            gap: 6px;
            padding: 8px;
            border-top: 1px solid var(--otp-border);
            background: rgba(13, 17, 26, 0.92);
        }
        .otp-map-tools .otp-icon-btn {
            width: 24px;
            height: 24px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
        }
        .otp-transcript-chat {
            border-top: 1px solid var(--otp-border);
            background: var(--otp-card);
            padding: 8px;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
        }
        .otp-status {
            height: 40px;
            border-top:1px solid var(--otp-border);
            background: var(--otp-card);
            padding: 0 10px;
            display:flex;
            align-items:center;
            justify-content: space-between;
            gap: 10px;
            font-size:11px;
            color:#b8d6ff;
        }
        .otp-status-text {
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .otp-status-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .otp-record-timer {
            min-width: 66px;
            font-variant-numeric: tabular-nums;
            color: #ffb4b4;
            text-align: right;
        }
        .otp-record-btn {
            height: 28px;
            border-radius: 999px;
            border: 1px solid rgba(255, 96, 96, 0.38);
            background: rgba(32, 14, 16, 0.88);
            color: #ffdede;
            padding: 0 12px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.03em;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
        }
        .otp-record-btn:hover {
            border-color: rgba(255, 110, 110, 0.58);
            background: rgba(52, 18, 22, 0.96);
        }
        .otp-record-dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            border: 1.6px solid #ff6767;
            background: transparent;
            flex: 0 0 auto;
        }
        .otp-record-btn.variant-b {
            border-radius: 9px;
            padding: 0 10px;
            background: rgba(24, 16, 18, 0.96);
            text-transform: uppercase;
        }
        .otp-record-btn.variant-b .otp-record-label {
            min-width: 30px;
            text-align: center;
        }
        .otp-record-btn.recording {
            border-color: rgba(255, 91, 91, 0.88);
            color: #fff3f3;
            box-shadow: 0 0 0 1px rgba(255, 91, 91, 0.12), 0 0 22px rgba(255, 72, 72, 0.18);
        }
        .otp-record-btn.recording .otp-record-dot {
            background: #ff5c5c;
            box-shadow: 0 0 12px rgba(255, 92, 92, 0.8);
        }
        .otp-record-btn.variant-b.recording {
            background: linear-gradient(180deg, #ff5d5d, #d83a3a);
            color: #fff;
            animation: otp-rec-pulse 1.1s ease-in-out infinite;
        }
        .otp-record-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .otp-modal {
            position: fixed;
            inset: 0;
            z-index: 230;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(6, 8, 12, 0.56);
            backdrop-filter: blur(8px);
        }
        .otp-modal.hidden { display: none; }
        .otp-modal .hidden { display: none !important; }
        .otp-modal-card {
            width: min(900px, calc(100vw - 32px));
            max-height: min(84vh, 780px);
            overflow: auto;
            border-radius: 18px;
            border: 1px solid rgba(110, 122, 148, 0.25);
            background: linear-gradient(180deg, rgba(16, 18, 24, 0.98), rgba(12, 14, 19, 0.98));
            box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
            padding: 18px;
        }
        .otp-modal-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
        }
        .otp-modal-head-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: nowrap;
            justify-content: flex-end;
            margin-left: auto;
        }
        .otp-modal-head-actions .otp-icon-btn {
            width: 32px;
            height: 32px;
        }
        .otp-btn-accent {
            background: linear-gradient(180deg, #2a6ef7, #1f58cb);
            border-color: rgba(96, 154, 255, 0.78);
            color: #f6f9ff;
            font-weight: 700;
            box-shadow: 0 8px 18px rgba(35, 93, 215, 0.32);
        }
        .otp-icon-btn.accent {
            background: linear-gradient(180deg, #2a6ef7, #1f58cb);
            border-color: rgba(96, 154, 255, 0.78);
            color: #f6f9ff;
            box-shadow: 0 8px 18px rgba(35, 93, 215, 0.32);
        }
        .otp-btn-accent:hover {
            background: linear-gradient(180deg, #3379ff, #255fd8);
        }
        .otp-icon-btn.accent:hover {
            background: linear-gradient(180deg, #3379ff, #255fd8);
        }
        .otp-modal-title {
            font-size: 18px;
            font-weight: 800;
            color: #f3f7ff;
        }
        .otp-modal-note {
            color: #aab7ce;
            font-size: 12px;
            margin-top: 4px;
        }
        .otp-modal-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
        }
        .otp-modal-section {
            border: 1px solid var(--otp-border);
            border-radius: 12px;
            background: rgba(24, 27, 36, 0.96);
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
        }
        .otp-modal-section.span-2 { grid-column: 1 / -1; }
        .otp-modal-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .otp-modal-section-actions {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .otp-modal-section-actions .otp-icon-btn {
            width: 28px;
            height: 28px;
        }
        .otp-modal-section-title {
            font-size: 12px;
            font-weight: 800;
            color: #eef4ff;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        .otp-modal-hover-group {
            position: relative;
        }
        .otp-modal-tool-btn {
            width: 32px;
            height: 32px;
        }
        .otp-modal-popover {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            width: min(380px, calc(100vw - 54px));
            border: 1px solid rgba(112, 121, 147, 0.35);
            border-radius: 12px;
            background: rgba(16, 20, 30, 0.98);
            box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
            padding: 10px;
            display: none;
            z-index: 14;
        }
        .otp-modal-popover.open {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otp-modal-popover-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .otp-modal-popover-close {
            width: 24px;
            height: 24px;
            border-radius: 7px;
            border: 1px solid var(--otp-border);
            background: rgba(18, 21, 30, 0.96);
            color: #cfd9ec;
            cursor: pointer;
            line-height: 1;
        }
        .otp-modal-row {
            display: grid;
            grid-template-columns: 130px 1fr;
            align-items: center;
            gap: 10px;
        }
        .otp-modal-row label,
        .otp-modal-check {
            font-size: 12px;
            color: #d9e4f6;
        }
        .otp-modal-row select,
        .otp-modal-row input[type="range"] {
            width: 100%;
        }
        .otp-modal-row select {
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--otp-border);
            background: var(--otp-input);
            color: var(--otp-text);
            padding: 0 8px;
        }
        .otp-modal-row input[type="checkbox"] { margin-right: 8px; }
        .otp-inline-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .otp-playlist {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 220px;
            overflow: auto;
        }
        .otp-playlist-item {
            border: 1px solid rgba(112, 121, 147, 0.22);
            border-radius: 10px;
            background: rgba(14, 16, 22, 0.92);
            padding: 8px 10px;
            display: grid;
            grid-template-columns: auto 1fr auto;
            gap: 8px;
            align-items: center;
            font-size: 12px;
        }
        .otp-playlist-preview {
            width: 34px;
            height: 24px;
            border-radius: 8px;
            border: 1px solid rgba(96, 138, 255, 0.35);
            background: rgba(18, 24, 38, 0.96);
            color: #d7e5ff;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
        }
        .otp-playlist-preview.playing {
            border-color: rgba(90, 165, 255, 0.8);
            background: rgba(59, 130, 246, 0.18);
            color: #fff;
        }
        .otp-playlist-meta {
            font-size: 10px;
            color: #97a3b6;
            margin-top: 2px;
        }
        .otp-playlist-remove {
            width: 24px;
            height: 24px;
            border-radius: 8px;
            border: 1px solid var(--otp-border);
            background: rgba(32, 18, 18, 0.92);
            color: #ffd0d0;
            cursor: pointer;
        }
        .otp-modal-footer {
            display: flex;
            justify-content: flex-start;
            gap: 10px;
            margin-top: 16px;
        }
        .otp-recordings-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
        }
        .otp-record-card {
            border: 1px solid rgba(112, 121, 147, 0.22);
            border-radius: 14px;
            overflow: hidden;
            background: linear-gradient(180deg, rgba(18, 22, 32, 0.98), rgba(10, 13, 20, 0.98));
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
            position: relative;
        }
        .otp-record-slot-empty {
            border: 1px dashed rgba(112, 121, 147, 0.38);
            border-radius: 14px;
            min-height: 220px;
            background: rgba(10, 13, 20, 0.5);
        }
        .otp-record-card.active {
            border-color: rgba(87, 166, 255, 0.72);
            box-shadow: 0 0 0 1px rgba(87, 166, 255, 0.24), 0 18px 32px rgba(14, 62, 131, 0.18);
        }
        .otp-record-thumb {
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            display: block;
            background: linear-gradient(135deg, rgba(40, 52, 82, 0.8), rgba(11, 14, 20, 0.95));
        }
        .otp-record-video {
            width: 100%;
            aspect-ratio: 16 / 9;
            display: block;
            background: #000;
        }
        .otp-record-menu-anchor {
            position: absolute;
            right: 10px;
            top: 10px;
            z-index: 4;
        }
        .otp-record-menu-btn {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            border: 1px solid rgba(255, 109, 109, 0.35);
            background: rgba(25, 10, 12, 0.9);
            color: #ffd8d8;
            cursor: pointer;
        }
        .otp-record-card-body {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .otp-record-topline {
            display: block;
            min-width: 0;
        }
        .otp-record-subline {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-width: 0;
        }
        .otp-record-delete {
            height: 24px;
            padding: 0 8px;
            border-radius: 999px;
            border: 1px solid rgba(255, 105, 105, 0.24);
            background: rgba(34, 16, 18, 0.92);
            color: #ffd0d0;
            font-size: 10px;
            cursor: pointer;
            display: none;
        }
        .otp-record-name {
            font-size: 11px;
            font-weight: 600;
            color: #eef4ff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .otp-record-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            width: fit-content;
            max-width: 100%;
            padding: 2px 7px;
            border-radius: 999px;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            background: rgba(58, 130, 246, 0.14);
            color: #bad4ff;
            flex-shrink: 0;
            white-space: nowrap;
        }
        .otp-record-subline .otp-record-status {
            font-size: 8px;
            padding: 2px 6px;
            margin-left: auto;
        }
        .otp-record-status.warn {
            background: rgba(245, 158, 11, 0.14);
            color: #ffd89a;
        }
        .otp-record-status.processing {
            background: rgba(87, 166, 255, 0.14);
            color: #a8d2ff;
        }
        .otp-record-meta {
            font-size: 10px;
            color: #97a3b6;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .otp-value-out {
            min-width: 42px;
            text-align: right;
            color: #a8c6ff;
            font-size: 11px;
        }
        .otp-modal-row input[type="color"] {
            width: 100%;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--otp-border);
            background: var(--otp-input);
            padding: 4px;
        }
        @keyframes otp-rec-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 90, 0.16); }
            50% { box-shadow: 0 0 0 5px rgba(255, 90, 90, 0.04); }
        }
        .otp-input { height:32px; border:1px solid var(--otp-border); border-radius:8px; background:var(--otp-input); color:var(--otp-text); padding:0 10px; font-size:12px; width:100%; min-width:0; }
        .otp-role-system { color:#8bbdff; }
        .otp-role-user { color:#86efac; }
        .otp-role-narrator { color:#fcd34d; }
        .otp-small { font-size:10px; color:var(--otp-muted); margin-top:2px; }
        @media (max-width: 1080px) {
            #${PANEL_ID} { right:8px; width:calc(100vw - 16px); top:74px; height:calc(100vh - 84px); }
            .otp-main { grid-template-columns:1fr; }
            .otp-col { border-right:none; border-bottom:1px solid var(--otp-border); min-height:180px; }
            .otp-col:last-child { border-bottom:none; }
            .otp-header { height: auto; min-height: 52px; padding: 8px; flex-wrap: wrap; }
            .otp-modal-head { flex-direction: column; }
            .otp-modal-head-actions { justify-content: flex-start; margin-left: 0; }
            .otp-modal-popover { left: 0; right: auto; width: min(420px, calc(100vw - 54px)); }
            .otp-recordings-grid { grid-template-columns: 1fr; }
            .otp-modal-row { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
};

class TourPlayerPanel implements TourPlayerPanelController {
    private readonly root: HTMLDivElement;
    private readonly sessionEl: HTMLSpanElement;
    private readonly runningEl: HTMLDivElement;
    private readonly scriptListEl: HTMLDivElement;
    private readonly priorityListEl: HTMLDivElement;
    private readonly transcriptEl: HTMLDivElement;
    private readonly transcriptFilterAllBtn: HTMLButtonElement;
    private readonly transcriptFilterChatBtn: HTMLButtonElement;
    private readonly transcriptFilterSystemBtn: HTMLButtonElement;
    private readonly transcriptExpandBtn: HTMLButtonElement;
    private readonly transcriptMapToggleBtns: HTMLButtonElement[];
    private readonly statusEl: HTMLDivElement;
    private readonly statusTextEl: HTMLSpanElement;
    private readonly statusActionsEl: HTMLDivElement;
    private readonly playBtn: HTMLButtonElement;
    private readonly stopBtn: HTMLButtonElement;
    private readonly clearBtn: HTMLButtonElement;
    private readonly uploadBtn: HTMLButtonElement;
    private readonly downloadBtn: HTMLButtonElement;
    private readonly ttsBtn: HTMLButtonElement;
    private readonly csvInput: HTMLInputElement;
    private readonly danmakuInput: HTMLInputElement;
    private readonly danmakuSendBtn: HTMLButtonElement;
    private readonly routeMapPanelEl: HTMLDivElement;
    private readonly routeMapCanvasEl: HTMLCanvasElement;
    private readonly routeMapZoomInBtn: HTMLButtonElement;
    private readonly routeMapZoomOutBtn: HTMLButtonElement;
    private readonly routeMapCenterBtn: HTMLButtonElement;
    private readonly recordButtons: HTMLButtonElement[] = [];
    private readonly recordTimerEl: HTMLSpanElement;
    private readonly recordPauseBtn: HTMLButtonElement;
    private readonly recordStopBtn: HTMLButtonElement;
    private readonly recordingModalEl: HTMLDivElement;
    private readonly recordingModalStatusEl: HTMLDivElement;
    private readonly audioInputEl: HTMLInputElement;
    private readonly folderInputEl: HTMLInputElement;
    private readonly recordingFrameRateSelect: HTMLSelectElement;
    private readonly recordingQualitySelect: HTMLSelectElement;
    private readonly recordingCompressionSelect: HTMLSelectElement;
    private readonly recordingIncludeTtsInput: HTMLInputElement;
    private readonly recordingIncludeMusicInput: HTMLInputElement;
    private readonly recordingAutoPlayInput: HTMLInputElement;
    private readonly recordingStopWithPlaybackInput: HTMLInputElement;
    private readonly recordingHidePanelInput: HTMLInputElement;
    private readonly recordingDisableInterruptsInput: HTMLInputElement;
    private readonly recordingMusicLoopInput: HTMLInputElement;
    private readonly recordingMasterVolumeInput: HTMLInputElement;
    private readonly recordingTtsVolumeInput: HTMLInputElement;
    private readonly recordingMusicVolumeInput: HTMLInputElement;
    private readonly recordingSubtitlesEnabledInput: HTMLInputElement;
    private readonly recordingSubtitleFontSelect: HTMLSelectElement;
    private readonly recordingSubtitleSizeInput: HTMLInputElement;
    private readonly recordingSubtitleColorInput: HTMLInputElement;
    private readonly recordingMasterVolumeOut: HTMLSpanElement;
    private readonly recordingTtsVolumeOut: HTMLSpanElement;
    private readonly recordingMusicVolumeOut: HTMLSpanElement;
    private readonly recordingSubtitleSizeOut: HTMLSpanElement;
    private readonly recordingPlaylistEl: HTMLDivElement;
    private readonly recordingEmptyEl: HTMLDivElement;
    private readonly recordingResultsEl: HTMLDivElement;
    private readonly recordingResultsEmptyEl: HTMLDivElement;
    private readonly recordingSyncToModelDbBtn: HTMLButtonElement;
    private readonly ttsModalEl: HTMLDivElement;
    private readonly ttsModelInput: HTMLSelectElement;
    private readonly ttsVoiceInput: HTMLSelectElement;
    private readonly ttsApiKeyInput: HTMLInputElement;
    private readonly ttsInfoEl: HTMLDivElement;

    private modelFilename: string | null = null;
    private sessionId = '';
    private snapshot: QueueSnapshot | null = null;
    private eventSource: EventSource | null = null;
    private playbackToken = 0;
    private playing = false;
    private paused = false;
    private stopRequested = false;
    private skipRunningOnNextPlay = false;
    private pendingTaskStatus: QueueTaskStatus | undefined;
    private transcriptFilter: TranscriptFilter = 'CHAT';
    private transcriptOnly = false;
    private transcriptLogs: TranscriptLog[] = [];
    private routeMapOpen = false;
    private routePoints: RoutePoint[] = [];
    private routeMapZoom = 1;
    private routeMapOffsetX = 0;
    private routeMapOffsetY = 0;
    private routeMapBitmapCanvas: HTMLCanvasElement | null = null;
    private routeMapRange: { xMin: number; xMax: number; yMin: number; yMax: number } | null = null;
    private routeMapModelReady: string | null = null;
    private routeMapLoading = false;
    private panelDrag = { active: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private recordingPlaylist: RecordingAudioItem[] = [];
    private activeRecording: RecordingRuntime | null = null;
    private recordingSettings: RecordingSettings = {
        frameRate: 24,
        videoBitsPerSecond: 18_000_000,
        audioBitsPerSecond: 256_000,
        mp4CompressionPreset: 'target_10mb',
        includeTts: true,
        includeMusic: true,
        autoPlay: true,
        stopWithPlayback: true,
        musicLoop: true,
        hidePanelDuringRecording: false,
        disableInterrupts: true,
        masterVolume: 1,
        ttsVolume: 1,
        musicVolume: 0.35,
        subtitlesEnabled: true,
        subtitleFont: 'PingFang SC',
        subtitleFontSize: 26,
        subtitleColor: '#d7a733',
        selectedVariant: 'A'
    };
    private recordTimerId = 0;
    private musicAudioEl: HTMLAudioElement | null = null;
    private musicIndex = 0;
    private previewAudioEl: HTMLAudioElement | null = null;
    private previewTrackId: string | null = null;
    private recordingResults: StoredRecordingEntry[] = [];
    private backfillSyncInProgress = false;
    private recordingDbPromise: Promise<IDBDatabase> | null = null;
    private readonly recordingObjectUrls = new Map<string, string>();
    private readonly recoveringRecordingIds = new Set<string>();
    private ttsAudioEl: HTMLAudioElement | null = null;
    private ttsPlaybackDone: (() => void) | null = null;
    private recordingCompositorCanvas: HTMLCanvasElement | null = null;
    private recordingCompositorCtx: CanvasRenderingContext2D | null = null;
    private recordingCompositorRaf = 0;
    private recordingSubtitleText = '';
    private ttsConfig: TtsConfig = {
        provider: 'aliyun',
        model: DEFAULT_TTS_MODEL,
        voice: DEFAULT_TTS_VOICE,
        apiKey: '',
        format: 'mp3',
        updatedAt: null
    };

    constructor(private readonly options: TourPlayerPanelOptions) {
        ensureStyle();
        this.root = document.createElement('div');
        this.root.id = PANEL_ID;
        this.root.className = 'hidden';
        this.root.innerHTML = `
            <div class="otp-header" data-role="drag-handle">
                <div class="otp-header-left">
                    <div class="otp-brand"><span class="otp-dot"></span>Tour Player</div>
                    <button class="otp-icon-btn" data-act="play" title="Play / Pause">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z" /></svg>
                    </button>
                    <button class="otp-icon-btn stop" data-act="stop" title="Stop">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
                    </button>
                    <button class="otp-icon-btn" data-act="clear" title="Clear All Records">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
                    </button>
                    <button class="otp-icon-btn" data-act="tts-settings" title="Alibaba TTS Settings">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M7 7v10" /><path d="M12 7v10" /><path d="M17 7v10" /><path d="M9 17l3 3 3-3" /></svg>
                    </button>
                </div>
                <div class="otp-header-right">
                    <span class="otp-badge">Session <span data-role="session-id">-</span></span>
                    <button class="otp-icon-btn" data-act="hide" title="Hide Panel">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                    </button>
                </div>
            </div>
            <div class="otp-main">
                <section class="otp-col otp-transcript-col">
                    <div class="otp-title">
                        <div class="otp-transcript-filter-row">
                            <div class="otp-tabs">
                                <button class="otp-tab active" data-filter="CHAT">Chat</button>
                                <button class="otp-tab" data-filter="SYSTEM">System</button>
                                <button class="otp-tab" data-filter="ALL">All</button>
                            </div>
                            <div class="otp-transcript-tools">
                                <button class="otp-icon-btn" data-act="toggle-map" title="Toggle Tour Map">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M5 12h14" /><path d="M12 5a10 10 0 0 1 0 14" /><path d="M12 5a10 10 0 0 0 0 14" /></svg>
                                </button>
                                <button class="otp-icon-btn" data-act="expand-transcript" title="Expand Transcript">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4" /><path d="M4 4l6 6" /><path d="M16 20h4v-4" /><path d="M20 20l-6-6" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="otp-transcript-body">
                        <div class="otp-list" data-role="transcript-list"></div>
                        <div class="otp-map-panel hidden" data-role="route-map-panel">
                            <div class="otp-map-head">TopView (position + yaw) <button class="otp-icon-btn" data-act="toggle-map" title="Close Tour Map"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4" /><path d="M4 4l6 6" /><path d="M16 20h4v-4" /><path d="M20 20l-6-6" /></svg></button></div>
                            <canvas class="otp-map-canvas" data-role="route-map" width="250" height="170"></canvas>
                            <div class="otp-map-tools">
                                <button class="otp-icon-btn" data-act="route-map-zoom-in" title="Zoom In">+</button>
                                <button class="otp-icon-btn" data-act="route-map-zoom-out" title="Zoom Out">-</button>
                                <button class="otp-icon-btn" data-act="route-map-center" title="Center">◎</button>
                            </div>
                        </div>
                    </div>
                    <div class="otp-transcript-chat">
                        <input class="otp-input" data-role="danmaku" placeholder="弹幕输入，回车插队" />
                        <button class="otp-icon-btn" data-act="send-chat" title="Send">
                            <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12" /><path d="M13 8l4 4-4 4" /></svg>
                        </button>
                    </div>
                </section>
                <section class="otp-col otp-script-col"><div class="otp-title">Script Queue <span class="otp-badge" data-role="script-count">0</span></div><div class="otp-list" data-role="script-list"></div></section>
                <section class="otp-col otp-priority-col"><div class="otp-title">Priority Queue <span class="otp-badge" data-role="priority-count">0</span></div><div class="otp-list" data-role="priority-list"></div></section>
            </div>
            <div class="otp-status" data-role="status">
                <span class="otp-status-text" data-role="status-text">Ready</span>
                <div class="otp-status-actions" data-role="status-actions">
                    <span class="otp-record-timer" data-role="record-timer"></span>
                    <button class="otp-icon-btn" data-act="upload" title="Upload CSV">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V6" /><path d="M8.5 9.5L12 6l3.5 3.5" /><path d="M4 18h16" /></svg>
                    </button>
                    <button class="otp-icon-btn" data-act="download" title="Download CSV">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v10" /><path d="M8.5 14.5L12 18l3.5-3.5" /><path d="M4 6h16" /></svg>
                    </button>
                    <button class="otp-record-btn variant-a" data-act="record-a" title="Compare record button A"><span class="otp-record-dot"></span><span class="otp-record-label">Rec</span></button>
                    <button class="otp-record-btn hidden" data-act="record-pause" title="Pause recording"><span class="otp-record-label">Pause</span></button>
                    <button class="otp-record-btn hidden" data-act="record-stop" title="Stop recording"><span class="otp-record-label">Stop</span></button>
                </div>
            </div>
            <input type="file" accept=".csv,text/csv" data-role="csv-input" hidden />
        `;

        this.sessionEl = this.root.querySelector('[data-role="session-id"]') as HTMLSpanElement;
        this.runningEl = document.createElement('div');
        this.runningEl.className = 'otp-item running';
        this.scriptListEl = this.root.querySelector('[data-role="script-list"]') as HTMLDivElement;
        this.priorityListEl = this.root.querySelector('[data-role="priority-list"]') as HTMLDivElement;
        this.transcriptEl = this.root.querySelector('[data-role="transcript-list"]') as HTMLDivElement;
        this.transcriptFilterAllBtn = this.root.querySelector('[data-filter="ALL"]') as HTMLButtonElement;
        this.transcriptFilterChatBtn = this.root.querySelector('[data-filter="CHAT"]') as HTMLButtonElement;
        this.transcriptFilterSystemBtn = this.root.querySelector('[data-filter="SYSTEM"]') as HTMLButtonElement;
        this.transcriptExpandBtn = this.root.querySelector('[data-act="expand-transcript"]') as HTMLButtonElement;
        this.transcriptMapToggleBtns = Array.from(this.root.querySelectorAll('[data-act="toggle-map"]')) as HTMLButtonElement[];
        this.statusEl = this.root.querySelector('[data-role="status"]') as HTMLDivElement;
        this.statusTextEl = this.root.querySelector('[data-role="status-text"]') as HTMLSpanElement;
        this.statusActionsEl = this.root.querySelector('[data-role="status-actions"]') as HTMLDivElement;
        this.playBtn = this.root.querySelector('[data-act="play"]') as HTMLButtonElement;
        this.stopBtn = this.root.querySelector('[data-act="stop"]') as HTMLButtonElement;
        this.clearBtn = this.root.querySelector('[data-act="clear"]') as HTMLButtonElement;
        this.uploadBtn = this.root.querySelector('[data-act="upload"]') as HTMLButtonElement;
        this.downloadBtn = this.root.querySelector('[data-act="download"]') as HTMLButtonElement;
        this.ttsBtn = this.root.querySelector('[data-act="tts-settings"]') as HTMLButtonElement;
        this.csvInput = this.root.querySelector('[data-role="csv-input"]') as HTMLInputElement;
        this.danmakuInput = this.root.querySelector('[data-role="danmaku"]') as HTMLInputElement;
        this.danmakuSendBtn = this.root.querySelector('[data-act="send-chat"]') as HTMLButtonElement;
        this.routeMapPanelEl = this.root.querySelector('[data-role="route-map-panel"]') as HTMLDivElement;
        this.routeMapCanvasEl = this.root.querySelector('[data-role="route-map"]') as HTMLCanvasElement;
        this.routeMapZoomInBtn = this.root.querySelector('[data-act="route-map-zoom-in"]') as HTMLButtonElement;
        this.routeMapZoomOutBtn = this.root.querySelector('[data-act="route-map-zoom-out"]') as HTMLButtonElement;
        this.routeMapCenterBtn = this.root.querySelector('[data-act="route-map-center"]') as HTMLButtonElement;
        this.recordButtons.push(
            this.root.querySelector('[data-act="record-a"]') as HTMLButtonElement
        );
        this.recordTimerEl = this.root.querySelector('[data-role="record-timer"]') as HTMLSpanElement;
        this.recordPauseBtn = this.root.querySelector('[data-act="record-pause"]') as HTMLButtonElement;
        this.recordStopBtn = this.root.querySelector('[data-act="record-stop"]') as HTMLButtonElement;

        this.audioInputEl = document.createElement('input');
        this.audioInputEl.type = 'file';
        this.audioInputEl.accept = 'audio/*';
        this.audioInputEl.multiple = true;
        this.audioInputEl.hidden = true;

        this.folderInputEl = document.createElement('input');
        this.folderInputEl.type = 'file';
        this.folderInputEl.accept = 'audio/*';
        this.folderInputEl.multiple = true;
        this.folderInputEl.hidden = true;
        this.folderInputEl.setAttribute('webkitdirectory', '');

        this.recordingModalEl = document.createElement('div');
        this.recordingModalEl.className = 'otp-modal hidden';
        this.recordingModalEl.innerHTML = `
            <div class="otp-modal-card">
                <div class="otp-modal-head">
                    <div class="otp-modal-title">Recording</div>
                    <div class="otp-modal-head-actions">
                        <button class="otp-record-btn variant-a" type="button" data-record-modal="start" title="Start Recording" aria-label="Start Recording"><span class="otp-record-dot"></span><span class="otp-record-label">Rec</span></button>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="video" title="Video Settings" aria-label="Video Settings">
                                <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>
                            </button>
                            <section class="otp-modal-popover" data-record-popover="video">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Video</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="video" title="Close">×</button></div>
                                <div class="otp-modal-row"><label>Frame Rate</label><select data-record="frame-rate"><option value="24" selected>24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div>
                                <div class="otp-modal-row"><label>Quality</label><select data-record="quality"><option value="standard" selected>Standard 18 Mbps</option><option value="high">High 28 Mbps</option><option value="ultra">Ultra 40 Mbps</option></select></div>
                                <div class="otp-modal-row"><label>MP4 Compression</label><select data-record="compression"><option value="original">Original</option><option value="fast_export">Fast Export</option><option value="balanced">Balanced</option><option value="archive_smallest">Archive Smallest</option><option value="target_10mb" selected>Target 10MB</option></select></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="auto-play" checked />Auto-start playback when recording begins</label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="stop-with-playback" checked />Stop recording automatically when playback finishes</label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="hide-panel" />Temporarily hide Tour Player panel during recording</label>
                            </section>
                        </div>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="audio" title="Audio Settings" aria-label="Audio Settings">
                                <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h4l5 4V6l-5 4H4z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19.5 6.5a7 7 0 0 1 0 11" /></svg>
                            </button>
                            <section class="otp-modal-popover" data-record-popover="audio">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Audio</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="audio" title="Close">×</button></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="include-tts" checked />Capture system TTS narration</label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="include-music" checked />Capture playlist music</label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="disable-interrupts" checked />Disable danmaku / interrupt injection while recording</label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="music-loop" checked />Loop playlist when audio ends before tour</label>
                                <div class="otp-modal-row"><label>Master Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="100" data-record="master-volume" /><span class="otp-value-out" data-record="master-volume-out">100%</span></div></div>
                                <div class="otp-modal-row"><label>TTS Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="100" data-record="tts-volume" /><span class="otp-value-out" data-record="tts-volume-out">100%</span></div></div>
                                <div class="otp-modal-row"><label>Music Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="35" data-record="music-volume" /><span class="otp-value-out" data-record="music-volume-out">35%</span></div></div>
                            </section>
                        </div>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="subtitle" title="Subtitle Settings" aria-label="Subtitle Settings">
                                <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 11h10" /><path d="M7 15h7" /></svg>
                            </button>
                            <section class="otp-modal-popover" data-record-popover="subtitle">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Subtitles</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="subtitle" title="Close">×</button></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="subtitles-enabled" checked />Burn subtitles into recording preview</label>
                                <div class="otp-modal-row"><label>Font</label><select data-record="subtitle-font"><option value="PingFang SC" selected>PingFang SC Semibold</option><option value="Source Han Sans SC">Source Han Sans SC SemiBold</option><option value="Noto Sans SC">Noto Sans SC Medium</option></select></div>
                                <div class="otp-modal-row"><label>Font Size</label><div class="otp-inline-actions"><input type="range" min="24" max="64" value="26" data-record="subtitle-size" /><span class="otp-value-out" data-record="subtitle-size-out">26px</span></div></div>
                                <div class="otp-modal-row"><label>Font Color</label><input type="color" value="#d7a733" data-record="subtitle-color" /></div>
                            </section>
                        </div>
                    </div>
                    <button class="otp-icon-btn" data-record-modal="close" title="Close Recording">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                    </button>
                </div>
                <div class="otp-modal-grid">
                    <section class="otp-modal-section span-2">
                        <div class="otp-modal-section-head">
                            <div class="otp-modal-section-title">Recordings</div>
                            <div class="otp-modal-section-actions">
                                <button class="otp-icon-btn" type="button" data-record="sync-model-db" title="Sync MP4 to Model DB">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6" /><path d="M20 20v-6h-6" /><path d="M20 8a8 8 0 0 0-14.5-3" /><path d="M4 16a8 8 0 0 0 14.5 3" /></svg>
                                </button>
                            </div>
                        </div>
                        <div class="otp-recordings-grid" data-record="results"></div>
                        <div class="otp-empty hidden" data-record="results-empty">No recordings yet.</div>
                    </section>
                    <section class="otp-modal-section span-2">
                        <div class="otp-modal-section-head">
                            <div class="otp-modal-section-title">Music Playlist</div>
                            <div class="otp-modal-section-actions">
                                <button class="otp-icon-btn" type="button" data-record="pick-folder" title="Select Folder">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2" /></svg>
                                </button>
                                <button class="otp-icon-btn" type="button" data-record="pick-files" title="Add Files">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M14 4v5h5" /><path d="M12 12v5" /><path d="M9.5 14.5h5" /></svg>
                                </button>
                                <button class="otp-icon-btn" type="button" data-record="clear-playlist" title="Clear Playlist">
                                    <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
                                </button>
                            </div>
                        </div>
                        <div class="otp-playlist" data-record="playlist"></div>
                        <div class="otp-empty" data-record="playlist-empty">No music selected.</div>
                    </section>
                </div>
                <div class="otp-modal-footer">
                    <div class="otp-modal-note" data-record="modal-status" style="align-self:center;">Ready to record.</div>
                </div>
            </div>
        `;
        this.recordingModalStatusEl = this.recordingModalEl.querySelector('[data-record="modal-status"]') as HTMLDivElement;
        this.recordingFrameRateSelect = this.recordingModalEl.querySelector('[data-record="frame-rate"]') as HTMLSelectElement;
        this.recordingQualitySelect = this.recordingModalEl.querySelector('[data-record="quality"]') as HTMLSelectElement;
        this.recordingCompressionSelect = this.recordingModalEl.querySelector('[data-record="compression"]') as HTMLSelectElement;
        this.recordingIncludeTtsInput = this.recordingModalEl.querySelector('[data-record="include-tts"]') as HTMLInputElement;
        this.recordingIncludeMusicInput = this.recordingModalEl.querySelector('[data-record="include-music"]') as HTMLInputElement;
        this.recordingAutoPlayInput = this.recordingModalEl.querySelector('[data-record="auto-play"]') as HTMLInputElement;
        this.recordingStopWithPlaybackInput = this.recordingModalEl.querySelector('[data-record="stop-with-playback"]') as HTMLInputElement;
        this.recordingHidePanelInput = this.recordingModalEl.querySelector('[data-record="hide-panel"]') as HTMLInputElement;
        this.recordingDisableInterruptsInput = this.recordingModalEl.querySelector('[data-record="disable-interrupts"]') as HTMLInputElement;
        this.recordingMusicLoopInput = this.recordingModalEl.querySelector('[data-record="music-loop"]') as HTMLInputElement;
        this.recordingMasterVolumeInput = this.recordingModalEl.querySelector('[data-record="master-volume"]') as HTMLInputElement;
        this.recordingTtsVolumeInput = this.recordingModalEl.querySelector('[data-record="tts-volume"]') as HTMLInputElement;
        this.recordingMusicVolumeInput = this.recordingModalEl.querySelector('[data-record="music-volume"]') as HTMLInputElement;
        this.recordingSubtitlesEnabledInput = this.recordingModalEl.querySelector('[data-record="subtitles-enabled"]') as HTMLInputElement;
        this.recordingSubtitleFontSelect = this.recordingModalEl.querySelector('[data-record="subtitle-font"]') as HTMLSelectElement;
        this.recordingSubtitleSizeInput = this.recordingModalEl.querySelector('[data-record="subtitle-size"]') as HTMLInputElement;
        this.recordingSubtitleColorInput = this.recordingModalEl.querySelector('[data-record="subtitle-color"]') as HTMLInputElement;
        this.recordingMasterVolumeOut = this.recordingModalEl.querySelector('[data-record="master-volume-out"]') as HTMLSpanElement;
        this.recordingTtsVolumeOut = this.recordingModalEl.querySelector('[data-record="tts-volume-out"]') as HTMLSpanElement;
        this.recordingMusicVolumeOut = this.recordingModalEl.querySelector('[data-record="music-volume-out"]') as HTMLSpanElement;
        this.recordingSubtitleSizeOut = this.recordingModalEl.querySelector('[data-record="subtitle-size-out"]') as HTMLSpanElement;
        this.recordingPlaylistEl = this.recordingModalEl.querySelector('[data-record="playlist"]') as HTMLDivElement;
        this.recordingEmptyEl = this.recordingModalEl.querySelector('[data-record="playlist-empty"]') as HTMLDivElement;
        this.recordingResultsEl = this.recordingModalEl.querySelector('[data-record="results"]') as HTMLDivElement;
        this.recordingResultsEmptyEl = this.recordingModalEl.querySelector('[data-record="results-empty"]') as HTMLDivElement;
        this.recordingSyncToModelDbBtn = this.recordingModalEl.querySelector('[data-record="sync-model-db"]') as HTMLButtonElement;

        this.ttsModalEl = document.createElement('div');
        this.ttsModalEl.className = 'otp-modal hidden';
        this.ttsModalEl.innerHTML = `
            <div class="otp-modal-card" style="max-width:560px;">
                <div class="otp-modal-head">
                    <div>
                        <div class="otp-modal-title">Alibaba TTS</div>
                    </div>
                    <button class="otp-icon-btn" data-tts-modal="close" title="Close TTS Settings">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                    </button>
                </div>
                <div class="otp-modal-grid" style="grid-template-columns:1fr;">
                    <section class="otp-modal-section">
                        <div class="otp-modal-row"><label>语音模型</label><select data-tts="model">${TTS_MODEL_OPTIONS.map((option) => `<option value="${option.value}">${option.label} - ${option.description}</option>`).join('')}</select></div>
                        <div class="otp-modal-row"><label>声音</label><select data-tts="voice"></select></div>
                        <div class="otp-modal-row"><label>DashScope API Key</label><input class="otp-input" type="password" data-tts="api-key" placeholder="sk-..." /></div>
                        <div class="otp-modal-note" data-tts="info">Loading...</div>
                    </section>
                </div>
                <div class="otp-modal-footer">
                    <button class="otp-btn" type="button" data-tts-modal="cancel">Cancel</button>
                    <button class="otp-btn" type="button" data-tts-modal="save">Save</button>
                </div>
            </div>
        `;
        this.ttsModelInput = this.ttsModalEl.querySelector('[data-tts="model"]') as HTMLSelectElement;
        this.ttsVoiceInput = this.ttsModalEl.querySelector('[data-tts="voice"]') as HTMLSelectElement;
        this.ttsApiKeyInput = this.ttsModalEl.querySelector('[data-tts="api-key"]') as HTMLInputElement;
        this.ttsInfoEl = this.ttsModalEl.querySelector('[data-tts="info"]') as HTMLDivElement;

        document.body.appendChild(this.root);
        document.body.appendChild(this.audioInputEl);
        document.body.appendChild(this.folderInputEl);
        document.body.appendChild(this.recordingModalEl);
        document.body.appendChild(this.ttsModalEl);
        this.bindEvents();
        this.syncRecordingForm();
        this.renderRecordingPlaylist();
        this.renderRecordingResults();
        this.refreshRecordingButtons();
        this.updateTranscriptFilterButtons();
        this.refreshPlaybackButtons();
        this.renderTranscript();
        this.onModelChanged(this.options.getModelFilename());
        void this.loadRecordingResults();
        void this.loadTtsConfig().catch(() => {
            this.syncTtsConfigForm();
        });

        if (this.options.onModelLoaded) {
            this.options.onModelLoaded((filename) => this.onModelChanged(filename));
        }
    }

    open() { this.root.classList.remove('hidden'); }
    close() { this.root.classList.add('hidden'); }
    toggle() { this.root.classList.toggle('hidden'); }

    private apiBase() { return this.options.apiBaseUrl || 'http://localhost:3032/api/ot-tour-player'; }

    private setStatus(text: string) { this.statusTextEl.textContent = text; }

    private updateTranscriptFilterButtons() {
        const setActive = (button: HTMLButtonElement, active: boolean) => {
            if (active) button.classList.add('active');
            else button.classList.remove('active');
        };
        setActive(this.transcriptFilterAllBtn, this.transcriptFilter === 'ALL');
        setActive(this.transcriptFilterChatBtn, this.transcriptFilter === 'CHAT');
        setActive(this.transcriptFilterSystemBtn, this.transcriptFilter === 'SYSTEM');
    }

    private renderTranscript() {
        this.transcriptEl.innerHTML = '';
        const visible = this.transcriptLogs.filter((log) => {
            if (this.transcriptFilter === 'ALL') return true;
            if (this.transcriptFilter === 'CHAT') return log.role === 'user' || log.role === 'narrator';
            return log.role === 'system';
        });
        if (visible.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otp-empty';
            empty.textContent = this.sessionId ? 'No logs in current filter.' : 'Initialize session to view logs';
            this.transcriptEl.appendChild(empty);
            return;
        }
        visible.forEach((log) => {
            const row = document.createElement('div');
            const cls = log.role === 'system' ? 'otp-role-system' : log.role === 'user' ? 'otp-role-user' : 'otp-role-narrator';
            const roleText = log.role === 'system' ? 'System' : log.role === 'user' ? 'User' : 'Narrator';
            row.className = 'otp-item';
            row.innerHTML = `<div class="${cls}">${roleText}</div><div>${log.message}</div><div class="otp-small">${log.timestamp}</div>`;
            this.transcriptEl.appendChild(row);
        });
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }

    private parseRoutePointsFromCsv(csvText: string): RoutePoint[] {
        const lines = String(csvText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
        const get = (parts: string[], key: string) => {
            const i = idx[key];
            return i === undefined ? '' : (parts[i] || '').trim();
        };
        const toNum = (v: string, fallback: number) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
        };

        const rows = lines.slice(1).map((line, row) => {
            const parts = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
            const action = (get(parts, 'action') || '').toUpperCase();
            if (action !== 'MOVE' && action !== 'LOOK') return null;
            return {
                row,
                seq: toNum(get(parts, 'seq'), row + 1),
                point: {
                    taskId: `script_${row + 1}`,
                    poiId: get(parts, 'poi_id') || '-',
                    x: toNum(get(parts, 'target_x'), 0),
                    z: toNum(get(parts, 'target_z'), 0),
                    yaw: toNum(get(parts, 'target_yaw'), 0)
                } satisfies RoutePoint
            };
        }).filter(Boolean) as Array<{ row: number; seq: number; point: RoutePoint }>;

        rows.sort((a, b) => (a.seq - b.seq) || (a.row - b.row));
        return rows.map((v, i) => ({ ...v.point, taskId: `script_${i + 1}` }));
    }

    private async refreshRouteMapFromDb(force = false) {
        const modelFilename = this.modelFilename;
        if (!modelFilename) {
            this.routeMapBitmapCanvas = null;
            this.routeMapRange = null;
            this.routeMapModelReady = null;
            this.drawRouteMap();
            return;
        }
        if (!force && this.routeMapModelReady === modelFilename) return;
        if (this.routeMapLoading) return;
        this.routeMapLoading = true;
        try {
            const response = await fetch(`/api/model/calibration?modelFilename=${encodeURIComponent(modelFilename)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!payload?.found || !payload?.calibration) {
                this.routeMapBitmapCanvas = null;
                this.routeMapRange = null;
                this.routeMapModelReady = modelFilename;
                this.drawRouteMap();
                return;
            }
            const runtime = await buildStep3RuntimeFromDbCalibration(payload.calibration);
            if (!runtime?.map) {
                this.routeMapBitmapCanvas = null;
                this.routeMapRange = null;
                this.routeMapModelReady = modelFilename;
                this.drawRouteMap();
                return;
            }
            const bitmap = document.createElement('canvas');
            bitmap.width = runtime.map.width;
            bitmap.height = runtime.map.height;
            const bitmapCtx = bitmap.getContext('2d');
            if (bitmapCtx) {
                const imageData = bitmapCtx.createImageData(runtime.map.width, runtime.map.height);
                imageData.data.set(runtime.map.image);
                bitmapCtx.putImageData(imageData, 0, 0);
                this.routeMapBitmapCanvas = bitmap;
                this.routeMapRange = {
                    xMin: runtime.map.range.xMin,
                    xMax: runtime.map.range.xMax,
                    yMin: runtime.map.range.yMin,
                    yMax: runtime.map.range.yMax
                };
            }
            this.routeMapModelReady = modelFilename;
            this.drawRouteMap();
        } catch {
            this.routeMapBitmapCanvas = null;
            this.routeMapRange = null;
            this.routeMapModelReady = modelFilename;
            this.drawRouteMap();
        } finally {
            this.routeMapLoading = false;
        }
    }

    private drawRouteMap() {
        const canvas = this.routeMapCanvasEl;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const points = this.routePoints;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, width, height);

        const mapZoom = this.routeMapZoom;
        const mapOffsetX = this.routeMapOffsetX;
        const mapOffsetY = this.routeMapOffsetY;
        const fromBase = (baseX: number, baseY: number) => ({
            x: (baseX - width * 0.5) * mapZoom + width * 0.5 + mapOffsetX,
            y: (baseY - height * 0.5) * mapZoom + height * 0.5 + mapOffsetY
        });

        if (this.routeMapBitmapCanvas) {
            ctx.save();
            ctx.setTransform(
                mapZoom,
                0,
                0,
                mapZoom,
                width * 0.5 * (1 - mapZoom) + mapOffsetX,
                height * 0.5 * (1 - mapZoom) + mapOffsetY
            );
            ctx.drawImage(this.routeMapBitmapCanvas, 0, 0, width, height);
            ctx.restore();
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (let x = 12; x < width; x += 20) {
                const a = fromBase(x, 0);
                const b = fromBase(x, height);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
            for (let y = 12; y < height; y += 20) {
                const a = fromBase(0, y);
                const b = fromBase(width, y);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }

        if (points.length < 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '11px Segoe UI';
            ctx.fillText('No route points', 12, 18);
            return;
        }

        let toCanvas = (x: number, z: number) => {
            const base = fromBase(width * 0.5, height * 0.5);
            return { x: base.x, y: base.y };
        };

        if (this.routeMapRange) {
            const range = this.routeMapRange;
            const spanX = Math.max(1e-6, range.xMax - range.xMin);
            const spanY = Math.max(1e-6, range.yMax - range.yMin);
            toCanvas = (x: number, z: number) => {
                const nx = (x - range.xMin) / spanX;
                const ny = ((-z) - range.yMin) / spanY;
                return fromBase(nx * width, height - ny * height);
            };
        } else {
            const xs = points.map((p) => p.x);
            const zs = points.map((p) => p.z);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minZ = Math.min(...zs);
            const maxZ = Math.max(...zs);
            const spanX = Math.max(1e-6, maxX - minX);
            const spanZ = Math.max(1e-6, maxZ - minZ);
            const pad = 14;
            const sx = (width - pad * 2) / spanX;
            const sy = (height - pad * 2) / spanZ;
            const scale = Math.min(sx, sy);
            toCanvas = (x: number, z: number) => fromBase(
                pad + (x - minX) * scale,
                height - pad - (z - minZ) * scale
            );
        }

        ctx.strokeStyle = 'rgba(90, 165, 255, 0.9)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        points.forEach((point, i) => {
            const c = toCanvas(point.x, point.z);
            if (i === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        });
        ctx.stroke();

        const runningId = this.snapshot?.runningTask?.id || null;
        points.forEach((point, idx) => {
            const c = toCanvas(point.x, point.z);
            const running = runningId === point.taskId;
            ctx.fillStyle = running ? '#34d399' : '#f6bc4f';
            ctx.beginPath();
            ctx.arc(c.x, c.y, running ? 4.2 : 3.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = '10px Segoe UI';
            ctx.fillText(String(idx + 1), c.x + 5, c.y - 5);
        });
    }

    private refreshPlaybackButtons() {
        this.playBtn.classList.toggle('playing', this.playing && !this.paused);
        const showPause = this.playing && !this.paused;
        this.playBtn.title = showPause ? 'Pause' : this.paused ? 'Resume' : 'Play';
        this.playBtn.innerHTML = showPause
            ? '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14" /><path d="M15 5v14" /></svg>'
            : '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6z" /></svg>';
    }

    private appendTranscript(role: 'system' | 'user' | 'narrator', message: string) {
        this.transcriptLogs.push({
            role,
            message,
            timestamp: new Date().toTimeString().slice(0, 8)
        });
        if (this.transcriptLogs.length > 500) {
            this.transcriptLogs.splice(0, this.transcriptLogs.length - 500);
        }
        this.renderTranscript();
    }

    private setButtonsEnabled(enabled: boolean) {
        this.playBtn.disabled = !enabled;
        this.stopBtn.disabled = !enabled;
        this.clearBtn.disabled = !enabled;
        this.uploadBtn.disabled = !enabled;
        this.downloadBtn.disabled = !enabled;
        this.danmakuInput.disabled = !enabled;
        this.danmakuSendBtn.disabled = !enabled;
        this.recordButtons.forEach((button) => {
            button.disabled = !enabled && !this.activeRecording;
        });
    }

    private resetLocalRecords() {
        if (this.activeRecording) {
            void this.stopRecording(false, 'reset-local-records');
        }
        this.closeEvents();
        this.playing = false;
        this.paused = false;
        this.stopRequested = false;
        this.pendingTaskStatus = undefined;
        this.skipRunningOnNextPlay = false;
        this.sessionId = '';
        this.sessionEl.textContent = '-';
        this.snapshot = null;
        this.routePoints = [];
        this.transcriptLogs = [];
        this.renderTranscript();
        this.renderSnapshot();
        this.refreshPlaybackButtons();
    }

    private onModelChanged(filename: string | null) {
        this.modelFilename = filename;
        this.setButtonsEnabled(Boolean(filename));
        if (!filename) {
            if (this.activeRecording) {
                void this.stopRecording(false, 'model-unloaded');
            }
            this.sessionId = '';
            this.sessionEl.textContent = '-';
            this.snapshot = null;
            this.routePoints = [];
            this.routeMapBitmapCanvas = null;
            this.routeMapRange = null;
            this.routeMapModelReady = null;
            this.routeMapZoom = 1;
            this.routeMapOffsetX = 0;
            this.routeMapOffsetY = 0;
            this.renderSnapshot();
            this.setStatus('Load model first.');
            return;
        }
        void this.refreshRouteMapFromDb(true);
        this.setStatus('Ready. Upload CSV to start session, or download a sample CSV.');
    }

    private displayPoi(poiName?: string | null, poiId?: string | null) {
        return String(poiName || poiId || '-');
    }

    private renderTaskList(el: HTMLDivElement, tasks: QueueViewTask[], priority = false) {
        el.innerHTML = '';
        if (tasks.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otp-empty';
            empty.textContent = 'Empty';
            el.appendChild(empty);
            return;
        }
        tasks.forEach((task) => {
            const item = document.createElement('div');
            item.className = `otp-item${priority ? ' priority' : ''}`;
            item.innerHTML = `<div>${task.id}</div><div class="otp-small">${task.action} | ${task.behavior} | ${this.displayPoi(task.poiName, task.poiId)}</div>`;
            el.appendChild(item);
        });
    }

    private renderSnapshot() {
        const scriptCountEl = this.root.querySelector('[data-role="script-count"]') as HTMLSpanElement;
        const priorityCountEl = this.root.querySelector('[data-role="priority-count"]') as HTMLSpanElement;
        if (!this.snapshot) {
            scriptCountEl.textContent = '0';
            priorityCountEl.textContent = '0';
            this.renderTaskList(this.scriptListEl, []);
            this.renderTaskList(this.priorityListEl, []);
            this.drawRouteMap();
            return;
        }
        scriptCountEl.textContent = String(this.snapshot.scriptQueue.length);
        priorityCountEl.textContent = String(this.snapshot.priorityQueue.length);
        this.renderTaskList(this.scriptListEl, this.snapshot.scriptQueue);
        if (this.snapshot.runningTask) {
            this.runningEl.innerHTML = `<div>Running: ${this.snapshot.runningTask.id}</div><div class="otp-small">${this.snapshot.runningTask.action} | ${this.snapshot.runningTask.behavior} | ${this.displayPoi(this.snapshot.runningTask.poiName, this.snapshot.runningTask.poiId)}</div>`;
            this.scriptListEl.prepend(this.runningEl);
        }
        this.renderTaskList(this.priorityListEl, this.snapshot.priorityQueue, true);
        this.drawRouteMap();
    }

    private closeEvents() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    private async ensureBackendReady() {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3000);
        try {
            this.logDebug('backend.health.request', { url: `${this.apiBase()}/health` });
            const response = await fetch(`${this.apiBase()}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.logDebug('backend.health.ok', { status: response.status });
        } catch (_error) {
            this.logDebug('backend.health.error', {
                url: `${this.apiBase()}/health`,
                error: _error instanceof Error ? _error.message : String(_error)
            });
            throw new Error('Tour Player backend unavailable. Start: node src/opentour/OT_TourPlayer/backend/server.mjs');
        } finally {
            window.clearTimeout(timeout);
        }
    }

    private openEvents() {
        if (!this.sessionId) return;
        this.closeEvents();
        this.eventSource = new EventSource(`${this.apiBase()}/events?session_id=${encodeURIComponent(this.sessionId)}`);
        this.eventSource.addEventListener('queue.updated', (event) => {
            try {
                const payload = JSON.parse((event as MessageEvent).data || '{}');
                this.snapshot = {
                    sessionId: payload.sessionId,
                    runningTask: payload.runningTask
                        ? {
                            id: String(payload.runningTask.id || payload.runningTaskId || '-'),
                            action: String(payload.runningTask.action || 'RUNNING'),
                            behavior: String(payload.runningTask.behavior || '-'),
                            poiId: payload.runningTask.poiId || null,
                            poiName: payload.runningTask.poiName || null
                        }
                        : (payload.runningTaskId ? { id: payload.runningTaskId, action: 'RUNNING', behavior: '-', poiId: null, poiName: null } : null),
                    scriptQueue: payload.scriptQueue || [],
                    priorityQueue: payload.priorityQueue || [],
                    version: payload.version || 0
                };
                this.renderSnapshot();
            } catch {
                // no-op
            }
        });
        this.eventSource.addEventListener('interrupt.debug', (event) => {
            try {
                const payload = JSON.parse((event as MessageEvent).data || '{}');
                const matched = payload?.matched === true;
                const poi = payload?.matchedPoi?.poiName || payload?.matchedPoi?.poiId || '-';
                const model = payload?.detail?.model || '-';
                const by = payload?.detail?.matchedBy || '-';
                this.appendTranscript('system', `[INTENT] matched=${matched} poi=${poi} by=${by} model=${model}`);
            } catch {
                // no-op
            }
        });
    }

    private async initSessionFromCsv(csvText: string) {
        if (!this.modelFilename) return;
        this.logDebug('csv.import.start', {
            modelFilename: this.modelFilename,
            csvChars: csvText.length,
            csvLines: String(csvText || '').split(/\r?\n/).length,
            csvPreview: String(csvText || '').slice(0, 500)
        });
        await this.ensureBackendReady();
        const generatedSessionId = `sess_${Date.now().toString(36)}`;
        this.routePoints = this.parseRoutePointsFromCsv(csvText);
        this.logDebug('csv.import.routePoints.parsed', {
            sessionId: generatedSessionId,
            routePoints: this.routePoints.length,
            firstRoutePoint: this.routePoints[0] || null
        });
        const requestBody = { session_id: generatedSessionId, model_filename: this.modelFilename, csv_text: csvText };
        this.logDebug('csv.import.request', {
            url: `${this.apiBase()}/script`,
            sessionId: generatedSessionId,
            modelFilename: this.modelFilename,
            csvChars: csvText.length
        });
        const response = await fetch(`${this.apiBase()}/script`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorText = await response.text();
            this.logDebug('csv.import.response.error', {
                status: response.status,
                statusText: response.statusText,
                errorText
            });
            throw new Error(errorText);
        }
        const data = await response.json();
        this.logDebug('csv.import.response.ok', {
            sessionId: data.session_id || generatedSessionId,
            totalTasks: data.total_tasks ?? null,
            scriptQueue: data?.snapshot?.scriptQueue?.length ?? null,
            priorityQueue: data?.snapshot?.priorityQueue?.length ?? null
        });
        this.sessionId = String(data.session_id || generatedSessionId);
        this.sessionEl.textContent = this.sessionId;
        this.snapshot = data.snapshot || null;
        this.renderSnapshot();
        this.openEvents();
        this.appendTranscript('system', `CSV loaded. session_id=${this.sessionId}`);
    }

    private createDemoCsv() {
        const modelFilename = this.modelFilename || 'demo.ply';
        const live = this.options.getLiveCameraPose?.();
        const eye = live?.pose.eye || { x: 0, y: 1.65, z: 0 };
        const lines: string[] = [];
        lines.push(['version', 'seq', 'action', 'audio_mode', 'poi_id', 'poi_name', 'target_x', 'target_y', 'target_z', 'target_yaw', 'target_pitch', 'move_speed_mps', 'dwell_ms', 'content', 'audio_url', 'tts_lang', 'model_filename', 'eye_height_m'].join(','));
        const pois = [
            { id: 'poi_lobby', name: 'Lobby', x: eye.x, y: eye.y - 1.65, z: eye.z, yaw: 0, pitch: 0, content: '欢迎来到 OpenTour 巡游起点。' },
            { id: 'poi_hall', name: 'Hall', x: eye.x + 1.6, y: eye.y - 1.65, z: eye.z + 0.8, yaw: 35, pitch: -2, content: '现在来到主厅区域。' },
            { id: 'poi_focus', name: 'Focus Spot', x: eye.x + 2.5, y: eye.y - 1.65, z: eye.z - 0.5, yaw: -20, pitch: 2, content: '这里是当前模型的重点观察位。' }
        ];
        let seq = 1;
        pois.forEach((poi) => {
            lines.push(['v2', seq++, 'MOVE', 'INTERRUPTIBLE', poi.id, poi.name, poi.x.toFixed(3), poi.y.toFixed(3), poi.z.toFixed(3), poi.yaw.toFixed(2), poi.pitch.toFixed(2), '0.85', '900', '', '', 'zh-CN', modelFilename, '1.65'].map(csvEscape).join(','));
            lines.push(['v2', seq++, 'SPEAK', 'BLOCKING', poi.id, poi.name, poi.x.toFixed(3), poi.y.toFixed(3), poi.z.toFixed(3), poi.yaw.toFixed(2), poi.pitch.toFixed(2), '0.85', '1200', poi.content, '', 'zh-CN', modelFilename, '1.65'].map(csvEscape).join(','));
        });
        return lines.join('\n');
    }

    private applyTtsConfigInfo() {
        const modelMeta = TTS_MODEL_OPTIONS.find((option) => option.value === this.ttsConfig.model) || TTS_MODEL_OPTIONS[0];
        const voiceMeta = (TTS_VOICE_OPTIONS_BY_MODEL[this.ttsConfig.model] || []).find((option) => option.value === this.ttsConfig.voice) || null;
        const masked = this.ttsConfig.apiKey
            ? `${this.ttsConfig.apiKey.slice(0, 3)}***${this.ttsConfig.apiKey.slice(-3)}`
            : '(empty)';
        this.ttsInfoEl.innerHTML = `
            <div><strong>Provider:</strong> Alibaba DashScope</div>
            <div><strong>Model:</strong> ${modelMeta.label} (${this.ttsConfig.model}) - ${modelMeta.description}</div>
            <div><strong>Voice:</strong> ${voiceMeta ? `${voiceMeta.label} (${voiceMeta.value}) - ${voiceMeta.subtitle}` : this.ttsConfig.voice}</div>
            <div><strong>API Key:</strong> ${masked}</div>
            <div><strong>Updated:</strong> ${this.ttsConfig.updatedAt || '-'}</div>
        `;
    }

    private renderTtsVoiceOptions(modelValue: string, preferredVoice?: string) {
        const options = TTS_VOICE_OPTIONS_BY_MODEL[modelValue] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
        const groups = new Map<string, TtsVoiceOption[]>();
        options.forEach((option) => {
            const current = groups.get(option.group) || [];
            current.push(option);
            groups.set(option.group, current);
        });
        this.ttsVoiceInput.innerHTML = Array.from(groups.entries()).map(([group, values]) => {
            const items = values.map((option) => `<option value="${option.value}">${option.label} - ${option.subtitle} (${option.value})</option>`).join('');
            return `<optgroup label="${group}">${items}</optgroup>`;
        }).join('');
        const fallbackVoice = options.find((option) => option.value === DEFAULT_TTS_VOICE)?.value || options[0]?.value || DEFAULT_TTS_VOICE;
        const nextVoice = options.find((option) => option.value === preferredVoice)?.value || fallbackVoice;
        this.ttsVoiceInput.value = nextVoice;
    }

    private syncTtsConfigForm() {
        this.ttsModelInput.value = this.ttsConfig.model || DEFAULT_TTS_MODEL;
        this.renderTtsVoiceOptions(this.ttsModelInput.value, this.ttsConfig.voice || DEFAULT_TTS_VOICE);
        this.ttsApiKeyInput.value = this.ttsConfig.apiKey || '';
        this.ttsConfig.voice = this.ttsVoiceInput.value || DEFAULT_TTS_VOICE;
        this.applyTtsConfigInfo();
    }

    private async loadTtsConfig() {
        const response = await fetch(`${this.apiBase()}/tts-config`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        this.ttsConfig = {
            provider: 'aliyun',
            model: String(payload?.tts?.model || DEFAULT_TTS_MODEL),
            voice: String(payload?.tts?.voice || DEFAULT_TTS_VOICE),
            apiKey: String(payload?.tts?.apiKey || ''),
            format: String(payload?.tts?.format || 'mp3'),
            updatedAt: payload?.tts?.updatedAt ? String(payload.tts.updatedAt) : null
        };
        this.syncTtsConfigForm();
        this.logDebug('tts.config.load.ok', {
            model: this.ttsConfig.model,
            voice: this.ttsConfig.voice,
            apiKeyMasked: this.ttsConfig.apiKey ? `${this.ttsConfig.apiKey.slice(0, 3)}***${this.ttsConfig.apiKey.slice(-3)}` : '(empty)',
            updatedAt: this.ttsConfig.updatedAt,
            storage: payload?.storage || null
        });
    }

    private async saveTtsConfig() {
        const response = await fetch(`${this.apiBase()}/tts-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tts: {
                    model: this.ttsModelInput.value.trim() || DEFAULT_TTS_MODEL,
                    voice: this.ttsVoiceInput.value.trim() || DEFAULT_TTS_VOICE,
                    apiKey: this.ttsApiKeyInput.value.trim(),
                    format: 'mp3'
                }
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        this.ttsConfig = {
            provider: 'aliyun',
            model: String(payload?.tts?.model || DEFAULT_TTS_MODEL),
            voice: String(payload?.tts?.voice || DEFAULT_TTS_VOICE),
            apiKey: String(payload?.tts?.apiKey || ''),
            format: String(payload?.tts?.format || 'mp3'),
            updatedAt: payload?.tts?.updatedAt ? String(payload.tts.updatedAt) : null
        };
        this.syncTtsConfigForm();
        this.logDebug('tts.config.save.ok', {
            model: this.ttsConfig.model,
            voice: this.ttsConfig.voice,
            apiKeyMasked: this.ttsConfig.apiKey ? `${this.ttsConfig.apiKey.slice(0, 3)}***${this.ttsConfig.apiKey.slice(-3)}` : '(empty)',
            updatedAt: this.ttsConfig.updatedAt,
            storage: payload?.storage || null
        });
        this.setStatus('Alibaba TTS settings saved.');
    }

    private async openTtsModal() {
        try {
            await this.loadTtsConfig();
        } catch (error) {
            this.logDebug('tts.config.load.error', { error: error instanceof Error ? error.message : String(error) });
            this.setStatus(`Load TTS config failed: ${String(error)}`);
        }
        this.ttsModalEl.classList.remove('hidden');
    }

    private closeTtsModal() {
        this.ttsModalEl.classList.add('hidden');
    }

    private async waitWhilePausedOrStopped() {
        while (this.paused && !this.stopRequested) {
            await sleep(80);
        }
    }

    private cameraPoseFromTask(task: QueueDispatchTask): CameraPose {
        const yaw = ((task.look?.yaw ?? 0) * Math.PI) / 180;
        const pitch = ((task.look?.pitch ?? 0) * Math.PI) / 180;
        return {
            eye: { x: task.coordinates.x, y: task.coordinates.y + 1.65, z: task.coordinates.z },
            forward: { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
        };
    }

    private logTtsDebug(stage: string, detail: Record<string, unknown>) {
        const text = `[TTS] ${stage} ${JSON.stringify(detail)}`;
        this.appendTranscript('system', text);
        console.debug(text);
    }

    private logDebug(action: string, detail?: unknown) {
        const time = new Date().toLocaleTimeString();
        const suffix = detail === undefined ? '' : ` ${safeJson(detail, 4000)}`;
        const line = `[${time}] [OT_TourPlayer] ${action}${suffix}`;
        const body = document.querySelector('#otw-debug [data-debug="body"]') as HTMLDivElement | null;
        if (body) {
            const row = document.createElement('div');
            row.className = 'otw-debug-row';
            row.innerHTML = `<span class="otw-debug-time">[${time}]</span><strong>[OT_TourPlayer]</strong> ${action}${suffix}`;
            body.appendChild(row);
            body.scrollTop = body.scrollHeight;
        }
        console.debug(line);
    }

    private refreshRecordingButtons() {
        const recording = Boolean(this.activeRecording);
        const paused = Boolean(this.activeRecording?.paused);
        this.recordButtons.forEach((button, index) => {
            const variant = index === 0 ? 'A' : 'B';
            button.classList.toggle('recording', recording && this.recordingSettings.selectedVariant === variant);
            button.classList.toggle('hidden', recording);
            const label = button.querySelector('.otp-record-label') as HTMLSpanElement | null;
            if (label) {
                label.textContent = variant === 'A'
                    ? (recording ? 'REC' : 'Rec')
                    : 'REC';
            }
            button.title = recording ? 'Stop and save recording' : `Open recording setup (${variant})`;
        });
        this.recordPauseBtn.classList.toggle('hidden', !recording);
        this.recordStopBtn.classList.toggle('hidden', !recording);
        (this.recordPauseBtn.querySelector('.otp-record-label') as HTMLSpanElement).textContent = paused ? 'Resume' : 'Pause';
        this.recordTimerEl.textContent = recording ? (paused ? 'PAUSED' : 'REC 00:00') : '';
    }

    private updateRecordingTimer() {
        if (!this.activeRecording) {
            this.recordTimerEl.textContent = '';
            return;
        }
        if (this.activeRecording.paused) {
            this.recordTimerEl.textContent = 'PAUSED';
            return;
        }
        const elapsedMs = Math.max(0, performance.now() - this.activeRecording.startedAt);
        const totalSec = Math.floor(elapsedMs / 1000);
        const minutes = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const seconds = (totalSec % 60).toString().padStart(2, '0');
        this.recordTimerEl.textContent = `REC ${minutes}:${seconds}`;
    }

    private startRecordingTimer() {
        this.stopRecordingTimer();
        this.updateRecordingTimer();
        this.recordTimerId = window.setInterval(() => this.updateRecordingTimer(), 250);
    }

    private stopRecordingTimer() {
        if (this.recordTimerId) {
            window.clearInterval(this.recordTimerId);
            this.recordTimerId = 0;
        }
        this.updateRecordingTimer();
    }

    private setRecordingModalStatus(text: string) {
        this.recordingModalStatusEl.textContent = text;
    }

    private syncRecordingForm() {
        this.recordingFrameRateSelect.value = String(this.recordingSettings.frameRate);
        this.recordingQualitySelect.value = this.recordingSettings.videoBitsPerSecond >= 40_000_000 ? 'ultra' : this.recordingSettings.videoBitsPerSecond >= 28_000_000 ? 'high' : 'standard';
        this.recordingCompressionSelect.value = this.recordingSettings.mp4CompressionPreset;
        this.recordingIncludeTtsInput.checked = this.recordingSettings.includeTts;
        this.recordingIncludeMusicInput.checked = this.recordingSettings.includeMusic;
        this.recordingAutoPlayInput.checked = this.recordingSettings.autoPlay;
        this.recordingStopWithPlaybackInput.checked = this.recordingSettings.stopWithPlayback;
        this.recordingHidePanelInput.checked = this.recordingSettings.hidePanelDuringRecording;
        this.recordingDisableInterruptsInput.checked = this.recordingSettings.disableInterrupts;
        this.recordingMusicLoopInput.checked = this.recordingSettings.musicLoop;
        this.recordingMasterVolumeInput.value = String(Math.round(this.recordingSettings.masterVolume * 100));
        this.recordingTtsVolumeInput.value = String(Math.round(this.recordingSettings.ttsVolume * 100));
        this.recordingMusicVolumeInput.value = String(Math.round(this.recordingSettings.musicVolume * 100));
        this.recordingSubtitlesEnabledInput.checked = this.recordingSettings.subtitlesEnabled;
        this.recordingSubtitleFontSelect.value = this.recordingSettings.subtitleFont;
        this.recordingSubtitleSizeInput.value = String(this.recordingSettings.subtitleFontSize);
        this.recordingSubtitleColorInput.value = this.recordingSettings.subtitleColor;
        this.recordingMasterVolumeOut.textContent = `${this.recordingMasterVolumeInput.value}%`;
        this.recordingTtsVolumeOut.textContent = `${this.recordingTtsVolumeInput.value}%`;
        this.recordingMusicVolumeOut.textContent = `${this.recordingMusicVolumeInput.value}%`;
        this.recordingSubtitleSizeOut.textContent = `${this.recordingSubtitleSizeInput.value}px`;
    }

    private collectRecordingSettings(variant: RecordingButtonVariant): RecordingSettings {
        const quality = this.recordingQualitySelect.value;
        const videoBitsPerSecond = quality === 'ultra' ? 40_000_000 : quality === 'high' ? 28_000_000 : 18_000_000;
        return {
            frameRate: Math.max(24, Number(this.recordingFrameRateSelect.value || '30')),
            videoBitsPerSecond,
            audioBitsPerSecond: 256_000,
            mp4CompressionPreset: (this.recordingCompressionSelect.value || 'balanced') as Mp4CompressionPreset,
            includeTts: this.recordingIncludeTtsInput.checked,
            includeMusic: this.recordingIncludeMusicInput.checked,
            autoPlay: this.recordingAutoPlayInput.checked,
            stopWithPlayback: this.recordingStopWithPlaybackInput.checked,
            musicLoop: this.recordingMusicLoopInput.checked,
            hidePanelDuringRecording: this.recordingHidePanelInput.checked,
            disableInterrupts: this.recordingDisableInterruptsInput.checked,
            masterVolume: Math.max(0, Math.min(1, Number(this.recordingMasterVolumeInput.value || '100') / 100)),
            ttsVolume: Math.max(0, Math.min(1, Number(this.recordingTtsVolumeInput.value || '100') / 100)),
            musicVolume: Math.max(0, Math.min(1, Number(this.recordingMusicVolumeInput.value || '35') / 100)),
            subtitlesEnabled: this.recordingSubtitlesEnabledInput.checked,
            subtitleFont: this.recordingSubtitleFontSelect.value || 'PingFang SC',
            subtitleFontSize: Math.max(24, Math.min(64, Number(this.recordingSubtitleSizeInput.value || '26'))),
            subtitleColor: this.recordingSubtitleColorInput.value || '#d7a733',
            selectedVariant: variant
        };
    }

    private openRecordingModal(variant: RecordingButtonVariant) {
        this.recordingSettings.selectedVariant = variant;
        this.syncRecordingForm();
        this.renderRecordingPlaylist();
        this.closeRecordingConfigPopovers();
        this.setRecordingModalStatus('Ready to record.');
        this.recordingModalEl.classList.remove('hidden');
        this.logDebug('record.ui.open', { variant, playlistCount: this.recordingPlaylist.length });
    }

    private closeRecordingConfigPopovers() {
        this.recordingModalEl.querySelectorAll('[data-record-popover]').forEach((element) => {
            element.classList.remove('open');
        });
    }

    private closeRecordingModal() {
        this.closeRecordingConfigPopovers();
        this.recordingModalEl.classList.add('hidden');
        if (!this.activeRecording) this.stopPreviewPlayback();
    }

    private async getAudioDurationSec(file: File) {
        const url = URL.createObjectURL(file);
        try {
            const audio = document.createElement('audio');
            audio.preload = 'metadata';
            const duration = await new Promise<number>((resolve) => {
                const cleanup = () => {
                    audio.removeAttribute('src');
                    audio.load();
                };
                audio.onloadedmetadata = () => {
                    const value = Number.isFinite(audio.duration) ? audio.duration : 0;
                    cleanup();
                    resolve(value);
                };
                audio.onerror = () => {
                    cleanup();
                    resolve(0);
                };
                audio.src = url;
            });
            return duration;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private async addAudioFiles(files: FileList | File[], source: 'folder' | 'files') {
        const incoming = Array.from(files || []).filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name));
        if (incoming.length < 1) {
            this.setRecordingModalStatus('No supported audio files found.');
            return;
        }
        this.setRecordingModalStatus('Reading playlist metadata...');
        const next: RecordingAudioItem[] = [];
        for (const file of incoming.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) {
            next.push({
                id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                file,
                url: URL.createObjectURL(file),
                durationSec: await this.getAudioDurationSec(file)
            });
        }
        this.recordingPlaylist.push(...next);
        this.renderRecordingPlaylist();
        this.setRecordingModalStatus(`${next.length} audio file(s) added.`);
        this.logDebug(source === 'folder' ? 'record.playlist.folder.selected' : 'record.playlist.files.added', {
            added: next.length,
            total: this.recordingPlaylist.length,
            names: next.slice(0, 12).map((item) => item.name)
        });
    }

    private clearRecordingPlaylist() {
        this.stopPreviewPlayback();
        this.recordingPlaylist.forEach((item) => URL.revokeObjectURL(item.url));
        this.recordingPlaylist = [];
        this.renderRecordingPlaylist();
        this.setRecordingModalStatus('Playlist cleared.');
        this.logDebug('record.playlist.cleared');
    }

    private renderRecordingPlaylist() {
        this.recordingPlaylistEl.innerHTML = '';
        this.recordingEmptyEl.classList.toggle('hidden', this.recordingPlaylist.length > 0);
        this.recordingPlaylist.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'otp-playlist-item';
            const min = Math.floor(item.durationSec / 60).toString().padStart(2, '0');
            const sec = Math.floor(item.durationSec % 60).toString().padStart(2, '0');
            const previewLabel = this.previewTrackId === item.id && this.previewAudioEl && !this.previewAudioEl.paused ? 'II' : '>';
            const previewPlaying = this.previewTrackId === item.id && this.previewAudioEl && !this.previewAudioEl.paused;
            row.innerHTML = `
                <button class="otp-playlist-preview${previewPlaying ? ' playing' : ''}" type="button" title="Preview track">${previewLabel}</button>
                <div>
                    <div>${item.name}</div>
                    <div class="otp-playlist-meta">${min}:${sec} | ${(item.file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <button class="otp-playlist-remove" type="button" title="Remove">×</button>
            `;
            const previewBtn = row.querySelector('.otp-playlist-preview') as HTMLButtonElement;
            const removeBtn = row.querySelector('.otp-playlist-remove') as HTMLButtonElement;
            previewBtn.addEventListener('click', () => {
                void this.togglePreviewPlayback(item.id);
            });
            removeBtn.addEventListener('click', () => {
                if (this.previewTrackId === item.id) {
                    this.stopPreviewPlayback();
                }
                URL.revokeObjectURL(item.url);
                this.recordingPlaylist = this.recordingPlaylist.filter((entry) => entry.id !== item.id);
                this.renderRecordingPlaylist();
                this.logDebug('record.playlist.removed', { name: item.name, total: this.recordingPlaylist.length });
            });
            this.recordingPlaylistEl.appendChild(row);
        });
    }

    private stopPreviewPlayback() {
        if (this.previewAudioEl) {
            this.previewAudioEl.pause();
            this.previewAudioEl.currentTime = 0;
            this.previewAudioEl.src = '';
            this.previewAudioEl.load();
            this.previewAudioEl = null;
        }
        this.previewTrackId = null;
        this.renderRecordingPlaylist();
    }

    private async togglePreviewPlayback(trackId: string) {
        const item = this.recordingPlaylist.find((entry) => entry.id === trackId);
        if (!item) return;

        if (this.previewTrackId === trackId && this.previewAudioEl) {
            if (this.previewAudioEl.paused) {
                try {
                    await this.previewAudioEl.play();
                    this.logDebug('record.playlist.preview.resume', { name: item.name });
                } catch (error) {
                    this.logDebug('record.playlist.preview.error', { name: item.name, error: error instanceof Error ? error.message : String(error) });
                }
            } else {
                this.previewAudioEl.pause();
                this.logDebug('record.playlist.preview.pause', { name: item.name });
            }
            this.renderRecordingPlaylist();
            return;
        }

        if (this.previewAudioEl) {
            this.previewAudioEl.pause();
            this.previewAudioEl.currentTime = 0;
        }

        const audio = this.previewAudioEl ?? new Audio();
        audio.preload = 'auto';
        audio.src = item.url;
        audio.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.musicVolume));
        audio.onended = () => {
            this.previewTrackId = null;
            this.renderRecordingPlaylist();
            this.logDebug('record.playlist.preview.ended', { name: item.name });
        };
        this.previewAudioEl = audio;
        this.previewTrackId = trackId;
        try {
            await audio.play();
            this.setRecordingModalStatus(`Previewing ${item.name}`);
            this.logDebug('record.playlist.preview.start', { name: item.name, durationSec: item.durationSec });
        } catch (error) {
            this.previewTrackId = null;
            this.logDebug('record.playlist.preview.error', { name: item.name, error: error instanceof Error ? error.message : String(error) });
        }
        this.renderRecordingPlaylist();
    }

    private stopMusicPlayback() {
        if (!this.musicAudioEl) return;
        this.musicAudioEl.pause();
        this.musicAudioEl.currentTime = 0;
        this.musicAudioEl.src = '';
        this.musicAudioEl.load();
        this.musicAudioEl = null;
        this.musicIndex = 0;
    }

    private applyMusicVolume() {
        if (!this.musicAudioEl) return;
        this.musicAudioEl.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.musicVolume));
    }

    private applyPreviewVolume() {
        if (!this.previewAudioEl) return;
        this.previewAudioEl.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.musicVolume));
    }

    private applyTtsVolume() {
        if (!this.ttsAudioEl) return;
        this.ttsAudioEl.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.ttsVolume));
    }

    private stopTtsPlayback() {
        const done = this.ttsPlaybackDone;
        this.ttsPlaybackDone = null;
        if (this.ttsAudioEl) {
            this.ttsAudioEl.pause();
            this.ttsAudioEl.currentTime = 0;
            this.ttsAudioEl.src = '';
            this.ttsAudioEl.load();
            this.ttsAudioEl = null;
        }
        done?.();
    }

    private pauseTtsPlayback() {
        this.ttsAudioEl?.pause();
    }

    private resumeTtsPlayback() {
        if (!this.ttsAudioEl) return;
        void this.ttsAudioEl.play().catch(() => {
            // ignore autoplay resume failure
        });
    }

    private async playAudioUrl(task: QueueDispatchTask, token: number) {
        const audioUrl = String(task.content?.audio_url || '').trim();
        if (!audioUrl) return false;
        this.logDebug('tts.audio.play.request', {
            taskId: task.task_id,
            taskType: task.type,
            audioUrlKind: audioUrl.startsWith('data:') ? 'data-url' : 'remote-url',
            audioUrlLength: audioUrl.length,
            ttsDebug: task.tts_debug || null
        });
        this.stopTtsPlayback();
        const audio = new Audio();
        this.ttsAudioEl = audio;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audio.src = audioUrl;
        this.applyTtsVolume();
        this.logDebug('tts.audio.play.start', {
            taskId: task.task_id,
            model: this.ttsConfig.model,
            voice: this.ttsConfig.voice,
            volume: audio.volume,
            ttsDebug: task.tts_debug || null
        });

        await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (this.ttsPlaybackDone === finish) this.ttsPlaybackDone = null;
                if (this.ttsAudioEl === audio) this.ttsAudioEl = null;
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
                audio.load();
                this.logDebug('tts.audio.play.end', {
                    taskId: task.task_id,
                    model: this.ttsConfig.model,
                    voice: this.ttsConfig.voice,
                    ttsDebug: task.tts_debug || null
                });
                resolve();
            };

            this.ttsPlaybackDone = finish;
            audio.onended = finish;
            audio.onerror = () => {
                this.logDebug('tts.audio.play.error', {
                    taskId: task.task_id,
                    code: audio.error?.code || null,
                    message: audio.error?.message || 'audio-element-error',
                    ttsDebug: task.tts_debug || null
                });
                finish();
            };
            void audio.play().then(() => {
                this.logDebug('tts.audio.play.started', {
                    taskId: task.task_id,
                    volume: audio.volume,
                    ttsDebug: task.tts_debug || null
                });
            }).catch((error) => {
                this.logDebug('tts.audio.play.rejected', {
                    taskId: task.task_id,
                    error: error instanceof Error ? error.message : String(error),
                    ttsDebug: task.tts_debug || null
                });
                finish();
            });

            const guard = window.setInterval(() => {
                if (this.stopRequested || token !== this.playbackToken) {
                    window.clearInterval(guard);
                    this.stopTtsPlayback();
                    return;
                }
                if (settled) window.clearInterval(guard);
            }, 70);
        });

        return true;
    }

    private resolveTtsLang(requested: string | null, text: string) {
        const normalized = String(requested || '').trim();
        if (normalized) {
            return { effective: normalized, reason: 'task' };
        }
        const hasChinese = /[\u3400-\u9fff]/.test(text);
        return {
            effective: hasChinese ? 'zh-CN' : 'en-US',
            reason: hasChinese ? 'text-detected-chinese' : 'default-en'
        };
    }

    private async resolveVoices() {
        if (!('speechSynthesis' in window)) return [] as SpeechSynthesisVoice[];
        const synth = window.speechSynthesis;
        let voices = synth.getVoices();
        if (voices.length > 0) return voices;
        await new Promise<void>((resolve) => {
            const timer = window.setTimeout(() => {
                synth.removeEventListener('voiceschanged', onChanged);
                resolve();
            }, 400);
            const onChanged = () => {
                window.clearTimeout(timer);
                synth.removeEventListener('voiceschanged', onChanged);
                resolve();
            };
            synth.addEventListener('voiceschanged', onChanged);
        });
        voices = synth.getVoices();
        return voices;
    }

    private pickVoice(voices: SpeechSynthesisVoice[], lang: string) {
        if (voices.length < 1) return null;
        const exact = voices.find((voice) => voice.lang === lang);
        if (exact) return exact;
        const base = lang.split('-')[0]?.toLowerCase() || '';
        const partial = voices.find((voice) => voice.lang.toLowerCase().startsWith(base));
        return partial || voices[0] || null;
    }

    private startMusicPlayback() {
        if (!this.recordingSettings.includeMusic || this.recordingPlaylist.length < 1) return;
        this.stopMusicPlayback();
        this.musicAudioEl = new Audio();
        this.musicAudioEl.preload = 'auto';
        this.musicAudioEl.crossOrigin = 'anonymous';
        this.applyMusicVolume();
        this.musicAudioEl.addEventListener('ended', () => {
            if (this.recordingPlaylist.length < 1) return;
            if (this.musicIndex >= this.recordingPlaylist.length - 1) {
                if (!this.recordingSettings.musicLoop) return;
                this.musicIndex = 0;
            } else {
                this.musicIndex += 1;
            }
            const next = this.recordingPlaylist[this.musicIndex];
            if (!next) return;
            this.musicAudioEl!.src = next.url;
            void this.musicAudioEl!.play().catch((error) => {
                this.logDebug('record.audio.music.play.error', { error: error instanceof Error ? error.message : String(error), name: next.name });
            });
        });
        const first = this.recordingPlaylist[0];
        this.musicIndex = 0;
        this.musicAudioEl.src = first.url;
        void this.musicAudioEl.play().then(() => {
            this.logDebug('record.audio.music.play.start', { name: first.name, playlistCount: this.recordingPlaylist.length });
        }).catch((error) => {
            this.logDebug('record.audio.music.play.error', { error: error instanceof Error ? error.message : String(error), name: first.name });
        });
    }

    private pauseMusicPlayback() {
        this.musicAudioEl?.pause();
    }

    private resumeMusicPlayback() {
        if (!this.musicAudioEl || !this.recordingSettings.includeMusic) return;
        void this.musicAudioEl.play().catch(() => {
            // ignore autoplay resumption failure
        });
    }

    private startRecordingCompositor(sourceCanvas: HTMLCanvasElement) {
        this.stopRecordingCompositor();
        const canvas = document.createElement('canvas');
        canvas.width = sourceCanvas.width || sourceCanvas.clientWidth || 1920;
        canvas.height = sourceCanvas.height || sourceCanvas.clientHeight || 1080;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create recording compositor context.');
        this.recordingCompositorCanvas = canvas;
        this.recordingCompositorCtx = ctx;

        const draw = () => {
            if (!this.recordingCompositorCanvas || !this.recordingCompositorCtx) return;
            this.options.requestCaptureRender?.();
            const target = this.recordingCompositorCanvas;
            const targetCtx = this.recordingCompositorCtx;
            targetCtx.clearRect(0, 0, target.width, target.height);
            targetCtx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
            if (this.recordingSettings.subtitlesEnabled && this.recordingSubtitleText.trim()) {
                const lines = this.wrapSubtitleText(this.recordingSubtitleText.trim(), target.width * 0.76);
                const fontSize = this.recordingSettings.subtitleFontSize;
                const lineHeight = Math.round(fontSize * 1.34);
                const padX = Math.round(fontSize * 0.68);
                const padY = Math.round(fontSize * 0.34);
                targetCtx.font = `600 ${fontSize}px "${this.recordingSettings.subtitleFont}", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`;
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                const textWidth = Math.max(...lines.map((line) => targetCtx.measureText(line).width), 0);
                const boxWidth = Math.min(target.width * 0.86, textWidth + padX * 2);
                const boxHeight = lineHeight * lines.length + padY * 2;
                const x = (target.width - boxWidth) / 2;
                const y = target.height - boxHeight - Math.round(target.height * 0.055);
                this.drawRoundedRect(targetCtx, x, y, boxWidth, boxHeight, Math.round(fontSize * 0.38));
                targetCtx.fillStyle = 'rgba(0, 0, 0, 0.52)';
                targetCtx.fill();
                targetCtx.fillStyle = this.recordingSettings.subtitleColor;
                lines.forEach((line, index) => {
                    targetCtx.fillText(line, target.width / 2, y + padY + lineHeight * index + lineHeight / 2);
                });
            }
            this.recordingCompositorRaf = window.requestAnimationFrame(draw);
        };
        draw();
    }

    private stopRecordingCompositor() {
        if (this.recordingCompositorRaf) {
            window.cancelAnimationFrame(this.recordingCompositorRaf);
            this.recordingCompositorRaf = 0;
        }
        this.recordingCompositorCanvas = null;
        this.recordingCompositorCtx = null;
        this.recordingSubtitleText = '';
    }

    private toggleRecordingPause() {
        const runtime = this.activeRecording;
        if (!runtime) return;
        if (runtime.paused) {
            runtime.recorder.resume();
            runtime.paused = false;
            if (this.playing && this.paused) this.playBtn.click();
            this.resumeMusicPlayback();
            this.resumeTtsPlayback();
            this.setStatus('Recording resumed.');
        } else {
            runtime.recorder.pause();
            runtime.paused = true;
            if (this.playing && !this.paused) this.playBtn.click();
            this.pauseMusicPlayback();
            this.pauseTtsPlayback();
            this.setStatus('Recording paused.');
        }
        this.refreshRecordingButtons();
        this.updateRecordingTimer();
    }

    private wrapSubtitleText(text: string, maxWidth: number) {
        const ctx = this.recordingCompositorCtx;
        if (!ctx) return [text];
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length < 2) {
            const chars = Array.from(text);
            const lines: string[] = [];
            let current = '';
            chars.forEach((char) => {
                const next = `${current}${char}`;
                if (ctx.measureText(next).width <= maxWidth || !current) current = next;
                else {
                    lines.push(current);
                    current = char;
                }
            });
            if (current) lines.push(current);
            return lines;
        }
        const lines: string[] = [];
        let current = '';
        words.forEach((word) => {
            const next = current ? `${current} ${word}` : word;
            if (ctx.measureText(next).width <= maxWidth || !current) {
                current = next;
            } else {
                lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines;
    }

    private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    private formatEta(seconds: number | null | undefined) {
        if (!Number.isFinite(seconds ?? NaN) || (seconds ?? 0) < 0) return '--:--';
        const total = Math.max(0, Math.round(seconds || 0));
        const mins = Math.floor(total / 60).toString().padStart(2, '0');
        const secs = Math.floor(total % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    private formatHeartbeatAge(timestamp: number | null | undefined) {
        if (!timestamp) return 'waiting';
        const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        return `${seconds}s ago`;
    }

    private buildProcessingNote(entry: StoredRecordingEntry) {
        const percent = Math.max(0, Math.min(100, Number(entry.transcodePercent) || 0));
        const eta = this.formatEta(entry.transcodeEtaSec);
        const heartbeat = this.formatHeartbeatAge(entry.transcodeHeartbeatAt);
        return `MP4 ${percent.toFixed(0)}% · ETA ${eta} · heartbeat ${heartbeat}`;
    }

    private async createTranscodeJob(blob: Blob, settings: RecordingSettings, width: number, height: number, durationSec: number) {
        const transcodeMeta = {
            frameRate: settings.frameRate,
            width,
            height,
            durationSec,
            compressionPreset: settings.mp4CompressionPreset,
            videoBitsPerSecond: settings.videoBitsPerSecond,
            audioBitsPerSecond: settings.audioBitsPerSecond
        };
        this.logDebug('record.transcode.job.start', { sourceBytes: blob.size, ...transcodeMeta, mode: 'backend-ffmpeg-job' });
        const response = await fetch(`${this.apiBase()}/transcode/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-OT-TP-Meta': btoa(unescape(encodeURIComponent(JSON.stringify(transcodeMeta))))
            },
            body: blob
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = await response.json();
        return payload?.job as {
            jobId: string;
            progress?: { percent?: number; etaSec?: number | null; heartbeatAt?: string; phase?: string; speed?: number };
        };
    }

    private async fetchTranscodeJob(jobId: string) {
        const response = await fetch(`${this.apiBase()}/transcode/jobs/${encodeURIComponent(jobId)}`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = await response.json();
        return payload?.job as {
            status: 'pending' | 'running' | 'done' | 'error';
            progress?: { percent?: number; etaSec?: number | null; heartbeatAt?: string; phase?: string; speed?: number; elapsedSec?: number };
            sourceBytes?: number;
            targetBytes?: number;
            error?: { message?: string } | null;
        };
    }

    private async fetchTranscodeJobResult(jobId: string) {
        const response = await fetch(`${this.apiBase()}/transcode/jobs/${encodeURIComponent(jobId)}/result`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const mp4Blob = await response.blob();
        const rawMeta = response.headers.get('x-ot-tp-transcode-meta');
        let backendMeta: Record<string, unknown> | null = null;
        if (rawMeta) {
            try {
                backendMeta = JSON.parse(decodeURIComponent(escape(atob(rawMeta))));
            } catch {
                backendMeta = null;
            }
        }
        return { mp4Blob, backendMeta };
    }

    private async transcodeRecordingEntry(entry: StoredRecordingEntry, settings: RecordingSettings, width: number, height: number) {
        this.setRecordingModalStatus('Uploading WebM to local backend for MP4 transcoding...');
        const createdJob = await this.createTranscodeJob(entry.blob, settings, width, height, entry.durationSec);
        await this.updateRecordingResult({
            ...entry,
            transcodeJobId: createdJob.jobId,
            transcodePercent: Number(createdJob.progress?.percent) || 0,
            transcodeEtaSec: createdJob.progress?.etaSec ?? null,
            transcodeHeartbeatAt: createdJob.progress?.heartbeatAt ? Date.parse(createdJob.progress.heartbeatAt) : Date.now(),
            transcodePhase: createdJob.progress?.phase || 'queued',
            note: this.buildProcessingNote({
                ...entry,
                transcodePercent: Number(createdJob.progress?.percent) || 0,
                transcodeEtaSec: createdJob.progress?.etaSec ?? null,
                transcodeHeartbeatAt: createdJob.progress?.heartbeatAt ? Date.parse(createdJob.progress.heartbeatAt) : Date.now()
            })
        });

        while (true) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            const job = await this.fetchTranscodeJob(createdJob.jobId);
            const heartbeatAt = job.progress?.heartbeatAt ? Date.parse(job.progress.heartbeatAt) : Date.now();
            const progressEntry: StoredRecordingEntry = {
                ...entry,
                transcodeJobId: createdJob.jobId,
                transcodePercent: Number(job.progress?.percent) || 0,
                transcodeEtaSec: job.progress?.etaSec ?? null,
                transcodeHeartbeatAt: heartbeatAt,
                transcodePhase: job.progress?.phase || job.status,
                note: this.buildProcessingNote({
                    ...entry,
                    transcodePercent: Number(job.progress?.percent) || 0,
                    transcodeEtaSec: job.progress?.etaSec ?? null,
                    transcodeHeartbeatAt: heartbeatAt
                })
            };
            await this.updateRecordingResult(progressEntry);
            this.logDebug('record.transcode.heartbeat', {
                id: entry.id,
                jobId: createdJob.jobId,
                status: job.status,
                percent: progressEntry.transcodePercent,
                etaSec: progressEntry.transcodeEtaSec,
                heartbeatAt: job.progress?.heartbeatAt || null,
                phase: progressEntry.transcodePhase || null,
                speed: job.progress?.speed || 0
            });
            this.setRecordingModalStatus(`MP4 transcoding ${Math.round(progressEntry.transcodePercent || 0)}% (ETA ${this.formatEta(progressEntry.transcodeEtaSec)})...`);
            if (job.status === 'done') {
                const { mp4Blob, backendMeta } = await this.fetchTranscodeJobResult(createdJob.jobId);
                this.logDebug('record.transcode.done', { sourceBytes: entry.size, targetBytes: mp4Blob.size, mimeType: mp4Blob.type || 'video/mp4', backend: backendMeta });
                return { mp4Blob, jobId: createdJob.jobId };
            }
            if (job.status === 'error') {
                throw new Error(job.error?.message || 'MP4 transcode job failed');
            }
        }
    }

    private openRecordingDb() {
        if (this.recordingDbPromise) return this.recordingDbPromise;
        this.recordingDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('ot-tour-player-recordings', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('recordings')) {
                    db.createObjectStore('recordings', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open recordings database'));
        });
        return this.recordingDbPromise;
    }

    private async loadRecordingResults() {
        try {
            const db = await this.openRecordingDb();
            const results = await new Promise<StoredRecordingEntry[]>((resolve, reject) => {
                const tx = db.transaction('recordings', 'readonly');
                const store = tx.objectStore('recordings');
                const request = store.getAll();
                request.onsuccess = () => resolve((request.result || []) as StoredRecordingEntry[]);
                request.onerror = () => reject(request.error || new Error('Failed to read recordings'));
            });
            this.recordingResults = results.map((item) => ({
                ...item,
                status: item.status || (item.extension === 'mp4' ? 'ready' : 'mp4_failed'),
                transcodeJobId: item.transcodeJobId || undefined,
                transcodePercent: Number(item.transcodePercent) || 0,
                transcodeEtaSec: item.transcodeEtaSec ?? null,
                transcodeHeartbeatAt: item.transcodeHeartbeatAt ?? null,
                transcodePhase: item.transcodePhase || undefined,
                note: item.note || undefined
            })).sort((a, b) => b.createdAt - a.createdAt);
            this.renderRecordingResults();
            this.logDebug('record.gallery.loaded', { count: this.recordingResults.length });
            void this.recoverProcessingRecordingEntries();
        } catch (error) {
            this.logDebug('record.gallery.load.error', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    private async recoverProcessingRecordingEntries() {
        const pending = this.recordingResults.filter((item) => item.status === 'processing' && !this.recoveringRecordingIds.has(item.id));
        for (const entry of pending) {
            this.recoveringRecordingIds.add(entry.id);
            try {
                this.logDebug('record.gallery.recovery.start', {
                    id: entry.id,
                    name: entry.name,
                    bytes: entry.size,
                    mimeType: entry.mimeType
                });
                await this.updateRecordingResult({
                    ...entry,
                    note: this.buildProcessingNote(entry)
                });
                const recoveredSettings: RecordingSettings = {
                    ...this.recordingSettings,
                    frameRate: 30,
                    videoBitsPerSecond: 18_000_000,
                    audioBitsPerSecond: 256_000
                };
                const { mp4Blob, jobId } = await this.transcodeRecordingEntry(entry, recoveredSettings, entry.width || 1920, entry.height || 1080);
                const mp4Meta = await this.captureRecordingThumbnail(mp4Blob);
                await this.updateRecordingResult({
                    ...entry,
                    name: entry.name.replace(/\.[^.]+$/, '.mp4'),
                    status: 'ready',
                    transcodeJobId: jobId,
                    transcodePercent: 100,
                    transcodeEtaSec: 0,
                    transcodeHeartbeatAt: Date.now(),
                    transcodePhase: 'done',
                    mimeType: 'video/mp4',
                    extension: 'mp4',
                    size: mp4Blob.size,
                    durationSec: mp4Meta.durationSec,
                    width: mp4Meta.width,
                    height: mp4Meta.height,
                    thumbnailDataUrl: mp4Meta.thumbnailDataUrl,
                    note: undefined,
                    blob: mp4Blob
                });
                await this.registerMp4ToTourProducer(entry.name.replace(/\.[^.]+$/, '.mp4'), mp4Blob);
                this.logDebug('record.gallery.recovery.done', {
                    id: entry.id,
                    name: entry.name.replace(/\.[^.]+$/, '.mp4'),
                    sourceBytes: entry.size,
                    targetBytes: mp4Blob.size
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.updateRecordingResult({
                    ...entry,
                    status: 'mp4_failed',
                    transcodePhase: 'error',
                    note: `Recovered transcode failed: ${message}`
                });
                this.logDebug('record.gallery.recovery.error', {
                    id: entry.id,
                    name: entry.name,
                    error: message
                });
            } finally {
                this.recoveringRecordingIds.delete(entry.id);
            }
        }
    }

    private async storeRecordingResult(entry: StoredRecordingEntry) {
        const db = await this.openRecordingDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to store recording'));
        });
    }

    private renderRecordingMeta(entry: StoredRecordingEntry) {
        const durationMin = Math.floor(entry.durationSec / 60).toString().padStart(2, '0');
        const durationSec = Math.floor(entry.durationSec % 60).toString().padStart(2, '0');
        const createdAt = new Date(entry.createdAt);
        const stamp = `${createdAt.getMonth() + 1}/${createdAt.getDate()} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
        return `${durationMin}:${durationSec} | ${entry.width}x${entry.height} | ${(entry.size / 1024 / 1024).toFixed(1)} MB | ${stamp}${entry.note ? ` | ${entry.note}` : ''}`;
    }

    private renderRecordingStatus(entry: StoredRecordingEntry) {
        const label = entry.status === 'ready'
            ? 'MP4 Ready'
            : entry.status === 'processing'
                ? `Processing MP4 ${Math.round(entry.transcodePercent || 0)}%`
                : 'WebM Fallback';
        const className = entry.status === 'ready'
            ? 'otp-record-status'
            : entry.status === 'processing'
                ? 'otp-record-status processing'
                : 'otp-record-status warn';
        return { label, className };
    }

    private patchRecordingCard(entry: StoredRecordingEntry) {
        const card = this.recordingResultsEl.querySelector(`[data-record-id="${entry.id}"]`) as HTMLDivElement | null;
        if (!card) return false;
        const statusEl = card.querySelector('[data-record-role="status"]') as HTMLDivElement | null;
        const nameEl = card.querySelector('[data-record-role="name"]') as HTMLDivElement | null;
        const metaEl = card.querySelector('[data-record-role="meta"]') as HTMLDivElement | null;
        const videoEl = card.querySelector('video') as HTMLVideoElement | null;
        const status = this.renderRecordingStatus(entry);
        if (statusEl) {
            statusEl.className = status.className;
            statusEl.textContent = status.label;
        }
        if (nameEl) nameEl.textContent = entry.name;
        if (metaEl) metaEl.innerHTML = this.renderRecordingMeta(entry);
        if (videoEl) videoEl.poster = entry.thumbnailDataUrl;
        return true;
    }

    private async updateRecordingResult(entry: StoredRecordingEntry) {
        const previous = this.recordingResults.find((item) => item.id === entry.id) || null;
        await this.storeRecordingResult(entry);
        const index = this.recordingResults.findIndex((item) => item.id === entry.id);
        if (index >= 0) this.recordingResults[index] = entry;
        else this.recordingResults.unshift(entry);
        const blobChanged = Boolean(previous && previous.blob !== entry.blob);
        const structureChanged = !previous
            || previous.name !== entry.name
            || previous.status !== entry.status
            || blobChanged
            || previous.thumbnailDataUrl !== entry.thumbnailDataUrl;
        if (blobChanged) this.revokeRecordingObjectUrl(entry.id);
        this.recordingResults.sort((a, b) => b.createdAt - a.createdAt);
        if (structureChanged || !this.patchRecordingCard(entry)) this.renderRecordingResults();
        this.logDebug('record.gallery.updated', {
            id: entry.id,
            name: entry.name,
            bytes: entry.size,
            mimeType: entry.mimeType,
            status: entry.status,
            note: entry.note || null
        });
    }

    private async registerMp4ToTourProducer(name: string, blob: Blob) {
        if (String(blob.type || '').toLowerCase() !== 'video/mp4') return;
        try {
            const healthy = await fetch('http://localhost:3034/api/ot-tour-producer/health').then((res) => res.ok).catch(() => false);
            if (!healthy) {
                this.logDebug('record.producer.register.error', {
                    name,
                    error: 'ot-tour-producer-offline'
                });
                return;
            }
            const modelFilename = String(this.modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__';
            this.logDebug('record.producer.register.start', {
                name,
                bytes: blob.size,
                modelFilename
            });
            const response = await fetch('http://localhost:3034/api/ot-tour-producer/videos/register', {
                method: 'POST',
                headers: {
                    'X-OT-Name': name,
                    'X-OT-Mime-Type': 'video/mp4',
                    'X-OT-Model-Filename': modelFilename
                },
                body: blob
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                this.logDebug('record.producer.register.error', {
                    name,
                    status: response.status,
                    message: text.slice(0, 160)
                });
                return;
            }
            const payload = await response.json().catch((): null => null);
            if (payload?.existed === true) {
                this.logDebug('record.producer.register.exists', {
                    name,
                    bytes: blob.size,
                    modelFilename,
                    videoId: payload?.video?.id || null
                });
                return;
            }
            this.logDebug('record.producer.registered', {
                name,
                bytes: blob.size,
                modelFilename,
                videoId: payload?.video?.id || null
            });
        } catch (error) {
            this.logDebug('record.producer.register.error', {
                name,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async backfillReadyMp4ToModelDb() {
        if (this.backfillSyncInProgress) return;
        this.backfillSyncInProgress = true;
        this.recordingSyncToModelDbBtn.disabled = true;
        try {
            const healthy = await fetch('http://localhost:3034/api/ot-tour-producer/health').then((res) => res.ok).catch(() => false);
            if (!healthy) {
                this.setRecordingModalStatus('Sync failed: ot-tour-producer backend is offline (3034).');
                this.logDebug('record.backfill.done', { total: 0, uploaded: 0, skipped: 0, failed: 0, reason: 'producer-offline' });
                return;
            }
            const ready = this.recordingResults.filter((item) => {
                const mime = String(item.mimeType || '').toLowerCase();
                return item.status === 'ready' && (mime === 'video/mp4' || item.extension === 'mp4') && item.blob instanceof Blob;
            });
            if (!ready.length) {
                this.setRecordingModalStatus('No MP4 READY recordings to sync.');
                this.logDebug('record.backfill.done', { total: 0, uploaded: 0, skipped: 0, failed: 0, reason: 'no-ready-mp4' });
                return;
            }
            const modelFilename = String(this.modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__';
            this.logDebug('record.backfill.start', {
                total: ready.length,
                modelFilename: this.modelFilename,
                producerModelScope: modelFilename
            });

            let uploaded = 0;
            let skipped = 0;
            let failed = 0;
            let firstFailureMessage = '';

            for (let i = 0; i < ready.length; i += 1) {
                const item = ready[i];
                const syncName = String(item.name || `tour-recording-${item.createdAt}.mp4`);
                const syncSize = Number(item.size) || item.blob.size;
                this.setRecordingModalStatus(`Sync MP4 to Model DB ${i + 1}/${ready.length}...`);
                this.logDebug('record.backfill.item.start', {
                    index: i + 1,
                    total: ready.length,
                    name: syncName,
                    sizeBytes: syncSize,
                    modelFilename
                });

                try {
                    const response = await fetch('http://localhost:3034/api/ot-tour-producer/videos/register', {
                        method: 'POST',
                        headers: {
                            'X-OT-Name': syncName,
                            'X-OT-Mime-Type': 'video/mp4',
                            'X-OT-Model-Filename': modelFilename
                        },
                        body: item.blob
                    });
                    if (!response.ok) {
                        const text = await response.text().catch(() => '');
                        failed += 1;
                        if (!firstFailureMessage) firstFailureMessage = `HTTP ${response.status}`;
                        this.logDebug('record.backfill.item.error', {
                            name: syncName,
                            sizeBytes: syncSize,
                            status: response.status,
                            message: text.slice(0, 180)
                        });
                        continue;
                    }
                    const payload = await response.json().catch((): null => null);
                    if (payload?.existed === true) {
                        skipped += 1;
                        this.logDebug('record.backfill.item.skip', {
                            name: syncName,
                            sizeBytes: syncSize,
                            reason: 'already-saved',
                            videoId: payload?.video?.id || null
                        });
                        continue;
                    }
                    uploaded += 1;
                    this.logDebug('record.backfill.item.ok', {
                        name: syncName,
                        sizeBytes: syncSize,
                        videoId: payload?.video?.id || null
                    });
                } catch (error) {
                    failed += 1;
                    if (!firstFailureMessage) firstFailureMessage = error instanceof Error ? error.message : String(error);
                    this.logDebug('record.backfill.item.error', {
                        name: syncName,
                        sizeBytes: syncSize,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            this.setRecordingModalStatus(`Sync done. uploaded=${uploaded}, skipped=${skipped}, failed=${failed}${firstFailureMessage ? `, firstError=${firstFailureMessage}` : ''}`);
            this.logDebug('record.backfill.done', {
                modelFilename: this.modelFilename,
                total: ready.length,
                uploaded,
                skipped,
                failed,
                firstError: firstFailureMessage || null
            });
        } finally {
            this.backfillSyncInProgress = false;
            this.recordingSyncToModelDbBtn.disabled = false;
        }
    }

    private async deleteRecordingResult(recordingId: string) {
        const db = await this.openRecordingDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').delete(recordingId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to delete recording'));
        });
    }

    private async captureRecordingThumbnail(blob: Blob) {
        const url = URL.createObjectURL(blob);
        try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            const meta = await new Promise<{ durationSec: number; width: number; height: number }>((resolve, reject) => {
                video.onloadedmetadata = () => {
                    resolve({
                        durationSec: Number.isFinite(video.duration) ? video.duration : 0,
                        width: video.videoWidth || 0,
                        height: video.videoHeight || 0
                    });
                };
                video.onerror = () => reject(new Error('Failed to load recording metadata'));
                video.src = url;
            });
            if (meta.durationSec > 0) {
                const seekTime = Math.min(Math.max(meta.durationSec * 0.2, 0.1), Math.max(meta.durationSec - 0.1, 0.1));
                await new Promise<void>((resolve) => {
                    video.onseeked = () => resolve();
                    try {
                        video.currentTime = seekTime;
                    } catch {
                        resolve();
                    }
                });
            }
            const canvas = document.createElement('canvas');
            const aspect = meta.width > 0 && meta.height > 0 ? meta.width / meta.height : 16 / 9;
            canvas.width = 320;
            canvas.height = Math.round(canvas.width / aspect);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            return {
                durationSec: meta.durationSec,
                width: meta.width,
                height: meta.height,
                thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.82)
            };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private getRecordingObjectUrl(entry: StoredRecordingEntry) {
        const existing = this.recordingObjectUrls.get(entry.id);
        if (existing) return existing;
        const url = URL.createObjectURL(entry.blob);
        this.recordingObjectUrls.set(entry.id, url);
        return url;
    }

    private revokeRecordingObjectUrl(recordingId: string) {
        const existing = this.recordingObjectUrls.get(recordingId);
        if (!existing) return;
        URL.revokeObjectURL(existing);
        this.recordingObjectUrls.delete(recordingId);
    }

    private renderRecordingResults() {
        this.recordingResultsEl.innerHTML = '';
        const visibleItems = this.recordingResults.slice(0, 3);
        this.recordingResultsEmptyEl.classList.add('hidden');
        for (let index = 0; index < 3; index += 1) {
            const item = visibleItems[index];
            if (!item) {
                const empty = document.createElement('div');
                empty.className = 'otp-record-slot-empty';
                this.recordingResultsEl.appendChild(empty);
                continue;
            }
            const card = document.createElement('div');
            card.className = 'otp-record-card';
            card.dataset.recordId = item.id;
            const status = this.renderRecordingStatus(item);
            const objectUrl = this.getRecordingObjectUrl(item);
            card.innerHTML = `
                <video class="otp-record-video" controls playsinline preload="metadata" src="${objectUrl}"></video>
                <div class="otp-record-menu-anchor">
                    <button class="otp-record-menu-btn" type="button" title="Delete recording" data-action="delete">
                        <svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
                    </button>
                </div>
                <div class="otp-record-card-body">
                    <div class="otp-record-topline">
                        <div class="otp-record-name" data-record-role="name">${item.name}</div>
                    </div>
                    <div class="otp-record-subline">
                        <div class="otp-record-meta" data-record-role="meta">${this.renderRecordingMeta(item)}</div>
                        <div class="${status.className}" data-record-role="status">${status.label}</div>
                    </div>
                </div>
            `;
            const video = card.querySelector('video') as HTMLVideoElement;
            const deleteBtn = card.querySelector('[data-action="delete"]') as HTMLButtonElement;
            video.poster = item.thumbnailDataUrl;
            video.addEventListener('play', () => {
                this.logDebug('record.gallery.play', { id: item.id, name: item.name, playbackRate: video.playbackRate });
            });
            deleteBtn.addEventListener('click', () => {
                void this.removeRecordingResult(item.id);
            });
            this.recordingResultsEl.appendChild(card);
        }
    }

    private async addRecordingResult(
        blob: Blob,
        mimeType: string,
        extension: string,
        status: StoredRecordingEntry['status'],
        note?: string,
        options?: { durationSecFallback?: number }
    ) {
        const createdAt = Date.now();
        const meta = await this.captureRecordingThumbnail(blob);
        const resolvedDurationSec = meta.durationSec > 0
            ? meta.durationSec
            : Math.max(0, Number(options?.durationSecFallback) || 0);
        const entry: StoredRecordingEntry = {
            id: `rec_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: `tour-recording-${createdAt}.${extension}`,
            status,
            transcodeJobId: undefined,
            transcodePercent: status === 'processing' ? 0 : undefined,
            transcodeEtaSec: status === 'processing' ? null : undefined,
            transcodeHeartbeatAt: status === 'processing' ? Date.now() : undefined,
            transcodePhase: status === 'processing' ? 'queued' : undefined,
            mimeType,
            extension,
            size: blob.size,
            durationSec: resolvedDurationSec,
            width: meta.width,
            height: meta.height,
            createdAt,
            thumbnailDataUrl: meta.thumbnailDataUrl,
            note,
            blob
        };
        await this.storeRecordingResult(entry);
        this.recordingResults.unshift(entry);
        this.renderRecordingResults();
        this.logDebug('record.gallery.saved', { id: entry.id, name: entry.name, bytes: entry.size, mimeType: entry.mimeType, status: entry.status, note: entry.note || null });
        return entry;
    }

    private async removeRecordingResult(recordingId: string) {
        const entry = this.recordingResults.find((item) => item.id === recordingId);
        if (!entry) return;
        const confirmed = window.confirm(`Delete recording ${entry.name}? This removes saved MP4/WebM data permanently.`);
        if (!confirmed) return;
        await this.deleteRecordingResult(recordingId);
        this.recordingResults = this.recordingResults.filter((item) => item.id !== recordingId);
        this.revokeRecordingObjectUrl(recordingId);
        this.renderRecordingResults();
        this.logDebug('record.gallery.deleted', { id: entry.id, name: entry.name });
    }

    private async stopRecording(save = true, reason = 'manual-stop') {
        const runtime = this.activeRecording;
        if (!runtime) return;
        this.logDebug('record.export.stop.requested', { reason, bytesWritten: runtime.bytesWritten });
        this.stopRecordingTimer();
        if (this.recordingSettings.hidePanelDuringRecording) this.root.classList.remove('hidden');
        this.stopMusicPlayback();
        if (runtime.paused && runtime.recorder.state === 'paused') {
            runtime.recorder.resume();
            runtime.paused = false;
        }
        const recordedBlob = await new Promise<Blob>((resolve) => {
            runtime.recorder.onstop = () => {
                resolve(new Blob(runtime.chunks, { type: runtime.mimeType }));
            };
            try {
                runtime.recorder.requestData();
            } catch {
                // ignore requestData failures during shutdown
            }
            runtime.recorder.stop();
        });
        runtime.stream.getTracks().forEach((track) => track.stop());
        runtime.displayStream?.getTracks().forEach((track) => track.stop());
        this.stopRecordingCompositor();
        this.activeRecording = null;
        this.danmakuInput.disabled = !this.modelFilename ? true : false;
        this.danmakuSendBtn.disabled = !this.modelFilename ? true : false;
        this.refreshRecordingButtons();
        this.setStatus(save ? 'Recording complete. Saved to Recordings.' : 'Recording cancelled.');
        if (save && recordedBlob.size > 0) {
            this.setRecordingModalStatus('Recording finished. Saving WebM and preparing MP4...');
            const recordedDurationSec = Math.max(0, (performance.now() - runtime.startedAt) / 1000);
            let processingEntry: StoredRecordingEntry | null = null;
            try {
                processingEntry = await this.addRecordingResult(
                    recordedBlob,
                    runtime.mimeType,
                    runtime.extension,
                    'processing',
                    'MP4 0% · ETA --:-- · heartbeat 0s ago',
                    { durationSecFallback: recordedDurationSec }
                );
                this.logDebug('record.gallery.processing', {
                    id: processingEntry.id,
                    name: processingEntry.name,
                    bytes: processingEntry.size,
                    mimeType: processingEntry.mimeType,
                    reason
                });
                this.setRecordingModalStatus('WebM saved. MP4 transcoding in progress...');
                const { mp4Blob, jobId } = await this.transcodeRecordingEntry(processingEntry, runtime.settings, this.options.getCaptureCanvas?.()?.width || 1920, this.options.getCaptureCanvas?.()?.height || 1080);
                const mp4Meta = await this.captureRecordingThumbnail(mp4Blob);
                await this.updateRecordingResult({
                    ...processingEntry,
                    name: processingEntry.name.replace(/\.[^.]+$/, '.mp4'),
                    status: 'ready',
                    transcodeJobId: jobId,
                    transcodePercent: 100,
                    transcodeEtaSec: 0,
                    transcodeHeartbeatAt: Date.now(),
                    transcodePhase: 'done',
                    mimeType: 'video/mp4',
                    extension: 'mp4',
                    size: mp4Blob.size,
                    durationSec: mp4Meta.durationSec,
                    width: mp4Meta.width,
                    height: mp4Meta.height,
                    thumbnailDataUrl: mp4Meta.thumbnailDataUrl,
                    note: undefined,
                    blob: mp4Blob
                });
                await this.registerMp4ToTourProducer(processingEntry.name.replace(/\.[^.]+$/, '.mp4'), mp4Blob);
                this.logDebug('record.export.done', { reason, sourceBytes: recordedBlob.size, finalBytes: mp4Blob.size, mimeType: 'video/mp4' });
                this.setRecordingModalStatus('MP4 ready in Recordings.');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (processingEntry) {
                    await this.updateRecordingResult({
                        ...processingEntry,
                        status: 'mp4_failed',
                        transcodePhase: 'error',
                        note: `MP4 transcode failed: ${message}`
                    });
                }
                this.logDebug('record.transcode.error', { reason, error: message, fallbackMimeType: runtime.mimeType, fallbackBytes: recordedBlob.size });
                this.setRecordingModalStatus(`MP4 transcode failed. Kept WebM fallback. ${message}`);
            }
        } else {
            this.logDebug('record.export.cancelled', { reason, bytes: recordedBlob.size });
        }
    }

    private async startRecording(variant: RecordingButtonVariant) {
        if (this.activeRecording) {
            await this.stopRecording(true, 'button-stop');
            return;
        }
        const canvas = this.options.getCaptureCanvas?.() || document.querySelector('canvas');
        if (!canvas) {
            this.setStatus('Recording failed: canvas unavailable.');
            this.logDebug('record.export.error', { error: 'canvas-unavailable' });
            return;
        }

        this.recordingSettings = this.collectRecordingSettings(variant);
        this.syncRecordingForm();

        let displayStream: MediaStream | null = null;
        try {
            if ((this.recordingSettings.includeTts || this.recordingSettings.includeMusic) && navigator.mediaDevices?.getDisplayMedia) {
                this.setRecordingModalStatus('Waiting for current-tab audio permission...');
                displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true,
                    preferCurrentTab: true,
                    selfBrowserSurface: 'include'
                } as any);
            }
            this.startRecordingCompositor(canvas as HTMLCanvasElement);
            const recordingCanvas = this.recordingCompositorCanvas || (canvas as HTMLCanvasElement);
            const canvasStream = recordingCanvas.captureStream(this.recordingSettings.frameRate);
            const outputStream = new MediaStream();
            const videoTrack = canvasStream.getVideoTracks()[0];
            if (!videoTrack) throw new Error('No canvas video track available');
            outputStream.addTrack(videoTrack);

            const audioTrack = displayStream?.getAudioTracks?.()[0] || null;
            if ((this.recordingSettings.includeTts || this.recordingSettings.includeMusic) && !audioTrack) {
                throw new Error('Current-tab audio was not shared. Enable tab audio in the browser share dialog.');
            }
            if (audioTrack) outputStream.addTrack(audioTrack);
            this.logDebug('record.audio.capture.ready', {
                hasTabAudioTrack: Boolean(audioTrack),
                audioTrackLabel: audioTrack?.label || null,
                audioTrackSettings: audioTrack?.getSettings?.() || null,
                includeTts: this.recordingSettings.includeTts,
                includeMusic: this.recordingSettings.includeMusic
            });

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                    ? 'video/webm;codecs=vp8,opus'
                    : 'video/webm';
            const chunks: BlobPart[] = [];
            const recorder = new MediaRecorder(outputStream, {
                mimeType,
                videoBitsPerSecond: this.recordingSettings.videoBitsPerSecond,
                audioBitsPerSecond: this.recordingSettings.audioBitsPerSecond
            });
            recorder.ondataavailable = (event) => {
                if (!event.data || event.data.size < 1 || !this.activeRecording) return;
                chunks.push(event.data);
                this.activeRecording.bytesWritten += event.data.size;
                const now = performance.now();
                if (now - this.activeRecording.lastProgressLogAt > 1000) {
                    this.activeRecording.lastProgressLogAt = now;
                    this.logDebug('record.export.progress', {
                        bytesWritten: this.activeRecording.bytesWritten,
                        elapsedMs: Math.round(now - this.activeRecording.startedAt)
                    });
                }
            };
            recorder.onerror = (event) => {
                this.logDebug('record.export.error', { error: String((event as Event).type) });
            };

            this.activeRecording = {
                settings: this.recordingSettings,
                recorder,
                stream: outputStream,
                displayStream,
                chunks,
                startedAt: performance.now(),
                mimeType,
                extension: 'webm',
                bytesWritten: 0,
                lastProgressLogAt: 0,
                paused: false
            };
            this.stopPreviewPlayback();
            recorder.start(1000);
            this.closeRecordingModal();
            if (this.recordingSettings.hidePanelDuringRecording) this.root.classList.add('hidden');
            if (this.recordingSettings.disableInterrupts) {
                this.danmakuInput.disabled = true;
                this.danmakuSendBtn.disabled = true;
            }
            this.refreshRecordingButtons();
            this.startRecordingTimer();
            this.setStatus('Recording started.');
            this.logDebug('record.export.start', {
                variant,
                mimeType,
                frameRate: this.recordingSettings.frameRate,
                videoBitsPerSecond: this.recordingSettings.videoBitsPerSecond,
                audioBitsPerSecond: this.recordingSettings.audioBitsPerSecond,
                mp4CompressionPreset: this.recordingSettings.mp4CompressionPreset,
                includeTts: this.recordingSettings.includeTts,
                includeMusic: this.recordingSettings.includeMusic,
                subtitlesEnabled: this.recordingSettings.subtitlesEnabled,
                playlistCount: this.recordingPlaylist.length
            });
            this.setRecordingModalStatus('Recording WebM... MP4 will be produced after capture finishes.');
            if (this.recordingSettings.includeMusic && this.recordingPlaylist.length > 0) {
                this.logDebug('record.audio.music.decode', {
                    playlistCount: this.recordingPlaylist.length,
                    files: this.recordingPlaylist.slice(0, 20).map((item) => ({ name: item.name, durationSec: item.durationSec }))
                });
                this.startMusicPlayback();
            }
            if (this.recordingSettings.autoPlay && !this.playing) {
                this.playBtn.click();
            }
        } catch (error) {
            displayStream?.getTracks().forEach((track) => track.stop());
            this.stopRecordingCompositor();
            this.activeRecording = null;
            this.stopRecordingTimer();
            this.refreshRecordingButtons();
            this.root.classList.remove('hidden');
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Recording failed: ${message}`);
            this.setRecordingModalStatus(message);
            this.logDebug('record.export.error', { error: message });
        }
    }

    private async speakText(task: QueueDispatchTask, token: number) {
        const trimmed = String(task.content?.text || '').trim();
        if (!trimmed) return;
        this.appendTranscript('narrator', trimmed);
        this.recordingSubtitleText = trimmed;
        try {
            this.logDebug('tts.request.task', {
                taskId: task.task_id,
                model: this.ttsConfig.model,
                voice: this.ttsConfig.voice,
                rowVoice: task.tts_voice || null,
                lang: task.tts_lang || null,
                textLength: trimmed.length,
                hasAudioUrl: Boolean(task.content?.audio_url),
                ttsDebug: task.tts_debug || null
            });
            const playedRemoteAudio = await this.playAudioUrl(task, token);
            if (playedRemoteAudio) {
                this.logDebug('tts.speak.ok', {
                    taskId: task.task_id,
                    model: this.ttsConfig.model,
                    voice: this.ttsConfig.voice,
                    rowVoice: task.tts_voice || null,
                    ttsDebug: task.tts_debug || null
                });
                this.logTtsDebug('audio_url.played', {
                    taskId: task.task_id,
                    poi: this.displayPoi(task.poi_name, task.poi_id),
                    hasAudioUrl: Boolean(task.content?.audio_url),
                    model: this.ttsConfig.model,
                    voice: this.ttsConfig.voice,
                    rowVoice: task.tts_voice || null
                });
                return;
            }
            this.logDebug('tts.speak.missing-audio', {
                taskId: task.task_id,
                model: this.ttsConfig.model,
                voice: this.ttsConfig.voice,
                rowVoice: task.tts_voice || null,
                ttsDebug: task.tts_debug || null
            });
            if (this.activeRecording && this.recordingSettings.includeTts) {
                throw new Error('TTS audio_url missing during recording; narration cannot be guaranteed in the export.');
            }
            this.logTtsDebug('audio_url.missing', {
                taskId: task.task_id,
                poi: this.displayPoi(task.poi_name, task.poi_id),
                model: this.ttsConfig.model,
                voice: this.ttsConfig.voice,
                rowVoice: task.tts_voice || null,
                textLength: trimmed.length,
                requestedLang: task.tts_lang || null
            });

            if (!('speechSynthesis' in window)) return;
            const { effective, reason } = this.resolveTtsLang(task.tts_lang || null, trimmed);
            const voices = await this.resolveVoices();
            const voice = this.pickVoice(voices, effective);
            const utter = new SpeechSynthesisUtterance(trimmed);
            utter.lang = voice?.lang || effective;
            utter.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.ttsVolume));
            if (voice) utter.voice = voice;
            this.logDebug('tts.speech_synthesis.fallback', {
                taskId: task.task_id,
                effectiveLang: effective,
                reason,
                voiceName: voice?.name || null
            });
            await new Promise<void>((resolve) => {
                utter.onend = () => resolve();
                utter.onerror = () => resolve();
                window.speechSynthesis.speak(utter);
            });
        } finally {
            if (this.recordingSubtitleText === trimmed) {
                this.recordingSubtitleText = '';
            }
        }
    }

    private async moveToTask(task: QueueDispatchTask, token: number) {
        if (!this.options.setLiveCameraPose) return;
        const live = this.options.getLiveCameraPose?.();
        const to = this.cameraPoseFromTask(task);
        if (!live) {
            await this.options.setLiveCameraPose(to, 62);
            return;
        }
        const from = live.pose;
        const distance = Math.hypot(to.eye.x - from.eye.x, to.eye.y - from.eye.y, to.eye.z - from.eye.z);
        const speed = Math.max(0.2, Number(task.move_speed_mps ?? 0.8));
        const duration = Math.max(260, (distance / speed) * 1000);
        const startAt = performance.now();
        while (true) {
            if (this.stopRequested || token !== this.playbackToken) return;
            await this.waitWhilePausedOrStopped();
            if (this.stopRequested || token !== this.playbackToken) return;
            const t = clamp((performance.now() - startAt) / duration, 0, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
            const lerp = (a: number, b: number) => a + (b - a) * ease;
            await this.options.setLiveCameraPose({
                eye: { x: lerp(from.eye.x, to.eye.x), y: lerp(from.eye.y, to.eye.y), z: lerp(from.eye.z, to.eye.z) },
                forward: { x: lerp(from.forward.x, to.forward.x), y: lerp(from.forward.y, to.forward.y), z: lerp(from.forward.z, to.forward.z) }
            }, live.fovDeg);
            if (t >= 1) break;
            await sleep(16);
        }
        const dwellMs = Math.max(0, Number(task.dwell_ms ?? 0));
        if (dwellMs > 0) await sleep(dwellMs);
    }

    private async executeTask(task: QueueDispatchTask, token: number): Promise<QueueTaskStatus> {
        try {
            this.logDebug('task.execute.start', {
                taskId: task.task_id,
                type: task.type,
                executionMode: task.execution_mode,
                poiId: task.poi_id,
                poiName: task.poi_name,
                hasContent: Boolean(task.content?.text),
                hasAudioUrl: Boolean(task.content?.audio_url),
                ttsDebug: task.tts_debug || null,
                dwellMs: task.dwell_ms,
                moveSpeedMps: task.move_speed_mps
            });
            const speechPromise = task.content?.text ? this.speakText(task, token) : Promise.resolve();
            if (task.type === 'MOVE' || task.type === 'LOOK') {
                const movePromise = this.moveToTask(task, token);
                if (task.execution_mode === 'INTERRUPTIBLE') await movePromise;
                else await Promise.all([movePromise, speechPromise]);
            } else {
                await speechPromise;
                if (task.dwell_ms) await sleep(Math.max(0, Number(task.dwell_ms)));
            }
            if (this.stopRequested || token !== this.playbackToken) return 'SKIPPED';
            this.logDebug('task.execute.done', { taskId: task.task_id, result: 'COMPLETED' });
            return 'COMPLETED';
        } catch (error) {
            this.logDebug('task.execute.error', {
                taskId: task.task_id,
                type: task.type,
                error: error instanceof Error ? error.message : String(error)
            });
            return 'FAILED';
        }
    }

    private async runLoop(token: number) {
        while (this.playing && token === this.playbackToken) {
            await this.waitWhilePausedOrStopped();
            if (!this.playing || token !== this.playbackToken) return;

            let payload: any;
            try {
                const requestBody = { session_id: this.sessionId, status: this.pendingTaskStatus };
                this.logDebug('playback.next.request', requestBody);
                const response = await fetch(`${this.apiBase()}/next`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                if (!response.ok) throw new Error(await response.text());
                payload = await response.json();
                this.logDebug('playback.next.response', {
                    sessionId: payload?.session_id || this.sessionId,
                    hasTask: Boolean(payload?.task),
                    taskId: payload?.task?.task_id || null,
                    taskType: payload?.task?.type || null,
                    hasAudioUrl: Boolean(payload?.task?.content?.audio_url),
                    ttsDebug: payload?.task?.tts_debug || null,
                    pendingStatusSent: this.pendingTaskStatus || null,
                    scriptQueue: payload?.snapshot?.scriptQueue?.length ?? null,
                    priorityQueue: payload?.snapshot?.priorityQueue?.length ?? null
                });
            } catch (error) {
                this.playing = false;
                this.refreshPlaybackButtons();
                this.setStatus(`Playback failed: ${String(error)}`);
                this.appendTranscript('system', '调度失败，已停止循环。');
                this.logDebug('playback.next.error', {
                    sessionId: this.sessionId,
                    pendingStatusSent: this.pendingTaskStatus || null,
                    error: error instanceof Error ? error.message : String(error)
                });
                if (this.activeRecording && this.recordingSettings.stopWithPlayback) {
                    await this.stopRecording(true, 'playback-failed');
                }
                return;
            }

            this.pendingTaskStatus = undefined;
            this.snapshot = payload.snapshot || null;
            this.renderSnapshot();

            const task = payload.task as QueueDispatchTask | null;
            if (!task) {
                this.playing = false;
                this.paused = false;
                this.refreshPlaybackButtons();
                this.setStatus('Playback finished.');
                this.appendTranscript('system', '巡游任务执行完成。');
                this.logDebug('playback.finished', { sessionId: this.sessionId });
                if (this.activeRecording && this.recordingSettings.stopWithPlayback) {
                    await this.stopRecording(true, 'playback-finished');
                }
                return;
            }

            this.setStatus(`Running ${task.task_id} (${task.type})`);
            this.appendTranscript('system', `Executing ${task.type} ${this.displayPoi(task.poi_name, task.poi_id)}`);
            this.pendingTaskStatus = await this.executeTask(task, token);
            this.logDebug('playback.task.result', {
                taskId: task.task_id,
                type: task.type,
                result: this.pendingTaskStatus
            });

            if (this.stopRequested) {
                this.playing = false;
                this.paused = false;
                this.refreshPlaybackButtons();
                this.setStatus('Playback stopped.');
                this.appendTranscript('system', '巡游已停止。');
                this.logDebug('playback.stopped', { sessionId: this.sessionId });
                if (this.activeRecording && this.recordingSettings.stopWithPlayback) {
                    await this.stopRecording(true, 'playback-stopped');
                }
                return;
            }
        }
    }

    private bindEvents() {
        (this.root.querySelector('[data-act="hide"]') as HTMLButtonElement).addEventListener('click', () => this.close());
        this.ttsBtn.addEventListener('click', () => {
            void this.openTtsModal();
        });
        this.ttsModelInput.addEventListener('change', () => {
            this.renderTtsVoiceOptions(this.ttsModelInput.value, this.ttsVoiceInput.value || DEFAULT_TTS_VOICE);
        });
        this.ttsModalEl.querySelector('[data-tts-modal="close"]')?.addEventListener('click', () => this.closeTtsModal());
        this.ttsModalEl.querySelector('[data-tts-modal="cancel"]')?.addEventListener('click', () => this.closeTtsModal());
        this.ttsModalEl.querySelector('[data-tts-modal="save"]')?.addEventListener('click', () => {
            void this.saveTtsConfig().then(() => this.closeTtsModal()).catch((error) => {
                this.logDebug('tts.config.save.error', { error: error instanceof Error ? error.message : String(error) });
                this.setStatus(`Save TTS config failed: ${String(error)}`);
            });
        });
        this.ttsModalEl.addEventListener('click', (event) => {
            if (event.target === this.ttsModalEl) this.closeTtsModal();
        });

        this.recordButtons[0].addEventListener('click', () => {
            if (this.activeRecording) {
                void this.stopRecording(true, 'record-button-a');
                return;
            }
            this.openRecordingModal('A');
        });
        this.recordPauseBtn.addEventListener('click', () => this.toggleRecordingPause());
        this.recordStopBtn.addEventListener('click', () => {
            void this.stopRecording(true, 'record-stop-button');
        });

        this.recordingModalEl.querySelector('[data-record-modal="close"]')?.addEventListener('click', () => this.closeRecordingModal());
        this.recordingModalEl.querySelector('[data-record-modal="start"]')?.addEventListener('click', () => {
            void this.startRecording(this.recordingSettings.selectedVariant);
        });
        this.recordingSyncToModelDbBtn.addEventListener('click', () => {
            void this.backfillReadyMp4ToModelDb();
        });
        this.recordingModalEl.querySelectorAll('[data-record-popover-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverTrigger || '';
                const popover = this.recordingModalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                if (!popover) return;
                const willOpen = !popover.classList.contains('open');
                this.closeRecordingConfigPopovers();
                if (willOpen) popover.classList.add('open');
            });
        });
        this.recordingModalEl.querySelectorAll('[data-record-popover-close]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverClose || '';
                const popover = this.recordingModalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                popover?.classList.remove('open');
            });
        });
        this.recordingModalEl.addEventListener('click', (event) => {
            if (event.target === this.recordingModalEl) {
                this.closeRecordingModal();
                return;
            }
            if (!(event.target as HTMLElement).closest('[data-record-popover]') && !(event.target as HTMLElement).closest('[data-record-popover-trigger]')) {
                this.closeRecordingConfigPopovers();
            }
        });

        const syncVolumeOut = (input: HTMLInputElement, output: HTMLSpanElement) => {
            input.addEventListener('input', () => {
                output.textContent = `${input.value}%`;
                this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
                this.applyMusicVolume();
                this.applyPreviewVolume();
                this.applyTtsVolume();
            });
        };
        syncVolumeOut(this.recordingMasterVolumeInput, this.recordingMasterVolumeOut);
        syncVolumeOut(this.recordingTtsVolumeInput, this.recordingTtsVolumeOut);
        syncVolumeOut(this.recordingMusicVolumeInput, this.recordingMusicVolumeOut);
        this.recordingSubtitleSizeInput.addEventListener('input', () => {
            this.recordingSubtitleSizeOut.textContent = `${this.recordingSubtitleSizeInput.value}px`;
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        });
        [this.recordingSubtitlesEnabledInput, this.recordingSubtitleFontSelect, this.recordingSubtitleColorInput].forEach((el) => {
            el.addEventListener('change', () => {
                this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
            });
        });
        this.recordingFrameRateSelect.addEventListener('change', () => {
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        });
        this.recordingQualitySelect.addEventListener('change', () => {
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        });
        this.recordingCompressionSelect.addEventListener('change', () => {
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        });

        this.recordingModalEl.querySelector('[data-record="pick-files"]')?.addEventListener('click', async () => {
            if (window.showOpenFilePicker) {
                try {
                    const handles = await window.showOpenFilePicker({
                        id: 'OTTourPlayerMusicFiles',
                        multiple: true,
                        types: [{ description: 'Audio Files', accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'] } }]
                    });
                    const files = await Promise.all(handles.map((handle) => handle.getFile()));
                    await this.addAudioFiles(files, 'files');
                } catch (error) {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) {
                        this.logDebug('record.playlist.files.error', { error: error instanceof Error ? error.message : String(error) });
                    }
                }
                return;
            }
            this.audioInputEl.click();
        });
        this.recordingModalEl.querySelector('[data-record="pick-folder"]')?.addEventListener('click', async () => {
            if (window.showDirectoryPicker) {
                try {
                    const handle = await window.showDirectoryPicker({ id: 'OTTourPlayerMusicFolder' });
                    const files: File[] = [];
                    for await (const value of handle.values()) {
                        if (value.kind === 'file') files.push(await value.getFile());
                    }
                    await this.addAudioFiles(files, 'folder');
                } catch (error) {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) {
                        this.logDebug('record.playlist.folder.error', { error: error instanceof Error ? error.message : String(error) });
                    }
                }
                return;
            }
            this.folderInputEl.click();
        });
        this.recordingModalEl.querySelector('[data-record="clear-playlist"]')?.addEventListener('click', () => this.clearRecordingPlaylist());

        this.audioInputEl.addEventListener('change', async () => {
            if (this.audioInputEl.files) await this.addAudioFiles(this.audioInputEl.files, 'files');
            this.audioInputEl.value = '';
        });
        this.folderInputEl.addEventListener('change', async () => {
            if (this.folderInputEl.files) await this.addAudioFiles(this.folderInputEl.files, 'folder');
            this.folderInputEl.value = '';
        });

        this.transcriptFilterAllBtn.addEventListener('click', () => {
            this.transcriptFilter = 'ALL';
            this.updateTranscriptFilterButtons();
            this.renderTranscript();
        });
        this.transcriptFilterChatBtn.addEventListener('click', () => {
            this.transcriptFilter = 'CHAT';
            this.updateTranscriptFilterButtons();
            this.renderTranscript();
        });
        this.transcriptFilterSystemBtn.addEventListener('click', () => {
            this.transcriptFilter = 'SYSTEM';
            this.updateTranscriptFilterButtons();
            this.renderTranscript();
        });

        this.transcriptExpandBtn.addEventListener('click', () => {
            this.transcriptOnly = !this.transcriptOnly;
            this.root.classList.toggle('transcript-only', this.transcriptOnly);
            this.transcriptExpandBtn.title = this.transcriptOnly ? 'Restore Layout' : 'Expand Transcript';
            this.drawRouteMap();
        });

        this.transcriptMapToggleBtns.forEach((button) => {
            button.addEventListener('click', () => {
                this.routeMapOpen = !this.routeMapOpen;
                this.routeMapPanelEl.classList.toggle('hidden', !this.routeMapOpen);
                if (this.routeMapOpen) void this.refreshRouteMapFromDb();
                this.drawRouteMap();
            });
        });
        this.routeMapZoomInBtn.addEventListener('click', () => {
            this.routeMapZoom = Math.max(0.5, Math.min(5, this.routeMapZoom * 1.15));
            this.drawRouteMap();
        });
        this.routeMapZoomOutBtn.addEventListener('click', () => {
            this.routeMapZoom = Math.max(0.5, Math.min(5, this.routeMapZoom / 1.15));
            this.drawRouteMap();
        });
        this.routeMapCenterBtn.addEventListener('click', () => {
            this.routeMapZoom = 1;
            this.routeMapOffsetX = 0;
            this.routeMapOffsetY = 0;
            this.drawRouteMap();
        });

        this.uploadBtn.addEventListener('click', () => this.csvInput.click());
        this.csvInput.addEventListener('change', async () => {
            const file = this.csvInput.files?.[0];
            if (!file) return;
            this.logDebug('csv.file.selected', {
                name: file.name,
                size: file.size,
                type: file.type || 'unknown'
            });
            try {
                const text = await file.text();
                this.logDebug('csv.file.read.ok', {
                    name: file.name,
                    chars: text.length,
                    lines: text.split(/\r?\n/).length,
                    preview: text.slice(0, 500)
                });
                await this.initSessionFromCsv(text);
                this.setStatus(`CSV imported: ${file.name}`);
            } catch (error) {
                this.logDebug('csv.import.error', {
                    name: file.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                this.setStatus(`Import failed: ${String(error)}`);
            } finally {
                this.csvInput.value = '';
            }
        });

        this.downloadBtn.addEventListener('click', async () => {
            if (!this.modelFilename) {
                this.setStatus('Load model first.');
                return;
            }
            try {
                const csv = this.createDemoCsv();
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ot-tour-player-${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                this.setStatus('Sample CSV downloaded.');
            } catch (error) {
                this.setStatus(`Download CSV failed: ${String(error)}`);
            }
        });

        this.playBtn.addEventListener('click', () => {
            if (!this.modelFilename) {
                this.setStatus('Load model first.');
                return;
            }
            if (!this.sessionId) {
                this.setStatus('Upload CSV first.');
                return;
            }
            if (this.playing && this.paused) {
                this.paused = false;
                this.refreshPlaybackButtons();
                if (this.activeRecording) this.resumeMusicPlayback();
                this.resumeTtsPlayback();
                this.setStatus('Playback resumed.');
                return;
            }
            if (this.playing) {
                this.paused = true;
                this.refreshPlaybackButtons();
                if (this.activeRecording) this.pauseMusicPlayback();
                this.pauseTtsPlayback();
                this.setStatus('Playback paused.');
                return;
            }
            this.stopRequested = false;
            this.paused = false;
            this.playing = true;
            this.refreshPlaybackButtons();
            if (this.skipRunningOnNextPlay) {
                this.pendingTaskStatus = 'SKIPPED';
                this.skipRunningOnNextPlay = false;
            }
            this.playbackToken += 1;
            this.appendTranscript('system', '开始自动巡游执行。');
            this.setStatus('Playback started.');
            void this.runLoop(this.playbackToken);
        });

        this.stopBtn.addEventListener('click', () => {
            if (!this.playing && !this.paused) return;
            this.stopRequested = true;
            this.skipRunningOnNextPlay = true;
            this.paused = false;
             this.pauseMusicPlayback();
            this.stopTtsPlayback();
            this.refreshPlaybackButtons();
            this.setStatus('Stopping playback...');
        });

        this.clearBtn.addEventListener('click', async () => {
            this.stopTtsPlayback();
            try {
                await fetch(`${this.apiBase()}/clear`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scope: 'all' })
                });
            } catch {
                // ignore backend clear failure; still clear local records
            }
            this.resetLocalRecords();
            this.setStatus(this.modelFilename ? 'All records cleared. Upload CSV to start session.' : 'All records cleared. Load model first.');
            this.appendTranscript('system', 'All records cleared.');
        });

        const submitDanmaku = async () => {
            const text = this.danmakuInput.value.trim();
            if (!text) return;
            if (this.activeRecording && this.recordingSettings.disableInterrupts) {
                this.setStatus('Danmaku disabled while recording.');
                this.logDebug('record.interrupt.blocked', { reason: 'recording-disable-interrupts', text });
                return;
            }
            if (!this.sessionId) {
                this.setStatus('Upload CSV first.');
                return;
            }
            this.danmakuInput.value = '';
            this.appendTranscript('user', text);
            try {
                const response = await fetch(`${this.apiBase()}/interrupt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: this.sessionId, user_command: text, user_name: 'Live User' })
                });
                if (!response.ok) throw new Error(await response.text());
                const payload = await response.json();
                this.snapshot = payload.snapshot || this.snapshot;
                this.renderSnapshot();
                this.appendTranscript('system', payload.message || '已插队处理。');
                if (payload?.debug?.detail) {
                    const matched = payload?.debug?.matched === true;
                    const poi = payload?.debug?.matchedPoi?.poiName || payload?.debug?.matchedPoi?.poiId || '-';
                    const model = payload?.debug?.detail?.model || '-';
                    const by = payload?.debug?.detail?.matchedBy || '-';
                    this.appendTranscript('system', `[INTENT] matched=${matched} poi=${poi} by=${by} model=${model}`);
                }
                this.setStatus('Danmaku injected into priority queue.');
            } catch (error) {
                this.appendTranscript('system', '注入失败，请重试。');
                this.setStatus(`Danmaku inject failed: ${String(error)}`);
            }
        };

        this.danmakuInput.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            await submitDanmaku();
        });
        this.danmakuSendBtn.addEventListener('click', () => {
            void submitDanmaku();
        });

        const dragHandle = this.root.querySelector('[data-role="drag-handle"]') as HTMLDivElement;
        dragHandle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (target.closest('button,input,select,textarea,label')) return;
            const rect = this.root.getBoundingClientRect();
            this.root.style.left = `${rect.left}px`;
            this.root.style.top = `${rect.top}px`;
            this.root.style.right = 'auto';
            this.panelDrag = { active: true, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
            dragHandle.setPointerCapture(event.pointerId);
        });
        dragHandle.addEventListener('pointermove', (event) => {
            if (!this.panelDrag.active || event.pointerId !== this.panelDrag.pointerId) return;
            const dx = event.clientX - this.panelDrag.startX;
            const dy = event.clientY - this.panelDrag.startY;
            this.root.style.left = `${this.panelDrag.left + dx}px`;
            this.root.style.top = `${this.panelDrag.top + dy}px`;
        });
        const endDrag = (event: PointerEvent) => {
            if (!this.panelDrag.active || event.pointerId !== this.panelDrag.pointerId) return;
            this.panelDrag.active = false;
            if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
        };
        dragHandle.addEventListener('pointerup', endDrag);
        dragHandle.addEventListener('pointercancel', endDrag);
    }
}

const mountOTTourPlayerPanel = (options: TourPlayerPanelOptions): TourPlayerPanelController => {
    return new TourPlayerPanel(options);
};

export {
    mountOTTourPlayerPanel,
    type TourPlayerPanelController,
    type TourPlayerPanelOptions
};
