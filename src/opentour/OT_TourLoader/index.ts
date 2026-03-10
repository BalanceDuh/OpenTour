import {
    OT_TOUR_CSV_HEADERS,
    OT_TOUR_CSV_VERSION
} from './OT_TL_FieldStandard';

type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type WorldPoint = { x: number; y: number; z: number; opacity?: number };

type TourPoi = {
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
};

type LlmProvider = 'gemini' | 'qwen';

type ProviderConfig = {
    modelName: string;
    apiKey: string;
};

type LlmConfigState = {
    selectedProvider: LlmProvider;
    gemini: ProviderConfig;
    qwen: ProviderConfig;
    updatedAt: string | null;
    promptUpdatedAt: string | null;
};

type PromptEditorContext =
    | { scope: 'global' }
    | { scope: 'poi'; poiId: string };

type TourLoaderOptions = {
    launcherButton?: HTMLButtonElement;
    getModelFilename: () => string | null;
    getWorldSamplePoints?: () => WorldPoint[];
    getLiveCameraPose?: () => { pose: CameraPose; fovDeg: number } | null;
    setLiveCameraPose?: (pose: CameraPose, fovDeg: number) => Promise<void> | void;
    captureScreenshotPng?: () => Promise<string>;
    apiBaseUrl?: string;
    onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
};

type TourLoaderController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
};

type JobState = {
    jobId: string | null;
    paused: boolean;
    streaming: boolean;
};

type MapBounds = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type CsvVersionSummary = {
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

type CsvVersionDetail = CsvVersionSummary & {
    csvText: string;
    csvPromptTemplate: string | null;
    movePromptTemplate: string | null;
};

type TtsVoiceOption = {
    value: string;
    label: string;
    subtitle: string;
    group: string;
};

type CsvVoiceConfigState = {
    enabled: boolean;
    mode: 'fixed' | 'shuffle_round_robin';
    model: string;
    fixedVoice: string;
    voicePool: string[];
};

type CsvTimingConfigState = {
    enabled: boolean;
    targetDurationSec: number;
};

type CsvTimingSummary = {
    enabled: boolean;
    targetDurationSec: number;
    minimumAchievableSec: number | null;
    estimatedDurationSec: number | null;
};

const iconSvg = (paths: string, viewBox = '0 0 24 24') => `
    <svg viewBox="${viewBox}" aria-hidden="true" focusable="false">
        ${paths}
    </svg>
`;

const CSV_ICON_TIMING = iconSvg('<path d="M12 7v5l3 2"/><path d="M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17Z"/><path d="M9 2h6"/>');
const CSV_ICON_VOICE = iconSvg('<path d="M4.5 14.5V9.5h4l5-4v13l-5-4h-4Z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M18.7 6.8a7 7 0 0 1 0 10.4"/>');
const CSV_ICON_GENERATE = iconSvg('<path d="M12 3v7"/><path d="m8.5 6.5 3.5-3.5 3.5 3.5"/><path d="M5 14.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/><path d="M7.5 13h9"/>');
const CSV_ICON_SAVE = iconSvg('<path d="M5 4.5h11l3 3v12H5Z"/><path d="M8 4.5v5h7v-5"/><path d="M8.5 18h7"/>');
const CSV_ICON_SAVE_AS = iconSvg('<path d="M6 4.5h9l3 3v11H6Z"/><path d="M9 4.5v5h6v-5"/><path d="M10 15.5h5"/><path d="M17.5 16v4"/><path d="M15.5 18h4"/>');
const CSV_ICON_DELETE = iconSvg('<path d="M5.5 7.5h13"/><path d="M9 7.5v10"/><path d="M15 7.5v10"/><path d="M8 4.5h8"/><path d="M7 7.5l.8 11a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7.5"/>');
const CSV_ICON_DOWNLOAD = iconSvg('<path d="M12 4v10"/><path d="m8.5 10.5 3.5 3.5 3.5-3.5"/><path d="M5 18.5h14"/>');
const CSV_ICON_FULLSCREEN = iconSvg('<path d="M8 4.5H4.5V8"/><path d="M16 4.5h3.5V8"/><path d="M8 19.5H4.5V16"/><path d="M16 19.5h3.5V16"/>');
const CSV_ICON_CLOSE = iconSvg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>');

const STYLE_ID = 'ot-tour-loader-style';
const PANEL_ID = 'ot-tour-loader-panel';
const DEFAULT_PROMPT_TEMPLATE = '你是世界级的，正在描述你的视角给观众讲解，不要旁白和画外音。content 只允许使用：中文、英文、数字、空格，以及中文标点 `，。；：！？（）`禁止使用任何英文 CSV 控制字符，尤其是 `,` 和 `"`，绝对不要让 content 出现真实换行，不包含：\\r \\n \\t ，整体文字少于100字。';
const DEFAULT_CSV_PROMPT_TEMPLATE = `You are a CSV tour route planner.
Given POI data (poi_id, poi_name, content), output the best ordered tour steps.

Rules:
1) Output JSON only, no extra text.
2) Do not output from/to fields.
3) Every step must include: poi_id, action, audio_mode.
4) action should be one of MOVE/LOOK/SPEAK when possible.
5) audio_mode must be INTERRUPTIBLE or BLOCKING.
6) steps must cover all poi_id values from POI_DATA_JSON at least once.
7) Prefer each poi_id to appear once (duplicates only if truly necessary).

Output format:
{"steps":[{"poi_id":"kitchen","action":"MOVE","audio_mode":"INTERRUPTIBLE"}]}`;
const DEFAULT_MOVE_PROMPT_TEMPLATE = `You are a tour navigation copywriter for MOVE steps.
Given ordered MOVE contexts, produce concise transition narration for each step.

Rules:
1) Output JSON only, no extra text.
2) Keep each content to one short sentence.
3) Mention from -> to clearly.
4) Do not repeat scenic description from POI content.
5) Follow language field strictly: zh-CN => Chinese, en-US => English.

Output format:
{"moves":[{"seq":1,"content":"我们从起点前往大厅，向前移动约6米。"}]}`;
const GEMINI_MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview'
];
const QWEN_MODELS = [
    'qwen3-max',
    'qwen3.5-plus',
    'qwen3.5-flash'
];
const DEFAULT_LLM_MODEL = 'gemini-2.5-pro';
const DEFAULT_QWEN_MODEL = 'qwen3.5-plus';
const DEFAULT_TTS_MODEL = 'cosyvoice-v3-plus';
const DEFAULT_TTS_VOICE = 'longyuan_v3';
const DEFAULT_CSV_TARGET_DURATION_SEC = 30;
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
const DEFAULT_POI_FOV = 60;
const MIN_POI_FOV = 20;
const MAX_POI_FOV = 120;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const degToRad = (v: number) => v * Math.PI / 180;
const clampFov = (v: number, fallback = DEFAULT_POI_FOV) => {
    const n = Number.isFinite(v) ? v : fallback;
    return clamp(n, MIN_POI_FOV, MAX_POI_FOV);
};

const ensureStyle = () => {
    const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const style = existing || document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --otl-bg-base: #101014;
            --otl-bg-panel: #1a1a20;
            --otl-bg-card: #23232a;
            --otl-bg-input: #151519;
            --otl-text-main: #e2e2e9;
            --otl-text-muted: #8b8b99;
            --otl-primary: #3b82f6;
            --otl-primary-hover: #60a5fa;
            --otl-success: #10b981;
            --otl-danger: #ef4444;
            --otl-border: #33333e;
            --otl-border-light: #454552;
        }
        #${PANEL_ID} {
            position: fixed;
            right: 56px;
            top: 84px;
            width: 460px;
            height: fit-content;
            max-height: min(92vh, 910px);
            background: var(--otl-bg-panel);
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            color: var(--otl-text-main);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            flex-direction: column;
            z-index: 170;
            pointer-events: auto;
        }
        #${PANEL_ID}.hidden { display: none; }
        #${PANEL_ID} * { box-sizing: border-box; }
        .otl-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--otl-border);
            display: flex;
            justify-content: flex-start;
            align-items: center;
            cursor: move;
            background: rgba(0,0,0,0.2);
            gap: 8px;
        }
        .otl-header-actions { display:flex; align-items:center; gap:8px; }
        .otl-header-playback {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .otl-title { font-size: 14px; font-weight: 700; letter-spacing: 0.01em; }
        .otl-content {
            flex: 0 0 auto;
            overflow-y: auto;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-card {
            border: 1px solid var(--otl-border);
            background: var(--otl-bg-card);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-step-head { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; }
        .otl-step-actions { margin-left: auto; display:flex; align-items:center; gap:6px; }
        .otl-badge {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            color: var(--otl-text-muted);
            font-size: 11px;
            display:flex;
            justify-content:center;
            align-items:center;
        }
        .otl-map-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .otl-map-box { position: relative; border: 1px solid var(--otl-border); border-radius: 8px; background: #0e1015; overflow: hidden; }
        .otl-map-label { font-size: 11px; color: var(--otl-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--otl-border); }
        .otl-map { width: 100%; height: 180px; display:block; cursor: crosshair; }
        .otl-map-controls {
            position: absolute;
            left: 8px;
            bottom: 8px;
            display: flex;
            flex-direction: row;
            gap: 4px;
            z-index: 3;
            padding: 0;
            border: none;
            background: transparent;
        }
        .otl-map-controls .otl-icon-btn {
            width: 20px;
            height: 20px;
            border-radius: 10px;
            font-size: 10px;
            line-height: 1;
            padding: 0;
        }
        .otl-row { display:flex; gap:8px; align-items:center; }
        .otl-row > * { min-width: 0; }
        .otl-input, .otl-select {
            width: 100%;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            padding: 8px 10px;
            font-size: 12px;
            outline: none;
        }
        .otl-btn {
            height: 32px;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            padding: 0 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        }
        .otl-btn:hover:not(:disabled) { border-color: var(--otl-border-light); }
        .otl-btn:disabled { opacity: 0.45; cursor:not-allowed; }
        .otl-btn.primary { background: var(--otl-primary); color: #fff; border-color: rgba(255,255,255,0.12); }
        .otl-btn.primary:hover:not(:disabled) { background: var(--otl-primary-hover); }
        .otl-btn.danger { color: #ffd3d3; border-color: #7f2e3a; background: rgba(127,46,58,0.2); }
        .otl-icon-btn {
            width: 32px;
            height: 32px;
            border-radius: 16px;
            border: 1px solid var(--otl-border);
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 13px;
        }
        .otl-icon-btn:hover:not(:disabled) {
            border-color: rgba(120, 140, 180, 0.45);
            background: rgba(74, 93, 130, 0.16);
            color: #d7e6ff;
        }
        .otl-icon-btn svg {
            width: 16px;
            height: 16px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .otl-icon-btn.primary {
            background: #f2f3f7;
            color: #11131a;
            border-color: rgba(255,255,255,0.3);
        }
        .otl-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .otl-poi-list { display:flex; flex-direction:column; gap:8px; max-height: 220px; overflow:auto; }
        .otl-poi-item {
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            padding: 8px;
            background: #181820;
            display:grid;
            grid-template-columns: 70px 1fr;
            gap: 8px;
        }
        .otl-thumb { width:70px; height:52px; border-radius:4px; background:#000; object-fit:cover; }
        .otl-poi-meta { display:flex; flex-direction:column; gap:6px; }
        .otl-status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
        .otl-footer {
            border-top: 1px solid var(--otl-border);
            background: var(--otl-bg-input);
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .otl-footer .otl-muted[data-role="status"] { display: none; }
        .otl-run-status {
            font-size: 11px;
            color: var(--otl-text-muted);
            font-weight: 500;
            margin-left: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }
        .otl-playback-speed {
            width: 74px;
            height: 28px;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            font-size: 12px;
            padding: 0 8px;
        }
        .otl-settings-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            z-index: 9998;
        }
        .otl-settings-modal.hidden { display: none; }
        .otl-settings-panel {
            width: min(980px, calc(100vw - 56px));
            max-height: calc(100vh - 64px);
            overflow: hidden;
            border: 1px solid #2e2e36;
            border-radius: 12px;
            background: #16161a;
            box-shadow: 0 24px 50px rgba(0,0,0,0.6);
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        .otl-table-wrap {
            border: none;
            border-top: 1px solid #2e2e36;
            padding: 16px 18px;
            overflow: auto;
            max-height: calc(100vh - 160px);
            background: transparent;
        }
        .otl-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .otl-table th,
        .otl-table td {
            border-bottom: 1px solid var(--otl-border);
            padding: 8px;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }
        .otl-table th { color: var(--otl-text-muted); font-weight: 600; }
        .otl-cell-content {
            max-width: 220px;
            white-space: normal;
            line-height: 1.4;
            color: #cfd3df;
        }
        .otl-cell-actions { display:flex; gap:6px; flex-wrap: wrap; }
        .otl-mini-thumb { width: 52px; height: 38px; object-fit: cover; border-radius: 4px; background:#000; }
        .otl-settings-head {
            display:flex;
            align-items: center;
            gap:10px;
            padding: 14px 18px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid #2e2e36;
        }
        .otl-settings-head .otl-step-actions { margin-left: auto; }
        .otl-status-pill {
            border: 1px solid var(--otl-border);
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 11px;
            color: var(--otl-text-muted);
        }
        .otl-form-col { display:flex; flex-direction: column; gap:8px; }
        .otl-provider-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .otl-provider-card {
            border: 1px solid #2e3544;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(10,14,22,0.5);
        }
        .otl-provider-card.active {
            border-color: rgba(59,130,246,0.55);
            box-shadow: inset 0 0 0 1px rgba(59,130,246,0.18);
        }
        .otl-provider-radio {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--otl-text-main);
        }
        .otl-provider-radio input { margin: 0; }
        .otl-provider-summary {
            border-top: 1px solid #2b3240;
            padding-top: 8px;
        }
        .otl-row-cards {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .otl-poi-card {
            border: 1px solid #2e2e36;
            border-radius: 8px;
            background: #1f1f24;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-poi-row-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        .otl-poi-id {
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 12px;
            color: var(--otl-text-muted);
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .otl-title-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #3b82f6;
            box-shadow: 0 0 8px rgba(59,130,246,0.55);
            flex-shrink: 0;
        }
        .otl-poi-params { display:flex; align-items:center; gap:8px; flex-shrink: 0; }
        .otl-poi-actions-inline { display:flex; align-items:center; gap:6px; }
        .otl-inline-group {
            display:flex;
            align-items:center;
            border: 1px solid #2e2e36;
            border-radius: 4px;
            overflow: hidden;
            background: #121216;
        }
        .otl-inline-label {
            font-size: 10px;
            color: var(--otl-text-muted);
            letter-spacing: 0.4px;
            padding: 0 8px;
            border-right: 1px solid #2e2e36;
            height: 26px;
            display:flex;
            align-items:center;
        }
        .otl-inline-input {
            border: none;
            background: transparent;
            color: var(--otl-text-main);
            font-size: 12px;
            height: 26px;
            padding: 0 8px;
            outline: none;
        }
        .otl-inline-input.name { width: 150px; }
        .otl-inline-input.num { width: 58px; text-align:center; }
        .otl-poi-icon {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--otl-text-muted);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .otl-poi-icon:hover { border-color: rgba(120,140,180,0.45); background: rgba(74,93,130,0.16); color: #cfe0ff; }
        .otl-poi-icon.danger:hover { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.1); color: #ef4444; }
        .otl-poi-row-bottom {
            display: flex;
            gap: 12px;
            align-items: stretch;
            min-height: 118px;
        }
        .otl-poi-preview {
            width: 170px;
            height: 100%;
            border-radius: 7px;
            object-fit: cover;
            background: #000;
            border: 1px solid #2e2e36;
            flex-shrink: 0;
        }
        .otl-poi-content-wrap { position: relative; flex: 1; min-height: 118px; }
        .otl-poi-content {
            width: 100%;
            min-height: 118px;
            max-height: 300px;
            resize: vertical;
            overflow-y: auto;
            border: 1px solid #2e2e36;
            border-radius: 7px;
            background: #121216;
            color: var(--otl-text-main);
            padding: 10px 40px 10px 12px;
            outline: none;
            font-size: 12.5px;
            line-height: 1.45;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .otl-poi-content:focus { border-color: #3f3f4a; background: #15151a; }
        .otl-poi-gen {
            position: absolute;
            right: 8px;
            bottom: 8px;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid #2e2e36;
            background: #1f1f24;
            color: #60a5fa;
            cursor: pointer;
        }
        .otl-poi-gen:hover:not(:disabled) { border-color: #3b82f6; background: rgba(59,130,246,0.12); }
        .otl-poi-gen:disabled { opacity: 0.55; cursor: wait; }
        .otl-poi-prompt {
            position: absolute;
            right: 42px;
            bottom: 8px;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid #2e2e36;
            background: #1f1f24;
            color: #9bb8ff;
            cursor: pointer;
        }
        .otl-poi-prompt:hover:not(:disabled) { border-color: #6f97ff; background: rgba(111,151,255,0.13); }
        .otl-poi-prompt:disabled { opacity: 0.55; cursor: wait; }
        .otl-poi-preview.placeholder {
            background:
                radial-gradient(circle at 22% 28%, rgba(116,174,255,0.40), transparent 38%),
                radial-gradient(circle at 76% 78%, rgba(139,92,246,0.30), transparent 42%),
                linear-gradient(145deg, #121827, #0f1320);
            border-color: #354059;
        }
        .otl-llm-popover {
            position: fixed;
            min-width: 460px;
            max-width: 520px;
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #191d28;
            padding: 10px;
            z-index: 10000;
            box-shadow: 0 12px 24px rgba(0,0,0,0.45);
        }
        .otl-llm-popover.hidden { display:none; }
        .otl-llm-info { font-size: 12px; color: var(--otl-text-main); line-height: 1.5; word-break: break-all; }
        .otl-prompt-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            padding: 24px;
        }
        .otl-prompt-modal.hidden { display:none; }
        .otl-prompt-panel {
            width: min(760px, calc(100vw - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display:flex;
            flex-direction:column;
            gap: 10px;
        }
        .otl-prompt-input {
            width: 100%;
            min-height: 180px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 12px;
            line-height: 1.45;
            outline: none;
        }
        .otl-csv-workspace-panel {
            width: min(1080px, calc(100vw - 40px));
            max-height: min(760px, calc(100vh - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
        }
        .otl-csv-workspace-panel.floating {
            position: fixed;
        }
        .otl-csv-workspace-panel.fullscreen {
            position: fixed;
            left: 12px !important;
            top: 12px !important;
            width: calc(100vw - 24px) !important;
            height: calc(100vh - 24px);
            max-height: none;
            border-radius: 10px;
            z-index: 10003;
        }
        .otl-csv-workspace-drag-handle {
            cursor: move;
            user-select: none;
        }
        .otl-csv-workspace-grid {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 10px;
            min-height: 420px;
            flex: 1;
        }
        .otl-csv-version-list {
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            padding: 8px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .otl-csv-version-item {
            text-align: left;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #181c27;
            color: var(--otl-text-main);
            padding: 8px;
            cursor: pointer;
            font-size: 12px;
        }
        .otl-csv-version-item.active {
            border-color: #4b73ff;
            box-shadow: inset 0 0 0 1px rgba(75, 115, 255, 0.35);
        }
        .otl-csv-editor {
            width: 100%;
            min-height: 420px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 12px;
            line-height: 1.45;
            outline: none;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        }
        .otl-csv-grid-wrap {
            width: 100%;
            min-height: 420px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            overflow: auto;
        }
        .otl-csv-grid {
            width: max-content;
            min-width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .otl-csv-grid th,
        .otl-csv-grid td {
            border-right: 1px solid #272c3a;
            border-bottom: 1px solid #272c3a;
            padding: 0;
            vertical-align: top;
            background: #11131b;
        }
        .otl-csv-grid th {
            position: sticky;
            top: 0;
            z-index: 2;
            background: #1a1f2c;
            color: #aeb9d7;
            font-weight: 700;
            padding: 7px 8px;
            min-width: 120px;
        }
        .otl-csv-grid td {
            min-width: 120px;
        }
        .otl-csv-grid-cell {
            width: 100%;
            min-width: 120px;
            border: none;
            outline: none;
            background: transparent;
            color: var(--otl-text-main);
            padding: 7px 8px;
            font-size: 12px;
            line-height: 1.35;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        }
        .otl-csv-grid-cell:focus {
            background: rgba(75, 115, 255, 0.16);
            box-shadow: inset 0 0 0 1px rgba(75, 115, 255, 0.35);
        }
        .otl-csv-content-cell {
            min-height: 31px;
            padding: 7px 8px;
            color: var(--otl-text-main);
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 320px;
        }
        .otl-csv-content-cell:hover {
            background: rgba(75, 115, 255, 0.12);
        }
        .otl-csv-content-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-csv-content-modal.hidden { display: none; }
        .otl-csv-content-panel {
            width: min(860px, calc(100vw - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-csv-content-input {
            width: 100%;
            min-height: 300px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 13px;
            line-height: 1.5;
            outline: none;
        }
        .otl-csv-voice-tools {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .otl-csv-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .otl-csv-toolbar-sep {
            width: 1px;
            height: 22px;
            background: rgba(148, 163, 184, 0.18);
            margin: 0 2px;
        }
        .otl-check {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--otl-text-main);
            font-size: 12px;
        }
        .otl-check input { accent-color: var(--otl-primary); }
        .otl-voice-pill {
            border: 1px solid var(--otl-border);
            border-radius: 999px;
            padding: 4px 10px;
            background: #121723;
            color: #cbd5e1;
            font-size: 11px;
        }
        .otl-voice-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-voice-modal.hidden { display: none; }
        .otl-voice-panel {
            width: min(520px, calc(100vw - 32px));
            max-height: min(720px, calc(100vh - 32px));
            overflow: auto;
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-config-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-config-modal.hidden { display: none; }
        .otl-config-panel {
            width: min(420px, calc(100vw - 32px));
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-config-stat {
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #11131b;
            padding: 10px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }
        .otl-config-stat strong {
            color: var(--otl-text-main);
            font-size: 14px;
        }
        .otl-voice-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 420px;
            overflow: auto;
            padding-right: 4px;
        }
        .otl-voice-group-title {
            color: var(--otl-text-muted);
            font-size: 11px;
            margin-top: 8px;
        }
        .otl-voice-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
        }
        .otl-voice-item-main {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .otl-voice-code {
            color: var(--otl-text-muted);
            font-size: 11px;
        }
        .otl-toolbar-title {
            font-size: 11px;
            color: var(--otl-text-muted);
            margin-right: 4px;
        }
        .otl-muted { color: var(--otl-text-muted); font-size: 11px; }
        .otl-hidden { display: none !important; }
        @media (max-width: 980px) {
            #${PANEL_ID} {
                right: 8px;
                top: 72px;
                width: min(460px, calc(100vw - 16px));
                height: fit-content;
                max-height: calc(100vh - 82px);
            }
            .otl-map-grid { grid-template-columns: 1fr; }
            .otl-settings-panel { width: min(760px, calc(100vw - 16px)); }
            .otl-poi-row-top { flex-wrap: wrap; }
            .otl-poi-row-bottom { flex-direction: column; height: auto; }
            .otl-poi-preview { width: 100%; height: 140px; }
            .otl-provider-tabs { grid-template-columns: 1fr; }
            .otl-csv-workspace-panel { width: min(1080px, calc(100vw - 16px)); }
            .otl-csv-workspace-grid { grid-template-columns: 1fr; min-height: 0; }
            .otl-csv-version-list { max-height: 180px; }
            .otl-csv-grid-wrap { min-height: 260px; }
            .otl-csv-editor { min-height: 260px; }
        }
    `;
    if (!existing) document.head.appendChild(style);
};

const escapeCsv = (value: string | number) => {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

const normalizeCsvVoiceConfig = (config?: Partial<CsvVoiceConfigState> | null): CsvVoiceConfigState => {
    const model = TTS_VOICE_OPTIONS_BY_MODEL[String(config?.model || '').trim()]
        ? String(config?.model || '').trim()
        : DEFAULT_TTS_MODEL;
    const options = TTS_VOICE_OPTIONS_BY_MODEL[model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    const fixedVoice = options.some((item) => item.value === String(config?.fixedVoice || '').trim())
        ? String(config?.fixedVoice || '').trim()
        : (options.find((item) => item.value === DEFAULT_TTS_VOICE)?.value || options[0]?.value || DEFAULT_TTS_VOICE);
    const voicePool = Array.isArray(config?.voicePool)
        ? Array.from(new Set(config.voicePool.map((item) => String(item || '').trim()).filter((item) => options.some((opt) => opt.value === item))))
        : [];
    const enabled = Boolean(config?.enabled) && voicePool.length > 0;
    return {
        enabled,
        mode: enabled ? 'shuffle_round_robin' : 'fixed',
        model,
        fixedVoice,
        voicePool
    };
};

const summarizeCsvVoiceConfig = (config: CsvVoiceConfigState) => {
    if (!config.enabled || config.voicePool.length < 1) return `固定声音: ${config.fixedVoice}`;
    return `洗牌轮询: ${config.voicePool.length} voices`;
};

const normalizeCsvTimingConfig = (config?: Partial<CsvTimingConfigState> | null): CsvTimingConfigState => {
    const targetDurationSec = Math.max(5, Math.min(900, Number(config?.targetDurationSec) || DEFAULT_CSV_TARGET_DURATION_SEC));
    return {
        enabled: Boolean(config?.enabled),
        targetDurationSec
    };
};

const formatCsvTimingSummary = (summary?: CsvTimingSummary | null) => {
    if (!summary?.enabled) return '';
    const target = Number(summary.targetDurationSec).toFixed(summary.targetDurationSec % 1 === 0 ? 0 : 1);
    const estimated = typeof summary.estimatedDurationSec === 'number' && Number.isFinite(summary.estimatedDurationSec)
        ? `预计 ${summary.estimatedDurationSec.toFixed(1)}s`
        : '';
    const minimum = typeof summary.minimumAchievableSec === 'number' && Number.isFinite(summary.minimumAchievableSec)
        ? `最短 ${summary.minimumAchievableSec.toFixed(1)}s`
        : '';
    return [
        `目标 ${target}s`,
        estimated,
        minimum
    ].filter(Boolean).join(' | ');
};

const describeTimingValue = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '尚未计算';
    return `${value.toFixed(1)}s`;
};

class TourLoaderPanel implements TourLoaderController {
    private readonly root: HTMLDivElement;
    private readonly topCanvas: HTMLCanvasElement;
    private readonly frontCanvas: HTMLCanvasElement;
    private readonly poiSelect: HTMLSelectElement;
    private readonly poiNameInput: HTMLInputElement;
    private readonly speedSelect: HTMLSelectElement;
    private readonly playbackSpeedSelect: HTMLSelectElement;
    private readonly statusEl: HTMLDivElement;
    private readonly runStatusEl: HTMLSpanElement;
    private readonly poiListEl: HTMLDivElement;
    private readonly importInput: HTMLInputElement;
    private readonly batchGenerateBtn: HTMLButtonElement;
    private readonly stopBatchBtn: HTMLButtonElement;
    private readonly resumeBatchBtn: HTMLButtonElement;
    private readonly settingsModal: HTMLDivElement;
    private readonly batchModal: HTMLDivElement;
    private readonly batchProgressEl: HTMLDivElement;
    private readonly llmPopover: HTMLDivElement;
    private readonly llmInfoEl: HTMLDivElement;
    private readonly llmProviderInputs: NodeListOf<HTMLInputElement>;
    private readonly geminiModelInput: HTMLSelectElement;
    private readonly geminiApiKeyInput: HTMLInputElement;
    private readonly qwenModelInput: HTMLSelectElement;
    private readonly qwenApiKeyInput: HTMLInputElement;
    private readonly promptModal: HTMLDivElement;
    private readonly promptInput: HTMLTextAreaElement;
    private readonly csvPromptModal: HTMLDivElement;
    private readonly csvPromptInput: HTMLTextAreaElement;
    private readonly movePromptModal: HTMLDivElement;
    private readonly movePromptInput: HTMLTextAreaElement;
    private readonly csvWorkspaceModal: HTMLDivElement;
    private readonly csvWorkspacePanel: HTMLDivElement;
    private readonly csvVersionListEl: HTMLDivElement;
    private readonly csvGridWrapEl: HTMLDivElement;
    private readonly csvGridTableEl: HTMLTableElement;
    private readonly csvEditorInput: HTMLTextAreaElement;
    private readonly csvWorkspaceStatusEl: HTMLDivElement;
    private readonly csvTimingSummaryEl: HTMLDivElement;
    private readonly csvVoiceEnabledInput: HTMLInputElement;
    private readonly csvVoiceSummaryEl: HTMLDivElement;
    private readonly csvTimingEnabledInput: HTMLInputElement;
    private readonly csvTimingInput: HTMLInputElement;
    private readonly csvTimingModal: HTMLDivElement;
    private readonly csvTimingMinimumEl: HTMLDivElement;
    private readonly csvTimingEstimatedEl: HTMLDivElement;
    private readonly csvVoiceModal: HTMLDivElement;
    private readonly csvVoiceModelSelect: HTMLSelectElement;
    private readonly csvVoiceFixedSelect: HTMLSelectElement;
    private readonly csvVoiceListEl: HTMLDivElement;
    private readonly csvContentModal: HTMLDivElement;
    private readonly csvContentTitleEl: HTMLDivElement;
    private readonly csvContentInput: HTMLTextAreaElement;
    private readonly stopBtn: HTMLButtonElement;
    private readonly playToggleBtn: HTMLButtonElement;
    private readonly globalSaveBtn: HTMLButtonElement;

    private modelFilename: string | null = null;
    private modelReady = false;
    private eyeHeightM = 1.65;
    private points: WorldPoint[] = [];
    private pois: TourPoi[] = [];
    private selectedPoiId: string | null = null;
    private saveTimer = 0;
    private job: JobState = { jobId: null, paused: false, streaming: false };
    private eventSource: EventSource | null = null;
    private csvExportEventSource: EventSource | null = null;
    private drag: {
        active: boolean;
        pointerId: number;
        mode: 'top-pan' | 'front-pan' | 'top-yaw' | 'front-pitch' | 'front-move' | null;
        startX: number;
        startY: number;
    } = { active: false, pointerId: -1, mode: null, startX: 0, startY: 0 };
    private topView = { zoom: 1, offsetX: 0, offsetY: 0 };
    private frontView = { zoom: 1, offsetX: 0, offsetY: 0 };
    private topBounds: MapBounds = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    private frontBounds: MapBounds = { xMin: -5, xMax: 5, yMin: -1, yMax: 3 };
    private topBitmapCanvas: HTMLCanvasElement | null = null;
    private frontBitmapCanvas: HTMLCanvasElement | null = null;
    private panelDrag = { active: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private unsubscribeModelLoaded: (() => void) | null = null;
    private llmConfig: LlmConfigState = {
        selectedProvider: 'gemini',
        gemini: { modelName: DEFAULT_LLM_MODEL, apiKey: '' },
        qwen: { modelName: DEFAULT_QWEN_MODEL, apiKey: '' },
        updatedAt: null,
        promptUpdatedAt: null
    };
    private promptTemplate = DEFAULT_PROMPT_TEMPLATE;
    private csvPromptTemplate = DEFAULT_CSV_PROMPT_TEMPLATE;
    private movePromptTemplate = DEFAULT_MOVE_PROMPT_TEMPLATE;
    private csvVersions: CsvVersionSummary[] = [];
    private selectedCsvVersionId: number | null = null;
    private csvEditorDirty = false;
    private csvGridHeaders: string[] = [];
    private csvGridRows: string[][] = [];
    private csvContentEditTarget: { row: number; col: number } | null = null;
    private csvWorkspaceFullscreen = false;
    private csvWorkspaceDrag = { active: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private csvVoiceConfig: CsvVoiceConfigState = normalizeCsvVoiceConfig(null);
    private csvTimingConfig: CsvTimingConfigState = normalizeCsvTimingConfig(null);
    private csvTimingSummary: CsvTimingSummary | null = null;
    private promptEditorContext: PromptEditorContext = { scope: 'global' };
    private batchProgress = { index: 0, total: 0, poiId: '' };
    private playback = {
        playing: false,
        paused: false,
        rafId: 0,
        index: 0,
        segmentStartMs: 0,
        segmentDurationMs: 0,
        dwellUntilMs: 0
    };
    private liveDrawRaf = 0;
    private lastLiveDrawAt = 0;
    private lastLivePose: CameraPose | null = null;

    constructor(private readonly options: TourLoaderOptions) {
        ensureStyle();
        this.root = document.createElement('div');
        this.root.id = PANEL_ID;
        this.root.className = 'hidden';
        this.root.innerHTML = `
            <div class="otl-header" data-role="drag-handle">
                <div class="otl-title">Tour Loader</div>
                <div class="otl-header-playback">
                    <button class="otl-icon-btn" data-act="play-stop" title="Stop">■</button>
                    <button class="otl-icon-btn primary" data-act="play-toggle" title="Play">▶</button>
                    <select class="otl-playback-speed" data-role="playback-speed">
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2x</option>
                    </select>
                </div>
                <div class="otl-header-actions">
                    <button class="otl-icon-btn" data-act="open-llm-config" title="LLM Config">🧠</button>
                    <button class="otl-icon-btn" data-act="hide" title="Hide">✕</button>
                </div>
            </div>
            <div class="otl-content">
                <section class="otl-card">
                    <div class="otl-step-head"><span class="otl-badge">1</span>Map</div>
                    <div class="otl-map-grid">
                        <div class="otl-map-box">
                            <div class="otl-map-label">TopView (position + yaw)</div>
                            <canvas class="otl-map" width="210" height="180" data-map="top"></canvas>
                            <div class="otl-map-controls">
                                <button class="otl-icon-btn" data-act="top-zoom-in" title="Top Zoom In">+</button>
                                <button class="otl-icon-btn" data-act="top-zoom-out" title="Top Zoom Out">−</button>
                                <button class="otl-icon-btn" data-act="top-center" title="Center Top">◎</button>
                            </div>
                        </div>
                        <div class="otl-map-box">
                            <div class="otl-map-label">FrontView (pitch)</div>
                            <canvas class="otl-map" width="210" height="180" data-map="front"></canvas>
                            <div class="otl-map-controls">
                                <button class="otl-icon-btn" data-act="front-zoom-in" title="Front Zoom In">+</button>
                                <button class="otl-icon-btn" data-act="front-zoom-out" title="Front Zoom Out">−</button>
                                <button class="otl-icon-btn" data-act="front-center" title="Center Front">◎</button>
                            </div>
                        </div>
                    </div>
                </section>
                <section class="otl-card">
                    <div class="otl-step-head">
                        <span class="otl-badge">2</span>POI
                        <div class="otl-step-actions">
                            <button class="otl-icon-btn" data-act="update-current" title="Update to Current View">↺</button>
                            <button class="otl-icon-btn" data-act="poi-delete" title="Delete POI">🗑</button>
                        </div>
                    </div>
                    <div class="otl-row">
                        <select class="otl-select" data-role="poi-select"></select>
                        <input class="otl-input" data-role="poi-name" placeholder="POI Name" />
                    </div>
                </section>
                <section class="otl-card">
                    <div class="otl-step-head">
                        <span class="otl-badge">3</span>Recording
                        <span class="otl-run-status" data-role="run-status"></span>
                        <div class="otl-step-actions">
                            <button class="otl-icon-btn" data-act="run-settings" title="Run Settings">⚙</button>
                        </div>
                    </div>
                    <div class="otl-row">
                        <button class="otl-btn primary" data-act="run-record" style="flex:1">Record</button>
                        <select class="otl-select" data-role="speed" style="width:82px">
                            <option value="0.5">0.5x</option>
                            <option value="1" selected>1x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                        </select>
                    </div>
                </section>
                <section class="otl-card">
                    <div class="otl-step-head">
                        <span class="otl-badge">4</span>CSV
                        <div class="otl-step-actions">
                            <button class="otl-icon-btn" data-act="open-csv-prompt" title="CSV Prompt Settings">⚙</button>
                            <button class="otl-icon-btn" data-act="open-move-prompt" title="MOVE Prompt Settings">⇢</button>
                        </div>
                    </div>
                    <div class="otl-row">
                        <button class="otl-btn" data-act="export-csv" style="flex:1">Export CSV</button>
                        <button class="otl-btn" data-act="import-csv" style="flex:1">Import CSV</button>
                        <input type="file" accept=".csv,text/csv" data-role="import-input" hidden />
                    </div>
                </section>
            </div>
            <div class="otl-footer">
                <div class="otl-muted" data-role="status">Ready</div>
                <div class="otl-muted" style="margin-left:auto;">Version ${OT_TOUR_CSV_VERSION}</div>
            </div>
            <div class="otl-settings-modal hidden" data-role="run-settings-modal">
                <div class="otl-settings-panel">
                    <div class="otl-settings-head">
                        <span class="otl-badge">◉</span><span style="font-size:14px;font-weight:700;">POI List</span>
                        <span class="otl-status-pill" data-role="batch-inline-status">Idle</span>
                        <div class="otl-step-actions">
                            <button class="otl-icon-btn" data-act="save-all-pois" title="Save All POIs">💾</button>
                            <button class="otl-icon-btn" data-act="open-global-prompt" title="Global Prompt Settings">⚙</button>
                            <button class="otl-icon-btn" data-act="batch-generate" title="Batch Generate Content">✦</button>
                            <button class="otl-icon-btn" data-act="settings-close" title="Close">✕</button>
                        </div>
                    </div>
                    <div class="otl-table-wrap">
                        <div class="otl-row-cards" data-role="poi-list"></div>
                    </div>
                </div>
            </div>
            <div class="otl-settings-modal hidden" data-role="batch-modal">
                <div class="otl-settings-panel" style="width:min(460px,calc(100vw - 40px));">
                    <div class="otl-settings-head">
                        <span class="otl-badge">⚙</span><span style="font-size:13px;font-weight:700;">Batch Progress</span>
                        <div class="otl-step-actions">
                            <button class="otl-btn" data-act="batch-close">Close</button>
                        </div>
                    </div>
                    <div class="otl-muted" data-role="batch-progress">Not started</div>
                    <div class="otl-row">
                        <button class="otl-btn" data-act="stop-batch">Stop</button>
                        <button class="otl-btn" data-act="resume-batch">Resume</button>
                    </div>
                </div>
            </div>
            <div class="otl-llm-popover hidden" data-role="llm-popover">
                <div class="otl-muted" style="margin-bottom:6px;">LLM Global Config</div>
                <div class="otl-form-col">
                    <div class="otl-provider-tabs">
                        <div class="otl-provider-card" data-provider-card="gemini">
                            <label class="otl-provider-radio">
                                <input type="radio" name="otl-provider" value="gemini" data-role="llm-provider" checked />
                                <span>Gemini</span>
                            </label>
                            <label class="otl-muted">Gemini Model</label>
                            <select class="otl-select" data-role="gemini-model"></select>
                            <label class="otl-muted">Gemini API Key</label>
                            <input class="otl-input" data-role="gemini-api-key" type="password" placeholder="AIza..." />
                        </div>
                        <div class="otl-provider-card" data-provider-card="qwen">
                            <label class="otl-provider-radio">
                                <input type="radio" name="otl-provider" value="qwen" data-role="llm-provider" />
                                <span>Qwen</span>
                            </label>
                            <label class="otl-muted">Qwen Model</label>
                            <select class="otl-select" data-role="qwen-model"></select>
                            <label class="otl-muted">Qwen API Key</label>
                            <input class="otl-input" data-role="qwen-api-key" type="password" placeholder="sk-..." />
                        </div>
                    </div>
                    <div class="otl-provider-summary">
                        <div class="otl-muted" style="margin-bottom:6px;">Current Selection</div>
                        <div class="otl-llm-info" data-role="llm-info">Loading...</div>
                    </div>
                </div>
                <div class="otl-row" style="margin-top:10px; justify-content:flex-end;">
                    <button class="otl-btn primary" data-act="llm-save">Save</button>
                    <button class="otl-btn" data-act="llm-close">Close</button>
                </div>
            </div>
            <div class="otl-prompt-modal hidden" data-role="prompt-modal">
                <div class="otl-prompt-panel">
                    <div class="otl-step-head"><span class="otl-badge">✦</span><span data-role="prompt-title">Prompt Template</span></div>
                    <textarea class="otl-prompt-input" data-role="prompt-input"></textarea>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn" data-act="prompt-default">Restore Default</button>
                        <button class="otl-btn primary" data-act="prompt-save">Save</button>
                        <button class="otl-btn" data-act="prompt-close">Close</button>
                    </div>
                </div>
            </div>
            <div class="otl-prompt-modal hidden" data-role="csv-prompt-modal">
                <div class="otl-prompt-panel">
                    <div class="otl-step-head"><span class="otl-badge">⇄</span>CSV Prompt Template</div>
                    <textarea class="otl-prompt-input" data-role="csv-prompt-input"></textarea>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn" data-act="csv-prompt-default">Restore Default</button>
                        <button class="otl-btn primary" data-act="csv-prompt-save">Save</button>
                        <button class="otl-btn" data-act="csv-prompt-close">Close</button>
                    </div>
                </div>
            </div>
            <div class="otl-prompt-modal hidden" data-role="move-prompt-modal">
                <div class="otl-prompt-panel">
                    <div class="otl-step-head"><span class="otl-badge">⇢</span>MOVE Prompt Template</div>
                    <textarea class="otl-prompt-input" data-role="move-prompt-input"></textarea>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn" data-act="move-prompt-default">Restore Default</button>
                        <button class="otl-btn primary" data-act="move-prompt-save">Save</button>
                        <button class="otl-btn" data-act="move-prompt-close">Close</button>
                    </div>
                </div>
            </div>
            <div class="otl-settings-modal hidden" data-role="csv-workspace-modal">
                <div class="otl-csv-workspace-panel" data-role="csv-workspace-panel">
                    <div class="otl-step-head otl-csv-workspace-drag-handle" data-role="csv-workspace-drag-handle">
                        <span class="otl-badge">CSV</span><span style="font-size:14px;font-weight:700;">CSV Workspace</span>
                        <div class="otl-step-actions">
                            <div class="otl-csv-toolbar">
                                <button class="otl-icon-btn" data-act="csv-timing-config" title="巡游时长限制">${CSV_ICON_TIMING}</button>
                                <button class="otl-icon-btn" data-act="csv-voice-config" title="TTS 声音配置">${CSV_ICON_VOICE}</button>
                                <span class="otl-csv-toolbar-sep"></span>
                                <button class="otl-icon-btn primary" data-act="csv-version-generate" title="生成新版本">${CSV_ICON_GENERATE}</button>
                                <button class="otl-icon-btn" data-act="csv-version-save" title="保存当前版本">${CSV_ICON_SAVE}</button>
                                <button class="otl-icon-btn" data-act="csv-version-save-new" title="另存为新版本">${CSV_ICON_SAVE_AS}</button>
                                <button class="otl-icon-btn" data-act="csv-version-delete" title="删除当前版本">${CSV_ICON_DELETE}</button>
                                <button class="otl-icon-btn" data-act="csv-version-download" title="下载 CSV">${CSV_ICON_DOWNLOAD}</button>
                                <span class="otl-csv-toolbar-sep"></span>
                                <button class="otl-icon-btn" data-act="csv-workspace-fullscreen" title="Fullscreen">${CSV_ICON_FULLSCREEN}</button>
                                <button class="otl-icon-btn" data-act="csv-workspace-close" title="Close">${CSV_ICON_CLOSE}</button>
                            </div>
                        </div>
                    </div>
                    <div class="otl-csv-workspace-grid">
                        <div class="otl-csv-version-list" data-role="csv-version-list"></div>
                        <div class="otl-csv-grid-wrap" data-role="csv-grid-wrap">
                            <table class="otl-csv-grid" data-role="csv-grid-table"></table>
                        </div>
                        <textarea class="otl-csv-editor otl-hidden" data-role="csv-editor-input" placeholder="Generate or select a CSV version."></textarea>
                    </div>
                    <div class="otl-row" style="justify-content:space-between;">
                        <div class="otl-csv-voice-tools">
                            <div class="otl-muted" data-role="csv-workspace-status">Ready</div>
                            <div class="otl-voice-pill" data-role="csv-voice-summary">固定声音: ${DEFAULT_TTS_VOICE}</div>
                        </div>
                        <div class="otl-muted" data-role="csv-timing-summary">Timing: default generation</div>
                    </div>
                </div>
            </div>
            <div class="otl-voice-modal hidden" data-role="csv-voice-modal">
                <div class="otl-voice-panel">
                    <div class="otl-step-head"><span class="otl-badge">♪</span><span style="font-size:14px;font-weight:700;">Alibaba TTS Voices</span></div>
                    <label class="otl-check"><input type="checkbox" data-role="csv-voice-enabled" />启用多声音洗牌轮询</label>
                    <div class="otl-row">
                        <label class="otl-muted" style="min-width:72px;">语音模型</label>
                        <select class="otl-select" data-role="csv-voice-model">
                            <option value="cosyvoice-v3-plus">高质量语音</option>
                            <option value="cosyvoice-v3-flash">低延迟语音</option>
                        </select>
                    </div>
                    <div class="otl-row">
                        <label class="otl-muted" style="min-width:72px;">固定声音</label>
                        <select class="otl-select" data-role="csv-voice-fixed"></select>
                    </div>
                    <div class="otl-muted">勾选多个声音后，生成 CSV 时会按洗牌轮询策略逐行写入 tts_voice。</div>
                    <div class="otl-voice-list" data-role="csv-voice-list"></div>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn primary" data-act="csv-voice-save">Done</button>
                        <button class="otl-btn" data-act="csv-voice-close">Close</button>
                    </div>
                </div>
            </div>
            <div class="otl-config-modal hidden" data-role="csv-timing-modal">
                <div class="otl-config-panel">
                    <div class="otl-step-head"><span class="otl-badge">⏱</span><span style="font-size:14px;font-weight:700;">Tour Duration</span></div>
                    <label class="otl-check"><input type="checkbox" data-role="csv-timing-enabled" />启用总时长限制</label>
                    <div class="otl-row">
                        <label class="otl-muted" style="min-width:88px;">目标时长</label>
                        <input class="otl-input" data-role="csv-timing-input" type="number" min="5" max="900" step="1" value="30" />
                        <div class="otl-muted">秒</div>
                    </div>
                    <div class="otl-config-stat"><span class="otl-muted">最短可达</span><strong data-role="csv-timing-minimum">尚未计算</strong></div>
                    <div class="otl-config-stat"><span class="otl-muted">预计总时长</span><strong data-role="csv-timing-estimated">尚未计算</strong></div>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn" data-act="csv-timing-estimate">Estimate</button>
                        <button class="otl-btn primary" data-act="csv-timing-save">Done</button>
                        <button class="otl-btn" data-act="csv-timing-close">Close</button>
                    </div>
                </div>
            </div>
            <div class="otl-csv-content-modal hidden" data-role="csv-content-modal">
                <div class="otl-csv-content-panel">
                    <div class="otl-step-head"><span class="otl-badge">✎</span><div data-role="csv-content-title">Edit content</div></div>
                    <textarea class="otl-csv-content-input" data-role="csv-content-input"></textarea>
                    <div class="otl-row" style="justify-content:flex-end;">
                        <button class="otl-btn primary" data-act="csv-content-save">Save</button>
                        <button class="otl-btn" data-act="csv-content-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        this.topCanvas = this.root.querySelector('[data-map="top"]') as HTMLCanvasElement;
        this.frontCanvas = this.root.querySelector('[data-map="front"]') as HTMLCanvasElement;
        this.poiSelect = this.root.querySelector('[data-role="poi-select"]') as HTMLSelectElement;
        this.poiNameInput = this.root.querySelector('[data-role="poi-name"]') as HTMLInputElement;
        this.speedSelect = this.root.querySelector('[data-role="speed"]') as HTMLSelectElement;
        this.playbackSpeedSelect = this.root.querySelector('[data-role="playback-speed"]') as HTMLSelectElement;
        this.statusEl = this.root.querySelector('[data-role="status"]') as HTMLDivElement;
        this.runStatusEl = this.root.querySelector('[data-role="run-status"]') as HTMLSpanElement;
        this.poiListEl = this.root.querySelector('[data-role="poi-list"]') as HTMLDivElement;
        this.importInput = this.root.querySelector('[data-role="import-input"]') as HTMLInputElement;
        this.batchGenerateBtn = this.root.querySelector('[data-act="batch-generate"]') as HTMLButtonElement;
        this.stopBatchBtn = this.root.querySelector('[data-act="stop-batch"]') as HTMLButtonElement;
        this.resumeBatchBtn = this.root.querySelector('[data-act="resume-batch"]') as HTMLButtonElement;
        this.settingsModal = this.root.querySelector('[data-role="run-settings-modal"]') as HTMLDivElement;
        this.batchModal = this.root.querySelector('[data-role="batch-modal"]') as HTMLDivElement;
        this.batchProgressEl = this.root.querySelector('[data-role="batch-progress"]') as HTMLDivElement;
        this.llmPopover = this.root.querySelector('[data-role="llm-popover"]') as HTMLDivElement;
        this.llmInfoEl = this.root.querySelector('[data-role="llm-info"]') as HTMLDivElement;
        this.llmProviderInputs = this.root.querySelectorAll('[data-role="llm-provider"]') as NodeListOf<HTMLInputElement>;
        this.geminiModelInput = this.root.querySelector('[data-role="gemini-model"]') as HTMLSelectElement;
        this.geminiApiKeyInput = this.root.querySelector('[data-role="gemini-api-key"]') as HTMLInputElement;
        this.qwenModelInput = this.root.querySelector('[data-role="qwen-model"]') as HTMLSelectElement;
        this.qwenApiKeyInput = this.root.querySelector('[data-role="qwen-api-key"]') as HTMLInputElement;
        this.promptModal = this.root.querySelector('[data-role="prompt-modal"]') as HTMLDivElement;
        this.promptInput = this.root.querySelector('[data-role="prompt-input"]') as HTMLTextAreaElement;
        this.csvPromptModal = this.root.querySelector('[data-role="csv-prompt-modal"]') as HTMLDivElement;
        this.csvPromptInput = this.root.querySelector('[data-role="csv-prompt-input"]') as HTMLTextAreaElement;
        this.movePromptModal = this.root.querySelector('[data-role="move-prompt-modal"]') as HTMLDivElement;
        this.movePromptInput = this.root.querySelector('[data-role="move-prompt-input"]') as HTMLTextAreaElement;
        this.csvWorkspaceModal = this.root.querySelector('[data-role="csv-workspace-modal"]') as HTMLDivElement;
        this.csvWorkspacePanel = this.root.querySelector('[data-role="csv-workspace-panel"]') as HTMLDivElement;
        this.csvVersionListEl = this.root.querySelector('[data-role="csv-version-list"]') as HTMLDivElement;
        this.csvGridWrapEl = this.root.querySelector('[data-role="csv-grid-wrap"]') as HTMLDivElement;
        this.csvGridTableEl = this.root.querySelector('[data-role="csv-grid-table"]') as HTMLTableElement;
        this.csvEditorInput = this.root.querySelector('[data-role="csv-editor-input"]') as HTMLTextAreaElement;
        this.csvWorkspaceStatusEl = this.root.querySelector('[data-role="csv-workspace-status"]') as HTMLDivElement;
        this.csvTimingSummaryEl = this.root.querySelector('[data-role="csv-timing-summary"]') as HTMLDivElement;
        this.csvVoiceEnabledInput = this.root.querySelector('[data-role="csv-voice-enabled"]') as HTMLInputElement;
        this.csvVoiceSummaryEl = this.root.querySelector('[data-role="csv-voice-summary"]') as HTMLDivElement;
        this.csvTimingEnabledInput = this.root.querySelector('[data-role="csv-timing-enabled"]') as HTMLInputElement;
        this.csvTimingInput = this.root.querySelector('[data-role="csv-timing-input"]') as HTMLInputElement;
        this.csvTimingModal = this.root.querySelector('[data-role="csv-timing-modal"]') as HTMLDivElement;
        this.csvTimingMinimumEl = this.root.querySelector('[data-role="csv-timing-minimum"]') as HTMLDivElement;
        this.csvTimingEstimatedEl = this.root.querySelector('[data-role="csv-timing-estimated"]') as HTMLDivElement;
        this.csvVoiceModal = this.root.querySelector('[data-role="csv-voice-modal"]') as HTMLDivElement;
        this.csvVoiceModelSelect = this.root.querySelector('[data-role="csv-voice-model"]') as HTMLSelectElement;
        this.csvVoiceFixedSelect = this.root.querySelector('[data-role="csv-voice-fixed"]') as HTMLSelectElement;
        this.csvVoiceListEl = this.root.querySelector('[data-role="csv-voice-list"]') as HTMLDivElement;
        this.csvContentModal = this.root.querySelector('[data-role="csv-content-modal"]') as HTMLDivElement;
        this.csvContentTitleEl = this.root.querySelector('[data-role="csv-content-title"]') as HTMLDivElement;
        this.csvContentInput = this.root.querySelector('[data-role="csv-content-input"]') as HTMLTextAreaElement;
        this.stopBtn = this.root.querySelector('[data-act="play-stop"]') as HTMLButtonElement;
        this.playToggleBtn = this.root.querySelector('[data-act="play-toggle"]') as HTMLButtonElement;
        this.globalSaveBtn = this.root.querySelector('[data-act="save-all-pois"]') as HTMLButtonElement;

        this.populateSelect(this.geminiModelInput, GEMINI_MODELS);
        this.populateSelect(this.qwenModelInput, QWEN_MODELS);
        this.csvVoiceConfig = normalizeCsvVoiceConfig(this.csvVoiceConfig);
        this.csvTimingConfig = normalizeCsvTimingConfig(this.csvTimingConfig);
        this.renderCsvVoiceConfig();
        this.renderCsvTimingConfig();

        document.body.appendChild(this.root);
        this.bindEvents();
        this.refreshPlaybackUi();
        this.setModelReady(false);
        if (this.options.onModelLoaded) {
            this.unsubscribeModelLoaded = this.options.onModelLoaded(() => {
                if (!this.root.classList.contains('hidden')) {
                    void this.reload();
                }
            });
        }
        this.logDebug('system', 'panel initialized');
    }

    open() {
        this.root.classList.remove('hidden');
        this.startLiveDrawLoop();
        void this.reload();
    }

    close() {
        this.root.classList.add('hidden');
        this.settingsModal.classList.add('hidden');
        this.batchModal.classList.add('hidden');
        this.llmPopover.classList.add('hidden');
        this.promptModal.classList.add('hidden');
        this.csvPromptModal.classList.add('hidden');
        this.movePromptModal.classList.add('hidden');
        this.csvWorkspaceModal.classList.add('hidden');
        this.csvContentModal.classList.add('hidden');
        this.stopPlayback();
        this.closeCsvExportEventStream();
        this.stopLiveDrawLoop();
    }

    toggle() {
        if (this.root.classList.contains('hidden')) this.open(); else this.close();
    }

    private apiBase() {
        return this.options.apiBaseUrl || 'http://localhost:3031/api/ot-tour-loader';
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private setRunStatus(text: string) {
        this.runStatusEl.textContent = text;
    }

    private populateSelect(select: HTMLSelectElement, values: string[]) {
        select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join('');
    }

    private activeProviderConfig() {
        return this.llmConfig[this.llmConfig.selectedProvider];
    }

    private maskApiKey(apiKey: string) {
        const raw = String(apiKey || '');
        if (!raw) return '(empty)';
        if (raw.length <= 6) return `${raw.slice(0, 2)}***`;
        return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
    }

    private syncLlmProviderUi() {
        this.llmProviderInputs.forEach((input) => {
            input.checked = input.value === this.llmConfig.selectedProvider;
        });
        this.root.querySelectorAll('[data-provider-card]').forEach((node) => {
            const provider = node.getAttribute('data-provider-card');
            node.classList.toggle('active', provider === this.llmConfig.selectedProvider);
        });
    }

    private refreshLlmSummary() {
        const active = this.activeProviderConfig();
        this.llmInfoEl.innerHTML = `
            <div><strong>Provider:</strong> ${this.llmConfig.selectedProvider}</div>
            <div><strong>Model:</strong> ${active.modelName}</div>
            <div><strong>API Key:</strong> ${this.maskApiKey(active.apiKey)}</div>
            <div><strong>LLM Updated:</strong> ${this.llmConfig.updatedAt || '-'}</div>
            <div><strong>Prompt Updated:</strong> ${this.llmConfig.promptUpdatedAt || '-'}</div>
        `;
        this.syncLlmProviderUi();
    }

    private refreshPlaybackUi() {
        if (!this.playback.playing) {
            this.playToggleBtn.textContent = '▶';
            this.playToggleBtn.title = 'Play';
            this.playToggleBtn.classList.add('primary');
            return;
        }
        if (this.playback.paused) {
            this.playToggleBtn.textContent = '▶';
            this.playToggleBtn.title = 'Resume';
            this.playToggleBtn.classList.remove('primary');
            return;
        }
        this.playToggleBtn.textContent = '❚❚';
        this.playToggleBtn.title = 'Pause';
        this.playToggleBtn.classList.remove('primary');
    }

    private setPromptEditorTitle(text: string) {
        const titleEl = this.root.querySelector('[data-role="prompt-title"]') as HTMLSpanElement | null;
        if (titleEl) titleEl.textContent = text;
    }

    private setModelReady(ready: boolean) {
        this.modelReady = ready;
        const controls = this.root.querySelectorAll('button[data-act],input[data-role],select[data-role]');
        controls.forEach((el) => {
            if (!(el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
            const act = el.getAttribute('data-act') || '';
            if (act === 'hide' || act === 'settings-close' || act === 'batch-close' || act === 'llm-close' || act === 'prompt-close' || act === 'csv-prompt-close' || act === 'move-prompt-close' || act === 'csv-workspace-close') {
                el.disabled = false;
                return;
            }
            el.disabled = !ready;
        });
    }

    private hasLivePoseChanged(next: CameraPose | null) {
        const prev = this.lastLivePose;
        if (!prev && !next) return false;
        if (!prev || !next) return true;
        const de = Math.hypot(prev.eye.x - next.eye.x, prev.eye.y - next.eye.y, prev.eye.z - next.eye.z);
        const df = Math.hypot(prev.forward.x - next.forward.x, prev.forward.y - next.forward.y, prev.forward.z - next.forward.z);
        return de > 1e-4 || df > 1e-4;
    }

    private stopLiveDrawLoop() {
        if (this.liveDrawRaf) {
            window.cancelAnimationFrame(this.liveDrawRaf);
            this.liveDrawRaf = 0;
        }
    }

    private startLiveDrawLoop() {
        if (this.liveDrawRaf) return;
        const tick = (now: number) => {
            this.liveDrawRaf = 0;
            if (this.root.classList.contains('hidden')) return;
            const live = this.options.getLiveCameraPose?.()?.pose || null;
            const poseChanged = this.hasLivePoseChanged(live);
            if (poseChanged || now - this.lastLiveDrawAt > 120) {
                this.drawViews();
                this.lastLiveDrawAt = now;
                this.lastLivePose = live
                    ? {
                        eye: { ...live.eye },
                        forward: { ...live.forward }
                    }
                    : null;
            }
            this.liveDrawRaf = window.requestAnimationFrame(tick);
        };
        this.liveDrawRaf = window.requestAnimationFrame(tick);
    }

    private requireModel(showStatus = true) {
        if (this.modelReady && this.modelFilename) return true;
        if (showStatus) this.setStatus('Model unavailable');
        return false;
    }

    private logDebug(scope: string, text: string) {
        const line = `[${new Date().toISOString()}] [OT_TourLoader] ${scope}: ${text}`;
        const w = window as Window & {
            __otStep3Debug?: Record<string, Array<{ ts: number; text: string }>>;
        };
        if (!w.__otStep3Debug) w.__otStep3Debug = {};
        if (!w.__otStep3Debug.otTourLoader) w.__otStep3Debug.otTourLoader = [];
        w.__otStep3Debug.otTourLoader.push({ ts: Date.now(), text: line });
        if (w.__otStep3Debug.otTourLoader.length > 400) {
            w.__otStep3Debug.otTourLoader.splice(0, w.__otStep3Debug.otTourLoader.length - 400);
        }
        const globalDebugBody = document.querySelector('#otw-debug [data-debug="body"]') as HTMLDivElement | null;
        if (globalDebugBody) {
            const row = document.createElement('div');
            row.className = 'otw-debug-row';
            row.textContent = line;
            globalDebugBody.appendChild(row);
            globalDebugBody.scrollTop = globalDebugBody.scrollHeight;
            return;
        }
        console.debug(line);
    }

    private debugText(text: string, max = 320) {
        const escaped = String(text || '')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t');
        if (escaped.length <= max) return escaped;
        return `${escaped.slice(0, max)}...`;
    }

    private autoSizePoiContentTextarea(textarea: HTMLTextAreaElement) {
        const minHeight = 118;
        const maxHeight = 300;
        textarea.style.height = 'auto';
        const next = Math.max(minHeight, Math.min(maxHeight, textarea.scrollHeight));
        textarea.style.height = `${next}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }

    private updatePoiCardContentNode(poiId: string, content: string) {
        const textarea = this.poiListEl.querySelector(`textarea[data-field="poi-content"][data-poi-id="${poiId}"]`) as HTMLTextAreaElement | null;
        if (!textarea) return false;
        textarea.value = String(content || '');
        this.autoSizePoiContentTextarea(textarea);
        textarea.scrollTop = textarea.scrollHeight;
        return true;
    }

    private selectedPoi() {
        return this.pois.find(p => p.poiId === this.selectedPoiId) || null;
    }

    private normalizePoi(poi: Partial<TourPoi>, idx: number): TourPoi {
        return {
            poiId: String(poi.poiId || `poi_${Date.now().toString(36)}_${idx}`),
            poiName: String(poi.poiName || `POI ${idx + 1}`),
            sortOrder: Number.isFinite(Number(poi.sortOrder)) ? Number(poi.sortOrder) : idx,
            targetX: Number.isFinite(Number(poi.targetX)) ? Number(poi.targetX) : 0,
            targetY: Number.isFinite(Number(poi.targetY)) ? Number(poi.targetY) : 0,
            targetZ: Number.isFinite(Number(poi.targetZ)) ? Number(poi.targetZ) : 0,
            targetYaw: Number.isFinite(Number(poi.targetYaw)) ? Number(poi.targetYaw) : 0,
            targetPitch: Number.isFinite(Number(poi.targetPitch)) ? Number(poi.targetPitch) : 0,
            targetFov: clampFov(Number(poi.targetFov), DEFAULT_POI_FOV),
            moveSpeedMps: Number.isFinite(Number(poi.moveSpeedMps)) ? Number(poi.moveSpeedMps) : 0.8,
            dwellMs: Math.max(0, Math.floor(Number.isFinite(Number(poi.dwellMs)) ? Number(poi.dwellMs) : 1500)),
            content: String(poi.content || ''),
            ttsLang: String(poi.ttsLang || ''),
            promptTemplate: poi.promptTemplate !== undefined ? String(poi.promptTemplate || '') : DEFAULT_PROMPT_TEMPLATE,
            screenshotDataUrl: poi.screenshotDataUrl ? String(poi.screenshotDataUrl) : '',
            screenshotUpdatedAt: poi.screenshotUpdatedAt ? String(poi.screenshotUpdatedAt) : undefined,
            contentUpdatedAt: poi.contentUpdatedAt ? String(poi.contentUpdatedAt) : undefined,
            promptUpdatedAt: poi.promptUpdatedAt ? String(poi.promptUpdatedAt) : undefined
        };
    }

    private createPoi(x: number, y: number, z: number) {
        const id = `poi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const liveFov = this.options.getLiveCameraPose?.()?.fovDeg;
        return {
            poiId: id,
            poiName: `POI ${this.pois.length + 1}`,
            sortOrder: this.pois.length,
            targetX: x,
            targetY: y,
            targetZ: z,
            targetYaw: 0,
            targetPitch: 0,
            targetFov: clampFov(liveFov ?? DEFAULT_POI_FOV),
            moveSpeedMps: 0.8,
            dwellMs: 1500,
            content: '',
            ttsLang: '',
            promptTemplate: DEFAULT_PROMPT_TEMPLATE
        } as TourPoi;
    }

    private applyLiveCameraToPoi(poi: TourPoi, live: { pose: CameraPose; fovDeg: number }) {
        poi.targetX = live.pose.eye.x;
        poi.targetY = live.pose.eye.y - this.eyeHeightM;
        poi.targetZ = live.pose.eye.z;
        const f = live.pose.forward;
        poi.targetYaw = Math.atan2(f.x, f.z) * 180 / Math.PI;
        poi.targetPitch = Math.atan2(f.y, Math.hypot(f.x, f.z)) * 180 / Math.PI;
        poi.targetFov = clampFov(live.fovDeg, poi.targetFov);
    }

    private computeBoundsFromPoints(
        xSelector: (p: WorldPoint) => number,
        ySelector: (p: WorldPoint) => number,
        fallback: MapBounds,
        padMin: number,
        padScale: number
    ): MapBounds {
        if (this.points.length < 1) return fallback;
        let xMin = Number.POSITIVE_INFINITY;
        let xMax = Number.NEGATIVE_INFINITY;
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;
        this.points.forEach((p) => {
            const x = xSelector(p);
            const y = ySelector(p);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
        });
        if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
            return fallback;
        }
        const padX = Math.max(padMin, (xMax - xMin) * padScale);
        const padY = Math.max(padMin, (yMax - yMin) * padScale);
        return {
            xMin: xMin - padX,
            xMax: xMax + padX,
            yMin: yMin - padY,
            yMax: yMax + padY
        };
    }

    private rebuildMapBitmaps() {
        this.topBounds = this.computeBoundsFromPoints(
            (p) => p.x,
            (p) => -p.z,
            { xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
            0.6,
            0.08
        );
        this.frontBounds = this.computeBoundsFromPoints(
            (p) => p.x,
            (p) => p.y,
            { xMin: -5, xMax: 5, yMin: -1, yMax: 3 },
            0.5,
            0.10
        );

        const build = (canvas: HTMLCanvasElement, plot: (ctx: CanvasRenderingContext2D, p: WorldPoint) => void) => {
            const bitmap = document.createElement('canvas');
            bitmap.width = canvas.width;
            bitmap.height = canvas.height;
            const ctx = bitmap.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = '#0b0d12';
            ctx.fillRect(0, 0, bitmap.width, bitmap.height);
            const stride = Math.max(1, Math.floor(this.points.length / 30000));
            for (let i = 0; i < this.points.length; i += stride) {
                plot(ctx, this.points[i]);
            }
            return bitmap;
        };

        this.topBitmapCanvas = build(this.topCanvas, (ctx, p) => {
            const tp = this.projectTopBase(p.x, p.z);
            ctx.fillStyle = 'rgba(223,228,240,0.20)';
            ctx.fillRect(tp.x, tp.y, 1, 1);
        });
        this.frontBitmapCanvas = build(this.frontCanvas, (ctx, p) => {
            const fp = this.projectFrontBase(p.x, p.y);
            ctx.fillStyle = 'rgba(223,228,240,0.20)';
            ctx.fillRect(fp.x, fp.y, 1, 1);
        });
    }

    private projectTopBase(x: number, z: number) {
        const b = this.topBounds;
        const w = this.topCanvas.width;
        const h = this.topCanvas.height;
        const nx = (x - b.xMin) / Math.max(1e-6, b.xMax - b.xMin);
        const ny = ((-z) - b.yMin) / Math.max(1e-6, b.yMax - b.yMin);
        return { x: nx * w, y: h - ny * h };
    }

    private projectFrontBase(x: number, y: number) {
        const b = this.frontBounds;
        const w = this.frontCanvas.width;
        const h = this.frontCanvas.height;
        const nx = (x - b.xMin) / Math.max(1e-6, b.xMax - b.xMin);
        const ny = (y - b.yMin) / Math.max(1e-6, b.yMax - b.yMin);
        return { x: nx * w, y: h - ny * h };
    }

    private projectTop(x: number, z: number) {
        const w = this.topCanvas.width;
        const h = this.topCanvas.height;
        const base = this.projectTopBase(x, z);
        return {
            x: (base.x - w * 0.5) * this.topView.zoom + w * 0.5 + this.topView.offsetX,
            y: (base.y - h * 0.5) * this.topView.zoom + h * 0.5 + this.topView.offsetY
        };
    }

    private unprojectTop(cx: number, cy: number) {
        const b = this.topBounds;
        const w = this.topCanvas.width;
        const h = this.topCanvas.height;
        const baseX = (cx - this.topView.offsetX - w * 0.5) / this.topView.zoom + w * 0.5;
        const baseY = (cy - this.topView.offsetY - h * 0.5) / this.topView.zoom + h * 0.5;
        const nx = clamp(baseX / w, 0, 1);
        const ny = clamp(1 - baseY / h, 0, 1);
        return {
            x: b.xMin + nx * (b.xMax - b.xMin),
            z: -(b.yMin + ny * (b.yMax - b.yMin))
        };
    }

    private poiEyeY(poi: TourPoi) {
        return poi.targetY + this.eyeHeightM;
    }

    private projectFront(x: number, y: number) {
        const w = this.frontCanvas.width;
        const h = this.frontCanvas.height;
        const base = this.projectFrontBase(x, y);
        return {
            x: (base.x - w * 0.5) * this.frontView.zoom + w * 0.5 + this.frontView.offsetX,
            y: (base.y - h * 0.5) * this.frontView.zoom + h * 0.5 + this.frontView.offsetY
        };
    }

    private unprojectFront(cx: number, cy: number) {
        const b = this.frontBounds;
        const w = this.frontCanvas.width;
        const h = this.frontCanvas.height;
        const baseX = (cx - this.frontView.offsetX - w * 0.5) / this.frontView.zoom + w * 0.5;
        const baseY = (cy - this.frontView.offsetY - h * 0.5) / this.frontView.zoom + h * 0.5;
        const nx = clamp(baseX / w, 0, 1);
        const ny = clamp(1 - baseY / h, 0, 1);
        return {
            x: b.xMin + nx * (b.xMax - b.xMin),
            y: b.yMin + ny * (b.yMax - b.yMin)
        };
    }

    private drawViews() {
        const draw = (canvas: HTMLCanvasElement, bg: string) => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return ctx;
        };
        const topCtx = draw(this.topCanvas, '#0b0d12');
        const frontCtx = draw(this.frontCanvas, '#0b0d12');
        if (!topCtx || !frontCtx) return;

        if (this.topBitmapCanvas) {
            topCtx.setTransform(
                this.topView.zoom,
                0,
                0,
                this.topView.zoom,
                this.topCanvas.width * 0.5 * (1 - this.topView.zoom) + this.topView.offsetX,
                this.topCanvas.height * 0.5 * (1 - this.topView.zoom) + this.topView.offsetY
            );
            topCtx.drawImage(this.topBitmapCanvas, 0, 0);
            topCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        if (this.frontBitmapCanvas) {
            frontCtx.setTransform(
                this.frontView.zoom,
                0,
                0,
                this.frontView.zoom,
                this.frontCanvas.width * 0.5 * (1 - this.frontView.zoom) + this.frontView.offsetX,
                this.frontCanvas.height * 0.5 * (1 - this.frontView.zoom) + this.frontView.offsetY
            );
            frontCtx.drawImage(this.frontBitmapCanvas, 0, 0);
            frontCtx.setTransform(1, 0, 0, 1, 0, 0);
        }

        const orderedPois = this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder);
        if (orderedPois.length > 1) {
            topCtx.beginPath();
            orderedPois.forEach((poi, idx) => {
                const p = this.projectTop(poi.targetX, poi.targetZ);
                if (idx === 0) topCtx.moveTo(p.x, p.y);
                else topCtx.lineTo(p.x, p.y);
            });
            topCtx.strokeStyle = 'rgba(80, 200, 255, 0.45)';
            topCtx.lineWidth = 1.5;
            topCtx.stroke();

            frontCtx.beginPath();
            orderedPois.forEach((poi, idx) => {
                const p = this.projectFront(poi.targetX, this.poiEyeY(poi));
                if (idx === 0) frontCtx.moveTo(p.x, p.y);
                else frontCtx.lineTo(p.x, p.y);
            });
            frontCtx.strokeStyle = 'rgba(80, 200, 255, 0.45)';
            frontCtx.lineWidth = 1.5;
            frontCtx.stroke();
        }

        this.pois.forEach((poi) => {
            const selected = poi.poiId === this.selectedPoiId;
            const tp = this.projectTop(poi.targetX, poi.targetZ);
            topCtx.beginPath();
            topCtx.arc(tp.x, tp.y, selected ? 6 : 4.5, 0, Math.PI * 2);
            topCtx.fillStyle = selected ? '#3b82f6' : '#10b981';
            topCtx.fill();
            topCtx.strokeStyle = '#ffffff';
            topCtx.lineWidth = 1;
            topCtx.stroke();

            const yawR = degToRad(poi.targetYaw);
            const hx = tp.x + Math.sin(yawR) * 26;
            const hy = tp.y + Math.cos(yawR) * 26;
            topCtx.beginPath();
            topCtx.moveTo(tp.x, tp.y);
            topCtx.lineTo(hx, hy);
            topCtx.strokeStyle = '#7dc1ff';
            topCtx.lineWidth = 2;
            topCtx.stroke();
            topCtx.beginPath();
            topCtx.arc(hx, hy, 4, 0, Math.PI * 2);
            topCtx.fillStyle = '#ffd166';
            topCtx.fill();

            const fp = this.projectFront(poi.targetX, this.poiEyeY(poi));
            frontCtx.beginPath();
            frontCtx.arc(fp.x, fp.y, selected ? 6 : 4.5, 0, Math.PI * 2);
            frontCtx.fillStyle = selected ? '#3b82f6' : '#10b981';
            frontCtx.fill();
            frontCtx.strokeStyle = '#ffffff';
            frontCtx.lineWidth = 1;
            frontCtx.stroke();

            const pR = degToRad(poi.targetPitch);
            const phx = fp.x + Math.cos(pR) * 24;
            const phy = fp.y - Math.sin(pR) * 24;
            frontCtx.beginPath();
            frontCtx.moveTo(fp.x, fp.y);
            frontCtx.lineTo(phx, phy);
            frontCtx.strokeStyle = '#ff9f7a';
            frontCtx.lineWidth = 2;
            frontCtx.stroke();
            frontCtx.beginPath();
            frontCtx.arc(phx, phy, 4, 0, Math.PI * 2);
            frontCtx.fillStyle = '#ffd166';
            frontCtx.fill();
        });

        const live = this.options.getLiveCameraPose?.();
        if (live) {
            const topLive = this.projectTop(live.pose.eye.x, live.pose.eye.z);
            const topTip = this.projectTop(
                live.pose.eye.x + live.pose.forward.x * 1.4,
                live.pose.eye.z + live.pose.forward.z * 1.4
            );
            topCtx.beginPath();
            topCtx.arc(topLive.x, topLive.y, 4.5, 0, Math.PI * 2);
            topCtx.fillStyle = '#f97316';
            topCtx.fill();
            topCtx.beginPath();
            topCtx.moveTo(topLive.x, topLive.y);
            topCtx.lineTo(topTip.x, topTip.y);
            topCtx.strokeStyle = '#f97316';
            topCtx.lineWidth = 2;
            topCtx.stroke();

            const frontLive = this.projectFront(live.pose.eye.x, live.pose.eye.y);
            const frontTip = this.projectFront(
                live.pose.eye.x + live.pose.forward.x * 1.4,
                live.pose.eye.y + live.pose.forward.y * 1.4
            );
            frontCtx.beginPath();
            frontCtx.arc(frontLive.x, frontLive.y, 4.5, 0, Math.PI * 2);
            frontCtx.fillStyle = '#f97316';
            frontCtx.fill();
            frontCtx.beginPath();
            frontCtx.moveTo(frontLive.x, frontLive.y);
            frontCtx.lineTo(frontTip.x, frontTip.y);
            frontCtx.strokeStyle = '#f97316';
            frontCtx.lineWidth = 2;
            frontCtx.stroke();

            const selectedPoi = this.selectedPoi();
            if (selectedPoi) {
                const d = Math.hypot(
                    selectedPoi.targetX - live.pose.eye.x,
                    this.poiEyeY(selectedPoi) - live.pose.eye.y,
                    selectedPoi.targetZ - live.pose.eye.z
                );
                if (d < 0.2) {
                    const tp = this.projectTop(selectedPoi.targetX, selectedPoi.targetZ);
                    topCtx.beginPath();
                    topCtx.arc(tp.x, tp.y, 9, 0, Math.PI * 2);
                    topCtx.strokeStyle = 'rgba(255, 224, 120, 0.95)';
                    topCtx.lineWidth = 2;
                    topCtx.stroke();

                    const fp = this.projectFront(selectedPoi.targetX, this.poiEyeY(selectedPoi));
                    frontCtx.beginPath();
                    frontCtx.arc(fp.x, fp.y, 9, 0, Math.PI * 2);
                    frontCtx.strokeStyle = 'rgba(255, 224, 120, 0.95)';
                    frontCtx.lineWidth = 2;
                    frontCtx.stroke();
                }
            }
        }
    }

    private refreshPoiControls() {
        this.poiSelect.innerHTML = '';
        this.pois
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .forEach((poi) => {
                const opt = document.createElement('option');
                opt.value = poi.poiId;
                opt.textContent = `${poi.sortOrder + 1}. ${poi.poiName}`;
                this.poiSelect.appendChild(opt);
            });
        if (!this.selectedPoiId && this.pois.length > 0) this.selectedPoiId = this.pois[0].poiId;
        if (this.selectedPoiId) this.poiSelect.value = this.selectedPoiId;
        const poi = this.selectedPoi();
        this.poiNameInput.value = poi?.poiName || '';
        this.refreshPoiListCards();
        this.drawViews();
    }

    private refreshPoiListCards() {
        this.poiListEl.innerHTML = '';
        this.pois
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .forEach((poi) => {
                const hasImage = Boolean((poi.screenshotDataUrl || '').trim());
                const previewSrc = hasImage ? poi.screenshotDataUrl : this.placeholderImageDataUrl(poi.poiName);
                const card = document.createElement('div');
                card.className = 'otl-poi-card';
                card.setAttribute('data-poi-id', poi.poiId);
                card.innerHTML = `
                    <div class="otl-poi-row-top">
                        <div class="otl-poi-id" title="${poi.poiId}">
                            <span class="otl-title-dot"></span>ID: ${poi.poiId}
                        </div>
                        <div class="otl-poi-params">
                            <div class="otl-inline-group">
                                <span class="otl-inline-label">NAME</span>
                                <input class="otl-inline-input name" data-field="poi-name" data-poi-id="${poi.poiId}" value="${poi.poiName}" />
                            </div>
                            <div class="otl-inline-group">
                                <span class="otl-inline-label">YAW</span>
                                <input class="otl-inline-input num" data-field="poi-yaw" data-poi-id="${poi.poiId}" type="number" step="0.1" value="${Number(poi.targetYaw).toFixed(1)}" />
                            </div>
                            <div class="otl-inline-group">
                                <span class="otl-inline-label">PITCH</span>
                                <input class="otl-inline-input num" data-field="poi-pitch" data-poi-id="${poi.poiId}" type="number" step="0.1" value="${Number(poi.targetPitch).toFixed(1)}" />
                            </div>
                            <div class="otl-inline-group">
                                <span class="otl-inline-label">FOV</span>
                                <input class="otl-inline-input num" data-field="poi-fov" data-poi-id="${poi.poiId}" type="number" step="0.1" min="20" max="120" value="${Number(clampFov(poi.targetFov)).toFixed(1)}" />
                            </div>
                        </div>
                        <div class="otl-poi-actions-inline">
                            <button class="otl-poi-icon" data-act="save-poi-row" data-poi-id="${poi.poiId}" title="Save">💾</button>
                            <button class="otl-poi-icon" data-act="delete-image" data-poi-id="${poi.poiId}" title="Delete Image">🖼</button>
                            <button class="otl-poi-icon danger" data-act="delete-poi-inline" data-poi-id="${poi.poiId}" title="Delete POI">🗑</button>
                        </div>
                    </div>
                    <div class="otl-poi-row-bottom">
                        <img class="otl-poi-preview ${hasImage ? '' : 'placeholder'}" src="${previewSrc}" alt="${poi.poiName}" />
                        <div class="otl-poi-content-wrap">
                            <textarea class="otl-poi-content" data-field="poi-content" data-poi-id="${poi.poiId}" placeholder="AI narrative content...">${poi.content || ''}</textarea>
                            <button class="otl-poi-prompt" data-act="open-prompt" data-poi-id="${poi.poiId}" title="Prompt Settings">⚙</button>
                            <button class="otl-poi-gen" data-act="generate-one" data-poi-id="${poi.poiId}" title="Generate Content">✦</button>
                        </div>
                    </div>
                `;
                this.poiListEl.appendChild(card);
            });
        const textareas = this.poiListEl.querySelectorAll('textarea[data-field="poi-content"]') as NodeListOf<HTMLTextAreaElement>;
        textareas.forEach((textarea) => this.autoSizePoiContentTextarea(textarea));
    }

    private placeholderImageDataUrl(label: string) {
        const safeLabel = (label || 'POI').replace(/[<>&"']/g, '').slice(0, 24);
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='220' viewBox='0 0 340 220'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#1a2440'/><stop offset='100%' stop-color='#111827'/></linearGradient></defs>
<rect width='340' height='220' rx='14' fill='url(#g)'/>
<circle cx='72' cy='72' r='34' fill='rgba(96,165,250,0.25)'/>
<circle cx='268' cy='154' r='42' fill='rgba(139,92,246,0.18)'/>
<rect x='34' y='150' width='272' height='2' fill='rgba(180,196,235,0.28)'/>
<text x='170' y='122' text-anchor='middle' font-size='26' fill='rgba(224,231,255,0.82)'>No Image</text>
<text x='170' y='180' text-anchor='middle' font-size='14' fill='rgba(180,196,235,0.70)'>${safeLabel}</text>
</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    private updateBatchProgressText(prefix?: string) {
        const text = this.batchProgress.total > 0
            ? `${prefix || 'Generating'} ${this.batchProgress.index}/${this.batchProgress.total}${this.batchProgress.poiId ? ` (${this.batchProgress.poiId})` : ''}`
            : (prefix || 'Not started');
        this.batchProgressEl.textContent = text;
        const inline = this.root.querySelector('[data-role="batch-inline-status"]') as HTMLDivElement | null;
        if (inline) inline.textContent = text;
    }

    private async loadLlmConfig() {
        if (!this.modelFilename) return;
        const res = await fetch(`${this.apiBase()}/llm-config?modelFilename=${encodeURIComponent(this.modelFilename)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.llmConfig = {
            selectedProvider: (String(data?.llm?.selectedProvider || 'gemini') === 'qwen' ? 'qwen' : 'gemini'),
            gemini: {
                modelName: String(data?.llm?.gemini?.modelName || DEFAULT_LLM_MODEL),
                apiKey: String(data?.llm?.gemini?.apiKey || '')
            },
            qwen: {
                modelName: String(data?.llm?.qwen?.modelName || DEFAULT_QWEN_MODEL),
                apiKey: String(data?.llm?.qwen?.apiKey || '')
            },
            updatedAt: data?.llm?.updatedAt ? String(data.llm.updatedAt) : null,
            promptUpdatedAt: data?.llm?.promptUpdatedAt ? String(data.llm.promptUpdatedAt) : null
        };
        this.promptTemplate = String(data?.llm?.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
        this.csvPromptTemplate = String(data?.llm?.csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE);
        this.movePromptTemplate = String(data?.llm?.movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE);
        this.geminiModelInput.value = this.llmConfig.gemini.modelName;
        this.geminiApiKeyInput.value = this.llmConfig.gemini.apiKey;
        this.qwenModelInput.value = this.llmConfig.qwen.modelName;
        this.qwenApiKeyInput.value = this.llmConfig.qwen.apiKey;
        this.promptInput.value = this.promptTemplate;
        this.csvPromptInput.value = this.csvPromptTemplate;
        this.movePromptInput.value = this.movePromptTemplate;
        this.refreshLlmSummary();
    }

    private async saveLlmConfig() {
        if (!this.requireModel(false)) return;
        this.llmConfig = {
            selectedProvider: this.root.querySelector('[data-role="llm-provider"]:checked') instanceof HTMLInputElement
                ? ((this.root.querySelector('[data-role="llm-provider"]:checked') as HTMLInputElement).value === 'qwen' ? 'qwen' : 'gemini')
                : this.llmConfig.selectedProvider,
            gemini: {
                modelName: this.geminiModelInput.value.trim() || DEFAULT_LLM_MODEL,
                apiKey: this.geminiApiKeyInput.value.trim()
            },
            qwen: {
                modelName: this.qwenModelInput.value.trim() || DEFAULT_QWEN_MODEL,
                apiKey: this.qwenApiKeyInput.value.trim()
            },
            updatedAt: this.llmConfig.updatedAt,
            promptUpdatedAt: this.llmConfig.promptUpdatedAt
        };
        const payload = {
            modelFilename: this.modelFilename,
            llm: {
                selectedProvider: this.llmConfig.selectedProvider,
                gemini: this.llmConfig.gemini,
                qwen: this.llmConfig.qwen,
                promptTemplate: this.promptTemplate,
                csvPromptTemplate: this.csvPromptTemplate,
                movePromptTemplate: this.movePromptTemplate
            }
        };
        const res = await fetch(`${this.apiBase()}/llm-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.loadLlmConfig();
        this.setStatus('LLM config saved');
    }

    private openPromptEditor(context: PromptEditorContext) {
        this.promptEditorContext = context;
        if (context.scope === 'poi') {
            const poi = this.pois.find((item) => item.poiId === context.poiId);
            this.promptInput.value = String(poi?.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE);
            this.setPromptEditorTitle(`POI Prompt - ${poi?.poiName || context.poiId}`);
        } else {
            this.promptInput.value = this.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
            this.setPromptEditorTitle('Global Prompt Template');
        }
        this.promptModal.classList.remove('hidden');
    }

    private openCsvPromptEditor() {
        this.csvPromptInput.value = this.csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE;
        this.csvPromptModal.classList.remove('hidden');
    }

    private openMovePromptEditor() {
        this.movePromptInput.value = this.movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE;
        this.movePromptModal.classList.remove('hidden');
    }

    private async savePoiPrompt(poiId: string, promptTemplate: string) {
        if (!this.requireModel(false)) return;
        const poi = this.pois.find((item) => item.poiId === poiId);
        if (!poi) throw new Error('POI not found');
        poi.promptTemplate = promptTemplate;
        poi.promptUpdatedAt = new Date().toISOString();
        const res = await fetch(`${this.apiBase()}/pois/${encodeURIComponent(poiId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                patch: {
                    promptTemplate: poi.promptTemplate
                }
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.setStatus('POI prompt saved');
    }

    private async clearPoiScreenshot(poiId: string) {
        if (!this.requireModel()) return;
        const poi = this.pois.find((p) => p.poiId === poiId);
        if (!poi) return;
        poi.screenshotDataUrl = '';
        poi.screenshotUpdatedAt = new Date().toISOString();
        await fetch(`${this.apiBase()}/pois/${encodeURIComponent(poiId)}/screenshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                imageMime: 'image/png',
                screenshotDataUrl: ''
            })
        });
        this.refreshPoiListCards();
        this.debounceSave('delete-image');
    }

    private deletePoiInline(poiId: string) {
        const idx = this.pois.findIndex((p) => p.poiId === poiId);
        if (idx < 0) return;
        this.pois.splice(idx, 1);
        this.pois.forEach((p, i) => { p.sortOrder = i; });
        if (this.selectedPoiId === poiId) this.selectedPoiId = this.pois[0]?.poiId || null;
        this.refreshPoiControls();
        this.debounceSave('delete-poi-inline');
    }

    private async savePoiRowFromCard(poiId: string) {
        if (!this.requireModel()) return;
        const poi = this.pois.find((p) => p.poiId === poiId);
        if (!poi) return;
        const host = this.poiListEl.querySelector(`.otl-poi-card [data-act="save-poi-row"][data-poi-id="${poiId}"]`)?.closest('.otl-poi-card');
        if (!(host instanceof HTMLElement)) return;
        const nameInput = host.querySelector(`[data-field="poi-name"][data-poi-id="${poiId}"]`) as HTMLInputElement | null;
        const yawInput = host.querySelector(`[data-field="poi-yaw"][data-poi-id="${poiId}"]`) as HTMLInputElement | null;
        const pitchInput = host.querySelector(`[data-field="poi-pitch"][data-poi-id="${poiId}"]`) as HTMLInputElement | null;
        const fovInput = host.querySelector(`[data-field="poi-fov"][data-poi-id="${poiId}"]`) as HTMLInputElement | null;
        const contentInput = host.querySelector(`[data-field="poi-content"][data-poi-id="${poiId}"]`) as HTMLTextAreaElement | null;
        poi.poiName = nameInput?.value.trim() || poi.poiName;
        poi.targetYaw = Number(yawInput?.value || poi.targetYaw);
        poi.targetPitch = Number(pitchInput?.value || poi.targetPitch);
        const nextFov = Number(fovInput?.value);
        poi.targetFov = clampFov(Number.isFinite(nextFov) ? nextFov : poi.targetFov, poi.targetFov);
        poi.content = contentInput?.value || poi.content;
        await fetch(`${this.apiBase()}/pois/${encodeURIComponent(poiId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                patch: {
                    poiName: poi.poiName,
                    targetYaw: poi.targetYaw,
                    targetPitch: poi.targetPitch,
                    targetFov: poi.targetFov,
                    content: poi.content
                }
            })
        });
        this.refreshPoiControls();
        this.debounceSave('save-poi-row');
    }

    private debounceSave(reason: string) {
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            void this.saveState(reason);
        }, 420);
    }

    private async saveState(reason: string) {
        if (!this.requireModel()) return;
        try {
            await fetch(`${this.apiBase()}/state`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelFilename: this.modelFilename,
                    profile: { eyeHeightM: this.eyeHeightM },
                    pois: this.pois
                })
            });
            this.logDebug('save', `state saved (${reason})`);
        } catch (error) {
            this.logDebug('error', `save failed: ${String(error)}`);
        }
    }

    private async reload() {
        this.modelFilename = this.options.getModelFilename();
        if (!this.modelFilename) {
            this.stopPlayback();
            this.points = [];
            this.pois = [];
            this.selectedPoiId = null;
            this.topBitmapCanvas = null;
            this.frontBitmapCanvas = null;
            this.topBounds = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
            this.frontBounds = { xMin: -5, xMax: 5, yMin: -1, yMax: 3 };
            this.refreshPoiControls();
            this.setModelReady(false);
            this.setStatus('Model unavailable');
            this.setRunStatus('');
            this.csvWorkspaceModal.classList.add('hidden');
            this.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
            this.csvPromptTemplate = DEFAULT_CSV_PROMPT_TEMPLATE;
            this.movePromptTemplate = DEFAULT_MOVE_PROMPT_TEMPLATE;
            this.csvVersions = [];
            this.selectedCsvVersionId = null;
            this.setCsvEditorText('');
            this.csvEditorDirty = false;
            this.batchProgress = { index: 0, total: 0, poiId: '' };
            this.updateBatchProgressText('Idle');
            return;
        }

        this.setModelReady(true);
        this.setRunStatus('');
        this.points = this.options.getWorldSamplePoints?.() || [];
        this.rebuildMapBitmaps();
        this.pois = [];
        this.selectedPoiId = null;
        this.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
        this.csvPromptTemplate = DEFAULT_CSV_PROMPT_TEMPLATE;
        this.movePromptTemplate = DEFAULT_MOVE_PROMPT_TEMPLATE;
        this.csvVersions = [];
        this.selectedCsvVersionId = null;
        this.setCsvEditorText('');
        this.csvEditorDirty = false;
        this.refreshPoiControls();
        this.setStatus('Map ready, loading POIs...');
        this.batchProgress = { index: 0, total: 0, poiId: '' };
        this.updateBatchProgressText('Idle');

        try {
            await this.loadLlmConfig();
            const res = await fetch(`${this.apiBase()}/state?modelFilename=${encodeURIComponent(this.modelFilename)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.pois = Array.isArray(data?.pois)
                ? data.pois.map((poi: Partial<TourPoi>, idx: number) => this.normalizePoi(poi, idx))
                : [];
            this.eyeHeightM = Number(data?.profile?.eyeHeightM ?? 1.65);
            this.selectedPoiId = this.pois[0]?.poiId || null;
            this.refreshPoiControls();
            this.setStatus(this.pois.length > 0 ? `Loaded ${this.pois.length} POIs` : 'No saved POIs');
            this.logDebug('load', `state loaded for ${this.modelFilename}`);
        } catch (error) {
            this.logDebug('error', `load failed: ${String(error)}`);
            this.pois = [];
            this.selectedPoiId = null;
            this.refreshPoiControls();
            this.setStatus('Map ready; failed to load saved POIs');
        }
    }

    private currentCameraTargetFromPoi(poi: TourPoi): CameraPose {
        const yaw = degToRad(poi.targetYaw);
        const pitch = degToRad(poi.targetPitch);
        const fx = Math.sin(yaw) * Math.cos(pitch);
        const fy = Math.sin(pitch);
        const fz = Math.cos(yaw) * Math.cos(pitch);
        return {
            eye: {
                x: poi.targetX,
                y: poi.targetY + this.eyeHeightM,
                z: poi.targetZ
            },
            forward: { x: fx, y: fy, z: fz }
        };
    }

    private async moveToPoi(poi: TourPoi, speedScale: number) {
        const current = this.options.getLiveCameraPose?.();
        const to = this.currentCameraTargetFromPoi(poi);
        const toFov = clampFov(poi.targetFov, DEFAULT_POI_FOV);
        if (!this.options.setLiveCameraPose) return;
        if (!current) {
            await this.options.setLiveCameraPose(to, toFov);
            return;
        }
        const from = current.pose;
        const fromFov = clampFov(current.fovDeg, DEFAULT_POI_FOV);
        const dx = to.eye.x - from.eye.x;
        const dy = to.eye.y - from.eye.y;
        const dz = to.eye.z - from.eye.z;
        const dist = Math.hypot(dx, dy, dz);
        const duration = Math.max(320, (dist / Math.max(0.2, poi.moveSpeedMps * speedScale)) * 1000);
        const start = performance.now();
        while (true) {
            const t = clamp((performance.now() - start) / duration, 0, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const lerp = (a: number, b: number) => a + (b - a) * ease;
            await this.options.setLiveCameraPose({
                eye: {
                    x: lerp(from.eye.x, to.eye.x),
                    y: lerp(from.eye.y, to.eye.y),
                    z: lerp(from.eye.z, to.eye.z)
                },
                forward: {
                    x: lerp(from.forward.x, to.forward.x),
                    y: lerp(from.forward.y, to.forward.y),
                    z: lerp(from.forward.z, to.forward.z)
                }
            }, lerp(fromFov, toFov));
            if (t >= 1) break;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(100, poi.dwellMs)));
    }

    private waitFrames(count = 2) {
        return new Promise<void>((resolve) => {
            const step = (left: number) => {
                if (left <= 0) {
                    resolve();
                    return;
                }
                window.requestAnimationFrame(() => step(left - 1));
            };
            step(count);
        });
    }

    private async isLikelyBlackScreenshot(dataUrl: string) {
        if (!dataUrl || !dataUrl.startsWith('data:image/')) return true;
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('decode image failed'));
            img.src = dataUrl;
        });
        const w = 48;
        const h = 28;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return true;
        ctx.drawImage(img, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h).data;
        let sum = 0;
        let bright = 0;
        const total = w * h;
        for (let i = 0; i < pixels.length; i += 4) {
            const l = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
            sum += l;
            if (l > 14) bright += 1;
        }
        const avg = sum / total;
        const brightRatio = bright / total;
        return avg < 8 && brightRatio < 0.035;
    }

    private async runAndRecord() {
        if (!this.requireModel()) return;
        if (!this.options.captureScreenshotPng) {
            this.setRunStatus('Screenshot callback missing');
            return;
        }
        const speed = Number(this.speedSelect.value || '1');
        this.setRunStatus('Run and Record started...');
        for (let i = 0; i < this.pois.length; i += 1) {
            const poi = this.pois[i];
            this.setRunStatus(`Recording ${i + 1}/${this.pois.length} ${poi.poiName}`);
            await this.moveToPoi(poi, speed);
            let shot = '';
            for (let attempt = 0; attempt < 8; attempt += 1) {
                await this.waitFrames(2);
                shot = await this.options.captureScreenshotPng();
                if (shot) {
                    try {
                        const black = await this.isLikelyBlackScreenshot(shot);
                        if (!black) break;
                        this.logDebug('capture', `black screenshot retry ${attempt + 1}/${8} for ${poi.poiId}`);
                    } catch {
                        this.logDebug('capture', `decode screenshot failed retry ${attempt + 1}/${8} for ${poi.poiId}`);
                    }
                }
                await new Promise<void>((resolve) => window.setTimeout(resolve, 140));
            }
            if (shot && !(await this.isLikelyBlackScreenshot(shot).catch(() => true))) {
                poi.screenshotDataUrl = shot;
                poi.screenshotUpdatedAt = new Date().toISOString();
                await fetch(`${this.apiBase()}/pois/${encodeURIComponent(poi.poiId)}/screenshot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        modelFilename: this.modelFilename,
                        imageMime: 'image/png',
                        screenshotDataUrl: shot
                    })
                });
                this.logDebug('capture', `saved screenshot for ${poi.poiId}`);
            } else {
                this.logDebug('capture', `failed screenshot for ${poi.poiId}`);
            }
            this.refreshPoiListCards();
            this.drawViews();
        }
        this.debounceSave('run-and-record');
        this.setRunStatus('Run and Record complete');
    }

    private stopPlayback(statusText?: string) {
        if (this.playback.rafId) {
            window.cancelAnimationFrame(this.playback.rafId);
            this.playback.rafId = 0;
        }
        this.playback.playing = false;
        this.playback.paused = false;
        this.playback.index = 0;
        this.playback.segmentStartMs = 0;
        this.playback.segmentDurationMs = 0;
        this.playback.dwellUntilMs = 0;
        this.refreshPlaybackUi();
        if (statusText) this.setStatus(statusText);
    }

    private ensurePlaybackLoop() {
        if (!this.playback.playing || this.playback.paused || this.playback.rafId) return;
        const tick = (now: number) => {
            this.playback.rafId = 0;
            if (!this.playback.playing || this.playback.paused) return;
            const list = this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder);
            if (list.length < 1) {
                this.stopPlayback('No POI for playback');
                return;
            }

            if (list.length === 1) {
                const onlyPoi = list[0];
                void this.options.setLiveCameraPose?.(this.currentCameraTargetFromPoi(onlyPoi), clampFov(onlyPoi.targetFov, DEFAULT_POI_FOV));
                this.playback.rafId = window.requestAnimationFrame(tick);
                return;
            }

            if (this.playback.dwellUntilMs > now) {
                const currentPoi = list[this.playback.index % list.length];
                void this.options.setLiveCameraPose?.(this.currentCameraTargetFromPoi(currentPoi), clampFov(currentPoi.targetFov, DEFAULT_POI_FOV));
                this.playback.rafId = window.requestAnimationFrame(tick);
                return;
            }

            if (this.playback.segmentDurationMs <= 0 || this.playback.segmentStartMs <= 0) {
                const from = list[this.playback.index % list.length];
                const to = list[(this.playback.index + 1) % list.length];
                const dist = Math.hypot(to.targetX - from.targetX, to.targetY - from.targetY, to.targetZ - from.targetZ);
                const speedScale = Number(this.playbackSpeedSelect.value || '1');
                this.playback.segmentDurationMs = Math.max(350, (dist / Math.max(0.2, from.moveSpeedMps * speedScale)) * 1000);
                this.playback.segmentStartMs = now;
            }

            const from = list[this.playback.index % list.length];
            const to = list[(this.playback.index + 1) % list.length];
            const t = clamp((now - this.playback.segmentStartMs) / Math.max(1, this.playback.segmentDurationMs), 0, 1);
            const lerp = (a: number, b: number) => a + (b - a) * t;
            const blended = {
                ...from,
                targetX: lerp(from.targetX, to.targetX),
                targetY: lerp(from.targetY, to.targetY),
                targetZ: lerp(from.targetZ, to.targetZ),
                targetYaw: lerp(from.targetYaw, to.targetYaw),
                targetPitch: lerp(from.targetPitch, to.targetPitch),
                targetFov: lerp(clampFov(from.targetFov, DEFAULT_POI_FOV), clampFov(to.targetFov, DEFAULT_POI_FOV))
            } as TourPoi;
            void this.options.setLiveCameraPose?.(this.currentCameraTargetFromPoi(blended), clampFov(blended.targetFov, DEFAULT_POI_FOV));

            if (t >= 1) {
                this.playback.index = (this.playback.index + 1) % list.length;
                const arrived = list[this.playback.index];
                this.playback.segmentDurationMs = 0;
                this.playback.segmentStartMs = 0;
                this.playback.dwellUntilMs = now + Math.max(80, arrived.dwellMs);
            }

            this.playback.rafId = window.requestAnimationFrame(tick);
        };
        this.playback.rafId = window.requestAnimationFrame(tick);
    }

    private startPlayback() {
        if (!this.requireModel()) return;
        if (this.pois.length < 1) {
            this.setStatus('No POI for playback');
            return;
        }
        this.playback.playing = true;
        this.playback.paused = false;
        this.playback.segmentStartMs = 0;
        this.playback.segmentDurationMs = 0;
        this.playback.dwellUntilMs = 0;
        this.refreshPlaybackUi();
        this.setStatus('Playback started');
        this.ensurePlaybackLoop();
    }

    private closeEventStream() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    private closeCsvExportEventStream() {
        if (this.csvExportEventSource) {
            this.csvExportEventSource.close();
            this.csvExportEventSource = null;
        }
    }

    private streamCsvExportJob(jobId: string) {
        this.closeCsvExportEventStream();
        const es = new EventSource(`${this.apiBase()}/csv/export/jobs/${encodeURIComponent(jobId)}/events`);
        this.csvExportEventSource = es;
        this.logDebug('csv.export', `stream open jobId=${jobId}`);
        let sseTimeout = 0;
        let firstEventReceived = false;
        const timeoutMs = () => (firstEventReceived ? 20000 : 45000);
        const resetSseTimeout = () => {
            if (sseTimeout) window.clearTimeout(sseTimeout);
            sseTimeout = window.setTimeout(() => {
                const wait = timeoutMs();
                if (firstEventReceived) {
                    this.logDebug('csv.export.error', `SSE timeout: no events for ${wait}ms (jobId=${jobId})`);
                } else {
                    this.logDebug('csv.export.stream', `SSE waiting first event > ${wait}ms (jobId=${jobId})`);
                }
            }, timeoutMs());
        };
        resetSseTimeout();
        return new Promise<{ totalRows: number }>((resolve, reject) => {
            const on = (type: string, fn: (payload: any) => void) => {
                es.addEventListener(type, (evt) => {
                    firstEventReceived = true;
                    resetSseTimeout();
                    try {
                        fn(JSON.parse((evt as MessageEvent).data || '{}'));
                    } catch {
                        fn({});
                    }
                });
            };

            on('connected', (p) => this.logDebug('csv.export.stream', `connected jobId=${p.jobId || jobId}`));
            on('export.job.started', (p) => this.logDebug('csv.export.job', `started jobId=${p.jobId} model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'}`));
            on('export.db.loaded', (p) => this.logDebug('csv.export.db', `loaded poiCount=${p.poiCount ?? '-'} poiIds=${Array.isArray(p.poiIds) ? p.poiIds.join(',') : '-'}`));
            on('export.prompt', (p) => this.logDebug('csv.export.prompt', `promptChars=${p.promptChars ?? '-'} prompt="${this.debugText(String(p.prompt || ''), 420)}"`));
            on('export.api.call', (p) => this.logDebug('csv.export.api.call', `model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'} hasApiKey=${p.hasApiKey} promptChars=${p.promptChars ?? '-'}`));
            on('export.plan.chunk', (p) => {
                const chunk = String(p.chunk || '');
                this.logDebug('csv.export.chunk', `idx=${p.chunkIndex ?? '-'} chunkChars=${p.chunkChars ?? chunk.length} totalChars=${p.contentCharsSoFar ?? '-'} chunk="${this.debugText(chunk, 260)}"`);
            });
            on('export.plan.done', (p) => this.logDebug('csv.export.plan', `steps=${p.totalSteps ?? '-'} visitPois=${p.totalVisitPois ?? '-'} inputPois=${p.inputPoiCount ?? '-'} plannedUniquePois=${p.plannedPoiUniqueCount ?? '-'} missingPois=${p.missingPoiCount ?? '-'} appendedByCoverage=${p.appendedByCoverage ?? '-'} provider=${p.provider || '-'} endpoint=${p.apiEndpoint || '-'} status=${p.status ?? '-'} requestId=${p.requestId || '-'} chunkCount=${p.chunkCount ?? '-'} finishReason=${p.finishReason || '-'} usageTotalTokens=${p.usageMetadata?.totalTokenCount ?? '-'} recovered=${Boolean(p.recoveredFromMalformedJson)} recoveredSteps=${p.recoveredSteps ?? 0}`));
            on('export.poi.fetch.one', (p) => this.logDebug('csv.export.poi', `index=${p.index ?? '-'} total=${p.total ?? '-'} prevPoiId=${p.prevPoiId || '-'} poiId=${p.poiId || '-'} action=${p.action || '-'} audioMode=${p.audioMode || '-'}`));
            on('export.csv.row.appended', (p) => this.logDebug('csv.export.row', `index=${p.index ?? '-'} total=${p.total ?? '-'} poiId=${p.poiId || '-'} action=${p.action || '-'} audioMode=${p.audioMode || '-'}`));
            on('export.job.done', (p) => {
                if (sseTimeout) window.clearTimeout(sseTimeout);
                this.logDebug('csv.export.job', `done jobId=${p.jobId || jobId} totalRows=${p.totalRows ?? 0}`);
                this.closeCsvExportEventStream();
                resolve({ totalRows: Number(p.totalRows || 0) });
            });
            on('export.job.error', (p) => {
                if (sseTimeout) window.clearTimeout(sseTimeout);
                const msg = String(p.error || 'csv export job failed');
                this.logDebug('csv.export.error', msg);
                this.closeCsvExportEventStream();
                reject(new Error(msg));
            });
            es.onerror = () => {
                this.logDebug('csv.export.stream', 'event stream disconnected');
                if (sseTimeout) window.clearTimeout(sseTimeout);
            };
        });
    }

    private streamJob(jobId: string) {
        this.closeEventStream();
        this.job = { jobId, paused: false, streaming: true };
        const es = new EventSource(`${this.apiBase()}/content/jobs/${encodeURIComponent(jobId)}/events`);
        this.eventSource = es;
        let sseTimeout = 0;
        let firstEventReceived = false;
        const timeoutMs = () => (firstEventReceived ? 20000 : 45000);
        const resetSseTimeout = () => {
            if (sseTimeout) window.clearTimeout(sseTimeout);
            sseTimeout = window.setTimeout(() => {
                const wait = timeoutMs();
                if (firstEventReceived) {
                    this.logDebug('error', `SSE timeout: no events for ${wait}ms after stream started (jobId=${jobId})`);
                } else {
                    this.logDebug('stream', `SSE waiting first event > ${wait}ms (jobId=${jobId})`);
                }
            }, timeoutMs());
        };
        resetSseTimeout();
        const on = (type: string, fn: (payload: any) => void) => {
            es.addEventListener(type, (evt) => {
                firstEventReceived = true;
                resetSseTimeout();
                try {
                    fn(JSON.parse((evt as MessageEvent).data || '{}'));
                } catch {
                    fn({});
                }
            });
        };
        on('job.started', (p) => this.logDebug('job', `started ${p.jobId} model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'}`));
        on('job.prompt', (p) => this.logDebug('prompt', `${p.poiId}: ${p.prompt}`));
        on('api.call', (p) => this.logDebug('api.call', `${p.poiId} model=${p.llmModel} endpoint=${p.apiEndpoint} hasImage=${p.hasImage} imageBytes=${p.imageBytes} imageMime=${p.imageMime || '-'} imageSha256=${p.imageSha256 || '-'} hasApiKey=${p.hasApiKey}`));
        on('api.request.raw', (p) => {
            const raw = JSON.stringify(p.requestJson || {}, null, 2);
            this.logDebug(
                'api.request.raw',
                `${p.poiId} provider=${p.provider || '-'} model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'} hasImage=${p.hasImage} imageBytes=${p.imageBytes ?? '-'} imageMime=${p.imageMime || '-'} imageSha256=${p.imageSha256 || '-'} promptChars=${p.promptChars ?? '-'} requestJson=${this.debugText(raw, 12000)}`
            );
        });
        on('api.response.raw', (p) => {
            this.logDebug(
                'api.response.raw',
                `${p.poiId} frame=${p.frameIndex ?? '-'} provider=${p.provider || '-'} model=${p.llmModel || '-'} rawJson=${this.debugText(String(p.rawJson || ''), 12000)}`
            );
        });
        on('api.response', (p) => this.logDebug('api.response', `${p.poiId} ok=${p.ok} provider=${p.provider || '-'} endpoint=${p.apiEndpoint || '-'} status=${p.status ?? '-'} requestId=${p.requestId || '-'} chunkCount=${p.chunkCount ?? 0} finishReason=${p.finishReason || '-'} usageTotalTokens=${p.usageMetadata?.totalTokenCount ?? '-'} lang=${p.language} contentChars=${p.contentChars} errorCause=${this.debugText(String(p.errorCause || ''), 1200)} preview="${this.debugText(String(p.contentPreview || ''), 220)}"`));
        on('api.error', (p) => this.logDebug('api.error', `${p.poiId} provider=${p.provider || '-'} endpoint=${p.apiEndpoint || '-'} status=${p.status ?? '-'} requestId=${p.requestId || '-'} finishReason=${p.finishReason || '-'} usageTotalTokens=${p.usageMetadata?.totalTokenCount ?? '-'} error=${p.error || 'unknown'} errorCause=${this.debugText(String(p.errorCause || ''), 1200)} errorRaw=${this.debugText(String(p.errorRaw || ''), 4000)}`));
        on('api.warn', (p) => this.logDebug('api.warn', `${p.poiId} provider=${p.provider || '-'} model=${p.llmModel || '-'} contentChars=${p.contentChars ?? '-'} message=${p.message || '-'}`));
        on('heartbeat', (p) => this.logDebug('heartbeat', `${p.poiId || '-'} waitingMs=${p.waitingMs ?? '-'} index=${p.index ?? '-'} total=${p.total ?? '-'}`));
        on('poi.started', (p) => {
            this.logDebug('poi', `start ${p.poiId}`);
            const poi = this.pois.find(x => x.poiId === p.poiId);
            if (poi) {
                poi.content = '';
                poi.contentUpdatedAt = new Date().toISOString();
                if (!this.updatePoiCardContentNode(p.poiId, poi.content)) this.refreshPoiListCards();
            }
            this.batchProgress = {
                index: Number(p.index || 0),
                total: Number(p.total || 0),
                poiId: String(p.poiId || '')
            };
            this.updateBatchProgressText('Generating');
        });
        on('poi.chunk', (p) => {
            const chunk = String(p.chunk || '');
            this.logDebug('chunk', `${p.poiId} idx=${p.chunkIndex ?? '-'} chunkChars=${p.chunkChars ?? chunk.length} totalChars=${p.contentCharsSoFar ?? '-'} chunk="${this.debugText(chunk, 260)}"`);
            const poi = this.pois.find(x => x.poiId === p.poiId);
            if (poi && chunk) {
                poi.content = `${String(poi.content || '')}${chunk}`;
                poi.contentUpdatedAt = new Date().toISOString();
                if (!this.updatePoiCardContentNode(p.poiId, poi.content)) this.refreshPoiListCards();
            }
        });
        on('poi.done', (p) => {
            const poi = this.pois.find(x => x.poiId === p.poiId);
            if (poi) {
                poi.content = String(p.content || '');
                poi.ttsLang = String(p.ttsLang || '');
                poi.contentUpdatedAt = new Date().toISOString();
                if (!this.updatePoiCardContentNode(p.poiId, poi.content)) this.refreshPoiListCards();
            }
            this.batchProgress = {
                index: Number(p.index || this.batchProgress.index),
                total: Number(p.total || this.batchProgress.total),
                poiId: String(p.poiId || this.batchProgress.poiId)
            };
            this.updateBatchProgressText('Generated');
            this.debounceSave('stream-poi-done');
        });
        on('poi.failed', (p) => this.logDebug('error', `${p.poiId}: ${p.error || 'failed'}`));
        on('job.paused', () => {
            this.job.paused = true;
            this.setStatus('Batch paused');
            this.updateBatchProgressText('Paused at');
        });
        on('job.resumed', () => {
            this.job.paused = false;
            this.setStatus('Batch resumed');
            this.updateBatchProgressText('Resumed');
        });
        on('job.done', () => {
            this.setStatus('Batch generation done');
            this.job.streaming = false;
            this.updateBatchProgressText('Done');
            if (sseTimeout) window.clearTimeout(sseTimeout);
            this.closeEventStream();
        });
        on('job.error', (p) => {
            this.setStatus(`Job error: ${p.error || 'unknown'}`);
            if (sseTimeout) window.clearTimeout(sseTimeout);
            this.closeEventStream();
        });
        es.onerror = () => {
            this.logDebug('stream', 'event stream disconnected');
            if (sseTimeout) window.clearTimeout(sseTimeout);
        };
    }

    private currentLlmRequest() {
        const provider = this.llmConfig.selectedProvider;
        const active = this.activeProviderConfig();
        return {
            provider,
            model: active.modelName || (provider === 'qwen' ? DEFAULT_QWEN_MODEL : DEFAULT_LLM_MODEL),
            apiKey: active.apiKey || ''
        };
    }

    private async startGenerate(mode: 'single' | 'batch', poiIds: string[]) {
        if (!this.requireModel() || poiIds.length < 1) return;
        const llm = this.currentLlmRequest();
        const promptTemplate = mode === 'batch'
            ? String(this.promptTemplate || '').trim()
            : String(this.pois.find((poi) => poi.poiId === poiIds[0])?.promptTemplate || '').trim();
        if (!promptTemplate) {
            this.setStatus(mode === 'batch' ? 'Global prompt is empty' : 'POI prompt is empty');
            throw new Error(mode === 'batch' ? 'global prompt required' : 'poi prompt required');
        }
        this.logDebug('api.call', `POST ${this.apiBase()}/content/jobs provider=${llm.provider} model=${llm.model} mode=${mode} poiIds=${poiIds.join(',')}`);
        if (mode === 'batch') {
            this.batchModal.classList.remove('hidden');
            this.batchProgress = { index: 0, total: poiIds.length, poiId: '' };
            this.updateBatchProgressText('Generating');
        }
        const response = await fetch(`${this.apiBase()}/content/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                mode,
                poiIds,
                llm: {
                    provider: llm.provider,
                    model: llm.model,
                    apiKey: llm.apiKey,
                    promptTemplate,
                    promptMode: mode === 'batch' ? 'global' : 'poi'
                }
            })
        });
        const data = await response.json();
        if (!data?.ok || !data?.jobId) {
            throw new Error(data?.error?.message || 'start job failed');
        }
        this.streamJob(String(data.jobId));
    }

    private setCsvWorkspaceStatus(text: string) {
        this.csvWorkspaceStatusEl.textContent = text;
    }

    private setCsvWorkspaceTimingStatus(prefix: string, summary?: CsvTimingSummary | null) {
        this.csvTimingSummary = summary || null;
        this.renderCsvTimingConfig();
        const timing = formatCsvTimingSummary(summary);
        this.setCsvWorkspaceStatus(timing ? `${prefix} | ${timing}` : prefix);
    }

    private setCsvWorkspaceFullscreen(enabled: boolean) {
        this.csvWorkspaceFullscreen = enabled;
        this.csvWorkspacePanel.classList.toggle('fullscreen', enabled);
        const btn = this.root.querySelector('[data-act="csv-workspace-fullscreen"]') as HTMLButtonElement | null;
        if (btn) {
            btn.textContent = enabled ? '🗗' : '⛶';
            btn.title = enabled ? 'Exit Fullscreen' : 'Fullscreen';
        }
        if (enabled) {
            this.csvWorkspacePanel.classList.add('floating');
            this.csvWorkspacePanel.style.left = '12px';
            this.csvWorkspacePanel.style.top = '12px';
        }
    }

    private toggleCsvWorkspaceFullscreen() {
        this.setCsvWorkspaceFullscreen(!this.csvWorkspaceFullscreen);
    }

    private markCsvEditorDirty() {
        this.csvEditorDirty = true;
        const current = this.selectedCsvVersion();
        this.setCsvWorkspaceStatus(current ? `Editing v${current.versionNo} (unsaved)` : 'Editing (unsaved)');
    }

    private openCsvContentEditor(row: number, col: number) {
        const header = String(this.csvGridHeaders[col] || `col_${col + 1}`);
        this.csvContentEditTarget = { row, col };
        this.csvContentTitleEl.textContent = `Edit ${header} row ${row + 1}`;
        this.csvContentInput.value = String(this.csvGridRows[row]?.[col] || '');
        this.csvContentModal.classList.remove('hidden');
        this.csvContentInput.focus();
        this.csvContentInput.setSelectionRange(this.csvContentInput.value.length, this.csvContentInput.value.length);
    }

    private closeCsvContentEditor() {
        this.csvContentEditTarget = null;
        this.csvContentModal.classList.add('hidden');
    }

    private saveCsvContentEditor() {
        const target = this.csvContentEditTarget;
        if (!target) return;
        const { row, col } = target;
        if (!this.csvGridRows[row]) return;
        this.csvGridRows[row][col] = this.csvContentInput.value;
        this.csvEditorInput.value = this.buildCsvTextFromGrid();
        this.markCsvEditorDirty();
        this.renderCsvGrid();
        this.closeCsvContentEditor();
    }

    private parseCsvText(csvText: string) {
        const rows: string[][] = [];
        let row: string[] = [];
        let cell = '';
        let inQuotes = false;
        const text = String(csvText || '');
        for (let i = 0; i < text.length; i += 1) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') {
                        cell += '"';
                        i += 1;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cell += ch;
                }
                continue;
            }
            if (ch === '"') {
                inQuotes = true;
                continue;
            }
            if (ch === ',') {
                row.push(cell);
                cell = '';
                continue;
            }
            if (ch === '\n') {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
                continue;
            }
            if (ch === '\r') continue;
            cell += ch;
        }
        if (cell.length > 0 || row.length > 0) {
            row.push(cell);
            rows.push(row);
        }
        if (rows.length < 1) return { headers: [], rows: [] as string[][] };
        const headers = rows[0].map((item) => String(item || ''));
        const width = Math.max(1, headers.length);
        const body = rows.slice(1).map((item) => {
            const out = item.slice(0, width).map((v) => String(v || ''));
            while (out.length < width) out.push('');
            return out;
        });
        return { headers, rows: body };
    }

    private buildCsvTextFromGrid() {
        if (this.csvGridHeaders.length < 1) return String(this.csvEditorInput.value || '');
        const width = this.csvGridHeaders.length;
        const lines: string[] = [];
        lines.push(this.csvGridHeaders.map((item) => escapeCsv(item)).join(','));
        this.csvGridRows.forEach((row) => {
            const cols = row.slice(0, width).map((item) => escapeCsv(item));
            while (cols.length < width) cols.push('');
            lines.push(cols.join(','));
        });
        return lines.join('\n');
    }

    private renderCsvGrid() {
        this.csvGridTableEl.innerHTML = '';
        if (this.csvGridHeaders.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otl-muted';
            empty.style.padding = '10px';
            empty.textContent = 'No CSV content';
            this.csvGridWrapEl.innerHTML = '';
            this.csvGridWrapEl.appendChild(empty);
            return;
        }
        this.csvGridWrapEl.innerHTML = '';
        this.csvGridWrapEl.appendChild(this.csvGridTableEl);
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        this.csvGridHeaders.forEach((header) => {
            const th = document.createElement('th');
            th.textContent = header;
            headRow.appendChild(th);
        });
        head.appendChild(headRow);
        this.csvGridTableEl.appendChild(head);

        const body = document.createElement('tbody');
        this.csvGridRows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            this.csvGridHeaders.forEach((headerName, colIndex) => {
                const td = document.createElement('td');
                const isContentCol = String(headerName || '').trim().toLowerCase() === 'content';
                if (isContentCol) {
                    const preview = document.createElement('div');
                    preview.className = 'otl-csv-content-cell';
                    preview.textContent = String(row[colIndex] || '');
                    preview.title = 'Click to edit content';
                    preview.addEventListener('click', () => this.openCsvContentEditor(rowIndex, colIndex));
                    td.appendChild(preview);
                    tr.appendChild(td);
                    return;
                }
                const input = document.createElement('input');
                input.className = 'otl-csv-grid-cell';
                input.type = 'text';
                input.value = String(row[colIndex] || '');
                input.setAttribute('data-row', String(rowIndex));
                input.setAttribute('data-col', String(colIndex));
                input.addEventListener('input', () => {
                    this.csvGridRows[rowIndex][colIndex] = input.value;
                    this.csvEditorInput.value = this.buildCsvTextFromGrid();
                    this.markCsvEditorDirty();
                });
                td.appendChild(input);
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        this.csvGridTableEl.appendChild(body);
    }

    private renderCsvVoiceConfig() {
        this.csvVoiceConfig = normalizeCsvVoiceConfig(this.csvVoiceConfig);
        const options = TTS_VOICE_OPTIONS_BY_MODEL[this.csvVoiceConfig.model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
        this.csvVoiceEnabledInput.checked = this.csvVoiceConfig.enabled;
        this.csvVoiceModelSelect.value = this.csvVoiceConfig.model;
        this.csvVoiceFixedSelect.innerHTML = options.map((option) => `<option value="${option.value}">${option.label} - ${option.subtitle} (${option.value})</option>`).join('');
        this.csvVoiceFixedSelect.value = this.csvVoiceConfig.fixedVoice;
        const grouped = new Map<string, TtsVoiceOption[]>();
        options.forEach((option) => {
            const list = grouped.get(option.group) || [];
            list.push(option);
            grouped.set(option.group, list);
        });
        this.csvVoiceListEl.innerHTML = '';
        grouped.forEach((items, group) => {
            const title = document.createElement('div');
            title.className = 'otl-voice-group-title';
            title.textContent = group;
            this.csvVoiceListEl.appendChild(title);
            items.forEach((option) => {
                const label = document.createElement('label');
                label.className = 'otl-voice-item';
                const checked = this.csvVoiceConfig.voicePool.includes(option.value);
                label.innerHTML = `
                    <input type="checkbox" data-role="csv-voice-item" value="${option.value}" ${checked ? 'checked' : ''} />
                    <div class="otl-voice-item-main">
                        <div>${option.label} - ${option.subtitle}</div>
                        <div class="otl-voice-code">${option.value}</div>
                    </div>
                `;
                this.csvVoiceListEl.appendChild(label);
            });
        });
        this.csvVoiceSummaryEl.textContent = summarizeCsvVoiceConfig(this.csvVoiceConfig);
    }

    private renderCsvTimingConfig() {
        this.csvTimingConfig = normalizeCsvTimingConfig(this.csvTimingConfig);
        this.csvTimingEnabledInput.checked = this.csvTimingConfig.enabled;
        this.csvTimingInput.value = String(this.csvTimingConfig.targetDurationSec);
        this.csvTimingMinimumEl.textContent = describeTimingValue(this.csvTimingSummary?.minimumAchievableSec);
        this.csvTimingEstimatedEl.textContent = describeTimingValue(this.csvTimingSummary?.estimatedDurationSec);
        this.csvTimingSummaryEl.textContent = this.csvTimingConfig.enabled
            ? `Timing: ${formatCsvTimingSummary(this.csvTimingSummary || {
                enabled: true,
                targetDurationSec: this.csvTimingConfig.targetDurationSec,
                minimumAchievableSec: this.csvTimingSummary?.minimumAchievableSec ?? null,
                estimatedDurationSec: this.csvTimingSummary?.estimatedDurationSec ?? null
            }) || `目标 ${this.csvTimingConfig.targetDurationSec}s`}`
            : 'Timing: default generation';
    }

    private setCsvEditorText(csvText: string) {
        const normalized = String(csvText || '');
        this.csvEditorInput.value = normalized;
        const parsed = this.parseCsvText(normalized);
        this.csvGridHeaders = parsed.headers;
        this.csvGridRows = parsed.rows;
        this.renderCsvGrid();
    }

    private getCsvEditorText() {
        return this.buildCsvTextFromGrid();
    }

    private selectedCsvVersion() {
        return this.csvVersions.find((item) => item.id === this.selectedCsvVersionId) || null;
    }

    private renderCsvVersionList() {
        this.csvVersionListEl.innerHTML = '';
        if (this.csvVersions.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otl-muted';
            empty.textContent = 'No CSV versions yet';
            this.csvVersionListEl.appendChild(empty);
            return;
        }
        const frag = document.createDocumentFragment();
        this.csvVersions.forEach((version) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `otl-csv-version-item${version.id === this.selectedCsvVersionId ? ' active' : ''}`;
            btn.setAttribute('data-act', 'csv-version-select');
            btn.setAttribute('data-version-id', String(version.id));
            const status = version.status === 'confirmed' ? 'confirmed' : 'draft';
            btn.textContent = `v${version.versionNo} ${status} ${version.updatedAt}`;
            frag.appendChild(btn);
        });
        this.csvVersionListEl.appendChild(frag);
    }

    private async loadCsvVersionList(preferredVersionId?: number | null) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/csv/versions?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        this.csvVersions = Array.isArray(data?.versions) ? data.versions as CsvVersionSummary[] : [];
        const targetId = preferredVersionId && this.csvVersions.some((item) => item.id === preferredVersionId)
            ? preferredVersionId
            : (this.selectedCsvVersionId && this.csvVersions.some((item) => item.id === this.selectedCsvVersionId)
                ? this.selectedCsvVersionId
                : (this.csvVersions[0]?.id || null));
        this.selectedCsvVersionId = targetId;
        this.renderCsvVersionList();
        if (targetId) {
            await this.loadCsvVersionDetail(targetId);
        } else {
            this.setCsvEditorText('');
            this.csvEditorDirty = false;
            this.setCsvWorkspaceStatus('No version selected');
        }
    }

    private async loadCsvVersionDetail(versionId: number) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(versionId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version) {
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        const detail = data.version as CsvVersionDetail;
        this.selectedCsvVersionId = detail.id;
        this.setCsvEditorText(String(detail.csvText || ''));
        this.csvEditorDirty = false;
        this.renderCsvVersionList();
        this.setCsvWorkspaceStatus(`Loaded v${detail.versionNo}`);
    }

    private async openCsvWorkspace() {
        if (!this.requireModel()) return;
        this.csvWorkspaceModal.classList.remove('hidden');
        this.setCsvWorkspaceFullscreen(this.csvWorkspaceFullscreen);
        this.setCsvWorkspaceStatus('Loading versions...');
        await this.loadCsvVersionList();
    }

    private async generateCsvVersion() {
        if (!this.requireModel()) return;
        const llm = this.currentLlmRequest();
        this.csvTimingConfig = normalizeCsvTimingConfig({
            ...this.csvTimingConfig,
            enabled: this.csvTimingEnabledInput.checked,
            targetDurationSec: Number(this.csvTimingInput.value) || DEFAULT_CSV_TARGET_DURATION_SEC
        });
        this.csvTimingEnabledInput.checked = this.csvTimingConfig.enabled;
        this.csvTimingInput.value = String(this.csvTimingConfig.targetDurationSec);
        this.setCsvWorkspaceStatus('Generating CSV...');
        const response = await fetch(`${this.apiBase()}/csv/versions/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                llm: {
                    provider: llm.provider,
                    model: llm.model,
                    apiKey: llm.apiKey,
                    csvPromptTemplate: this.csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE,
                    movePromptTemplate: this.movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE
                },
                voiceConfig: this.csvVoiceConfig,
                timingConfig: this.csvTimingConfig
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version?.id) {
            const error = new Error(data?.error?.message || `HTTP ${response.status}`) as Error & { timingSummary?: CsvTimingSummary | null };
            error.timingSummary = data?.error?.details?.timingSummary || null;
            throw error;
        }
        await this.loadCsvVersionList(Number(data.version.id));
        this.setCsvWorkspaceTimingStatus(`Generated v${data.version.versionNo}`, data?.timingSummary || null);
    }

    private async estimateCsvTiming() {
        if (!this.requireModel()) return;
        const llm = this.currentLlmRequest();
        this.csvTimingConfig = normalizeCsvTimingConfig({
            ...this.csvTimingConfig,
            enabled: this.csvTimingEnabledInput.checked,
            targetDurationSec: Number(this.csvTimingInput.value) || DEFAULT_CSV_TARGET_DURATION_SEC
        });
        this.renderCsvTimingConfig();
        this.setCsvWorkspaceStatus('Estimating timing...');
        const response = await fetch(`${this.apiBase()}/csv/timing/estimate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                llm: {
                    provider: llm.provider,
                    model: llm.model,
                    apiKey: llm.apiKey,
                    csvPromptTemplate: this.csvPromptTemplate || DEFAULT_CSV_PROMPT_TEMPLATE,
                    movePromptTemplate: this.movePromptTemplate || DEFAULT_MOVE_PROMPT_TEMPLATE
                },
                timingConfig: this.csvTimingConfig
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        this.csvTimingSummary = data?.timingSummary || null;
        this.renderCsvTimingConfig();
        this.setCsvWorkspaceTimingStatus('Timing estimated', this.csvTimingSummary);
    }

    private async saveCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCsvVersionId) throw new Error('no csv version selected');
        const csvText = this.getCsvEditorText();
        if (!csvText.trim()) throw new Error('csv is empty');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCsvVersionId))}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCsvVersionList(this.selectedCsvVersionId);
        this.setCsvWorkspaceStatus(`Saved v${data?.version?.versionNo || ''}`.trim());
    }

    private async saveCsvVersionAsNew() {
        if (!this.requireModel()) return;
        if (!this.selectedCsvVersionId) throw new Error('no csv version selected');
        const csvText = this.getCsvEditorText();
        if (!csvText.trim()) throw new Error('csv is empty');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCsvVersionId))}/save-as-new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version?.id) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCsvVersionList(Number(data.version.id));
        this.setCsvWorkspaceStatus(`Created v${data.version.versionNo}`);
    }

    private async confirmCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCsvVersionId) throw new Error('no csv version selected');
        const csvText = this.getCsvEditorText();
        if (!csvText.trim()) throw new Error('csv is empty');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCsvVersionId))}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCsvVersionList(this.selectedCsvVersionId);
        this.setCsvWorkspaceStatus(`Confirmed v${data?.version?.versionNo || ''}`.trim());
    }

    private async deleteCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCsvVersionId) throw new Error('no csv version selected');
        const current = this.selectedCsvVersion();
        const ok = window.confirm(`Delete CSV version v${current?.versionNo || this.selectedCsvVersionId}?`);
        if (!ok) return;
        const removeId = this.selectedCsvVersionId;
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(removeId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        this.selectedCsvVersionId = null;
        await this.loadCsvVersionList();
        this.setCsvWorkspaceStatus(`Deleted v${current?.versionNo || removeId}`);
    }

    private async downloadCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCsvVersionId) throw new Error('no csv version selected');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCsvVersionId))}/download?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        const csvText = await response.text();
        const current = this.selectedCsvVersion();
        const fallbackName = `ot-tour-loader-${String(this.modelFilename || 'model').replace(/[^a-zA-Z0-9_.-]/g, '_')}-v${current?.versionNo || this.selectedCsvVersionId}.csv`;
        const picker = (window as Window & {
            showSaveFilePicker?: (options: {
                suggestedName: string;
                types: Array<{ description: string; accept: Record<string, string[]> }>;
            }) => Promise<any>;
        }).showSaveFilePicker;
        if (typeof picker === 'function') {
            try {
                const handle = await picker({
                    suggestedName: fallbackName,
                    types: [{
                        description: 'CSV file',
                        accept: { 'text/csv': ['.csv'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(csvText);
                await writable.close();
                this.setCsvWorkspaceStatus(`Downloaded v${current?.versionNo || this.selectedCsvVersionId}`);
                return;
            } catch (error) {
                this.logDebug('csv.download', `save picker fallback: ${String(error)}`);
            }
        }
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fallbackName;
        a.click();
        URL.revokeObjectURL(blobUrl);
        this.setCsvWorkspaceStatus(`Downloaded v${current?.versionNo || this.selectedCsvVersionId}`);
    }

    private async importCsv(file: File) {
        if (!this.requireModel()) return;
        const csvText = await file.text();
        const response = await fetch(`${this.apiBase()}/csv/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json();
        if (!data?.ok) throw new Error(data?.error?.message || 'import failed');
        await this.reload();
        this.setStatus(`Imported ${data.imported || 0} rows`);
    }

    private bindEvents() {
        (this.root.querySelector('[data-act="hide"]') as HTMLButtonElement).addEventListener('click', () => this.close());
        (this.root.querySelector('[data-act="top-center"]') as HTMLButtonElement).addEventListener('click', () => {
            this.topView.offsetX = 0;
            this.topView.offsetY = 0;
            this.drawViews();
        });
        (this.root.querySelector('[data-act="front-center"]') as HTMLButtonElement).addEventListener('click', () => {
            this.frontView.offsetX = 0;
            this.frontView.offsetY = 0;
            this.drawViews();
        });
        (this.root.querySelector('[data-act="top-zoom-in"]') as HTMLButtonElement).addEventListener('click', () => {
            this.topView.zoom = clamp(this.topView.zoom * 1.15, 0.5, 5);
            this.drawViews();
        });
        (this.root.querySelector('[data-act="top-zoom-out"]') as HTMLButtonElement).addEventListener('click', () => {
            this.topView.zoom = clamp(this.topView.zoom / 1.15, 0.5, 5);
            this.drawViews();
        });
        (this.root.querySelector('[data-act="front-zoom-in"]') as HTMLButtonElement).addEventListener('click', () => {
            this.frontView.zoom = clamp(this.frontView.zoom * 1.15, 0.5, 5);
            this.drawViews();
        });
        (this.root.querySelector('[data-act="front-zoom-out"]') as HTMLButtonElement).addEventListener('click', () => {
            this.frontView.zoom = clamp(this.frontView.zoom / 1.15, 0.5, 5);
            this.drawViews();
        });

        this.poiSelect.addEventListener('change', () => {
            this.selectedPoiId = this.poiSelect.value || null;
            this.refreshPoiControls();
        });

        this.poiNameInput.addEventListener('change', () => {
            const poi = this.selectedPoi();
            if (!poi) return;
            poi.poiName = this.poiNameInput.value.trim() || poi.poiName;
            this.refreshPoiControls();
            this.debounceSave('poi-name');
        });

        (this.root.querySelector('[data-act="poi-delete"]') as HTMLButtonElement).addEventListener('click', () => {
            const idx = this.pois.findIndex(p => p.poiId === this.selectedPoiId);
            if (idx < 0) return;
            this.pois.splice(idx, 1);
            this.pois.forEach((p, i) => { p.sortOrder = i; });
            this.selectedPoiId = this.pois[0]?.poiId || null;
            this.refreshPoiControls();
            this.debounceSave('poi-delete');
        });

        (this.root.querySelector('[data-act="update-current"]') as HTMLButtonElement).addEventListener('click', () => {
            const live = this.options.getLiveCameraPose?.();
            if (!live) return;
            let poi = this.selectedPoi();
            let created = false;
            if (!poi) {
                poi = this.createPoi(live.pose.eye.x, live.pose.eye.y - this.eyeHeightM, live.pose.eye.z);
                this.pois.push(poi);
                this.selectedPoiId = poi.poiId;
                created = true;
            }
            this.applyLiveCameraToPoi(poi, live);
            this.refreshPoiControls();
            this.debounceSave(created ? 'poi-add-current-view' : 'update-current');
        });

        (this.root.querySelector('[data-act="run-record"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.runAndRecord();
        });
        (this.root.querySelector('[data-act="run-settings"]') as HTMLButtonElement).addEventListener('click', async () => {
            if (this.requireModel(false)) {
                try {
                    await this.loadLlmConfig();
                } catch (error) {
                    this.logDebug('error', `load llm config failed: ${String(error)}`);
                }
            }
            this.settingsModal.classList.remove('hidden');
        });
        (this.root.querySelector('[data-act="settings-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.settingsModal.classList.add('hidden');
        });
        this.settingsModal.addEventListener('click', (event) => {
            if (event.target === this.settingsModal) this.settingsModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="batch-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.batchModal.classList.add('hidden');
        });
        this.batchModal.addEventListener('click', (event) => {
            if (event.target === this.batchModal) this.batchModal.classList.add('hidden');
        });
        this.globalSaveBtn.addEventListener('click', async () => {
            try {
                await this.saveState('save-all-pois');
                this.setStatus('All POIs saved');
            } catch (error) {
                this.logDebug('error', `save all pois failed: ${String(error)}`);
                this.setStatus('Save all failed');
            }
        });
        (this.root.querySelector('[data-act="open-global-prompt"]') as HTMLButtonElement).addEventListener('click', async () => {
            if (!this.requireModel(false)) return;
            try {
                await this.loadLlmConfig();
            } catch (error) {
                this.logDebug('error', `load global prompt failed: ${String(error)}`);
            }
            this.openPromptEditor({ scope: 'global' });
        });
        (this.root.querySelector('[data-act="open-llm-config"]') as HTMLButtonElement).addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!this.requireModel(false)) return;
            try {
                await this.loadLlmConfig();
            } catch (error) {
                this.logDebug('error', `load llm config failed: ${String(error)}`);
            }
            const btn = this.root.querySelector('[data-act="open-llm-config"]') as HTMLButtonElement;
            const rect = btn.getBoundingClientRect();
            this.llmPopover.style.top = `${Math.max(12, Math.round(rect.bottom + 8))}px`;
            this.llmPopover.style.left = `${Math.max(12, Math.round(rect.right - 500))}px`;
            this.llmPopover.classList.toggle('hidden');
        });
        this.llmProviderInputs.forEach((input) => {
            input.addEventListener('change', () => {
                if (!input.checked) return;
                this.llmConfig.selectedProvider = input.value === 'qwen' ? 'qwen' : 'gemini';
                this.refreshLlmSummary();
            });
        });
        this.geminiModelInput.addEventListener('change', () => {
            this.llmConfig.gemini.modelName = this.geminiModelInput.value;
            this.refreshLlmSummary();
        });
        this.geminiApiKeyInput.addEventListener('input', () => {
            this.llmConfig.gemini.apiKey = this.geminiApiKeyInput.value;
            this.refreshLlmSummary();
        });
        this.qwenModelInput.addEventListener('change', () => {
            this.llmConfig.qwen.modelName = this.qwenModelInput.value;
            this.refreshLlmSummary();
        });
        this.qwenApiKeyInput.addEventListener('input', () => {
            this.llmConfig.qwen.apiKey = this.qwenApiKeyInput.value;
            this.refreshLlmSummary();
        });
        (this.root.querySelector('[data-act="llm-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.llmPopover.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="llm-save"]') as HTMLButtonElement).addEventListener('click', async () => {
            try {
                await this.saveLlmConfig();
            } catch (error) {
                this.logDebug('error', `save llm config failed: ${String(error)}`);
                this.setStatus('LLM config save failed');
            }
        });
        (this.root.querySelector('[data-act="prompt-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.promptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="prompt-default"]') as HTMLButtonElement).addEventListener('click', () => {
            if (this.promptEditorContext.scope === 'poi') {
                this.promptInput.value = '';
                return;
            }
            this.promptInput.value = DEFAULT_PROMPT_TEMPLATE;
        });
        (this.root.querySelector('[data-act="prompt-save"]') as HTMLButtonElement).addEventListener('click', async () => {
            try {
                if (this.promptEditorContext.scope === 'poi') {
                    await this.savePoiPrompt(this.promptEditorContext.poiId, this.promptInput.value.trim());
                } else {
                    this.promptTemplate = this.promptInput.value.trim() || DEFAULT_PROMPT_TEMPLATE;
                    await this.saveLlmConfig();
                }
                this.promptModal.classList.add('hidden');
            } catch (error) {
                this.logDebug('error', `save prompt failed: ${String(error)}`);
                this.setStatus('Prompt save failed');
            }
        });
        this.promptModal.addEventListener('click', (event) => {
            if (event.target === this.promptModal) this.promptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="open-csv-prompt"]') as HTMLButtonElement).addEventListener('click', async () => {
            if (!this.requireModel(false)) return;
            try {
                await this.loadLlmConfig();
            } catch (error) {
                this.logDebug('error', `load csv prompt config failed: ${String(error)}`);
            }
            this.openCsvPromptEditor();
        });
        (this.root.querySelector('[data-act="open-move-prompt"]') as HTMLButtonElement).addEventListener('click', async () => {
            if (!this.requireModel(false)) return;
            try {
                await this.loadLlmConfig();
            } catch (error) {
                this.logDebug('error', `load move prompt config failed: ${String(error)}`);
            }
            this.openMovePromptEditor();
        });
        (this.root.querySelector('[data-act="csv-prompt-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvPromptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-prompt-default"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvPromptInput.value = DEFAULT_CSV_PROMPT_TEMPLATE;
        });
        (this.root.querySelector('[data-act="csv-prompt-save"]') as HTMLButtonElement).addEventListener('click', async () => {
            this.csvPromptTemplate = this.csvPromptInput.value.trim() || DEFAULT_CSV_PROMPT_TEMPLATE;
            try {
                await this.saveLlmConfig();
                this.csvPromptModal.classList.add('hidden');
            } catch (error) {
                this.logDebug('error', `save csv prompt failed: ${String(error)}`);
                this.setStatus('CSV prompt save failed');
            }
        });
        this.csvPromptModal.addEventListener('click', (event) => {
            if (event.target === this.csvPromptModal) this.csvPromptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="move-prompt-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.movePromptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="move-prompt-default"]') as HTMLButtonElement).addEventListener('click', () => {
            this.movePromptInput.value = DEFAULT_MOVE_PROMPT_TEMPLATE;
        });
        (this.root.querySelector('[data-act="move-prompt-save"]') as HTMLButtonElement).addEventListener('click', async () => {
            this.movePromptTemplate = this.movePromptInput.value.trim() || DEFAULT_MOVE_PROMPT_TEMPLATE;
            try {
                await this.saveLlmConfig();
                this.movePromptModal.classList.add('hidden');
            } catch (error) {
                this.logDebug('error', `save move prompt failed: ${String(error)}`);
                this.setStatus('MOVE prompt save failed');
            }
        });
        this.movePromptModal.addEventListener('click', (event) => {
            if (event.target === this.movePromptModal) this.movePromptModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-workspace-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvWorkspaceModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-workspace-fullscreen"]') as HTMLButtonElement).addEventListener('click', () => {
            this.toggleCsvWorkspaceFullscreen();
        });
        (this.root.querySelector('[data-act="csv-timing-config"]') as HTMLButtonElement).addEventListener('click', () => {
            this.renderCsvTimingConfig();
            this.csvTimingModal.classList.remove('hidden');
        });
        (this.root.querySelector('[data-act="csv-voice-config"]') as HTMLButtonElement).addEventListener('click', () => {
            this.renderCsvVoiceConfig();
            this.csvVoiceModal.classList.remove('hidden');
        });
        this.csvTimingEnabledInput.addEventListener('change', () => {
            this.csvTimingConfig.enabled = this.csvTimingEnabledInput.checked;
        });
        this.csvTimingInput.addEventListener('change', () => {
            this.csvTimingConfig = normalizeCsvTimingConfig({
                ...this.csvTimingConfig,
                targetDurationSec: Number(this.csvTimingInput.value) || DEFAULT_CSV_TARGET_DURATION_SEC
            });
            this.csvTimingInput.value = String(this.csvTimingConfig.targetDurationSec);
            this.renderCsvTimingConfig();
        });
        this.csvVoiceEnabledInput.addEventListener('change', () => {
            this.csvVoiceConfig.enabled = this.csvVoiceEnabledInput.checked && this.csvVoiceConfig.voicePool.length > 0;
            this.renderCsvVoiceConfig();
        });
        this.csvVoiceModelSelect.addEventListener('change', () => {
            this.csvVoiceConfig = normalizeCsvVoiceConfig({
                ...this.csvVoiceConfig,
                model: this.csvVoiceModelSelect.value,
                fixedVoice: '',
                voicePool: []
            });
            this.renderCsvVoiceConfig();
        });
        this.csvVoiceFixedSelect.addEventListener('change', () => {
            this.csvVoiceConfig.fixedVoice = this.csvVoiceFixedSelect.value || DEFAULT_TTS_VOICE;
            this.renderCsvVoiceConfig();
        });
        this.csvVoiceListEl.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            if (!target.matches('[data-role="csv-voice-item"]')) return;
            const picked = Array.from(this.csvVoiceListEl.querySelectorAll('[data-role="csv-voice-item"]:checked'))
                .map((item) => String((item as HTMLInputElement).value || ''));
            this.csvVoiceConfig.voicePool = picked;
            this.csvVoiceConfig.enabled = this.csvVoiceEnabledInput.checked && picked.length > 0;
            this.renderCsvVoiceConfig();
        });
        (this.root.querySelector('[data-act="csv-voice-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvVoiceConfig = normalizeCsvVoiceConfig(this.csvVoiceConfig);
            this.renderCsvVoiceConfig();
            this.csvVoiceModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-voice-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvVoiceModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-timing-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvTimingConfig = normalizeCsvTimingConfig(this.csvTimingConfig);
            this.renderCsvTimingConfig();
            this.csvTimingModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="csv-timing-estimate"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.estimateCsvTiming().catch((error) => {
                this.logDebug('error', `csv timing estimate failed: ${String(error)}`);
                this.setCsvWorkspaceStatus(`Estimate failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="csv-timing-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.csvTimingModal.classList.add('hidden');
        });
        this.csvWorkspaceModal.addEventListener('click', (event) => {
            if (event.target === this.csvWorkspaceModal) this.csvWorkspaceModal.classList.add('hidden');
        });
        this.csvTimingModal.addEventListener('click', (event) => {
            if (event.target === this.csvTimingModal) this.csvTimingModal.classList.add('hidden');
        });
        this.csvVoiceModal.addEventListener('click', (event) => {
            if (event.target === this.csvVoiceModal) this.csvVoiceModal.classList.add('hidden');
        });
        const csvDragHandle = this.root.querySelector('[data-role="csv-workspace-drag-handle"]') as HTMLDivElement;
        csvDragHandle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (this.csvWorkspaceFullscreen) return;
            const target = event.target as HTMLElement;
            if (target.closest('button,input,select,textarea,label')) return;
            const rect = this.csvWorkspacePanel.getBoundingClientRect();
            this.csvWorkspacePanel.classList.add('floating');
            this.csvWorkspacePanel.style.left = `${rect.left}px`;
            this.csvWorkspacePanel.style.top = `${rect.top}px`;
            this.csvWorkspaceDrag = {
                active: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            csvDragHandle.setPointerCapture(event.pointerId);
        });
        csvDragHandle.addEventListener('pointermove', (event) => {
            if (!this.csvWorkspaceDrag.active || event.pointerId !== this.csvWorkspaceDrag.pointerId) return;
            const dx = event.clientX - this.csvWorkspaceDrag.startX;
            const dy = event.clientY - this.csvWorkspaceDrag.startY;
            const maxX = Math.max(0, window.innerWidth - this.csvWorkspacePanel.offsetWidth);
            const maxY = Math.max(0, window.innerHeight - this.csvWorkspacePanel.offsetHeight);
            const nextLeft = clamp(this.csvWorkspaceDrag.left + dx, 0, maxX);
            const nextTop = clamp(this.csvWorkspaceDrag.top + dy, 0, maxY);
            this.csvWorkspacePanel.style.left = `${nextLeft}px`;
            this.csvWorkspacePanel.style.top = `${nextTop}px`;
        });
        const endCsvWorkspaceDrag = (event: PointerEvent) => {
            if (!this.csvWorkspaceDrag.active || event.pointerId !== this.csvWorkspaceDrag.pointerId) return;
            this.csvWorkspaceDrag.active = false;
            if (csvDragHandle.hasPointerCapture(event.pointerId)) csvDragHandle.releasePointerCapture(event.pointerId);
        };
        csvDragHandle.addEventListener('pointerup', endCsvWorkspaceDrag);
        csvDragHandle.addEventListener('pointercancel', endCsvWorkspaceDrag);
        (this.root.querySelector('[data-act="csv-content-cancel"]') as HTMLButtonElement).addEventListener('click', () => {
            this.closeCsvContentEditor();
        });
        (this.root.querySelector('[data-act="csv-content-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.saveCsvContentEditor();
        });
        this.csvContentInput.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                this.saveCsvContentEditor();
            }
        });
        this.csvContentModal.addEventListener('click', (event) => {
            if (event.target === this.csvContentModal) this.closeCsvContentEditor();
        });
        this.csvVersionListEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('button[data-act="csv-version-select"]') as HTMLButtonElement | null;
            if (!button) return;
            const id = Number(button.getAttribute('data-version-id') || 0);
            if (!id || id === this.selectedCsvVersionId) return;
            if (this.csvEditorDirty && !window.confirm('You have unsaved CSV edits. Continue without saving?')) {
                return;
            }
            void this.loadCsvVersionDetail(id).catch((error) => {
                this.setCsvWorkspaceStatus(`Load failed: ${String(error)}`);
            });
        });
        this.csvEditorInput.addEventListener('input', () => {
            this.csvEditorDirty = true;
            const current = this.selectedCsvVersion();
            this.setCsvWorkspaceStatus(current ? `Editing v${current.versionNo} (unsaved)` : 'Editing (unsaved)');
        });
        (this.root.querySelector('[data-act="csv-version-generate"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.generateCsvVersion().catch((error) => {
                this.logDebug('error', `csv generate failed: ${String(error)}`);
                this.setCsvWorkspaceTimingStatus(`Generate failed: ${String(error)}`, (error as Error & { timingSummary?: CsvTimingSummary | null })?.timingSummary || null);
            });
        });
        (this.root.querySelector('[data-act="csv-version-save"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCsvVersion().catch((error) => {
                this.logDebug('error', `csv save failed: ${String(error)}`);
                this.setCsvWorkspaceStatus(`Save failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="csv-version-save-new"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCsvVersionAsNew().catch((error) => {
                this.logDebug('error', `csv save as new failed: ${String(error)}`);
                this.setCsvWorkspaceStatus(`Version save failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="csv-version-delete"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.deleteCsvVersion().catch((error) => {
                this.logDebug('error', `csv delete failed: ${String(error)}`);
                this.setCsvWorkspaceStatus(`Delete failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="csv-version-download"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.downloadCsvVersion().catch((error) => {
                this.logDebug('error', `csv download failed: ${String(error)}`);
                this.setCsvWorkspaceStatus(`Download failed: ${String(error)}`);
            });
        });
        document.addEventListener('pointerdown', (event) => {
            if (this.llmPopover.classList.contains('hidden')) return;
            const target = event.target as HTMLElement;
            if (target.closest('[data-role="llm-popover"]') || target.closest('[data-act="open-llm-config"]')) return;
            this.llmPopover.classList.add('hidden');
        });

        this.playToggleBtn.addEventListener('click', () => {
            if (!this.playback.playing) {
                this.startPlayback();
                return;
            }
            this.playback.paused = !this.playback.paused;
            this.refreshPlaybackUi();
            this.setStatus(this.playback.paused ? 'Playback paused' : 'Playback resumed');
            if (!this.playback.paused) this.ensurePlaybackLoop();
        });
        this.stopBtn.addEventListener('click', () => {
            this.stopPlayback('Playback stopped');
        });

        this.poiListEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('[data-act]') as HTMLButtonElement | null;
            if (!button) return;
            const poiId = button.getAttribute('data-poi-id');
            const act = button.getAttribute('data-act') || '';
            if (act === 'generate-one' && poiId) {
                void this.startGenerate('single', [poiId]).catch((error) => {
                    this.logDebug('error', `single generate failed: ${String(error)}`);
                });
                return;
            }
            if (act === 'open-prompt' && poiId) {
                this.openPromptEditor({ scope: 'poi', poiId });
                return;
            }
            if (act === 'delete-image' && poiId) {
                void this.clearPoiScreenshot(poiId);
                return;
            }
            if (act === 'delete-poi-inline' && poiId) {
                this.deletePoiInline(poiId);
                return;
            }
            if (act === 'save-poi-row' && poiId) {
                void this.savePoiRowFromCard(poiId);
            }
        });
        this.poiListEl.addEventListener('change', (event) => {
            const target = event.target as HTMLElement;
            const field = target.getAttribute('data-field');
            const poiId = target.getAttribute('data-poi-id');
            if (!field || !poiId) return;
            void this.savePoiRowFromCard(poiId);
        });
        this.poiListEl.addEventListener('input', (event) => {
            const target = event.target as HTMLElement;
            const field = target.getAttribute('data-field');
            const poiId = target.getAttribute('data-poi-id');
            if (!field || !poiId) return;
            if (field === 'poi-content' && target instanceof HTMLTextAreaElement) {
                this.autoSizePoiContentTextarea(target);
                const poi = this.pois.find((x) => x.poiId === poiId);
                if (poi) poi.content = target.value;
            }
        });

        this.batchGenerateBtn.addEventListener('click', () => {
            const ids = this.pois.map(p => p.poiId);
            if (ids.length < 1) return;
            void this.startGenerate('batch', ids).catch((error) => {
                this.logDebug('error', `batch generate failed: ${String(error)}`);
            });
        });
        this.stopBatchBtn.addEventListener('click', async () => {
            if (!this.job.jobId) return;
            await fetch(`${this.apiBase()}/content/jobs/${encodeURIComponent(this.job.jobId)}/stop`, { method: 'POST' });
            this.job.paused = true;
            this.updateBatchProgressText('Paused at');
        });
        this.resumeBatchBtn.addEventListener('click', async () => {
            if (!this.job.jobId) return;
            await fetch(`${this.apiBase()}/content/jobs/${encodeURIComponent(this.job.jobId)}/resume`, { method: 'POST' });
            this.job.paused = false;
            this.updateBatchProgressText('Resumed');
            this.streamJob(this.job.jobId);
        });

        (this.root.querySelector('[data-act="export-csv"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.openCsvWorkspace().catch((error) => {
                this.logDebug('error', `open csv workspace failed: ${String(error)}`);
                this.setStatus('CSV workspace open failed');
            });
        });
        (this.root.querySelector('[data-act="import-csv"]') as HTMLButtonElement).addEventListener('click', () => {
            this.importInput.click();
        });
        this.importInput.addEventListener('change', () => {
            const file = this.importInput.files?.[0];
            if (!file) return;
            void this.importCsv(file);
            this.importInput.value = '';
        });

        const mapPointer = (canvas: HTMLCanvasElement, event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: ((event.clientX - rect.left) / rect.width) * canvas.width,
                y: ((event.clientY - rect.top) / rect.height) * canvas.height
            };
        };

        this.topCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
        this.frontCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

        this.topCanvas.addEventListener('pointerdown', (event) => {
            if (!this.requireModel()) return;
            const p = mapPointer(this.topCanvas, event);
            if (event.button === 2) {
                this.drag = { active: true, pointerId: event.pointerId, mode: 'top-pan', startX: p.x, startY: p.y };
                this.topCanvas.setPointerCapture(event.pointerId);
                return;
            }
            if (event.button !== 0) return;
            const selected = this.selectedPoi();
            if (selected) {
                const c = this.projectTop(selected.targetX, selected.targetZ);
                const yawR = degToRad(selected.targetYaw);
                const hx = c.x + Math.sin(yawR) * 26;
                const hy = c.y + Math.cos(yawR) * 26;
                if (Math.hypot(hx - p.x, hy - p.y) < 10) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: 'top-yaw', startX: p.x, startY: p.y };
                    this.topCanvas.setPointerCapture(event.pointerId);
                    return;
                }
            }
            let nearest: TourPoi | null = null;
            let nd = Number.POSITIVE_INFINITY;
            this.pois.forEach((poi) => {
                const c = this.projectTop(poi.targetX, poi.targetZ);
                const d = Math.hypot(c.x - p.x, c.y - p.y);
                if (d < nd) { nd = d; nearest = poi; }
            });
            if (nearest && nd <= 10) {
                this.selectedPoiId = nearest.poiId;
                this.refreshPoiControls();
                return;
            }
            const world = this.unprojectTop(p.x, p.y);
            const poi = this.createPoi(world.x, 0, world.z);
            this.pois.push(poi);
            this.selectedPoiId = poi.poiId;
            this.refreshPoiControls();
            this.debounceSave('poi-add-topview');
        });

        this.topCanvas.addEventListener('pointermove', (event) => {
            if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
            const p = mapPointer(this.topCanvas, event);
            if (this.drag.mode === 'top-pan') {
                const dx = p.x - this.drag.startX;
                const dy = p.y - this.drag.startY;
                this.drag.startX = p.x;
                this.drag.startY = p.y;
                this.topView.offsetX += dx;
                this.topView.offsetY += dy;
                this.drawViews();
            } else if (this.drag.mode === 'top-yaw') {
                const poi = this.selectedPoi();
                if (!poi) return;
                const c = this.projectTop(poi.targetX, poi.targetZ);
                poi.targetYaw = Math.atan2(p.x - c.x, p.y - c.y) * 180 / Math.PI;
                this.drawViews();
            }
        });

        this.topCanvas.addEventListener('pointerup', (event) => {
            if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
            this.drag.active = false;
            this.drag.mode = null;
            this.debounceSave('top-pointerup');
            if (this.topCanvas.hasPointerCapture(event.pointerId)) this.topCanvas.releasePointerCapture(event.pointerId);
        });

        this.frontCanvas.addEventListener('pointerdown', (event) => {
            if (!this.requireModel()) return;
            const p = mapPointer(this.frontCanvas, event);
            if (event.button === 2) {
                this.drag = { active: true, pointerId: event.pointerId, mode: 'front-pan', startX: p.x, startY: p.y };
                this.frontCanvas.setPointerCapture(event.pointerId);
                return;
            }
            if (event.button !== 0) return;

            const selected = this.selectedPoi();
            if (selected) {
                const c = this.projectFront(selected.targetX, this.poiEyeY(selected));
                const pitchR = degToRad(selected.targetPitch);
                const hx = c.x + Math.cos(pitchR) * 24;
                const hy = c.y - Math.sin(pitchR) * 24;
                if (Math.hypot(hx - p.x, hy - p.y) < 10) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: 'front-pitch', startX: p.x, startY: p.y };
                    this.frontCanvas.setPointerCapture(event.pointerId);
                    return;
                }
                if (Math.hypot(c.x - p.x, c.y - p.y) < 10) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: 'front-move', startX: p.x, startY: p.y };
                    this.frontCanvas.setPointerCapture(event.pointerId);
                    return;
                }
            }

            let nearest: TourPoi | null = null;
            let nd = Number.POSITIVE_INFINITY;
            this.pois.forEach((poi) => {
                const c = this.projectFront(poi.targetX, this.poiEyeY(poi));
                const d = Math.hypot(c.x - p.x, c.y - p.y);
                if (d < nd) { nd = d; nearest = poi; }
            });
            if (nearest && nd <= 10) {
                this.selectedPoiId = nearest.poiId;
                this.refreshPoiControls();
                this.drag = { active: true, pointerId: event.pointerId, mode: 'front-move', startX: p.x, startY: p.y };
                this.frontCanvas.setPointerCapture(event.pointerId);
            }
        });

        this.frontCanvas.addEventListener('pointermove', (event) => {
            if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
            const p = mapPointer(this.frontCanvas, event);
            if (this.drag.mode === 'front-pan') {
                const dx = p.x - this.drag.startX;
                const dy = p.y - this.drag.startY;
                this.drag.startX = p.x;
                this.drag.startY = p.y;
                this.frontView.offsetX += dx;
                this.frontView.offsetY += dy;
                this.drawViews();
            } else if (this.drag.mode === 'front-pitch') {
                const poi = this.selectedPoi();
                if (!poi) return;
                const c = this.projectFront(poi.targetX, this.poiEyeY(poi));
                poi.targetPitch = Math.atan2(-(p.y - c.y), p.x - c.x) * 180 / Math.PI;
                this.drawViews();
            } else if (this.drag.mode === 'front-move') {
                const poi = this.selectedPoi();
                if (!poi) return;
                const world = this.unprojectFront(p.x, p.y);
                poi.targetX = world.x;
                poi.targetY = world.y - this.eyeHeightM;
                this.drawViews();
            }
        });

        this.frontCanvas.addEventListener('pointerup', (event) => {
            if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
            this.drag.active = false;
            this.drag.mode = null;
            this.debounceSave('front-pointerup');
            if (this.frontCanvas.hasPointerCapture(event.pointerId)) this.frontCanvas.releasePointerCapture(event.pointerId);
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
            this.panelDrag = {
                active: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            dragHandle.setPointerCapture(event.pointerId);
        });
        dragHandle.addEventListener('pointermove', (event) => {
            if (!this.panelDrag.active || event.pointerId !== this.panelDrag.pointerId) return;
            const dx = event.clientX - this.panelDrag.startX;
            const dy = event.clientY - this.panelDrag.startY;
            this.root.style.left = `${this.panelDrag.left + dx}px`;
            this.root.style.top = `${this.panelDrag.top + dy}px`;
        });
        const endPanelDrag = (event: PointerEvent) => {
            if (!this.panelDrag.active || event.pointerId !== this.panelDrag.pointerId) return;
            this.panelDrag.active = false;
            if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
        };
        dragHandle.addEventListener('pointerup', endPanelDrag);
        dragHandle.addEventListener('pointercancel', endPanelDrag);
    }
}

const mountOTTourLoaderPanel = (options: TourLoaderOptions): TourLoaderController => {
    return new TourLoaderPanel(options);
};

export {
    mountOTTourLoaderPanel,
    type TourLoaderController,
    type TourLoaderOptions
};

export const OT_TOUR_LOADER_TEST_EXPORT = {
    OT_TOUR_CSV_HEADERS,
    OT_TOUR_CSV_VERSION,
    escapeCsv
};
