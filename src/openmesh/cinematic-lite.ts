import { clearModelData, createCsvVersion, createJob, createRealtimeSegment, createRealtimeTurn, deleteCsvVersion, expandPrompt, fetchConfig, fetchJob, getCsvVersion, getNarration, listCaptures, listCsvVersions, saveCaptures, saveNarration, synthesizeRealtimeSpeech, transcribeRealtimeAudio, updateCsvVersion } from './cinematic-lite-api';
import { normalizeCameraStateForRtc } from './backend/camera-control.mjs';
import { CinematicLitePlayer } from './cinematic-lite-player';
import type { CaptureItem, ChatMessage, CsvRow, JobSnapshot, PlanResult, RealtimeTurnResult, SegmentPlan, ViewId } from './cinematic-lite-types';
import { formatCameraStateForDebug, normalizeCameraStateForCl } from './camera-control';
import { CinematicLiteViewer } from './cinematic-lite-viewer';
import { createRealtimeLiveSession } from './realtime-live-session';
import type { RealtimeContextSnapshot, RealtimeLiveEvent, RealtimeLiveSession } from './realtime-live-session';
import { createRealtimeVoiceStream } from './realtime-voice-stream';
import type { RealtimeVoiceStream, VoiceStreamEvent } from './realtime-voice-stream';
import { mountRtcRecordingModule, type RtcRecordingModuleController } from './rtc-recording-module';

const DEFAULT_SIMPLE_PROMPT = '请把铜车马作为完整三维文物来拍摄，镜头必须形成一轮明显的360度环绕，不要只盯住单一面。要根据讲解词语义与六面截图、模型空间范围来判断该看车顶、车底、轮、马头、车厢等关键部位；每句讲解前先移动到机位，再讲解。';
const DEFAULT_STYLE_GUIDANCE = '镜头风格偏博物馆导览，沉稳、清晰、空间感强。整体展示时完成大范围环绕，讲车顶时飞到上方俯视，讲底厢与车轮时飞到低机位或下方，讲马头与动态时飞到前侧近景。';
const DEFAULT_NARRATION = '在展柜当中我们所看到的这一件文物呢，是我们贵州省博物馆的镇馆之宝，东汉的铜车马，也是馆藏的一级文物。这件铜车马我们将从几个关键词来介绍，第一个就是它的地位。其实作为我们中国的观众，大家提到铜车马这三个字，自然就会联想到秦始皇陵里面所出土的两件。无论是加工工艺还是体型大小，都可以称之为是中国的青铜之冠。但是如果把时间具体到秦之后的汉代，中国目前所出土的车加马的数量本身都很有限，更不要说青铜所制作的。';

const BUILTIN_MODELS = [{ id: 'bronze-chariot', label: 'B.1.13119.mview', assetUrl: '/workspace-resource/B.1.13119%20%E4%B8%9C%E6%B1%89%E9%93%9C%E8%BD%A6%E9%A9%AC%202/B.1.13119.mview', filePath: 'Resource/B.1.13119 东汉铜车马 2/B.1.13119.mview' }];
const VIEW_ORDER: ViewId[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];

type LocalModelSelection = { name: string; objectUrl: string; file: File; };
type RealtimeProvider = 'gemini' | 'qwen';
type VoiceProvider = 'aliyun' | 'gemini_live';
type DebugEntry = { summary: string; detail?: string; source: string; time: string; };
type RtcFilter = 'chat' | 'system' | 'all';
type VoiceBargeInMode = 'valid_word' | 'speech_start';
type RtcEvent = {
    id: string;
    kind: 'chat' | 'system';
    role: ChatMessage['role'];
    title: string;
    content: string;
    timestamp: string;
    detail?: string;
    latencyMs?: number;
};

type RealtimeDebugShape = {
    strategy?: string;
    provider?: string;
    model?: string;
    rawText?: string;
    normalizedDecision?: unknown;
    synthesizedCamera?: unknown;
    cacheState?: unknown;
    responseId?: string;
    cachedTokens?: number;
    sessionId?: string;
    sessionCreated?: boolean;
};

const DEFAULT_ALIYUN_ASR_MODEL = 'fun-asr-realtime';
const aliyunAsrSampleRate = (model: string) => (String(model || '').includes('8k') ? 8000 : 16000);

const prettyJson = (value: unknown) => {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const escapeHtml = (value: string) => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const PLAY_ICON = '<svg class="cw-svg filled" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>';
const PAUSE_ICON = '<svg class="cw-svg filled" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect fill="currentColor" x="7" y="6" width="3" height="12" rx="1"></rect><rect fill="currentColor" x="14" y="6" width="3" height="12" rx="1"></rect></svg>';
const RTC_PLAY_ICON = PLAY_ICON;
const RTC_PAUSE_ICON = PAUSE_ICON;
const RTC_MINIMAL_ICON = '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 10H6V6"></path><path d="M14 10h4V6"></path><path d="M10 14H6v4"></path><path d="M14 14h4v4"></path><path d="M10 10 6 6"></path><path d="M14 10l4-4"></path><path d="M10 14l-4 4"></path><path d="M14 14l4 4"></path></svg>';
const RTC_FULL_ICON = '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"></path><path d="M16 4h4v4"></path><path d="M8 20H4v-4"></path><path d="M16 20h4v-4"></path><path d="M8 8 4 4"></path><path d="M16 8l4-4"></path><path d="M8 16l-4 4"></path><path d="M16 16l4 4"></path></svg>';
const MIC_OFF_ICON = '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"></path><path d="M19 11a7 7 0 0 1-12.04 4.96"></path><path d="M5 11a7 7 0 0 0 11.2 5.6"></path><path d="M12 18v3"></path><path d="M9 21h6"></path><path d="M4 4l16 16"></path></svg>';
const MIC_ON_ICON = '<svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"></path><path d="M19 11a7 7 0 0 1-14 0"></path><path d="M12 18v3"></path><path d="M9 21h6"></path></svg>';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const composeComplexPrompt = (styleGuidance: string) => [
    '你是博物馆文物讲解视频的飞行镜头导演。',
    '',
    '输出要求：',
    '1. 必须输出纯 JSON，不要 Markdown，不要代码块，不要解释文字。',
    '2. 顶层必须是 object，包含 title、summary、segments。',
    '3. segments 必须严格对齐 segments_json：数量一致、顺序一致、segmentId 一致、text 一致。',
    '4. 不允许改写、合并、拆分、遗漏或新增任何句子。',
    '5. 每个 segment 必须包含 segmentId、text、focusView、focusPart、moveBeforeSec、moveSpeedMps、speechMode、camera、rationale。',
    '6. camera 必须包含 mview、sweepYawDeg、sweepPitchDeg。',
    '7. mview 必须包含 pivot、rotation、radius、fov。',
    '8. rotation 必须是长度为 2 的数组，顺序固定为 [pitch, yaw]，并且格式、单位、语义必须与当前系统 Camera Control 完全一致。',
    '9. 不要返回 cameraX、cameraY、cameraZ、lookAtX、lookAtY、lookAtZ、yawDeg、pitchDeg、fovDeg、target_x、target_y、target_z 等派生字段。',
    '10. focusView 只能从 front、back、left、right、top、bottom 中选择。',
    '11. 必须结合 segments_json、capture_views_json、model_context_json 一起规划镜头，其中 capture_views_json 的 imageIndex 与实际输入图片顺序一一对应。',
    '12. 如果你想给出相机参数，只能放在 camera.mview 里，不能使用旧版 cameraX / lookAtX / yawDeg / pitchDeg 结构。',
    '',
    'camera 示例：',
    '{"camera":{"mview":{"pivot":[0,0,0],"rotation":[0,0],"radius":10,"fov":45},"sweepYawDeg":0,"sweepPitchDeg":0}}',
    '',
    '镜头规则：',
    '1. 整体至少形成明显环绕，而不是只停留在单一面。',
    '2. 提到车顶、棚顶时，镜头必须飞到上方俯视。',
    '3. 提到底厢、车底、轮、轮轴时，镜头必须飞到低机位或下方视角。',
    '4. 提到马头、嘶鸣、奔驰姿态时，镜头必须飞到马头前侧或侧前方。',
    '5. 每句讲解前先移动到目标机位，再开始讲解。',
    '6. moveSpeedMps 应反映相邻句子之间的移动速度，通常在 0.3 到 1.8 之间。',
    '',
    '运镜风格补充：',
    String(styleGuidance || '').trim() || DEFAULT_STYLE_GUIDANCE
].join('\n');

const DEFAULT_COMPLEX_PROMPT = composeComplexPrompt(DEFAULT_STYLE_GUIDANCE);

const parseCsv = (csvText: string): CsvRow[] => {
    const lines = String(csvText || '').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',');
    return lines.slice(1).filter(Boolean).map((line, index) => {
        const cells: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                cells.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        cells.push(current);
        const row: Record<string, string> = {};
        headers.forEach((header, headerIndex) => { row[header] = cells[headerIndex] || ''; });
        return {
            seq: Number(row.seq || index + 1),
            segment_id: row.segment_id || '',
            focus_view: row.focus_view || '',
            focus_part: row.focus_part || '',
            action: row.action || '',
            audio_mode: row.audio_mode || '',
            move_before_sec: row.move_before_sec || '',
            pivot_x: row.pivot_x || row.look_at_x || '0',
            pivot_y: row.pivot_y || row.look_at_y || '0',
            pivot_z: row.pivot_z || row.look_at_z || '0',
            rotation_pitch: row.rotation_pitch || row.target_pitch || '0',
            rotation_yaw: row.rotation_yaw || row.target_yaw || '0',
            radius: row.radius || row.target_radius || '1',
            fov: row.fov || row.target_fov || '45',
            target_x: row.target_x || '',
            target_y: row.target_y || '',
            target_z: row.target_z || '',
            look_at_x: row.look_at_x || '',
            look_at_y: row.look_at_y || '',
            look_at_z: row.look_at_z || '',
            target_yaw: row.target_yaw || '',
            target_pitch: row.target_pitch || '',
            target_fov: row.target_fov || '',
            target_radius: row.target_radius || '',
            move_speed_mps: row.move_speed_mps || '',
            sweep_yaw_deg: row.sweep_yaw_deg || '',
            sweep_pitch_deg: row.sweep_pitch_deg || '',
            content: row.content || ''
        };
    });
};

const round = (value: number, digits = 6) => Number(Number(value || 0).toFixed(digits));

const stringifyCsv = (rows: CsvRow[]) => {
    const headers = ['seq', 'segment_id', 'focus_view', 'focus_part', 'action', 'audio_mode', 'move_before_sec', 'pivot_x', 'pivot_y', 'pivot_z', 'rotation_pitch', 'rotation_yaw', 'radius', 'fov', 'target_x', 'target_y', 'target_z', 'look_at_x', 'look_at_y', 'look_at_z', 'target_yaw', 'target_pitch', 'target_fov', 'target_radius', 'move_speed_mps', 'sweep_yaw_deg', 'sweep_pitch_deg', 'content'];
    const quote = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
    return [headers.join(','), ...rows.map((row) => [row.seq, row.segment_id, row.focus_view, quote(row.focus_part), row.action, row.audio_mode, row.move_before_sec, row.pivot_x, row.pivot_y, row.pivot_z, row.rotation_pitch, row.rotation_yaw, row.radius, row.fov, row.target_x, row.target_y, row.target_z, row.look_at_x, row.look_at_y, row.look_at_z, row.target_yaw, row.target_pitch, row.target_fov, row.target_radius, row.move_speed_mps, row.sweep_yaw_deg, row.sweep_pitch_deg, quote(row.content)].join(','))].join('\n');
};

const normalizeCapture = (capture: CaptureItem): CaptureItem => ({
    ...capture,
    camera: normalizeCameraStateForCl(capture.camera)
});

const csvRowsFromPlan = (plan: PlanResult['plan'] | null | undefined): CsvRow[] => (plan?.segments || []).map((segment, index) => ({
    seq: index + 1,
    segment_id: segment.segmentId,
    focus_view: segment.focusView,
    focus_part: segment.focusPart,
    action: 'MOVE_AND_SPEAK',
    audio_mode: segment.speechMode,
    move_before_sec: segment.moveBeforeSec.toFixed(2),
    pivot_x: segment.camera.mview.pivot[0].toFixed(4),
    pivot_y: segment.camera.mview.pivot[1].toFixed(4),
    pivot_z: segment.camera.mview.pivot[2].toFixed(4),
    rotation_pitch: segment.camera.mview.rotation[0].toFixed(4),
    rotation_yaw: segment.camera.mview.rotation[1].toFixed(4),
    radius: segment.camera.mview.radius.toFixed(4),
    fov: segment.camera.mview.fov.toFixed(2),
    target_x: segment.camera.cameraX.toFixed(4),
    target_y: segment.camera.cameraY.toFixed(4),
    target_z: segment.camera.cameraZ.toFixed(4),
    look_at_x: segment.camera.lookAtX.toFixed(4),
    look_at_y: segment.camera.lookAtY.toFixed(4),
    look_at_z: segment.camera.lookAtZ.toFixed(4),
    target_yaw: segment.camera.yawDeg.toFixed(2),
    target_pitch: segment.camera.pitchDeg.toFixed(2),
    target_fov: segment.camera.fovDeg.toFixed(2),
    target_radius: segment.camera.radius.toFixed(4),
    move_speed_mps: segment.moveSpeedMps.toFixed(2),
    sweep_yaw_deg: String(segment.camera.sweepYawDeg || 0),
    sweep_pitch_deg: String(segment.camera.sweepPitchDeg || 0),
    content: segment.text
}));

class CinematicLiteApp {
    private readonly viewer = new CinematicLiteViewer();

    private readonly player = new CinematicLitePlayer(this.viewer, (message) => this.setStatus(message, 'player'), (segment) => this.renderActiveSegment(segment), {
        onState: (state) => this.handlePlayerState(state),
        onTime: (seconds) => this.renderPlayTime(seconds),
        onQueueChange: (snapshot) => this.renderQueueSnapshot(snapshot.mainQueue, snapshot.priorityQueue, snapshot.current),
        resolveAudioUrl: (segment) => this.resolveSegmentAudio(segment),
        onAudioChange: (audio) => this.recordingModule?.setPlaybackAudioElement(audio)
    });

    private loadedModelId: string | null = null;

    private localModel: LocalModelSelection | null = null;

    private modelFilename = BUILTIN_MODELS[0].filePath;

    private captures = new Map<ViewId, CaptureItem>();

    private planResult: PlanResult | null = null;

    private activeJobId: string | null = null;

    private polling = 0;

    private manualMode = false;

    private csvText = '';

    private csvRows: CsvRow[] = [];

    private simplePrompt = DEFAULT_SIMPLE_PROMPT;

    private complexPrompt = DEFAULT_COMPLEX_PROMPT;

    private debugEntries: DebugEntry[] = [];

    private lastLoggedJobStage = '';

    private lastLoggedJobRequestPrompt = '';

    private lastLoggedJobRawResponse = '';

    private inspectedCapture: CaptureItem | null = null;

    private selectedCsvVersionId: string | null = null;

    private contentEditingRowIndex: number | null = null;

    private csvVersions: Array<{ id: string; version_name: string; created_at: string; updated_at: string; }> = [];

    private adjustingRowIndex: number | null = null;

    private playerState: 'idle' | 'playing' | 'paused' | 'stopped' | 'completed' = 'idle';

    private chatHistory: ChatMessage[] = [];

    private rtcEvents: RtcEvent[] = [];

    private activeRtcFilter: RtcFilter = 'chat';

    private realtimeEnabled = false;

    private voiceModeActive = false;

    private voiceStream: RealtimeVoiceStream | null = null;

    private liveSession: RealtimeLiveSession | null = null;

    private activeVoiceUtteranceId = '';

    private activeVoicePartialText = '';

    private activeLiveTurnQuestion = '';

    private activeLiveResponseText = '';

    private currentMicLevel = 0;

    private activeTurnRequestId = 0;

    private activeTurnAbortController: AbortController | null = null;

    private voiceBargeInMode: VoiceBargeInMode = 'valid_word';

    private voiceBargeInTriggeredUtterances = new Set<string>();

    private voiceUtteranceBlobs = new Map<string, Blob>();

    private chatProvider: RealtimeProvider = 'gemini';

    private chatModels: Record<string, string[]> = { gemini: [], qwen: [] };

    private liveProviders: Record<string, { configured?: boolean; model?: string; models?: string[]; updatedAt?: string; }> = {};

    private asrProvider: VoiceProvider = 'aliyun';

    private asrModel = DEFAULT_ALIYUN_ASR_MODEL;

    private readonly audioCache = new Map<string, string>();

    private readonly shellEl = document.querySelector('.cwf-shell') as HTMLDivElement;
    private readonly realtimePanelEl = document.getElementById('cinelite-realtime-panel') as HTMLDivElement;
    private readonly realtimePanelHeadEl = this.realtimePanelEl.querySelector('.crt-head') as HTMLDivElement;
    private readonly shellHeadEl = document.querySelector('.cwf-head') as HTMLDivElement;
    private readonly statusEl = document.getElementById('cinelite-status') as HTMLDivElement;
    private readonly modelStatusEl = document.getElementById('cinelite-model-status') as HTMLDivElement;
    private readonly promptStatusEl = document.getElementById('cinelite-prompt-status') as HTMLDivElement;
    private readonly captureStatusEl = document.getElementById('cinelite-capture-status') as HTMLDivElement;
    private readonly csvStatusEl = document.getElementById('cinelite-csv-status') as HTMLDivElement;
    private readonly realtimeStatusEl = document.getElementById('cinelite-realtime-status') as HTMLDivElement;
    private readonly modelFileEl = document.getElementById('cinelite-model-file') as HTMLDivElement;
    private readonly modelFileInput = document.getElementById('cinelite-model-file-input') as HTMLInputElement;
    private readonly modelProgressEl = document.getElementById('cinelite-model-progress') as HTMLDivElement;
    private readonly modelProgressTextEl = document.getElementById('cinelite-model-progress-text') as HTMLDivElement;
    private readonly modelUploadMetaEl = document.getElementById('cinelite-model-upload-meta') as HTMLDivElement;
    private readonly ttsModelEl = document.getElementById('cinelite-tts-model') as HTMLSelectElement;
    private readonly ttsVoiceEl = document.getElementById('cinelite-tts-voice') as HTMLSelectElement;
    private readonly ttsMetaEl = document.getElementById('cinelite-tts-meta') as HTMLDivElement;
    private readonly narrationInput = document.getElementById('cinelite-narration') as HTMLTextAreaElement;
    private readonly captureGrid = document.getElementById('cinelite-captures') as HTMLDivElement;
    private readonly manualPanel = document.getElementById('cinelite-manual-panel') as HTMLDivElement;
    private readonly manualGrid = document.getElementById('cinelite-manual-grid') as HTMLDivElement;
    private readonly settingsModal = document.getElementById('cinelite-settings-modal') as HTMLDivElement;
    private readonly narrationModal = document.getElementById('cinelite-narration-modal') as HTMLDivElement;
    private readonly simpleModal = document.getElementById('cinelite-simple-modal') as HTMLDivElement;
    private readonly complexModal = document.getElementById('cinelite-complex-modal') as HTMLDivElement;
    private readonly csvModal = document.getElementById('cinelite-csv-modal') as HTMLDivElement;
    private readonly csvRawModal = document.getElementById('cinelite-csv-raw-modal') as HTMLDivElement;
    private readonly contentModal = document.getElementById('cinelite-content-modal') as HTMLDivElement;
    private readonly csvGrid = document.getElementById('cinelite-csv-grid') as HTMLTableElement;
    private readonly csvVersionListEl = document.getElementById('cinelite-csv-version-list') as HTMLDivElement;
    private readonly csvModalStatus = document.getElementById('cinelite-csv-modal-status') as HTMLDivElement;
    private readonly csvRawPre = document.getElementById('cinelite-csv-raw-pre') as HTMLPreElement;
    private readonly contentEditor = document.getElementById('cinelite-content-editor') as HTMLTextAreaElement;
    private readonly contentStatusEl = document.getElementById('cinelite-content-status') as HTMLDivElement;
    private readonly contentSaveBtn = document.getElementById('cinelite-content-save-btn') as HTMLButtonElement;
    private readonly inspectModal = document.getElementById('cinelite-capture-inspect-modal') as HTMLDivElement;
    private readonly inspectPre = document.getElementById('cinelite-capture-inspect-pre') as HTMLPreElement;
    private readonly debugRoot = document.getElementById('cinelite-debug-root') as HTMLDivElement;
    private readonly debugLogEl = document.getElementById('cinelite-debug-log') as HTMLDivElement;
    private readonly openNarrationBtn = document.getElementById('cinelite-open-narration-btn') as HTMLButtonElement;
    private readonly saveNarrationBtn = document.getElementById('cinelite-save-narration-btn') as HTMLButtonElement;
    private readonly simpleEditor = document.getElementById('cinelite-simple-editor') as HTMLTextAreaElement;
    private readonly complexEditor = document.getElementById('cinelite-complex-editor') as HTMLTextAreaElement;
    private readonly playToggleBtn = document.getElementById('cinelite-play-toggle-btn') as HTMLButtonElement;
    private readonly stopBtn = document.getElementById('cinelite-stop-btn') as HTMLButtonElement;
    private readonly applyCameraBtn = document.getElementById('cinelite-apply-camera-btn') as HTMLButtonElement;
    private readonly speedSelect = document.getElementById('cinelite-speed-select') as HTMLSelectElement;
    private readonly playTimeEl = document.getElementById('cinelite-play-time') as HTMLDivElement;
    private readonly realtimePlayToggleBtn = document.getElementById('cinelite-rtc-play-toggle-btn') as HTMLButtonElement;
    private readonly realtimeStopBtn = document.getElementById('cinelite-rtc-stop-btn') as HTMLButtonElement;
    private readonly realtimeMinimalToggleBtn = document.getElementById('cinelite-rtc-minimal-toggle-btn') as HTMLButtonElement;
    private readonly realtimeSpeedSelect = document.getElementById('cinelite-rtc-speed-select') as HTMLSelectElement;
    private readonly realtimePlayTimeEl = document.getElementById('cinelite-rtc-play-time') as HTMLDivElement;
    private readonly realtimeToggleEl = document.getElementById('cinelite-realtime-toggle') as HTMLInputElement;
    private readonly chatProviderEl = document.getElementById('cinelite-chat-provider') as HTMLSelectElement;
    private readonly chatModelEl = document.getElementById('cinelite-chat-model') as HTMLSelectElement;
    private readonly asrProviderEl = document.getElementById('cinelite-asr-provider') as HTMLSelectElement;
    private readonly asrModelEl = document.getElementById('cinelite-asr-model') as HTMLSelectElement;
    private readonly voiceBargeInValidWordEl = document.getElementById('cinelite-voice-barge-valid-word') as HTMLInputElement;
    private readonly chatInputEl = document.getElementById('cinelite-chat-input') as HTMLInputElement;
    private readonly sendChatBtnEl = document.getElementById('cinelite-send-chat-btn') as HTMLButtonElement;
    private readonly chatLogEl = document.getElementById('cinelite-chat-log') as HTMLDivElement;
    private readonly recordBtnEl = document.getElementById('cinelite-record-btn') as HTMLButtonElement;
    private readonly chatCountEl = document.getElementById('cinelite-chat-count') as HTMLDivElement;
    private readonly chatFilterBtns = Array.from(this.realtimePanelEl.querySelectorAll('[data-chat-filter]')) as HTMLButtonElement[];
    private readonly mainQueueCountEl = document.getElementById('cinelite-main-queue-count') as HTMLDivElement;
    private readonly priorityQueueCountEl = document.getElementById('cinelite-priority-queue-count') as HTMLDivElement;
    private readonly currentQueueLabelEl = document.getElementById('cinelite-current-queue-label') as HTMLDivElement;
    private readonly mainQueueListEl = document.getElementById('cinelite-main-queue-list') as HTMLDivElement;
    private readonly priorityQueueListEl = document.getElementById('cinelite-priority-queue-list') as HTMLDivElement;
    private readonly rtcRecordTimerEl = document.getElementById('cinelite-rtc-record-timer') as HTMLSpanElement;
    private readonly rtcRecordOpenBtn = document.getElementById('cinelite-rtc-record-open-btn') as HTMLButtonElement;
    private readonly rtcRecordPauseBtn = document.getElementById('cinelite-rtc-record-pause-btn') as HTMLButtonElement;
    private readonly rtcRecordStopBtn = document.getElementById('cinelite-rtc-record-stop-btn') as HTMLButtonElement;

    private ttsVoicesByModel: Record<string, string[]> = {};
    private dragActive = false;
    private dragPointerId = -1;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragBaseLeft = 0;
    private dragBaseTop = 0;
    private realtimeDragActive = false;
    private realtimeDragPointerId = -1;
    private realtimeDragStartX = 0;
    private realtimeDragStartY = 0;
    private realtimeDragBaseLeft = 0;
    private realtimeDragBaseTop = 0;
    private realtimeMinimalMode = true;
    private recordingModule: RtcRecordingModuleController | null = null;

    private readonly syncCapturesFromServer = () => {
        if (!this.loadedModelId) return;
        void this.loadSavedCaptures();
    };

    async boot() {
        this.narrationInput.value = DEFAULT_NARRATION;
        this.simpleEditor.value = this.simplePrompt;
        this.complexEditor.value = this.complexPrompt;
        this.modelUploadMetaEl.textContent = '未上传本地模型';
        this.bindEvents();
        this.mountRecordingModule();
        this.renderCaptureCards();
        this.renderManualButtons();
        this.renderChatLog();
        this.applyRealtimeMinimalMode();
        const config = await fetchConfig();
        this.ttsVoicesByModel = config.config.tts.voicesByModel || {};
        this.populateTtsControls(config.config.tts.models || [], config.config.tts.model, config.config.tts.voice);
        this.chatModels = {
            gemini: config?.config?.realtime?.llm?.providers?.gemini?.models || [],
            qwen: config?.config?.realtime?.llm?.providers?.qwen?.models || []
        };
        this.chatProvider = (config?.config?.realtime?.llm?.selectedProvider === 'qwen' ? 'qwen' : 'gemini');
        this.chatProviderEl.value = this.chatProvider;
        this.populateChatModelSelect();
        this.asrProvider = (config?.config?.realtime?.live?.provider === 'gemini_live' ? 'gemini_live' : 'aliyun');
        this.liveProviders = config?.config?.realtime?.live?.providers || {};
        this.populateVoiceProviderOptions(this.liveProviders);
        this.asrProviderEl.value = this.asrProvider;
        this.populateVoiceModelSelect(this.liveProviders, config?.config?.realtime?.live?.model || config?.config?.realtime?.asr?.model || DEFAULT_ALIYUN_ASR_MODEL);
        this.voiceBargeInValidWordEl.checked = this.voiceBargeInMode === 'valid_word';
        this.renderUnifiedSettingsMeta();
        this.updateVoiceUi();
        this.captureStatusEl.textContent = '已抓取 0/6 张截图';
        this.csvStatusEl.textContent = '生成后可在弹窗中查看和修改 CSV';
        this.realtimeStatusEl.textContent = '关闭时仅播放主 CSV';
        this.renderQueueSnapshot([], [], null);
        try {
            await this.loadSelectedModel();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`模型自动加载失败：${message}`, 'viewer');
            this.appendLog('viewer', `auto-load failed: ${message}`);
        }
    }

    private bindEvents() {
        (document.getElementById('cinelite-open-settings-btn') as HTMLButtonElement).addEventListener('click', () => this.openModal(this.settingsModal));
        (document.getElementById('cinelite-save-settings-btn') as HTMLButtonElement).addEventListener('click', () => this.saveSettings());
        (document.getElementById('cinelite-upload-model-btn') as HTMLButtonElement).addEventListener('click', () => this.modelFileInput.click());
        this.modelFileInput.addEventListener('change', () => {
            const file = this.modelFileInput.files?.[0] || null;
            if (file) this.setLocalModel(file);
        });
        this.ttsModelEl.addEventListener('change', () => this.populateVoiceOptions(this.ttsModelEl.value, this.ttsVoiceEl.value));
        this.openNarrationBtn.addEventListener('click', () => this.openModal(this.narrationModal));
        (document.getElementById('cinelite-open-simple-btn') as HTMLButtonElement).addEventListener('click', () => { this.simpleEditor.value = this.simplePrompt; this.openModal(this.simpleModal); });
        (document.getElementById('cinelite-open-complex-btn') as HTMLButtonElement).addEventListener('click', () => { this.complexEditor.value = this.complexPrompt; this.openModal(this.complexModal); });
        this.saveNarrationBtn.addEventListener('click', () => { void this.persistNarration(); });
        (document.getElementById('cinelite-save-simple-btn') as HTMLButtonElement).addEventListener('click', () => { this.simplePrompt = this.simpleEditor.value.trim() || DEFAULT_SIMPLE_PROMPT; this.closeModal(this.simpleModal); });
        (document.getElementById('cinelite-save-complex-btn') as HTMLButtonElement).addEventListener('click', () => { this.complexPrompt = this.complexEditor.value.trim() || DEFAULT_COMPLEX_PROMPT; this.closeModal(this.complexModal); });
        (document.getElementById('cinelite-run-simple-btn') as HTMLButtonElement).addEventListener('click', () => { void this.expandComplexPrompt(); });
        (document.getElementById('cinelite-capture-auto-btn') as HTMLButtonElement).addEventListener('click', () => { void this.captureSixViews(); });
        (document.getElementById('cinelite-toggle-manual-btn') as HTMLButtonElement).addEventListener('click', () => this.toggleManualMode());
        (document.getElementById('cinelite-clear-model-data-btn') as HTMLButtonElement).addEventListener('click', () => { void this.clearCurrentModelData(); });
        (document.getElementById('cinelite-run-complex-btn') as HTMLButtonElement).addEventListener('click', () => { void this.generatePlan(); });
        (document.getElementById('cinelite-open-csv-btn') as HTMLButtonElement).addEventListener('click', () => { void this.openCsvModal(); });
        (document.getElementById('cinelite-save-csv-btn') as HTMLButtonElement).addEventListener('click', () => this.saveCsv());
        (document.getElementById('cinelite-download-csv-modal-btn') as HTMLButtonElement).addEventListener('click', () => this.downloadCsv());
        (document.getElementById('cinelite-download-btn') as HTMLButtonElement).addEventListener('click', () => this.downloadCsv());
        (document.getElementById('cinelite-csv-version-generate') as HTMLButtonElement).addEventListener('click', () => { void this.generateCsvVersion(); });
        (document.getElementById('cinelite-csv-version-save') as HTMLButtonElement).addEventListener('click', () => { void this.saveCurrentCsvVersion(); });
        (document.getElementById('cinelite-csv-version-save-new') as HTMLButtonElement).addEventListener('click', () => { void this.saveCsvAsNewVersion(); });
        (document.getElementById('cinelite-csv-version-delete') as HTMLButtonElement).addEventListener('click', () => { void this.deleteCurrentCsvVersion(); });
        this.contentSaveBtn.addEventListener('click', () => this.applyContentEditor());
        this.playToggleBtn.addEventListener('click', () => this.togglePlayPause());
        this.realtimePlayToggleBtn.addEventListener('click', () => this.togglePlayPause());
        this.stopBtn.addEventListener('click', () => this.player.stop());
        this.realtimeStopBtn.addEventListener('click', () => this.player.stop());
        this.realtimeMinimalToggleBtn.addEventListener('click', () => this.toggleRealtimeMinimalMode());
        this.applyCameraBtn.addEventListener('click', () => this.applyCurrentCameraToCsvRow());
        this.speedSelect.addEventListener('change', () => this.updatePlaybackRate(this.speedSelect.value));
        this.realtimeSpeedSelect.addEventListener('change', () => this.updatePlaybackRate(this.realtimeSpeedSelect.value));
        (document.getElementById('cinelite-debug-clear-btn') as HTMLButtonElement).addEventListener('click', () => { this.debugEntries = []; this.debugLogEl.innerHTML = ''; });
        (document.getElementById('cinelite-debug-copy-btn') as HTMLButtonElement).addEventListener('click', async () => navigator.clipboard.writeText(this.debugEntries.map((entry) => `${entry.time} [${entry.source}] ${entry.summary}${entry.detail ? `\n${entry.detail}` : ''}`).join('\n\n')));
        (document.getElementById('cinelite-debug-toggle-btn') as HTMLButtonElement).addEventListener('click', () => this.debugRoot.classList.toggle('collapsed'));
        (document.getElementById('cinelite-panel-toggle-btn') as HTMLButtonElement).addEventListener('click', (event) => {
            const btn = event.currentTarget as HTMLButtonElement;
            const hidden = this.shellEl.classList.toggle('hidden');
            btn.textContent = hidden ? '展开主面板' : '隐藏主面板';
        });
        (document.getElementById('cinelite-realtime-panel-toggle-debug-btn') as HTMLButtonElement).addEventListener('click', (event) => {
            const btn = event.currentTarget as HTMLButtonElement;
            const hidden = this.realtimePanelEl.classList.toggle('cw-hidden');
            btn.textContent = hidden ? '展开实时面板' : '隐藏实时面板';
        });
        (document.getElementById('cinelite-capture-jump-ts-btn') as HTMLButtonElement).addEventListener('click', () => {
            if (this.inspectedCapture) void this.jumpToCapture(this.inspectedCapture, 'ts');
        });
        (document.getElementById('cinelite-capture-jump-rtc-btn') as HTMLButtonElement).addEventListener('click', () => {
            if (this.inspectedCapture) void this.jumpToCapture(this.inspectedCapture, 'rtc');
        });
        this.realtimeToggleEl.addEventListener('change', () => this.toggleRealtimeMode());
        this.chatProviderEl.addEventListener('change', () => {
            this.chatProvider = this.chatProviderEl.value === 'qwen' ? 'qwen' : 'gemini';
            this.populateChatModelSelect();
        });
        this.asrProviderEl.addEventListener('change', () => {
            this.asrProvider = this.asrProviderEl.value === 'gemini_live' ? 'gemini_live' : 'aliyun';
            this.populateVoiceModelSelect(this.liveProviders, this.asrModel);
        });
        this.chatFilterBtns.forEach((button) => button.addEventListener('click', () => this.setActiveRtcFilter((button.dataset.chatFilter as RtcFilter) || 'chat')));
        this.chatInputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.submitChatText();
            }
        });
        (document.getElementById('cinelite-send-chat-btn') as HTMLButtonElement).addEventListener('click', () => { void this.submitChatText(); });
        (document.getElementById('cinelite-clear-chat-btn') as HTMLButtonElement).addEventListener('click', () => {
            this.chatHistory = [];
            this.rtcEvents = [];
            this.renderChatLog();
        });
        (document.getElementById('cinelite-realtime-hide-btn') as HTMLButtonElement).addEventListener('click', () => {
            this.realtimePanelEl.classList.add('cw-hidden');
            const toggleBtn = document.getElementById('cinelite-realtime-panel-toggle-debug-btn') as HTMLButtonElement;
            if (toggleBtn) toggleBtn.textContent = '展开实时面板';
        });
        this.recordBtnEl.addEventListener('click', () => { void this.toggleVoiceMode(); });
        document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((node) => node.addEventListener('click', () => {
            const id = node.getAttribute('data-close-modal');
            const modal = id ? document.getElementById(id) : null;
            if (modal) this.closeModal(modal as HTMLDivElement);
        }));
        window.addEventListener('focus', this.syncCapturesFromServer);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.syncCapturesFromServer();
        });
        this.shellHeadEl.addEventListener('pointerdown', (event) => this.startDrag(event));
        this.shellHeadEl.addEventListener('pointermove', (event) => this.moveDrag(event));
        this.shellHeadEl.addEventListener('pointerup', (event) => this.endDrag(event));
        this.shellHeadEl.addEventListener('pointercancel', (event) => this.endDrag(event));
        this.realtimePanelHeadEl.addEventListener('pointerdown', (event) => this.startRealtimeDrag(event));
        this.realtimePanelHeadEl.addEventListener('pointermove', (event) => this.moveRealtimeDrag(event));
        this.realtimePanelHeadEl.addEventListener('pointerup', (event) => this.endRealtimeDrag(event));
        this.realtimePanelHeadEl.addEventListener('pointercancel', (event) => this.endRealtimeDrag(event));
    }

    private appendLog(source: string, summary: string, detail?: string) {
        const entry: DebugEntry = {
            source,
            summary,
            detail,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        };
        this.debugEntries.push(entry);
        if (this.debugEntries.length > 260) this.debugEntries.splice(0, this.debugEntries.length - 260);
        this.debugLogEl.innerHTML = this.debugEntries.map((item) => {
            const head = `${item.time} [${item.source}]`;
            if (!item.detail) return `<div class="cw-debug-line"><span class="cw-debug-tag">${escapeHtml(head)}</span> ${escapeHtml(item.summary)}</div>`;
            return `<details class="cw-debug-line cw-debug-detail"><summary><span class="cw-debug-tag">${escapeHtml(head)}</span> ${escapeHtml(item.summary)}</summary><pre>${escapeHtml(item.detail)}</pre></details>`;
        }).join('');
        this.debugLogEl.scrollTop = this.debugLogEl.scrollHeight;
    }

    private nowTimestamp() {
        return new Date().toLocaleTimeString('zh-CN', { hour12: false });
    }

    private pushRtcEvent(event: Omit<RtcEvent, 'id' | 'timestamp'> & { timestamp?: string; }) {
        this.rtcEvents.push({
            ...event,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: event.timestamp || this.nowTimestamp()
        });
        if (this.rtcEvents.length > 120) this.rtcEvents.splice(0, this.rtcEvents.length - 120);
        this.renderChatLog();
    }

    private pushRtcSystemEvent(title: string, content: string, detail?: unknown, latencyMs?: number) {
        this.pushRtcEvent({
            kind: 'system',
            role: 'system',
            title,
            content,
            detail: typeof detail === 'string' ? detail : detail == null ? undefined : prettyJson(detail),
            latencyMs
        });
    }

    private formatRtcDebugSections(detail: string | undefined) {
        if (!detail) return '';
        let parsed: unknown = null;
        try {
            parsed = JSON.parse(detail);
        } catch {
            parsed = null;
        }
        if (!isRecord(parsed)) {
            return `<details class="otp-system-detail"><summary>查看详情</summary><pre>${escapeHtml(detail)}</pre></details>`;
        }
        const debug = parsed as RealtimeDebugShape;
        const chips = [
            debug.strategy ? `<span class="otp-debug-chip">strategy: ${escapeHtml(String(debug.strategy))}</span>` : '',
            debug.provider ? `<span class="otp-debug-chip">provider: ${escapeHtml(String(debug.provider))}</span>` : '',
            debug.model ? `<span class="otp-debug-chip">model: ${escapeHtml(String(debug.model))}</span>` : '',
            debug.sessionId ? `<span class="otp-debug-chip">session: ${escapeHtml(String(debug.sessionId))}</span>` : '',
            typeof debug.sessionCreated === 'boolean' ? `<span class="otp-debug-chip">sessionCreated: ${escapeHtml(String(debug.sessionCreated))}</span>` : '',
            typeof debug.cachedTokens === 'number' ? `<span class="otp-debug-chip">cachedTokens: ${escapeHtml(String(debug.cachedTokens))}</span>` : '',
            debug.responseId ? `<span class="otp-debug-chip">responseId: ${escapeHtml(String(debug.responseId))}</span>` : ''
        ].filter(Boolean).join('');
        const blocks = [
            debug.rawText ? { label: 'LLM Raw Output', value: debug.rawText, open: true } : null,
            debug.normalizedDecision ? { label: 'Mapped Decision', value: prettyJson(debug.normalizedDecision), open: true } : null,
            debug.synthesizedCamera ? { label: 'Mapped Camera', value: prettyJson(debug.synthesizedCamera), open: false } : null,
            debug.cacheState ? { label: 'Cache State', value: prettyJson(debug.cacheState), open: false } : null,
            { label: 'Full Debug', value: prettyJson(parsed), open: false }
        ].filter(Boolean).map((block) => {
            const typed = block as { label: string; value: string; open: boolean; };
            return `<details class="otp-debug-block" ${typed.open ? 'open' : ''}><summary>${escapeHtml(typed.label)}</summary><pre>${escapeHtml(typed.value)}</pre></details>`;
        }).join('');
        return `${chips ? `<div class="otp-debug-grid">${chips}</div>` : ''}<div class="otp-debug-sections">${blocks}</div>`;
    }

    private setActiveRtcFilter(filter: RtcFilter) {
        this.activeRtcFilter = filter;
        this.chatFilterBtns.forEach((button) => button.classList.toggle('active', button.dataset.chatFilter === filter));
        this.renderChatLog();
    }

    private filteredRtcEvents() {
        switch (this.activeRtcFilter) {
            case 'chat':
                return this.rtcEvents.filter((event) => event.kind === 'chat');
            case 'system':
                return this.rtcEvents.filter((event) => event.kind === 'system');
            default:
                return this.rtcEvents;
        }
    }

    private applyRealtimeMinimalMode() {
        this.realtimePanelEl.classList.toggle('minimal-mode', this.realtimeMinimalMode);
        this.realtimeMinimalToggleBtn.innerHTML = this.realtimeMinimalMode ? RTC_FULL_ICON : RTC_MINIMAL_ICON;
        this.realtimeMinimalToggleBtn.title = this.realtimeMinimalMode ? '显示完整布局' : '切换精简布局';
        this.realtimeMinimalToggleBtn.setAttribute('aria-label', this.realtimeMinimalMode ? '显示完整布局' : '切换精简布局');
    }

    private toggleRealtimeMinimalMode() {
        this.realtimeMinimalMode = !this.realtimeMinimalMode;
        this.applyRealtimeMinimalMode();
    }

    private setStatus(message: string, source = 'workflow') {
        this.statusEl.textContent = message;
        this.appendLog(source, message);
    }

    private captureDebugSummary(captures: CaptureItem[]) {
        return captures.map((capture, index) => ({
            imageIndex: index + 1,
            view: capture.view,
            note: capture.note,
            source: capture.source,
            imageBytes: String(capture.imageDataUrl || '').length,
            mview: capture.camera?.mview
        }));
    }

    private logJobDebug(job: JobSnapshot) {
        if (job.stage && job.stage !== this.lastLoggedJobStage) {
            const detail = job.partialText ? job.partialText : undefined;
            this.appendLog('gemini', `任务阶段更新：${job.stage}`, detail);
            this.lastLoggedJobStage = job.stage;
        }
        if (job.geminiRequestPrompt && job.geminiRequestPrompt !== this.lastLoggedJobRequestPrompt) {
            this.appendLog('gemini', 'Gemini 请求参数', prettyJson({
                prompt: job.geminiRequestPrompt,
                materials: job.geminiRequestMaterials || null
            }));
            this.lastLoggedJobRequestPrompt = job.geminiRequestPrompt;
        }
        if (job.geminiRawResponse && job.geminiRawResponse !== this.lastLoggedJobRawResponse && (job.stage === 'gemini_response_ready' || job.status === 'completed' || job.status === 'failed')) {
            this.appendLog('gemini', 'Gemini 原始返回', job.geminiRawResponse);
            this.lastLoggedJobRawResponse = job.geminiRawResponse;
        }
    }

    private setModelLoadingState(loading: boolean, message?: string) {
        this.modelProgressEl.classList.toggle('hidden', !loading);
        this.modelStatusEl.classList.toggle('cw-hidden', !message);
        if (message) this.modelStatusEl.textContent = message;
        if (loading && message) this.modelProgressTextEl.textContent = message;
        if (!loading) this.modelProgressTextEl.textContent = '模型资源加载中...';
    }

    private cameraDebugPayload(camera: CaptureItem['camera']) {
        return formatCameraStateForDebug(camera);
    }

    private logCameraDebug(action: string, viewId: string, camera: CaptureItem['camera']) {
        const payload = this.cameraDebugPayload(camera);
        const summary = `${action} ${viewId} pivot=${payload.mview.pivot.join('/')} rotation=${payload.mview.rotation.join('/')} radius=${payload.mview.radius} fov=${payload.mview.fov}`;
        this.appendLog('camera', summary, JSON.stringify(payload, null, 2));
        this.pushRtcSystemEvent('CameraControl', `${action} / ${viewId}`, payload);
    }

    private openModal(modal: HTMLDivElement) { modal.classList.remove('hidden'); }
    private closeModal(modal: HTMLDivElement) { modal.classList.add('hidden'); }
    private currentBuiltinModel() { return BUILTIN_MODELS[0]; }
    private activeModelSource() { if (this.localModel) return { id: `local:${this.localModel.name}:${this.localModel.file.size}:${this.localModel.file.lastModified}`, label: this.localModel.name, assetUrl: this.localModel.objectUrl, filePath: this.localModel.file.name }; const selected = this.currentBuiltinModel(); return selected; }
    private ensureModelLoaded() { if (!this.loadedModelId) throw new Error('请先加载模型'); }
    private ensureNarration() { if (!this.narrationInput.value.trim()) throw new Error('请先粘贴讲解词'); }
    private ensureCapturesReady() { if (this.captures.size < 6) throw new Error('请先完成第 3 步六面截图'); }

    private saveSettings() {
        this.chatProvider = this.chatProviderEl.value === 'qwen' ? 'qwen' : 'gemini';
        this.asrProvider = this.asrProviderEl.value === 'gemini_live' ? 'gemini_live' : 'aliyun';
        this.populateVoiceModelSelect(this.liveProviders, this.asrModelEl.value || this.asrModel);
        this.asrModel = this.asrModelEl.value || (this.asrProvider === 'gemini_live' ? 'gemini-2.0-flash-live-preview-04-09' : DEFAULT_ALIYUN_ASR_MODEL);
        this.voiceBargeInMode = this.voiceBargeInValidWordEl.checked ? 'valid_word' : 'speech_start';
        this.populateChatModelSelect();
        this.voiceStream?.updateModel(this.asrModel, this.asrProvider === 'aliyun' ? aliyunAsrSampleRate(this.asrModel) : 16000);
        this.liveSession?.updateOptions({ provider: this.asrProvider, model: this.asrModel });
        this.renderUnifiedSettingsMeta();
        this.closeModal(this.settingsModal);
        this.setStatus('CL 模型与语音设置已更新');
    }

    private renderUnifiedSettingsMeta() {
        const bargeInLabel = this.voiceBargeInMode === 'valid_word' ? '识别有效词后打断' : '检测到说话即打断';
        this.modelUploadMetaEl.textContent = `当前实时回答：${this.chatProvider} / ${this.chatModelEl.value || '-'}；TTS：${this.ttsModelEl.value} / ${this.ttsVoiceEl.value}；Live：${this.asrProvider} / ${this.asrModel}；抢话：${bargeInLabel}`;
    }

    private populateVoiceOptions(model: string, selectedVoice?: string) {
        const voices = this.ttsVoicesByModel[model] || [];
        const next = voices.includes(selectedVoice || '') ? selectedVoice || '' : (voices[0] || '');
        this.ttsVoiceEl.innerHTML = voices.map((voice) => `<option value="${voice}" ${voice === next ? 'selected' : ''}>${voice}</option>`).join('');
    }

    private populateTtsControls(models: string[], defaultModel: string, defaultVoice: string) {
        this.ttsModelEl.innerHTML = models.map((model) => `<option value="${model}" ${model === defaultModel ? 'selected' : ''}>${model}</option>`).join('');
        this.populateVoiceOptions(defaultModel, defaultVoice);
        this.ttsMetaEl.textContent = `当前音色：${defaultModel} / ${defaultVoice}`;
    }

    private populateChatModelSelect() {
        const models = this.chatModels[this.chatProvider] || [];
        this.chatModelEl.innerHTML = models.map((model) => `<option value="${model}">${model}</option>`).join('');
        if (!this.chatModelEl.value && models[0]) this.chatModelEl.value = models[0];
    }

    private populateVoiceProviderOptions(providers: Record<string, { configured?: boolean; model?: string; models?: string[]; }>) {
        const options = [
            { value: 'aliyun', label: 'Aliyun Realtime ASR' },
            { value: 'gemini_live', label: 'Gemini Live' }
        ];
        this.asrProviderEl.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join('');
        if (!['aliyun', 'gemini_live'].includes(this.asrProvider)) this.asrProvider = 'aliyun';
        this.asrProviderEl.value = this.asrProvider;
        if (!providers?.[this.asrProvider]?.configured && this.asrProvider === 'gemini_live') this.asrProvider = 'aliyun';
        this.asrProviderEl.value = this.asrProvider;
    }

    private populateVoiceModelSelect(providers: Record<string, { configured?: boolean; model?: string; models?: string[]; }>, preferredModel?: string) {
        const providerConfig = providers?.[this.asrProvider] || {};
        const models = Array.isArray(providerConfig.models) && providerConfig.models.length > 0
            ? providerConfig.models
            : (this.asrProvider === 'gemini_live' ? ['gemini-2.0-flash-live-preview-04-09'] : [DEFAULT_ALIYUN_ASR_MODEL]);
        const selectedModel = models.includes(preferredModel || '') ? preferredModel || '' : (providerConfig.model || models[0] || '');
        this.asrModel = selectedModel || models[0] || (this.asrProvider === 'gemini_live' ? 'gemini-2.0-flash-live-preview-04-09' : DEFAULT_ALIYUN_ASR_MODEL);
        this.asrModelEl.innerHTML = models.map((model) => `<option value="${model}" ${model === this.asrModel ? 'selected' : ''}>${model}</option>`).join('');
        this.asrModelEl.value = this.asrModel;
    }

    private async resolveSegmentAudio(segment: SegmentPlan) {
        const key = `${this.ttsModelEl.value}::${this.ttsVoiceEl.value}::${segment.text}`;
        const cached = this.audioCache.get(key);
        if (cached) return cached;
        const result = await synthesizeRealtimeSpeech({
            text: segment.text,
            tts: {
                model: this.ttsModelEl.value,
                voice: this.ttsVoiceEl.value
            }
        });
        const audioUrl = String(result.audioUrl || '').trim() || null;
        if (audioUrl) this.audioCache.set(key, audioUrl);
        return audioUrl;
    }

    private async loadSavedCaptures() {
        const result: { captures: CaptureItem[] } = await listCaptures(this.modelFilename).catch(() => ({ captures: [] as CaptureItem[] }));
        this.captures.clear();
        (result.captures || []).map(normalizeCapture).forEach((capture) => {
            this.captures.set(capture.view, capture);
            this.logCameraDebug('loaded', capture.view, capture.camera);
        });
        this.renderCaptureCards();
        this.renderManualButtons();
    }

    private async loadSavedNarration() {
        const result = await getNarration(this.modelFilename).catch((): { narration: null } => ({ narration: null }));
        const saved = String(result.narration?.narration_text || '').trim();
        this.narrationInput.value = saved || DEFAULT_NARRATION;
    }

    private async persistNarration() {
        this.ensureModelLoaded();
        const narrationText = this.narrationInput.value.trim();
        if (!narrationText) throw new Error('请先输入讲解词');
        await saveNarration({ modelFilename: this.modelFilename, narrationText });
        this.closeModal(this.narrationModal);
        this.setStatus('讲解词已保存到数据库', 'prompt');
    }

    private setLocalModel(file: File) {
        if (this.localModel?.objectUrl) URL.revokeObjectURL(this.localModel.objectUrl);
        this.localModel = { name: file.name, objectUrl: URL.createObjectURL(file), file };
        this.modelFilename = file.name;
        this.modelUploadMetaEl.textContent = `已上传本地模型：${file.name}`;
        this.modelFileEl.textContent = `当前模型：${file.name}`;
        void this.loadSelectedModel();
    }

    private async loadSelectedModel() {
        const selected = this.activeModelSource();
        if (this.loadedModelId === selected.id) return;
        this.setModelLoadingState(true, `正在加载 ${selected.label}`);
        this.setStatus(`正在加载模型：${selected.label}`, 'viewer');
        try {
            await this.viewer.load(selected.assetUrl);
        } catch (error) {
            this.setModelLoadingState(false, '模型加载失败');
            throw error;
        }
        this.loadedModelId = selected.id;
        this.modelFilename = selected.filePath;
        this.modelFileEl.textContent = `当前模型：${selected.filePath}`;
        this.player.stop({ silent: true });
        await this.loadSavedNarration();
        await this.loadSavedCaptures();
        await this.refreshCsvVersions();
        await this.loadLatestCsvForPlayback();
        this.setModelLoadingState(false, `已加载 ${selected.label}`);
        this.setStatus(`Viewer 已加载：${selected.label}`, 'viewer');
    }

    private async expandComplexPrompt() {
        try {
            this.ensureNarration();
            this.simplePrompt = this.simpleEditor.value.trim() || DEFAULT_SIMPLE_PROMPT;
            this.setStatus('正在调用 Gemini 生成复杂提示词模板中的风格补充', 'prompt');
            const result = await expandPrompt({ simplePrompt: this.simplePrompt, narrationText: this.narrationInput.value.trim() });
            const styleGuidance = String(result.styleGuidance || '').trim() || DEFAULT_STYLE_GUIDANCE;
            this.complexPrompt = composeComplexPrompt(styleGuidance);
            this.complexEditor.value = this.complexPrompt;
            this.setStatus('复杂提示词已由 Gemini 生成', 'prompt');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'prompt');
        }
    }

    private async persistCaptures(captures: CaptureItem[]) {
        const normalizedCaptures = captures.map(normalizeCapture);
        normalizedCaptures.forEach((capture) => {
            this.captures.set(capture.view, capture);
            this.logCameraDebug('captured-local', capture.view, capture.camera);
        });
        this.renderCaptureCards();
        this.renderManualButtons();
        const result = await saveCaptures({ modelFilename: this.modelFilename, captures: normalizedCaptures });
        this.captures.clear();
        (result.captures || []).map(normalizeCapture).forEach((capture: CaptureItem) => {
            this.captures.set(capture.view, capture);
            this.logCameraDebug('persisted', capture.view, capture.camera);
        });
        this.renderCaptureCards();
        this.renderManualButtons();
    }

    private renderCaptureCards() {
        this.captureGrid.innerHTML = VIEW_ORDER.map((viewId) => {
            const capture = this.captures.get(viewId);
            return `<figure class="cw-capture-card"><div class="cw-capture-media">${capture ? `<img alt="${viewId}" src="${capture.imageDataUrl}" />` : ''}<figcaption><div class="cw-card-tools-row">${capture ? `<button data-inspect-view="${viewId}" title="查看机位">i</button>` : ''}</div></figcaption></div></figure>`;
        }).join('');
        this.captureGrid.querySelectorAll<HTMLButtonElement>('[data-inspect-view]').forEach((button) => button.addEventListener('click', () => {
            const capture = this.captures.get(button.dataset.inspectView as ViewId);
            if (capture) {
                this.inspectedCapture = capture;
                this.inspectPre.textContent = JSON.stringify(capture, null, 2);
                this.openModal(this.inspectModal);
            }
        }));
        this.captureStatusEl.textContent = `已抓取 ${this.captures.size}/6 张截图`;
    }

    private renderManualButtons() {
        const labels: Record<ViewId, string> = { front: '1.Front', right: '2.Right', back: '3.Back', left: '4.Left', top: '5.Top', bottom: '6.Bottom' };
        this.manualGrid.innerHTML = VIEW_ORDER.map((viewId) => `<button data-manual-view="${viewId}" class="${this.captures.get(viewId) ? 'primary' : ''}">${labels[viewId]}</button>`).join('');
        this.manualGrid.querySelectorAll<HTMLButtonElement>('[data-manual-view]').forEach((button) => button.addEventListener('click', () => { void this.captureManualView(button.dataset.manualView as ViewId); }));
    }

    private mountRecordingModule() {
        this.recordingModule = mountRtcRecordingModule({
            getModelFilename: () => this.modelFilename,
            getCaptureCanvas: () => this.viewer.getCanvas(),
            requestCaptureRender: () => {
                void this.viewer.settle().catch(() => {
                    // ignore render refresh failures during detached recording verification flows
                });
            },
            isPlaybackActive: () => this.playerState === 'playing' || this.playerState === 'paused',
            isPlaybackPaused: () => this.playerState === 'paused',
            playPlayback: () => {
                if (this.playerState === 'paused') this.player.resume();
                else if (this.playerState !== 'playing') void this.player.play();
            },
            pausePlayback: () => this.player.pause(),
            disableInterrupts: (disabled) => {
                this.chatInputEl.disabled = disabled;
                this.sendChatBtnEl.disabled = disabled;
                this.recordBtnEl.disabled = disabled;
            },
            getCurrentPlaybackAudio: () => this.player.getCurrentAudioElement(),
            setStatus: (text) => this.realtimeStatusEl.textContent = text,
            recordOpenBtn: this.rtcRecordOpenBtn,
            recordPauseBtn: this.rtcRecordPauseBtn,
            recordStopBtn: this.rtcRecordStopBtn,
            recordTimerEl: this.rtcRecordTimerEl
        });
        (window as Window & { __cineliteRecordingModule?: RtcRecordingModuleController | null }).__cineliteRecordingModule = this.recordingModule;
    }

    private renderActiveSegment(segment: SegmentPlan | null) {
        this.recordingModule?.setSubtitleText(segment?.text || '');
    }

    private renderQueueSnapshot(mainQueue: SegmentPlan[], priorityQueue: SegmentPlan[], current: SegmentPlan | null) {
        this.mainQueueCountEl.textContent = String(mainQueue.length);
        this.priorityQueueCountEl.textContent = String(priorityQueue.length);
        this.currentQueueLabelEl.textContent = current ? current.focusPart : '待机';
        this.mainQueueListEl.innerHTML = this.renderQueueList(mainQueue, 'main', current);
        this.priorityQueueListEl.innerHTML = this.renderQueueList(priorityQueue, 'priority', current);
    }

    private renderChatLog() {
        const events = this.filteredRtcEvents();
        this.chatCountEl.textContent = String(events.length);
        this.chatLogEl.innerHTML = events.length < 1
            ? '<div class="otp-empty">Initialize session to view logs</div>'
            : events.map((event) => {
                const alignClass = event.role === 'user' ? 'right' : 'left';
                const meta = event.latencyMs != null ? `${event.timestamp} · ${event.latencyMs}ms` : event.timestamp;
                const detail = event.kind === 'system'
                    ? this.formatRtcDebugSections(event.detail)
                    : (event.detail ? `<details class="otp-system-detail"><summary>查看详情</summary><pre>${escapeHtml(event.detail)}</pre></details>` : '');
                return `<div class="otp-chat-row ${alignClass}"><div class="otp-item otp-chat-card ${event.role}"><div class="otp-item-head"><span>${escapeHtml(event.title)}</span><span>${escapeHtml(meta)}</span></div><div>${escapeHtml(event.content)}</div>${detail}</div></div>`;
            }).join('');
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
    }

    private renderQueueList(queue: SegmentPlan[], kind: 'main' | 'priority', current: SegmentPlan | null) {
        const rows: string[] = [];
        if (kind === 'main' && current) {
            rows.push(`<div class="otp-item running"><div class="otp-item-head"><span>RUNNING</span><span>${escapeHtml(current.focusView)}</span></div><div>${escapeHtml(current.text)}</div></div>`);
        }
        rows.push(...queue.map((item, index) => `<div class="otp-item${kind === 'priority' ? ' priority' : ''}"><div class="otp-item-head"><span>${kind === 'priority' ? 'INTERRUPT' : `#${index + 1}`}</span><span>${escapeHtml(item.focusPart)}</span></div><div>${escapeHtml(item.text)}</div></div>`));
        return rows.length < 1 ? '<div class="otp-empty">队列为空</div>' : rows.join('');
    }

    private pushChat(role: ChatMessage['role'], content: string) {
        const timestamp = this.nowTimestamp();
        this.chatHistory.push({ role, content, timestamp });
        if (this.chatHistory.length > 24) this.chatHistory.splice(0, this.chatHistory.length - 24);
        this.pushRtcEvent({
            kind: role === 'system' ? 'system' : 'chat',
            role,
            title: role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : 'System',
            content,
            timestamp
        });
    }

    private toggleManualMode() {
        this.manualMode = !this.manualMode;
        this.manualPanel.classList.toggle('cw-hidden', !this.manualMode);
        this.captureStatusEl.textContent = this.manualMode ? '手动抓拍模式已开启' : `已抓取 ${this.captures.size}/6 张截图`;
    }

    private async captureSixViews() {
        try {
            this.ensureModelLoaded();
            const captures = await this.viewer.captureViews((message) => this.setStatus(message, 'capture'));
            await this.persistCaptures(captures.map((item) => ({ ...item, modelFilename: this.modelFilename })));
            this.setStatus('六面截图抓取完成并已写入数据库', 'capture');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'capture');
        }
    }

    private async captureManualView(viewId: ViewId) {
        try {
            this.ensureModelLoaded();
            const capture = await this.viewer.captureCurrentView(viewId);
            await this.persistCaptures([{ ...capture, modelFilename: this.modelFilename }]);
            this.setStatus(`已保存 ${viewId} 视角截图并写入数据库`, 'capture');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'capture');
        }
    }

    private resetUiStateAfterClear() {
        this.captures.clear();
        this.inspectedCapture = null;
        this.csvText = '';
        this.csvRows = [];
        this.planResult = null;
        this.selectedCsvVersionId = null;
        this.csvVersions = [];
        this.adjustingRowIndex = null;
        this.player.stop();
        this.renderCaptureCards();
        this.renderManualButtons();
        this.renderCsvVersions();
        this.renderActiveSegment(null);
        this.csvStatusEl.textContent = '生成后可在弹窗中查看和修改 CSV';
    }

    private async clearCurrentModelData() {
        try {
            this.ensureModelLoaded();
            const result = await clearModelData(this.modelFilename) as { capturesDeleted?: number; csvVersionsDeleted?: number; };
            this.resetUiStateAfterClear();
            this.setStatus(`已清空当前模型数据：${result.capturesDeleted || 0} 张截图，${result.csvVersionsDeleted || 0} 个 CSV 版本`, 'capture');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'capture');
        }
    }

    private stopPolling() { if (this.polling) window.clearTimeout(this.polling); this.polling = 0; }
    private async pollJob(jobId: string) { const job = await fetchJob(jobId); await this.handleJob(job); if (job.status === 'running' || job.status === 'queued') this.polling = window.setTimeout(() => { void this.pollJob(jobId); }, 1600); }

    private async handleJob(job: JobSnapshot) {
        this.activeJobId = job.jobId;
        this.logJobDebug(job);
        if (job.status === 'completed' && job.result) {
            this.stopPolling();
            this.planResult = job.result;
            this.csvText = job.result.csvText;
            this.csvRows = parseCsv(this.csvText);
            if (!this.csvRows.length) {
                this.csvRows = csvRowsFromPlan(job.result.plan);
                this.csvText = stringifyCsv(this.csvRows);
            }
            await this.saveCsvAsNewVersion('Generated');
            this.appendLog('workflow', 'CSV 生成完成', prettyJson({
                segmentCount: job.result.plan.segments.length,
                csvRowCount: this.csvRows.length,
                geminiInteractionId: job.result.geminiInteractionId || null,
                csvPreview: this.csvText.split('\n').slice(0, 3).join('\n')
            }));
            this.csvStatusEl.textContent = `CSV 已生成，共 ${this.csvRows.length} 行，可打开弹窗编辑`;
            this.setStatus('Gemini 流式生成与 TTS 已完成，可以播放', 'workflow');
            this.player.setMainQueue(this.buildPlaybackSegments());
        } else if (job.status === 'failed') {
            this.stopPolling();
            if (job.geminiRequestPrompt) {
                this.appendLog('gemini', '失败时的 Gemini 请求参数', prettyJson({
                    prompt: job.geminiRequestPrompt,
                    materials: job.geminiRequestMaterials || null
                }));
            }
            if (job.geminiRawResponse) {
                this.appendLog('gemini', '失败时的 Gemini 原始返回', job.geminiRawResponse);
            }
            this.setStatus(`生成失败：${job.error?.message || 'unknown error'}`, 'workflow');
        }
    }

    private captureList() { return VIEW_ORDER.map((viewId) => this.captures.get(viewId)).filter(Boolean) as CaptureItem[]; }

    private async generatePlan() {
        try {
            this.ensureModelLoaded();
            this.ensureNarration();
            if (this.captures.size < 6) await this.loadSavedCaptures();
            this.ensureCapturesReady();
            await this.persistNarration();
            this.complexPrompt = this.complexEditor.value.trim() || this.complexPrompt;
            this.stopPolling();
            this.lastLoggedJobStage = '';
            this.lastLoggedJobRequestPrompt = '';
            this.lastLoggedJobRawResponse = '';
            const captures = this.captureList();
            const modelContext = this.viewer.getModelContext();
            this.appendLog('gemini', '前端提交生成 CSV 请求', prettyJson({
                narrationText: this.narrationInput.value.trim(),
                simplePrompt: this.simplePrompt,
                complexPrompt: this.complexPrompt,
                captures: this.captureDebugSummary(captures),
                modelContext,
                tts: { model: this.ttsModelEl.value, voice: this.ttsVoiceEl.value }
            }));
            this.setStatus('提交复杂提示词任务，等待 Gemini 流式返回', 'gemini');
            const created = await createJob({
                modelFilename: this.modelFilename,
                simplePrompt: this.simplePrompt,
                complexPrompt: this.complexPrompt,
                captures,
                tts: { model: this.ttsModelEl.value, voice: this.ttsVoiceEl.value },
                modelContext
            });
            this.activeJobId = created.jobId;
            await this.pollJob(created.jobId);
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'workflow');
        }
    }

    private buildPlaybackSegments() {
        if (!this.csvRows.length && this.planResult?.plan?.segments) {
            return this.planResult.plan.segments.map((segment) => ({
                ...segment,
                camera: {
                    ...normalizeCameraStateForCl(segment.camera),
                    sweepYawDeg: Number(segment.camera?.sweepYawDeg || 0),
                    sweepPitchDeg: Number(segment.camera?.sweepPitchDeg || 0)
                }
            }));
        }
        return this.csvRows.map((row, index) => ({
            segmentId: row.segment_id || `seg-${index + 1}`,
            text: row.content,
            focusView: (row.focus_view || 'front') as ViewId,
            focusPart: row.focus_part || '整体',
            moveBeforeSec: Number(row.move_before_sec || 1.2),
            moveSpeedMps: Number(row.move_speed_mps || 0.8),
            speechMode: 'BLOCKING' as const,
            audioUrl: this.planResult?.plan.segments[index]?.audioUrl || null,
            camera: {
                ...normalizeCameraStateForCl({
                    mview: {
                        pivot: [Number(row.pivot_x || 0), Number(row.pivot_y || 0), Number(row.pivot_z || 0)],
                        rotation: [Number(row.rotation_pitch || 0), Number(row.rotation_yaw || 0)],
                        radius: Number(row.radius || 1),
                        fov: Number(row.fov || 45)
                    },
                    cameraX: Number(row.target_x || 0),
                    cameraY: Number(row.target_y || 0),
                    cameraZ: Number(row.target_z || 0),
                    lookAtX: Number(row.look_at_x || 0),
                    lookAtY: Number(row.look_at_y || 0),
                    lookAtZ: Number(row.look_at_z || 0),
                    yawDeg: Number(row.target_yaw || 0),
                    pitchDeg: Number(row.target_pitch || 0),
                    fovDeg: Number(row.target_fov || row.fov || 45),
                    radius: Number(row.target_radius || row.radius || 1)
                }),
                sweepYawDeg: Number(row.sweep_yaw_deg || 0),
                sweepPitchDeg: Number(row.sweep_pitch_deg || 0)
            }
        }));
    }

    private async refreshCsvVersions() {
        const result: { versions: Array<{ id: string; version_name: string; created_at: string; updated_at: string; }> } = await listCsvVersions(this.modelFilename).catch(() => ({ versions: [] as Array<{ id: string; version_name: string; created_at: string; updated_at: string; }> }));
        this.csvVersions = result.versions || [];
        if (!this.selectedCsvVersionId && this.csvVersions[0]) this.selectedCsvVersionId = this.csvVersions[0].id;
        this.renderCsvVersions();
    }

    private async loadLatestCsvForPlayback() {
        await this.refreshCsvVersions();
        if (!this.selectedCsvVersionId) return;
        const version = await getCsvVersion(this.selectedCsvVersionId, this.modelFilename);
        if (!version.version?.csv_text) return;
        this.csvText = version.version.csv_text;
        this.csvRows = parseCsv(this.csvText);
        if (!this.csvRows.length && this.planResult?.plan) {
            this.csvRows = csvRowsFromPlan(this.planResult.plan);
            this.csvText = stringifyCsv(this.csvRows);
        }
        this.player.setMainQueue(this.buildPlaybackSegments());
        this.renderActiveSegment(null);
    }

    private renderCsvVersions() {
        this.csvVersionListEl.innerHTML = this.csvVersions.map((version) => `<button class="cw-version-item${version.id === this.selectedCsvVersionId ? ' active' : ''}" data-version-id="${version.id}"><div>${escapeHtml(version.version_name)}</div><div class="cwf-mini">${escapeHtml(version.updated_at)}</div></button>`).join('');
        this.csvVersionListEl.querySelectorAll<HTMLButtonElement>('[data-version-id]').forEach((button) => button.addEventListener('click', async () => {
            const id = button.dataset.versionId || '';
            const result = await getCsvVersion(id, this.modelFilename);
            if (!result.version) return;
            this.selectedCsvVersionId = id;
            this.csvText = result.version.csv_text;
            this.csvRows = parseCsv(this.csvText);
            this.renderCsvVersions();
            this.renderCsvGrid();
            this.player.setMainQueue(this.buildPlaybackSegments());
            this.renderActiveSegment(null);
        }));
    }

    private renderCsvGrid() {
        const headers: Array<keyof CsvRow> = ['seq', 'focus_view', 'focus_part', 'pivot_x', 'pivot_y', 'pivot_z', 'rotation_pitch', 'rotation_yaw', 'radius', 'fov', 'content'];
        this.csvGrid.innerHTML = `<thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}<th>操作</th></tr></thead><tbody>${this.csvRows.map((row, index) => `<tr data-row-index="${index}">${headers.map((header) => `<td>${header === 'content' || header === 'focus_part' ? `<textarea data-field="${header}">${escapeHtml(String(row[header]))}</textarea>` : `<input data-field="${header}" value="${escapeHtml(String(row[header]))}" />`}</td>`).join('')}<td><div class="cw-inline-actions"><button data-row-adjust="${index}">调整</button><button data-row-raw="${index}">Raw</button><button data-row-delete="${index}">删除</button></div></td></tr>`).join('')}</tbody>`;
        this.csvGrid.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]').forEach((field) => field.addEventListener('input', () => this.syncCsvRowsFromGrid()));
        this.csvGrid.querySelectorAll<HTMLTextAreaElement>('textarea[data-field="content"]').forEach((field) => field.addEventListener('click', (event) => {
            event.preventDefault();
            const rowIndex = Number((field.closest('tr') as HTMLTableRowElement | null)?.dataset.rowIndex || -1);
            if (rowIndex >= 0) this.openContentEditor(rowIndex);
        }));
        this.csvGrid.querySelectorAll<HTMLButtonElement>('[data-row-delete]').forEach((button) => button.addEventListener('click', () => { this.csvRows.splice(Number(button.dataset.rowDelete), 1); this.renderCsvGrid(); }));
        this.csvGrid.querySelectorAll<HTMLButtonElement>('[data-row-adjust]').forEach((button) => button.addEventListener('click', () => this.startAdjustCsvRow(Number(button.dataset.rowAdjust))));
        this.csvGrid.querySelectorAll<HTMLButtonElement>('[data-row-raw]').forEach((button) => button.addEventListener('click', () => this.openRawRow(Number(button.dataset.rowRaw))));
        this.csvModalStatus.textContent = `当前共 ${this.csvRows.length} 行`;
    }

    private isCsvModalOpen() {
        return !this.csvModal.classList.contains('hidden');
    }

    private openContentEditor(index: number) {
        const row = this.csvRows[index];
        if (!row) return;
        this.contentEditingRowIndex = index;
        this.contentEditor.value = row.content || '';
        this.contentStatusEl.textContent = `正在编辑第 ${index + 1} 行 Content`;
        this.openModal(this.contentModal);
        window.setTimeout(() => this.contentEditor.focus(), 0);
    }

    private applyContentEditor() {
        if (this.contentEditingRowIndex === null) return;
        const row = this.csvRows[this.contentEditingRowIndex];
        if (!row) return;
        row.content = this.contentEditor.value;
        this.csvText = stringifyCsv(this.csvRows);
        this.renderCsvGrid();
        this.closeModal(this.contentModal);
        this.contentEditingRowIndex = null;
        this.csvModalStatus.textContent = 'Content 已更新';
    }

    private syncCsvRowsFromGrid() {
        if (!this.isCsvModalOpen()) return;
        this.csvRows = Array.from(this.csvGrid.querySelectorAll<HTMLTableRowElement>('tbody tr')).map((row, index) => {
            const read = (field: keyof CsvRow) => (row.querySelector(`[data-field="${field}"]`) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';
            return {
                seq: Number(read('seq') || index + 1),
                segment_id: read('segment_id') || `seg-${index + 1}`,
                focus_view: read('focus_view'),
                focus_part: read('focus_part'),
                action: 'MOVE_AND_SPEAK',
                audio_mode: 'BLOCKING',
                move_before_sec: '1.20',
                pivot_x: read('pivot_x'),
                pivot_y: read('pivot_y'),
                pivot_z: read('pivot_z'),
                rotation_pitch: read('rotation_pitch'),
                rotation_yaw: read('rotation_yaw'),
                radius: read('radius'),
                fov: read('fov'),
                target_x: read('target_x'),
                target_y: read('target_y'),
                target_z: read('target_z'),
                look_at_x: this.csvRows[index]?.look_at_x || '0',
                look_at_y: this.csvRows[index]?.look_at_y || '0',
                look_at_z: this.csvRows[index]?.look_at_z || '0',
                target_yaw: read('target_yaw'),
                target_pitch: read('target_pitch'),
                target_fov: read('target_fov'),
                target_radius: this.csvRows[index]?.target_radius || '1',
                move_speed_mps: read('move_speed_mps'),
                sweep_yaw_deg: this.csvRows[index]?.sweep_yaw_deg || '0',
                sweep_pitch_deg: this.csvRows[index]?.sweep_pitch_deg || '0',
                content: read('content')
            };
        });
    }

    private async openCsvModal() {
        if (!this.csvText && !this.selectedCsvVersionId) return this.setStatus('请先生成 CSV', 'csv');
        await this.refreshCsvVersions();
        if ((!this.csvRows.length || !this.csvText) && this.selectedCsvVersionId) {
            const version = await getCsvVersion(this.selectedCsvVersionId, this.modelFilename);
            if (version.version?.csv_text) {
                this.csvText = version.version.csv_text;
                this.csvRows = parseCsv(this.csvText);
            }
        }
        this.renderCsvGrid();
        this.openModal(this.csvModal);
    }

    private saveCsv() {
        this.syncCsvRowsFromGrid();
        this.csvText = stringifyCsv(this.csvRows);
        this.closeModal(this.csvModal);
        this.player.setMainQueue(this.buildPlaybackSegments());
        this.renderActiveSegment(null);
        this.setStatus('CSV 已保存', 'csv');
    }

    private async generateCsvVersion() {
        if (!this.csvText && this.planResult?.csvText) {
            this.csvText = this.planResult.csvText;
            this.csvRows = parseCsv(this.csvText);
        }
        await this.saveCsvAsNewVersion('Generated');
    }

    private async saveCurrentCsvVersion() {
        this.syncCsvRowsFromGrid();
        this.csvText = stringifyCsv(this.csvRows);
        if (!this.selectedCsvVersionId) return this.saveCsvAsNewVersion('Manual');
        const current = this.csvVersions.find((item) => item.id === this.selectedCsvVersionId);
        const result = await updateCsvVersion(this.selectedCsvVersionId, { modelFilename: this.modelFilename, versionName: current?.version_name || 'Manual', csvText: this.csvText });
        this.csvVersions = result.versions || [];
        this.renderCsvVersions();
        this.player.setMainQueue(this.buildPlaybackSegments());
        this.csvModalStatus.textContent = '已保存当前版本';
    }

    private async saveCsvAsNewVersion(prefix = 'Version') {
        if (this.isCsvModalOpen()) this.syncCsvRowsFromGrid();
        if (!this.csvRows.length && this.planResult?.plan) {
            this.csvRows = csvRowsFromPlan(this.planResult.plan);
        }
        this.csvText = stringifyCsv(this.csvRows);
        const name = `${prefix} ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
        const result = await createCsvVersion({ modelFilename: this.modelFilename, versionName: name, csvText: this.csvText });
        this.selectedCsvVersionId = result.version?.id || null;
        this.csvVersions = result.versions || [];
        this.renderCsvVersions();
        this.player.setMainQueue(this.buildPlaybackSegments());
        this.csvModalStatus.textContent = `已创建版本 ${name}`;
    }

    private async deleteCurrentCsvVersion() {
        if (!this.selectedCsvVersionId) return;
        const result = await deleteCsvVersion(this.selectedCsvVersionId, this.modelFilename);
        this.csvVersions = result.versions || [];
        this.selectedCsvVersionId = this.csvVersions[0]?.id || null;
        await this.loadLatestCsvForPlayback();
        this.renderCsvVersions();
        this.renderCsvGrid();
    }

    private startAdjustCsvRow(index: number) {
        this.adjustingRowIndex = index;
        this.closeModal(this.csvModal);
        this.applyCameraBtn.classList.remove('cw-hidden');
        const row = this.csvRows[index];
        if (row) {
            void this.viewer.moveToCameraState(normalizeCameraStateForCl({
                mview: {
                    pivot: [Number(row.pivot_x || 0), Number(row.pivot_y || 0), Number(row.pivot_z || 0)],
                    rotation: [Number(row.rotation_pitch || 0), Number(row.rotation_yaw || 0)],
                    radius: Number(row.radius || 1),
                    fov: Number(row.fov || 45)
                },
                cameraX: Number(row.target_x || 0), cameraY: Number(row.target_y || 0), cameraZ: Number(row.target_z || 0),
                lookAtX: Number(row.look_at_x || 0), lookAtY: Number(row.look_at_y || 0), lookAtZ: Number(row.look_at_z || 0),
                yawDeg: Number(row.target_yaw || row.rotation_yaw || 0), pitchDeg: Number(row.target_pitch || row.rotation_pitch || 0), fovDeg: Number(row.target_fov || row.fov || 45), radius: Number(row.target_radius || row.radius || 1)
            }), 700);
        }
        this.setStatus(`正在调整第 ${index + 1} 行，调整主视图后点击第4步确认`, 'csv');
    }

    private async applyCurrentCameraToCsvRow() {
        if (this.adjustingRowIndex === null) return;
        await this.viewer.settle();
        const row = this.csvRows[this.adjustingRowIndex];
        const state = this.viewer.getCurrentCameraState();
        row.pivot_x = state.mview.pivot[0].toFixed(4);
        row.pivot_y = state.mview.pivot[1].toFixed(4);
        row.pivot_z = state.mview.pivot[2].toFixed(4);
        row.rotation_pitch = state.mview.rotation[0].toFixed(4);
        row.rotation_yaw = state.mview.rotation[1].toFixed(4);
        row.radius = state.mview.radius.toFixed(4);
        row.fov = state.mview.fov.toFixed(2);
        row.target_x = state.cameraX.toFixed(4);
        row.target_y = state.cameraY.toFixed(4);
        row.target_z = state.cameraZ.toFixed(4);
        row.look_at_x = state.lookAtX.toFixed(4);
        row.look_at_y = state.lookAtY.toFixed(4);
        row.look_at_z = state.lookAtZ.toFixed(4);
        row.target_yaw = state.yawDeg.toFixed(2);
        row.target_pitch = state.pitchDeg.toFixed(2);
        row.target_fov = state.fovDeg.toFixed(2);
        row.target_radius = state.radius.toFixed(4);
        this.csvText = stringifyCsv(this.csvRows);
        if (this.selectedCsvVersionId) {
            const current = this.csvVersions.find((item) => item.id === this.selectedCsvVersionId);
            const result = await updateCsvVersion(this.selectedCsvVersionId, {
                modelFilename: this.modelFilename,
                versionName: current?.version_name || 'Manual',
                csvText: this.csvText
            });
            this.csvVersions = result.versions || this.csvVersions;
        }
        this.adjustingRowIndex = null;
        this.applyCameraBtn.classList.add('cw-hidden');
        this.renderCsvVersions();
        this.renderCsvGrid();
        this.openModal(this.csvModal);
        this.setStatus('当前视角已回填到 CSV', 'csv');
    }

    private openRawRow(index: number) {
        const row = this.csvRows[index];
        if (!row) return;
        this.csvRawPre.textContent = JSON.stringify(row, null, 2);
        this.openModal(this.csvRawModal);
    }

    private downloadCsv() {
        if (!this.csvText) return;
        const blob = new Blob([this.csvText], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cinematic-lite.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    private renderPlayTime(seconds: number) {
        const total = Math.max(0, Math.floor(seconds));
        const text = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        this.playTimeEl.textContent = text;
        this.realtimePlayTimeEl.textContent = text;
    }

    private syncMainPlaybackToggle(icon: string, title: string) {
        this.playToggleBtn.innerHTML = icon;
        this.playToggleBtn.title = title;
    }

    private syncRealtimePlaybackToggle(showPause: boolean) {
        this.realtimePlayToggleBtn.classList.toggle('playing', showPause);
        this.realtimePlayToggleBtn.innerHTML = showPause ? RTC_PAUSE_ICON : RTC_PLAY_ICON;
        this.realtimePlayToggleBtn.title = showPause ? 'Pause' : 'Play';
    }

    private handlePlayerState(state: 'idle' | 'playing' | 'paused' | 'stopped' | 'completed') {
        this.playerState = state;
        this.recordingModule?.handlePlaybackStateChange(state);
        if (state === 'playing') {
            this.syncMainPlaybackToggle(PAUSE_ICON, '暂停');
            this.syncRealtimePlaybackToggle(true);
        } else {
            this.syncMainPlaybackToggle(PLAY_ICON, '播放');
            this.syncRealtimePlaybackToggle(false);
            if (state === 'stopped' || state === 'completed') this.renderPlayTime(0);
        }
    }

    private updatePlaybackRate(rawValue: string) {
        const normalized = String(rawValue || '1');
        this.speedSelect.value = normalized;
        this.realtimeSpeedSelect.value = normalized;
        this.player.setPlaybackRate(Number(normalized || 1));
    }

    private togglePlayPause() {
        if (this.playerState === 'playing') {
            this.player.pause();
            return;
        }
        if (this.playerState === 'paused') {
            this.player.resume();
            return;
        }
        this.updatePlaybackRate(this.speedSelect.value || this.realtimeSpeedSelect.value || '1');
        this.player.setMainQueue(this.buildPlaybackSegments());
        void this.player.play();
    }

    private toggleRealtimeMode() {
        this.realtimeEnabled = this.realtimeToggleEl.checked;
        if (!this.voiceModeActive) {
            this.realtimeStatusEl.textContent = this.realtimeEnabled ? '开启后可打断主 CSV，并由对话驱动播放' : '关闭时仅播放主 CSV';
        }
    }

    private async submitChatText() {
        if (this.voiceModeActive) return;
        const question = this.chatInputEl.value.trim();
        if (!question) return;
        this.chatInputEl.value = '';
        await this.handleRealtimeQuestion(question);
    }

    private async handleRealtimeQuestion(question: string, options?: { source?: 'text' | 'voice'; utteranceId?: string; }) {
        if (this.asrProvider === 'gemini_live') {
            await this.handleGeminiLiveTurn(question, options);
            return;
        }
        const requestStartedAt = performance.now();
        const requestId = ++this.activeTurnRequestId;
        this.activeTurnAbortController?.abort();
        const abortController = new AbortController();
        this.activeTurnAbortController = abortController;
        try {
            this.ensureModelLoaded();
            if (!this.realtimeEnabled) this.realtimeToggleEl.checked = this.realtimeEnabled = true;
            this.pushChat('user', question);
            const requestPayload = {
                question,
                provider: this.chatProvider,
                model: this.chatModelEl.value,
                historyCount: this.chatHistory.length,
                capturesCount: this.captureList().length,
                currentSegment: this.player.getCurrentSegment()
                    ? {
                        focusPart: this.player.getCurrentSegment()?.focusPart,
                        focusView: this.player.getCurrentSegment()?.focusView,
                        text: this.player.getCurrentSegment()?.text
                    }
                    : null
            };
            this.pushRtcSystemEvent('Question Submitted', question);
            this.pushRtcSystemEvent('Model Request', `${this.chatProvider} / ${this.chatModelEl.value}`, requestPayload);
            this.setStatus('正在生成实时回答...', 'chat');
            const result = await createRealtimeTurn({
                question,
                provider: this.chatProvider,
                model: this.chatModelEl.value,
                history: this.chatHistory,
                captures: this.captureList(),
                modelContext: this.viewer.getModelContext(),
                currentSegment: this.player.getCurrentSegment()
            }, abortController.signal);
            if (requestId !== this.activeTurnRequestId) return;
            const latencyMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
            this.pushRtcSystemEvent('Model Response', '实时回答已返回', result.debug || result, latencyMs);
            if (result.debug?.rawText) this.pushRtcSystemEvent('LLM Raw Output', '大模型原始返回', result.debug.rawText);
            if (result.debug?.normalizedDecision) this.pushRtcSystemEvent('Mapped Decision', '模型返回已映射为视角决策', result.debug.normalizedDecision);
            if (result.debug?.synthesizedCamera) this.pushRtcSystemEvent('Mapped Camera', '视角决策已映射为镜头参数', result.debug.synthesizedCamera);
            this.pushChat('assistant', result.answer);
            this.pushRtcSystemEvent('Answer Text', result.answer);
            this.pushRtcSystemEvent('Segment Ready', `${result.segment.focusPart} / ${result.segment.focusView}`, result.segment);
            this.pushRtcSystemEvent('CameraControl', '优先队列镜头参数', normalizeCameraStateForCl(result.segment.camera));
            this.player.enqueuePriority([result.segment]);
            this.pushRtcSystemEvent('Queue Update', `已插入 Priority Queue：${result.segment.focusPart}`);
            if (this.playerState !== 'playing') {
                this.pushRtcSystemEvent('Playback', '开始播放 Priority Queue');
                void this.player.play();
            }
            this.setStatus(`已插入实时回答：${result.segment.focusPart}`, 'chat');
        } catch (error) {
            if (abortController.signal.aborted || requestId !== this.activeTurnRequestId) {
                this.pushRtcSystemEvent('Request Cancelled', options?.source === 'voice' ? '语音抢话打断了上一轮响应' : '上一轮响应已取消');
                return;
            }
            this.pushChat('system', `实时回答失败：${error instanceof Error ? error.message : String(error)}`);
            this.pushRtcSystemEvent('Request Failed', error instanceof Error ? error.message : String(error));
            this.setStatus(error instanceof Error ? error.message : String(error), 'chat');
        } finally {
            if (this.activeTurnAbortController === abortController) this.activeTurnAbortController = null;
        }
    }

    private liveContextSnapshot(): RealtimeContextSnapshot {
        return {
            captures: this.captureList(),
            modelContext: this.viewer.getModelContext(),
            currentSegment: this.player.getCurrentSegment()
        };
    }

    private async ensureLiveSessionConnected() {
        this.ensureModelLoaded();
        if (!this.liveSession) {
            this.liveSession = createRealtimeLiveSession({ provider: this.asrProvider, model: this.asrModel });
            this.liveSession.onEvent((event) => this.handleLiveSessionEvent(event));
        }
        this.liveSession.updateOptions({ provider: this.asrProvider, model: this.asrModel });
        await this.liveSession.connect(this.liveContextSnapshot());
        this.liveSession.updateContext(this.liveContextSnapshot());
    }

    private async handleGeminiLiveTurn(question: string, options?: { source?: 'text' | 'voice'; utteranceId?: string; }) {
        this.ensureModelLoaded();
        if (!this.realtimeEnabled) this.realtimeToggleEl.checked = this.realtimeEnabled = true;
        this.activeLiveTurnQuestion = question;
        this.activeLiveResponseText = '';
        if (options?.source !== 'voice') this.pushChat('user', question);
        this.pushRtcSystemEvent('Gemini Live Request', options?.source === 'voice' ? '语音 turn 已提交' : question, {
            provider: this.asrProvider,
            model: this.asrModel,
            source: options?.source || 'text',
            currentSegment: this.player.getCurrentSegment()
        });
        this.setStatus('正在连接 Gemini Live...', 'voice');
        await this.ensureLiveSessionConnected();
        this.liveSession?.updateContext(this.liveContextSnapshot());
        this.liveSession?.sendTextTurn(question, this.liveContextSnapshot());
    }

    private async finalizeGeminiLiveTurn(answerText: string, transcript?: string) {
        const answer = String(answerText || '').trim();
        if (!answer) return;
        const question = String(transcript || this.activeLiveTurnQuestion || '').trim();
        this.pushChat('assistant', answer);
        this.pushRtcSystemEvent('Gemini Live Response', answer, { transcript: transcript || null });
        const result = await createRealtimeSegment({
            question,
            answer,
            captures: this.captureList(),
            modelContext: this.viewer.getModelContext(),
            currentSegment: this.player.getCurrentSegment()
        });
        this.pushRtcSystemEvent('Segment Ready', `${result.segment.focusPart} / ${result.segment.focusView}`, result.segment);
        this.player.enqueuePriority([result.segment]);
        if (this.playerState !== 'playing') void this.player.play();
        this.setStatus(`Gemini Live 已插入实时回答：${result.segment.focusPart}`, 'voice');
    }

    private async handleLiveSessionEvent(event: RealtimeLiveEvent) {
        if (event.type === 'state') {
            const statusMap: Record<string, string> = {
                connecting: '正在连接 Gemini Live...',
                connected: 'Gemini Live 已连接',
                listening: 'Gemini Live 麦克风已开启，持续监听中',
                closed: 'Gemini Live 已关闭',
                error: 'Gemini Live 出现异常'
            };
            if (statusMap[event.value]) this.setStatus(statusMap[event.value], 'voice');
            return;
        }
        if (event.type === 'level') {
            this.currentMicLevel = event.level;
            this.recordBtnEl.style.setProperty('--voice-level', String(this.voiceModeActive ? event.level : 0));
            return;
        }
        if (event.type === 'session_ready') {
            this.pushRtcSystemEvent('Gemini Live Session', `${event.provider} / ${event.model}`, { sessionId: event.sessionId || null });
            this.realtimeStatusEl.textContent = 'Gemini Live 已连接，等待说话';
            return;
        }
        if (event.type === 'voice_activity') {
            if (event.value === 'start') {
                this.player.interruptForVoice();
                this.setStatus('检测到用户开始说话，已打断当前播放', 'voice');
            }
            return;
        }
        if (event.type === 'transcript_partial') {
            const partial = String(event.text || '').trim();
            if (!partial) return;
            this.activeVoicePartialText = partial;
            this.realtimeStatusEl.textContent = `Gemini Live 听写中：${partial}`;
            return;
        }
        if (event.type === 'transcript_final') {
            const text = String(event.text || '').trim();
            if (text) {
                this.activeLiveTurnQuestion = text;
                this.pushChat('user', text);
                this.pushRtcSystemEvent('Voice Final', text, { provider: 'gemini_live', model: this.asrModel });
            }
            return;
        }
        if (event.type === 'response_partial') {
            this.activeLiveResponseText = event.text;
            this.realtimeStatusEl.textContent = `Gemini Live 回复中：${event.text}`;
            return;
        }
        if (event.type === 'response_final') {
            this.activeLiveResponseText = event.text;
            this.realtimeStatusEl.textContent = 'Gemini Live 本轮回复完成';
            await this.finalizeGeminiLiveTurn(event.text, event.transcript);
            this.activeVoicePartialText = '';
            this.activeLiveResponseText = '';
            return;
        }
        if (event.type === 'debug') {
            this.appendLog('voice', 'gemini-live debug', typeof event.detail === 'string' ? event.detail : prettyJson(event.detail));
            return;
        }
        if (event.type === 'error') {
            this.pushChat('system', `Gemini Live 失败：${event.message}`);
            this.setStatus(event.message, 'voice');
        }
    }

    private updateVoiceUi() {
        const icon = this.voiceModeActive ? MIC_ON_ICON : MIC_OFF_ICON;
        this.recordBtnEl.innerHTML = `<span class="otp-mic-ripple"></span><span class="otp-mic-ripple otp-mic-ripple-2"></span><span class="otp-mic-icon-wrap">${icon}</span>`;
        this.recordBtnEl.classList.toggle('playing', this.voiceModeActive);
        this.recordBtnEl.classList.toggle('otp-mic-btn', true);
        this.recordBtnEl.title = this.voiceModeActive ? '关闭语音对话' : '开启语音对话';
        this.recordBtnEl.setAttribute('aria-label', this.voiceModeActive ? '关闭语音对话' : '开启语音对话');
        this.recordBtnEl.style.setProperty('--voice-level', String(this.voiceModeActive ? this.currentMicLevel : 0));
        this.chatInputEl.disabled = this.voiceModeActive;
        this.sendChatBtnEl.disabled = this.voiceModeActive;
        this.chatInputEl.placeholder = this.voiceModeActive ? '语音对话已开启，持续监听中' : '弹幕输入，回车插队';
    }

    private bargeInCurrentResponse(reason: string, utteranceId: string) {
        if (this.voiceBargeInTriggeredUtterances.has(utteranceId)) return;
        this.voiceBargeInTriggeredUtterances.add(utteranceId);
        this.activeTurnAbortController?.abort();
        this.player.interruptForVoice();
        this.pushRtcSystemEvent('Voice Barge-In', reason, { utteranceId, mode: this.voiceBargeInMode });
        this.setStatus('检测到用户继续说话，已打断当前响应', 'voice');
    }

    private async handleVoiceStreamEvent(event: VoiceStreamEvent) {
        if (event.type === 'state') {
            const statusMap: Record<string, string> = {
                connecting: '正在连接 Aliyun 流式 ASR...',
                listening: '麦克风已开启，持续监听中',
                processing: '正在接收语音并等待切句...',
                closed: '语音对话已关闭，可切回文字输入',
                error: '语音流出现异常'
            };
            const message = statusMap[event.value];
            if (message) this.setStatus(message, 'voice');
            return;
        }
        if (event.type === 'speech_start') {
            this.activeVoiceUtteranceId = event.utteranceId;
            this.activeVoicePartialText = '';
            if (this.voiceBargeInMode === 'speech_start') {
                this.bargeInCurrentResponse('检测到说话即打断', event.utteranceId);
            }
            return;
        }
        if (event.type === 'level') {
            this.currentMicLevel = event.level;
            this.recordBtnEl.style.setProperty('--voice-level', String(this.voiceModeActive ? event.level : 0));
            return;
        }
        if (event.type === 'speech_end') {
            this.setStatus('本轮语音结束，等待 Aliyun 返回识别结果...', 'voice');
            return;
        }
        if (event.type === 'utterance_blob') {
            this.voiceUtteranceBlobs.set(event.utteranceId, event.blob);
            return;
        }
        if (event.type === 'asr_partial') {
            const partial = String(event.text || '').trim();
            if (!partial) return;
            this.activeVoicePartialText = partial;
            this.realtimeStatusEl.textContent = `听写中：${partial}`;
            if (this.voiceBargeInMode === 'valid_word') {
                this.bargeInCurrentResponse('识别到有效词后打断', event.utteranceId);
            }
            return;
        }
        if (event.type === 'asr_final') {
            let text = String(event.text || '').trim();
            this.voiceBargeInTriggeredUtterances.delete(event.utteranceId);
            this.activeVoiceUtteranceId = '';
            this.activeVoicePartialText = '';
            if (!text) {
                const blob = this.voiceUtteranceBlobs.get(event.utteranceId) || null;
                if (blob) {
                    this.pushRtcSystemEvent('Voice Fallback', '流式结果为空，回退到 Aliyun 整段转写', { utteranceId: event.utteranceId, bytes: blob.size });
                    try {
                        const fallback = await transcribeRealtimeAudio(blob, this.asrModel);
                        text = String(fallback.text || '').trim();
                    } catch (error) {
                        this.pushRtcSystemEvent('Voice Fallback Failed', error instanceof Error ? error.message : String(error), { utteranceId: event.utteranceId });
                    }
                }
            }
            this.voiceUtteranceBlobs.delete(event.utteranceId);
            if (!text) {
                this.setStatus('Aliyun ASR 未识别出有效内容，继续监听', 'voice');
                this.realtimeStatusEl.textContent = '流式语音对话待命中';
                return;
            }
            this.pushRtcSystemEvent('Voice Final', text, { utteranceId: event.utteranceId, provider: this.asrProvider, model: this.asrModel });
            void this.handleRealtimeQuestion(text, { source: 'voice', utteranceId: event.utteranceId });
            return;
        }
        if (event.type === 'debug') {
            this.appendLog('voice', 'stream debug', typeof event.detail === 'string' ? event.detail : prettyJson(event.detail));
            return;
        }
        if (event.type === 'error') {
            this.pushChat('system', `语音流失败：${event.message}`);
            this.setStatus(event.message, 'voice');
        }
    }

    private async startVoiceMode() {
        this.ensureModelLoaded();
        if (!this.realtimeEnabled) this.realtimeToggleEl.checked = this.realtimeEnabled = true;
        if (this.asrProvider === 'gemini_live') {
            await this.ensureLiveSessionConnected();
            await this.liveSession?.startMicrophone(this.liveContextSnapshot());
            this.voiceModeActive = true;
            this.realtimeStatusEl.textContent = 'Gemini Live 语音对话待命中';
            this.updateVoiceUi();
            return;
        }
        this.voiceStream?.updateModel(this.asrModel, aliyunAsrSampleRate(this.asrModel));
        if (!this.voiceStream) {
            this.voiceStream = createRealtimeVoiceStream({ model: this.asrModel, sampleRate: aliyunAsrSampleRate(this.asrModel) });
            this.voiceStream.onEvent((event) => this.handleVoiceStreamEvent(event));
        }
        await this.voiceStream.start();
        this.voiceModeActive = true;
        this.realtimeStatusEl.textContent = '流式语音对话待命中';
        this.updateVoiceUi();
    }

    private async stopVoiceMode() {
        if (this.asrProvider === 'gemini_live') {
            await this.liveSession?.stopMicrophone();
        } else {
            await this.voiceStream?.stop();
        }
        this.voiceModeActive = false;
        this.activeVoiceUtteranceId = '';
        this.activeVoicePartialText = '';
        this.activeLiveResponseText = '';
        this.currentMicLevel = 0;
        this.voiceBargeInTriggeredUtterances.clear();
        this.voiceUtteranceBlobs.clear();
        this.realtimeStatusEl.textContent = this.realtimeEnabled ? '开启后可打断主 CSV，并由对话驱动播放' : '关闭时仅播放主 CSV';
        this.updateVoiceUi();
    }

    private async toggleVoiceMode() {
        try {
            if (this.voiceModeActive) {
                await this.stopVoiceMode();
                return;
            }
            await this.startVoiceMode();
        } catch (error) {
            this.voiceModeActive = false;
            this.updateVoiceUi();
            this.setStatus(`开启语音对话失败：${error instanceof Error ? error.message : String(error)}`, 'voice');
        }
    }

    private async jumpToCapture(capture: CaptureItem, mode: 'ts' | 'rtc' = 'ts') {
        const resolvedCamera = mode === 'rtc'
            ? normalizeCameraStateForRtc(capture.camera as any)
            : normalizeCameraStateForCl(capture.camera);
        const modeLabel = mode === 'rtc' ? 'CameraControl.mjs' : 'CameraControl.ts';
        this.appendLog('camera', `jump-mode ${capture.view} ${modeLabel}`, prettyJson({
            sourceView: capture.view,
            mode,
            input: capture.camera,
            resolved: resolvedCamera
        }));
        this.pushRtcSystemEvent('Capture Compare', `${capture.view} / ${modeLabel}`, {
            sourceView: capture.view,
            mode,
            input: capture.camera,
            resolved: resolvedCamera
        });
        this.logCameraDebug(`jump-request-${mode}`, capture.view, resolvedCamera);
        void this.viewer.moveToCameraState(resolvedCamera, 900).catch((error) => {
            this.setStatus(error instanceof Error ? error.message : String(error), 'capture');
        });
        window.setTimeout(() => {
            this.logCameraDebug(`jump-applied-${mode}`, capture.view, this.viewer.getCurrentCameraState());
            this.setStatus(`已按 ${modeLabel} 跳转到 ${capture.view} 视角，可校准旋转是否到位`, 'capture');
        }, 1200);
    }

    private startDrag(event: PointerEvent) {
        const target = event.target as HTMLElement | null;
        if (event.button !== 0 || target?.closest('button,input,select,textarea,label,a')) return;
        const rect = this.shellEl.getBoundingClientRect();
        this.shellEl.style.left = `${rect.left}px`;
        this.shellEl.style.top = `${rect.top}px`;
        this.dragActive = true;
        this.dragPointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragBaseLeft = rect.left;
        this.dragBaseTop = rect.top;
        this.shellHeadEl.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    private moveDrag(event: PointerEvent) {
        if (!this.dragActive || event.pointerId !== this.dragPointerId) return;
        this.shellEl.style.left = `${this.dragBaseLeft + (event.clientX - this.dragStartX)}px`;
        this.shellEl.style.top = `${this.dragBaseTop + (event.clientY - this.dragStartY)}px`;
    }

    private endDrag(event: PointerEvent) {
        if (!this.dragActive || event.pointerId !== this.dragPointerId) return;
        this.dragActive = false;
        this.dragPointerId = -1;
        if (this.shellHeadEl.hasPointerCapture(event.pointerId)) this.shellHeadEl.releasePointerCapture(event.pointerId);
    }

    private startRealtimeDrag(event: PointerEvent) {
        const target = event.target as HTMLElement | null;
        if (event.button !== 0 || target?.closest('button,input,select,textarea,label,a')) return;
        const rect = this.realtimePanelEl.getBoundingClientRect();
        this.realtimePanelEl.style.left = `${rect.left}px`;
        this.realtimePanelEl.style.right = 'auto';
        this.realtimePanelEl.style.top = `${rect.top}px`;
        this.realtimeDragActive = true;
        this.realtimeDragPointerId = event.pointerId;
        this.realtimeDragStartX = event.clientX;
        this.realtimeDragStartY = event.clientY;
        this.realtimeDragBaseLeft = rect.left;
        this.realtimeDragBaseTop = rect.top;
        this.realtimePanelHeadEl.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    private moveRealtimeDrag(event: PointerEvent) {
        if (!this.realtimeDragActive || event.pointerId !== this.realtimeDragPointerId) return;
        this.realtimePanelEl.style.left = `${this.realtimeDragBaseLeft + (event.clientX - this.realtimeDragStartX)}px`;
        this.realtimePanelEl.style.top = `${this.realtimeDragBaseTop + (event.clientY - this.realtimeDragStartY)}px`;
    }

    private endRealtimeDrag(event: PointerEvent) {
        if (!this.realtimeDragActive || event.pointerId !== this.realtimeDragPointerId) return;
        this.realtimeDragActive = false;
        this.realtimeDragPointerId = -1;
        if (this.realtimePanelHeadEl.hasPointerCapture(event.pointerId)) this.realtimePanelHeadEl.releasePointerCapture(event.pointerId);
    }
}

void new CinematicLiteApp().boot().catch((error) => {
    const statusEl = document.getElementById('cinelite-status');
    if (statusEl) statusEl.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
});
