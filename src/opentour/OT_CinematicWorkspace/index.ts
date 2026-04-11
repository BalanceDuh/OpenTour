import {
    OT_TOUR_CSV_HEADERS,
    OT_TOUR_CSV_VERSION
} from '../OT_Shared/fieldStandard';
import {
    createHotspotController,
    normalizeHotspot,
    type EmbeddedMediaSpec,
    type HotspotController,
    type HotspotRecord,
    type HotspotWorldPoint,
    type ProjectedScreenPoint
} from '../OT_Shared/hotspot';
import {
    CINE_ICON_CHEVRON,
    CINE_ICON_COMPILE,
    CINE_ICON_EYE,
    CINE_ICON_FILE_PLUS,
    CINE_ICON_FOLDER,
    CINE_ICON_FOCUS,
    CINE_ICON_GEAR,
    CINE_ICON_LIST,
    CINE_ICON_LOCK,
    CINE_ICON_MAGIC,
    CINE_ICON_MAP,
    CINE_ICON_MINI,
    CINE_ICON_MINUS,
    CINE_ICON_MUSIC,
    CINE_ICON_PAUSE,
    CINE_ICON_PLAY,
    CINE_ICON_PLUS,
    CINE_ICON_PROMPT,
    CINE_ICON_REFRESH,
    CINE_ICON_SAVE,
    CINE_ICON_SAVE_AS,
    CINE_ICON_SLIDERS,
    CINE_ICON_STOP,
    CINE_ICON_TARGET,
    CINE_ICON_TTS,
    CINE_ICON_VOLUME,
    CINE_ICON_WAND,
    CSV_ICON_CLOSE,
    CSV_ICON_DELETE,
    CSV_ICON_DOWNLOAD,
    CSV_ICON_FULLSCREEN,
    CSV_ICON_GENERATE,
    CSV_ICON_SAVE,
    CSV_ICON_SAVE_AS,
    CSV_ICON_TIMING,
    CSV_ICON_VOICE,
    DEFAULT_CINEMATIC_PLANNER_PROMPT,
    DEFAULT_CINEMATIC_SIMPLE_PROMPT,
    DEFAULT_CSV_PROMPT_TEMPLATE,
    DEFAULT_CSV_TARGET_DURATION_SEC,
    DEFAULT_LLM_MODEL,
    DEFAULT_MOVE_PROMPT_TEMPLATE,
    DEFAULT_POI_FOV,
    DEFAULT_PROMPT_TEMPLATE,
    DEFAULT_QWEN_MODEL,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    GEMINI_MODELS,
    MAX_POI_FOV,
    MIN_POI_FOV,
    PANEL_ID,
    QWEN_MODELS,
    STYLE_ID,
    TTS_VOICE_OPTIONS_BY_MODEL
} from './constants';
import { ensureStyle } from './style';
import {
    buildCsvTextFromGrid,
    downloadCsvText,
    parseCsvText,
    renderCsvGrid,
    renderCsvTimingConfig,
    renderCsvVersionList,
    renderCsvVoiceConfig,
} from './csv/workspace';
import {
    cinematicBgmEffectiveRate,
    clamp,
    clampFov,
    clampMusicRate,
    countSpeechChars,
    degToRad,
    formatCsvTimingSummary,
    escapeCsv,
    escapeHtmlAttr,
    formatSecondsLabel,
    isAudioFileName,
    normalizeCsvTimingConfig,
    normalizeCsvVoiceConfig,
    normalizeCwMediaObjectConfig,
    normalizeMusicDuration,
    plannerPromptRequestsMediaObject,
    plannerPromptRequestsOrbitLikeCamera,
    radToDeg,
} from './utils';
import {
    type CameraPose,
    type CinematicBgmConfig,
    type CinematicBgmLibraryItem,
    type CinematicCameraBehavior,
    type CinematicKeyframe,
    type CinematicMediaObjectConfig,
    type CinematicPlan,
    type CinematicRecordingAudioMixRuntime,
    type CinematicRecordingRuntime,
    type CinematicRecordingSettings,
    type CinematicShot,
    type CinematicStoredRecordingEntry,
    type CinematicVersionDetail,
    type CinematicVersionSummary,
    type CinematicWorkspaceController,
    type CinematicWorkspaceOptions,
    type CsvTimingConfigState,
    type CsvTimingSummary,
    type CsvVersionDetail,
    type CsvVersionSummary,
    type CsvVoiceConfigState,
    type JobState,
    type LlmConfigState,
    type LlmProvider,
    type MapBounds,
    type Mp4CompressionPreset,
    type PromptEditorContext,
    type ProviderConfig,
    type TourPoi,
    type TtsVoiceOption,
    type WorldPoint
} from './types';

class CinematicWorkspacePanel implements CinematicWorkspaceController {
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
    private readonly cinematicCwCsvWorkspaceModal: HTMLDivElement;
    private readonly cinematicCwCsvWorkspacePanel: HTMLDivElement;
    private readonly cinematicCwCsvVersionListEl: HTMLDivElement;
    private readonly cinematicCwCsvGridWrapEl: HTMLDivElement;
    private readonly cinematicCwCsvGridTableEl: HTMLTableElement;
    private readonly cinematicCwCsvEditorInput: HTMLTextAreaElement;
    private readonly cinematicCwCsvWorkspaceStatusEl: HTMLDivElement;
    private readonly cinematicCwCsvTimingSummaryEl: HTMLDivElement;
    private readonly cinematicCwCsvVoiceEnabledInput: HTMLInputElement;
    private readonly cinematicCwCsvVoiceSummaryEl: HTMLDivElement;
    private readonly cinematicCwCsvTimingEnabledInput: HTMLInputElement;
    private readonly cinematicCwCsvTimingInput: HTMLInputElement;
    private readonly cinematicCwCsvTimingModal: HTMLDivElement;
    private readonly cinematicCwCsvTimingMinimumEl: HTMLDivElement;
    private readonly cinematicCwCsvTimingEstimatedEl: HTMLDivElement;
    private readonly cinematicCwCsvVoiceModal: HTMLDivElement;
    private readonly cinematicCwCsvVoiceModelSelect: HTMLSelectElement;
    private readonly cinematicCwCsvVoiceFixedSelect: HTMLSelectElement;
    private readonly cinematicCwCsvVoiceListEl: HTMLDivElement;
    private readonly cinematicCwCsvContentModal: HTMLDivElement;
    private readonly cinematicCwCsvContentTitleEl: HTMLDivElement;
    private readonly cinematicCwCsvContentInput: HTMLTextAreaElement;
    private readonly cinematicWorkspaceModal: HTMLDivElement;
    private readonly cinematicWorkspacePanel: HTMLDivElement;
    private readonly cinematicVersionListEl: HTMLDivElement;
    private readonly cinematicStatusEl: HTMLDivElement;
    private readonly cinematicPoiPickerModal: HTMLDivElement;
    private readonly cinematicPoiListEl: HTMLDivElement;
    private readonly cinematicTimelineEl: HTMLDivElement;
    private cinematicTimelineTrackWrapEl: HTMLDivElement | null = null;
    private cinematicTimelineRulerWrapEl: HTMLDivElement | null = null;
    private cinematicTimelinePlayheadEl: HTMLDivElement | null = null;
    private cinematicTimelineScrollLeft = 0;
    private readonly cinematicKeyframeModal: HTMLDivElement;
    private readonly cinematicKeyframeEditorBodyEl: HTMLDivElement;
    private readonly cinematicShotModal: HTMLDivElement;
    private readonly cinematicShotEditorBodyEl: HTMLDivElement;
    private readonly cinematicTopCanvas: HTMLCanvasElement;
    private readonly cinematicFrontCanvas: HTMLCanvasElement;
    private readonly cinematicPreviewImageEl: HTMLImageElement;
    private readonly cinematicCurrentKfLabelEl: HTMLDivElement;
    private readonly cinematicSimplePromptInput: HTMLTextAreaElement;
    private readonly cinematicPlannerPromptInput: HTMLTextAreaElement;
    private readonly cinematicSceneInput: HTMLTextAreaElement;
    private readonly cinematicStoryInput: HTMLTextAreaElement;
    private readonly cinematicStyleInput: HTMLInputElement;
    private readonly cinematicDurationInput: HTMLInputElement;
    private readonly cinematicMiniToggleBtn: HTMLButtonElement;
    private readonly cinematicMiniPlayBtn: HTMLButtonElement;
    private readonly cinematicMiniTimelineEl: HTMLDivElement;
    private readonly cinematicMiniTimeEl: HTMLDivElement;
    private readonly cinematicSimplePromptModal: HTMLDivElement;
    private readonly cinematicComplexPromptModal: HTMLDivElement;
    private readonly cinematicSimpleVersionListEl: HTMLDivElement;
    private readonly cinematicComplexVersionListEl: HTMLDivElement;
    private readonly cinematicSimplePromptEditor: HTMLTextAreaElement;
    private readonly cinematicComplexPromptEditor: HTMLTextAreaElement;
    private readonly cinematicBgmModal: HTMLDivElement;
    private readonly cinematicBgmSearchInput: HTMLInputElement;
    private readonly cinematicBgmLibraryEl: HTMLDivElement;
    private readonly cinematicBgmFolderInput: HTMLInputElement;
    private readonly cinematicBgmFileInput: HTMLInputElement;
    private readonly cinematicMediaFileInput: HTMLInputElement;
    private readonly cinematicBgmPlayerBtn: HTMLButtonElement;
    private readonly cinematicBgmProgressInput: HTMLInputElement;
    private readonly cinematicBgmTimeEl: HTMLDivElement;
    private readonly cinematicBgmRateInput: HTMLSelectElement;
    private readonly cinematicBgmWaveCanvas: HTMLCanvasElement;
    private readonly cinematicBgmStartInput: HTMLInputElement;
    private readonly cinematicBgmEndInput: HTMLInputElement;
    private readonly cinematicBgmClipDurationEl: HTMLDivElement;
    private readonly cinematicBgmClipPlayBtn: HTMLButtonElement;
    private readonly cinematicBgmRecommendBtn: HTMLButtonElement;
    private readonly cinematicBgmManualRateInput: HTMLInputElement;
    private readonly cinematicBgmTargetDurationInput: HTMLInputElement;
    private readonly cinematicBgmEffectiveRateEl: HTMLDivElement;
    private readonly cinematicRecordingModalEl: HTMLDivElement;
    private readonly cinematicRecordBtn: HTMLButtonElement;
    private readonly cinematicRecordPauseBtn: HTMLButtonElement | null;
    private readonly cinematicRecordStopBtn: HTMLButtonElement | null;
    private readonly cinematicRecordTimerEl: HTMLSpanElement;
    private readonly cinematicRecordingModalStatusEl: HTMLDivElement;
    private readonly cinematicRecordingFrameRateSelect: HTMLSelectElement;
    private readonly cinematicRecordingQualitySelect: HTMLSelectElement;
    private readonly cinematicRecordingCompressionSelect: HTMLSelectElement;
    private readonly cinematicRecordingIncludeTtsInput: HTMLInputElement;
    private readonly cinematicRecordingAutoPlayInput: HTMLInputElement;
    private readonly cinematicRecordingStopWithPlaybackInput: HTMLInputElement;
    private readonly cinematicRecordingHidePanelInput: HTMLInputElement;
    private readonly cinematicRecordingDisableInterruptsInput: HTMLInputElement;
    private readonly cinematicRecordingMasterVolumeInput: HTMLInputElement;
    private readonly cinematicRecordingTtsVolumeInput: HTMLInputElement;
    private readonly cinematicRecordingBgmVolumeInput: HTMLInputElement;
    private readonly cinematicRecordingSubtitlesEnabledInput: HTMLInputElement;
    private readonly cinematicRecordingSubtitleFontSelect: HTMLSelectElement;
    private readonly cinematicRecordingSubtitleSizeInput: HTMLInputElement;
    private readonly cinematicRecordingSubtitleColorInput: HTMLInputElement;
    private readonly cinematicRecordingMasterVolumeOut: HTMLSpanElement;
    private readonly cinematicRecordingTtsVolumeOut: HTMLSpanElement;
    private readonly cinematicRecordingBgmVolumeOut: HTMLSpanElement;
    private readonly cinematicRecordingSubtitleSizeOut: HTMLSpanElement;
    private readonly cinematicRecordingResultsEl: HTMLDivElement;
    private readonly cinematicRecordingResultsEmptyEl: HTMLDivElement;
    private readonly cinematicRecordingSyncToModelDbBtn: HTMLButtonElement;
    private readonly cinematicRecordingPagePrevBtn: HTMLButtonElement;
    private readonly cinematicRecordingPageNextBtn: HTMLButtonElement;
    private readonly cinematicRecordingPageLabelEl: HTMLDivElement;
    private readonly stopBtn: HTMLButtonElement;
    private readonly playToggleBtn: HTMLButtonElement;
    private readonly globalSaveBtn: HTMLButtonElement;
    private readonly hotspotController: HotspotController;

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
    private cinematicEventSource: EventSource | null = null;
    private drag: {
        active: boolean;
        pointerId: number;
        mode: 'top-pan' | 'front-pan' | 'top-yaw' | 'front-pitch' | 'front-move' | 'top-move' | null;
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
    private cinematicCwCsvVersions: CsvVersionSummary[] = [];
    private selectedCinematicCwCsvVersionId: number | null = null;
    private cinematicCwCsvEditorDirty = false;
    private cinematicCwCsvGridHeaders: string[] = [];
    private cinematicCwCsvGridRows: string[][] = [];
    private cinematicCwCsvContentEditTarget: { row: number; col: number } | null = null;
    private cinematicCwCsvWorkspaceFullscreen = false;
    private cinematicCwCsvWorkspaceDrag = { active: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private cinematicCwCsvVoiceConfig: CsvVoiceConfigState = normalizeCsvVoiceConfig(null);
    private cinematicCwCsvTimingConfig: CsvTimingConfigState = normalizeCsvTimingConfig(null);
    private cinematicCwCsvTimingSummary: CsvTimingSummary | null = null;
    private cinematicVersions: CinematicVersionSummary[] = [];
    private selectedCinematicVersionId: number | null = null;
    private cinematicSimplePrompt = DEFAULT_CINEMATIC_SIMPLE_PROMPT;
    private cinematicPlannerPrompt = DEFAULT_CINEMATIC_PLANNER_PROMPT;
    private cinematicSceneDescription = '';
    private cinematicStoryBackground = '';
    private cinematicStyleText = 'cinematic one take';
    private cinematicTargetDurationSec = 14;
    private cinematicSelectedPoiIds: string[] = [];
    private cinematicPoiDraftIds: string[] = [];
    private cinematicPlan: CinematicPlan | null = null;
    private cinematicWorkspaceDrag = { active: false, dragging: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private cinematicWorkspaceFloatPos = { left: 0, top: 0, initialized: false };
    private cinematicWorkspaceFullscreen = false;
    private cinematicMiniMode = false;
    private cinematicHideRootOnClose = false;
    private cinematicShowRouteOverlay = false;
    private cinematicBgmLibrary: CinematicBgmLibraryItem[] = [];
    private cinematicBgmFilter = '';
    private cinematicBgmSelection: CinematicBgmConfig | null = null;
    private cinematicBgmDraft: CinematicBgmConfig | null = null;
    private cinematicBgmPreviewAudio: HTMLAudioElement | null = null;
    private cinematicBgmLoadedAudioPath: string | null = null;
    private cinematicBgmPreviewRaf = 0;
    private cinematicBgmWaveform: number[] = [];
    private cinematicBgmAudioDurationSec = 0;
    private cinematicBgmClipPreviewPlaying = false;
    private cinematicBgmObjectUrls: string[] = [];
    private cinematicBgmHandleDbPromise: Promise<IDBDatabase> | null = null;
    private cinematicBgmWaveDrag = { active: false, pointerId: -1, mode: 'range' as 'range' | 'start' | 'end', anchorSec: 0 };
    private cinematicBgmTimelineSelected = false;
    private selectedCinematicShotId: string | null = null;
    private selectedCinematicKeyframeId: string | null = null;
    private cinematicPreview = { playing: false, paused: false, rafId: 0, shotIndex: 0, keyframeIndex: 0, segmentStartMs: 0, segmentDurationMs: 0 };
    private cinematicCurrentTimeSec = 0;
    private cinematicRecordingSettings: CinematicRecordingSettings = {
        frameRate: 24,
        videoBitsPerSecond: 18_000_000,
        audioBitsPerSecond: 256_000,
        mp4CompressionPreset: 'target_10mb',
        includeTts: true,
        autoPlay: true,
        stopWithPlayback: true,
        hidePanelDuringRecording: false,
        disableInterrupts: true,
        masterVolume: 1,
        ttsVolume: 1,
        bgmVolume: 0.5,
        subtitlesEnabled: true,
        subtitleFont: 'PingFang SC',
        subtitleFontSize: 26,
        subtitleColor: '#d7a733'
    };
    private activeCinematicRecording: CinematicRecordingRuntime | null = null;
    private cinematicRecordTimerId = 0;
    private cinematicRecordingDbPromise: Promise<IDBDatabase> | null = null;
    private cinematicRecordingResults: CinematicStoredRecordingEntry[] = [];
    private cinematicRecordingPageIndex = 0;
    private readonly cinematicRecordingPageSize = 3;
    private cinematicRecordingObjectUrls = new Map<string, string>();
    private readonly recoveringCinematicRecordingIds = new Set<string>();
    private cinematicRecordingAudioMix: CinematicRecordingAudioMixRuntime | null = null;
    private cinematicRecordingCompositorCanvas: HTMLCanvasElement | null = null;
    private cinematicRecordingCompositorCtx: CanvasRenderingContext2D | null = null;
    private cinematicRecordingCompositorRaf = 0;
    private cinematicRecordingSubtitleText = '';
    private cinematicRecordingHideRootOnStop = false;
    private cinematicRecordingDisableUi = false;
    private cinematicRecordingBackfillInProgress = false;
    private cinematicTimelineDrag = { active: false, pointerId: -1 };
    private cinematicTimelineKeyframeDrag = { active: false, pointerId: -1, keyframeId: '', shotId: '' };
    private cinematicMediaPick = {
        active: false,
        keyframeId: '',
        restoreMiniMode: false,
        reopenKeyframeEditor: false,
        cleanup: null as (() => void) | null
    };
    private cinematicMediaResize = {
        active: false,
        keyframeId: '',
        restoreMiniMode: false,
        reopenKeyframeEditor: false,
        cleanup: null as (() => void) | null,
        pointerDown: false,
        startClientX: 0,
        startScale: 1
    };
    private cinematicMediaFileTargetKeyframeId = '';
    private cinematicMediaPlace = {
        active: false,
        keyframeId: '',
        pointerDown: false,
        startClientX: 0,
        startClientY: 0,
        currentClientX: 0,
        currentClientY: 0,
        startWorld: null as HotspotWorldPoint | null,
        restoreMiniMode: false,
        reopenKeyframeEditor: false,
        cleanup: null as (() => void) | null
    };
    private cinematicMediaEditor = {
        active: false,
        keyframeId: '',
        mode: 'move' as 'move' | 'rotate' | 'scale',
        selected: false,
        restoreMiniMode: false,
        reopenKeyframeEditor: false,
        overlayEl: null as HTMLDivElement | null,
        pointerDown: false,
        pointerId: -1,
        dragMode: null as null | 'move' | 'rotate' | 'scale',
        cleanup: null as (() => void) | null,
        startClientX: 0,
        startClientY: 0,
        startAnchor: { x: 0, y: 0, z: 0 },
        startYaw: 0,
        startPitch: 0,
        startRoll: 0,
        startScale: 1
    };
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

    constructor(private readonly options: CinematicWorkspaceOptions) {
        ensureStyle();
        this.hotspotController = createHotspotController({
            getModelFilename: () => this.modelFilename,
            getPoiById: (poiId: string) => this.pois.find((poi) => poi.poiId === poiId) || null,
            moveToPoi: async (poiId: string) => {
                const poi = this.pois.find((item) => item.poiId === poiId);
                if (!poi) return;
                await this.moveToPoi(poi, 1);
                this.hotspotController.activatePoi(poiId);
            },
            captureScreenshotPng: this.options.captureScreenshotPng,
            saveState: (reason: string) => this.saveState(reason),
            setStatus: (text: string) => this.setStatus(text),
            pickWorldPointAtScreen: this.options.pickWorldPointAtScreen,
            projectWorldToScreen: this.options.projectWorldToScreen,
            resolveAssetUrl: this.options.resolveAssetUrl,
            showEmbeddedMedia: this.options.showEmbeddedMedia
        });
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
                            <button class="otl-icon-btn" data-act="goto-selected" title="Go To Selected POI">↗</button>
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
            <div class="otl-settings-modal otl-cinematic-shell hidden" data-role="cinematic-workspace-modal">
                <div class="otl-csv-workspace-panel" data-role="cinematic-workspace-panel">
                    <div class="otl-cinematic-header otl-csv-workspace-drag-handle" data-role="cinematic-workspace-drag-handle">
                        <div class="otl-cinematic-header-left">
                            <div class="otl-cinematic-brand"><span class="otl-cinematic-badge">CINE</span><div class="otl-cinematic-title-group"><button class="otl-cinematic-mini-toggle" data-act="cinematic-mini-mode" type="button">Mini</button></div></div>
                            <div class="otl-cinematic-playbar">
                                <button class="otl-cinematic-icon-btn primary" data-act="cinematic-preview-toggle" title="预览 (Preview)">${CINE_ICON_PLAY}</button>
                                <button class="otl-cinematic-icon-btn" data-act="cinematic-preview-stop" title="停止 (Stop)">${CINE_ICON_STOP}</button>
                                <select class="otl-cinematic-speed-select" data-role="cinematic-playback-speed">
                                    <option value="0.5">0.5x</option>
                                    <option value="1" selected>1.0x</option>
                                    <option value="1.5">1.5x</option>
                                    <option value="2">2.0x</option>
                                </select>
                                <button class="otl-cine-record-btn" data-act="cinematic-record-open" title="录制 (Record)"><span class="dot"></span><span>Rec</span></button>
                                <span class="otl-cine-record-timer" data-role="cinematic-record-timer"></span>
                            </div>
                        </div>
                        <div class="otl-cinematic-actions">
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-open-bgm" title="背景音乐 (BGM)">${CINE_ICON_MUSIC}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-open-keyframe-editor" title="关键帧 (Key Frame)">${CINE_ICON_MAP}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-open-shot-editor" title="镜头/场景 (Shot)">${CINE_ICON_SLIDERS}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-save" title="保存 (Save)">${CINE_ICON_SAVE}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-save-new" title="保存新版本 (Save Version)">${CINE_ICON_SAVE_AS}</button>
                            <button class="otl-cinematic-icon-btn primary" data-act="cinematic-open-cw-csv" title="生成 CSV (Generate CSV)">${CINE_ICON_COMPILE}</button>
                            <button class="otl-cinematic-icon-btn" data-act="csv-voice-config" title="文本转语音 (TTS)">${CINE_ICON_TTS}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-workspace-fullscreen" title="Fullscreen">${CSV_ICON_FULLSCREEN}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-workspace-close" title="Close">${CSV_ICON_CLOSE}</button>
                        </div>
                        <div class="otl-cinematic-mini" style="display:none;">
                            <button class="otl-cinematic-mini-play" data-act="cinematic-preview-toggle" title="Play or Pause">${CINE_ICON_PLAY}</button>
                            <div class="otl-cinematic-mini-timeline" data-role="cinematic-mini-timeline"></div>
                            <div class="otl-cinematic-mini-time" data-role="cinematic-mini-time">0.0s</div>
                        </div>
                    </div>
                    <div class="otl-cinematic-main">
                        <div class="otl-cinematic-left">
                            <div class="otl-cinematic-pane">
                                <div class="otl-cinematic-section-head">
                                    <div class="otl-cinematic-section-title"><span>Versions</span></div>
                                    <div class="otl-cinematic-subactions">
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-version-refresh" title="Refresh Versions">${CINE_ICON_REFRESH}</button>
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-version-delete" title="Delete Current Version">${CSV_ICON_DELETE}</button>
                                    </div>
                                </div>
                                <div class="otl-csv-version-list" data-role="cinematic-version-list"></div>
                            </div>
                            <div class="otl-cinematic-pane control-pane">
                                <div class="otl-cinematic-section-head">
                                    <div class="otl-cinematic-section-title"><span>Create</span></div>
                                    <div class="otl-cinematic-subactions">
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-open-poi-picker" title="Select POIs">${CINE_ICON_LIST}</button>
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-open-simple-prompt" title="Open Simple Prompt">${CINE_ICON_GEAR}</button>
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-generate-prompt" title="Generate Prompt">${CINE_ICON_MAGIC}</button>
                                        <button class="otl-cinematic-icon-btn" data-act="cinematic-open-complex-prompt" title="Open Complex Prompt">${CINE_ICON_GEAR}</button>
                                    </div>
                                </div>
                                    <div class="otl-cinematic-duration-label">Duration</div>
                                    <div class="otl-cinematic-duration-row">
                                    <input class="otl-input" data-role="cinematic-duration-input" type="number" min="4" max="180" step="1" placeholder="Duration" />
                                    <button class="otl-btn primary" data-act="cinematic-generate-plan">Generate Timeline</button>
                                    </div>
                                <div style="display:none;">
                                    <textarea class="otl-prompt-input" data-role="cinematic-simple-prompt"></textarea>
                                    <textarea class="otl-prompt-input" data-role="cinematic-planner-prompt"></textarea>
                                </div>
                                <div style="display:none;">
                                    <textarea data-role="cinematic-scene-input"></textarea>
                                    <textarea data-role="cinematic-story-input"></textarea>
                                    <input data-role="cinematic-style-input" />
                                </div>
                                <div class="otl-muted otl-cinematic-create-status" data-role="cinematic-workspace-status">Ready</div>
                            </div>
                        </div>
                        <div class="otl-cinematic-right">
                            <div class="otl-cinematic-middle">
                                <div class="otl-cinematic-pane map-pane">
                                    <div class="otl-cinematic-map-meta">
                                        <div class="otl-cinematic-section-title"><span>Map View</span></div>
                                    </div>
                                    <div class="otl-cinematic-map-split">
                                        <div class="otl-map-box otl-cinematic-map-box">
                                            <div class="otl-map-label">TopView (position + yaw)</div>
                                            <canvas width="260" height="146" data-role="cinematic-top-canvas"></canvas>
                                            <div class="otl-map-controls">
                                                <button class="otl-icon-btn" data-act="cinematic-top-zoom-in" title="Top Zoom In">+</button>
                                                <button class="otl-icon-btn" data-act="cinematic-top-zoom-out" title="Top Zoom Out">−</button>
                                                <button class="otl-icon-btn" data-act="cinematic-top-center" title="Center Top">◎</button>
                                            </div>
                                        </div>
                                        <div class="otl-map-box otl-cinematic-map-box">
                                            <div class="otl-map-label">FrontView (pitch)</div>
                                            <canvas width="260" height="146" data-role="cinematic-front-canvas"></canvas>
                                            <div class="otl-map-controls">
                                                <button class="otl-icon-btn" data-act="cinematic-front-zoom-in" title="Front Zoom In">+</button>
                                                <button class="otl-icon-btn" data-act="cinematic-front-zoom-out" title="Front Zoom Out">−</button>
                                                <button class="otl-icon-btn" data-act="cinematic-front-center" title="Center Front">◎</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="otl-cinematic-map-footer"><div class="otl-cinematic-map-actions"><div class="otl-cinematic-map-current" data-role="cinematic-current-kf-label">K1 (t=0.00s)</div><button class="otl-cinematic-route-toggle" data-act="cinematic-toggle-route" type="button">Route Off</button></div></div>
                                </div>
                                <div class="otl-cinematic-pane preview-pane">
                                    <div class="otl-cinematic-map-meta">
                                        <div class="otl-cinematic-section-title"><span>2D Preview</span></div>
                                    </div>
                                    <div class="otl-cinematic-preview-box">
                                        <div class="otl-cinematic-preview-wrap">
                                            <img data-role="cinematic-preview-image" alt="Current camera preview" />
                                        </div>
                                    </div>
                                    <div class="otl-cinematic-preview-footer-spacer" aria-hidden="true"></div>
                                </div>
                            </div>
                        </div>
                        <div class="otl-cinematic-bottom-dock">
                            <div class="otl-cinematic-pane timeline-pane">
                                <div class="otl-cinematic-timeline-frame">
                                    <div class="otl-cinematic-timeline" data-role="cinematic-timeline"></div>
                                </div>
                            </div>
                        </div>
                        <div class="otl-cinematic-editor-modal hidden" data-role="cinematic-keyframe-modal">
                            <div class="otl-cinematic-editor-panel">
                                <div class="otl-cinematic-prompt-head">
                                    <div class="otl-cinematic-keyframe-head-left">
                                        <div class="otl-cinematic-section-title" data-role="cinematic-keyframe-modal-title"><span>Key Frame</span></div>
                                    </div>
                                    <div class="otl-cinematic-subactions"><button class="otl-cinematic-icon-btn" data-act="cinematic-delete-keyframe" title="Delete Keyframe">${CSV_ICON_DELETE}</button><button class="otl-cinematic-icon-btn" data-act="cinematic-keyframe-editor-close" title="Close">${CSV_ICON_CLOSE}</button></div>
                                </div>
                                <div class="otl-cinematic-editor-body" data-role="cinematic-keyframe-editor-body"></div>
                            </div>
                        </div>
                        <div class="otl-cinematic-editor-modal hidden" data-role="cinematic-shot-modal">
                            <div class="otl-cinematic-editor-panel">
                                <div class="otl-cinematic-prompt-head">
                                    <div class="otl-cinematic-section-title"><span>${CINE_ICON_SLIDERS}</span><span>Shot</span></div>
                                    <div class="otl-cinematic-subactions"><button class="otl-cinematic-icon-btn" data-act="cinematic-delete-shot" title="Delete Shot">${CSV_ICON_DELETE}</button><button class="otl-cinematic-icon-btn" data-act="cinematic-shot-editor-close" title="Close">${CSV_ICON_CLOSE}</button></div>
                                </div>
                                <div class="otl-cinematic-editor-body" data-role="cinematic-shot-editor-body"></div>
                            </div>
                        </div>
                        <div class="otl-cine-record-modal hidden" data-role="cinematic-recording-modal">
                            <section class="otl-cine-record-section otl-cine-record-panel">
                                <div class="otl-cine-record-section-head">
                                    <div class="otl-cine-record-section-title">Recordings</div>
                                    <div class="otl-cine-record-section-actions">
                                        <button class="otl-cine-record-btn" type="button" data-record-modal="start" title="Start Recording"><span class="dot"></span><span>Rec</span></button>
                                        <div class="otl-cine-record-tool-group">
                                            <button class="otl-cinematic-icon-btn" type="button" data-record-popover-trigger="video" title="Video Settings">${CINE_ICON_MAP}</button>
                                            <section class="otl-cine-record-popover" data-record-popover="video">
                                                <div class="otl-cine-record-pop-head"><div class="otl-cinematic-section-title">Video</div><button class="otl-cine-record-pop-close" type="button" data-record-popover-close="video">×</button></div>
                                                <div class="otl-cine-record-row"><label>Frame Rate</label><select data-record="frame-rate"><option value="24" selected>24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div>
                                                <div class="otl-cine-record-row"><label>Quality</label><select data-record="quality"><option value="standard" selected>Standard 18 Mbps</option><option value="high">High 28 Mbps</option><option value="ultra">Ultra 40 Mbps</option></select></div>
                                                <div class="otl-cine-record-row"><label>MP4 Compression</label><select data-record="compression"><option value="original">Original</option><option value="fast_export">Fast Export</option><option value="balanced">Balanced</option><option value="archive_smallest">Archive Smallest</option><option value="target_10mb" selected>Target 10MB</option></select></div>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="auto-play" checked />Auto-start preview when recording begins</label>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="stop-with-playback" checked />Stop recording automatically when preview finishes</label>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="hide-panel" />Temporarily hide cinematic workspace during recording</label>
                                            </section>
                                        </div>
                                        <div class="otl-cine-record-tool-group">
                                            <button class="otl-cinematic-icon-btn" type="button" data-record-popover-trigger="audio" title="Audio Settings">${CINE_ICON_VOLUME}</button>
                                            <section class="otl-cine-record-popover" data-record-popover="audio">
                                                <div class="otl-cine-record-pop-head"><div class="otl-cinematic-section-title">Audio</div><button class="otl-cine-record-pop-close" type="button" data-record-popover-close="audio">×</button></div>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="include-tts" checked />Capture system TTS narration</label>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="disable-interrupts" checked />Disable timeline edits while recording</label>
                                                <div class="otl-cine-record-row"><label>Master Volume</label><div class="otl-cine-record-inline"><input type="range" min="0" max="100" value="100" data-record="master-volume" /><span data-record="master-volume-out">100%</span></div></div>
                                                <div class="otl-cine-record-row"><label>TTS Volume</label><div class="otl-cine-record-inline"><input type="range" min="0" max="100" value="100" data-record="tts-volume" /><span data-record="tts-volume-out">100%</span></div></div>
                                                <div class="otl-cine-record-row"><label>BGM Volume</label><div class="otl-cine-record-inline"><input type="range" min="0" max="100" value="50" data-record="bgm-volume" /><span data-record="bgm-volume-out">50%</span></div></div>
                                            </section>
                                        </div>
                                        <div class="otl-cine-record-tool-group">
                                            <button class="otl-cinematic-icon-btn" type="button" data-record-popover-trigger="subtitle" title="Subtitle Settings">${CINE_ICON_PROMPT}</button>
                                            <section class="otl-cine-record-popover" data-record-popover="subtitle">
                                                <div class="otl-cine-record-pop-head"><div class="otl-cinematic-section-title">Subtitles</div><button class="otl-cine-record-pop-close" type="button" data-record-popover-close="subtitle">×</button></div>
                                                <label class="otl-cine-record-check"><input type="checkbox" data-record="subtitles-enabled" checked />Burn subtitles into recording</label>
                                                <div class="otl-cine-record-row"><label>Font</label><select data-record="subtitle-font"><option value="PingFang SC" selected>PingFang SC Semibold</option><option value="Source Han Sans SC">Source Han Sans SC SemiBold</option><option value="Noto Sans SC">Noto Sans SC Medium</option></select></div>
                                                <div class="otl-cine-record-row"><label>Font Size</label><div class="otl-cine-record-inline"><input type="range" min="24" max="64" value="26" data-record="subtitle-size" /><span data-record="subtitle-size-out">26px</span></div></div>
                                                <div class="otl-cine-record-row"><label>Font Color</label><input type="color" value="#d7a733" data-record="subtitle-color" /></div>
                                            </section>
                                        </div>
                                        <div class="otl-cine-record-pagination">
                                            <button class="otl-cinematic-icon-btn otl-cine-record-page-btn" type="button" data-record="page-prev" title="Previous Page">&lt;</button>
                                            <div class="otl-cine-record-page-label" data-record="page-label">1 / 1</div>
                                            <button class="otl-cinematic-icon-btn otl-cine-record-page-btn" type="button" data-record="page-next" title="Next Page">&gt;</button>
                                        </div>
                                        <button class="otl-cinematic-icon-btn" type="button" data-record="sync-model-db" title="Sync MP4 to Model DB">${CINE_ICON_REFRESH}</button>
                                        <button class="otl-cinematic-icon-btn" type="button" data-record-modal="close" title="Close">${CSV_ICON_CLOSE}</button>
                                    </div>
                                </div>
                                <div class="otl-cine-record-content">
                                    <div class="otl-cine-record-grid" data-record="results"></div>
                                    <div class="otl-muted hidden" data-record="results-empty">No recordings yet.</div>
                                </div>
                                <div class="otl-cine-record-status-line"><div class="otl-muted" data-record="modal-status">Ready to record.</div></div>
                            </section>
                        </div>
                        <div class="otl-settings-modal hidden" data-role="cinematic-cw-csv-workspace-modal">
                            <div class="otl-csv-workspace-panel" data-role="cinematic-cw-csv-workspace-panel">
                                <div class="otl-step-head otl-csv-workspace-drag-handle" data-role="cinematic-cw-csv-workspace-drag-handle">
                                    <span class="otl-badge">CSV</span><span style="font-size:14px;font-weight:700;">CSV Workspace</span>
                                    <div class="otl-step-actions">
                                        <div class="otl-csv-toolbar">
                                            <button class="otl-icon-btn primary" data-act="cinematic-cw-csv-version-generate" title="生成新版本">${CSV_ICON_GENERATE}</button>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-version-save" title="保存当前版本">${CSV_ICON_SAVE}</button>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-version-save-new" title="另存为新版本">${CSV_ICON_SAVE_AS}</button>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-version-delete" title="删除当前版本">${CSV_ICON_DELETE}</button>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-version-download" title="下载 CSV">${CSV_ICON_DOWNLOAD}</button>
                                            <span class="otl-csv-toolbar-sep"></span>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-workspace-fullscreen" title="Fullscreen">${CSV_ICON_FULLSCREEN}</button>
                                            <button class="otl-icon-btn" data-act="cinematic-cw-csv-workspace-close" title="Close">${CSV_ICON_CLOSE}</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="otl-csv-workspace-grid">
                                    <div class="otl-csv-version-list" data-role="cinematic-cw-csv-version-list"></div>
                                    <div class="otl-csv-grid-wrap" data-role="cinematic-cw-csv-grid-wrap">
                                        <table class="otl-csv-grid" data-role="cinematic-cw-csv-grid-table"></table>
                                    </div>
                                    <textarea class="otl-csv-editor otl-hidden" data-role="cinematic-cw-csv-editor-input" placeholder="Generate or select a CSV version."></textarea>
                                </div>
                                <div class="otl-row" style="justify-content:space-between;">
                                    <div class="otl-muted" data-role="cinematic-cw-csv-workspace-status">Ready</div>
                                    <div class="otl-voice-pill otl-hidden" data-role="cinematic-cw-csv-voice-summary">固定声音: ${DEFAULT_TTS_VOICE}</div>
                                    <div class="otl-muted otl-hidden" data-role="cinematic-cw-csv-timing-summary">Timing: default generation</div>
                                </div>
                            </div>
                        </div>
                        <div class="otl-voice-modal hidden" data-role="cinematic-cw-csv-voice-modal">
                            <div class="otl-voice-panel">
                                <div class="otl-step-head"><span class="otl-badge">♪</span><span style="font-size:14px;font-weight:700;">Alibaba TTS Voices</span></div>
                                <label class="otl-check"><input type="checkbox" data-role="cinematic-cw-csv-voice-enabled" />启用多声音洗牌轮询</label>
                                <div class="otl-row">
                                    <label class="otl-muted" style="min-width:72px;">语音模型</label>
                                    <select class="otl-select" data-role="cinematic-cw-csv-voice-model">
                                        <option value="cosyvoice-v3-plus">高质量语音</option>
                                        <option value="cosyvoice-v3-flash">低延迟语音</option>
                                    </select>
                                </div>
                                <div class="otl-row">
                                    <label class="otl-muted" style="min-width:72px;">固定声音</label>
                                    <select class="otl-select" data-role="cinematic-cw-csv-voice-fixed"></select>
                                </div>
                                <div class="otl-muted">勾选多个声音后，生成 CSV 时会按洗牌轮询策略逐行写入 tts_voice。</div>
                                <div class="otl-voice-list" data-role="cinematic-cw-csv-voice-list"></div>
                                <div class="otl-row" style="justify-content:flex-end;">
                                    <button class="otl-btn primary" data-act="cinematic-cw-csv-voice-save">Done</button>
                                    <button class="otl-btn" data-act="cinematic-cw-csv-voice-close">Close</button>
                                </div>
                            </div>
                        </div>
                        <div class="otl-config-modal hidden" data-role="cinematic-cw-csv-timing-modal">
                            <div class="otl-config-panel">
                                <div class="otl-step-head"><span class="otl-badge">⏱</span><span style="font-size:14px;font-weight:700;">Tour Duration</span></div>
                                <label class="otl-check"><input type="checkbox" data-role="cinematic-cw-csv-timing-enabled" />启用总时长限制</label>
                                <div class="otl-row">
                                    <label class="otl-muted" style="min-width:88px;">目标时长</label>
                                    <input class="otl-input" data-role="cinematic-cw-csv-timing-input" type="number" min="5" max="900" step="1" value="30" />
                                    <div class="otl-muted">秒</div>
                                </div>
                                <div class="otl-config-stat"><span class="otl-muted">最短可达</span><strong data-role="cinematic-cw-csv-timing-minimum">尚未计算</strong></div>
                                <div class="otl-config-stat"><span class="otl-muted">预计总时长</span><strong data-role="cinematic-cw-csv-timing-estimated">尚未计算</strong></div>
                                <div class="otl-row" style="justify-content:flex-end;">
                                    <button class="otl-btn" data-act="cinematic-cw-csv-timing-estimate">Estimate</button>
                                    <button class="otl-btn primary" data-act="cinematic-cw-csv-timing-save">Done</button>
                                    <button class="otl-btn" data-act="cinematic-cw-csv-timing-close">Close</button>
                                </div>
                            </div>
                        </div>
                        <div class="otl-csv-content-modal hidden" data-role="cinematic-cw-csv-content-modal">
                            <div class="otl-csv-content-panel">
                                <div class="otl-step-head"><span class="otl-badge">✎</span><div data-role="cinematic-cw-csv-content-title">Edit content</div></div>
                                <textarea class="otl-csv-content-input" data-role="cinematic-cw-csv-content-input"></textarea>
                                <div class="otl-row" style="justify-content:flex-end;">
                                    <button class="otl-btn primary" data-act="cinematic-cw-csv-content-save">Save</button>
                                    <button class="otl-btn" data-act="cinematic-cw-csv-content-cancel">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="otl-cinematic-prompt-modal hidden" data-role="cinematic-simple-prompt-modal">
                <div class="otl-cinematic-prompt-panel">
                    <div class="otl-cinematic-prompt-head">
                        <div class="otl-cinematic-section-title"><span>${CINE_ICON_MAGIC}</span><span>Simple Prompt</span></div>
                        <button class="otl-cinematic-icon-btn" data-act="cinematic-simple-prompt-close" title="Close">${CSV_ICON_CLOSE}</button>
                    </div>
                    <div class="otl-cinematic-prompt-body">
                        <div class="otl-cinematic-prompt-versions" data-role="cinematic-simple-version-list"></div>
                        <div class="otl-cinematic-prompt-editor">
                            <textarea class="otl-cinematic-prompt-text" data-role="cinematic-simple-prompt-editor"></textarea>
                            <div class="otl-cinematic-prompt-footer">
                                <button class="otl-btn" data-act="cinematic-simple-prompt-cancel">Cancel</button>
                                <button class="otl-btn" data-act="cinematic-simple-prompt-update">Update Current</button>
                                <button class="otl-btn primary" data-act="cinematic-simple-prompt-save-new">Save as New Version</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="otl-cinematic-prompt-modal hidden" data-role="cinematic-poi-picker-modal">
                <div class="otl-cinematic-prompt-panel" style="max-width:420px;">
                    <div class="otl-cinematic-prompt-head">
                        <div class="otl-cinematic-section-title"><span>${CINE_ICON_LIST}</span><span>Select POIs</span></div>
                        <button class="otl-cinematic-icon-btn" data-act="cinematic-poi-picker-close" title="Close">${CSV_ICON_CLOSE}</button>
                    </div>
                        <div class="otl-cinematic-prompt-body" style="display:block;">
                        <div class="otl-cinematic-poi-items otl-cinematic-poi-picker-list" data-role="cinematic-poi-list"></div>
                            <div class="otl-cinematic-prompt-footer" style="margin-top:16px;">
                            <button class="otl-btn" data-act="cinematic-poi-picker-cancel">Cancel</button>
                            <button class="otl-btn primary" data-act="cinematic-poi-picker-save">Done</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="otl-cinematic-prompt-modal hidden" data-role="cinematic-complex-prompt-modal">
                <div class="otl-cinematic-prompt-panel">
                    <div class="otl-cinematic-prompt-head">
                        <div class="otl-cinematic-section-title"><span>${CINE_ICON_PROMPT}</span><span>Complex Prompt</span></div>
                        <button class="otl-cinematic-icon-btn" data-act="cinematic-complex-prompt-close" title="Close">${CSV_ICON_CLOSE}</button>
                    </div>
                    <div class="otl-cinematic-prompt-body">
                        <div class="otl-cinematic-prompt-versions" data-role="cinematic-complex-version-list"></div>
                        <div class="otl-cinematic-prompt-editor">
                            <textarea class="otl-cinematic-prompt-text" data-role="cinematic-complex-prompt-editor"></textarea>
                            <div class="otl-cinematic-prompt-footer">
                                <button class="otl-btn" data-act="cinematic-complex-prompt-cancel">Cancel</button>
                                <button class="otl-btn" data-act="cinematic-complex-prompt-update">Update Current</button>
                                <button class="otl-btn primary" data-act="cinematic-complex-prompt-save-new">Save as New Version</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="otl-cinematic-bgm-modal hidden" data-role="cinematic-bgm-modal">
                <div class="otl-cinematic-bgm-panel">
                    <div class="otl-cinematic-bgm-head">
                        <div class="otl-cinematic-section-title"><span>${CINE_ICON_MUSIC}</span><span>BGM Workflow</span></div>
                        <div class="otl-cinematic-bgm-head-actions">
                            <button class="otl-cinematic-icon-btn primary" type="button" data-act="cinematic-bgm-apply" title="Apply To Timeline">${CINE_ICON_MUSIC}</button>
                            <button class="otl-cinematic-icon-btn" type="button" data-act="cinematic-bgm-save" title="Save BGM">${CINE_ICON_SAVE}</button>
                            <button class="otl-cinematic-icon-btn danger" type="button" data-act="cinematic-bgm-delete" title="Delete BGM">${CSV_ICON_DELETE}</button>
                            <button class="otl-cinematic-icon-btn" data-act="cinematic-bgm-close" title="Close">${CSV_ICON_CLOSE}</button>
                        </div>
                    </div>
                    <div class="otl-cinematic-bgm-grid">
                        <div class="otl-cinematic-bgm-library">
                            <div class="otl-cinematic-bgm-list-head">
                                <div class="otl-cinematic-panel-title" style="margin-bottom:0;">Music Playlist</div>
                                <div class="otl-cinematic-subactions">
                                    <button class="otl-cinematic-icon-btn" type="button" data-act="cinematic-bgm-browse-folder" title="Load Folder">${CINE_ICON_FOLDER}</button>
                                    <button class="otl-cinematic-icon-btn" type="button" data-act="cinematic-bgm-browse-files" title="Load Files">${CINE_ICON_FILE_PLUS}</button>
                                </div>
                            </div>
                            <div class="otl-cinematic-bgm-toolbar">
                                <input class="otl-input" data-role="cinematic-bgm-search" type="search" placeholder="Search in library..." />
                            </div>
                            <input type="file" data-role="cinematic-bgm-folder-input" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*" webkitdirectory directory multiple style="display:none;" />
                            <input type="file" data-role="cinematic-bgm-file-input" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*" multiple style="display:none;" />
                            <input type="file" data-role="cinematic-media-file-input" accept=".mp4,.mov,.webm,.m4v,video/*" style="display:none;" />
                            <div class="otl-cinematic-bgm-list" data-role="cinematic-bgm-library"></div>
                        </div>
                        <div class="otl-cinematic-bgm-editor">
                            <div class="otl-cinematic-bgm-player">
                                <button class="otl-cinematic-icon-btn" type="button" data-act="cinematic-bgm-player-toggle" title="Play or Pause">${CINE_ICON_PLAY}</button>
                                <button class="otl-cinematic-icon-btn" type="button" data-act="cinematic-bgm-player-stop" title="Stop">${CINE_ICON_STOP}</button>
                                <select class="otl-select" data-role="cinematic-bgm-preview-rate">
                                    <option value="0.5">0.5x</option>
                                    <option value="0.75">0.75x</option>
                                    <option value="1" selected>1.0x</option>
                                    <option value="1.25">1.25x</option>
                                    <option value="1.5">1.5x</option>
                                </select>
                                <div class="otl-muted otl-cinematic-bgm-time" data-role="cinematic-bgm-time">0:00.00 / 0:00.00</div>
                            </div>
                            <input class="otl-cinematic-zoom-range otl-cinematic-bgm-progress-hidden" data-role="cinematic-bgm-progress" type="range" min="0" max="1000" step="1" value="0" />
                            <canvas class="otl-cinematic-bgm-wave" data-role="cinematic-bgm-wave" width="620" height="120"></canvas>
                            <div class="otl-cinematic-bgm-range">
                                <div class="otl-cinematic-field"><label>Start (s)</label><input class="otl-input" data-role="cinematic-bgm-start" type="number" min="0" step="0.01" value="0" /></div>
                                <div class="otl-cinematic-field"><label>End (s)</label><input class="otl-input" data-role="cinematic-bgm-end" type="number" min="0" step="0.01" value="0" /></div>
                                <div class="otl-cinematic-field"><label>Clip Duration (s)</label><div class="otl-muted" data-role="cinematic-bgm-clip-duration" style="padding-top:8px;">0.00s</div></div>
                                <button class="otl-btn" type="button" data-act="cinematic-bgm-play-clip">Play Clip</button>
                                <button class="otl-btn" type="button" data-act="cinematic-bgm-recommend">Recommend Phrase</button>
                            </div>
                            <div class="otl-cinematic-panel-title" style="margin:4px 0 0;">3) Rate / Target Duration</div>
                            <div class="otl-cinematic-bgm-params">
                                <div class="otl-cinematic-field"><label>Manual Rate (0.5~2)</label><input class="otl-input" data-role="cinematic-bgm-manual-rate" type="number" min="0.5" max="2" step="0.01" value="1" /></div>
                                <div class="otl-cinematic-field"><label>Target Duration (s)</label><input class="otl-input" data-role="cinematic-bgm-target-duration" type="number" min="0.2" step="0.01" placeholder="Optional" /></div>
                                <div class="otl-cinematic-field"><label>Effective Rate</label><div class="otl-muted" data-role="cinematic-bgm-effective-rate" style="padding-top:8px;">1.00x</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.topCanvas = this.root.querySelector('[data-map="top"]') as HTMLCanvasElement;
        this.frontCanvas = this.root.querySelector('[data-map="front"]') as HTMLCanvasElement;
        this.poiSelect = this.root.querySelector('[data-role="poi-select"]') as HTMLSelectElement;
        this.poiNameInput = this.root.querySelector('[data-role="poi-name"]') as HTMLInputElement;
        this.speedSelect = this.root.querySelector('[data-role="speed"]') as HTMLSelectElement;
        this.playbackSpeedSelect = this.root.querySelector('[data-role="cinematic-playback-speed"]') as HTMLSelectElement;
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
        this.cinematicCwCsvWorkspaceModal = this.root.querySelector('[data-role="cinematic-cw-csv-workspace-modal"]') as HTMLDivElement;
        this.cinematicCwCsvWorkspacePanel = this.root.querySelector('[data-role="cinematic-cw-csv-workspace-panel"]') as HTMLDivElement;
        this.cinematicCwCsvVersionListEl = this.root.querySelector('[data-role="cinematic-cw-csv-version-list"]') as HTMLDivElement;
        this.cinematicCwCsvGridWrapEl = this.root.querySelector('[data-role="cinematic-cw-csv-grid-wrap"]') as HTMLDivElement;
        this.cinematicCwCsvGridTableEl = this.root.querySelector('[data-role="cinematic-cw-csv-grid-table"]') as HTMLTableElement;
        this.cinematicCwCsvEditorInput = this.root.querySelector('[data-role="cinematic-cw-csv-editor-input"]') as HTMLTextAreaElement;
        this.cinematicCwCsvWorkspaceStatusEl = this.root.querySelector('[data-role="cinematic-cw-csv-workspace-status"]') as HTMLDivElement;
        this.cinematicCwCsvTimingSummaryEl = this.root.querySelector('[data-role="cinematic-cw-csv-timing-summary"]') as HTMLDivElement;
        this.cinematicCwCsvVoiceEnabledInput = this.root.querySelector('[data-role="cinematic-cw-csv-voice-enabled"]') as HTMLInputElement;
        this.cinematicCwCsvVoiceSummaryEl = this.root.querySelector('[data-role="cinematic-cw-csv-voice-summary"]') as HTMLDivElement;
        this.cinematicCwCsvTimingEnabledInput = this.root.querySelector('[data-role="cinematic-cw-csv-timing-enabled"]') as HTMLInputElement;
        this.cinematicCwCsvTimingInput = this.root.querySelector('[data-role="cinematic-cw-csv-timing-input"]') as HTMLInputElement;
        this.cinematicCwCsvTimingModal = this.root.querySelector('[data-role="cinematic-cw-csv-timing-modal"]') as HTMLDivElement;
        this.cinematicCwCsvTimingMinimumEl = this.root.querySelector('[data-role="cinematic-cw-csv-timing-minimum"]') as HTMLDivElement;
        this.cinematicCwCsvTimingEstimatedEl = this.root.querySelector('[data-role="cinematic-cw-csv-timing-estimated"]') as HTMLDivElement;
        this.cinematicCwCsvVoiceModal = this.root.querySelector('[data-role="cinematic-cw-csv-voice-modal"]') as HTMLDivElement;
        this.cinematicCwCsvVoiceModelSelect = this.root.querySelector('[data-role="cinematic-cw-csv-voice-model"]') as HTMLSelectElement;
        this.cinematicCwCsvVoiceFixedSelect = this.root.querySelector('[data-role="cinematic-cw-csv-voice-fixed"]') as HTMLSelectElement;
        this.cinematicCwCsvVoiceListEl = this.root.querySelector('[data-role="cinematic-cw-csv-voice-list"]') as HTMLDivElement;
        this.cinematicCwCsvContentModal = this.root.querySelector('[data-role="cinematic-cw-csv-content-modal"]') as HTMLDivElement;
        this.cinematicCwCsvContentTitleEl = this.root.querySelector('[data-role="cinematic-cw-csv-content-title"]') as HTMLDivElement;
        this.cinematicCwCsvContentInput = this.root.querySelector('[data-role="cinematic-cw-csv-content-input"]') as HTMLTextAreaElement;
        this.cinematicWorkspaceModal = this.root.querySelector('[data-role="cinematic-workspace-modal"]') as HTMLDivElement;
        this.cinematicWorkspacePanel = this.root.querySelector('[data-role="cinematic-workspace-panel"]') as HTMLDivElement;
        this.cinematicVersionListEl = this.root.querySelector('[data-role="cinematic-version-list"]') as HTMLDivElement;
        this.cinematicStatusEl = this.root.querySelector('[data-role="cinematic-workspace-status"]') as HTMLDivElement;
        this.cinematicPoiPickerModal = this.root.querySelector('[data-role="cinematic-poi-picker-modal"]') as HTMLDivElement;
        this.cinematicPoiListEl = this.root.querySelector('[data-role="cinematic-poi-list"]') as HTMLDivElement;
        this.cinematicTimelineEl = this.root.querySelector('[data-role="cinematic-timeline"]') as HTMLDivElement;
        this.cinematicKeyframeModal = this.root.querySelector('[data-role="cinematic-keyframe-modal"]') as HTMLDivElement;
        this.cinematicKeyframeEditorBodyEl = this.root.querySelector('[data-role="cinematic-keyframe-editor-body"]') as HTMLDivElement;
        this.cinematicShotModal = this.root.querySelector('[data-role="cinematic-shot-modal"]') as HTMLDivElement;
        this.cinematicShotEditorBodyEl = this.root.querySelector('[data-role="cinematic-shot-editor-body"]') as HTMLDivElement;
        this.cinematicTopCanvas = this.root.querySelector('[data-role="cinematic-top-canvas"]') as HTMLCanvasElement;
        this.cinematicFrontCanvas = this.root.querySelector('[data-role="cinematic-front-canvas"]') as HTMLCanvasElement;
        this.cinematicPreviewImageEl = this.root.querySelector('[data-role="cinematic-preview-image"]') as HTMLImageElement;
        this.cinematicCurrentKfLabelEl = this.root.querySelector('[data-role="cinematic-current-kf-label"]') as HTMLDivElement;
        this.cinematicSimplePromptInput = this.root.querySelector('[data-role="cinematic-simple-prompt"]') as HTMLTextAreaElement;
        this.cinematicPlannerPromptInput = this.root.querySelector('[data-role="cinematic-planner-prompt"]') as HTMLTextAreaElement;
        this.cinematicSceneInput = this.root.querySelector('[data-role="cinematic-scene-input"]') as HTMLTextAreaElement;
        this.cinematicStoryInput = this.root.querySelector('[data-role="cinematic-story-input"]') as HTMLTextAreaElement;
        this.cinematicStyleInput = this.root.querySelector('[data-role="cinematic-style-input"]') as HTMLInputElement;
        this.cinematicDurationInput = this.root.querySelector('[data-role="cinematic-duration-input"]') as HTMLInputElement;
        this.cinematicMiniToggleBtn = this.root.querySelector('[data-act="cinematic-mini-mode"]') as HTMLButtonElement;
        this.cinematicMiniPlayBtn = this.root.querySelector('.otl-cinematic-mini [data-act="cinematic-preview-toggle"]') as HTMLButtonElement;
        this.cinematicMiniTimelineEl = this.root.querySelector('[data-role="cinematic-mini-timeline"]') as HTMLDivElement;
        this.cinematicMiniTimeEl = this.root.querySelector('[data-role="cinematic-mini-time"]') as HTMLDivElement;
        this.cinematicSimplePromptModal = this.root.querySelector('[data-role="cinematic-simple-prompt-modal"]') as HTMLDivElement;
        this.cinematicComplexPromptModal = this.root.querySelector('[data-role="cinematic-complex-prompt-modal"]') as HTMLDivElement;
        this.cinematicSimpleVersionListEl = this.root.querySelector('[data-role="cinematic-simple-version-list"]') as HTMLDivElement;
        this.cinematicComplexVersionListEl = this.root.querySelector('[data-role="cinematic-complex-version-list"]') as HTMLDivElement;
        this.cinematicSimplePromptEditor = this.root.querySelector('[data-role="cinematic-simple-prompt-editor"]') as HTMLTextAreaElement;
        this.cinematicComplexPromptEditor = this.root.querySelector('[data-role="cinematic-complex-prompt-editor"]') as HTMLTextAreaElement;
        this.cinematicBgmModal = this.root.querySelector('[data-role="cinematic-bgm-modal"]') as HTMLDivElement;
        this.cinematicBgmSearchInput = this.root.querySelector('[data-role="cinematic-bgm-search"]') as HTMLInputElement;
        this.cinematicBgmLibraryEl = this.root.querySelector('[data-role="cinematic-bgm-library"]') as HTMLDivElement;
        this.cinematicBgmFolderInput = this.root.querySelector('[data-role="cinematic-bgm-folder-input"]') as HTMLInputElement;
        this.cinematicBgmFileInput = this.root.querySelector('[data-role="cinematic-bgm-file-input"]') as HTMLInputElement;
        this.cinematicMediaFileInput = this.root.querySelector('[data-role="cinematic-media-file-input"]') as HTMLInputElement;
        this.cinematicBgmPlayerBtn = this.root.querySelector('[data-act="cinematic-bgm-player-toggle"]') as HTMLButtonElement;
        this.cinematicBgmProgressInput = this.root.querySelector('[data-role="cinematic-bgm-progress"]') as HTMLInputElement;
        this.cinematicBgmTimeEl = this.root.querySelector('[data-role="cinematic-bgm-time"]') as HTMLDivElement;
        this.cinematicBgmRateInput = this.root.querySelector('[data-role="cinematic-bgm-preview-rate"]') as HTMLSelectElement;
        this.cinematicBgmWaveCanvas = this.root.querySelector('[data-role="cinematic-bgm-wave"]') as HTMLCanvasElement;
        this.cinematicBgmStartInput = this.root.querySelector('[data-role="cinematic-bgm-start"]') as HTMLInputElement;
        this.cinematicBgmEndInput = this.root.querySelector('[data-role="cinematic-bgm-end"]') as HTMLInputElement;
        this.cinematicBgmClipDurationEl = this.root.querySelector('[data-role="cinematic-bgm-clip-duration"]') as HTMLDivElement;
        this.cinematicBgmClipPlayBtn = this.root.querySelector('[data-act="cinematic-bgm-play-clip"]') as HTMLButtonElement;
        this.cinematicBgmRecommendBtn = this.root.querySelector('[data-act="cinematic-bgm-recommend"]') as HTMLButtonElement;
        this.cinematicBgmManualRateInput = this.root.querySelector('[data-role="cinematic-bgm-manual-rate"]') as HTMLInputElement;
        this.cinematicBgmTargetDurationInput = this.root.querySelector('[data-role="cinematic-bgm-target-duration"]') as HTMLInputElement;
        this.cinematicBgmEffectiveRateEl = this.root.querySelector('[data-role="cinematic-bgm-effective-rate"]') as HTMLDivElement;
        this.cinematicRecordingModalEl = this.root.querySelector('[data-role="cinematic-recording-modal"]') as HTMLDivElement;
        this.cinematicRecordBtn = this.root.querySelector('[data-act="cinematic-record-open"]') as HTMLButtonElement;
        this.cinematicRecordPauseBtn = this.root.querySelector('[data-act="cinematic-record-pause"]') as HTMLButtonElement | null;
        this.cinematicRecordStopBtn = this.root.querySelector('[data-act="cinematic-record-stop"]') as HTMLButtonElement | null;
        this.cinematicRecordTimerEl = this.root.querySelector('[data-role="cinematic-record-timer"]') as HTMLSpanElement;
        this.cinematicRecordingModalStatusEl = this.root.querySelector('[data-record="modal-status"]') as HTMLDivElement;
        this.cinematicRecordingFrameRateSelect = this.root.querySelector('[data-record="frame-rate"]') as HTMLSelectElement;
        this.cinematicRecordingQualitySelect = this.root.querySelector('[data-record="quality"]') as HTMLSelectElement;
        this.cinematicRecordingCompressionSelect = this.root.querySelector('[data-record="compression"]') as HTMLSelectElement;
        this.cinematicRecordingIncludeTtsInput = this.root.querySelector('[data-record="include-tts"]') as HTMLInputElement;
        this.cinematicRecordingAutoPlayInput = this.root.querySelector('[data-record="auto-play"]') as HTMLInputElement;
        this.cinematicRecordingStopWithPlaybackInput = this.root.querySelector('[data-record="stop-with-playback"]') as HTMLInputElement;
        this.cinematicRecordingHidePanelInput = this.root.querySelector('[data-record="hide-panel"]') as HTMLInputElement;
        this.cinematicRecordingDisableInterruptsInput = this.root.querySelector('[data-record="disable-interrupts"]') as HTMLInputElement;
        this.cinematicRecordingMasterVolumeInput = this.root.querySelector('[data-record="master-volume"]') as HTMLInputElement;
        this.cinematicRecordingTtsVolumeInput = this.root.querySelector('[data-record="tts-volume"]') as HTMLInputElement;
        this.cinematicRecordingBgmVolumeInput = this.root.querySelector('[data-record="bgm-volume"]') as HTMLInputElement;
        this.cinematicRecordingSubtitlesEnabledInput = this.root.querySelector('[data-record="subtitles-enabled"]') as HTMLInputElement;
        this.cinematicRecordingSubtitleFontSelect = this.root.querySelector('[data-record="subtitle-font"]') as HTMLSelectElement;
        this.cinematicRecordingSubtitleSizeInput = this.root.querySelector('[data-record="subtitle-size"]') as HTMLInputElement;
        this.cinematicRecordingSubtitleColorInput = this.root.querySelector('[data-record="subtitle-color"]') as HTMLInputElement;
        this.cinematicRecordingMasterVolumeOut = this.root.querySelector('[data-record="master-volume-out"]') as HTMLSpanElement;
        this.cinematicRecordingTtsVolumeOut = this.root.querySelector('[data-record="tts-volume-out"]') as HTMLSpanElement;
        this.cinematicRecordingBgmVolumeOut = this.root.querySelector('[data-record="bgm-volume-out"]') as HTMLSpanElement;
        this.cinematicRecordingSubtitleSizeOut = this.root.querySelector('[data-record="subtitle-size-out"]') as HTMLSpanElement;
        this.cinematicRecordingResultsEl = this.root.querySelector('[data-record="results"]') as HTMLDivElement;
        this.cinematicRecordingResultsEmptyEl = this.root.querySelector('[data-record="results-empty"]') as HTMLDivElement;
        this.cinematicRecordingSyncToModelDbBtn = this.root.querySelector('[data-record="sync-model-db"]') as HTMLButtonElement;
        this.cinematicRecordingPagePrevBtn = this.root.querySelector('[data-record="page-prev"]') as HTMLButtonElement;
        this.cinematicRecordingPageNextBtn = this.root.querySelector('[data-record="page-next"]') as HTMLButtonElement;
        this.cinematicRecordingPageLabelEl = this.root.querySelector('[data-record="page-label"]') as HTMLDivElement;
        this.stopBtn = this.root.querySelector('[data-act="play-stop"]') as HTMLButtonElement;
        this.playToggleBtn = this.root.querySelector('[data-act="play-toggle"]') as HTMLButtonElement;
        this.globalSaveBtn = this.root.querySelector('[data-act="save-all-pois"]') as HTMLButtonElement;

        this.populateSelect(this.geminiModelInput, GEMINI_MODELS);
        this.populateSelect(this.qwenModelInput, QWEN_MODELS);
        this.csvVoiceConfig = normalizeCsvVoiceConfig(this.csvVoiceConfig);
        this.csvTimingConfig = normalizeCsvTimingConfig(this.csvTimingConfig);
        this.renderCsvVoiceConfig();
        this.renderCsvTimingConfig();
        this.cinematicCwCsvVoiceConfig = normalizeCsvVoiceConfig(this.csvVoiceConfig);
        this.cinematicCwCsvTimingConfig = normalizeCsvTimingConfig(this.csvTimingConfig);
        this.renderCinematicCwCsvVoiceConfig();
        this.renderCinematicCwCsvTimingConfig();
        this.cinematicSimplePromptInput.value = this.cinematicSimplePrompt;
        this.cinematicPlannerPromptInput.value = this.cinematicPlannerPrompt;
        this.cinematicSimplePromptEditor.value = this.cinematicSimplePrompt;
        this.cinematicComplexPromptEditor.value = this.cinematicPlannerPrompt;
        this.cinematicSceneInput.value = this.cinematicSceneDescription;
        this.cinematicStoryInput.value = this.cinematicStoryBackground;
        this.cinematicStyleInput.value = this.cinematicStyleText;
        this.cinematicDurationInput.value = String(this.cinematicTargetDurationSec);
        this.syncCinematicChrome();
        this.syncCinematicRecordingForm();
        this.renderCinematicRecordingResults();
        this.refreshCinematicRecordingButtons();

        document.body.appendChild(this.root);
        this.bindEvents();
        this.refreshPlaybackUi();
        this.setModelReady(false);
        const initialModelFilename = this.options.getModelFilename();
        if (initialModelFilename) {
            this.modelFilename = initialModelFilename;
            this.setModelReady(true);
        }
        if (this.options.onModelLoaded) {
            this.unsubscribeModelLoaded = this.options.onModelLoaded((modelFilename) => {
                this.modelFilename = modelFilename;
                this.setModelReady(Boolean(modelFilename));
                if (modelFilename && !this.root.classList.contains('hidden')) {
                    void this.reload();
                }
            });
        }
        this.logDebug('system', 'panel initialized');
        void this.loadCinematicRecordingResults();
    }

    open() {
        this.modelFilename = this.options.getModelFilename();
        this.setModelReady(Boolean(this.modelFilename));
        this.cinematicHideRootOnClose = false;
        this.root.classList.remove('cinematic-only');
        this.root.classList.remove('hidden');
        this.startLiveDrawLoop();
        void this.reload();
    }

    async openCinematicWorkspace() {
        this.modelFilename = this.options.getModelFilename();
        this.setModelReady(Boolean(this.modelFilename));
        if (!this.requireModel()) return;
        this.cinematicHideRootOnClose = this.root.classList.contains('hidden');
        this.root.classList.remove('hidden');
        this.root.classList.add('cinematic-only');
        this.attachCsvVoiceModalToCurrentWorkspace(true);
        this.attachCsvTimingModalToCurrentWorkspace(true);
        this.cinematicWorkspaceModal.classList.remove('hidden');
        this.cinematicWorkspacePanel.classList.toggle('fullscreen', this.cinematicWorkspaceFullscreen);
        if (this.cinematicWorkspaceFullscreen) {
            this.cinematicWorkspacePanel.classList.remove('floating');
            this.cinematicWorkspacePanel.style.left = '';
            this.cinematicWorkspacePanel.style.top = '';
        } else if (this.cinematicWorkspaceFloatPos.initialized) {
            this.pinCinematicWorkspacePanel();
        } else {
            this.cinematicWorkspacePanel.classList.remove('floating');
            this.cinematicWorkspacePanel.style.left = '';
            this.cinematicWorkspacePanel.style.top = '';
        }
        this.startLiveDrawLoop();
        this.syncCinematicChrome();
        this.refreshCinematicRecordingButtons();
        await this.reload();
        this.syncCinematicInputsFromState();
        this.cinematicSelectedPoiIds = this.cinematicSelectedPoiIds.length > 0 ? this.cinematicSelectedPoiIds : this.pois.slice(0, 4).map((poi) => poi.poiId);
        this.refreshCinematicUi();
        this.setCinematicStatus('Loading cinematic versions...');
        await this.loadCinematicVersionList();
        this.setCinematicStatus('Ready');
    }

    closeCinematicWorkspace() {
        if (this.activeCinematicRecording) {
            void this.stopCinematicRecording(true, 'workspace-close');
        }
        this.cancelCinematicMediaPick();
        this.cancelCinematicMediaResize();
        this.closeCinematicMediaEditor();
        this.cinematicWorkspaceModal.classList.add('hidden');
        this.cinematicRecordingModalEl.classList.add('hidden');
        this.cinematicCwCsvWorkspaceModal.classList.add('hidden');
        this.cinematicCwCsvVoiceModal.classList.add('hidden');
        this.cinematicCwCsvTimingModal.classList.add('hidden');
        this.cinematicCwCsvContentModal.classList.add('hidden');
        this.cinematicSimplePromptModal.classList.add('hidden');
        this.cinematicComplexPromptModal.classList.add('hidden');
        this.cinematicPoiPickerModal.classList.add('hidden');
        this.closeCinematicBgmModal();
        this.closeCinematicEditors();
        this.csvVoiceModal.classList.add('hidden');
        this.csvTimingModal.classList.add('hidden');
        this.attachCsvVoiceModalToCurrentWorkspace(false);
        this.attachCsvTimingModalToCurrentWorkspace(false);
        this.closeCinematicEventStream();
        this.stopCinematicSpeechPreview();
        this.stopCinematicPreview();
        this.cinematicMiniMode = false;
        this.syncCinematicChrome();
        this.cinematicWorkspaceDrag = { active: false, dragging: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
        this.options.showEmbeddedMedia?.(null);
        this.root.classList.remove('cinematic-only');
        if (this.cinematicHideRootOnClose) {
            this.root.classList.add('hidden');
        }
        this.cinematicHideRootOnClose = false;
        this.drawViews();
        if (this.root.classList.contains('hidden')) this.stopLiveDrawLoop();
    }

    close() {
        if (this.activeCinematicRecording) {
            void this.stopCinematicRecording(true, 'panel-close');
        }
        this.cancelCinematicMediaPick();
        this.cancelCinematicMediaResize();
        this.closeCinematicMediaEditor();
        this.cinematicHideRootOnClose = false;
        this.root.classList.remove('cinematic-only');
        this.root.classList.add('hidden');
        this.closeCinematicEditors();
        this.closeCinematicEventStream();
        this.stopCinematicSpeechPreview();
        this.settingsModal.classList.add('hidden');
        this.batchModal.classList.add('hidden');
        this.llmPopover.classList.add('hidden');
        this.promptModal.classList.add('hidden');
        this.csvPromptModal.classList.add('hidden');
        this.movePromptModal.classList.add('hidden');
        this.csvWorkspaceModal.classList.add('hidden');
        this.csvContentModal.classList.add('hidden');
        this.cinematicRecordingModalEl.classList.add('hidden');
        this.closeCinematicBgmModal();
        this.stopPlayback();
        this.hotspotController.closePresentations();
        this.closeCsvExportEventStream();
        if (this.cinematicWorkspaceModal.classList.contains('hidden')) this.stopLiveDrawLoop();
    }

    toggle() {
        if (this.root.classList.contains('hidden')) this.open(); else this.close();
    }

    private apiBase() {
        return this.options.apiBaseUrl || '/api/ot-cinematic-workspace';
    }

    private resolveAsset(value: string) {
        const raw = String(value || '').trim();
        if (!raw) return raw;
        if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
        if (this.options.resolveAssetUrl) {
            try {
                return this.options.resolveAssetUrl(raw);
            } catch {
                return raw;
            }
        }
        return raw;
    }

    private recordingApiBase() {
        return '/api/ot-tour-player';
    }

    private producerApiBase() {
        return '/api/ot-tour-producer';
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
        const line = `[${new Date().toISOString()}] [OT_CinematicWorkspace] ${scope}: ${text}`;
        const w = window as Window & {
            __otStep3Debug?: Record<string, Array<{ ts: number; text: string }>>;
        };
        if (!w.__otStep3Debug) w.__otStep3Debug = {};
        if (!w.__otStep3Debug.otCinematicWorkspace) w.__otStep3Debug.otCinematicWorkspace = [];
        w.__otStep3Debug.otCinematicWorkspace.push({ ts: Date.now(), text: line });
        if (w.__otStep3Debug.otCinematicWorkspace.length > 400) {
            w.__otStep3Debug.otCinematicWorkspace.splice(0, w.__otStep3Debug.otCinematicWorkspace.length - 400);
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
            promptUpdatedAt: poi.promptUpdatedAt ? String(poi.promptUpdatedAt) : undefined,
            hotspots: Array.isArray(poi.hotspots) ? poi.hotspots.map((item, hotspotIdx) => normalizeHotspot(item, hotspotIdx)) : []
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
            promptTemplate: DEFAULT_PROMPT_TEMPLATE,
            hotspots: []
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

    private projectTopForCanvas(canvas: HTMLCanvasElement, x: number, z: number) {
        const b = this.topBounds;
        const w = canvas.width;
        const h = canvas.height;
        const nx = (x - b.xMin) / Math.max(1e-6, b.xMax - b.xMin);
        const ny = ((-z) - b.yMin) / Math.max(1e-6, b.yMax - b.yMin);
        const baseX = nx * w;
        const baseY = h - ny * h;
        return {
            x: (baseX - w * 0.5) * this.topView.zoom + w * 0.5 + this.topView.offsetX,
            y: (baseY - h * 0.5) * this.topView.zoom + h * 0.5 + this.topView.offsetY
        };
    }

    private projectTop(x: number, z: number) {
        return this.projectTopForCanvas(this.topCanvas, x, z);
    }

    private unprojectTopForCanvas(canvas: HTMLCanvasElement, cx: number, cy: number) {
        const b = this.topBounds;
        const w = canvas.width;
        const h = canvas.height;
        const baseX = (cx - this.topView.offsetX - w * 0.5) / this.topView.zoom + w * 0.5;
        const baseY = (cy - this.topView.offsetY - h * 0.5) / this.topView.zoom + h * 0.5;
        const nx = clamp(baseX / w, 0, 1);
        const ny = clamp(1 - baseY / h, 0, 1);
        return {
            x: b.xMin + nx * (b.xMax - b.xMin),
            z: -(b.yMin + ny * (b.yMax - b.yMin))
        };
    }

    private unprojectTop(cx: number, cy: number) {
        return this.unprojectTopForCanvas(this.topCanvas, cx, cy);
    }

    private poiEyeY(poi: TourPoi) {
        return poi.targetY + this.eyeHeightM;
    }

    private projectFrontForCanvas(canvas: HTMLCanvasElement, x: number, y: number) {
        const b = this.frontBounds;
        const w = canvas.width;
        const h = canvas.height;
        const nx = (x - b.xMin) / Math.max(1e-6, b.xMax - b.xMin);
        const ny = (y - b.yMin) / Math.max(1e-6, b.yMax - b.yMin);
        const baseX = nx * w;
        const baseY = h - ny * h;
        return {
            x: (baseX - w * 0.5) * this.frontView.zoom + w * 0.5 + this.frontView.offsetX,
            y: (baseY - h * 0.5) * this.frontView.zoom + h * 0.5 + this.frontView.offsetY
        };
    }

    private projectFront(x: number, y: number) {
        return this.projectFrontForCanvas(this.frontCanvas, x, y);
    }

    private unprojectFrontForCanvas(canvas: HTMLCanvasElement, cx: number, cy: number) {
        const b = this.frontBounds;
        const w = canvas.width;
        const h = canvas.height;
        const baseX = (cx - this.frontView.offsetX - w * 0.5) / this.frontView.zoom + w * 0.5;
        const baseY = (cy - this.frontView.offsetY - h * 0.5) / this.frontView.zoom + h * 0.5;
        const nx = clamp(baseX / w, 0, 1);
        const ny = clamp(1 - baseY / h, 0, 1);
        return {
            x: b.xMin + nx * (b.xMax - b.xMin),
            y: b.yMin + ny * (b.yMax - b.yMin)
        };
    }

    private unprojectFront(cx: number, cy: number) {
        return this.unprojectFrontForCanvas(this.frontCanvas, cx, cy);
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

        if (this.cinematicWorkspaceOpen() && this.cinematicPlan?.shots?.length) {
            const keyframes = this.cinematicPlan.shots.flatMap((shot) => shot.keyframes.map((kf) => ({ ...kf, shotLabel: shot.label })));
            if (keyframes.length > 1) {
                topCtx.beginPath();
                keyframes.forEach((kf, idx) => {
                    const p = this.projectTop(kf.x, kf.z);
                    if (idx === 0) topCtx.moveTo(p.x, p.y);
                    else topCtx.lineTo(p.x, p.y);
                });
                topCtx.strokeStyle = 'rgba(244, 114, 182, 0.72)';
                topCtx.lineWidth = 2;
                topCtx.stroke();

                frontCtx.beginPath();
                keyframes.forEach((kf, idx) => {
                    const p = this.projectFront(kf.x, kf.y + this.eyeHeightM);
                    if (idx === 0) frontCtx.moveTo(p.x, p.y);
                    else frontCtx.lineTo(p.x, p.y);
                });
                frontCtx.strokeStyle = 'rgba(244, 114, 182, 0.72)';
                frontCtx.lineWidth = 2;
                frontCtx.stroke();
            }
            keyframes.forEach((kf) => {
                const active = kf.keyframeId === this.selectedCinematicKeyframeId;
                const tp = this.projectTop(kf.x, kf.z);
                topCtx.beginPath();
                topCtx.arc(tp.x, tp.y, active ? 6.5 : 4, 0, Math.PI * 2);
                topCtx.fillStyle = active ? '#f472b6' : 'rgba(250, 204, 21, 0.92)';
                topCtx.fill();
                const yawR = degToRad(kf.yaw);
                const hx = tp.x + Math.sin(yawR) * 22;
                const hy = tp.y + Math.cos(yawR) * 22;
                topCtx.beginPath();
                topCtx.moveTo(tp.x, tp.y);
                topCtx.lineTo(hx, hy);
                topCtx.strokeStyle = active ? '#f472b6' : 'rgba(250, 204, 21, 0.72)';
                topCtx.lineWidth = 2;
                topCtx.stroke();

                const fp = this.projectFront(kf.x, kf.y + this.eyeHeightM);
                frontCtx.beginPath();
                frontCtx.arc(fp.x, fp.y, active ? 6.5 : 4, 0, Math.PI * 2);
                frontCtx.fillStyle = active ? '#f472b6' : 'rgba(250, 204, 21, 0.92)';
                frontCtx.fill();
                const pR = degToRad(kf.pitch);
                const phx = fp.x + Math.cos(pR) * 20;
                const phy = fp.y - Math.sin(pR) * 20;
                frontCtx.beginPath();
                frontCtx.moveTo(fp.x, fp.y);
                frontCtx.lineTo(phx, phy);
                frontCtx.strokeStyle = active ? '#f472b6' : 'rgba(250, 204, 21, 0.72)';
                frontCtx.lineWidth = 2;
                frontCtx.stroke();
            });
        }

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
                const hotspotCount = Array.isArray(poi.hotspots) ? poi.hotspots.length : 0;
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
                            <button class="otl-poi-icon" data-act="edit-hotspots" data-poi-id="${poi.poiId}" title="Edit Hotspots">◎</button>
                            <button class="otl-poi-icon" data-act="save-poi-row" data-poi-id="${poi.poiId}" title="Save">💾</button>
                            <button class="otl-poi-icon" data-act="delete-image" data-poi-id="${poi.poiId}" title="Delete Image">🖼</button>
                            <button class="otl-poi-icon danger" data-act="delete-poi-inline" data-poi-id="${poi.poiId}" title="Delete POI">🗑</button>
                        </div>
                    </div>
                    <div class="otl-poi-row-bottom">
                        <img class="otl-poi-preview ${hasImage ? '' : 'placeholder'}" src="${previewSrc}" alt="${poi.poiName}" />
                        <div class="otl-poi-content-wrap">
                            <div class="otl-muted" style="margin-bottom:6px;">Hotspots: ${hotspotCount}</div>
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
        this.hotspotController.activatePoi(this.selectedPoiId);
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
            this.hotspotController.activatePoi(null);
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
            this.hotspotController.activatePoi(this.selectedPoiId);
            this.setStatus(this.pois.length > 0 ? `Loaded ${this.pois.length} POIs` : 'No saved POIs');
            this.logDebug('load', `state loaded for ${this.modelFilename}`);
        } catch (error) {
            this.logDebug('error', `load failed: ${String(error)}`);
            this.pois = [];
            this.selectedPoiId = null;
            this.refreshPoiControls();
            this.hotspotController.activatePoi(null);
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
        this.hotspotController.activatePoi(null);
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
                this.hotspotController.activatePoi(onlyPoi.poiId, { playback: true });
                this.playback.rafId = window.requestAnimationFrame(tick);
                return;
            }

            if (this.playback.dwellUntilMs > now) {
                const currentPoi = list[this.playback.index % list.length];
                void this.options.setLiveCameraPose?.(this.currentCameraTargetFromPoi(currentPoi), clampFov(currentPoi.targetFov, DEFAULT_POI_FOV));
                this.hotspotController.activatePoi(currentPoi.poiId, { playback: true });
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
                this.hotspotController.activatePoi(arrived.poiId, { playback: true });
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
        const firstPoi = this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
        this.hotspotController.activatePoi(firstPoi?.poiId || null, { playback: true });
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

    private closeCinematicEventStream() {
        if (this.cinematicEventSource) {
            this.cinematicEventSource.close();
            this.cinematicEventSource = null;
        }
    }

    private streamCinematicJob(jobId: string, kind: 'prompt' | 'timeline') {
        this.closeCinematicEventStream();
        return new Promise<any>((resolve, reject) => {
            const es = new EventSource(`${this.apiBase()}/cinematic/jobs/${encodeURIComponent(jobId)}/events`);
            this.cinematicEventSource = es;
            let sseTimeout = 0;
            let firstEventReceived = false;
            const timeoutMs = () => (firstEventReceived ? 30000 : 45000);
            const resetSseTimeout = () => {
                if (sseTimeout) window.clearTimeout(sseTimeout);
                sseTimeout = window.setTimeout(() => {
                    const wait = timeoutMs();
                    this.logDebug(`cine.${kind}.stream`, firstEventReceived
                        ? `SSE timeout: no events for ${wait}ms (jobId=${jobId})`
                        : `SSE waiting first event > ${wait}ms (jobId=${jobId})`);
                }, timeoutMs());
            };
            resetSseTimeout();
            const finish = (result?: any, error?: any) => {
                if (sseTimeout) window.clearTimeout(sseTimeout);
                this.closeCinematicEventStream();
                if (error) reject(error);
                else resolve(result);
            };
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
            on('job.started', (p) => this.logDebug(`cine.${kind}.job`, `started jobId=${p.jobId || jobId} model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'}`));
            on('prompt.input', (p) => this.logDebug('cine.prompt.input', `simplePromptChars=${p.promptChars ?? '-'} prompt="${this.debugText(String(p.simplePrompt || ''), 1200)}"`));
            on('timeline.payload.summary', (p) => this.logDebug('cine.timeline.payload', `duration=${p.targetDurationSec ?? '-'} poiCount=${p.poiCount ?? '-'} imageCount=${p.imageCount ?? '-'} bbox=${this.debugText(JSON.stringify(p.boundingBox || {}, null, 2), 2400)}`));
            on('timeline.payload.poi', (p) => this.logDebug('cine.timeline.poi', `index=${p.index ?? '-'} poiId=${p.poiId || '-'} name=${p.poiName || '-'} pos=(${p.targetX}, ${p.targetY}, ${p.targetZ}) yaw=${p.targetYaw} pitch=${p.targetPitch} imageBytes=${p.imageBytes ?? 0} imageMime=${p.imageMime || '-'} imageSha256=${p.imageSha256 || '-'} content="${this.debugText(String(p.content || ''), 1000)}"`));
            on('timeline.prompt', (p) => this.logDebug('cine.timeline.prompt', `promptChars=${p.promptChars ?? '-'} prompt="${this.debugText(String(p.prompt || ''), 4000)}"`));
            on('timeline.media.detected', (p) => this.logDebug('cine.timeline.media', `requested=${Boolean(p.requested)} orbitLike=${Boolean(p.orbitLike)} promptPreview="${this.debugText(String(p.promptPreview || ''), 240)}"`));
            on('timeline.media.enriched', (p) => this.logDebug('cine.timeline.media', `totalMediaKeyframes=${p.totalMediaKeyframes ?? 0} placeholderKeyframes=${p.placeholderKeyframes ?? 0}`));
            on('api.call', (p) => this.logDebug(`cine.${kind}.api.call`, `model=${p.llmModel || '-'} endpoint=${p.apiEndpoint || '-'} promptChars=${p.promptChars ?? '-'} imageCount=${p.imageCount ?? '-'} hasApiKey=${p.hasApiKey}`));
            on('api.request.raw', (p) => this.logDebug(`cine.${kind}.api.request.raw`, `provider=${p.provider || '-'} imageCount=${p.imageCount ?? '-'} requestJson=${this.debugText(JSON.stringify(p.requestJson || {}, null, 2), 12000)}`));
            on('api.chunk', (p) => this.logDebug(`cine.${kind}.chunk`, `idx=${p.chunkIndex ?? '-'} chunkChars=${p.chunkChars ?? '-'} totalChars=${p.contentCharsSoFar ?? '-'} chunk="${this.debugText(String(p.chunk?.text || p.chunk || ''), 260)}"`));
            on('api.response.raw', (p) => this.logDebug(`cine.${kind}.api.response.raw`, `frame=${p.frameIndex ?? '-'} rawJson=${this.debugText(String(p.rawJson || ''), 12000)}`));
            on('api.response', (p) => this.logDebug(`cine.${kind}.api.response`, `ok=${p.ok} status=${p.status ?? '-'} requestId=${p.requestId || '-'} finishReason=${p.finishReason || '-'} chunkCount=${p.chunkCount ?? '-'} usageTotalTokens=${p.usageMetadata?.totalTokenCount ?? '-'} contentChars=${p.contentChars ?? '-'} preview="${this.debugText(String(p.preview || ''), 800)}"`));
            on('api.error', (p) => this.logDebug(`cine.${kind}.api.error`, `status=${p.status ?? '-'} requestId=${p.requestId || '-'} finishReason=${p.finishReason || '-'} usageTotalTokens=${p.usageMetadata?.totalTokenCount ?? '-'} error=${p.error || '-'} errorCause=${this.debugText(String(p.errorCause || ''), 1200)} errorRaw=${this.debugText(String(p.errorRaw || ''), 4000)}`));
            on('heartbeat', (p) => this.logDebug(`cine.${kind}.heartbeat`, `waitingMs=${p.waitingMs ?? '-'} jobId=${p.jobId || jobId}`));
            on('timeline.plan.parsed', (p) => this.logDebug('cine.timeline.plan', `shots=${p.shots ?? '-'} totalKeyframes=${p.totalKeyframes ?? '-'}`));
            on('job.done', (p) => {
                this.logDebug(`cine.${kind}.job`, `done jobId=${p.jobId || jobId}`);
                finish(p);
            });
            on('job.error', (p) => {
                this.logDebug(`cine.${kind}.error`, String(p.error || 'unknown error'));
                finish(undefined, new Error(String(p.error || 'unknown error')));
            });
            es.onerror = () => {
                this.logDebug(`cine.${kind}.stream`, 'event stream disconnected');
            };
        });
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

    private cinematicSelectedPoisForLlm() {
        const selected = this.pois
            .filter((poi) => this.cinematicSelectedPoiIds.includes(poi.poiId))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        return (selected.length >= 2 ? selected : this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 4)).map((poi) => ({
            poiId: poi.poiId,
            poiName: poi.poiName,
            content: String(poi.content || ''),
            screenshotDataUrl: String(poi.screenshotDataUrl || ''),
            targetX: poi.targetX,
            targetY: poi.targetY,
            targetZ: poi.targetZ,
            targetYaw: poi.targetYaw,
            targetPitch: poi.targetPitch,
            targetFov: poi.targetFov,
            moveSpeedMps: poi.moveSpeedMps
        }));
    }

    private async generateCinematicPromptViaLlm() {
        this.syncCinematicStateFromInputs();
        const llm = this.currentLlmRequest();
        const modelFilename = this.modelFilename || this.options.getModelFilename();
        let simplePrompt = String(this.cinematicSimplePrompt || '').trim();
        if (modelFilename) {
            this.modelFilename = modelFilename;
            this.setModelReady(true);
        }
        if (!modelFilename) throw new Error('Model unavailable');
        if (!simplePrompt) throw new Error('Simple prompt is empty');
        if (this.csvVoiceConfig.enabled && this.csvVoiceConfig.voicePool.length > 0) {
            simplePrompt += `\n\n【语音约束】: 启用了多声音轮询策略，可用声音池为: ${this.csvVoiceConfig.voicePool.join(', ')}。请在生成时为每个 shot 分配适合其情感基调的语音角色。`;
        } else {
            simplePrompt += `\n\n【语音约束】: 采用固定单语音旁白。请保证全篇文案口吻统一。`;
        }
        try {
            this.logDebug('cine.prompt.api.call', `POST ${this.apiBase()}/cinematic/jobs/prompt provider=${llm.provider} model=${llm.model}`);
            const response = await fetch(`${this.apiBase()}/cinematic/jobs/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelFilename,
                    simplePrompt,
                    ttsConfig: this.csvVoiceConfig,
                    llm: {
                        provider: llm.provider,
                        model: llm.model,
                        apiKey: llm.apiKey
                    }
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.ok || !data?.jobId) throw new Error(data?.error?.message || `HTTP ${response.status}`);
            const result = await this.streamCinematicJob(String(data.jobId), 'prompt');
            const plannerPrompt = String(result?.plannerPrompt || '').trim();
            if (!plannerPrompt) throw new Error('Prompt generation returned empty content');
            this.cinematicPlannerPrompt = plannerPrompt;
            this.cinematicPlannerPromptInput.value = plannerPrompt;
            this.cinematicComplexPromptEditor.value = plannerPrompt;
            this.setCinematicStatus('Planner prompt generated by LLM');
        } catch (error) {
            this.logDebug('cine.prompt.fallback', `local planner prompt fallback: ${String(error)}`);
            this.expandCinematicPrompt();
            this.cinematicComplexPromptEditor.value = this.cinematicPlannerPrompt;
            this.setCinematicStatus('Planner prompt generated locally (fallback)');
        }
    }

    private async generateCinematicPlanViaLlm() {
        this.syncCinematicStateFromInputs();
        const llm = this.currentLlmRequest();
        const modelFilename = this.modelFilename || this.options.getModelFilename();
        let plannerPrompt = String(this.cinematicPlannerPrompt || '').trim();
        if (modelFilename) {
            this.modelFilename = modelFilename;
            this.setModelReady(true);
        }
        if (!modelFilename) throw new Error('Model unavailable');
        if (!plannerPrompt) throw new Error('Complex prompt is empty');
        if (this.csvVoiceConfig.enabled && this.csvVoiceConfig.voicePool.length > 0) {
            plannerPrompt += `\n\n【语音约束】: 启用了多声音轮询策略，可用声音池为: ${this.csvVoiceConfig.voicePool.join(', ')}。请在生成时为每个 shot 分配适合其情感基调的语音角色。`;
        } else {
            plannerPrompt += `\n\n【语音约束】: 采用固定单语音旁白。请保证全篇文案口吻统一。`;
        }
        const pois = this.cinematicSelectedPoisForLlm();
        if (pois.length < 2) throw new Error('Need at least 2 POIs for cinematic timeline');
        try {
            this.logDebug('cine.timeline.api.call', `POST ${this.apiBase()}/cinematic/jobs/timeline provider=${llm.provider} model=${llm.model} poiIds=${pois.map((poi) => poi.poiId).join(',')}`);
            const response = await fetch(`${this.apiBase()}/cinematic/jobs/timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelFilename,
                    plannerPrompt,
                    targetDurationSec: this.cinematicTargetDurationSec,
                    pois,
                    ttsConfig: this.csvVoiceConfig,
                    llm: {
                        provider: llm.provider,
                        model: llm.model,
                        apiKey: llm.apiKey
                    }
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.ok || !data?.jobId) throw new Error(data?.error?.message || `HTTP ${response.status}`);
            const result = await this.streamCinematicJob(String(data.jobId), 'timeline');
            const plan = result?.plan as CinematicPlan | undefined;
            if (!plan?.shots?.length) throw new Error('Timeline generation returned no shots');
            this.normalizeCinematicPlanMedia(plan);
            this.applyPromptedMediaFallbackToPlan(plan, plannerPrompt);
            plan.bgm = this.cinematicBgmSelection ? { ...this.cinematicBgmSelection } : (plan.bgm || null);
            this.applyStoredSpeechTimingToPlan(plan);
            const mediaKeyframeCount = plan.shots.reduce((sum, shot) => sum + shot.keyframes.filter((kf) => kf.mediaObject?.enabled).length, 0);
            const placeholderCount = plan.shots.reduce((sum, shot) => sum + shot.keyframes.filter((kf) => kf.mediaObject?.enabled && (kf.mediaObject?.placeholder || !kf.mediaObject?.src)).length, 0);
            this.logDebug('cine.timeline.media', `frontend mediaKeyframes=${mediaKeyframeCount} placeholderKeyframes=${placeholderCount}`);
            this.cinematicPlan = plan;
        } catch (error) {
            this.logDebug('cine.timeline.fallback', `local cinematic timeline fallback: ${String(error)}`);
            this.generateCinematicPlan();
        }
        const plan = this.cinematicPlan;
        if (!plan?.shots?.length) throw new Error('Timeline generation returned no shots');
        this.cinematicSelectedPoiIds = Array.isArray(plan.selectedPoiIds) && plan.selectedPoiIds.length > 0 ? plan.selectedPoiIds : pois.map((poi) => poi.poiId);
        this.cinematicCurrentTimeSec = 0;
        this.selectedCinematicShotId = plan.shots[0]?.shotId || null;
        this.selectedCinematicKeyframeId = plan.shots[0]?.keyframes[0]?.keyframeId || null;
        this.refreshCinematicUi();
        this.setCinematicStatus(`Plan generated with ${plan.shots.length} shots`);
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

    private deleteCsvGridRow(rowIndex: number) {
        if (rowIndex < 0 || rowIndex >= this.csvGridRows.length) return;
        this.csvGridRows.splice(rowIndex, 1);
        this.csvEditorInput.value = this.buildCsvTextFromGrid();
        this.markCsvEditorDirty();
        this.renderCsvGrid();
    }

    private parseCsvText(csvText: string) {
        return parseCsvText(csvText);
    }

    private buildCsvTextFromGrid() {
        return buildCsvTextFromGrid(this.csvGridHeaders, this.csvGridRows, this.csvEditorInput.value);
    }

    private renderCsvGrid() {
        renderCsvGrid({
            tableEl: this.csvGridTableEl,
            wrapEl: this.csvGridWrapEl,
            headers: this.csvGridHeaders,
            rows: this.csvGridRows,
            onDeleteRow: (rowIndex) => this.deleteCsvGridRow(rowIndex),
            onEditContent: (rowIndex, colIndex) => this.openCsvContentEditor(rowIndex, colIndex),
            onInputCell: (rowIndex, colIndex, value) => {
                this.csvGridRows[rowIndex][colIndex] = value;
                this.csvEditorInput.value = this.buildCsvTextFromGrid();
                this.markCsvEditorDirty();
            }
        });
    }

    private renderCsvVoiceConfig() {
        this.csvVoiceConfig = renderCsvVoiceConfig({
            config: this.csvVoiceConfig,
            enabledInput: this.csvVoiceEnabledInput,
            modelSelect: this.csvVoiceModelSelect,
            fixedSelect: this.csvVoiceFixedSelect,
            listEl: this.csvVoiceListEl,
            summaryEl: this.csvVoiceSummaryEl,
            itemRole: 'csv-voice-item'
        });
    }

    private renderCsvTimingConfig() {
        this.csvTimingConfig = renderCsvTimingConfig({
            config: this.csvTimingConfig,
            enabledInput: this.csvTimingEnabledInput,
            timingInput: this.csvTimingInput,
            minimumEl: this.csvTimingMinimumEl,
            estimatedEl: this.csvTimingEstimatedEl,
            summaryEl: this.csvTimingSummaryEl,
            summary: this.csvTimingSummary
        });
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
        renderCsvVersionList({
            listEl: this.csvVersionListEl,
            versions: this.csvVersions,
            selectedVersionId: this.selectedCsvVersionId,
            selectAction: 'csv-version-select'
        });
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
        const fallbackName = `ot-cinematic-workspace-${String(this.modelFilename || 'model').replace(/[^a-zA-Z0-9_.-]/g, '_')}-v${current?.versionNo || this.selectedCsvVersionId}.csv`;
        await downloadCsvText({
            csvText,
            fallbackName,
            preferSavePicker: true,
            onPickerFallback: (error) => {
                this.logDebug('csv.download', `save picker fallback: ${String(error)}`);
            }
        });
        this.setCsvWorkspaceStatus(`Downloaded v${current?.versionNo || this.selectedCsvVersionId}`);
    }

    private setCinematicCwCsvWorkspaceStatus(text: string) {
        this.cinematicCwCsvWorkspaceStatusEl.textContent = text;
    }

    private setCinematicCwCsvWorkspaceTimingStatus(prefix: string, summary?: CsvTimingSummary | null) {
        this.cinematicCwCsvTimingSummary = summary || null;
        this.renderCinematicCwCsvTimingConfig();
        const timing = formatCsvTimingSummary(summary);
        this.setCinematicCwCsvWorkspaceStatus(timing ? `${prefix} | ${timing}` : prefix);
    }

    private setCinematicCwCsvWorkspaceFullscreen(enabled: boolean) {
        this.cinematicCwCsvWorkspaceFullscreen = enabled;
        this.cinematicCwCsvWorkspacePanel.classList.toggle('fullscreen', enabled);
        const btn = this.root.querySelector('[data-act="cinematic-cw-csv-workspace-fullscreen"]') as HTMLButtonElement | null;
        if (btn) {
            btn.textContent = enabled ? '🗗' : '⛶';
            btn.title = enabled ? 'Exit Fullscreen' : 'Fullscreen';
        }
        if (enabled) {
            this.cinematicCwCsvWorkspacePanel.classList.add('floating');
            this.cinematicCwCsvWorkspacePanel.style.left = '12px';
            this.cinematicCwCsvWorkspacePanel.style.top = '12px';
        }
    }

    private markCinematicCwCsvEditorDirty() {
        this.cinematicCwCsvEditorDirty = true;
        const current = this.selectedCinematicCwCsvVersion();
        this.setCinematicCwCsvWorkspaceStatus(current ? `Editing v${current.versionNo} (unsaved)` : 'Editing (unsaved)');
    }

    private openCinematicCwCsvContentEditor(row: number, col: number) {
        const header = String(this.cinematicCwCsvGridHeaders[col] || `col_${col + 1}`);
        this.cinematicCwCsvContentEditTarget = { row, col };
        this.cinematicCwCsvContentTitleEl.textContent = `Edit ${header} row ${row + 1}`;
        this.cinematicCwCsvContentInput.value = String(this.cinematicCwCsvGridRows[row]?.[col] || '');
        this.cinematicCwCsvContentModal.classList.remove('hidden');
    }

    private closeCinematicCwCsvContentEditor() {
        this.cinematicCwCsvContentEditTarget = null;
        this.cinematicCwCsvContentModal.classList.add('hidden');
    }

    private saveCinematicCwCsvContentEditor() {
        const target = this.cinematicCwCsvContentEditTarget;
        if (!target) return;
        const { row, col } = target;
        if (!this.cinematicCwCsvGridRows[row]) return;
        this.cinematicCwCsvGridRows[row][col] = this.cinematicCwCsvContentInput.value;
        this.cinematicCwCsvEditorInput.value = this.buildCinematicCwCsvTextFromGrid();
        this.markCinematicCwCsvEditorDirty();
        this.renderCinematicCwCsvGrid();
        this.closeCinematicCwCsvContentEditor();
    }

    private deleteCinematicCwCsvGridRow(rowIndex: number) {
        if (rowIndex < 0 || rowIndex >= this.cinematicCwCsvGridRows.length) return;
        this.cinematicCwCsvGridRows.splice(rowIndex, 1);
        this.cinematicCwCsvEditorInput.value = this.buildCinematicCwCsvTextFromGrid();
        this.markCinematicCwCsvEditorDirty();
        this.renderCinematicCwCsvGrid();
    }

    private parseCinematicCwCsvText(csvText: string) {
        return parseCsvText(csvText);
    }

    private buildCinematicCwCsvTextFromGrid() {
        return buildCsvTextFromGrid(this.cinematicCwCsvGridHeaders, this.cinematicCwCsvGridRows, this.cinematicCwCsvEditorInput.value);
    }

    private renderCinematicCwCsvGrid() {
        renderCsvGrid({
            tableEl: this.cinematicCwCsvGridTableEl,
            wrapEl: this.cinematicCwCsvGridWrapEl,
            headers: this.cinematicCwCsvGridHeaders,
            rows: this.cinematicCwCsvGridRows,
            onDeleteRow: (rowIndex) => this.deleteCinematicCwCsvGridRow(rowIndex),
            onEditContent: (rowIndex, colIndex) => this.openCinematicCwCsvContentEditor(rowIndex, colIndex),
            onInputCell: (rowIndex, colIndex, value) => {
                this.cinematicCwCsvGridRows[rowIndex][colIndex] = value;
                this.cinematicCwCsvEditorInput.value = this.buildCinematicCwCsvTextFromGrid();
                this.markCinematicCwCsvEditorDirty();
            }
        });
    }

    private renderCinematicCwCsvVoiceConfig() {
        this.cinematicCwCsvVoiceConfig = renderCsvVoiceConfig({
            config: this.cinematicCwCsvVoiceConfig,
            enabledInput: this.cinematicCwCsvVoiceEnabledInput,
            modelSelect: this.cinematicCwCsvVoiceModelSelect,
            fixedSelect: this.cinematicCwCsvVoiceFixedSelect,
            listEl: this.cinematicCwCsvVoiceListEl,
            summaryEl: this.cinematicCwCsvVoiceSummaryEl,
            itemRole: 'cinematic-cw-csv-voice-item'
        });
    }

    private renderCinematicCwCsvTimingConfig() {
        this.cinematicCwCsvTimingConfig = renderCsvTimingConfig({
            config: this.cinematicCwCsvTimingConfig,
            enabledInput: this.cinematicCwCsvTimingEnabledInput,
            timingInput: this.cinematicCwCsvTimingInput,
            minimumEl: this.cinematicCwCsvTimingMinimumEl,
            estimatedEl: this.cinematicCwCsvTimingEstimatedEl,
            summaryEl: this.cinematicCwCsvTimingSummaryEl,
            summary: this.cinematicCwCsvTimingSummary
        });
    }

    private setCinematicCwCsvEditorText(csvText: string) {
        const normalized = String(csvText || '');
        this.cinematicCwCsvEditorInput.value = normalized;
        const parsed = this.parseCinematicCwCsvText(normalized);
        this.cinematicCwCsvGridHeaders = parsed.headers;
        this.cinematicCwCsvGridRows = parsed.rows;
        this.renderCinematicCwCsvGrid();
    }

    private getCinematicCwCsvEditorText() {
        return this.buildCinematicCwCsvTextFromGrid();
    }

    private selectedCinematicCwCsvVersion() {
        return this.cinematicCwCsvVersions.find((item) => item.id === this.selectedCinematicCwCsvVersionId) || null;
    }

    private renderCinematicCwCsvVersionList() {
        renderCsvVersionList({
            listEl: this.cinematicCwCsvVersionListEl,
            versions: this.cinematicCwCsvVersions,
            selectedVersionId: this.selectedCinematicCwCsvVersionId,
            selectAction: 'cinematic-cw-csv-version-select'
        });
    }

    private async loadCinematicCwCsvVersionList(preferredVersionId?: number | null) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/csv/versions?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        this.cinematicCwCsvVersions = Array.isArray(data?.versions) ? data.versions as CsvVersionSummary[] : [];
        const targetId = preferredVersionId && this.cinematicCwCsvVersions.some((item) => item.id === preferredVersionId)
            ? preferredVersionId
            : (this.selectedCinematicCwCsvVersionId && this.cinematicCwCsvVersions.some((item) => item.id === this.selectedCinematicCwCsvVersionId)
                ? this.selectedCinematicCwCsvVersionId
                : (this.cinematicCwCsvVersions[0]?.id || null));
        this.selectedCinematicCwCsvVersionId = targetId;
        this.renderCinematicCwCsvVersionList();
        if (targetId) await this.loadCinematicCwCsvVersionDetail(targetId);
        else {
            this.setCinematicCwCsvEditorText('');
            this.cinematicCwCsvEditorDirty = false;
            this.setCinematicCwCsvWorkspaceStatus('No version selected');
        }
    }

    private async loadCinematicCwCsvVersionDetail(versionId: number) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(versionId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        const detail = data.version as CsvVersionDetail;
        this.selectedCinematicCwCsvVersionId = detail.id;
        this.setCinematicCwCsvEditorText(String(detail.csvText || ''));
        this.cinematicCwCsvEditorDirty = false;
        this.renderCinematicCwCsvVersionList();
        this.setCinematicCwCsvWorkspaceStatus(`Loaded v${detail.versionNo}`);
    }

    private async openCinematicCwCsvWorkspace() {
        if (!this.requireModel()) return;
        this.cinematicCwCsvWorkspaceModal.classList.remove('hidden');
        this.setCinematicCwCsvWorkspaceFullscreen(this.cinematicCwCsvWorkspaceFullscreen);
        this.setCinematicCwCsvWorkspaceStatus('Loading versions...');
        await this.loadCinematicCwCsvVersionList();
    }

    private async generateCinematicCwCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.cinematicPlan?.shots?.length) throw new Error('No cinematic plan');
        const csvText = this.compileCinematicPlanToCsv(this.cinematicPlan);
        this.setCinematicCwCsvWorkspaceStatus('Compiling CSV from current cinematic timeline...');
        const response = await fetch(`${this.apiBase()}/csv/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: this.modelFilename,
                source: 'cinematic-keyframes',
                csvText
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version?.id) {
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        await this.loadCinematicCwCsvVersionList(Number(data.version.id));
        this.setCinematicCwCsvWorkspaceStatus(`Compiled current CW timeline to v${data.version.versionNo}`);
    }

    private async estimateCinematicCwCsvTiming() {
        this.setCinematicCwCsvWorkspaceStatus('Timing controls are disabled for CW WYSIWYG CSV export');
    }

    private async saveCinematicCwCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCinematicCwCsvVersionId) throw new Error('no csv version selected');
        const csvText = this.getCinematicCwCsvEditorText();
        if (!csvText.trim()) throw new Error('csv is empty');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCinematicCwCsvVersionId))}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCinematicCwCsvVersionList(this.selectedCinematicCwCsvVersionId);
        this.setCinematicCwCsvWorkspaceStatus(`Saved v${data?.version?.versionNo || ''}`.trim());
    }

    private async saveCinematicCwCsvVersionAsNew() {
        if (!this.requireModel()) return;
        if (!this.selectedCinematicCwCsvVersionId) throw new Error('no csv version selected');
        const csvText = this.getCinematicCwCsvEditorText();
        if (!csvText.trim()) throw new Error('csv is empty');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCinematicCwCsvVersionId))}/save-as-new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version?.id) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCinematicCwCsvVersionList(Number(data.version.id));
        this.setCinematicCwCsvWorkspaceStatus(`Created v${data.version.versionNo}`);
    }

    private async deleteCinematicCwCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCinematicCwCsvVersionId) throw new Error('no csv version selected');
        const current = this.selectedCinematicCwCsvVersion();
        const ok = window.confirm(`Delete CSV version v${current?.versionNo || this.selectedCinematicCwCsvVersionId}?`);
        if (!ok) return;
        const removeId = this.selectedCinematicCwCsvVersionId;
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(removeId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        this.selectedCinematicCwCsvVersionId = null;
        await this.loadCinematicCwCsvVersionList();
        this.setCinematicCwCsvWorkspaceStatus(`Deleted v${current?.versionNo || removeId}`);
    }

    private async downloadCinematicCwCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.selectedCinematicCwCsvVersionId) throw new Error('no csv version selected');
        const response = await fetch(`${this.apiBase()}/csv/versions/${encodeURIComponent(String(this.selectedCinematicCwCsvVersionId))}/download?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        const csvText = await response.text();
        const current = this.selectedCinematicCwCsvVersion();
        const fallbackName = `ot-cinematic-workspace-${String(this.modelFilename || 'model').replace(/[^a-zA-Z0-9_.-]/g, '_')}-v${current?.versionNo || this.selectedCinematicCwCsvVersionId}.csv`;
        await downloadCsvText({
            csvText,
            fallbackName,
            preferSavePicker: false
        });
        this.setCinematicCwCsvWorkspaceStatus(`Downloaded v${current?.versionNo || this.selectedCinematicCwCsvVersionId}`);
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

    private setCinematicStatus(text: string) {
        this.cinematicStatusEl.textContent = text;
    }

    private cinematicSpeechMetricStorageKey(shotId: string) {
        return `ot.cinematic.speech.metrics.${String(this.modelFilename || 'model')}.${String(shotId || '')}`;
    }

    private loadStoredSpeechMetrics(shotId: string) {
        if (typeof window === 'undefined' || !shotId) return null;
        try {
            const raw = window.localStorage.getItem(this.cinematicSpeechMetricStorageKey(shotId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const durationSec = Number(parsed?.durationSec || 0);
            const charsPerSecond = Number(parsed?.charsPerSecond || 0);
            const measuredChars = Number(parsed?.measuredChars || 0);
            if (!(durationSec > 0) || !(charsPerSecond > 0)) return null;
            return {
                durationSec,
                charsPerSecond,
                measuredChars: measuredChars > 0 ? measuredChars : 0,
                updatedAt: String(parsed?.updatedAt || ''),
                ttsModel: parsed?.ttsModel ? String(parsed.ttsModel) : undefined,
                ttsVoice: parsed?.ttsVoice ? String(parsed.ttsVoice) : undefined
            };
        } catch {
            return null;
        }
    }

    private saveStoredSpeechMetrics(shot: CinematicShot) {
        if (typeof window === 'undefined' || !shot?.shotId || !shot?.speechMetrics) return;
        try {
            window.localStorage.setItem(this.cinematicSpeechMetricStorageKey(shot.shotId), JSON.stringify(shot.speechMetrics));
        } catch {}
    }

    private applyStoredSpeechTimingToShot(shot: CinematicShot) {
        if (!shot) return;
        const stored = shot.speechMetrics || this.loadStoredSpeechMetrics(shot.shotId);
        if (!stored) return;
        shot.speechMetrics = stored;
        this.updateShotDurationFromSpeechMatch(shot);
    }

    private applyStoredSpeechTimingToPlan(plan: CinematicPlan | null) {
        if (!plan?.shots?.length) return;
        plan.shots.forEach((shot) => this.applyStoredSpeechTimingToShot(shot));
    }

    private stopCinematicSpeechPreview() {
        this.updateCinematicRecordingAudioDucking(false);
        if (this.cinematicSpeechAudio) {
            try {
                this.cinematicSpeechAudio.pause();
                this.cinematicSpeechAudio.src = '';
            } catch {}
        }
        this.cinematicSpeechAudio = null;
        this.cinematicSpeechPlayingShotId = null;
        this.cinematicSpeechLoadingShotId = null;
    }

    private async ensureCinematicRecordingAudioMix() {
        if (this.cinematicRecordingAudioMix) {
            if (this.cinematicRecordingAudioMix.context.state === 'suspended') {
                await this.cinematicRecordingAudioMix.context.resume().catch(() => {
                    // ignore resume failures and let playback fail naturally
                });
            }
            return this.cinematicRecordingAudioMix;
        }
        const context = new AudioContext({ sampleRate: 48000 });
        const destination = context.createMediaStreamDestination();
        const masterGain = context.createGain();
        const bgmGain = context.createGain();
        const duckGain = context.createGain();
        const speechGain = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const bgmLowShelf = context.createBiquadFilter();
        const bgmHighShelf = context.createBiquadFilter();
        bgmLowShelf.type = 'lowshelf';
        bgmLowShelf.frequency.value = 180;
        bgmLowShelf.gain.value = 1.8;
        bgmHighShelf.type = 'highshelf';
        bgmHighShelf.frequency.value = 3200;
        bgmHighShelf.gain.value = 1.4;
        compressor.threshold.value = -20;
        compressor.knee.value = 18;
        compressor.ratio.value = 2.8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;
        duckGain.gain.value = 1;
        bgmGain.gain.value = 1;
        speechGain.gain.value = 1;
        masterGain.gain.value = 1;

        bgmGain.connect(bgmLowShelf);
        bgmLowShelf.connect(bgmHighShelf);
        bgmHighShelf.connect(duckGain);
        duckGain.connect(masterGain);
        speechGain.connect(masterGain);
        masterGain.connect(compressor);
        compressor.connect(destination);
        compressor.connect(context.destination);

        this.cinematicRecordingAudioMix = {
            context,
            destination,
            masterGain,
            bgmGain,
            duckGain,
            speechGain,
            compressor,
            sources: new WeakMap()
        };
        await context.resume().catch(() => {
            // ignore resume failures and let playback fail naturally
        });
        return this.cinematicRecordingAudioMix;
    }

    private connectCinematicRecordingAudioElement(audio: HTMLAudioElement, channel: 'bgm' | 'speech') {
        const mix = this.cinematicRecordingAudioMix;
        if (!mix) return;
        if (mix.sources.has(audio)) return;
        const source = mix.context.createMediaElementSource(audio);
        mix.sources.set(audio, source);
        source.connect(channel === 'bgm' ? mix.bgmGain : mix.speechGain);
    }

    private updateCinematicRecordingAudioDucking(active: boolean) {
        const mix = this.cinematicRecordingAudioMix;
        if (!mix) return;
        const now = mix.context.currentTime;
        const target = active ? 0.58 : 1;
        mix.duckGain.gain.cancelScheduledValues(now);
        mix.duckGain.gain.setTargetAtTime(target, now, active ? 0.02 : 0.12);
    }

    private stopCinematicRecordingAudioMix() {
        const mix = this.cinematicRecordingAudioMix;
        this.cinematicRecordingAudioMix = null;
        if (!mix) return;
        void mix.context.close().catch(() => {
            // ignore close failures during teardown
        });
    }

    private resetCinematicShotSpeechState() {
        this.cinematicSpeechPlayedShotIds.clear();
        this.cinematicSpeechLastShotId = null;
        this.cinematicSpeechLastTimeSec = null;
    }

    private isCinematicBlockingSpeechInProgress() {
        if (!this.cinematicSpeechAudio || !this.cinematicSpeechPlayingShotId || !this.cinematicPlan?.shots?.length) return false;
        const playingShot = this.cinematicPlan.shots.find((shot) => shot.shotId === this.cinematicSpeechPlayingShotId) || null;
        if (!playingShot || playingShot.speechMode !== 'BLOCKING') return false;
        return !this.cinematicSpeechAudio.paused && !this.cinematicSpeechAudio.ended;
    }

    private attachCsvVoiceModalToCurrentWorkspace(workspaceLocal: boolean) {
        if (workspaceLocal) {
            if (this.csvVoiceModal.parentElement !== this.cinematicWorkspacePanel) {
                this.cinematicWorkspacePanel.appendChild(this.csvVoiceModal);
            }
            this.csvVoiceModal.classList.add('workspace-local');
            return;
        }
        if (this.csvVoiceModal.parentElement !== this.root) {
            this.root.appendChild(this.csvVoiceModal);
        }
        this.csvVoiceModal.classList.remove('workspace-local');
    }

    private attachCsvTimingModalToCurrentWorkspace(workspaceLocal: boolean) {
        if (workspaceLocal) {
            if (this.csvTimingModal.parentElement !== this.cinematicWorkspacePanel) {
                this.cinematicWorkspacePanel.appendChild(this.csvTimingModal);
            }
            this.csvTimingModal.classList.add('workspace-local');
            return;
        }
        if (this.csvTimingModal.parentElement !== this.root) {
            this.root.appendChild(this.csvTimingModal);
        }
        this.csvTimingModal.classList.remove('workspace-local');
    }

    private pinCinematicWorkspacePanel() {
        if (this.cinematicWorkspaceFullscreen) return;
        const rect = this.cinematicWorkspacePanel.getBoundingClientRect();
        if (!this.cinematicWorkspaceFloatPos.initialized) {
            this.cinematicWorkspaceFloatPos = {
                left: rect.left,
                top: rect.top,
                initialized: true
            };
        }
        this.cinematicWorkspacePanel.classList.add('floating');
        this.cinematicWorkspacePanel.style.left = `${this.cinematicWorkspaceFloatPos.left}px`;
        this.cinematicWorkspacePanel.style.top = `${this.cinematicWorkspaceFloatPos.top}px`;
    }

    private clampCinematicWorkspacePosition(left: number, top: number) {
        const width = this.cinematicWorkspacePanel.offsetWidth || 1240;
        const height = this.cinematicWorkspacePanel.offsetHeight || 860;
        const minVisibleX = 180;
        const minVisibleY = 54;
        return {
            left: clamp(left, minVisibleX - width, window.innerWidth - minVisibleX),
            top: clamp(top, 12, window.innerHeight - minVisibleY)
        };
    }

    private openCinematicKeyframeEditor() {
        this.renderCinematicKeyframeList();
        this.cinematicKeyframeModal.classList.remove('hidden');
    }

    private openCinematicShotEditor() {
        this.renderCinematicKeyframeList();
        this.cinematicShotModal.classList.remove('hidden');
    }

    private closeCinematicEditors() {
        this.cinematicKeyframeModal.classList.add('hidden');
        this.cinematicShotModal.classList.add('hidden');
        this.closeCinematicMediaEditor();
    }

    private resolveShotSpeechTtsConfig(shot: CinematicShot) {
        const requestedModel = String(shot?.speechMetrics?.ttsModel || this.csvVoiceConfig.model || DEFAULT_TTS_MODEL).trim();
        const model = TTS_VOICE_OPTIONS_BY_MODEL[requestedModel] ? requestedModel : DEFAULT_TTS_MODEL;
        const options = TTS_VOICE_OPTIONS_BY_MODEL[model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
        const requestedVoice = String(shot?.speechMetrics?.ttsVoice || '').trim();
        const fallbackVoice = String(this.csvVoiceConfig.fixedVoice || DEFAULT_TTS_VOICE).trim();
        const voice = options.some((item) => item.value === requestedVoice)
            ? requestedVoice
            : (options.some((item) => item.value === fallbackVoice) ? fallbackVoice : (options[0]?.value || DEFAULT_TTS_VOICE));
        return { model, voice };
    }

    private async ensureShotSpeechAudio(shot: CinematicShot) {
        if (shot.speechAudioUrl) return shot.speechAudioUrl;
        const text = String(shot.speechText || '').trim();
        if (!text) return null;
        const modelFilename = this.modelFilename || this.options.getModelFilename();
        if (!modelFilename) return null;
        const ttsConfig = this.resolveShotSpeechTtsConfig(shot);
        const response = await fetch(`${this.apiBase()}/cinematic/speech-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename, shotId: shot.shotId, text, ttsConfig })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.audioUrl) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        shot.speechAudioUrl = String(data.audioUrl || '');
        shot.speechMetrics = {
            ...shot.speechMetrics,
            ttsModel: String(data?.ttsConfig?.model || ttsConfig.model || ''),
            ttsVoice: String(data?.ttsConfig?.voice || ttsConfig.voice || '')
        };
        return shot.speechAudioUrl;
    }

    private updateShotDurationFromSpeechMatch(shot: CinematicShot) {
        if (!shot.speechMatchEnabled || !shot.speechMetrics?.charsPerSecond) return;
        const chars = countSpeechChars(shot.speechText);
        if (chars < 1) return;
        shot.durationSec = Math.max(0.5, Number((chars / shot.speechMetrics.charsPerSecond).toFixed(1)));
    }

    private syncPreviewSpeechAtTime(timeSec: number) {
        if (!this.cinematicPreview.playing || !this.cinematicPlan?.shots?.length) {
            this.cinematicRecordingSubtitleText = '';
            this.stopCinematicSpeechPreview();
            return;
        }
        const metrics = this.cinematicTimelineData();
        const activeSpan = metrics?.shots.find((item) => timeSec >= item.startSec && timeSec <= item.endSec + 1e-3) || null;
        const activeShot = activeSpan?.shot || null;
        const blockingSpeechActive = this.isCinematicBlockingSpeechInProgress();
        const blockingShot = blockingSpeechActive
            ? (this.cinematicPlan.shots.find((shot) => shot.shotId === this.cinematicSpeechPlayingShotId) || null)
            : null;
        this.cinematicRecordingSubtitleText = String((blockingShot || activeShot)?.speechText || '').trim();
        if (!activeShot?.speechAudioUrl || !activeShot.speechText.trim()) {
            if (this.cinematicSpeechPlayingShotId && !blockingSpeechActive) this.stopCinematicSpeechPreview();
            this.cinematicSpeechLastShotId = activeShot?.shotId || null;
            this.cinematicSpeechLastTimeSec = timeSec;
            return;
        }

        const shotId = activeShot.shotId;
        const prevShotId = this.cinematicSpeechLastShotId;
        const prevTime = this.cinematicSpeechLastTimeSec;
        this.cinematicSpeechLastShotId = shotId;
        this.cinematicSpeechLastTimeSec = timeSec;

        const crossedShotStart = prevTime === null
            ? (timeSec >= activeSpan.startSec && (timeSec - activeSpan.startSec) <= 0.28)
            : (prevTime < activeSpan.startSec - 1e-4 && timeSec >= activeSpan.startSec - 1e-4);
        const enteredNewShot = prevShotId !== shotId;
        if (blockingSpeechActive && blockingShot && blockingShot.shotId !== shotId) return;
        const shouldPlayAtShotStart = enteredNewShot && crossedShotStart && !this.cinematicSpeechPlayedShotIds.has(shotId);
        if (!shouldPlayAtShotStart) return;

        this.cinematicSpeechPlayedShotIds.add(shotId);
        this.stopCinematicSpeechPreview();
        const audio = new Audio(activeShot.speechAudioUrl);
        audio.volume = Math.max(0, Math.min(1, this.cinematicRecordingSettings.masterVolume * this.cinematicRecordingSettings.ttsVolume));
        this.cinematicSpeechAudio = audio;
        this.connectCinematicRecordingAudioElement(audio, 'speech');
        this.cinematicSpeechPlayingShotId = shotId;
        audio.onended = () => {
            this.updateCinematicRecordingAudioDucking(false);
            if (this.cinematicSpeechPlayingShotId === shotId) this.stopCinematicSpeechPreview();
        };
        void audio.play().catch(() => {
            this.updateCinematicRecordingAudioDucking(false);
            this.stopCinematicSpeechPreview();
        });
        this.updateCinematicRecordingAudioDucking(true);
    }

    private async previewCinematicShotSpeech(shotId: string) {
        if (!this.requireModel()) return;
        const shot = this.cinematicPlan?.shots.find((item) => item.shotId === shotId) || null;
        if (!shot) throw new Error('Shot not found');
        const text = String(shot.speechText || '').trim();
        if (!text) throw new Error('Speech is empty');
        const modelFilename = this.modelFilename || this.options.getModelFilename();
        if (!modelFilename) throw new Error('Model unavailable');
        this.stopCinematicSpeechPreview();
        this.cinematicSpeechLoadingShotId = shotId;
        this.renderCinematicKeyframeList();
        this.setCinematicStatus('Generating speech preview...');
        const ttsConfig = this.resolveShotSpeechTtsConfig(shot);
        const response = await fetch(`${this.apiBase()}/cinematic/speech-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename,
                shotId,
                text,
                ttsConfig
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.audioUrl) {
            this.cinematicSpeechLoadingShotId = null;
            this.renderCinematicKeyframeList();
            throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }
        const audio = new Audio(String(data.audioUrl));
        shot.speechAudioUrl = String(data.audioUrl || '');
        this.cinematicSpeechAudio = audio;
        this.connectCinematicRecordingAudioElement(audio, 'speech');
        this.cinematicSpeechLoadingShotId = null;
        this.cinematicSpeechPlayingShotId = shotId;
        this.renderCinematicKeyframeList();
        this.setCinematicStatus('Speech preview playing');
        await new Promise<void>((resolve, reject) => {
            let resolved = false;
            const cleanup = () => {
                this.updateCinematicRecordingAudioDucking(false);
                audio.onended = null;
                audio.onerror = null;
                audio.onloadedmetadata = null;
            };
            audio.onloadedmetadata = () => {
                this.renderCinematicKeyframeList();
            };
            audio.onerror = () => {
                if (resolved) return;
                resolved = true;
                cleanup();
                reject(new Error('Speech preview playback failed'));
            };
            audio.onended = () => {
                if (resolved) return;
                resolved = true;
                cleanup();
                const actualDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Math.max(0.1, audio.currentTime);
                const measuredChars = countSpeechChars(text);
                const charsPerSecond = measuredChars > 0 ? measuredChars / Math.max(actualDuration, 0.1) : 0;
                shot.speechMetrics = {
                    durationSec: Number(actualDuration.toFixed(3)),
                    charsPerSecond: Number(charsPerSecond.toFixed(4)),
                    measuredChars,
                    updatedAt: new Date().toISOString(),
                    ttsModel: String(data?.ttsConfig?.model || ''),
                    ttsVoice: String(data?.ttsConfig?.voice || '')
                };
                this.saveStoredSpeechMetrics(shot);
                this.updateShotDurationFromSpeechMatch(shot);
                this.cinematicSpeechPlayingShotId = null;
                this.cinematicSpeechAudio = null;
                this.renderCinematicTimeline();
                this.renderCinematicKeyframeList();
                this.setCinematicStatus(`Speech measured ${actualDuration.toFixed(2)}s`);
                resolve();
            };
            audio.play().catch((error) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            });
            this.updateCinematicRecordingAudioDucking(true);
        }).finally(() => {
            if (this.cinematicSpeechPlayingShotId === shotId) {
                this.cinematicSpeechPlayingShotId = null;
            }
            if (this.cinematicSpeechLoadingShotId === shotId) {
                this.cinematicSpeechLoadingShotId = null;
            }
            this.renderCinematicKeyframeList();
        });
    }

    private syncCinematicChrome() {
        this.cinematicWorkspaceModal.classList.toggle('mini', this.cinematicMiniMode);
        this.cinematicMiniToggleBtn.textContent = this.cinematicMiniMode ? 'Full' : 'Mini';
        const playMarkup = this.cinematicPreview.playing ? CINE_ICON_PAUSE : CINE_ICON_PLAY;
        const previewBtn = this.root.querySelector('[data-act="cinematic-preview-toggle"]') as HTMLButtonElement | null;
        const routeBtn = this.root.querySelector('[data-act="cinematic-toggle-route"]') as HTMLButtonElement | null;
        if (previewBtn) previewBtn.innerHTML = playMarkup;
        if (routeBtn) {
            routeBtn.textContent = this.cinematicShowRouteOverlay ? 'Route On' : 'Route Off';
            routeBtn.classList.toggle('active', this.cinematicShowRouteOverlay);
        }
        this.cinematicMiniPlayBtn.innerHTML = playMarkup;
    }

    private cinematicCurrentBgmConfig() {
        return this.cinematicBgmSelection || this.cinematicPlan?.bgm || null;
    }

    private cloneCinematicBgmConfig(config: CinematicBgmConfig | null) {
        if (!config) return null;
        return {
            ...config,
            audioPath: String(config.audioPath || '').trim(),
            audioStartSeconds: Math.max(0, Number(config.audioStartSeconds) || 0),
            audioEndSeconds: Math.max(0, Number(config.audioEndSeconds) || 0),
            audioPlaybackRate: clampMusicRate(Number(config.audioPlaybackRate) || 1),
            targetMusicDurationSeconds: normalizeMusicDuration(config.targetMusicDurationSeconds),
            audioDisplayName: config.audioDisplayName ? String(config.audioDisplayName) : undefined,
            sourceKey: config.sourceKey ? String(config.sourceKey) : undefined,
            sourceType: config.sourceType || undefined,
            audioRelativePath: config.audioRelativePath ? String(config.audioRelativePath) : undefined,
            directoryName: config.directoryName ? String(config.directoryName) : undefined
        };
    }

    private cinematicBgmNeedsHandle(config: CinematicBgmConfig | null) {
        if (!config) return false;
        const path = String(config.audioPath || '').trim();
        if (!path) return false;
        if (/^(blob:|data:|https?:\/\/|\/)/i.test(path)) return false;
        return true;
    }

    private cinematicBgmHandleDb() {
        if (this.cinematicBgmHandleDbPromise) return this.cinematicBgmHandleDbPromise;
        this.cinematicBgmHandleDbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open('ot-cw-bgm-handles', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('open bgm handle db failed'));
        });
        return this.cinematicBgmHandleDbPromise;
    }

    private async cinematicBgmStoreHandle(key: string, handle: FileSystemHandle) {
        const db = await this.cinematicBgmHandleDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('store bgm handle failed'));
            tx.onabort = () => reject(tx.error || new Error('store bgm handle aborted'));
        });
    }

    private async cinematicBgmLoadHandle(key: string): Promise<FileSystemHandle | null> {
        const db = await this.cinematicBgmHandleDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get(key);
            req.onsuccess = () => resolve((req.result as FileSystemHandle) || null);
            req.onerror = () => reject(req.error || new Error('load bgm handle failed'));
        });
    }

    private async cinematicBgmResolveStoredFile(config: CinematicBgmConfig) {
        const sourceKey = String(config.sourceKey || '').trim();
        if (!sourceKey) return null;
        const handle = await this.cinematicBgmLoadHandle(sourceKey);
        if (!handle) return null;
        if (config.sourceType === 'file' && handle.kind === 'file') {
            return await (handle as FileSystemFileHandle).getFile();
        }
        if (config.sourceType === 'directory' && handle.kind === 'directory') {
            const relativePath = String(config.audioRelativePath || config.audioPath || '').trim();
            if (!relativePath) return null;
            const parts = relativePath.split('/').filter(Boolean);
            let current: FileSystemDirectoryHandle | FileSystemFileHandle = handle as FileSystemDirectoryHandle;
            for (let i = 0; i < parts.length; i += 1) {
                if (current.kind !== 'directory') return null;
                current = await (current as FileSystemDirectoryHandle).getFileHandle(parts[i]).catch(async () => {
                    if (i < parts.length - 1) return await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i]);
                    throw new Error('bgm file missing');
                });
            }
            if (current.kind !== 'file') return null;
            return await (current as FileSystemFileHandle).getFile();
        }
        return null;
    }

    private cinematicBgmMakeHandleKey(prefix: string) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private async cinematicBgmAbsorbDirectoryHandle(dirHandle: FileSystemDirectoryHandle) {
        const sourceKey = this.cinematicBgmMakeHandleKey('bgmdir');
        await this.cinematicBgmStoreHandle(sourceKey, dirHandle);
        const items: CinematicBgmLibraryItem[] = [];
        const walk = async (handle: FileSystemDirectoryHandle, prefix = ''): Promise<void> => {
            for await (const entry of handle.values()) {
                const child = entry as FileSystemHandle;
                if (child.kind === 'directory') {
                    await walk(child as FileSystemDirectoryHandle, `${prefix}${child.name}/`);
                    continue;
                }
                const fileHandle = child as FileSystemFileHandle;
                const file = await fileHandle.getFile();
                if (!(file.type.startsWith('audio/') || isAudioFileName(file.name))) continue;
                const audioUrl = URL.createObjectURL(file);
                this.cinematicBgmObjectUrls.push(audioUrl);
                const relativePath = `${prefix}${file.name}`;
                items.push({
                    id: this.cinematicBgmMakeHandleKey('bgmfile'),
                    name: file.name,
                    audioPath: relativePath,
                    audioUrl,
                    source: 'folder',
                    sourceKey,
                    sourceType: 'directory',
                    audioRelativePath: relativePath,
                    directoryName: dirHandle.name
                });
            }
        };
        await walk(dirHandle);
        return items;
    }

    private async cinematicBgmAbsorbFileHandles(fileHandles: FileSystemFileHandle[]) {
        const items: CinematicBgmLibraryItem[] = [];
        for (const handle of fileHandles) {
            const file = await handle.getFile();
            if (!(file.type.startsWith('audio/') || isAudioFileName(file.name))) continue;
            const sourceKey = this.cinematicBgmMakeHandleKey('bgmfile');
            await this.cinematicBgmStoreHandle(sourceKey, handle);
            const audioUrl = URL.createObjectURL(file);
            this.cinematicBgmObjectUrls.push(audioUrl);
            items.push({
                id: sourceKey,
                name: file.name,
                audioPath: file.name,
                audioUrl,
                source: 'path',
                sourceKey,
                sourceType: 'file',
                audioRelativePath: file.name
            });
        }
        return items;
    }

    private cinematicEditingBgmConfig() {
        return this.cinematicBgmDraft;
    }

    private setCinematicBgmPlayerButtonState(playing: boolean) {
        this.cinematicBgmPlayerBtn.innerHTML = playing ? CINE_ICON_PAUSE : CINE_ICON_PLAY;
        this.cinematicBgmPlayerBtn.title = playing ? 'Pause' : 'Play';
    }

    private cinematicBgmApplyConfig(config: CinematicBgmConfig | null) {
        const next = this.cloneCinematicBgmConfig(config);
        if (next && next.audioEndSeconds <= next.audioStartSeconds) {
            next.audioEndSeconds = next.audioStartSeconds + 0.2;
        }
        this.cinematicBgmSelection = next;
    }

    private clearCinematicBgmRuntimeState() {
        this.cinematicBgmStopPreview();
        this.cinematicBgmPreviewAudio = null;
        this.cinematicBgmLoadedAudioPath = null;
        this.cinematicBgmAudioDurationSec = 0;
        this.cinematicBgmWaveform = [];
        this.cinematicBgmProgressInput.value = '0';
        this.cinematicBgmTimeEl.textContent = '0:00.00 / 0:00.00';
        this.cinematicBgmStartInput.value = '0.000';
        this.cinematicBgmEndInput.value = '0.000';
        this.cinematicBgmManualRateInput.value = '1.00';
        this.cinematicBgmTargetDurationInput.value = '';
        this.cinematicBgmRenderWaveform();
        this.cinematicBgmUpdateEffectiveRate();
    }

    private clearCinematicBgmState() {
        if (this.cinematicPlan) this.cinematicPlan.bgm = null;
        this.cinematicBgmSelection = null;
        this.cinematicBgmDraft = null;
        this.cinematicBgmTimelineSelected = false;
        this.clearCinematicBgmRuntimeState();
    }

    private cinematicBgmStopPreview() {
        if (this.cinematicBgmPreviewRaf) {
            window.cancelAnimationFrame(this.cinematicBgmPreviewRaf);
            this.cinematicBgmPreviewRaf = 0;
        }
        if (this.cinematicBgmPreviewAudio) {
            this.cinematicBgmPreviewAudio.pause();
            this.cinematicBgmPreviewAudio.currentTime = 0;
            this.cinematicBgmPreviewAudio.onended = null;
            this.cinematicBgmPreviewAudio.onloadedmetadata = null;
            this.cinematicBgmPreviewAudio.ontimeupdate = null;
        }
        this.cinematicBgmClipPreviewPlaying = false;
        this.setCinematicBgmPlayerButtonState(false);
        this.cinematicBgmClipPlayBtn.textContent = 'Play Clip';
        this.cinematicBgmRenderWaveform();
    }

    private cinematicBgmStartTimelinePlayback() {
        const bgm = this.cinematicCurrentBgmConfig();
        const audio = this.cinematicBgmPreviewAudio;
        if (!bgm || !audio) return;
        this.connectCinematicRecordingAudioElement(audio, 'bgm');
        const audioPath = String(bgm.audioPath || '').trim();
        if (!audioPath || this.cinematicBgmLoadedAudioPath !== audioPath) return;
        const clipStart = Math.max(0, Number(bgm.audioStartSeconds || 0));
        const clipEnd = Math.max(clipStart + 0.01, Number(bgm.audioEndSeconds || 0));
        const rate = cinematicBgmEffectiveRate(bgm);
        const seek = clipStart + Math.max(0, this.cinematicCurrentTimeSec) * rate;
        if (seek >= clipEnd - 0.01) {
            audio.pause();
            return;
        }
        audio.pause();
        this.cinematicBgmClipPreviewPlaying = false;
        audio.volume = Math.max(0, Math.min(1, this.cinematicRecordingSettings.masterVolume * this.cinematicRecordingSettings.bgmVolume));
        audio.playbackRate = rate;
        audio.currentTime = clamp(seek, clipStart, clipEnd - 0.01);
        audio.onended = () => {
            this.setCinematicBgmPlayerButtonState(false);
        };
        audio.ontimeupdate = () => {
            if (!this.cinematicPreview.playing || audio.currentTime >= clipEnd) {
                audio.pause();
                this.setCinematicBgmPlayerButtonState(false);
            }
        };
        void audio.play().then(() => {
            this.setCinematicBgmPlayerButtonState(true);
            if (!this.cinematicBgmPreviewRaf) this.cinematicBgmPreviewRaf = window.requestAnimationFrame(this.cinematicBgmPreviewTick);
        }).catch((error) => {
            this.logDebug('cine.bgm.playback', String(error));
        });
    }

    private cinematicBgmPreviewTick = () => {
        this.cinematicBgmPreviewRaf = 0;
        const audio = this.cinematicBgmPreviewAudio;
        if (!audio) return;
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const duration = this.cinematicBgmAudioDurationSec > 0 ? this.cinematicBgmAudioDurationSec : (Number.isFinite(audio.duration) ? audio.duration : 0);
        if (duration > 0) {
            const ratio = clamp(current / duration, 0, 1);
            this.cinematicBgmProgressInput.value = String(Math.round(ratio * 1000));
            this.cinematicBgmTimeEl.textContent = `${formatSecondsLabel(current)} / ${formatSecondsLabel(duration)}`;
            this.cinematicBgmRenderWaveform();
        }
        if (!audio.paused) this.cinematicBgmPreviewRaf = window.requestAnimationFrame(this.cinematicBgmPreviewTick);
    };

    private cinematicBgmRenderWaveform() {
        const canvas = this.cinematicBgmWaveCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#070a12';
        ctx.fillRect(0, 0, width, height);
        const samples = this.cinematicBgmWaveform;
        if (samples.length > 0) {
            ctx.fillStyle = 'rgba(129, 157, 219, 0.55)';
            for (let x = 0; x < width; x += 1) {
                const sample = samples[Math.floor((x / Math.max(1, width - 1)) * (samples.length - 1))] || 0;
                const amp = Math.max(1, Math.round(sample * (height * 0.44)));
                const y = Math.floor((height - amp) * 0.5);
                ctx.fillRect(x, y, 1, amp);
            }
        } else {
            ctx.fillStyle = '#7f8dad';
            ctx.font = '12px sans-serif';
            ctx.fillText('Select an audio track to render waveform', 12, Math.floor(height / 2));
        }
        const startSec = Math.max(0, Number(this.cinematicBgmStartInput.value) || 0);
        const endSec = Math.max(startSec, Number(this.cinematicBgmEndInput.value) || 0);
        const duration = Math.max(0.001, this.cinematicBgmAudioDurationSec || endSec || 1);
        const left = (startSec / duration) * width;
        const right = (endSec / duration) * width;
        ctx.fillStyle = 'rgba(86, 152, 255, 0.18)';
        ctx.fillRect(left, 0, Math.max(2, right - left), height);
        ctx.strokeStyle = 'rgba(120, 185, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, 0);
        ctx.lineTo(left, height);
        ctx.moveTo(right, 0);
        ctx.lineTo(right, height);
        ctx.stroke();

        const currentSec = Math.max(0, Number(this.cinematicBgmPreviewAudio?.currentTime || 0));
        const playheadX = clamp(currentSec / duration, 0, 1) * width;
        ctx.strokeStyle = 'rgba(255, 136, 96, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 136, 96, 0.95)';
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX - 5, 7);
        ctx.lineTo(playheadX + 5, 7);
        ctx.closePath();
        ctx.fill();
    }

    private cinematicBgmUpdateClipDuration() {
        const start = Math.max(0, Number(this.cinematicBgmStartInput.value) || 0);
        const end = Math.max(start, Number(this.cinematicBgmEndInput.value) || 0);
        const span = Math.max(0, end - start);
        this.cinematicBgmClipDurationEl.textContent = `${span.toFixed(3)}s`;
    }

    private cinematicBgmUpdateEffectiveRate() {
        const current = this.cinematicEditingBgmConfig();
        if (!current) {
            this.cinematicBgmEffectiveRateEl.textContent = '1.00x';
            this.cinematicBgmUpdateClipDuration();
            return;
        }
        const rate = cinematicBgmEffectiveRate(current);
        const clip = Math.max(0, current.audioEndSeconds - current.audioStartSeconds);
        const target = normalizeMusicDuration(current.targetMusicDurationSeconds);
        this.cinematicBgmEffectiveRateEl.textContent = target
            ? `${rate.toFixed(2)}x (clip ${clip.toFixed(2)}s -> target ${target.toFixed(2)}s)`
            : `${rate.toFixed(2)}x`;
        this.cinematicBgmUpdateClipDuration();
    }

    private cinematicBgmRenderLibrary() {
        this.cinematicBgmLibraryEl.innerHTML = '';
        const filter = this.cinematicBgmFilter.trim().toLowerCase();
        const activePath = this.cinematicEditingBgmConfig()?.audioPath || '';
        const rows = filter
            ? this.cinematicBgmLibrary.filter((item) => item.name.toLowerCase().includes(filter) || item.audioPath.toLowerCase().includes(filter))
            : this.cinematicBgmLibrary;
        if (rows.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otl-muted';
            empty.textContent = 'No music selected. Use folder/file button to load playlist.';
            this.cinematicBgmLibraryEl.appendChild(empty);
            return;
        }
        const frag = document.createDocumentFragment();
        rows.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `otl-cinematic-bgm-item${item.audioPath === activePath ? ' active' : ''}`;
            btn.setAttribute('data-act', 'cinematic-bgm-select-item');
            btn.setAttribute('data-audio-path', item.audioPath);
            if (item.sourceKey) btn.setAttribute('data-source-key', item.sourceKey);
            btn.textContent = item.name;
            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = item.sourceType === 'directory'
                ? `Folder: ${item.directoryName || item.audioRelativePath || item.audioPath}`
                : item.audioRelativePath || item.audioPath;
            btn.appendChild(meta);
            frag.appendChild(btn);
        });
        this.cinematicBgmLibraryEl.appendChild(frag);
    }

    private async cinematicBgmResolveAudioUrl(config: CinematicBgmConfig) {
        const path = String(config.audioPath || '').trim();
        if (!path) return '';
        if (/^(blob:|data:|https?:\/\/)/i.test(path)) return path;
        const item = this.cinematicBgmLibrary.find((row) => row.audioPath === path && (!config.sourceKey || row.sourceKey === config.sourceKey));
        if (item) return item.audioUrl;
        if (config.sourceKey) {
            const file = await this.cinematicBgmResolveStoredFile(config).catch((error): null => {
                this.logDebug('cine.bgm.restore', String(error));
                return null;
            });
            if (file) {
                const audioUrl = URL.createObjectURL(file);
                this.cinematicBgmObjectUrls.push(audioUrl);
                const itemFromHandle: CinematicBgmLibraryItem = {
                    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                    name: file.name,
                    audioPath: path,
                    audioUrl,
                    source: config.sourceType === 'directory' ? 'folder' : 'path',
                    sourceKey: config.sourceKey,
                    sourceType: config.sourceType,
                    audioRelativePath: config.audioRelativePath,
                    directoryName: config.directoryName
                };
                if (!this.cinematicBgmLibrary.some((row) => row.audioPath === itemFromHandle.audioPath && row.sourceKey === itemFromHandle.sourceKey)) {
                    this.cinematicBgmLibrary.unshift(itemFromHandle);
                    this.cinematicBgmRenderLibrary();
                }
                return audioUrl;
            }
        }
        return /^(\/|[A-Za-z]:\\)/.test(path) ? `${this.apiBase()}/local-file?path=${encodeURIComponent(path)}` : '';
    }

    private async cinematicBgmLoadAudio(audioPath: string, displayName?: string, target: 'selection' | 'draft' = 'selection', savedMeta?: Partial<CinematicBgmConfig>) {
        const path = String(audioPath || '').trim();
        if (!path) throw new Error('audioPath is empty');
        const audioUrl = await this.cinematicBgmResolveAudioUrl({
            audioPath: path,
            audioStartSeconds: 0,
            audioEndSeconds: 0,
            audioPlaybackRate: 1,
            targetMusicDurationSeconds: null,
            audioDisplayName: displayName,
            sourceKey: savedMeta?.sourceKey,
            sourceType: savedMeta?.sourceType,
            audioRelativePath: savedMeta?.audioRelativePath,
            directoryName: savedMeta?.directoryName
        });
        if (!audioUrl) throw new Error('audio url unavailable');
        this.cinematicBgmStopPreview();
        const preview = new Audio(audioUrl);
        preview.preload = 'auto';
        preview.crossOrigin = 'anonymous';
        preview.volume = Math.max(0, Math.min(1, this.cinematicRecordingSettings.masterVolume * this.cinematicRecordingSettings.bgmVolume));
        this.cinematicBgmPreviewAudio = preview;
        this.connectCinematicRecordingAudioElement(preview, 'bgm');
        await new Promise<void>((resolve, reject) => {
            preview.onloadedmetadata = () => resolve();
            preview.onerror = () => reject(new Error('Audio metadata load failed'));
            preview.load();
        });
        this.cinematicBgmLoadedAudioPath = path;
        this.cinematicBgmAudioDurationSec = Math.max(0.01, Number(preview.duration) || 0.01);
        let config = target === 'draft' ? this.cinematicBgmDraft : this.cinematicBgmSelection;
        if (!config) {
            config = {
                audioPath: path,
                audioStartSeconds: 0,
                audioEndSeconds: this.cinematicBgmAudioDurationSec,
                audioPlaybackRate: 1,
                targetMusicDurationSeconds: null,
                audioDisplayName: displayName || path,
                sourceKey: savedMeta?.sourceKey,
                sourceType: savedMeta?.sourceType,
                audioRelativePath: savedMeta?.audioRelativePath,
                directoryName: savedMeta?.directoryName
            };
        }
        config.audioPath = path;
        config.audioDisplayName = displayName || config.audioDisplayName || path;
        config.sourceKey = savedMeta?.sourceKey || config.sourceKey;
        config.sourceType = savedMeta?.sourceType || config.sourceType;
        config.audioRelativePath = savedMeta?.audioRelativePath || config.audioRelativePath;
        config.directoryName = savedMeta?.directoryName || config.directoryName;
        config.audioStartSeconds = clamp(Number(config.audioStartSeconds || 0), 0, this.cinematicBgmAudioDurationSec - 0.01);
        config.audioEndSeconds = clamp(Number(config.audioEndSeconds || this.cinematicBgmAudioDurationSec), config.audioStartSeconds + 0.01, this.cinematicBgmAudioDurationSec);
        if (target === 'draft') this.cinematicBgmDraft = config;
        else this.cinematicBgmSelection = config;
        this.cinematicBgmStartInput.value = config.audioStartSeconds.toFixed(3);
        this.cinematicBgmEndInput.value = config.audioEndSeconds.toFixed(3);
        this.cinematicBgmManualRateInput.value = config.audioPlaybackRate.toFixed(2);
        this.cinematicBgmTargetDurationInput.value = config.targetMusicDurationSeconds ? String(config.targetMusicDurationSeconds) : '';
        this.cinematicBgmProgressInput.value = '0';
        this.cinematicBgmTimeEl.textContent = `0:00.00 / ${formatSecondsLabel(this.cinematicBgmAudioDurationSec)}`;

        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error(`Audio fetch failed: HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new AudioContext();
        let buffer: AudioBuffer;
        try {
            buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        } finally {
            void audioCtx.close();
        }
        const channels = Math.max(1, buffer.numberOfChannels);
        const samples = 1200;
        const block = Math.max(1, Math.floor(buffer.length / samples));
        this.cinematicBgmWaveform = [];
        for (let i = 0; i < samples; i += 1) {
            const offset = i * block;
            let max = 0;
            for (let j = 0; j < block; j += 1) {
                const index = offset + j;
                if (index >= buffer.length) break;
                let value = 0;
                for (let c = 0; c < channels; c += 1) {
                    value += Math.abs(buffer.getChannelData(c)[index] || 0);
                }
                max = Math.max(max, value / channels);
            }
            this.cinematicBgmWaveform.push(max);
        }
        this.cinematicBgmRenderWaveform();
        this.cinematicBgmUpdateEffectiveRate();
        this.cinematicBgmRenderLibrary();
    }

    private cinematicBgmRecommendClip() {
        const current = this.cinematicEditingBgmConfig();
        if (!current || this.cinematicBgmWaveform.length < 4 || this.cinematicBgmAudioDurationSec <= 0) return;
        const duration = this.cinematicBgmAudioDurationSec;
        const target = normalizeMusicDuration(current.targetMusicDurationSeconds)
            || clamp(duration * 0.28, 2, 20);
        const span = clamp(target, 0.5, duration);
        const maxStart = Math.max(0, duration - span);
        let bestStart = 0;
        let bestScore = -1;
        const sampleCount = this.cinematicBgmWaveform.length;
        const secToIndex = (sec: number) => Math.floor(clamp(sec / Math.max(0.001, duration), 0, 1) * (sampleCount - 1));
        for (let start = 0; start <= maxStart; start += 0.2) {
            const end = start + span;
            const a = secToIndex(start);
            const b = Math.max(a + 1, secToIndex(end));
            let sum = 0;
            let count = 0;
            for (let i = a; i <= b; i += 1) {
                sum += this.cinematicBgmWaveform[i] || 0;
                count += 1;
            }
            const avg = count > 0 ? sum / count : 0;
            const boundary = ((this.cinematicBgmWaveform[a] || 0) + (this.cinematicBgmWaveform[b] || 0)) * 0.5;
            const score = avg - boundary * 0.22;
            if (score > bestScore) {
                bestScore = score;
                bestStart = start;
            }
        }
        current.audioStartSeconds = Number(bestStart.toFixed(3));
        current.audioEndSeconds = Number((bestStart + span).toFixed(3));
        this.cinematicBgmStartInput.value = current.audioStartSeconds.toFixed(3);
        this.cinematicBgmEndInput.value = current.audioEndSeconds.toFixed(3);
        this.cinematicBgmRenderWaveform();
        this.cinematicBgmUpdateEffectiveRate();
    }

    private cinematicBgmSyncSelectionFromInputs() {
        const current = this.cinematicEditingBgmConfig();
        if (!current) return;
        const duration = Math.max(0.01, this.cinematicBgmAudioDurationSec || 0.01);
        const start = clamp(Number(this.cinematicBgmStartInput.value) || 0, 0, duration - 0.01);
        const end = clamp(Number(this.cinematicBgmEndInput.value) || duration, start + 0.01, duration);
        current.audioStartSeconds = Number(start.toFixed(3));
        current.audioEndSeconds = Number(end.toFixed(3));
        current.audioPlaybackRate = clampMusicRate(Number(this.cinematicBgmManualRateInput.value) || current.audioPlaybackRate || 1);
        current.targetMusicDurationSeconds = normalizeMusicDuration(Number(this.cinematicBgmTargetDurationInput.value));
        this.cinematicBgmStartInput.value = current.audioStartSeconds.toFixed(3);
        this.cinematicBgmEndInput.value = current.audioEndSeconds.toFixed(3);
        this.cinematicBgmManualRateInput.value = current.audioPlaybackRate.toFixed(2);
    }

    private async openCinematicBgmModal() {
        const current = this.cinematicCurrentBgmConfig();
        this.cinematicBgmTimelineSelected = true;
        this.cinematicBgmDraft = current ? { ...current } : {
            audioPath: '',
            audioStartSeconds: 0,
            audioEndSeconds: 0,
            audioPlaybackRate: 1,
            targetMusicDurationSeconds: null
        };
        this.cinematicBgmFilter = '';
        this.cinematicBgmSearchInput.value = '';
        this.setCinematicBgmPlayerButtonState(false);
        this.cinematicBgmClipPlayBtn.textContent = 'Play Clip';
        this.cinematicBgmStartInput.value = Number(this.cinematicBgmDraft.audioStartSeconds || 0).toFixed(3);
        this.cinematicBgmEndInput.value = Number(this.cinematicBgmDraft.audioEndSeconds || 0).toFixed(3);
        this.cinematicBgmManualRateInput.value = Number(this.cinematicBgmDraft.audioPlaybackRate || 1).toFixed(2);
        this.cinematicBgmTargetDurationInput.value = this.cinematicBgmDraft.targetMusicDurationSeconds ? String(this.cinematicBgmDraft.targetMusicDurationSeconds) : '';
        this.cinematicBgmRenderLibrary();
        if (this.cinematicBgmDraft.audioPath) {
            await this.cinematicBgmLoadAudio(this.cinematicBgmDraft.audioPath, this.cinematicBgmDraft.audioDisplayName, 'draft');
        } else {
            this.clearCinematicBgmRuntimeState();
        }
        this.cinematicBgmModal.classList.remove('hidden');
        this.cinematicBgmRenderWaveform();
        this.cinematicBgmUpdateEffectiveRate();
    }

    private closeCinematicBgmModal() {
        this.cinematicBgmModal.classList.add('hidden');
        this.cinematicBgmDraft = null;
        this.cinematicBgmStopPreview();
    }

    private openCinematicPromptModal(kind: 'simple' | 'complex') {
        this.syncCinematicInputsFromState();
        if (kind === 'simple') this.cinematicSimplePromptModal.classList.remove('hidden');
        else this.cinematicComplexPromptModal.classList.remove('hidden');
    }

    private closeCinematicPromptModal(kind: 'simple' | 'complex') {
        if (kind === 'simple') this.cinematicSimplePromptModal.classList.add('hidden');
        else this.cinematicComplexPromptModal.classList.add('hidden');
    }

    private syncCinematicInputsFromState() {
        this.cinematicSimplePromptInput.value = this.cinematicSimplePrompt;
        this.cinematicPlannerPromptInput.value = this.cinematicPlannerPrompt;
        this.cinematicSimplePromptEditor.value = this.cinematicSimplePrompt;
        this.cinematicComplexPromptEditor.value = this.cinematicPlannerPrompt;
        this.cinematicSceneInput.value = this.cinematicSceneDescription;
        this.cinematicStoryInput.value = this.cinematicStoryBackground;
        this.cinematicStyleInput.value = this.cinematicStyleText;
        this.cinematicDurationInput.value = String(this.cinematicTargetDurationSec);
    }

    private syncCinematicStateFromInputs() {
        this.cinematicSimplePrompt = this.cinematicSimplePromptEditor.value.trim() || this.cinematicSimplePromptInput.value.trim() || DEFAULT_CINEMATIC_SIMPLE_PROMPT;
        this.cinematicPlannerPrompt = this.cinematicComplexPromptEditor.value.trim() || this.cinematicPlannerPromptInput.value.trim() || DEFAULT_CINEMATIC_PLANNER_PROMPT;
        this.cinematicSimplePromptInput.value = this.cinematicSimplePrompt;
        this.cinematicPlannerPromptInput.value = this.cinematicPlannerPrompt;
        this.cinematicSceneDescription = this.cinematicSceneInput.value.trim();
        this.cinematicStoryBackground = this.cinematicStoryInput.value.trim();
        this.cinematicStyleText = this.cinematicStyleInput.value.trim() || 'cinematic one take';
        this.cinematicTargetDurationSec = Math.max(4, Math.min(180, Number(this.cinematicDurationInput.value) || 14));
        this.cinematicDurationInput.value = String(this.cinematicTargetDurationSec);
    }

    private selectedCinematicShot() {
        return this.cinematicPlan?.shots.find((shot) => shot.shotId === this.selectedCinematicShotId) || null;
    }

    private selectedCinematicKeyframe() {
        const shot = this.selectedCinematicShot();
        return shot?.keyframes.find((item) => item.keyframeId === this.selectedCinematicKeyframeId) || null;
    }

    private ensureCinematicSelection() {
        const firstShot = this.cinematicPlan?.shots[0] || null;
        if (!firstShot) {
            this.selectedCinematicShotId = null;
            this.selectedCinematicKeyframeId = null;
            return;
        }
        if (!this.selectedCinematicShotId || !this.cinematicPlan?.shots.some((shot) => shot.shotId === this.selectedCinematicShotId)) {
            this.selectedCinematicShotId = firstShot.shotId;
        }
        const shot = this.selectedCinematicShot() || firstShot;
        if (!this.selectedCinematicKeyframeId || !shot.keyframes.some((item) => item.keyframeId === this.selectedCinematicKeyframeId)) {
            this.selectedCinematicKeyframeId = shot.keyframes[0]?.keyframeId || null;
        }
    }

    private renderCinematicVersionList() {
        this.cinematicVersionListEl.innerHTML = '';
        this.cinematicSimpleVersionListEl.innerHTML = '';
        this.cinematicComplexVersionListEl.innerHTML = '';
        if (this.cinematicVersions.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'otl-muted';
            empty.textContent = 'No cinematic versions yet';
            this.cinematicVersionListEl.appendChild(empty);
            this.cinematicSimpleVersionListEl.appendChild(empty.cloneNode(true));
            this.cinematicComplexVersionListEl.appendChild(empty.cloneNode(true));
            return;
        }
        const frag = document.createDocumentFragment();
        const simpleFrag = document.createDocumentFragment();
        const complexFrag = document.createDocumentFragment();
        this.cinematicVersions.forEach((version) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `otl-csv-version-item${version.id === this.selectedCinematicVersionId ? ' active' : ''}`;
            btn.setAttribute('data-act', 'cinematic-version-select');
            btn.setAttribute('data-version-id', String(version.id));
            btn.textContent = `v${version.versionNo} ${version.updatedAt}`;
            frag.appendChild(btn);

            const itemMarkup = `<div><strong>v${version.versionNo}${version.id === this.selectedCinematicVersionId ? ' (Current)' : ''}</strong></div><div class="otl-cinematic-prompt-version-meta">${version.updatedAt}</div>`;
            const simpleBtn = document.createElement('button');
            simpleBtn.type = 'button';
            simpleBtn.className = `otl-cinematic-prompt-version-item${version.id === this.selectedCinematicVersionId ? ' active' : ''}`;
            simpleBtn.setAttribute('data-act', 'cinematic-version-select');
            simpleBtn.setAttribute('data-version-id', String(version.id));
            simpleBtn.innerHTML = itemMarkup;
            simpleFrag.appendChild(simpleBtn);

            const complexBtn = document.createElement('button');
            complexBtn.type = 'button';
            complexBtn.className = `otl-cinematic-prompt-version-item${version.id === this.selectedCinematicVersionId ? ' active' : ''}`;
            complexBtn.setAttribute('data-act', 'cinematic-version-select');
            complexBtn.setAttribute('data-version-id', String(version.id));
            complexBtn.innerHTML = itemMarkup;
            complexFrag.appendChild(complexBtn);
        });
        this.cinematicVersionListEl.appendChild(frag);
        this.cinematicSimpleVersionListEl.appendChild(simpleFrag);
        this.cinematicComplexVersionListEl.appendChild(complexFrag);
    }

    private openCinematicPoiPicker() {
        this.cinematicPoiDraftIds = [...this.cinematicSelectedPoiIds];
        this.renderCinematicPoiList();
        this.cinematicPoiPickerModal.classList.remove('hidden');
    }

    private closeCinematicPoiPicker() {
        this.cinematicPoiPickerModal.classList.add('hidden');
    }

    private saveCinematicPoiPicker() {
        this.cinematicSelectedPoiIds = [...this.cinematicPoiDraftIds];
        this.closeCinematicPoiPicker();
        this.setCinematicStatus(this.cinematicSelectedPoiIds.length > 0
            ? `Selected ${this.cinematicSelectedPoiIds.length} POIs`
            : 'No POIs selected');
    }

    private renderCinematicPoiList() {
        this.cinematicPoiListEl.innerHTML = '';
        if (this.cinematicPoiPickerModal.classList.contains('hidden')) {
            this.cinematicPoiDraftIds = [...this.cinematicSelectedPoiIds];
        }
        const frag = document.createDocumentFragment();
        this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder).forEach((poi) => {
            const checked = this.cinematicPoiDraftIds.includes(poi.poiId);
            const item = document.createElement('label');
            item.className = 'otl-cinematic-poi-row';
            item.innerHTML = `<input type="checkbox" data-role="cinematic-poi-item" value="${poi.poiId}" ${checked ? 'checked' : ''} />
                <span>${poi.poiName}</span>
                <span class="otl-muted">${poi.targetX.toFixed(2)}, ${poi.targetY.toFixed(2)}, ${poi.targetZ.toFixed(2)}</span>`;
            frag.appendChild(item);
        });
        this.cinematicPoiListEl.appendChild(frag);
    }

    private renderCinematicKeyframeList() {
        const shot = this.selectedCinematicShot();
        const keyframeModalTitleEl = this.root.querySelector('[data-role="cinematic-keyframe-modal-title"]') as HTMLDivElement | null;
        if (!shot) {
            this.cinematicKeyframeEditorBodyEl.innerHTML = '<div class="otl-muted">No keyframe selected</div>';
            this.cinematicShotEditorBodyEl.innerHTML = '<div class="otl-muted">No shot selected</div>';
            if (keyframeModalTitleEl) keyframeModalTitleEl.innerHTML = '<span>Key Frame</span>';
            const headMediaButtons = Array.from(this.root.querySelectorAll('[data-role="cinematic-kf-head-media"]')) as HTMLButtonElement[];
            headMediaButtons.forEach((btn) => {
                btn.disabled = true;
                btn.removeAttribute('data-keyframe-id');
                if (btn.getAttribute('data-kind') === 'edit') btn.textContent = 'Edit 3D Object In Main View';
                btn.classList.remove('primary');
            });
            return;
        }
        const shotDuration = Math.max(0.1, shot.durationSec || 0.1);
        const selectedKeyframeId = this.selectedCinematicKeyframeId || shot.keyframes[0]?.keyframeId;
        const kf = shot.keyframes.find((item) => item.keyframeId === selectedKeyframeId) || shot.keyframes[0];
        const idx = Math.max(0, shot.keyframes.findIndex((item) => item.keyframeId === kf?.keyframeId));
        const media = kf ? (kf.mediaObject ? normalizeCwMediaObjectConfig(kf.mediaObject) : this.cinematicEffectiveMediaForKeyframe(kf.keyframeId).config) : null;
        if (kf?.mediaObject) kf.mediaObject = normalizeCwMediaObjectConfig(kf.mediaObject);
        const mediaStatus = kf ? this.describeCinematicMediaInheritance(kf) : 'No active 3D media object';
        const mediaAnchorX = media?.anchorWorld ? media.anchorWorld.x.toFixed(3) : '';
        const mediaAnchorY = media?.anchorWorld ? media.anchorWorld.y.toFixed(3) : '';
        const mediaAnchorZ = media?.anchorWorld ? media.anchorWorld.z.toFixed(3) : '';
        const mediaName = media?.fileName || media?.placeholderLabel || 'No video selected';
        const mediaPath = media?.src || '';
        if (keyframeModalTitleEl && kf) keyframeModalTitleEl.innerHTML = `<span>Key Frame</span><span class="otl-cinematic-title-meta">(K${idx + 1} t=${(kf.t * shotDuration).toFixed(2)}s)</span>`;
        this.cinematicKeyframeEditorBodyEl.innerHTML = kf ? `
            <section class="otl-cinematic-editor-section">
                <div class="otl-cinematic-keyframe-head-tools otl-cinematic-keyframe-toolbar-grid">
                    <span class="otl-cinematic-step-badge">3D Object</span>
                    <button type="button" class="otl-btn" data-role="cinematic-kf-head-media" data-kind="pick" data-act="cinematic-kf-media-pick-main">Place On Main View</button>
                    <button type="button" class="otl-btn" data-role="cinematic-kf-head-media" data-kind="edit" data-act="cinematic-kf-media-toggle-editor">Edit 3D Object In Main View</button>
                    <button type="button" class="otl-btn" data-role="cinematic-kf-head-media" data-kind="move" data-act="cinematic-kf-media-mode-move">Move</button>
                    <button type="button" class="otl-btn" data-role="cinematic-kf-head-media" data-kind="rotate" data-act="cinematic-kf-media-mode-rotate">Rotate</button>
                    <button type="button" class="otl-btn" data-role="cinematic-kf-head-media" data-kind="scale" data-act="cinematic-kf-media-mode-scale">Scale</button>
                </div>
            </section>
            <section class="otl-cinematic-editor-section otl-cinematic-media-box">
                <div class="otl-cinematic-media-actions-row">
                    <label class="otl-cinematic-check"><input type="checkbox" data-act="cinematic-kf-media-enabled" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" ${media?.enabled ? 'checked' : ''} />Enable</label>
                    <div class="otl-cinematic-media-actions-right">
                        <button type="button" class="otl-btn" data-act="cinematic-kf-media-align-view" data-keyframe-id="${kf.keyframeId}">Align To Current View</button>
                        <button type="button" class="otl-btn" data-act="cinematic-kf-media-reset-inherit" data-keyframe-id="${kf.keyframeId}">Reset To Inherited</button>
                        <button type="button" class="otl-cinematic-media-icon-btn" data-act="cinematic-kf-media-remove" data-keyframe-id="${kf.keyframeId}" title="Clear 3D Object">${CSV_ICON_DELETE}</button>
                    </div>
                </div>
                <div class="otl-cinematic-field"><label>Path</label><div class="otl-cinematic-media-path-row"><input class="otl-input" type="text" readonly value="${escapeHtmlAttr(mediaName)}" placeholder="No video selected" /><button type="button" class="otl-cinematic-media-icon-btn" data-act="cinematic-kf-media-choose-video" data-keyframe-id="${kf.keyframeId}" title="Choose Video Folder">${CINE_ICON_FOLDER}</button></div></div>
                <div class="otl-cinematic-media-note" style="display:none;">${escapeHtmlAttr(mediaStatus)} ${escapeHtmlAttr(mediaPath)}</div>
                <div class="otl-cinematic-editor-grid otl-cinematic-editor-grid-five">
                    <div class="otl-cinematic-field"><label>Scale</label><input class="otl-input" data-act="cinematic-kf-media-scale" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.05" min="0.1" max="120" value="${(media?.scale || 1.6).toFixed(2)}" /></div>
                    <div class="otl-cinematic-field"><label>Yaw</label><input class="otl-input" data-act="cinematic-kf-media-yaw" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" value="${(media?.yaw || 0).toFixed(1)}" /></div>
                    <div class="otl-cinematic-field"><label>Pitch</label><input class="otl-input" data-act="cinematic-kf-media-pitch" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" value="${(media?.pitch || 0).toFixed(1)}" /></div>
                    <div class="otl-cinematic-field"><label>Roll</label><input class="otl-input" data-act="cinematic-kf-media-roll" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" value="${(media?.roll || 0).toFixed(1)}" /></div>
                    <div class="otl-cinematic-field"><label>Depth Offset</label><input class="otl-input" data-act="cinematic-kf-media-depth" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.01" min="-2" max="2" value="${(media?.depthOffset || 0.06).toFixed(2)}" /></div>
                </div>
                <div class="otl-cinematic-editor-grid otl-cinematic-editor-grid-anchor">
                    <div class="otl-cinematic-field"><label>Anchor X</label><input class="otl-input" data-act="cinematic-kf-media-anchor-x" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.001" value="${mediaAnchorX}" placeholder="Unset" /></div>
                    <div class="otl-cinematic-field"><label>Anchor Y</label><input class="otl-input" data-act="cinematic-kf-media-anchor-y" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.001" value="${mediaAnchorY}" placeholder="Unset" /></div>
                    <div class="otl-cinematic-field"><label>Anchor Z</label><input class="otl-input" data-act="cinematic-kf-media-anchor-z" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.001" value="${mediaAnchorZ}" placeholder="Unset" /></div>
                    <button type="button" class="otl-cinematic-media-icon-btn otl-cinematic-anchor-clear-btn" data-act="cinematic-kf-media-clear-anchor" data-keyframe-id="${kf.keyframeId}" title="Clear Anchor">${CSV_ICON_DELETE}</button>
                </div>
            </section>
            <section class="otl-cinematic-editor-section otl-cinematic-camera-section">
                <div class="otl-cinematic-editor-grid">
                    <div class="otl-cinematic-field"><label>Position X</label><input class="otl-input" data-act="cinematic-kf-x" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.01" value="${kf.x.toFixed(2)}" /></div>
                    <div class="otl-cinematic-field"><label>Position Y</label><input class="otl-input" data-act="cinematic-kf-y" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.01" value="${kf.y.toFixed(2)}" /></div>
                    <div class="otl-cinematic-field"><label>Position Z</label><input class="otl-input" data-act="cinematic-kf-z" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.01" value="${kf.z.toFixed(2)}" /></div>
                    <div class="otl-cinematic-field"><label>Yaw</label><input class="otl-input" data-act="cinematic-kf-yaw" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" value="${kf.yaw.toFixed(1)}" /></div>
                    <div class="otl-cinematic-field"><label>Pitch</label><input class="otl-input" data-act="cinematic-kf-pitch" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" value="${kf.pitch.toFixed(1)}" /></div>
                    <div class="otl-cinematic-field"><label>FOV</label><input class="otl-input" data-act="cinematic-kf-fov" data-keyframe-id="${kf.keyframeId}" data-shot-id="${shot.shotId}" type="number" step="0.1" min="20" max="120" value="${kf.fov.toFixed(1)}" /></div>
                </div>
            </section>` : '<div class="otl-muted">No keyframe selected</div>';

        const headMediaButtons = Array.from(this.root.querySelectorAll('[data-role="cinematic-kf-head-media"]')) as HTMLButtonElement[];
        headMediaButtons.forEach((btn) => {
            if (kf) btn.setAttribute('data-keyframe-id', kf.keyframeId);
            else btn.removeAttribute('data-keyframe-id');
            btn.disabled = !kf;
            const kind = String(btn.getAttribute('data-kind') || '');
            btn.classList.remove('primary');
            if (kind === 'edit' && this.cinematicMediaEditor.active) {
                btn.classList.add('primary');
                btn.textContent = 'Exit Object Edit';
            } else if (kind === 'edit') {
                btn.textContent = 'Edit 3D Object In Main View';
            }
            if ((kind === 'move' || kind === 'rotate' || kind === 'scale') && this.cinematicMediaEditor.active && this.cinematicMediaEditor.mode === kind) {
                btn.classList.add('primary');
            }
        });
        const deleteKeyframeBtn = this.root.querySelector('[data-act="cinematic-delete-keyframe"]') as HTMLButtonElement | null;
        if (deleteKeyframeBtn) {
            deleteKeyframeBtn.disabled = !kf || shot.keyframes.length <= 2;
        }
        const deleteShotBtn = this.root.querySelector('[data-act="cinematic-delete-shot"]') as HTMLButtonElement | null;
        if (deleteShotBtn) {
            deleteShotBtn.disabled = !shot;
        }

        const speechMetrics = shot.speechMetrics || this.loadStoredSpeechMetrics(shot.shotId);
        const durationText = speechMetrics?.durationSec ? `${speechMetrics.durationSec.toFixed(2)}s` : 'No audio';
        const cpsText = speechMetrics?.charsPerSecond ? `${speechMetrics.charsPerSecond.toFixed(2)} cps` : '-- cps';
        const isSpeechBusy = this.cinematicSpeechLoadingShotId === shot.shotId || this.cinematicSpeechPlayingShotId === shot.shotId;
        const matchEnabled = Boolean(shot.speechMatchEnabled && speechMetrics?.charsPerSecond);

        const shotTtsConfig = this.resolveShotSpeechTtsConfig(shot);
        const currentVoice = shotTtsConfig.voice;
        const voiceOptions = (TTS_VOICE_OPTIONS_BY_MODEL[shotTtsConfig.model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [])
            .map((option) => `<option value="${option.value}" ${option.value === currentVoice ? 'selected' : ''}>${option.label}</option>`)
            .join('');

        this.cinematicShotEditorBodyEl.innerHTML = `<div class="otl-cinematic-editor-grid shot">
                <div class="otl-cinematic-field"><label>Roll</label><input class="otl-input" type="number" step="0.1" value="0.0" disabled /></div>
                <div class="otl-cinematic-field"><label>Move Speed</label><input class="otl-input" data-act="cinematic-kf-speed" data-keyframe-id="${kf?.keyframeId || ''}" data-shot-id="${shot.shotId}" type="number" step="0.05" min="0.1" value="${(kf?.moveSpeedMps || 0.8).toFixed(2)}" /></div>
                <div class="otl-cinematic-field"><label>Duration</label><input class="otl-input" data-act="cinematic-shot-duration" data-shot-id="${shot.shotId}" type="number" min="0.1" max="120" step="0.1" value="${shot.durationSec.toFixed(1)}" /></div>
                <div class="otl-cinematic-field"><label>Speech Mode</label><select class="otl-select" data-act="cinematic-shot-speech-mode" data-shot-id="${shot.shotId}"><option value="INTERRUPTIBLE" ${shot.speechMode === 'INTERRUPTIBLE' ? 'selected' : ''}>Interruptible</option><option value="BLOCKING" ${shot.speechMode === 'BLOCKING' ? 'selected' : ''}>Blocking</option></select></div>
                <div class="otl-cinematic-field"><label>Voice</label><select class="otl-select" data-act="cinematic-shot-tts-voice" data-shot-id="${shot.shotId}">${voiceOptions}</select></div>
            </div>
            <div class="otl-cinematic-editor-speech">
                <div class="otl-cinematic-field"><label>Speech</label><input class="otl-input otl-cinematic-parameter-speech" data-act="cinematic-shot-speech" data-shot-id="${shot.shotId}" type="text" value="${escapeHtmlAttr(shot.speechText)}" /></div>
                <button type="button" class="otl-btn otl-cinematic-speech-play-btn" data-act="cinematic-shot-play-speech" data-shot-id="${shot.shotId}" title="Play Speech" ${isSpeechBusy ? 'disabled' : ''}>${CINE_ICON_PLAY}</button>
                <div class="otl-cinematic-speech-metric">${durationText}</div>
                <div class="otl-cinematic-speech-metric">${cpsText}</div>
                <label class="otl-cinematic-check"><input type="checkbox" data-act="cinematic-shot-speech-match" data-shot-id="${shot.shotId}" ${matchEnabled ? 'checked' : ''} ${speechMetrics?.charsPerSecond ? '' : 'disabled'} />Match speech to timeline</label>
            </div>`;
    }

    private cinematicTimelineData() {
        if (!this.cinematicPlan?.shots?.length) return null;
        const shots: Array<{ shot: CinematicShot; startSec: number; endSec: number; index: number }> = [];
        const keyframes: Array<{ shot: CinematicShot; keyframe: CinematicKeyframe; globalTimeSec: number; shotIndex: number; keyframeIndex: number }> = [];
        let cursor = 0;
        this.cinematicPlan.shots.forEach((shot, shotIndex) => {
            const duration = Math.max(0.2, shot.durationSec || 0.2);
            const startSec = cursor;
            const endSec = startSec + duration;
            shots.push({ shot, startSec, endSec, index: shotIndex });
            shot.keyframes.forEach((keyframe, keyframeIndex) => {
                const t = clamp(keyframe.t, 0, 1);
                keyframes.push({ shot, keyframe, globalTimeSec: startSec + duration * t, shotIndex, keyframeIndex });
            });
            cursor = endSec;
        });
        return { totalDurationSec: Math.max(0.2, cursor), shots, keyframes };
    }

    private blendCinematicKeyframes(from: CinematicKeyframe, to: CinematicKeyframe, ratio: number): CinematicKeyframe {
        const t = clamp(ratio, 0, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
        const lerp = (a: number, b: number) => a + (b - a) * ease;
        return {
            ...from,
            x: lerp(from.x, to.x),
            y: lerp(from.y, to.y),
            z: lerp(from.z, to.z),
            yaw: lerp(from.yaw, to.yaw),
            pitch: lerp(from.pitch, to.pitch),
            fov: lerp(from.fov, to.fov),
            moveSpeedMps: lerp(from.moveSpeedMps, to.moveSpeedMps)
        };
    }

    private cinematicKeyframeAtTime(timeSec: number) {
        const metrics = this.cinematicTimelineData();
        if (!metrics) return null;
        const clampedSec = clamp(timeSec, 0, metrics.totalDurationSec);
        const shotSpan = metrics.shots.find((item) => clampedSec <= item.endSec + 1e-6) || metrics.shots[metrics.shots.length - 1];
        if (!shotSpan) return null;
        const shot = shotSpan.shot;
        const duration = Math.max(0.2, shot.durationSec || 0.2);
        const localT = clamp((clampedSec - shotSpan.startSec) / duration, 0, 1);
        const currentIndex = Math.max(0, shot.keyframes.findIndex((item, idx) => idx < shot.keyframes.length - 1 && localT <= shot.keyframes[idx + 1].t));
        const from = shot.keyframes[currentIndex] || shot.keyframes[0];
        const to = shot.keyframes[Math.min(shot.keyframes.length - 1, currentIndex + 1)] || from;
        const segmentDen = Math.max(0.0001, to.t - from.t || 1);
        const ratio = clamp((localT - from.t) / segmentDen, 0, 1);
        return {
            shot,
            shotId: shot.shotId,
            keyframeId: from.keyframeId,
            exactKeyframeId: (Math.abs(localT - from.t) < 0.001 ? from.keyframeId : null),
            from,
            to,
            localT,
            shotProgress: localT,
            segmentRatio: ratio,
            blended: this.blendCinematicKeyframes(from, to, ratio),
            totalDurationSec: metrics.totalDurationSec,
            currentTimeSec: clampedSec
        };
    }

    private scrubCinematicTimeline(timeSec: number, snapToNearest = false) {
        const metrics = this.cinematicTimelineData();
        if (!metrics) return;
        let targetSec = clamp(timeSec, 0, metrics.totalDurationSec);
        if (snapToNearest) {
            let nearest = metrics.keyframes[0];
            let best = Number.POSITIVE_INFINITY;
            metrics.keyframes.forEach((item) => {
                const d = Math.abs(item.globalTimeSec - targetSec);
                if (d < best) { best = d; nearest = item; }
            });
            targetSec = nearest?.globalTimeSec || targetSec;
            this.selectedCinematicShotId = nearest?.shot.shotId || this.selectedCinematicShotId;
            this.selectedCinematicKeyframeId = nearest?.keyframe.keyframeId || this.selectedCinematicKeyframeId;
        }
        const current = this.cinematicKeyframeAtTime(targetSec);
        if (!current) return;
        this.cinematicCurrentTimeSec = current.currentTimeSec;
        this.selectedCinematicShotId = current.shotId;
        if (current.exactKeyframeId) this.selectedCinematicKeyframeId = current.exactKeyframeId;
        void this.options.setLiveCameraPose?.(this.cinematicPoseFromKeyframe(current.blended), clampFov(current.blended.fov, DEFAULT_POI_FOV));
        this.applyCwMediaForTime(current.currentTimeSec);
        this.syncCinematicTimelineState();
        this.renderCinematicKeyframeList();
        this.renderCinematicMap();
        this.drawViews();
        this.syncPreviewSpeechAtTime(this.cinematicCurrentTimeSec);
    }

    private syncCinematicTimelineState() {
        const metrics = this.cinematicTimelineData();
        if (!metrics) {
            this.cinematicMiniTimelineEl.innerHTML = '';
            this.cinematicMiniTimeEl.textContent = '0.0s';
            return;
        }
        const pxPerSec = this.cinematicTimelinePixelsPerSecond;
        const timelineInset = 12;
        if (this.cinematicTimelinePlayheadEl) {
            this.cinematicTimelinePlayheadEl.style.left = `${timelineInset + this.cinematicCurrentTimeSec * pxPerSec}px`;
        }
        this.cinematicTimelineEl.querySelectorAll('[data-act="cinematic-shot-select"]').forEach((el) => {
            el.classList.toggle('active', String((el as HTMLElement).getAttribute('data-shot-id') || '') === this.selectedCinematicShotId);
        });
        this.cinematicTimelineEl.querySelectorAll('[data-act="cinematic-keyframe-select"]').forEach((el) => {
            el.classList.toggle('active', String((el as HTMLElement).getAttribute('data-keyframe-id') || '') === this.selectedCinematicKeyframeId);
        });
        this.cinematicTimelineEl.querySelectorAll('[data-act="cinematic-bgm-edit"]').forEach((el) => {
            el.classList.toggle('active', this.cinematicBgmTimelineSelected);
        });
        const miniWidth = Math.max(1, this.cinematicMiniTimelineEl.clientWidth || 260);
        const railLeft = 12;
        const railWidth = Math.max(24, miniWidth - 24);
        const progressWidth = railWidth * clamp(this.cinematicCurrentTimeSec / Math.max(metrics.totalDurationSec, 0.001), 0, 1);
        this.cinematicMiniTimelineEl.innerHTML = `<div class="otl-cinematic-mini-track"></div><div class="otl-cinematic-mini-progress" style="width:${progressWidth}px"></div><div class="otl-cinematic-mini-playhead" style="left:${railLeft + progressWidth}px"></div>`;
        this.cinematicMiniTimeEl.textContent = `${this.cinematicCurrentTimeSec.toFixed(1)}s`;
    }

    private updateKeyframeTimeByGlobalTime(shotId: string, keyframeId: string, globalTimeSec: number) {
        const metrics = this.cinematicTimelineData();
        const shotSpan = metrics?.shots.find((item) => item.shot.shotId === shotId);
        const shot = shotSpan?.shot || null;
        if (!shot || !shotSpan) return;
        const idx = shot.keyframes.findIndex((item) => item.keyframeId === keyframeId);
        if (idx < 0) return;
        const keyframe = shot.keyframes[idx];
        if (idx === 0) { keyframe.t = 0; return; }
        if (idx === shot.keyframes.length - 1) { keyframe.t = 1; return; }
        const local = clamp((globalTimeSec - shotSpan.startSec) / Math.max(0.001, shot.durationSec), 0, 1);
        const prev = shot.keyframes[idx - 1]?.t ?? 0;
        const next = shot.keyframes[idx + 1]?.t ?? 1;
        keyframe.t = clamp(local, prev + 0.02, next - 0.02);
    }

    private deleteSelectedCinematicKeyframe() {
        const shot = this.selectedCinematicShot();
        if (!shot || shot.keyframes.length <= 2 || !this.selectedCinematicKeyframeId) return;
        const idx = shot.keyframes.findIndex((item) => item.keyframeId === this.selectedCinematicKeyframeId);
        if (idx < 0) return;
        shot.keyframes.splice(idx, 1);
        this.selectedCinematicKeyframeId = shot.keyframes[Math.max(0, idx - 1)]?.keyframeId || shot.keyframes[0]?.keyframeId || null;
        this.refreshCinematicUi();
    }

    private deleteSelectedCinematicShot() {
        if (!this.cinematicPlan?.shots?.length || !this.selectedCinematicShotId) return;
        const idx = this.cinematicPlan.shots.findIndex((item) => item.shotId === this.selectedCinematicShotId);
        if (idx < 0) return;
        this.cinematicPlan.shots.splice(idx, 1);
        const replacement = this.cinematicPlan.shots[Math.max(0, idx - 1)] || this.cinematicPlan.shots[0] || null;
        this.selectedCinematicShotId = replacement?.shotId || null;
        this.selectedCinematicKeyframeId = replacement?.keyframes?.[0]?.keyframeId || null;
        this.cinematicCurrentTimeSec = 0;
        if (!replacement) {
            this.closeCinematicEditors();
        }
        if (replacement) {
            const metrics = this.cinematicTimelineData();
            const replacementSpan = metrics?.shots.find((item) => item.shot.shotId === replacement.shotId) || null;
            if (replacementSpan) {
                this.scrubCinematicTimeline(replacementSpan.startSec, true);
            }
            this.cinematicShotModal.classList.add('hidden');
        }
        this.refreshCinematicUi();
    }

    private renderCinematicTimeline() {
        const preservedScrollLeft = this.cinematicTimelineTrackWrapEl?.scrollLeft || this.cinematicTimelineRulerWrapEl?.scrollLeft || this.cinematicTimelineScrollLeft || 0;
        this.cinematicTimelineEl.innerHTML = '';
        this.cinematicTimelineTrackWrapEl = null;
        this.cinematicTimelineRulerWrapEl = null;
        this.cinematicTimelinePlayheadEl = null;
        const metrics = this.cinematicTimelineData();
        if (!metrics) {
            this.cinematicTimelineEl.innerHTML = '<div class="otl-muted">Generate plan first to see the timeline.</div>';
            this.cinematicMiniTimelineEl.innerHTML = '';
            this.cinematicMiniTimeEl.textContent = '0.0s';
            return;
        }
        const timelineInset = 12;
        const rulerStepCount = 10;
        const mainLaneHeight = 84;
        const audioLaneHeight = 38;
        const musicLaneHeight = 38;
        const pxPerSec = this.cinematicTimelinePixelsPerSecond;
        const width = Math.max(760, Math.ceil(metrics.totalDurationSec * pxPerSec) + timelineInset * 2);
        const bgm = this.cinematicCurrentBgmConfig();
        const hasBgm = Boolean(bgm && String(bgm.audioPath || '').trim());
        const speechSegments = metrics.shots.flatMap((item) => {
            const speech = String(item.shot.speechText || '').trim();
            if (!speech) return [] as Array<{ lane: number; startSec: number; endSec: number; text: string; shotId: string }>;
            const speechDuration = item.shot.speechMetrics?.durationSec
                ? Math.max(0.2, item.shot.speechMetrics.durationSec)
                : Math.max(0.2, item.endSec - item.startSec);
            return [{ lane: 0, startSec: item.startSec, endSec: item.startSec + Math.max(0.2, speechDuration), text: speech, shotId: item.shot.shotId }];
        });
        const laneEnds: number[] = [];
        speechSegments.forEach((segment) => {
            let lane = 0;
            while (lane < laneEnds.length && segment.startSec < laneEnds[lane] - 0.02) lane += 1;
            if (lane === laneEnds.length) laneEnds.push(segment.endSec);
            else laneEnds[lane] = segment.endSec;
            segment.lane = lane;
        });
        const speechLaneCount = Math.max(1, laneEnds.length);
        const shell = document.createElement('div');
        shell.className = 'otl-cinematic-timeline-shell';

        const side = document.createElement('div');
        side.className = 'otl-cinematic-timeline-side';
        side.innerHTML = `<div class="otl-cinematic-sequence-head controls"><div class="otl-cinematic-ruler-zoom otl-cinematic-ruler-zoom-embedded"><button class="otl-cinematic-icon-btn" data-act="cinematic-timeline-zoom-out" title="Zoom Out">${CINE_ICON_MINUS}</button><input class="otl-cinematic-zoom-range" data-role="cinematic-timeline-zoom" type="range" min="10" max="100" step="1" value="${this.cinematicTimelinePixelsPerSecond}" /><button class="otl-cinematic-icon-btn" data-act="cinematic-timeline-zoom-in" title="Zoom In">${CINE_ICON_PLUS}</button></div></div>`;
        const sideZoomIn = side.querySelector('[data-act="cinematic-timeline-zoom-in"]') as HTMLButtonElement | null;
        const sideZoomOut = side.querySelector('[data-act="cinematic-timeline-zoom-out"]') as HTMLButtonElement | null;
        const sideZoomInput = side.querySelector('[data-role="cinematic-timeline-zoom"]') as HTMLInputElement | null;
        let lastZoomPointerTs = 0;
        const handleZoomIn = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.type === 'click' && Date.now() - lastZoomPointerTs < 220) return;
            if (event.type === 'pointerdown') lastZoomPointerTs = Date.now();
            this.cinematicTimelinePixelsPerSecond = clamp(this.cinematicTimelinePixelsPerSecond + 5, 10, 100);
            this.logDebug('cine.timeline.zoom', `zoom-in pps=${this.cinematicTimelinePixelsPerSecond} tick0.1=${(this.cinematicTimelinePixelsPerSecond / 10).toFixed(1)}px`);
            if (sideZoomInput) sideZoomInput.value = String(this.cinematicTimelinePixelsPerSecond);
            this.renderCinematicTimeline();
        };
        const handleZoomOut = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.type === 'click' && Date.now() - lastZoomPointerTs < 220) return;
            if (event.type === 'pointerdown') lastZoomPointerTs = Date.now();
            this.cinematicTimelinePixelsPerSecond = clamp(this.cinematicTimelinePixelsPerSecond - 5, 10, 100);
            this.logDebug('cine.timeline.zoom', `zoom-out pps=${this.cinematicTimelinePixelsPerSecond} tick0.1=${(this.cinematicTimelinePixelsPerSecond / 10).toFixed(1)}px`);
            if (sideZoomInput) sideZoomInput.value = String(this.cinematicTimelinePixelsPerSecond);
            this.renderCinematicTimeline();
        };
        sideZoomIn?.addEventListener('pointerdown', handleZoomIn);
        sideZoomIn?.addEventListener('click', handleZoomIn);
        sideZoomOut?.addEventListener('pointerdown', handleZoomOut);
        sideZoomOut?.addEventListener('click', handleZoomOut);
        sideZoomInput?.addEventListener('input', (event) => {
            event.stopPropagation();
            this.cinematicTimelinePixelsPerSecond = clamp(Number((event.target as HTMLInputElement).value) || this.cinematicTimelinePixelsPerSecond, 10, 100);
            this.logDebug('cine.timeline.zoom', `zoom-slider pps=${this.cinematicTimelinePixelsPerSecond} tick0.1=${(this.cinematicTimelinePixelsPerSecond / 10).toFixed(1)}px`);
            this.renderCinematicTimeline();
        });
        const laneSide = document.createElement('div');
        laneSide.className = 'otl-cinematic-lane-side';
        const mainLane = document.createElement('div');
        mainLane.className = 'otl-cinematic-lane-title';
        mainLane.innerHTML = `<span class="otl-cinematic-lane-dot"></span><span>V1</span><span class="otl-cinematic-lane-tools"><span class="otl-cinematic-lane-tool" title="Lock">${CINE_ICON_LOCK}</span><span class="otl-cinematic-lane-tool" title="Eye">${CINE_ICON_EYE}</span></span>`;
        laneSide.appendChild(mainLane);
        for (let lane = 0; lane < speechLaneCount; lane += 1) {
            const speechLane = document.createElement('div');
            speechLane.className = 'otl-cinematic-lane-audio';
            speechLane.innerHTML = `<span class="otl-cinematic-lane-dot"></span><span>A${lane + 1}</span><span class="otl-cinematic-lane-tools"><span class="otl-cinematic-lane-tool" title="Lock">${CINE_ICON_LOCK}</span><span class="otl-cinematic-lane-tool" title="Mute">${CINE_ICON_VOLUME}</span></span>`;
            laneSide.appendChild(speechLane);
        }
        if (hasBgm) {
            const musicLane = document.createElement('div');
            musicLane.className = 'otl-cinematic-lane-audio';
            musicLane.innerHTML = `<span class="otl-cinematic-lane-dot"></span><span>M1</span><span class="otl-cinematic-lane-tools"><span class="otl-cinematic-lane-tool" title="Lock">${CINE_ICON_LOCK}</span><span class="otl-cinematic-lane-tool" title="Music">${CINE_ICON_MUSIC}</span></span>`;
            laneSide.appendChild(musicLane);
        }
        side.appendChild(laneSide);

        const main = document.createElement('div');
        main.className = 'otl-cinematic-timeline-main';
        const rulerWrap = document.createElement('div');
        rulerWrap.className = 'otl-cinematic-ruler-wrap';
        const rulerInner = document.createElement('div');
        rulerInner.className = 'otl-cinematic-ruler-inner';
        rulerInner.style.width = `${width}px`;
        rulerInner.setAttribute('data-total-sec', String(metrics.totalDurationSec));
        const ruler = document.createElement('div');
        ruler.className = 'otl-cinematic-time-ruler';
        const tickCount = Math.ceil(metrics.totalDurationSec * rulerStepCount);
        for (let step = 0; step <= tickCount; step += 1) {
            const x = timelineInset + step * (pxPerSec / rulerStepCount);
            const tick = document.createElement('div');
            tick.className = `otl-cinematic-tick${step % rulerStepCount === 0 ? ' major' : (step % 5 === 0 ? ' mid' : '')}`;
            tick.style.left = `${x}px`;
            ruler.appendChild(tick);
            if (step % rulerStepCount === 0) {
                const label = document.createElement('div');
                label.className = 'otl-cinematic-tick-label';
                label.style.left = `${x}px`;
                label.textContent = `${step / rulerStepCount}s`;
                ruler.appendChild(label);
            }
        }
        rulerInner.appendChild(ruler);
        rulerWrap.appendChild(rulerInner);

        const trackWrap = document.createElement('div');
        trackWrap.className = 'otl-cinematic-track-wrap';
        const trackScroll = document.createElement('div');
        trackScroll.className = 'otl-cinematic-track-scroll';
        trackScroll.style.width = `${width}px`;
        trackScroll.style.height = `${mainLaneHeight + speechLaneCount * audioLaneHeight + (hasBgm ? musicLaneHeight : 0)}px`;
        trackScroll.setAttribute('data-total-sec', String(metrics.totalDurationSec));

        const trackGrid = document.createElement('div');
        trackGrid.className = 'otl-cinematic-track-grid';
        for (let step = 0; step <= tickCount; step += 1) {
            const x = timelineInset + step * (pxPerSec / rulerStepCount);
            const line = document.createElement('div');
            line.className = `otl-cinematic-grid-line${step % rulerStepCount === 0 ? ' major' : (step % 5 === 0 ? ' mid' : '')}`;
            line.style.left = `${x}px`;
            trackGrid.appendChild(line);
        }
        trackScroll.appendChild(trackGrid);

        const shotRow = document.createElement('div');
        shotRow.className = 'otl-cinematic-shot-row';
        metrics.shots.forEach((item) => {
            const left = timelineInset + item.startSec * pxPerSec;
            const bar = document.createElement('div');
            bar.className = `otl-cinematic-shot-bar${item.shot.shotId === this.selectedCinematicShotId ? ' active' : ''}`;
            bar.style.left = `${left}px`;
            bar.style.width = `${Math.max(60, (item.endSec - item.startSec) * pxPerSec - 6)}px`;
            bar.setAttribute('data-act', 'cinematic-shot-select');
            bar.setAttribute('data-shot-id', item.shot.shotId);
            bar.setAttribute('data-start-sec', String(item.startSec));
            const markerInset = 10;
            const markerTravel = `calc(100% - ${markerInset * 2}px)`;
            const markers = item.shot.keyframes.map((keyframe) => {
                const markerLeft = `calc(${markerInset}px + ${clamp(keyframe.t, 0, 1)} * ${markerTravel})`;
                const kIndex = metrics.keyframes.findIndex((entry) => entry.keyframe.keyframeId === keyframe.keyframeId) + 1;
                return `<button type="button" class="otl-cinematic-keyframe-marker${keyframe.keyframeId === this.selectedCinematicKeyframeId ? ' active' : ''}" style="left:${markerLeft};" data-act="cinematic-keyframe-select" data-keyframe-id="${keyframe.keyframeId}" data-shot-id="${item.shot.shotId}" data-time-sec="${item.startSec + (item.endSec - item.startSec) * keyframe.t}" data-label="K${kIndex}"><span class="otl-cinematic-keyframe-marker-label">K${kIndex}</span><span class="otl-cinematic-keyframe-marker-diamond"></span></button>`;
            }).join('');
            bar.innerHTML = `<div class="otl-cinematic-shot-line"><div class="otl-cinematic-shot-title">${item.index + 1}. ${item.shot.label}</div><div class="otl-cinematic-shot-meta">${(item.endSec - item.startSec).toFixed(1)}s</div></div><div class="otl-cinematic-shot-markers">${markers}</div>`;
            shotRow.appendChild(bar);
        });
        trackScroll.appendChild(shotRow);

        const speechTrack = document.createElement('div');
        speechTrack.className = 'otl-cinematic-speech-track';
        speechTrack.style.top = `${mainLaneHeight}px`;
        for (let lane = 0; lane < speechLaneCount; lane += 1) {
            const row = document.createElement('div');
            row.className = 'otl-cinematic-speech-row-lane';
            speechSegments.filter((segment) => segment.lane === lane).forEach((segment) => {
                const chip = document.createElement('div');
                chip.className = 'otl-cinematic-speech-chip';
                chip.style.left = `${timelineInset + segment.startSec * pxPerSec}px`;
                chip.style.width = `${Math.max(60, (segment.endSec - segment.startSec) * pxPerSec - 6)}px`;
                chip.textContent = segment.text;
                row.appendChild(chip);
            });
            speechTrack.appendChild(row);
        }
        trackScroll.appendChild(speechTrack);

        if (hasBgm && bgm) {
            const musicTrack = document.createElement('div');
            musicTrack.className = 'otl-cinematic-speech-track';
            musicTrack.style.top = `${mainLaneHeight + speechLaneCount * audioLaneHeight}px`;
            const row = document.createElement('div');
            row.className = 'otl-cinematic-speech-row-lane';
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `otl-cinematic-speech-chip${this.cinematicBgmTimelineSelected ? ' active' : ''}`;
            chip.style.background = 'linear-gradient(180deg, rgba(35, 56, 105, 0.92), rgba(18, 32, 65, 0.96))';
            chip.style.borderColor = 'rgba(94, 152, 255, 0.55)';
            chip.style.left = `${timelineInset}px`;
            const clipDuration = Math.max(0.1, Number(bgm.audioEndSeconds || 0) - Number(bgm.audioStartSeconds || 0));
            const playDuration = bgm.targetMusicDurationSeconds && Number(bgm.targetMusicDurationSeconds) > 0
                ? Number(bgm.targetMusicDurationSeconds)
                : clipDuration / Math.max(0.001, cinematicBgmEffectiveRate(bgm));
            chip.style.width = `${Math.max(80, playDuration * pxPerSec)}px`;
            chip.setAttribute('data-act', 'cinematic-bgm-edit');
            chip.textContent = `${bgm.audioDisplayName || bgm.audioPath} (${Number(bgm.audioStartSeconds || 0).toFixed(1)}-${Number(bgm.audioEndSeconds || 0).toFixed(1)}s @ ${cinematicBgmEffectiveRate(bgm).toFixed(2)}x)`;
            row.appendChild(chip);
            musicTrack.appendChild(row);
            trackScroll.appendChild(musicTrack);
        }

        const playhead = document.createElement('div');
        playhead.className = 'otl-cinematic-playhead';
        playhead.style.left = `${timelineInset + this.cinematicCurrentTimeSec * pxPerSec}px`;
        trackScroll.appendChild(playhead);

        trackWrap.appendChild(trackScroll);
        trackWrap.addEventListener('scroll', () => {
            this.cinematicTimelineScrollLeft = trackWrap.scrollLeft;
            rulerWrap.scrollLeft = trackWrap.scrollLeft;
        });
        rulerWrap.addEventListener('scroll', () => {
            this.cinematicTimelineScrollLeft = rulerWrap.scrollLeft;
            trackWrap.scrollLeft = rulerWrap.scrollLeft;
        });
        main.appendChild(rulerWrap);
        main.appendChild(trackWrap);
        shell.appendChild(side);
        shell.appendChild(main);
        this.cinematicTimelineEl.appendChild(shell);
        this.cinematicTimelineTrackWrapEl = trackWrap;
        this.cinematicTimelineRulerWrapEl = rulerWrap;
        this.cinematicTimelinePlayheadEl = playhead;
        trackWrap.scrollLeft = preservedScrollLeft;
        rulerWrap.scrollLeft = preservedScrollLeft;
        this.cinematicTimelineScrollLeft = preservedScrollLeft;
        this.syncCinematicTimelineState();
    }

    private renderCinematicMapCanvas(canvas: HTMLCanvasElement, mode: 'top' | 'front') {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0b0d12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const bitmap = mode === 'top' ? this.topBitmapCanvas : this.frontBitmapCanvas;
        if (bitmap) {
            const view = mode === 'top' ? this.topView : this.frontView;
            ctx.save();
            ctx.setTransform(
                view.zoom,
                0,
                0,
                view.zoom,
                canvas.width * 0.5 * (1 - view.zoom) + view.offsetX,
                canvas.height * 0.5 * (1 - view.zoom) + view.offsetY
            );
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
        const selected = this.selectedCinematicKeyframe();
        const points = this.cinematicPlan?.shots.flatMap((shot) => shot.keyframes) || [];
        if (this.cinematicShowRouteOverlay && points.length) {
            ctx.beginPath();
            points.forEach((kf, idx) => {
                const p = mode === 'top'
                    ? this.projectTopForCanvas(canvas, kf.x, kf.z)
                    : this.projectFrontForCanvas(canvas, kf.x, kf.y + this.eyeHeightM);
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.setLineDash([12, 12]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(106, 134, 194, 0.46)';
            ctx.stroke();
            ctx.setLineDash([]);
            points.forEach((kf) => {
                const active = kf.keyframeId === this.selectedCinematicKeyframeId;
                const p = mode === 'top'
                    ? this.projectTopForCanvas(canvas, kf.x, kf.z)
                    : this.projectFrontForCanvas(canvas, kf.x, kf.y + this.eyeHeightM);
                ctx.beginPath();
                ctx.arc(p.x, p.y, active ? 6.5 : 4.5, 0, Math.PI * 2);
                ctx.fillStyle = active ? '#4f8bff' : '#facc15';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#f3f7ff';
                ctx.stroke();
            });
        }
        if (selected) {
            const p = mode === 'top'
                ? this.projectTopForCanvas(canvas, selected.x, selected.z)
                : this.projectFrontForCanvas(canvas, selected.x, selected.y + this.eyeHeightM);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(69, 128, 255, 0.18)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = '#4f8bff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f3f7ff';
            ctx.stroke();
            if (mode === 'top') {
                const yawR = degToRad(selected.yaw);
                const hx = p.x + Math.sin(yawR) * 18;
                const hy = p.y + Math.cos(yawR) * 18;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(hx, hy);
                ctx.strokeStyle = '#4f8bff';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(hx, hy, 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(79, 139, 255, 0.22)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(hx, hy, 4.7, 0, Math.PI * 2);
                ctx.fillStyle = '#facc15';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#f3f7ff';
                ctx.stroke();
            } else {
                const pitchR = degToRad(selected.pitch);
                const hx = p.x + Math.cos(pitchR) * 18;
                const hy = p.y - Math.sin(pitchR) * 18;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(hx, hy);
                ctx.strokeStyle = '#4f8bff';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(hx, hy, 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(79, 139, 255, 0.22)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(hx, hy, 4.7, 0, Math.PI * 2);
                ctx.fillStyle = '#facc15';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#f3f7ff';
                ctx.stroke();
            }
        }
    }

    private cinematicPreviewCaptureQueued = 0;
    private cinematicSpeechAudio: HTMLAudioElement | null = null;
    private cinematicSpeechPlayingShotId: string | null = null;
    private cinematicSpeechLoadingShotId: string | null = null;
    private cinematicSpeechPlayedShotIds = new Set<string>();
    private cinematicSpeechLastShotId: string | null = null;
    private cinematicSpeechLastTimeSec: number | null = null;
    private cinematicTimelinePixelsPerSecond = 50;

    private async syncCinematicPreviewCamera() {
        const selected = this.selectedCinematicKeyframe();
        if (selected) {
            await this.options.setLiveCameraPose?.(this.cinematicPoseFromKeyframe(selected), clampFov(selected.fov, DEFAULT_POI_FOV));
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            return;
        }
        const current = this.cinematicKeyframeAtTime(this.cinematicCurrentTimeSec);
        if (!current) return;
        await this.options.setLiveCameraPose?.(this.cinematicPoseFromKeyframe(current.blended), clampFov(current.blended.fov, DEFAULT_POI_FOV));
        this.applyCwMediaForTime(current.currentTimeSec);
    }

    private scheduleCinematicPreviewCapture() {
        const token = Date.now();
        this.cinematicPreviewCaptureQueued = token;
        window.setTimeout(async () => {
            if (this.cinematicPreviewCaptureQueued !== token) return;
            if (!this.options.captureScreenshotPng) return;
            try {
                await this.syncCinematicPreviewCamera();
                if (this.cinematicPreviewCaptureQueued !== token) return;
                const shot = await this.options.captureScreenshotPng();
                if (this.cinematicPreviewCaptureQueued !== token) return;
                this.cinematicPreviewImageEl.src = shot;
            } catch {}
        }, 80);
    }

    private renderCinematicMap() {
        this.renderCinematicMapCanvas(this.cinematicTopCanvas, 'top');
        this.renderCinematicMapCanvas(this.cinematicFrontCanvas, 'front');
        const selected = this.selectedCinematicKeyframe();
        const shot = this.selectedCinematicShot();
        if (selected && shot) this.cinematicCurrentKfLabelEl.textContent = `K${shot.keyframes.findIndex((item) => item.keyframeId === selected.keyframeId) + 1} (t=${(selected.t * shot.durationSec).toFixed(2)}s)`;
        else this.cinematicCurrentKfLabelEl.textContent = 'K1 (t=0.00s)';
        this.scheduleCinematicPreviewCapture();
    }

    private resetCinematicDraftToDefaults() {
        this.selectedCinematicVersionId = null;
        this.cinematicSimplePrompt = DEFAULT_CINEMATIC_SIMPLE_PROMPT;
        this.cinematicPlannerPrompt = DEFAULT_CINEMATIC_PLANNER_PROMPT;
        this.cinematicSceneDescription = '';
        this.cinematicStoryBackground = '';
        this.cinematicStyleText = 'cinematic one take';
        this.cinematicTargetDurationSec = 14;
        this.cinematicPlan = null;
        this.cinematicBgmSelection = null;
        this.cinematicBgmDraft = null;
        this.cinematicBgmTimelineSelected = false;
        this.clearCinematicBgmRuntimeState();
        this.cinematicCurrentTimeSec = 0;
        this.selectedCinematicShotId = null;
        this.selectedCinematicKeyframeId = null;
        if (!this.cinematicSelectedPoiIds.length) {
            this.cinematicSelectedPoiIds = this.pois.slice(0, 4).map((poi) => poi.poiId);
        }
        this.syncCinematicInputsFromState();
    }

    private refreshCinematicUi() {
        this.ensureCinematicSelection();
        this.syncCinematicChrome();
        this.renderCinematicVersionList();
        this.renderCinematicPoiList();
        this.renderCinematicTimeline();
        this.renderCinematicKeyframeList();
        this.renderCinematicMap();
        this.drawViews();
        this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
    }

    private async loadCinematicVersionList(preferredVersionId?: number | null) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/cinematic/versions?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        this.cinematicVersions = Array.isArray(data?.versions) ? data.versions as CinematicVersionSummary[] : [];
        const targetId = preferredVersionId && this.cinematicVersions.some((item) => item.id === preferredVersionId)
            ? preferredVersionId
            : (this.cinematicVersions[0]?.id || null);
        this.selectedCinematicVersionId = targetId;
        this.renderCinematicVersionList();
        if (targetId) await this.loadCinematicVersionDetail(targetId);
        else {
            this.resetCinematicDraftToDefaults();
            this.refreshCinematicUi();
            this.setCinematicStatus('Using default prompt template');
        }
    }

    private async loadCinematicVersionDetail(versionId: number) {
        if (!this.requireModel(false)) return;
        const response = await fetch(`${this.apiBase()}/cinematic/versions/${encodeURIComponent(String(versionId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        const detail = data.version as CinematicVersionDetail;
        this.selectedCinematicVersionId = detail.id;
        this.cinematicSimplePrompt = detail.simplePrompt || DEFAULT_CINEMATIC_SIMPLE_PROMPT;
        this.cinematicPlannerPrompt = detail.plannerPrompt || DEFAULT_CINEMATIC_PLANNER_PROMPT;
        this.cinematicSceneDescription = detail.sceneDescription || '';
        this.cinematicStoryBackground = detail.storyBackground || '';
        this.cinematicStyleText = detail.styleText || 'cinematic one take';
        this.cinematicTargetDurationSec = Math.max(4, Number(detail.targetDurationSec || 14));
        this.cinematicSelectedPoiIds = Array.isArray(detail.selectedPoiIds) && detail.selectedPoiIds.length > 0
            ? detail.selectedPoiIds.filter(Boolean)
            : this.pois.slice(0, 4).map((poi) => poi.poiId);
        this.cinematicPlan = detail.plan || null;
        this.normalizeCinematicPlanMedia(this.cinematicPlan);
        this.cinematicBgmDraft = null;
        this.cinematicBgmTimelineSelected = false;
        if (this.cinematicPlan?.bgm && String(this.cinematicPlan.bgm.audioPath || '').trim()) {
            this.cinematicBgmSelection = {
                audioPath: String(this.cinematicPlan.bgm.audioPath || '').trim(),
                audioStartSeconds: Math.max(0, Number(this.cinematicPlan.bgm.audioStartSeconds) || 0),
                audioEndSeconds: Math.max(0, Number(this.cinematicPlan.bgm.audioEndSeconds) || 0),
                audioPlaybackRate: clampMusicRate(Number(this.cinematicPlan.bgm.audioPlaybackRate) || 1),
                targetMusicDurationSeconds: normalizeMusicDuration(this.cinematicPlan.bgm.targetMusicDurationSeconds),
                audioDisplayName: this.cinematicPlan.bgm.audioDisplayName ? String(this.cinematicPlan.bgm.audioDisplayName) : undefined,
                sourceKey: this.cinematicPlan.bgm.sourceKey ? String(this.cinematicPlan.bgm.sourceKey) : undefined,
                sourceType: this.cinematicPlan.bgm.sourceType || undefined,
                audioRelativePath: this.cinematicPlan.bgm.audioRelativePath ? String(this.cinematicPlan.bgm.audioRelativePath) : undefined,
                directoryName: this.cinematicPlan.bgm.directoryName ? String(this.cinematicPlan.bgm.directoryName) : undefined
            };
            this.cinematicPlan.bgm = { ...this.cinematicBgmSelection };
            if (this.cinematicBgmNeedsHandle(this.cinematicBgmSelection) && !this.cinematicBgmSelection.sourceKey) {
                this.logDebug('cine.bgm.orphan', `version=${detail.id} audioPath=${this.cinematicBgmSelection.audioPath} missing sourceKey; clearing orphan bgm`);
                this.clearCinematicBgmState();
                await this.persistCinematicBgmForSelectedVersion(null).catch(() => {});
            } else {
                try {
                    await this.cinematicBgmLoadAudio(this.cinematicBgmSelection.audioPath, this.cinematicBgmSelection.audioDisplayName, 'selection', this.cinematicBgmSelection);
                } catch (error) {
                    this.logDebug('cine.bgm.load.version', String(error));
                    this.clearCinematicBgmState();
                }
            }
        } else {
            this.clearCinematicBgmState();
        }
        this.applyStoredSpeechTimingToPlan(this.cinematicPlan);
        this.cinematicCurrentTimeSec = 0;
        this.syncCinematicInputsFromState();
        this.refreshCinematicUi();
        this.setCinematicStatus(`Loaded v${detail.versionNo}`);
    }

    private async persistCinematicBgmForSelectedVersion(config: CinematicBgmConfig | null) {
        if (!this.requireModel()) return;
        const versionId = this.selectedCinematicVersionId;
        if (!versionId) throw new Error('Please select a cinematic version first');
        const response = await fetch(`${this.apiBase()}/cinematic/versions/${encodeURIComponent(String(versionId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`);
        const detailData = await response.json().catch(() => ({}));
        if (!response.ok || !detailData?.ok || !detailData?.version) throw new Error(detailData?.error?.message || `HTTP ${response.status}`);
        const detail = detailData.version as CinematicVersionDetail;
        const plan = detail.plan ? structuredClone(detail.plan) as CinematicPlan : null;
        if (!plan) throw new Error('Current version has no cinematic plan');
        plan.bgm = this.cloneCinematicBgmConfig(config);
        const saveResponse = await fetch(`${this.apiBase()}/cinematic/versions/${encodeURIComponent(String(versionId))}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelFilename: detail.modelFilename || this.modelFilename,
                status: detail.status || 'draft',
                source: detail.source || 'edited',
                simplePrompt: detail.simplePrompt || DEFAULT_CINEMATIC_SIMPLE_PROMPT,
                plannerPrompt: detail.plannerPrompt || DEFAULT_CINEMATIC_PLANNER_PROMPT,
                sceneDescription: detail.sceneDescription || '',
                storyBackground: detail.storyBackground || '',
                styleText: detail.styleText || 'cinematic one take',
                targetDurationSec: Math.max(4, Number(detail.targetDurationSec || 14)),
                selectedPoiIds: Array.isArray(detail.selectedPoiIds) ? detail.selectedPoiIds.filter(Boolean) : [],
                plan,
                csvText: this.compileCinematicPlanToCsv(plan)
            })
        });
        const saveData = await saveResponse.json().catch(() => ({}));
        if (!saveResponse.ok || !saveData?.ok || !saveData?.version?.id) throw new Error(saveData?.error?.message || `HTTP ${saveResponse.status}`);
        if (this.cinematicPlan) this.cinematicPlan.bgm = this.cloneCinematicBgmConfig(config);
        this.selectedCinematicVersionId = Number(saveData.version.id) || this.selectedCinematicVersionId;
        this.renderCinematicVersionList();
    }

    private async saveCinematicBgm() {
        if (!this.cinematicBgmModal.classList.contains('hidden')) this.cinematicBgmSyncSelectionFromInputs();
        const current = this.cinematicEditingBgmConfig() || this.cinematicCurrentBgmConfig();
        if (!current || !String(current.audioPath || '').trim()) throw new Error('Please apply a BGM clip first');
        if (current.audioEndSeconds <= current.audioStartSeconds) throw new Error('Audio clip end must be greater than start');
        current.audioPlaybackRate = cinematicBgmEffectiveRate(current);
        this.cinematicBgmApplyConfig(current);
        this.cinematicBgmTimelineSelected = true;
        this.refreshCinematicUi();
        await this.persistCinematicBgmForSelectedVersion(current);
        this.setCinematicStatus('BGM saved to current version');
    }

    private async deleteCinematicBgm() {
        const versionId = this.selectedCinematicVersionId;
        if (!versionId) throw new Error('Please select a cinematic version first');
        this.clearCinematicBgmState();
        this.refreshCinematicUi();
        await this.persistCinematicBgmForSelectedVersion(null);
        this.closeCinematicBgmModal();
        this.setCinematicStatus('BGM deleted from current version');
    }

    private async saveCinematicVersion(asNew = false) {
        if (!this.requireModel()) return;
        this.syncCinematicStateFromInputs();
        if (this.cinematicPlan) this.cinematicPlan.bgm = this.cloneCinematicBgmConfig(this.cinematicBgmSelection || this.cinematicPlan.bgm || null);
        const body = {
            modelFilename: this.modelFilename,
            status: 'draft',
            source: this.cinematicPlan ? 'edited' : 'manual',
            simplePrompt: this.cinematicSimplePrompt,
            plannerPrompt: this.cinematicPlannerPrompt,
            sceneDescription: this.cinematicSceneDescription,
            storyBackground: this.cinematicStoryBackground,
            styleText: this.cinematicStyleText,
            targetDurationSec: this.cinematicTargetDurationSec,
            selectedPoiIds: this.cinematicSelectedPoiIds,
            plan: this.cinematicPlan,
            csvText: this.cinematicPlan ? this.compileCinematicPlanToCsv(this.cinematicPlan) : ''
        };
        const response = await fetch(asNew || !this.selectedCinematicVersionId
            ? `${this.apiBase()}/cinematic/versions`
            : `${this.apiBase()}/cinematic/versions/${encodeURIComponent(String(this.selectedCinematicVersionId))}`,
        {
            method: asNew || !this.selectedCinematicVersionId ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.version?.id) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCinematicVersionList(Number(data.version.id));
        this.setCinematicStatus(`Saved v${data.version.versionNo}`);
    }

    private async deleteSelectedCinematicVersion() {
        if (!this.requireModel()) return;
        const versionId = this.selectedCinematicVersionId;
        if (!versionId) {
            this.setCinematicStatus('No cinematic version selected');
            return;
        }
        const current = this.cinematicVersions.find((item) => item.id === versionId) || null;
        const confirmed = window.confirm(`Delete cinematic version v${current?.versionNo || versionId}?`);
        if (!confirmed) return;
        const response = await fetch(`${this.apiBase()}/cinematic/versions/${encodeURIComponent(String(versionId))}?modelFilename=${encodeURIComponent(String(this.modelFilename || ''))}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        await this.loadCinematicVersionList();
        this.setCinematicStatus(`Deleted v${current?.versionNo || versionId}`);
    }

    private expandCinematicPrompt() {
        this.syncCinematicStateFromInputs();
        const selectedSummary = this.pois
            .filter((poi) => this.cinematicSelectedPoiIds.includes(poi.poiId))
            .map((poi) => `${poi.poiName}(${poi.targetX.toFixed(2)},${poi.targetY.toFixed(2)},${poi.targetZ.toFixed(2)})`)
            .join(' -> ');
        this.cinematicPlannerPrompt = `${DEFAULT_CINEMATIC_PLANNER_PROMPT}\n\n用户工作流输入:\n${this.cinematicSimplePrompt}\n\n目标总时长:\n${this.cinematicTargetDurationSec}s\n\n选中POI:\n${selectedSummary || '未选择'}\n\n要求: 先生成可编辑时间轴, 让每个 shot 在横向时间轴上连续排列, 每个 keyframe 是时间轴上的单个点, 点与点之间驱动镜头运动。`;
        this.cinematicPlannerPromptInput.value = this.cinematicPlannerPrompt;
        this.setCinematicStatus('Planner prompt generated');
    }

    private cinematicPlanBounds() {
        return {
            top: { xMin: this.topBounds.xMin, xMax: this.topBounds.xMax, zMin: -this.topBounds.yMax, zMax: -this.topBounds.yMin },
            front: { xMin: this.frontBounds.xMin, xMax: this.frontBounds.xMax, yMin: this.frontBounds.yMin, yMax: this.frontBounds.yMax }
        };
    }

    private normalizeCinematicPlanMedia(plan: CinematicPlan | null) {
        if (!plan?.shots?.length) return;
        plan.shots.forEach((shot) => {
            const legacy = (shot as CinematicShot & { mediaObject?: CinematicMediaObjectConfig }).mediaObject;
            if (legacy && !shot.keyframes[0]?.mediaObject) {
                shot.keyframes[0].mediaObject = normalizeCwMediaObjectConfig(legacy);
            }
            shot.keyframes.forEach((keyframe) => {
                if (keyframe.mediaObject == null) return;
                keyframe.mediaObject = normalizeCwMediaObjectConfig(keyframe.mediaObject);
            });
            delete (shot as CinematicShot & { mediaObject?: CinematicMediaObjectConfig }).mediaObject;
        });
    }

    private cinematicTimelineOrderedKeyframes() {
        const metrics = this.cinematicTimelineData();
        return metrics?.keyframes || [];
    }

    private cinematicGlobalTimeForKeyframe(keyframeId: string) {
        const ordered = this.cinematicTimelineOrderedKeyframes();
        const hit = ordered.find((item) => item.keyframe.keyframeId === keyframeId);
        return hit ? hit.globalTimeSec : null;
    }

    private removeMediaObjectFromKeyframeForward(keyframeId: string) {
        const ordered = this.cinematicTimelineOrderedKeyframes();
        const startIndex = ordered.findIndex((item) => item.keyframe.keyframeId === keyframeId);
        if (startIndex < 0) return { cleared: 0, startIndex: -1 };
        let cleared = 0;
        for (let i = startIndex; i < ordered.length; i += 1) {
            const kf = ordered[i].keyframe;
            const media = kf.mediaObject ? normalizeCwMediaObjectConfig(kf.mediaObject) : null;
            if (!media?.enabled && !media?.src && !media?.placeholder) continue;
            kf.mediaObject = {
                enabled: false,
                src: '',
                fileName: '',
                anchorWorld: null,
                scale: media?.scale || 1.6,
                yaw: 0,
                pitch: 0,
                roll: 0,
                depthOffset: media?.depthOffset ?? 0.06,
                placeholder: false,
                placeholderLabel: ''
            };
            cleared += 1;
        }
        return { cleared, startIndex };
    }

    private cinematicLabelForKeyframeId(keyframeId: string | null) {
        if (!keyframeId) return 'unknown keyframe';
        const ordered = this.cinematicTimelineOrderedKeyframes();
        const index = ordered.findIndex((item) => item.keyframe.keyframeId === keyframeId);
        return index >= 0 ? `K${index + 1}` : keyframeId;
    }

    private cinematicEffectiveMediaForKeyframe(keyframeId: string | null) {
        if (!keyframeId) return { config: null as CinematicMediaObjectConfig | null, sourceKeyframeId: null as string | null };
        const ordered = this.cinematicTimelineOrderedKeyframes();
        let effective: CinematicMediaObjectConfig | null = null;
        let sourceKeyframeId: string | null = null;
        for (let i = 0; i < ordered.length; i += 1) {
            const keyframe = ordered[i].keyframe;
            if (keyframe.mediaObject != null) {
                const normalized = normalizeCwMediaObjectConfig(keyframe.mediaObject);
                keyframe.mediaObject = normalized;
                effective = normalized.enabled ? normalized : null;
                sourceKeyframeId = keyframe.keyframeId;
            }
            if (keyframe.keyframeId === keyframeId) break;
        }
        return { config: effective, sourceKeyframeId };
    }

    private cinematicEffectiveMediaAtTime(timeSec: number) {
        const current = this.cinematicKeyframeAtTime(timeSec);
        if (!current) return { config: null as CinematicMediaObjectConfig | null, sourceKeyframeId: null as string | null };
        const ordered = this.cinematicTimelineOrderedKeyframes();
        let effective: CinematicMediaObjectConfig | null = null;
        let sourceKeyframeId: string | null = null;
        for (let i = 0; i < ordered.length; i += 1) {
            const item = ordered[i];
            if (item.globalTimeSec > current.currentTimeSec + 1e-6) break;
            if (item.keyframe.mediaObject != null) {
                const normalized = normalizeCwMediaObjectConfig(item.keyframe.mediaObject);
                item.keyframe.mediaObject = normalized;
                effective = normalized.enabled ? normalized : null;
                sourceKeyframeId = item.keyframe.keyframeId;
            }
        }
        return { config: effective, sourceKeyframeId };
    }

    private ensureKeyframeMediaOverride(keyframe: CinematicKeyframe) {
        if (keyframe.mediaObject) {
            keyframe.mediaObject = normalizeCwMediaObjectConfig(keyframe.mediaObject);
            return keyframe.mediaObject;
        }
        const inherited = this.cinematicEffectiveMediaForKeyframe(keyframe.keyframeId).config;
        keyframe.mediaObject = normalizeCwMediaObjectConfig(inherited || null);
        return keyframe.mediaObject;
    }

    private describeCinematicMediaInheritance(keyframe: CinematicKeyframe) {
        const effective = this.cinematicEffectiveMediaForKeyframe(keyframe.keyframeId);
        if (keyframe.mediaObject) {
            return keyframe.mediaObject.enabled
                ? `Defined from ${this.cinematicLabelForKeyframeId(keyframe.keyframeId)}`
                : `Disabled from ${this.cinematicLabelForKeyframeId(keyframe.keyframeId)}`;
        }
        if (effective.sourceKeyframeId && effective.config) {
            return `Inherited from ${this.cinematicLabelForKeyframeId(effective.sourceKeyframeId)}`;
        }
        return 'No active 3D media object';
    }

    private activeCwMediaSpecAt(timeSec: number) {
        if (!this.cinematicWorkspaceOpen()) return null;
        const effective = this.cinematicEffectiveMediaAtTime(timeSec).config;
        if (!effective) return null;
        if (!effective.enabled || !effective.anchorWorld) return null;
        return {
            mode: 'media-object' as const,
            kind: 'video' as const,
            src: this.resolveAsset(effective.src),
            anchorWorld: effective.anchorWorld,
            scale: effective.scale,
            orientation: {
                yaw: effective.yaw,
                pitch: effective.pitch,
                roll: effective.roll
            },
            depthOffset: effective.depthOffset,
            selected: this.cinematicMediaEditor.active && this.cinematicMediaEditor.selected,
            placeholder: effective.placeholder === true || !effective.src,
            placeholderLabel: effective.placeholderLabel || '3D Media Placeholder',
            billboard: false
        };
    }

    private applyCwMediaForTime(timeSec: number) {
        const spec = this.activeCwMediaSpecAt(timeSec);
        this.options.showEmbeddedMedia?.(spec || null);
    }

    private cinematicMediaOrientationFromCurrentView(anchor: HotspotWorldPoint) {
        const live = this.options.getLiveCameraPose?.();
        if (!live) return { yaw: 0, pitch: 0, roll: 0 };
        const dx = live.pose.eye.x - anchor.x;
        const dy = live.pose.eye.y - anchor.y;
        const dz = live.pose.eye.z - anchor.z;
        const planar = Math.max(0.0001, Math.hypot(dx, dz));
        return {
            yaw: radToDeg(Math.atan2(dx, dz)),
            pitch: radToDeg(Math.atan2(dy, planar)),
            roll: 0
        };
    }

    private async uploadCinematicMediaFile(file: File) {
        const mimeType = String(file.type || '').trim() || 'application/octet-stream';
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const response = await fetch(`${this.apiBase()}/cinematic/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType, dataBase64: base64 })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.mediaUrl) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        return {
            src: String(data.mediaUrl || ''),
            fileName: String(data.fileName || file.name || 'video')
        };
    }

    private closeCinematicMediaPlace(statusText?: string) {
        if (!this.cinematicMediaPlace.active) return;
        if (this.cinematicMediaPlace.cleanup) {
            this.cinematicMediaPlace.cleanup();
            this.cinematicMediaPlace.cleanup = null;
        }
        this.cinematicMediaPlace.active = false;
        this.cinematicMediaPlace.pointerDown = false;
        this.cinematicMiniMode = this.cinematicMediaPlace.restoreMiniMode;
        this.syncCinematicChrome();
        if (this.cinematicMediaPlace.reopenKeyframeEditor) this.cinematicKeyframeModal.classList.remove('hidden');
        if (statusText) this.setCinematicStatus(statusText);
    }

    private cancelCinematicMediaPick(statusText?: string) {
        this.closeCinematicMediaPlace(statusText);
    }

    private cancelCinematicMediaResize(statusText?: string) {
        if (this.cinematicMediaResize.cleanup) {
            this.cinematicMediaResize.cleanup();
            this.cinematicMediaResize.cleanup = null;
        }
        this.cinematicMediaResize.active = false;
        this.cinematicMediaResize.pointerDown = false;
        if (statusText) this.setCinematicStatus(statusText);
    }

    private startCinematicMediaPick(keyframeId: string) {
        const canvas = this.options.getCaptureCanvas?.();
        const pick = this.options.pickWorldPointAtScreen;
        if (!canvas || !pick) {
            this.setCinematicStatus('Main view placing is unavailable');
            this.logDebug('cw.media.place', `unavailable canvas=${Boolean(canvas)} pick=${Boolean(pick)}`);
            return;
        }
        const keyframe = this.selectedCinematicKeyframe();
        if (!keyframe || keyframe.keyframeId !== keyframeId) {
            this.setCinematicStatus('Select the target keyframe first');
            this.logDebug('cw.media.place', `reject keyframe mismatch selected=${keyframe?.keyframeId || '-'} target=${keyframeId}`);
            return;
        }
        const media = this.ensureKeyframeMediaOverride(keyframe);
        if (!media.src) {
            this.setCinematicStatus('Choose a video file before placing the 3D object');
            this.logDebug('cw.media.place', `reject no video source keyframe=${keyframeId}`);
            return;
        }
        this.logDebug('cw.media.place', `start keyframe=${keyframeId} miniBefore=${this.cinematicMiniMode} src=${media.src}`);
        this.closeCinematicMediaEditor();
        this.closeCinematicMediaPlace();
        this.cinematicMediaPlace.active = true;
        this.cinematicMediaPlace.keyframeId = keyframeId;
        this.cinematicMediaPlace.restoreMiniMode = this.cinematicMiniMode;
        this.cinematicMediaPlace.reopenKeyframeEditor = !this.cinematicKeyframeModal.classList.contains('hidden');
        this.cinematicMiniMode = true;
        this.syncCinematicChrome();

        const prevCursor = canvas.style.cursor;
        canvas.style.cursor = 'crosshair';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') this.closeCinematicMediaPlace('Placing cancelled');
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!this.cinematicMediaPlace.active || this.cinematicMediaPlace.keyframeId !== keyframeId) return;
            event.preventDefault();
            event.stopPropagation();
            this.cinematicMediaPlace.pointerDown = true;
            this.cinematicMediaPlace.startClientX = event.clientX;
            this.cinematicMediaPlace.startClientY = event.clientY;
            this.cinematicMediaPlace.currentClientX = event.clientX;
            this.cinematicMediaPlace.currentClientY = event.clientY;
            const rect = canvas.getBoundingClientRect();
            const sx = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
            const sy = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
            this.logDebug('cw.media.place', `pointerdown client=(${event.clientX.toFixed(1)},${event.clientY.toFixed(1)}) norm=(${sx.toFixed(4)},${sy.toFixed(4)})`);
            void pick(sx, sy).then((point) => {
                if (this.cinematicMediaPlace.active && point) {
                    this.cinematicMediaPlace.startWorld = point;
                    this.logDebug('cw.media.place', `startWorld=(${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)})`);
                } else {
                    this.logDebug('cw.media.place', 'startWorld miss');
                }
            });
        };
        let moveLogAt = 0;
        const onPointerMove = (event: PointerEvent) => {
            if (!this.cinematicMediaPlace.active || !this.cinematicMediaPlace.pointerDown) return;
            event.preventDefault();
            event.stopPropagation();
            this.cinematicMediaPlace.currentClientX = Math.max(this.cinematicMediaPlace.startClientX + 4, event.clientX);
            this.cinematicMediaPlace.currentClientY = Math.max(this.cinematicMediaPlace.startClientY + 4, event.clientY);
            const widthPx = Math.max(8, this.cinematicMediaPlace.currentClientX - this.cinematicMediaPlace.startClientX);
            media.scale = clamp(widthPx / 120, 0.1, 120);
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            const now = performance.now();
            if (now - moveLogAt > 140) {
                moveLogAt = now;
                this.logDebug('cw.media.place', `drag widthPx=${widthPx.toFixed(1)} scale=${media.scale.toFixed(3)}`);
            }
        };
        const onPointerUp = (event: PointerEvent) => {
            if (!this.cinematicMediaPlace.active || !this.cinematicMediaPlace.pointerDown) return;
            event.preventDefault();
            event.stopPropagation();
            this.cinematicMediaPlace.pointerDown = false;
            const rect = canvas.getBoundingClientRect();
            const centerClientX = this.cinematicMediaPlace.startClientX + (this.cinematicMediaPlace.currentClientX - this.cinematicMediaPlace.startClientX) * 0.5;
            const centerClientY = this.cinematicMediaPlace.startClientY + (this.cinematicMediaPlace.currentClientY - this.cinematicMediaPlace.startClientY) * 0.5;
            const cx = clamp((centerClientX - rect.left) / Math.max(1, rect.width), 0, 1);
            const cy = clamp((centerClientY - rect.top) / Math.max(1, rect.height), 0, 1);
            const finalScale = clamp((this.cinematicMediaPlace.currentClientX - this.cinematicMediaPlace.startClientX) / 120, 0.1, 120);
            this.logDebug('cw.media.place', `pointerup centerNorm=(${cx.toFixed(4)},${cy.toFixed(4)}) dragPx=(${(this.cinematicMediaPlace.currentClientX - this.cinematicMediaPlace.startClientX).toFixed(1)},${(this.cinematicMediaPlace.currentClientY - this.cinematicMediaPlace.startClientY).toFixed(1)})`);
            void pick(cx, cy).then((centerPoint) => {
                const target = this.selectedCinematicKeyframe();
                if (!target || target.keyframeId !== keyframeId) return;
                const activeMedia = this.ensureKeyframeMediaOverride(target);
                activeMedia.enabled = true;
                activeMedia.anchorWorld = centerPoint || this.cinematicMediaPlace.startWorld || activeMedia.anchorWorld || { x: target.x, y: target.y, z: target.z };
                activeMedia.scale = finalScale;
                const orientation = this.cinematicMediaOrientationFromCurrentView(activeMedia.anchorWorld);
                activeMedia.yaw = orientation.yaw;
                activeMedia.pitch = orientation.pitch;
                activeMedia.roll = 0;
                this.renderCinematicKeyframeList();
                this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                this.logDebug('cw.media.place', `placed keyframe=${keyframeId} anchor=(${activeMedia.anchorWorld.x.toFixed(3)},${activeMedia.anchorWorld.y.toFixed(3)},${activeMedia.anchorWorld.z.toFixed(3)}) scale=${activeMedia.scale.toFixed(3)} fallbackCenter=${!centerPoint}`);
                this.closeCinematicMediaPlace('Placed 3D media object (drag from top-left corner).');
            });
        };
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };
        const onContext = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };
        canvas.addEventListener('pointerdown', onPointerDown, true);
        canvas.addEventListener('pointermove', onPointerMove, true);
        canvas.addEventListener('pointerup', onPointerUp, true);
        canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
        canvas.addEventListener('contextmenu', onContext, true);
        window.addEventListener('keydown', onKeyDown);
        this.cinematicMediaPlace.cleanup = () => {
            canvas.style.cursor = prevCursor;
            canvas.removeEventListener('pointerdown', onPointerDown, true);
            canvas.removeEventListener('pointermove', onPointerMove, true);
            canvas.removeEventListener('pointerup', onPointerUp, true);
            canvas.removeEventListener('wheel', onWheel, true);
            canvas.removeEventListener('contextmenu', onContext, true);
            window.removeEventListener('keydown', onKeyDown);
        };
        this.setCinematicStatus('Place mode: press as top-left corner, drag to set size, release to place. Camera is locked.');
        this.logDebug('cw.media.place', 'listeners attached on canvas');
    }

    private cinematicMediaEditorKeyframe() {
        if (!this.cinematicMediaEditor.keyframeId || !this.cinematicPlan?.shots?.length) return null;
        for (let i = 0; i < this.cinematicPlan.shots.length; i += 1) {
            const keyframe = this.cinematicPlan.shots[i].keyframes.find((row) => row.keyframeId === this.cinematicMediaEditor.keyframeId);
            if (keyframe) return keyframe;
        }
        return null;
    }

    private cinematicMediaEditorCurrentMedia() {
        const keyframe = this.cinematicMediaEditorKeyframe();
        if (!keyframe) return null;
        return this.ensureKeyframeMediaOverride(keyframe);
    }

    private cinematicMediaEditorPointerToScreenRatio(clientX: number, clientY: number) {
        const canvas = this.options.getCaptureCanvas?.();
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const x = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const y = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        return { x, y, width: rect.width, height: rect.height };
    }

    private cinematicMediaEditorPickHit(clientX: number, clientY: number) {
        const media = this.cinematicMediaEditorCurrentMedia();
        if (!media?.anchorWorld || !this.options.projectWorldToScreen) return false;
        const projected = this.options.projectWorldToScreen(media.anchorWorld);
        if (!projected?.visible) return false;
        const canvas = this.options.getCaptureCanvas?.();
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + projected.x * rect.width;
        const centerY = rect.top + projected.y * rect.height;
        const distance = Math.hypot(clientX - centerX, clientY - centerY);
        const threshold = 120;
        return distance <= threshold;
    }

    private cinematicMediaEditorMoveWithDelta(dxPx: number, dyPx: number) {
        const media = this.cinematicMediaEditorCurrentMedia();
        if (!media) return;
        const live = this.options.getLiveCameraPose?.();
        const canvas = this.options.getCaptureCanvas?.();
        if (!live || !canvas) return;
        const anchor = this.cinematicMediaEditor.startAnchor;
        const eye = live.pose.eye;
        const forwardRaw = live.pose.forward;
        const fMag = Math.hypot(forwardRaw.x, forwardRaw.y, forwardRaw.z) || 1;
        const forward = { x: forwardRaw.x / fMag, y: forwardRaw.y / fMag, z: forwardRaw.z / fMag };
        const worldUp = { x: 0, y: 1, z: 0 };
        const rightRaw = {
            x: worldUp.y * forward.z - worldUp.z * forward.y,
            y: worldUp.z * forward.x - worldUp.x * forward.z,
            z: worldUp.x * forward.y - worldUp.y * forward.x
        };
        const rMag = Math.hypot(rightRaw.x, rightRaw.y, rightRaw.z) || 1;
        const right = { x: rightRaw.x / rMag, y: rightRaw.y / rMag, z: rightRaw.z / rMag };
        const up = {
            x: forward.y * right.z - forward.z * right.y,
            y: forward.z * right.x - forward.x * right.z,
            z: forward.x * right.y - forward.y * right.x
        };
        const distance = Math.max(0.2, Math.hypot(anchor.x - eye.x, anchor.y - eye.y, anchor.z - eye.z));
        const worldPerPixel = (2 * distance * Math.tan(degToRad(live.fovDeg * 0.5))) / Math.max(1, canvas.clientHeight);
        const moveX = dxPx * worldPerPixel;
        const moveY = -dyPx * worldPerPixel;
        media.anchorWorld = {
            x: anchor.x + right.x * moveX + up.x * moveY,
            y: anchor.y + right.y * moveX + up.y * moveY,
            z: anchor.z + right.z * moveX + up.z * moveY
        };
    }

    private closeCinematicMediaEditor(status?: string) {
        if (!this.cinematicMediaEditor.active) return;
        if (this.cinematicMediaEditor.cleanup) {
            this.cinematicMediaEditor.cleanup();
            this.cinematicMediaEditor.cleanup = null;
        }
        this.cinematicMediaEditor.active = false;
        this.cinematicMediaEditor.selected = false;
        this.cinematicMediaEditor.pointerDown = false;
        this.cinematicMediaEditor.dragMode = null;
        if (this.cinematicMediaEditor.overlayEl) {
            this.cinematicMediaEditor.overlayEl.remove();
            this.cinematicMediaEditor.overlayEl = null;
        }
        this.cinematicMiniMode = this.cinematicMediaEditor.restoreMiniMode;
        this.syncCinematicChrome();
        if (this.cinematicMediaEditor.reopenKeyframeEditor) this.cinematicKeyframeModal.classList.remove('hidden');
        this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
        this.renderCinematicKeyframeList();
        if (status) this.setCinematicStatus(status);
    }

    private openCinematicMediaEditor(keyframeId: string) {
        if (!this.cinematicWorkspaceOpen()) return;
        if (!this.options.getCaptureCanvas || !this.options.pickWorldPointAtScreen) {
            this.setCinematicStatus('Main view editing is unavailable');
            this.logDebug('cw.media.edit', 'unavailable resources');
            return;
        }
        const shot = this.cinematicPlan?.shots.find((item) => item.keyframes.some((kf) => kf.keyframeId === keyframeId));
        const keyframe = shot?.keyframes.find((item) => item.keyframeId === keyframeId) || null;
        if (!keyframe) {
            this.setCinematicStatus('Select a keyframe first');
            this.logDebug('cw.media.edit', `reject missing keyframe=${keyframeId}`);
            return;
        }
        this.stopCinematicPreview();
        this.cancelCinematicMediaPick();
        this.cancelCinematicMediaResize();
        this.closeCinematicMediaEditor();
        this.cinematicMediaEditor.active = true;
        this.cinematicMediaEditor.keyframeId = keyframeId;
        this.cinematicMediaEditor.mode = 'move';
        const initialMedia = this.ensureKeyframeMediaOverride(keyframe);
        this.cinematicMediaEditor.selected = Boolean(initialMedia.anchorWorld);
        this.cinematicMediaEditor.restoreMiniMode = this.cinematicMiniMode;
        this.cinematicMediaEditor.reopenKeyframeEditor = !this.cinematicKeyframeModal.classList.contains('hidden');
        this.cinematicMiniMode = true;
        this.syncCinematicChrome();
        const canvas = this.options.getCaptureCanvas?.();
        if (!canvas) {
            this.closeCinematicMediaEditor('Main view editing is unavailable');
            return;
        }
        this.logDebug('cw.media.edit', `start keyframe=${keyframeId} selected=${this.cinematicMediaEditor.selected} anchor=${initialMedia.anchorWorld ? `${initialMedia.anchorWorld.x.toFixed(3)},${initialMedia.anchorWorld.y.toFixed(3)},${initialMedia.anchorWorld.z.toFixed(3)}` : 'none'} mode=${this.cinematicMediaEditor.mode}`);
        this.cinematicMediaEditor.overlayEl = null;
        const prevCursor = canvas.style.cursor;
        canvas.style.cursor = 'grab';

        const onWheel = (event: WheelEvent) => {
            if (!this.cinematicMediaEditor.active) return;
            event.preventDefault();
            event.stopPropagation();
            const media = this.cinematicMediaEditorCurrentMedia();
            if (!media) return;
            const step = event.deltaY < 0 ? 0.08 : -0.08;
            media.scale = clamp(media.scale + step, 0.1, 120);
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            this.renderCinematicKeyframeList();
            this.setCinematicStatus(`Scale ${media.scale.toFixed(2)} (camera locked, wheel)`);
            this.logDebug('cw.media.edit', `wheel scale=${media.scale.toFixed(3)}`);
        };

        const onPointerDown = (event: PointerEvent) => {
            if (!this.cinematicMediaEditor.active) return;
            event.preventDefault();
            event.stopPropagation();
            const media = this.cinematicMediaEditorCurrentMedia();
            if (!media) return;
            this.logDebug('cw.media.edit', `pointerdown mode=${this.cinematicMediaEditor.mode} client=(${event.clientX.toFixed(1)},${event.clientY.toFixed(1)})`);
            this.cinematicMediaEditor.pointerDown = true;
            this.cinematicMediaEditor.pointerId = event.pointerId;
            this.cinematicMediaEditor.dragMode = event.button === 2
                ? 'rotate'
                : (event.shiftKey ? 'scale' : this.cinematicMediaEditor.mode);
            this.cinematicMediaEditor.startClientX = event.clientX;
            this.cinematicMediaEditor.startClientY = event.clientY;
            this.cinematicMediaEditor.startYaw = media.yaw;
            this.cinematicMediaEditor.startPitch = media.pitch;
            this.cinematicMediaEditor.startRoll = media.roll;
            this.cinematicMediaEditor.startScale = media.scale;
            const anchor = media.anchorWorld || { x: keyframe.x, y: keyframe.y, z: keyframe.z };
            this.cinematicMediaEditor.startAnchor = { ...anchor };
            if (!media.anchorWorld) {
                const ratio = this.cinematicMediaEditorPointerToScreenRatio(event.clientX, event.clientY);
                if (!ratio) return;
                void this.options.pickWorldPointAtScreen?.(ratio.x, ratio.y).then((point) => {
                    if (!point) {
                        this.logDebug('cw.media.edit', 'pointerdown pick miss');
                        return;
                    }
                    media.anchorWorld = point;
                    this.cinematicMediaEditor.startAnchor = { ...point };
                    this.cinematicMediaEditor.selected = true;
                    media.enabled = true;
                    this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                    this.logDebug('cw.media.edit', `anchor auto-picked (${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)})`);
                    this.setCinematicStatus('3D object selected. Drag to move/rotate/scale with locked camera.');
                });
                return;
            }
            this.cinematicMediaEditor.selected = true;
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            if (!this.cinematicMediaEditor.selected) {
                this.setCinematicStatus('Click near the 3D screen to select it.');
                this.cinematicMediaEditor.pointerDown = false;
                return;
            }
            this.setCinematicStatus(`3D object selected. Mode: ${this.cinematicMediaEditor.dragMode?.toUpperCase() || this.cinematicMediaEditor.mode.toUpperCase()} (camera locked)`);
            this.logDebug('cw.media.edit', `selected dragMode=${this.cinematicMediaEditor.dragMode} button=${event.button}`);
        };

        let transformLogAt = 0;
        const onPointerMove = (event: PointerEvent) => {
            if (!this.cinematicMediaEditor.active || !this.cinematicMediaEditor.pointerDown || !this.cinematicMediaEditor.selected) return;
            event.preventDefault();
            event.stopPropagation();
            const media = this.cinematicMediaEditorCurrentMedia();
            if (!media) return;
            const dx = event.clientX - this.cinematicMediaEditor.startClientX;
            const dy = event.clientY - this.cinematicMediaEditor.startClientY;
            const mode = this.cinematicMediaEditor.dragMode || this.cinematicMediaEditor.mode;
            if (mode === 'move') {
                this.cinematicMediaEditorMoveWithDelta(dx, dy);
            }
            if (mode === 'rotate') {
                media.yaw = this.cinematicMediaEditor.startYaw + dx * 0.25;
                media.pitch = clamp(this.cinematicMediaEditor.startPitch - dy * 0.18, -89, 89);
            }
            if (mode === 'scale') {
                media.scale = clamp(this.cinematicMediaEditor.startScale + dx / 220, 0.1, 120);
            }
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            this.renderCinematicKeyframeList();
            const now = performance.now();
            if (now - transformLogAt > 140) {
                transformLogAt = now;
                this.logDebug('cw.media.edit', `drag mode=${mode} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} anchor=${media.anchorWorld ? `${media.anchorWorld.x.toFixed(3)},${media.anchorWorld.y.toFixed(3)},${media.anchorWorld.z.toFixed(3)}` : 'none'} yaw=${media.yaw.toFixed(2)} pitch=${media.pitch.toFixed(2)} scale=${media.scale.toFixed(3)}`);
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            if (!this.cinematicMediaEditor.active) return;
            event.preventDefault();
            event.stopPropagation();
            this.cinematicMediaEditor.pointerDown = false;
            this.cinematicMediaEditor.dragMode = null;
            this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
            this.renderCinematicKeyframeList();
            const media = this.cinematicMediaEditorCurrentMedia();
            this.logDebug('cw.media.edit', `pointerup mode=${this.cinematicMediaEditor.mode} final anchor=${media?.anchorWorld ? `${media.anchorWorld.x.toFixed(3)},${media.anchorWorld.y.toFixed(3)},${media.anchorWorld.z.toFixed(3)}` : 'none'} yaw=${media?.yaw.toFixed(2)} pitch=${media?.pitch.toFixed(2)} scale=${media?.scale.toFixed(3)}`);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                this.closeCinematicMediaEditor('3D object edit exited');
                return;
            }
            if (event.key === '1') this.cinematicMediaEditor.mode = 'move';
            if (event.key === '2') this.cinematicMediaEditor.mode = 'rotate';
            if (event.key === '3') this.cinematicMediaEditor.mode = 'scale';
            if (event.key === '1' || event.key === '2' || event.key === '3') {
                this.renderCinematicKeyframeList();
                this.setCinematicStatus(`3D object mode: ${this.cinematicMediaEditor.mode.toUpperCase()} (camera locked)`);
                this.logDebug('cw.media.edit', `hotkey mode=${this.cinematicMediaEditor.mode}`);
            }
        };

        const onContextMenu = (event: MouseEvent) => {
            if (!this.cinematicMediaEditor.active) return;
            event.preventDefault();
            event.stopPropagation();
        };
        canvas.addEventListener('pointerdown', onPointerDown, true);
        canvas.addEventListener('pointermove', onPointerMove, true);
        canvas.addEventListener('pointerup', onPointerUp, true);
        canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
        canvas.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        this.cinematicMediaEditor.cleanup = () => {
            canvas.style.cursor = prevCursor;
            canvas.removeEventListener('pointerdown', onPointerDown, true);
            canvas.removeEventListener('pointermove', onPointerMove, true);
            canvas.removeEventListener('pointerup', onPointerUp, true);
            canvas.removeEventListener('wheel', onWheel, true);
            canvas.removeEventListener('contextmenu', onContextMenu, true);
            window.removeEventListener('keydown', onKeyDown);
        };
        this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
        this.renderCinematicKeyframeList();
        this.setCinematicStatus('Object edit mode: camera locked. Select screen then drag to move/rotate/scale.');
        this.logDebug('cw.media.edit', 'listeners attached on canvas');
    }

    private cinematicTimelinePosition(clientX: number) {
        const inner = this.cinematicTimelineEl.querySelector('.otl-cinematic-ruler-inner') as HTMLDivElement | null;
        if (!inner) return null;
        const rect = inner.getBoundingClientRect();
        const totalSec = Number(inner.getAttribute('data-total-sec') || 0);
        if (!Number.isFinite(totalSec) || totalSec <= 0) return null;
        const inset = 18;
        const ratio = clamp((clientX - rect.left - inset) / Math.max(1, rect.width - inset * 2), 0, 1);
        return { totalSec, ratio };
    }

    private cinematicTimelineScrollbarHit(target: HTMLElement | null, clientY: number) {
        const trackWrap = target?.closest('.otl-cinematic-track-wrap') as HTMLDivElement | null;
        if (!trackWrap) return false;
        const hasHorizontalScrollbar = trackWrap.scrollWidth > trackWrap.clientWidth + 1;
        if (!hasHorizontalScrollbar) return false;
        const rect = trackWrap.getBoundingClientRect();
        const nativeScrollbarHeight = Math.max(14, Math.ceil(rect.height - trackWrap.clientHeight));
        return clientY >= rect.bottom - nativeScrollbarHeight;
    }

    private createCinematicMidKeyframe(from: TourPoi, to: TourPoi, shotId: string, suffix: string, t: number, mix = 0.5): CinematicKeyframe {
        const lerp = (a: number, b: number, m: number) => a + (b - a) * m;
        return {
            keyframeId: `${shotId}_${suffix}`,
            shotId,
            t,
            x: lerp(from.targetX, to.targetX, mix),
            y: lerp(from.targetY, to.targetY, mix),
            z: lerp(from.targetZ, to.targetZ, mix),
            yaw: lerp(from.targetYaw, to.targetYaw, mix),
            pitch: lerp(from.targetPitch, to.targetPitch, mix),
            fov: clampFov(lerp(from.targetFov, to.targetFov, mix) - 8, DEFAULT_POI_FOV),
            moveSpeedMps: Math.max(0.45, lerp(from.moveSpeedMps, to.moveSpeedMps, mix))
        };
    }

    private generateCinematicPlan() {
        this.syncCinematicStateFromInputs();
        const selected = this.pois
            .filter((poi) => this.cinematicSelectedPoiIds.includes(poi.poiId))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const source = selected.length >= 2 ? selected : this.pois.slice().sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 4);
        if (source.length < 2) throw new Error('Need at least 2 POIs for cinematic plan');
        const shots: CinematicShot[] = [];
        const total = Math.max(4, this.cinematicTargetDurationSec);
        const shotDefs = [
            { label: '建立推进', intent: 'establish', from: source[0], to: source[Math.min(1, source.length - 1)], duration: total * 0.22, pitchLift: 4, fovDrop: 6 },
            { label: '抬升揭示', intent: 'reveal', from: source[Math.min(1, source.length - 1)], to: source[Math.min(1, source.length - 1)], duration: total * 0.18, pitchLift: 18, fovDrop: 16 },
            { label: '继续深入', intent: 'approach', from: source[Math.min(1, source.length - 1)], to: source[Math.min(2, source.length - 1)], duration: total * 0.22, pitchLift: 0, fovDrop: 12 },
            { label: '侧移蓄势', intent: 'sidestep', from: source[Math.min(2, source.length - 1)], to: source[Math.min(3, source.length - 1)] || source[source.length - 1], duration: total * 0.18, pitchLift: -4, fovDrop: 10 },
            { label: '回望收束', intent: 'turnback', from: source[source.length - 2] || source[0], to: source[source.length - 1], duration: total * 0.20, pitchLift: 6, fovDrop: 2 }
        ];
        shotDefs.forEach((def, idx) => {
            const shotId = `shot_${idx + 1}`;
            const from = def.from;
            const to = def.to;
            const start: CinematicKeyframe = {
                keyframeId: `${shotId}_a`, shotId, t: 0,
                x: from.targetX, y: from.targetY, z: from.targetZ,
                yaw: from.targetYaw, pitch: from.targetPitch, fov: clampFov(from.targetFov), moveSpeedMps: Math.max(0.45, from.moveSpeedMps || 0.6)
            };
            const mid = this.createCinematicMidKeyframe(from, to, shotId, 'b', 0.56, 0.52);
            mid.pitch = clamp(mid.pitch + def.pitchLift, -50, 45);
            mid.fov = clampFov(mid.fov - def.fovDrop, DEFAULT_POI_FOV);
            const end: CinematicKeyframe = {
                keyframeId: `${shotId}_c`, shotId, t: 1,
                x: to.targetX, y: to.targetY, z: to.targetZ,
                yaw: to.targetYaw + (idx === shotDefs.length - 1 ? 0 : (idx % 2 === 0 ? -10 : 12)),
                pitch: clamp(to.targetPitch + def.pitchLift * 0.4, -50, 45),
                fov: clampFov(to.targetFov - def.fovDrop, DEFAULT_POI_FOV),
                moveSpeedMps: Math.max(0.45, to.moveSpeedMps || 0.6)
            };
            shots.push({
                shotId,
                label: def.label,
                intent: def.intent,
                durationSec: Number(def.duration.toFixed(2)),
                speechText: `${def.label}，让视线沿着山径与银河自然过渡。`,
                speechMode: 'INTERRUPTIBLE',
                speechMatchEnabled: false,
                speechAudioUrl: null,
                keyframes: [start, mid, end]
            });
        });
        this.cinematicPlan = {
            version: 'cine_v1',
            modelFilename: String(this.modelFilename || ''),
            selectedPoiIds: source.map((poi) => poi.poiId),
            sceneDescription: this.cinematicSceneDescription,
            storyBackground: this.cinematicStoryBackground,
            styleText: this.cinematicStyleText,
            targetDurationSec: total,
            bgm: this.cinematicBgmSelection ? { ...this.cinematicBgmSelection } : null,
            bounds: this.cinematicPlanBounds(),
            shots
        };
        this.applyPromptedMediaFallbackToPlan(this.cinematicPlan, this.cinematicPlannerPrompt || this.cinematicSimplePrompt);
        this.applyStoredSpeechTimingToPlan(this.cinematicPlan);
        this.cinematicCurrentTimeSec = 0;
        this.selectedCinematicShotId = shots[0]?.shotId || null;
        this.selectedCinematicKeyframeId = shots[0]?.keyframes[0]?.keyframeId || null;
        this.refreshCinematicUi();
        this.setCinematicStatus(`Plan generated with ${shots.length} shots`);
    }

    private applyPromptedMediaFallbackToPlan(plan: CinematicPlan, promptText: string) {
        if (!plan?.shots?.length || !plannerPromptRequestsMediaObject(promptText)) return;
        const hasExisting = plan.shots.some((shot) => shot.keyframes.some((kf) => kf.mediaObject?.enabled));
        if (hasExisting) return;
        const selected = this.pois
            .filter((poi) => plan.selectedPoiIds.includes(poi.poiId))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const anchorPoi = selected[Math.min(1, Math.max(0, selected.length - 1))] || selected[0] || null;
        if (!anchorPoi) return;
        const anchor = { x: anchorPoi.targetX, y: anchorPoi.targetY + 0.35, z: anchorPoi.targetZ };
        const firstShot = plan.shots[0];
        if (!firstShot?.keyframes?.length) return;
        firstShot.keyframes[0].mediaObject = normalizeCwMediaObjectConfig({
            enabled: true,
            src: '',
            fileName: '',
            anchorWorld: anchor,
            scale: 2.2,
            yaw: anchorPoi.targetYaw,
            pitch: 0,
            roll: 0,
            depthOffset: 0.06,
            placeholder: true,
            placeholderLabel: 'Generated 3D Media Placeholder'
        });
        if (plannerPromptRequestsOrbitLikeCamera(promptText) && firstShot.keyframes.length >= 3) {
            const orbitSamples = [
                { x: anchor.x - 1.8, y: anchor.y + 0.2, z: anchor.z - 2.6, yaw: -18, pitch: -8, fov: 92 },
                { x: anchor.x, y: anchor.y + 0.35, z: anchor.z - 2.1, yaw: 0, pitch: -6, fov: 86 },
                { x: anchor.x + 1.7, y: anchor.y + 0.15, z: anchor.z - 2.45, yaw: 18, pitch: -8, fov: 92 }
            ];
            firstShot.keyframes.forEach((kf, index) => {
                const sample = orbitSamples[Math.min(index, orbitSamples.length - 1)];
                kf.x = clamp(sample.x, plan.bounds.top.xMin, plan.bounds.top.xMax);
                kf.y = clamp(sample.y, plan.bounds.front.yMin, plan.bounds.front.yMax);
                kf.z = clamp(sample.z, plan.bounds.top.zMin, plan.bounds.top.zMax);
                kf.yaw = sample.yaw;
                kf.pitch = sample.pitch;
                kf.fov = sample.fov;
                kf.cameraBehavior = { type: 'orbit', target: 'mediaObject', radius: 2.4, angleDeg: sample.yaw, heightOffset: sample.y - anchor.y };
            });
        }
        this.logDebug('cine.timeline.media', 'frontend fallback injected media placeholder into plan');
    }

    private cinematicPoseFromKeyframe(kf: CinematicKeyframe): CameraPose {
        const yaw = degToRad(kf.yaw);
        const pitch = degToRad(kf.pitch);
        return {
            eye: { x: kf.x, y: kf.y + this.eyeHeightM, z: kf.z },
            forward: { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
        };
    }

    private stopCinematicPreview(statusText?: string) {
        if (this.cinematicPreview.rafId) window.cancelAnimationFrame(this.cinematicPreview.rafId);
        this.cinematicPreview = { playing: false, paused: false, rafId: 0, shotIndex: 0, keyframeIndex: 0, segmentStartMs: 0, segmentDurationMs: 0 };
        this.cinematicRecordingSubtitleText = '';
        this.stopCinematicSpeechPreview();
        this.cinematicBgmStopPreview();
        this.resetCinematicShotSpeechState();
        this.syncCinematicChrome();
        if (statusText) this.setCinematicStatus(statusText);
    }

    private async startCinematicPreview() {
        if (!this.cinematicPlan?.shots?.length) {
            this.setCinematicStatus('No cinematic plan to preview');
            return;
        }
        const metrics = this.cinematicTimelineData();
        if (!metrics) return;
        for (const shot of this.cinematicPlan.shots) {
            if (!String(shot.speechText || '').trim()) continue;
            try {
                await this.ensureShotSpeechAudio(shot);
            } catch (error) {
                this.logDebug('cine.speech.prefetch', String(error));
            }
        }
        if (this.cinematicCurrentTimeSec >= metrics.totalDurationSec - 0.001) {
            this.cinematicCurrentTimeSec = 0;
            this.drawViews();
        }
        this.stopPlayback();
        this.stopCinematicPreview();
        this.cinematicPreview.playing = true;
        this.cinematicBgmStartTimelinePlayback();
        this.syncCinematicChrome();
        const playbackStart = performance.now() - (this.cinematicCurrentTimeSec * 1000);
        const tick = (now: number) => {
            this.cinematicPreview.rafId = 0;
            if (!this.cinematicPreview.playing) return;
            const elapsedSec = (now - playbackStart) / 1000;
            if (elapsedSec >= metrics.totalDurationSec) {
                this.scrubCinematicTimeline(metrics.totalDurationSec, true);
                this.stopCinematicPreview('Preview finished');
                if (this.activeCinematicRecording && this.cinematicRecordingSettings.stopWithPlayback) {
                    void this.stopCinematicRecording(true, 'preview-finished');
                }
                return;
            }
            this.scrubCinematicTimeline(elapsedSec, false);
            this.cinematicPreview.rafId = window.requestAnimationFrame(tick);
        };
        this.cinematicPreview.rafId = window.requestAnimationFrame(tick);
        this.setCinematicStatus('Preview playing');
    }

    private setCinematicRecordingStatus(text: string) {
        this.cinematicRecordingModalStatusEl.textContent = text;
    }

    private closeCinematicRecordingConfigPopovers() {
        this.cinematicRecordingModalEl.querySelectorAll('[data-record-popover]').forEach((el) => el.classList.remove('open'));
    }

    private syncCinematicRecordingForm() {
        this.cinematicRecordingFrameRateSelect.value = String(this.cinematicRecordingSettings.frameRate);
        this.cinematicRecordingQualitySelect.value = this.cinematicRecordingSettings.videoBitsPerSecond >= 40_000_000
            ? 'ultra'
            : this.cinematicRecordingSettings.videoBitsPerSecond >= 28_000_000
                ? 'high'
                : 'standard';
        this.cinematicRecordingCompressionSelect.value = this.cinematicRecordingSettings.mp4CompressionPreset;
        this.cinematicRecordingIncludeTtsInput.checked = this.cinematicRecordingSettings.includeTts;
        this.cinematicRecordingAutoPlayInput.checked = this.cinematicRecordingSettings.autoPlay;
        this.cinematicRecordingStopWithPlaybackInput.checked = this.cinematicRecordingSettings.stopWithPlayback;
        this.cinematicRecordingHidePanelInput.checked = this.cinematicRecordingSettings.hidePanelDuringRecording;
        this.cinematicRecordingDisableInterruptsInput.checked = this.cinematicRecordingSettings.disableInterrupts;
        this.cinematicRecordingMasterVolumeInput.value = String(Math.round(this.cinematicRecordingSettings.masterVolume * 100));
        this.cinematicRecordingTtsVolumeInput.value = String(Math.round(this.cinematicRecordingSettings.ttsVolume * 100));
        this.cinematicRecordingBgmVolumeInput.value = String(Math.round(this.cinematicRecordingSettings.bgmVolume * 100));
        this.cinematicRecordingSubtitlesEnabledInput.checked = this.cinematicRecordingSettings.subtitlesEnabled;
        this.cinematicRecordingSubtitleFontSelect.value = this.cinematicRecordingSettings.subtitleFont;
        this.cinematicRecordingSubtitleSizeInput.value = String(this.cinematicRecordingSettings.subtitleFontSize);
        this.cinematicRecordingSubtitleColorInput.value = this.cinematicRecordingSettings.subtitleColor;
        this.cinematicRecordingMasterVolumeOut.textContent = `${this.cinematicRecordingMasterVolumeInput.value}%`;
        this.cinematicRecordingTtsVolumeOut.textContent = `${this.cinematicRecordingTtsVolumeInput.value}%`;
        this.cinematicRecordingBgmVolumeOut.textContent = `${this.cinematicRecordingBgmVolumeInput.value}%`;
        this.cinematicRecordingSubtitleSizeOut.textContent = `${this.cinematicRecordingSubtitleSizeInput.value}px`;
    }

    private collectCinematicRecordingSettings(): CinematicRecordingSettings {
        const quality = this.cinematicRecordingQualitySelect.value;
        const videoBitsPerSecond = quality === 'ultra' ? 40_000_000 : quality === 'high' ? 28_000_000 : 18_000_000;
        return {
            frameRate: Math.max(24, Number(this.cinematicRecordingFrameRateSelect.value || '24')),
            videoBitsPerSecond,
            audioBitsPerSecond: 256_000,
            mp4CompressionPreset: (this.cinematicRecordingCompressionSelect.value || 'balanced') as Mp4CompressionPreset,
            includeTts: this.cinematicRecordingIncludeTtsInput.checked,
            autoPlay: this.cinematicRecordingAutoPlayInput.checked,
            stopWithPlayback: this.cinematicRecordingStopWithPlaybackInput.checked,
            hidePanelDuringRecording: this.cinematicRecordingHidePanelInput.checked,
            disableInterrupts: this.cinematicRecordingDisableInterruptsInput.checked,
            masterVolume: Math.max(0, Math.min(1, Number(this.cinematicRecordingMasterVolumeInput.value || '100') / 100)),
            ttsVolume: Math.max(0, Math.min(1, Number(this.cinematicRecordingTtsVolumeInput.value || '100') / 100)),
            bgmVolume: Math.max(0, Math.min(1, Number(this.cinematicRecordingBgmVolumeInput.value || '50') / 100)),
            subtitlesEnabled: this.cinematicRecordingSubtitlesEnabledInput.checked,
            subtitleFont: this.cinematicRecordingSubtitleFontSelect.value || 'PingFang SC',
            subtitleFontSize: Math.max(24, Math.min(64, Number(this.cinematicRecordingSubtitleSizeInput.value || '26'))),
            subtitleColor: this.cinematicRecordingSubtitleColorInput.value || '#d7a733'
        };
    }

    private openCinematicRecordingModal() {
        this.syncCinematicRecordingForm();
        this.renderCinematicRecordingResults();
        this.closeCinematicRecordingConfigPopovers();
        this.setCinematicRecordingStatus('Ready to record.');
        this.cinematicRecordingModalEl.classList.remove('hidden');
    }

    private closeCinematicRecordingModal() {
        this.closeCinematicRecordingConfigPopovers();
        this.cinematicRecordingModalEl.classList.add('hidden');
    }

    private refreshCinematicRecordingButtons() {
        const recording = Boolean(this.activeCinematicRecording);
        const paused = Boolean(this.activeCinematicRecording?.paused);
        this.cinematicRecordBtn.classList.remove('hidden');
        this.cinematicRecordPauseBtn?.classList.add('hidden');
        this.cinematicRecordStopBtn?.classList.add('hidden');
        this.cinematicRecordBtn.classList.toggle('recording', recording && !paused);
        this.cinematicRecordBtn.classList.toggle('paused', recording && paused);
        this.cinematicRecordTimerEl.classList.toggle('active', recording);
        this.cinematicRecordTimerEl.classList.toggle('paused', recording && paused);
        this.cinematicRecordTimerEl.textContent = recording ? '00:00' : '';
    }

    private updateCinematicRecordTimer() {
        if (!this.activeCinematicRecording) {
            this.cinematicRecordTimerEl.textContent = '';
            return;
        }
        const pausedExtraMs = this.activeCinematicRecording.paused && this.activeCinematicRecording.pausedAt
            ? Math.max(0, performance.now() - this.activeCinematicRecording.pausedAt)
            : 0;
        const elapsedMs = Math.max(0, performance.now() - this.activeCinematicRecording.startedAt - this.activeCinematicRecording.pausedDurationMs - pausedExtraMs);
        const totalSec = Math.floor(elapsedMs / 1000);
        const minutes = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const seconds = (totalSec % 60).toString().padStart(2, '0');
        this.cinematicRecordTimerEl.textContent = `${minutes}:${seconds}`;
    }

    private startCinematicRecordTimer() {
        this.stopCinematicRecordTimer();
        this.updateCinematicRecordTimer();
        this.cinematicRecordTimerId = window.setInterval(() => this.updateCinematicRecordTimer(), 250);
    }

    private stopCinematicRecordTimer() {
        if (this.cinematicRecordTimerId) {
            window.clearInterval(this.cinematicRecordTimerId);
            this.cinematicRecordTimerId = 0;
        }
        this.updateCinematicRecordTimer();
    }

    private setCinematicRecordingUiLock(locked: boolean) {
        this.cinematicRecordingDisableUi = locked;
        this.cinematicWorkspacePanel.classList.toggle('recording-lock', locked);
    }

    private startCinematicRecordingCompositor(sourceCanvas: HTMLCanvasElement) {
        this.stopCinematicRecordingCompositor();
        const canvas = document.createElement('canvas');
        canvas.width = sourceCanvas.width || sourceCanvas.clientWidth || 1920;
        canvas.height = sourceCanvas.height || sourceCanvas.clientHeight || 1080;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create recording compositor context.');
        this.cinematicRecordingCompositorCanvas = canvas;
        this.cinematicRecordingCompositorCtx = ctx;

        const draw = () => {
            if (!this.cinematicRecordingCompositorCanvas || !this.cinematicRecordingCompositorCtx) return;
            this.options.requestCaptureRender?.();
            const target = this.cinematicRecordingCompositorCanvas;
            const targetCtx = this.cinematicRecordingCompositorCtx;
            targetCtx.clearRect(0, 0, target.width, target.height);
            targetCtx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
            if (this.cinematicRecordingSettings.subtitlesEnabled && this.cinematicRecordingSubtitleText.trim()) {
                const lines = this.wrapCinematicSubtitleText(this.cinematicRecordingSubtitleText.trim(), target.width * 0.76);
                const fontSize = this.cinematicRecordingSettings.subtitleFontSize;
                const lineHeight = Math.round(fontSize * 1.34);
                const padX = Math.round(fontSize * 0.68);
                const padY = Math.round(fontSize * 0.34);
                targetCtx.font = `600 ${fontSize}px "${this.cinematicRecordingSettings.subtitleFont}", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`;
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                const textWidth = Math.max(...lines.map((line) => targetCtx.measureText(line).width), 0);
                const boxWidth = Math.min(target.width * 0.86, textWidth + padX * 2);
                const boxHeight = lineHeight * lines.length + padY * 2;
                const x = (target.width - boxWidth) / 2;
                const y = target.height - boxHeight - Math.round(target.height * 0.055);
                this.drawCinematicRoundedRect(targetCtx, x, y, boxWidth, boxHeight, Math.round(fontSize * 0.38));
                targetCtx.fillStyle = 'rgba(0, 0, 0, 0.52)';
                targetCtx.fill();
                targetCtx.fillStyle = this.cinematicRecordingSettings.subtitleColor;
                lines.forEach((line, index) => {
                    targetCtx.fillText(line, target.width / 2, y + padY + lineHeight * index + lineHeight / 2);
                });
            }
            this.cinematicRecordingCompositorRaf = window.requestAnimationFrame(draw);
        };
        draw();
    }

    private stopCinematicRecordingCompositor() {
        if (this.cinematicRecordingCompositorRaf) {
            window.cancelAnimationFrame(this.cinematicRecordingCompositorRaf);
            this.cinematicRecordingCompositorRaf = 0;
        }
        this.cinematicRecordingCompositorCanvas = null;
        this.cinematicRecordingCompositorCtx = null;
        this.cinematicRecordingSubtitleText = '';
    }

    private wrapCinematicSubtitleText(text: string, maxWidth: number) {
        const ctx = this.cinematicRecordingCompositorCtx;
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
            if (ctx.measureText(next).width <= maxWidth || !current) current = next;
            else {
                lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines;
    }

    private drawCinematicRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    private toggleCinematicRecordingPause() {
        const runtime = this.activeCinematicRecording;
        if (!runtime) return;
        if (runtime.paused) {
            runtime.recorder.resume();
            if (runtime.pausedAt) {
                runtime.pausedDurationMs += Math.max(0, performance.now() - runtime.pausedAt);
                runtime.pausedAt = null;
            }
            runtime.paused = false;
            if (!this.cinematicPreview.playing && this.cinematicRecordingSettings.autoPlay) void this.startCinematicPreview();
            this.setCinematicStatus('Recording resumed.');
        } else {
            runtime.recorder.pause();
            runtime.paused = true;
            runtime.pausedAt = performance.now();
            if (this.cinematicPreview.playing) this.stopCinematicPreview('Preview paused');
            this.setCinematicStatus('Recording paused.');
        }
        this.refreshCinematicRecordingButtons();
        this.updateCinematicRecordTimer();
    }

    private formatCinematicRecordingEta(seconds: number | null | undefined) {
        if (!Number.isFinite(seconds ?? NaN) || (seconds ?? 0) < 0) return '--:--';
        const total = Math.max(0, Math.round(seconds || 0));
        const mins = Math.floor(total / 60).toString().padStart(2, '0');
        const secs = Math.floor(total % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    private formatCinematicRecordingHeartbeat(timestamp: number | null | undefined) {
        if (!timestamp) return 'waiting';
        const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        return `${seconds}s ago`;
    }

    private buildCinematicProcessingNote(entry: CinematicStoredRecordingEntry) {
        const percent = Math.max(0, Math.min(100, Number(entry.transcodePercent) || 0));
        const eta = this.formatCinematicRecordingEta(entry.transcodeEtaSec);
        const heartbeat = this.formatCinematicRecordingHeartbeat(entry.transcodeHeartbeatAt);
        const phase = this.describeCinematicTranscodePhase(entry.transcodePhase, entry.transcodeHeartbeatAt);
        return `MP4 ${percent.toFixed(0)}% · ${phase} · ETA ${eta} · heartbeat ${heartbeat}`;
    }

    private describeCinematicTranscodePhase(phase: string | undefined, heartbeatAt?: number | null) {
        const normalized = String(phase || '').trim().toLowerCase();
        const stalled = Number.isFinite(Number(heartbeatAt)) && Number(heartbeatAt) > 0 && (Date.now() - Number(heartbeatAt)) > 20_000;
        if (stalled && (normalized.startsWith('transcoding') || normalized.startsWith('analysis') || normalized.startsWith('preparing'))) {
            return 'stalled, auto-recovering';
        }
        if (!normalized || normalized === 'queued') return 'queued';
        if (normalized === 'preparing') return 'preparing';
        if (normalized === 'analysis') return 'analyzing bitrate';
        if (normalized === 'analysis_done') return 'analysis done';
        if (normalized === 'transcoding') return 'transcoding';
        if (normalized === 'finalizing') return 'finalizing mp4';
        if (normalized === 'done') return 'done';
        if (normalized === 'error') return 'error';
        if (normalized.startsWith('retrying_')) return `retry ${normalized.slice('retrying_'.length)}`;
        if (normalized.startsWith('fallback_pending_')) return `fallback ${normalized.slice('fallback_pending_'.length)}`;
        if (normalized.startsWith('transcoding_')) return `transcoding ${normalized.slice('transcoding_'.length)}`;
        if (normalized.startsWith('analysis_')) return `analyzing ${normalized.slice('analysis_'.length)}`;
        return normalized.replace(/_/g, ' ');
    }

    private async createCinematicTranscodeJob(blob: Blob, settings: CinematicRecordingSettings, width: number, height: number, durationSec: number) {
        const transcodeMeta = {
            frameRate: settings.frameRate,
            width,
            height,
            durationSec,
            compressionPreset: settings.mp4CompressionPreset,
            videoBitsPerSecond: settings.videoBitsPerSecond,
            audioBitsPerSecond: settings.audioBitsPerSecond
        };
        const response = await fetch(`${this.recordingApiBase()}/transcode/jobs`, {
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
            progress?: { percent?: number; etaSec?: number | null; heartbeatAt?: string; phase?: string };
        };
    }

    private async fetchCinematicTranscodeJob(jobId: string) {
        const response = await fetch(`${this.recordingApiBase()}/transcode/jobs/${encodeURIComponent(jobId)}`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = await response.json();
        return payload?.job as {
            status: 'pending' | 'running' | 'done' | 'error';
            progress?: { percent?: number; etaSec?: number | null; heartbeatAt?: string; phase?: string };
            error?: { message?: string } | null;
        };
    }

    private async fetchCinematicTranscodeJobResult(jobId: string) {
        const response = await fetch(`${this.recordingApiBase()}/transcode/jobs/${encodeURIComponent(jobId)}/result`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.blob();
    }

    private async transcodeCinematicRecordingEntry(entry: CinematicStoredRecordingEntry, settings: CinematicRecordingSettings, width: number, height: number) {
        this.setCinematicRecordingStatus('Uploading WebM to local backend for MP4 transcoding...');
        const createdJob = await this.createCinematicTranscodeJob(entry.blob, settings, width, height, entry.durationSec);
        await this.updateCinematicRecordingResult({
            ...entry,
            transcodeJobId: createdJob.jobId,
            transcodePercent: Number(createdJob.progress?.percent) || 0,
            transcodeEtaSec: createdJob.progress?.etaSec ?? null,
            transcodeHeartbeatAt: createdJob.progress?.heartbeatAt ? Date.parse(createdJob.progress.heartbeatAt) : Date.now(),
            transcodePhase: createdJob.progress?.phase || 'queued',
            note: this.buildCinematicProcessingNote({
                ...entry,
                transcodePercent: Number(createdJob.progress?.percent) || 0,
                transcodeEtaSec: createdJob.progress?.etaSec ?? null,
                transcodeHeartbeatAt: createdJob.progress?.heartbeatAt ? Date.parse(createdJob.progress.heartbeatAt) : Date.now()
            })
        });

        while (true) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            const job = await this.fetchCinematicTranscodeJob(createdJob.jobId);
            const heartbeatAt = job.progress?.heartbeatAt ? Date.parse(job.progress.heartbeatAt) : Date.now();
            const phaseLabel = this.describeCinematicTranscodePhase(job.progress?.phase, heartbeatAt);
            const progressEntry: CinematicStoredRecordingEntry = {
                ...entry,
                transcodeJobId: createdJob.jobId,
                transcodePercent: Number(job.progress?.percent) || 0,
                transcodeEtaSec: job.progress?.etaSec ?? null,
                transcodeHeartbeatAt: heartbeatAt,
                transcodePhase: job.progress?.phase || job.status,
                note: this.buildCinematicProcessingNote({
                    ...entry,
                    transcodePercent: Number(job.progress?.percent) || 0,
                    transcodeEtaSec: job.progress?.etaSec ?? null,
                    transcodeHeartbeatAt: heartbeatAt
                })
            };
            await this.updateCinematicRecordingResult(progressEntry);
            this.setCinematicRecordingStatus(`MP4 ${phaseLabel} ${Math.round(progressEntry.transcodePercent || 0)}% (ETA ${this.formatCinematicRecordingEta(progressEntry.transcodeEtaSec)})...`);
            if (job.status === 'done') {
                const mp4Blob = await this.fetchCinematicTranscodeJobResult(createdJob.jobId);
                return { mp4Blob, jobId: createdJob.jobId };
            }
            if (job.status === 'error') {
                throw new Error(job.error?.message || 'MP4 transcode job failed');
            }
        }
    }

    private openCinematicRecordingDb() {
        if (this.cinematicRecordingDbPromise) return this.cinematicRecordingDbPromise;
        this.cinematicRecordingDbPromise = new Promise((resolve, reject) => {
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
        return this.cinematicRecordingDbPromise;
    }

    private async loadCinematicRecordingResults() {
        try {
            const db = await this.openCinematicRecordingDb();
            const results = await new Promise<CinematicStoredRecordingEntry[]>((resolve, reject) => {
                const tx = db.transaction('recordings', 'readonly');
                const store = tx.objectStore('recordings');
                const request = store.getAll();
                request.onsuccess = () => resolve((request.result || []) as CinematicStoredRecordingEntry[]);
                request.onerror = () => reject(request.error || new Error('Failed to read recordings'));
            });
            this.cinematicRecordingResults = results.map((item) => ({
                ...item,
                status: item.status || (item.extension === 'mp4' ? 'ready' : 'mp4_failed'),
                transcodeJobId: item.transcodeJobId || undefined,
                transcodePercent: Number(item.transcodePercent) || 0,
                transcodeEtaSec: item.transcodeEtaSec ?? null,
                transcodeHeartbeatAt: item.transcodeHeartbeatAt ?? null,
                transcodePhase: item.transcodePhase || undefined,
                note: item.note || undefined
            })).sort((a, b) => b.createdAt - a.createdAt);
            this.renderCinematicRecordingResults();
            void this.recoverPendingCinematicRecordingEntries();
        } catch (error) {
            this.logDebug('record.load.error', String(error));
        }
    }

    private shouldRetryCinematicRecordingTranscode(entry: CinematicStoredRecordingEntry) {
        const extension = String(entry.extension || '').toLowerCase();
        const mimeType = String(entry.mimeType || '').toLowerCase();
        const isWebmSource = extension === 'webm' || mimeType.includes('webm');
        return isWebmSource && (entry.status === 'processing' || entry.status === 'mp4_failed');
    }

    private async recoverPendingCinematicRecordingEntries() {
        const pending = this.cinematicRecordingResults.filter((item) => this.shouldRetryCinematicRecordingTranscode(item) && !this.recoveringCinematicRecordingIds.has(item.id));
        for (const entry of pending) {
            this.recoveringCinematicRecordingIds.add(entry.id);
            try {
                const retryEntry: CinematicStoredRecordingEntry = {
                    ...entry,
                    status: 'processing',
                    transcodePhase: entry.status === 'mp4_failed' ? 'retrying' : (entry.transcodePhase || 'queued'),
                    note: this.buildCinematicProcessingNote({
                        ...entry,
                        status: 'processing',
                        transcodePhase: entry.status === 'mp4_failed' ? 'retrying' : (entry.transcodePhase || 'queued')
                    })
                };
                await this.updateCinematicRecordingResult(retryEntry);
                const recoveredSettings: CinematicRecordingSettings = {
                    ...this.cinematicRecordingSettings,
                    frameRate: 24,
                    videoBitsPerSecond: 18_000_000,
                    audioBitsPerSecond: 256_000
                };
                const { mp4Blob, jobId } = await this.transcodeCinematicRecordingEntry(entry, recoveredSettings, entry.width || 1920, entry.height || 1080);
                const mp4Meta = await this.captureCinematicRecordingThumbnail(mp4Blob);
                await this.updateCinematicRecordingResult({
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
                await this.registerCinematicMp4ToTourProducer(entry.name.replace(/\.[^.]+$/, '.mp4'), mp4Blob);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.updateCinematicRecordingResult({
                    ...entry,
                    status: 'mp4_failed',
                    transcodePhase: 'error',
                    note: `Recovered transcode failed: ${message}`
                });
            } finally {
                this.recoveringCinematicRecordingIds.delete(entry.id);
            }
        }
    }

    private async storeCinematicRecordingResult(entry: CinematicStoredRecordingEntry) {
        const db = await this.openCinematicRecordingDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to store recording'));
        });
    }

    private renderCinematicRecordingMeta(entry: CinematicStoredRecordingEntry) {
        const durationMin = Math.floor(entry.durationSec / 60).toString().padStart(2, '0');
        const durationSec = Math.floor(entry.durationSec % 60).toString().padStart(2, '0');
        const createdAt = new Date(entry.createdAt);
        const stamp = `${createdAt.getMonth() + 1}/${createdAt.getDate()} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
        return `${durationMin}:${durationSec} | ${entry.width}x${entry.height} | ${(entry.size / 1024 / 1024).toFixed(1)} MB | ${stamp}${entry.note ? ` | ${entry.note}` : ''}`;
    }

    private renderCinematicRecordingStatus(entry: CinematicStoredRecordingEntry) {
        const label = entry.status === 'ready'
            ? 'MP4 Ready'
            : entry.status === 'processing'
                ? `MP4 ${this.describeCinematicTranscodePhase(entry.transcodePhase, entry.transcodeHeartbeatAt)} ${Math.round(entry.transcodePercent || 0)}%`
                : 'WebM Fallback';
        const className = entry.status === 'ready'
            ? 'otl-cine-record-status'
            : entry.status === 'processing'
                ? 'otl-cine-record-status processing'
                : 'otl-cine-record-status warn';
        return { label, className };
    }

    private patchCinematicRecordingCard(entry: CinematicStoredRecordingEntry) {
        const card = this.cinematicRecordingResultsEl.querySelector(`[data-record-id="${entry.id}"]`) as HTMLDivElement | null;
        if (!card) return false;
        const statusEl = card.querySelector('[data-record-role="status"]') as HTMLDivElement | null;
        const nameEl = card.querySelector('[data-record-role="name"]') as HTMLDivElement | null;
        const metaEl = card.querySelector('[data-record-role="meta"]') as HTMLDivElement | null;
        const videoEl = card.querySelector('video') as HTMLVideoElement | null;
        const status = this.renderCinematicRecordingStatus(entry);
        if (statusEl) {
            statusEl.className = status.className;
            statusEl.textContent = status.label;
        }
        if (nameEl) nameEl.textContent = entry.name;
        if (metaEl) metaEl.textContent = this.renderCinematicRecordingMeta(entry);
        if (videoEl) videoEl.poster = entry.thumbnailDataUrl;
        return true;
    }

    private async updateCinematicRecordingResult(entry: CinematicStoredRecordingEntry) {
        const previous = this.cinematicRecordingResults.find((item) => item.id === entry.id) || null;
        await this.storeCinematicRecordingResult(entry);
        const index = this.cinematicRecordingResults.findIndex((item) => item.id === entry.id);
        if (index >= 0) this.cinematicRecordingResults[index] = entry;
        else {
            this.cinematicRecordingResults.unshift(entry);
            this.cinematicRecordingPageIndex = 0;
        }
        const blobChanged = Boolean(previous && previous.blob !== entry.blob);
        const structureChanged = !previous
            || previous.name !== entry.name
            || previous.status !== entry.status
            || blobChanged
            || previous.thumbnailDataUrl !== entry.thumbnailDataUrl;
        if (blobChanged) this.revokeCinematicRecordingObjectUrl(entry.id);
        this.cinematicRecordingResults.sort((a, b) => b.createdAt - a.createdAt);
        if (structureChanged || !this.patchCinematicRecordingCard(entry)) this.renderCinematicRecordingResults();
    }

    private async registerCinematicMp4ToTourProducer(name: string, blob: Blob) {
        if (String(blob.type || '').toLowerCase() !== 'video/mp4') return;
        try {
            const healthy = await fetch(`${this.producerApiBase()}/health`).then((res) => res.ok).catch(() => false);
            if (!healthy) return;
            const modelFilename = String(this.modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__';
            await fetch(`${this.producerApiBase()}/videos/register`, {
                method: 'POST',
                headers: {
                    'X-OT-Name': name,
                    'X-OT-Mime-Type': 'video/mp4',
                    'X-OT-Model-Filename': modelFilename
                },
                body: blob
            });
        } catch {
            // ignore sync failure
        }
    }

    private async backfillCinematicReadyMp4ToModelDb() {
        if (this.cinematicRecordingBackfillInProgress) return;
        this.cinematicRecordingBackfillInProgress = true;
        this.cinematicRecordingSyncToModelDbBtn.disabled = true;
        try {
            const healthy = await fetch(`${this.producerApiBase()}/health`).then((res) => res.ok).catch(() => false);
            if (!healthy) {
                this.setCinematicRecordingStatus('Sync failed: ot-tour-producer backend is offline (3035).');
                return;
            }
            const ready = this.cinematicRecordingResults.filter((item) => {
                const mime = String(item.mimeType || '').toLowerCase();
                return item.status === 'ready' && (mime === 'video/mp4' || item.extension === 'mp4') && item.blob instanceof Blob;
            });
            if (!ready.length) {
                this.setCinematicRecordingStatus('No MP4 READY recordings to sync.');
                return;
            }
            const modelFilename = String(this.modelFilename || '__UNSCOPED__').trim() || '__UNSCOPED__';
            let uploaded = 0;
            let skipped = 0;
            let failed = 0;
            for (let i = 0; i < ready.length; i += 1) {
                const item = ready[i];
                this.setCinematicRecordingStatus(`Sync MP4 to Model DB ${i + 1}/${ready.length}...`);
                try {
                    const response = await fetch(`${this.producerApiBase()}/videos/register`, {
                        method: 'POST',
                        headers: {
                            'X-OT-Name': String(item.name || `tour-recording-${item.createdAt}.mp4`),
                            'X-OT-Mime-Type': 'video/mp4',
                            'X-OT-Model-Filename': modelFilename
                        },
                        body: item.blob
                    });
                    if (!response.ok) {
                        failed += 1;
                        continue;
                    }
                    const payload = await response.json().catch((): null => null);
                    if (payload?.existed === true) {
                        skipped += 1;
                        continue;
                    }
                    uploaded += 1;
                } catch {
                    failed += 1;
                }
            }
            this.setCinematicRecordingStatus(`Sync done. uploaded=${uploaded}, skipped=${skipped}, failed=${failed}`);
        } finally {
            this.cinematicRecordingBackfillInProgress = false;
            this.cinematicRecordingSyncToModelDbBtn.disabled = false;
        }
    }

    private async deleteCinematicRecordingResult(recordingId: string) {
        const db = await this.openCinematicRecordingDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').delete(recordingId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to delete recording'));
        });
    }

    private async captureCinematicRecordingThumbnail(blob: Blob) {
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
            if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

    private getCinematicRecordingObjectUrl(entry: CinematicStoredRecordingEntry) {
        const existing = this.cinematicRecordingObjectUrls.get(entry.id);
        if (existing) return existing;
        const url = URL.createObjectURL(entry.blob);
        this.cinematicRecordingObjectUrls.set(entry.id, url);
        return url;
    }

    private revokeCinematicRecordingObjectUrl(recordingId: string) {
        const existing = this.cinematicRecordingObjectUrls.get(recordingId);
        if (!existing) return;
        URL.revokeObjectURL(existing);
        this.cinematicRecordingObjectUrls.delete(recordingId);
    }

    private getCinematicRecordingPageTotal() {
        if (this.cinematicRecordingResults.length < 1) return 1;
        return Math.ceil(this.cinematicRecordingResults.length / this.cinematicRecordingPageSize);
    }

    private clampCinematicRecordingPageIndex() {
        const totalPages = this.getCinematicRecordingPageTotal();
        if (this.cinematicRecordingPageIndex < 0) this.cinematicRecordingPageIndex = 0;
        if (this.cinematicRecordingPageIndex > totalPages - 1) this.cinematicRecordingPageIndex = totalPages - 1;
    }

    private renderCinematicRecordingResults() {
        this.clampCinematicRecordingPageIndex();
        const totalItems = this.cinematicRecordingResults.length;
        const totalPages = this.getCinematicRecordingPageTotal();
        const pageIndex = this.cinematicRecordingPageIndex;
        const start = pageIndex * this.cinematicRecordingPageSize;
        this.cinematicRecordingResultsEl.innerHTML = '';
        const visibleItems = this.cinematicRecordingResults.slice(start, start + this.cinematicRecordingPageSize);
        this.cinematicRecordingResultsEmptyEl.classList.toggle('hidden', totalItems > 0);
        this.cinematicRecordingPageLabelEl.textContent = totalItems > 0 ? `${pageIndex + 1} / ${totalPages}` : '0 / 0';
        this.cinematicRecordingPagePrevBtn.disabled = totalItems < 1 || pageIndex <= 0;
        this.cinematicRecordingPageNextBtn.disabled = totalItems < 1 || pageIndex >= totalPages - 1;
        for (let index = 0; index < this.cinematicRecordingPageSize; index += 1) {
            const item = visibleItems[index];
            if (!item) {
                const empty = document.createElement('div');
                empty.className = 'otl-cine-record-card-item';
                empty.style.minHeight = '220px';
                this.cinematicRecordingResultsEl.appendChild(empty);
                continue;
            }
            const card = document.createElement('div');
            card.className = 'otl-cine-record-card-item';
            card.dataset.recordId = item.id;
            const status = this.renderCinematicRecordingStatus(item);
            const objectUrl = this.getCinematicRecordingObjectUrl(item);
            card.innerHTML = `
                <video class="otl-cine-record-video" controls playsinline preload="metadata" src="${objectUrl}"></video>
                <div class="otl-cine-record-card-body">
                    <div class="otl-cine-record-name" data-record-role="name">${item.name}</div>
                    <div class="otl-cine-record-meta" data-record-role="meta">${this.renderCinematicRecordingMeta(item)}</div>
                    <div class="${status.className}" data-record-role="status">${status.label}</div>
                    <div class="otl-cine-record-actions"><button class="otl-cine-record-delete" data-action="delete" type="button">Delete</button></div>
                </div>
            `;
            const deleteBtn = card.querySelector('[data-action="delete"]') as HTMLButtonElement;
            deleteBtn.addEventListener('click', () => {
                void this.removeCinematicRecordingResult(item.id);
            });
            this.cinematicRecordingResultsEl.appendChild(card);
        }
    }

    private async addCinematicRecordingResult(
        blob: Blob,
        mimeType: string,
        extension: string,
        status: CinematicStoredRecordingEntry['status'],
        note?: string,
        options?: { durationSecFallback?: number }
    ) {
        const createdAt = Date.now();
        const meta = await this.captureCinematicRecordingThumbnail(blob);
        const resolvedDurationSec = meta.durationSec > 0
            ? meta.durationSec
            : Math.max(0, Number(options?.durationSecFallback) || 0);
        const entry: CinematicStoredRecordingEntry = {
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
        await this.storeCinematicRecordingResult(entry);
        this.cinematicRecordingResults.unshift(entry);
        this.cinematicRecordingPageIndex = 0;
        this.renderCinematicRecordingResults();
        return entry;
    }

    private async removeCinematicRecordingResult(recordingId: string) {
        const entry = this.cinematicRecordingResults.find((item) => item.id === recordingId);
        if (!entry) return;
        const confirmed = window.confirm(`Delete recording ${entry.name}? This removes saved MP4/WebM data permanently.`);
        if (!confirmed) return;
        await this.deleteCinematicRecordingResult(recordingId);
        this.cinematicRecordingResults = this.cinematicRecordingResults.filter((item) => item.id !== recordingId);
        this.revokeCinematicRecordingObjectUrl(recordingId);
        this.renderCinematicRecordingResults();
    }

    private async stopCinematicRecording(save = true, reason = 'manual-stop') {
        const runtime = this.activeCinematicRecording;
        if (!runtime) return;
        this.stopCinematicRecordTimer();
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
        this.stopCinematicRecordingCompositor();
        this.stopCinematicRecordingAudioMix();
        this.activeCinematicRecording = null;
        this.refreshCinematicRecordingButtons();
        this.setCinematicRecordingUiLock(false);
        if (this.cinematicRecordingHideRootOnStop) {
            this.cinematicWorkspaceModal.classList.remove('hidden');
            this.cinematicRecordingHideRootOnStop = false;
        }
        this.setCinematicStatus(save ? 'Recording complete. Saved to Recordings.' : 'Recording cancelled.');
        if (save && recordedBlob.size > 0) {
            this.setCinematicRecordingStatus('Recording finished. Saving WebM and preparing MP4...');
            const recordedDurationSec = Math.max(0, (performance.now() - runtime.startedAt) / 1000);
            let processingEntry: CinematicStoredRecordingEntry | null = null;
            try {
                processingEntry = await this.addCinematicRecordingResult(
                    recordedBlob,
                    runtime.mimeType,
                    runtime.extension,
                    'processing',
                    'MP4 0% · ETA --:-- · heartbeat 0s ago',
                    { durationSecFallback: recordedDurationSec }
                );
                this.setCinematicRecordingStatus('WebM saved. MP4 transcoding in progress...');
                const { mp4Blob, jobId } = await this.transcodeCinematicRecordingEntry(processingEntry, runtime.settings, this.options.getCaptureCanvas?.()?.width || 1920, this.options.getCaptureCanvas?.()?.height || 1080);
                const mp4Meta = await this.captureCinematicRecordingThumbnail(mp4Blob);
                await this.updateCinematicRecordingResult({
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
                await this.registerCinematicMp4ToTourProducer(processingEntry.name.replace(/\.[^.]+$/, '.mp4'), mp4Blob);
                this.setCinematicRecordingStatus('MP4 ready in Recordings.');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (processingEntry) {
                    await this.updateCinematicRecordingResult({
                        ...processingEntry,
                        status: 'mp4_failed',
                        transcodePhase: 'error',
                        note: `MP4 transcode failed: ${message}`
                    });
                }
                this.setCinematicRecordingStatus(`MP4 transcode failed. Kept WebM fallback. ${message}`);
            }
        }
        this.cinematicRecordingSubtitleText = '';
        if (this.cinematicRecordingSettings.stopWithPlayback && reason !== 'preview-finished' && this.cinematicPreview.playing) {
            this.stopCinematicPreview('Preview stopped');
        }
    }

    private async startCinematicRecording() {
        if (this.activeCinematicRecording) {
            await this.stopCinematicRecording(true, 'button-stop');
            return;
        }
        const canvas = this.options.getCaptureCanvas?.() || document.querySelector('canvas');
        if (!canvas) {
            this.setCinematicStatus('Recording failed: canvas unavailable.');
            return;
        }

        this.cinematicRecordingSettings = this.collectCinematicRecordingSettings();
        this.syncCinematicRecordingForm();
        const shouldCaptureAudio = this.cinematicRecordingSettings.includeTts || Boolean(this.cinematicCurrentBgmConfig());

        try {
            this.startCinematicRecordingCompositor(canvas as HTMLCanvasElement);
            const recordingCanvas = this.cinematicRecordingCompositorCanvas || (canvas as HTMLCanvasElement);
            const canvasStream = recordingCanvas.captureStream(this.cinematicRecordingSettings.frameRate);
            const outputStream = new MediaStream();
            const videoTrack = canvasStream.getVideoTracks()[0];
            if (!videoTrack) throw new Error('No canvas video track available');
            outputStream.addTrack(videoTrack);

            let audioTrack: MediaStreamTrack | null = null;
            if (shouldCaptureAudio) {
                const mix = await this.ensureCinematicRecordingAudioMix();
                if (this.cinematicBgmPreviewAudio) this.connectCinematicRecordingAudioElement(this.cinematicBgmPreviewAudio, 'bgm');
                if (this.cinematicSpeechAudio) this.connectCinematicRecordingAudioElement(this.cinematicSpeechAudio, 'speech');
                audioTrack = mix.destination.stream.getAudioTracks()[0] || null;
                if (!audioTrack) throw new Error('Failed to create cinematic recording audio mix track.');
            }
            if (audioTrack) outputStream.addTrack(audioTrack);

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                    ? 'video/webm;codecs=vp8,opus'
                    : 'video/webm';
            const chunks: BlobPart[] = [];
            const recorder = new MediaRecorder(outputStream, {
                mimeType,
                videoBitsPerSecond: this.cinematicRecordingSettings.videoBitsPerSecond,
                audioBitsPerSecond: this.cinematicRecordingSettings.audioBitsPerSecond
            });
            recorder.ondataavailable = (event) => {
                if (!event.data || event.data.size < 1 || !this.activeCinematicRecording) return;
                chunks.push(event.data);
                this.activeCinematicRecording.bytesWritten += event.data.size;
                const now = performance.now();
                if (now - this.activeCinematicRecording.lastProgressLogAt > 1000) {
                    this.activeCinematicRecording.lastProgressLogAt = now;
                }
            };

            this.activeCinematicRecording = {
                settings: this.cinematicRecordingSettings,
                recorder,
                stream: outputStream,
                displayStream: null,
                chunks,
                startedAt: performance.now(),
                mimeType,
                extension: 'webm',
                bytesWritten: 0,
                lastProgressLogAt: 0,
                paused: false,
                pausedAt: null,
                pausedDurationMs: 0
            };
            recorder.start(1000);
            this.closeCinematicRecordingModal();
            if (this.cinematicRecordingSettings.hidePanelDuringRecording) {
                this.cinematicWorkspaceModal.classList.add('hidden');
                this.cinematicRecordingHideRootOnStop = true;
            }
            if (this.cinematicRecordingSettings.disableInterrupts) {
                this.setCinematicRecordingUiLock(true);
            }
            this.refreshCinematicRecordingButtons();
            this.startCinematicRecordTimer();
            this.setCinematicStatus('Recording started.');
            this.setCinematicRecordingStatus('Recording WebM... MP4 will be produced after capture finishes.');
            if (this.cinematicRecordingSettings.autoPlay && !this.cinematicPreview.playing) {
                await this.startCinematicPreview();
            }
        } catch (error) {
            this.stopCinematicRecordingCompositor();
            this.stopCinematicRecordingAudioMix();
            this.activeCinematicRecording = null;
            this.stopCinematicRecordTimer();
            this.refreshCinematicRecordingButtons();
            this.cinematicWorkspaceModal.classList.remove('hidden');
            this.cinematicRecordingHideRootOnStop = false;
            this.setCinematicRecordingUiLock(false);
            const message = error instanceof Error ? error.message : String(error);
            this.setCinematicStatus(`Recording failed: ${message}`);
            this.setCinematicRecordingStatus(message);
        }
    }

    private compileCinematicPlanToCsv(plan: CinematicPlan) {
        const rows: string[] = [];
        rows.push(OT_TOUR_CSV_HEADERS.join(','));
        let seq = 1;
        let previousTarget: CinematicKeyframe | null = null;

        plan.shots.forEach((shot) => {
            const keyframes = shot.keyframes.slice().sort((a, b) => a.t - b.t);
            if (keyframes.length < 1) return;
            const speechText = String(shot.speechText || '').trim();
            const speechVoice = String(shot.speechMetrics?.ttsVoice || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE;
            const speechLang = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(speechText) ? 'zh-CN' : 'en-US';
            const firstKeyframe = keyframes[0];
            const needsBootstrap = !previousTarget
                || Math.hypot(firstKeyframe.x - previousTarget.x, firstKeyframe.y - previousTarget.y, firstKeyframe.z - previousTarget.z) > 0.0001
                || Math.abs(firstKeyframe.yaw - previousTarget.yaw) > 0.01
                || Math.abs(firstKeyframe.pitch - previousTarget.pitch) > 0.01
                || Math.abs(firstKeyframe.fov - previousTarget.fov) > 0.01;

            if (needsBootstrap) {
                rows.push([
                    OT_TOUR_CSV_VERSION,
                    seq++,
                    'LOOK',
                    shot.speechMode,
                    firstKeyframe.keyframeId,
                    `${shot.label}-K1`,
                    firstKeyframe.x.toFixed(3),
                    firstKeyframe.y.toFixed(3),
                    firstKeyframe.z.toFixed(3),
                    firstKeyframe.yaw.toFixed(2),
                    firstKeyframe.pitch.toFixed(2),
                    firstKeyframe.fov.toFixed(2),
                    '999.00',
                    '0',
                    '0',
                    '',
                    '',
                    '',
                    plan.modelFilename,
                    this.eyeHeightM.toFixed(2)
                ].map(escapeCsv).join(','));
                previousTarget = firstKeyframe;
            }

            for (let i = 0; i < keyframes.length; i += 1) {
                const kf = keyframes[i];
                const next = keyframes[i + 1] || null;
                const action = next ? 'MOVE' : 'LOOK';
                const rowSpeechText = i === 0 ? speechText : '';
                const rowSpeechLang = rowSpeechText ? speechLang : '';
                const rowSpeechVoice = rowSpeechText ? speechVoice : '';
                const target = next || kf;
                const segmentDurationMs = next
                    ? Math.max(0, Math.round(Math.max(0.12, Number(shot.durationSec) * Math.max(0.001, next.t - kf.t)) * 1000))
                    : 0;

                let moveSpeedMps = Math.max(0.001, Number(kf.moveSpeedMps) || 0.8);
                if (next) {
                    const dx = next.x - kf.x;
                    const dy = next.y - kf.y;
                    const dz = next.z - kf.z;
                    const distance = Math.hypot(dx, dy, dz);
                    const segmentRatio = Math.max(0.001, next.t - kf.t);
                    const segmentDurationSec = Math.max(0.12, Number(shot.durationSec) * segmentRatio);
                    const rawSpeedMps = distance / segmentDurationSec;
                    if (distance > 0.0001) {
                        moveSpeedMps = clamp(rawSpeedMps, 0.001, 12);
                    }
                    this.logDebug('cw.csv.compile', `shot=${shot.shotId} from=${kf.keyframeId} to=${next.keyframeId} distance=${distance.toFixed(3)} segmentRatio=${segmentRatio.toFixed(4)} shotDuration=${Number(shot.durationSec).toFixed(3)} expectedSec=${segmentDurationSec.toFixed(3)} segmentDurationMs=${segmentDurationMs} rawSpeed=${rawSpeedMps.toFixed(4)} csvSpeed=${moveSpeedMps.toFixed(4)}`);
                }

                const dwellMs = action === 'LOOK'
                    ? (i === keyframes.length - 1 ? 120 : 0)
                    : 0;

                rows.push([
                    OT_TOUR_CSV_VERSION,
                    seq++,
                    action,
                    shot.speechMode,
                    target.keyframeId,
                    `${shot.label}-K${next ? i + 2 : i + 1}`,
                    target.x.toFixed(3),
                    target.y.toFixed(3),
                    target.z.toFixed(3),
                    target.yaw.toFixed(2),
                    target.pitch.toFixed(2),
                    target.fov.toFixed(2),
                    moveSpeedMps.toFixed(4),
                    String(segmentDurationMs),
                    String(dwellMs),
                    rowSpeechText,
                    rowSpeechLang,
                    rowSpeechVoice,
                    plan.modelFilename,
                    this.eyeHeightM.toFixed(2)
                ].map(escapeCsv).join(','));
                previousTarget = target;
            }
        });
        return rows.join('\n');
    }

    private async compileCurrentCinematicPlanToCsvVersion() {
        if (!this.requireModel()) return;
        if (!this.cinematicPlan) throw new Error('No cinematic plan');
        const csvText = this.compileCinematicPlanToCsv(this.cinematicPlan);
        const response = await fetch(`${this.apiBase()}/csv/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename: this.modelFilename, csvText })
        });
        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            if (data?.ok) {
                this.setCinematicStatus(`Compiled to CSV v${data?.version?.versionNo || ''}`.trim());
                await this.loadCsvVersionList(Number(data?.version?.id || 0));
                return;
            }
        }
        throw new Error('Compile to CSV failed');
    }

    private cinematicWorkspaceOpen() {
        return !this.cinematicWorkspaceModal.classList.contains('hidden');
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
            this.hotspotController.activatePoi(this.selectedPoiId);
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
            this.hotspotController.activatePoi(this.selectedPoiId);
            this.debounceSave('poi-delete');
        });

        (this.root.querySelector('[data-act="goto-selected"]') as HTMLButtonElement).addEventListener('click', () => {
            const poi = this.selectedPoi();
            if (!poi) return;
            void this.moveToPoi(poi, 1).then(() => {
                this.hotspotController.activatePoi(poi.poiId);
                this.setStatus(`Arrived at ${poi.poiName}`);
            });
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
        this.root.querySelectorAll('[data-act="csv-timing-config"]').forEach((el) => {
            el.addEventListener('click', (event) => {
                const target = event.currentTarget as HTMLElement | null;
                this.attachCsvTimingModalToCurrentWorkspace(Boolean(target?.closest('[data-role="cinematic-workspace-panel"]')));
                this.renderCsvTimingConfig();
                this.csvTimingModal.classList.remove('hidden');
            });
        });
        this.root.querySelectorAll('[data-act="csv-voice-config"]').forEach((el) => {
            el.addEventListener('click', (event) => {
                const target = event.currentTarget as HTMLElement | null;
                this.attachCsvVoiceModalToCurrentWorkspace(Boolean(target?.closest('[data-role="cinematic-workspace-panel"]')));
                this.renderCsvVoiceConfig();
                this.csvVoiceModal.classList.remove('hidden');
            });
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
            this.csvVoiceConfig.enabled = this.csvVoiceEnabledInput.checked;
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
            const input = event.target as HTMLInputElement;
            if (input.type !== 'checkbox') return;
            const checked = input.checked;
            const val = input.value;
            let picked = [...this.csvVoiceConfig.voicePool];
            if (checked && !picked.includes(val)) picked.push(val);
            else if (!checked) picked = picked.filter(v => v !== val);
            this.csvVoiceConfig.voicePool = picked;
            this.csvVoiceConfig.enabled = this.csvVoiceEnabledInput.checked;
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
        (this.root.querySelector('[data-act="cinematic-workspace-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.closeCinematicWorkspace();
        });
        (this.root.querySelector('[data-act="cinematic-generate-prompt"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.generateCinematicPromptViaLlm().catch((error) => {
                this.logDebug('cine.prompt.error', String(error));
                this.setCinematicStatus(`Generate prompt failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-generate-plan"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.generateCinematicPlanViaLlm().catch((error) => {
                this.logDebug('cine.timeline.error', String(error));
                this.setCinematicStatus(`Generate plan failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-preview-toggle"]') as HTMLButtonElement).addEventListener('click', () => {
            if (this.activeCinematicRecording) {
                this.toggleCinematicRecordingPause();
                return;
            }
            if (this.cinematicPreview.playing) {
                this.stopCinematicPreview('Preview stopped');
            } else {
                void this.startCinematicPreview();
            }
        });
        (this.root.querySelector('[data-act="cinematic-preview-stop"]') as HTMLButtonElement).addEventListener('click', () => {
            if (this.activeCinematicRecording) {
                if (this.cinematicPreview.playing) {
                    this.stopCinematicPreview('Preview stopped');
                }
                void this.stopCinematicRecording(true, 'preview-stopped');
                return;
            }
            this.stopCinematicPreview('Preview stopped');
        });
        this.cinematicRecordBtn.addEventListener('click', () => {
            if (this.activeCinematicRecording) {
                return;
            }
            this.openCinematicRecordingModal();
        });
        this.cinematicRecordingModalEl.querySelector('[data-record-modal="close"]')?.addEventListener('click', () => this.closeCinematicRecordingModal());
        this.cinematicRecordingModalEl.querySelector('[data-record-modal="start"]')?.addEventListener('click', () => {
            void this.startCinematicRecording();
        });
        this.cinematicRecordingSyncToModelDbBtn.addEventListener('click', () => {
            void this.backfillCinematicReadyMp4ToModelDb();
        });
        this.cinematicRecordingPagePrevBtn.addEventListener('click', () => {
            if (this.cinematicRecordingPageIndex <= 0) return;
            this.cinematicRecordingPageIndex -= 1;
            this.renderCinematicRecordingResults();
        });
        this.cinematicRecordingPageNextBtn.addEventListener('click', () => {
            const totalPages = this.getCinematicRecordingPageTotal();
            if (this.cinematicRecordingPageIndex >= totalPages - 1) return;
            this.cinematicRecordingPageIndex += 1;
            this.renderCinematicRecordingResults();
        });
        this.cinematicRecordingModalEl.querySelectorAll('[data-record-popover-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverTrigger || '';
                const popover = this.cinematicRecordingModalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                if (!popover) return;
                const willOpen = !popover.classList.contains('open');
                this.closeCinematicRecordingConfigPopovers();
                if (willOpen) popover.classList.add('open');
            });
        });
        this.cinematicRecordingModalEl.querySelectorAll('[data-record-popover-close]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverClose || '';
                const popover = this.cinematicRecordingModalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                popover?.classList.remove('open');
            });
        });
        this.cinematicRecordingModalEl.addEventListener('click', (event) => {
            if (event.target === this.cinematicRecordingModalEl) {
                this.closeCinematicRecordingModal();
                return;
            }
            if (!(event.target as HTMLElement).closest('[data-record-popover]') && !(event.target as HTMLElement).closest('[data-record-popover-trigger]')) {
                this.closeCinematicRecordingConfigPopovers();
            }
        });
        const syncRecordingOut = (input: HTMLInputElement, output: HTMLSpanElement, suffix: string) => {
            input.addEventListener('input', () => {
                output.textContent = `${input.value}${suffix}`;
                this.cinematicRecordingSettings = this.collectCinematicRecordingSettings();
                if (this.cinematicSpeechAudio) {
                    this.cinematicSpeechAudio.volume = Math.max(0, Math.min(1, this.cinematicRecordingSettings.masterVolume * this.cinematicRecordingSettings.ttsVolume));
                }
                if (this.cinematicBgmPreviewAudio) {
                    this.cinematicBgmPreviewAudio.volume = Math.max(0, Math.min(1, this.cinematicRecordingSettings.masterVolume * this.cinematicRecordingSettings.bgmVolume));
                }
            });
        };
        syncRecordingOut(this.cinematicRecordingMasterVolumeInput, this.cinematicRecordingMasterVolumeOut, '%');
        syncRecordingOut(this.cinematicRecordingTtsVolumeInput, this.cinematicRecordingTtsVolumeOut, '%');
        syncRecordingOut(this.cinematicRecordingBgmVolumeInput, this.cinematicRecordingBgmVolumeOut, '%');
        syncRecordingOut(this.cinematicRecordingSubtitleSizeInput, this.cinematicRecordingSubtitleSizeOut, 'px');
        [
            this.cinematicRecordingSubtitlesEnabledInput,
            this.cinematicRecordingSubtitleFontSelect,
            this.cinematicRecordingSubtitleColorInput,
            this.cinematicRecordingFrameRateSelect,
            this.cinematicRecordingQualitySelect,
            this.cinematicRecordingCompressionSelect,
            this.cinematicRecordingIncludeTtsInput,
            this.cinematicRecordingAutoPlayInput,
            this.cinematicRecordingStopWithPlaybackInput,
            this.cinematicRecordingHidePanelInput,
            this.cinematicRecordingDisableInterruptsInput
        ].forEach((el) => {
            el.addEventListener('change', () => {
                this.cinematicRecordingSettings = this.collectCinematicRecordingSettings();
            });
        });
        (this.root.querySelector('[data-act="cinematic-save"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCinematicVersion().catch((error) => {
                this.setCinematicStatus(`Save failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-save-new"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCinematicVersion(true).catch((error) => {
                this.setCinematicStatus(`Save version failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-version-refresh"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.loadCinematicVersionList(this.selectedCinematicVersionId).catch((error) => {
                this.setCinematicStatus(`Refresh failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-version-delete"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.deleteSelectedCinematicVersion().catch((error) => {
                this.setCinematicStatus(`Delete failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-open-cw-csv"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.openCinematicCwCsvWorkspace().catch((error) => {
                this.setCinematicStatus(`Open CSV workspace failed: ${String(error)}`);
            });
        });
        this.cinematicCwCsvWorkspaceModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicCwCsvWorkspaceModal) this.cinematicCwCsvWorkspaceModal.classList.add('hidden');
        });
        const cwCsvHandle = this.cinematicCwCsvWorkspacePanel.querySelector('[data-role="cinematic-cw-csv-workspace-drag-handle"]') as HTMLDivElement;
        cwCsvHandle.addEventListener('pointerdown', (event) => {
            if (this.cinematicCwCsvWorkspaceFullscreen) return;
            const target = event.target as HTMLElement;
            if (target.closest('.otl-icon-btn') || target.closest('button')) return;
            const rect = this.cinematicCwCsvWorkspacePanel.getBoundingClientRect();
            this.cinematicCwCsvWorkspacePanel.classList.add('floating');
            this.cinematicCwCsvWorkspacePanel.style.left = `${rect.left}px`;
            this.cinematicCwCsvWorkspacePanel.style.top = `${rect.top}px`;
            this.cinematicCwCsvWorkspaceDrag = {
                active: true,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            cwCsvHandle.setPointerCapture(event.pointerId);
        });
        cwCsvHandle.addEventListener('pointermove', (event) => {
            if (!this.cinematicCwCsvWorkspaceDrag.active || event.pointerId !== this.cinematicCwCsvWorkspaceDrag.pointerId) return;
            const dx = event.clientX - this.cinematicCwCsvWorkspaceDrag.startX;
            const dy = event.clientY - this.cinematicCwCsvWorkspaceDrag.startY;
            const maxX = Math.max(0, window.innerWidth - this.cinematicCwCsvWorkspacePanel.offsetWidth);
            const maxY = Math.max(0, window.innerHeight - this.cinematicCwCsvWorkspacePanel.offsetHeight);
            const nextLeft = clamp(this.cinematicCwCsvWorkspaceDrag.left + dx, 0, maxX);
            const nextTop = clamp(this.cinematicCwCsvWorkspaceDrag.top + dy, 0, maxY);
            this.cinematicCwCsvWorkspacePanel.style.left = `${nextLeft}px`;
            this.cinematicCwCsvWorkspacePanel.style.top = `${nextTop}px`;
        });
        const stopCwCsvDrag = (event: PointerEvent) => {
            if (!this.cinematicCwCsvWorkspaceDrag.active || event.pointerId !== this.cinematicCwCsvWorkspaceDrag.pointerId) return;
            this.cinematicCwCsvWorkspaceDrag.active = false;
            try { cwCsvHandle.releasePointerCapture(event.pointerId); } catch {}
        };
        cwCsvHandle.addEventListener('pointerup', stopCwCsvDrag);
        cwCsvHandle.addEventListener('pointercancel', stopCwCsvDrag);
        this.cinematicCwCsvWorkspacePanel.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('button[data-act="cinematic-cw-csv-version-select"]') as HTMLButtonElement | null;
            if (!button) return;
            const versionId = Number(button.getAttribute('data-version-id') || '0');
            if (!versionId) return;
            void this.loadCinematicCwCsvVersionDetail(versionId).catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Load failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-workspace-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicCwCsvWorkspaceModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-workspace-fullscreen"]') as HTMLButtonElement).addEventListener('click', () => {
            this.setCinematicCwCsvWorkspaceFullscreen(!this.cinematicCwCsvWorkspaceFullscreen);
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-version-generate"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.generateCinematicCwCsvVersion().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Generate failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-version-save"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCinematicCwCsvVersion().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Save failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-version-save-new"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCinematicCwCsvVersionAsNew().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Save as new failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-version-delete"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.deleteCinematicCwCsvVersion().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Delete failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-version-download"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.downloadCinematicCwCsvVersion().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Download failed: ${String(error)}`);
            });
        });
        this.root.querySelectorAll('[data-act="cinematic-cw-csv-voice-config"]').forEach((el) => {
            el.addEventListener('click', () => {
                this.renderCinematicCwCsvVoiceConfig();
                this.cinematicCwCsvVoiceModal.classList.remove('hidden');
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-voice-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicCwCsvVoiceModal.classList.add('hidden');
            this.renderCinematicCwCsvVoiceConfig();
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-voice-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicCwCsvVoiceModal.classList.add('hidden');
            this.renderCinematicCwCsvVoiceConfig();
        });
        this.cinematicCwCsvVoiceModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicCwCsvVoiceModal) this.cinematicCwCsvVoiceModal.classList.add('hidden');
        });
        this.cinematicCwCsvVoiceModelSelect.addEventListener('change', () => {
            this.cinematicCwCsvVoiceConfig.model = this.cinematicCwCsvVoiceModelSelect.value || DEFAULT_TTS_MODEL;
            const options = TTS_VOICE_OPTIONS_BY_MODEL[this.cinematicCwCsvVoiceConfig.model] || [];
            if (!options.some((item) => item.value === this.cinematicCwCsvVoiceConfig.fixedVoice)) {
                this.cinematicCwCsvVoiceConfig.fixedVoice = options[0]?.value || DEFAULT_TTS_VOICE;
            }
            this.cinematicCwCsvVoiceConfig.voicePool = this.cinematicCwCsvVoiceConfig.voicePool.filter((item) => options.some((opt) => opt.value === item));
            this.renderCinematicCwCsvVoiceConfig();
        });
        this.cinematicCwCsvVoiceFixedSelect.addEventListener('change', () => {
            this.cinematicCwCsvVoiceConfig.fixedVoice = this.cinematicCwCsvVoiceFixedSelect.value || DEFAULT_TTS_VOICE;
            this.renderCinematicCwCsvVoiceConfig();
        });
        this.cinematicCwCsvVoiceEnabledInput.addEventListener('change', () => {
            this.cinematicCwCsvVoiceConfig.enabled = this.cinematicCwCsvVoiceEnabledInput.checked;
            this.renderCinematicCwCsvVoiceConfig();
        });
        this.cinematicCwCsvVoiceListEl.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            if (target.getAttribute('data-role') !== 'cinematic-cw-csv-voice-item') return;
            const value = String(target.value || '').trim();
            if (!value) return;
            if (target.checked) {
                if (!this.cinematicCwCsvVoiceConfig.voicePool.includes(value)) this.cinematicCwCsvVoiceConfig.voicePool.push(value);
            }
            else {
                this.cinematicCwCsvVoiceConfig.voicePool = this.cinematicCwCsvVoiceConfig.voicePool.filter((item) => item !== value);
            }
            this.renderCinematicCwCsvVoiceConfig();
        });
        this.root.querySelectorAll('[data-act="cinematic-cw-csv-timing-config"]').forEach((el) => {
            el.addEventListener('click', () => {
                this.renderCinematicCwCsvTimingConfig();
                this.cinematicCwCsvTimingModal.classList.remove('hidden');
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-timing-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicCwCsvTimingModal.classList.add('hidden');
            this.renderCinematicCwCsvTimingConfig();
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-timing-estimate"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.estimateCinematicCwCsvTiming().catch((error) => {
                this.setCinematicCwCsvWorkspaceStatus(`Timing estimate failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-timing-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicCwCsvTimingModal.classList.add('hidden');
            this.renderCinematicCwCsvTimingConfig();
        });
        this.cinematicCwCsvTimingModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicCwCsvTimingModal) this.cinematicCwCsvTimingModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-content-cancel"]') as HTMLButtonElement).addEventListener('click', () => {
            this.closeCinematicCwCsvContentEditor();
        });
        (this.root.querySelector('[data-act="cinematic-cw-csv-content-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.saveCinematicCwCsvContentEditor();
        });
        (this.root.querySelector('[data-act="cinematic-open-simple-prompt"]') as HTMLButtonElement).addEventListener('click', () => {
            this.openCinematicPromptModal('simple');
        });
        (this.root.querySelector('[data-act="cinematic-open-complex-prompt"]') as HTMLButtonElement).addEventListener('click', () => {
            this.openCinematicPromptModal('complex');
        });
        (this.root.querySelector('[data-act="cinematic-open-keyframe-editor"]') as HTMLButtonElement).addEventListener('click', () => {
            this.openCinematicKeyframeEditor();
        });
        (this.root.querySelector('[data-act="cinematic-open-shot-editor"]') as HTMLButtonElement).addEventListener('click', () => {
            this.openCinematicShotEditor();
        });
        (this.root.querySelector('[data-act="cinematic-open-bgm"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicBgmTimelineSelected = true;
            this.refreshCinematicUi();
            void this.openCinematicBgmModal().catch((error) => this.setCinematicStatus(`Open BGM failed: ${String(error)}`));
        });
        (this.root.querySelector('[data-act="cinematic-keyframe-editor-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicKeyframeModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="cinematic-shot-editor-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicShotModal.classList.add('hidden');
        });
        (this.root.querySelector('[data-act="cinematic-open-poi-picker"]') as HTMLButtonElement).addEventListener('click', () => {
            this.openCinematicPoiPicker();
        });
        (this.root.querySelector('[data-act="cinematic-poi-picker-close"]') as HTMLButtonElement).addEventListener('click', () => {
            this.closeCinematicPoiPicker();
        });
        (this.root.querySelector('[data-act="cinematic-poi-picker-cancel"]') as HTMLButtonElement).addEventListener('click', () => {
            this.closeCinematicPoiPicker();
        });
        (this.root.querySelector('[data-act="cinematic-poi-picker-save"]') as HTMLButtonElement).addEventListener('click', () => {
            this.saveCinematicPoiPicker();
        });
        this.cinematicMiniToggleBtn.addEventListener('click', () => {
            this.cinematicMiniMode = !this.cinematicMiniMode;
            this.syncCinematicChrome();
            this.renderCinematicTimeline();
        });
        this.cinematicMiniPlayBtn.addEventListener('click', () => {
            if (this.cinematicPreview.playing) {
                this.stopCinematicPreview('Preview stopped');
                if (this.activeCinematicRecording && this.cinematicRecordingSettings.stopWithPlayback) {
                    void this.stopCinematicRecording(true, 'preview-stopped');
                }
            }
            else void this.startCinematicPreview();
        });
        const fullscreenBtn = this.root.querySelector('[data-act="cinematic-workspace-fullscreen"]') as HTMLButtonElement | null;
        fullscreenBtn?.addEventListener('click', () => {
            if (!this.cinematicWorkspaceFullscreen) {
                const left = Number.parseFloat(this.cinematicWorkspacePanel.style.left || '0');
                const top = Number.parseFloat(this.cinematicWorkspacePanel.style.top || '0');
                if (Number.isFinite(left) && Number.isFinite(top)) {
                    this.cinematicWorkspaceFloatPos = { left, top, initialized: true };
                }
            }
            this.cinematicWorkspaceFullscreen = !this.cinematicWorkspaceFullscreen;
            if (this.cinematicWorkspaceFullscreen) {
                this.cinematicWorkspacePanel.classList.add('fullscreen');
                this.cinematicWorkspacePanel.classList.remove('floating');
                this.cinematicWorkspacePanel.style.left = '';
                this.cinematicWorkspacePanel.style.top = '';
            } else {
                this.cinematicWorkspacePanel.classList.remove('fullscreen');
                if (this.cinematicWorkspaceFloatPos.initialized) this.pinCinematicWorkspacePanel();
                else {
                    this.cinematicWorkspacePanel.classList.remove('floating');
                    this.cinematicWorkspacePanel.style.left = '';
                    this.cinematicWorkspacePanel.style.top = '';
                }
            }
        });
        this.cinematicSimplePromptInput.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicPlannerPromptInput.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicSimplePromptEditor.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicComplexPromptEditor.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicSceneInput.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicStoryInput.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicStyleInput.addEventListener('input', () => this.syncCinematicStateFromInputs());
        this.cinematicDurationInput.addEventListener('change', () => this.syncCinematicStateFromInputs());
        this.cinematicPoiListEl.addEventListener('change', () => {
            const picked = Array.from(this.cinematicPoiListEl.querySelectorAll('[data-role="cinematic-poi-item"]:checked'))
                .map((item) => String((item as HTMLInputElement).value || ''));
            this.cinematicPoiDraftIds = picked;
            this.renderCinematicPoiList();
        });
        this.cinematicPoiPickerModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicPoiPickerModal) this.closeCinematicPoiPicker();
        });
        this.cinematicMiniTimelineEl.addEventListener('click', (event) => {
            const metrics = this.cinematicTimelineData();
            if (!metrics) return;
            const rect = this.cinematicMiniTimelineEl.getBoundingClientRect();
            const ratio = clamp((event.clientX - rect.left - 12) / Math.max(1, rect.width - 24), 0, 1);
            this.scrubCinematicTimeline(metrics.totalDurationSec * ratio, false);
        });
        this.cinematicVersionListEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('button[data-act="cinematic-version-select"]') as HTMLButtonElement | null;
            if (!button) return;
            const id = Number(button.getAttribute('data-version-id') || 0);
            if (!id) return;
            void this.loadCinematicVersionDetail(id).catch((error) => this.setCinematicStatus(`Load failed: ${String(error)}`));
        });
        const promptVersionClick = (event: Event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('button[data-act="cinematic-version-select"]') as HTMLButtonElement | null;
            if (!button) return;
            const id = Number(button.getAttribute('data-version-id') || 0);
            if (!id) return;
            void this.loadCinematicVersionDetail(id).catch((error) => this.setCinematicStatus(`Load failed: ${String(error)}`));
        };
        this.cinematicSimpleVersionListEl.addEventListener('click', promptVersionClick);
        this.cinematicComplexVersionListEl.addEventListener('click', promptVersionClick);
        this.cinematicTimelineEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (this.cinematicTimelineScrollbarHit(target, event.clientY)) return;
            const keyButton = target.closest('button[data-act="cinematic-keyframe-select"]') as HTMLButtonElement | null;
            if (keyButton) {
                this.cinematicBgmTimelineSelected = false;
                this.selectedCinematicKeyframeId = String(keyButton.getAttribute('data-keyframe-id') || '');
                const timeSec = Number(keyButton.getAttribute('data-time-sec') || 0);
                this.scrubCinematicTimeline(timeSec, true);
                return;
            }
            const bgmButton = target.closest('[data-act="cinematic-bgm-edit"]') as HTMLButtonElement | null;
            if (bgmButton) {
                this.cinematicBgmTimelineSelected = true;
                this.syncCinematicTimelineState();
                return;
            }
            const shotButton = target.closest('button[data-act="cinematic-shot-select"]') as HTMLButtonElement | null;
            if (shotButton) {
                this.cinematicBgmTimelineSelected = false;
                this.selectedCinematicShotId = String(shotButton.getAttribute('data-shot-id') || '');
                const timeSec = Number(shotButton.getAttribute('data-start-sec') || 0);
                this.scrubCinematicTimeline(timeSec, true);
                return;
            }
            if (this.cinematicBgmTimelineSelected) {
                this.cinematicBgmTimelineSelected = false;
                this.syncCinematicTimelineState();
            }
            const position = this.cinematicTimelinePosition(event.clientX);
            if (!position) return;
            this.scrubCinematicTimeline(position.totalSec * position.ratio, false);
        });
        this.cinematicTimelineEl.addEventListener('dblclick', (event) => {
            const target = event.target as HTMLElement;
            const bgmButton = target.closest('[data-act="cinematic-bgm-edit"]') as HTMLButtonElement | null;
            if (bgmButton) {
                this.cinematicBgmTimelineSelected = true;
                this.refreshCinematicUi();
                const current = this.cinematicCurrentBgmConfig();
                if (current?.audioPath) {
                    void this.cinematicBgmLoadAudio(current.audioPath, current.audioDisplayName, 'selection').catch((error) => {
                        this.setCinematicStatus(`Load BGM failed: ${String(error)}`);
                    });
                }
                void this.openCinematicBgmModal().catch((error) => this.setCinematicStatus(`Open BGM failed: ${String(error)}`));
                return;
            }
            const keyButton = target.closest('button[data-act="cinematic-keyframe-select"]') as HTMLButtonElement | null;
            if (keyButton) {
                this.cinematicBgmTimelineSelected = false;
                this.selectedCinematicKeyframeId = String(keyButton.getAttribute('data-keyframe-id') || '');
                this.scrubCinematicTimeline(Number(keyButton.getAttribute('data-time-sec') || 0), true);
                this.openCinematicKeyframeEditor();
                return;
            }
            const shotButton = target.closest('[data-act="cinematic-shot-select"]') as HTMLDivElement | null;
            if (shotButton) {
                this.cinematicBgmTimelineSelected = false;
                this.selectedCinematicShotId = String(shotButton.getAttribute('data-shot-id') || '');
                this.scrubCinematicTimeline(Number(shotButton.getAttribute('data-start-sec') || 0), true);
                this.openCinematicShotEditor();
            }
        });
        this.cinematicTimelineEl.addEventListener('pointerdown', (event) => {
            const target = event.target as HTMLElement;
            if (this.cinematicTimelineScrollbarHit(target, event.clientY)) return;
            const dot = target.closest('button[data-act="cinematic-keyframe-select"]') as HTMLButtonElement | null;
            if (dot) {
                this.cinematicTimelineKeyframeDrag = {
                    active: true,
                    pointerId: event.pointerId,
                    keyframeId: String(dot.getAttribute('data-keyframe-id') || ''),
                    shotId: String(dot.getAttribute('data-shot-id') || '')
                };
                this.selectedCinematicKeyframeId = this.cinematicTimelineKeyframeDrag.keyframeId;
                this.selectedCinematicShotId = this.cinematicTimelineKeyframeDrag.shotId;
                this.cinematicTimelineEl.setPointerCapture(event.pointerId);
                return;
            }
            this.cinematicTimelineDrag = { active: true, pointerId: event.pointerId };
            this.cinematicTimelineEl.setPointerCapture(event.pointerId);
            const position = this.cinematicTimelinePosition(event.clientX);
            if (!position) return;
            this.stopCinematicPreview();
            this.scrubCinematicTimeline(position.totalSec * position.ratio, false);
        });
        this.cinematicTimelineEl.addEventListener('pointermove', (event) => {
            if (this.cinematicTimelineKeyframeDrag.active && event.pointerId === this.cinematicTimelineKeyframeDrag.pointerId) {
                const position = this.cinematicTimelinePosition(event.clientX);
                if (!position) return;
                const targetSec = position.totalSec * position.ratio;
                this.updateKeyframeTimeByGlobalTime(this.cinematicTimelineKeyframeDrag.shotId, this.cinematicTimelineKeyframeDrag.keyframeId, targetSec);
                this.scrubCinematicTimeline(targetSec, false);
                return;
            }
            if (!this.cinematicTimelineDrag.active || event.pointerId !== this.cinematicTimelineDrag.pointerId) return;
            const position = this.cinematicTimelinePosition(event.clientX);
            if (!position) return;
            this.scrubCinematicTimeline(position.totalSec * position.ratio, false);
        });
        const endCinematicTimelineDrag = (event: PointerEvent) => {
            if (this.cinematicTimelineKeyframeDrag.active && event.pointerId === this.cinematicTimelineKeyframeDrag.pointerId) {
                this.cinematicTimelineKeyframeDrag = { active: false, pointerId: -1, keyframeId: '', shotId: '' };
                if (this.cinematicTimelineEl.hasPointerCapture(event.pointerId)) this.cinematicTimelineEl.releasePointerCapture(event.pointerId);
                return;
            }
            if (!this.cinematicTimelineDrag.active || event.pointerId !== this.cinematicTimelineDrag.pointerId) return;
            this.cinematicTimelineDrag.active = false;
            if (this.cinematicTimelineEl.hasPointerCapture(event.pointerId)) this.cinematicTimelineEl.releasePointerCapture(event.pointerId);
        };
        this.cinematicTimelineEl.addEventListener('pointerup', endCinematicTimelineDrag);
        this.cinematicTimelineEl.addEventListener('pointercancel', endCinematicTimelineDrag);
        const cinematicEditorClick = (event: Event) => {
            const target = event.target as HTMLElement;
            const speechBtn = target.closest('button[data-act="cinematic-shot-play-speech"]') as HTMLButtonElement | null;
            if (speechBtn) {
                const shotId = String(speechBtn.getAttribute('data-shot-id') || '');
                if (!shotId) return;
                void this.previewCinematicShotSpeech(shotId).catch((error) => {
                    this.stopCinematicSpeechPreview();
                    this.renderCinematicKeyframeList();
                    this.setCinematicStatus(`Speech preview failed: ${String(error)}`);
                });
                return;
            }
            const mediaBtn = target.closest('button[data-act^="cinematic-kf-media-"]') as HTMLButtonElement | null;
            if (mediaBtn) {
                const keyframeId = String(mediaBtn.getAttribute('data-keyframe-id') || this.selectedCinematicKeyframeId || '');
                const shot = this.cinematicPlan?.shots.find((item) => item.keyframes.some((kf) => kf.keyframeId === keyframeId)) || null;
                const keyframe = shot?.keyframes.find((item) => item.keyframeId === keyframeId) || null;
                if (!keyframe) return;
                const act = String(mediaBtn.getAttribute('data-act') || '');
                if (act === 'cinematic-kf-media-choose-video') {
                    this.cinematicMediaFileTargetKeyframeId = keyframeId;
                    this.cinematicMediaFileInput.click();
                    return;
                }
                if (act === 'cinematic-kf-media-pick-main') {
                    this.startCinematicMediaPick(keyframeId);
                    return;
                }
                if (act === 'cinematic-kf-media-toggle-editor') {
                    if (this.cinematicMediaEditor.active) this.closeCinematicMediaEditor('3D object edit exited');
                    else this.openCinematicMediaEditor(keyframeId);
                    return;
                }
                if (act === 'cinematic-kf-media-mode-move') {
                    if (!this.cinematicMediaEditor.active) this.openCinematicMediaEditor(keyframeId);
                    this.cinematicMediaEditor.mode = 'move';
                    this.renderCinematicKeyframeList();
                    this.setCinematicStatus('3D object mode: MOVE');
                    this.logDebug('cw.media.edit', `ui mode=move active=${this.cinematicMediaEditor.active}`);
                    return;
                }
                if (act === 'cinematic-kf-media-mode-rotate') {
                    if (!this.cinematicMediaEditor.active) this.openCinematicMediaEditor(keyframeId);
                    this.cinematicMediaEditor.mode = 'rotate';
                    this.renderCinematicKeyframeList();
                    this.setCinematicStatus('3D object mode: ROTATE');
                    this.logDebug('cw.media.edit', `ui mode=rotate active=${this.cinematicMediaEditor.active}`);
                    return;
                }
                if (act === 'cinematic-kf-media-mode-scale') {
                    if (!this.cinematicMediaEditor.active) this.openCinematicMediaEditor(keyframeId);
                    this.cinematicMediaEditor.mode = 'scale';
                    this.renderCinematicKeyframeList();
                    this.setCinematicStatus('3D object mode: SCALE');
                    this.logDebug('cw.media.edit', `ui mode=scale active=${this.cinematicMediaEditor.active}`);
                    return;
                }
                if (act === 'cinematic-kf-media-clear-anchor') {
                    const media = this.ensureKeyframeMediaOverride(keyframe);
                    media.anchorWorld = null;
                    this.renderCinematicKeyframeList();
                    this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                    return;
                }
                if (act === 'cinematic-kf-media-remove') {
                    this.stopCinematicPreview();
                    this.closeCinematicMediaEditor();
                    const cleared = this.removeMediaObjectFromKeyframeForward(keyframeId);
                    const removeTime = this.cinematicGlobalTimeForKeyframe(keyframeId);
                    if (Number.isFinite(removeTime)) {
                        this.scrubCinematicTimeline(removeTime as number, true);
                    } else {
                        this.renderCinematicKeyframeList();
                        this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                    }
                    this.options.showEmbeddedMedia?.(null);
                    this.logDebug('cw.media.remove.scope', `from=${this.cinematicLabelForKeyframeId(keyframeId)} startIndex=${cleared.startIndex}`);
                    this.logDebug('cw.media.remove.clearedCount', `cleared=${cleared.cleared}`);
                    this.logDebug('cw.media.remove', `remove keyframe=${keyframeId} time=${removeTime ?? 'unknown'} immediate=true`);
                    this.setCinematicStatus(`3D media removed from ${this.cinematicLabelForKeyframeId(keyframeId)} onward (${cleared.cleared} keyframes)`);
                    return;
                }
                if (act === 'cinematic-kf-media-align-view') {
                    const media = this.ensureKeyframeMediaOverride(keyframe);
                    if (!media.anchorWorld) {
                        media.anchorWorld = { x: keyframe.x, y: keyframe.y, z: keyframe.z };
                    }
                    const orientation = this.cinematicMediaOrientationFromCurrentView(media.anchorWorld);
                    media.yaw = orientation.yaw;
                    media.pitch = orientation.pitch;
                    media.roll = 0;
                    this.renderCinematicKeyframeList();
                    this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                    this.setCinematicStatus('3D media aligned to current camera view');
                    return;
                }
                if (act === 'cinematic-kf-media-reset-inherit') {
                    keyframe.mediaObject = null;
                    this.renderCinematicKeyframeList();
                    this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                    return;
                }
            }
            const button = target.closest('button[data-act="cinematic-keyframe-select"]') as HTMLButtonElement | null;
            if (!button) return;
            const nextKeyframeId = String(button.getAttribute('data-keyframe-id') || '');
            if (this.cinematicMediaEditor.active && this.cinematicMediaEditor.keyframeId !== nextKeyframeId) {
                this.closeCinematicMediaEditor('3D object edit exited due to keyframe change');
            }
            this.selectedCinematicKeyframeId = nextKeyframeId;
            const metrics = this.cinematicTimelineData();
            const selected = metrics?.keyframes.find((item) => item.keyframe.keyframeId === this.selectedCinematicKeyframeId);
            if (selected) this.scrubCinematicTimeline(selected.globalTimeSec, true);
            else {
                this.drawViews();
                this.renderCinematicKeyframeList();
            }
        };
        this.cinematicKeyframeModal.addEventListener('click', cinematicEditorClick);
        this.cinematicKeyframeEditorBodyEl.addEventListener('click', cinematicEditorClick);
        this.cinematicShotEditorBodyEl.addEventListener('click', cinematicEditorClick);
        const cinematicEditorChange = (event: Event) => {
            const target = event.target as HTMLInputElement | HTMLTextAreaElement;
            const act = String(target.getAttribute('data-act') || '');
            const shotId = String(target.getAttribute('data-shot-id') || '');
            const shot = this.cinematicPlan?.shots.find((item) => item.shotId === shotId)
                || this.cinematicPlan?.shots.find((item) => item.keyframes.some((kf) => kf.keyframeId === String(target.getAttribute('data-keyframe-id') || '')));
            if (!shot) return;
            if (act === 'cinematic-shot-speech-match') {
                shot.speechMatchEnabled = (target as HTMLInputElement).checked && Boolean(shot.speechMetrics?.charsPerSecond);
                this.updateShotDurationFromSpeechMatch(shot);
                this.renderCinematicTimeline();
                this.renderCinematicKeyframeList();
                return;
            }
            if (act === 'cinematic-shot-duration') {
                shot.durationSec = Math.max(1, Number(target.value) || shot.durationSec);
                this.drawViews();
                this.renderCinematicTimeline();
                this.renderCinematicKeyframeList();
                this.renderCinematicMap();
                return;
            }
            if (act === 'cinematic-shot-speech') {
                shot.speechText = target.value.trim();
                shot.speechAudioUrl = null;
                this.applyStoredSpeechTimingToShot(shot);
                this.updateShotDurationFromSpeechMatch(shot);
                this.renderCinematicTimeline();
                this.renderCinematicKeyframeList();
                return;
            }
            if (act === 'cinematic-shot-speech-mode') {
                shot.speechMode = String((target as unknown as HTMLSelectElement).value || 'INTERRUPTIBLE') === 'BLOCKING' ? 'BLOCKING' : 'INTERRUPTIBLE';
                this.renderCinematicKeyframeList();
                return;
            }
            if (act === 'cinematic-shot-tts-voice') {
                const value = String((target as unknown as HTMLSelectElement).value || DEFAULT_TTS_VOICE);
                const ttsModel = this.resolveShotSpeechTtsConfig(shot).model;
                shot.speechMetrics = { ...shot.speechMetrics, ttsModel, ttsVoice: value, updatedAt: new Date().toISOString() };
                shot.speechAudioUrl = null;
                if (this.cinematicSpeechPlayingShotId === shot.shotId) this.stopCinematicSpeechPreview();
                this.renderCinematicKeyframeList();
                return;
            }
            const keyframeId = String(target.getAttribute('data-keyframe-id') || '');
            const keyframe = shot.keyframes.find((kf) => kf.keyframeId === keyframeId);
            if (!keyframe) return;
            if (act.startsWith('cinematic-kf-media-')) {
                const media = this.ensureKeyframeMediaOverride(keyframe);
                if (act === 'cinematic-kf-media-enabled') media.enabled = (target as HTMLInputElement).checked;
                if (act === 'cinematic-kf-media-scale') media.scale = clamp(Number(target.value) || media.scale, 0.1, 120);
                if (act === 'cinematic-kf-media-yaw') media.yaw = Number(target.value) || 0;
                if (act === 'cinematic-kf-media-pitch') media.pitch = Number(target.value) || 0;
                if (act === 'cinematic-kf-media-roll') media.roll = Number(target.value) || 0;
                if (act === 'cinematic-kf-media-depth') media.depthOffset = clamp(Number(target.value) || media.depthOffset, -2, 2);
                if (act === 'cinematic-kf-media-anchor-x' || act === 'cinematic-kf-media-anchor-y' || act === 'cinematic-kf-media-anchor-z') {
                    const base = media.anchorWorld || { x: keyframe.x, y: keyframe.y, z: keyframe.z };
                    const value = Number(target.value);
                    if (Number.isFinite(value)) {
                        media.anchorWorld = {
                            x: act === 'cinematic-kf-media-anchor-x' ? value : base.x,
                            y: act === 'cinematic-kf-media-anchor-y' ? value : base.y,
                            z: act === 'cinematic-kf-media-anchor-z' ? value : base.z
                        };
                    }
                }
                this.renderCinematicKeyframeList();
                this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                return;
            }
            if (act === 'cinematic-kf-x') keyframe.x = Number(target.value) || keyframe.x;
            if (act === 'cinematic-kf-y') keyframe.y = Number(target.value) || keyframe.y;
            if (act === 'cinematic-kf-z') keyframe.z = Number(target.value) || keyframe.z;
            if (act === 'cinematic-kf-yaw') keyframe.yaw = Number(target.value) || keyframe.yaw;
            if (act === 'cinematic-kf-pitch') keyframe.pitch = Number(target.value) || keyframe.pitch;
            if (act === 'cinematic-kf-fov') keyframe.fov = clampFov(Number(target.value), keyframe.fov);
            if (act === 'cinematic-kf-speed') keyframe.moveSpeedMps = Math.max(0.1, Number(target.value) || keyframe.moveSpeedMps);
            this.drawViews();
            this.renderCinematicTimeline();
            this.renderCinematicKeyframeList();
            this.renderCinematicMap();
        };
        this.cinematicKeyframeEditorBodyEl.addEventListener('change', cinematicEditorChange);
        this.cinematicShotEditorBodyEl.addEventListener('change', cinematicEditorChange);
        this.root.querySelectorAll('[data-act="cinematic-delete-keyframe"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.deleteSelectedCinematicKeyframe();
            });
        });
        (this.root.querySelector('[data-act="cinematic-delete-shot"]') as HTMLButtonElement).addEventListener('click', () => {
            this.deleteSelectedCinematicShot();
        });
        (this.root.querySelector('[data-act="cinematic-top-center"]') as HTMLButtonElement).addEventListener('click', () => { this.topView.offsetX = 0; this.topView.offsetY = 0; this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-front-center"]') as HTMLButtonElement).addEventListener('click', () => { this.frontView.offsetX = 0; this.frontView.offsetY = 0; this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-top-zoom-in"]') as HTMLButtonElement).addEventListener('click', () => { this.topView.zoom = clamp(this.topView.zoom * 1.15, 0.5, 5); this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-top-zoom-out"]') as HTMLButtonElement).addEventListener('click', () => { this.topView.zoom = clamp(this.topView.zoom / 1.15, 0.5, 5); this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-front-zoom-in"]') as HTMLButtonElement).addEventListener('click', () => { this.frontView.zoom = clamp(this.frontView.zoom * 1.15, 0.5, 5); this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-front-zoom-out"]') as HTMLButtonElement).addEventListener('click', () => { this.frontView.zoom = clamp(this.frontView.zoom / 1.15, 0.5, 5); this.renderCinematicMap(); });
        (this.root.querySelector('[data-act="cinematic-toggle-route"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicShowRouteOverlay = !this.cinematicShowRouteOverlay;
            this.syncCinematicChrome();
            this.renderCinematicMap();
        });
        this.root.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-act="cinematic-timeline-zoom-in"]')) {
                this.cinematicTimelinePixelsPerSecond = clamp(this.cinematicTimelinePixelsPerSecond + 5, 10, 100);
                const input = this.root.querySelector('[data-role="cinematic-timeline-zoom"]') as HTMLInputElement | null;
                if (input) input.value = String(this.cinematicTimelinePixelsPerSecond);
                this.renderCinematicTimeline();
            } else if (target.closest('[data-act="cinematic-timeline-zoom-out"]')) {
                this.cinematicTimelinePixelsPerSecond = clamp(this.cinematicTimelinePixelsPerSecond - 5, 10, 100);
                const input = this.root.querySelector('[data-role="cinematic-timeline-zoom"]') as HTMLInputElement | null;
                if (input) input.value = String(this.cinematicTimelinePixelsPerSecond);
                this.renderCinematicTimeline();
            }
        });
        this.root.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            if (target?.dataset?.role === 'cinematic-timeline-zoom' || target?.getAttribute('data-role') === 'cinematic-timeline-zoom') {
                this.cinematicTimelinePixelsPerSecond = clamp(Number(target.value) || this.cinematicTimelinePixelsPerSecond, 10, 100);
                this.renderCinematicTimeline();
            }
        });
        this.cinematicWorkspaceModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicWorkspaceModal) {
                this.closeCinematicWorkspace();
            }
        });
        this.cinematicBgmModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicBgmModal) this.closeCinematicBgmModal();
        });
        (this.root.querySelector('[data-act="cinematic-bgm-close"]') as HTMLButtonElement).addEventListener('click', () => this.closeCinematicBgmModal());
        this.cinematicBgmSearchInput.addEventListener('input', () => {
            this.cinematicBgmFilter = this.cinematicBgmSearchInput.value;
            this.cinematicBgmRenderLibrary();
        });
        this.cinematicBgmLibraryEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const itemBtn = target.closest('button[data-act="cinematic-bgm-select-item"]') as HTMLButtonElement | null;
            if (!itemBtn) return;
            const audioPath = String(itemBtn.getAttribute('data-audio-path') || '').trim();
            if (!audioPath) return;
            const sourceKey = String(itemBtn.getAttribute('data-source-key') || '').trim();
            const item = this.cinematicBgmLibrary.find((row) => row.audioPath === audioPath && (!sourceKey || row.sourceKey === sourceKey)) || null;
            if (!item) return;
            void this.cinematicBgmLoadAudio(item.audioPath, item.name, 'draft', item).catch((error) => {
                this.setCinematicStatus(`Load BGM failed: ${String(error)}`);
            });
        });
        const absorbBgmFiles = (files: File[], source: 'folder' | 'path') => {
            const audioFiles = files.filter((file) => file.type.startsWith('audio/') || isAudioFileName(file.name));
            if (audioFiles.length < 1) {
                this.setCinematicStatus('No audio files found');
                return;
            }
            const newItems: CinematicBgmLibraryItem[] = audioFiles.map((file, idx) => {
                const audioPath = String(file.webkitRelativePath || file.name || `audio-${Date.now()}-${idx}`);
                const audioUrl = URL.createObjectURL(file);
                this.cinematicBgmObjectUrls.push(audioUrl);
                return {
                    id: `${Date.now().toString(36)}_${idx}`,
                    name: file.name,
                    audioPath,
                    audioUrl,
                    source,
                    sourceType: 'legacy',
                    audioRelativePath: audioPath
                };
            });
            const map = new Map<string, CinematicBgmLibraryItem>();
            [...newItems, ...this.cinematicBgmLibrary].forEach((item) => {
                if (!map.has(item.audioPath)) map.set(item.audioPath, item);
            });
            this.cinematicBgmLibrary = Array.from(map.values());
            this.cinematicBgmRenderLibrary();
            const first = newItems[0];
            if (first) {
                void this.cinematicBgmLoadAudio(first.audioPath, first.name, 'draft', first).catch((error) => {
                    this.setCinematicStatus(`Load BGM failed: ${String(error)}`);
                });
            }
        };
        const absorbBgmItems = (newItems: CinematicBgmLibraryItem[]) => {
            if (newItems.length < 1) {
                this.setCinematicStatus('No audio files found');
                return;
            }
            const map = new Map<string, CinematicBgmLibraryItem>();
            [...newItems, ...this.cinematicBgmLibrary].forEach((item) => {
                const key = `${item.sourceKey || 'legacy'}::${item.audioPath}`;
                if (!map.has(key)) map.set(key, item);
            });
            this.cinematicBgmLibrary = Array.from(map.values());
            this.cinematicBgmRenderLibrary();
            const first = newItems[0];
            if (first) {
                void this.cinematicBgmLoadAudio(first.audioPath, first.name, 'draft', first).catch((error) => {
                    this.setCinematicStatus(`Load BGM failed: ${String(error)}`);
                });
            }
        };
        this.cinematicBgmFolderInput.addEventListener('change', () => {
            absorbBgmFiles(Array.from(this.cinematicBgmFolderInput.files || []), 'folder');
            this.cinematicBgmFolderInput.value = '';
        });
        this.cinematicBgmFileInput.addEventListener('change', () => {
            absorbBgmFiles(Array.from(this.cinematicBgmFileInput.files || []), 'path');
            this.cinematicBgmFileInput.value = '';
        });
        (this.root.querySelector('[data-act="cinematic-bgm-browse-folder"]') as HTMLButtonElement).addEventListener('click', async () => {
            const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
            if (typeof picker !== 'function') {
                this.cinematicBgmFolderInput.click();
                return;
            }
            try {
                const dirHandle = await picker();
                const items = await this.cinematicBgmAbsorbDirectoryHandle(dirHandle);
                absorbBgmItems(items);
            } catch (error) {
                if (String(error).includes('AbortError')) return;
                this.setCinematicStatus(`Load BGM folder failed: ${String(error)}`);
            }
        });
        (this.root.querySelector('[data-act="cinematic-bgm-browse-files"]') as HTMLButtonElement).addEventListener('click', async () => {
            const picker = (window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
            if (typeof picker !== 'function') {
                this.cinematicBgmFileInput.click();
                return;
            }
            try {
                const handles = await picker({ multiple: true, types: [{ description: 'Audio Files', accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'] } }] });
                const items = await this.cinematicBgmAbsorbFileHandles(handles);
                absorbBgmItems(items);
            } catch (error) {
                if (String(error).includes('AbortError')) return;
                this.setCinematicStatus(`Load BGM files failed: ${String(error)}`);
            }
        });
        this.cinematicMediaFileInput.addEventListener('change', () => {
            const file = this.cinematicMediaFileInput.files?.[0];
            const keyframeId = this.cinematicMediaFileTargetKeyframeId;
            this.cinematicMediaFileInput.value = '';
            this.cinematicMediaFileTargetKeyframeId = '';
            if (!file || !keyframeId) return;
            const shot = this.cinematicPlan?.shots.find((item) => item.keyframes.some((kf) => kf.keyframeId === keyframeId)) || null;
            const keyframe = shot?.keyframes.find((item) => item.keyframeId === keyframeId) || null;
            if (!keyframe) return;
            void this.uploadCinematicMediaFile(file).then((asset) => {
                const media = this.ensureKeyframeMediaOverride(keyframe);
                media.enabled = true;
                media.src = asset.src;
                media.fileName = asset.fileName;
                media.placeholder = false;
                media.placeholderLabel = '';
                let propagated = 0;
                this.cinematicPlan?.shots.forEach((shotRow) => {
                    shotRow.keyframes.forEach((kfRow) => {
                        const rowMedia = kfRow.mediaObject ? normalizeCwMediaObjectConfig(kfRow.mediaObject) : null;
                        if (!rowMedia?.enabled) return;
                        const sameAnchor = rowMedia.anchorWorld && media.anchorWorld
                            ? Math.abs(rowMedia.anchorWorld.x - media.anchorWorld.x) < 0.01
                                && Math.abs(rowMedia.anchorWorld.y - media.anchorWorld.y) < 0.01
                                && Math.abs(rowMedia.anchorWorld.z - media.anchorWorld.z) < 0.01
                            : false;
                        if (kfRow.keyframeId !== keyframeId && rowMedia.placeholder && !rowMedia.src && sameAnchor) {
                            rowMedia.src = asset.src;
                            rowMedia.fileName = asset.fileName;
                            rowMedia.placeholder = false;
                            rowMedia.placeholderLabel = '';
                            kfRow.mediaObject = rowMedia;
                            propagated += 1;
                        }
                    });
                });
                this.renderCinematicKeyframeList();
                this.applyCwMediaForTime(this.cinematicCurrentTimeSec);
                this.logDebug('cw.media.file', `loaded fileName=${asset.fileName} src=${asset.src} keyframe=${keyframeId} propagated=${propagated}`);
                this.setCinematicStatus(`Loaded media file ${asset.fileName}`);
            }).catch((error) => {
                this.logDebug('cw.media.file', `upload failed keyframe=${keyframeId} error=${String(error)}`);
                this.setCinematicStatus(`Video upload failed: ${String(error)}`);
            });
        });
        this.cinematicBgmPlayerBtn.addEventListener('click', () => {
            const audio = this.cinematicBgmPreviewAudio;
            if (!audio) return;
            if (audio.paused) {
                audio.playbackRate = clampMusicRate(Number(this.cinematicBgmRateInput.value) || 1);
                void audio.play().then(() => {
                    this.cinematicBgmClipPreviewPlaying = false;
                    this.setCinematicBgmPlayerButtonState(true);
                    if (!this.cinematicBgmPreviewRaf) this.cinematicBgmPreviewRaf = window.requestAnimationFrame(this.cinematicBgmPreviewTick);
                }).catch((error) => this.setCinematicStatus(`Preview failed: ${String(error)}`));
            } else {
                audio.pause();
                this.setCinematicBgmPlayerButtonState(false);
            }
        });
        (this.root.querySelector('[data-act="cinematic-bgm-player-stop"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicBgmStopPreview();
        });
        this.cinematicBgmRateInput.addEventListener('change', () => {
            if (this.cinematicBgmPreviewAudio) this.cinematicBgmPreviewAudio.playbackRate = clampMusicRate(Number(this.cinematicBgmRateInput.value) || 1);
        });
        this.cinematicBgmProgressInput.addEventListener('input', () => {
            const audio = this.cinematicBgmPreviewAudio;
            if (!audio || this.cinematicBgmAudioDurationSec <= 0) return;
            const ratio = clamp(Number(this.cinematicBgmProgressInput.value) / 1000, 0, 1);
            audio.currentTime = ratio * this.cinematicBgmAudioDurationSec;
            this.cinematicBgmTimeEl.textContent = `${formatSecondsLabel(audio.currentTime)} / ${formatSecondsLabel(this.cinematicBgmAudioDurationSec)}`;
            this.cinematicBgmRenderWaveform();
        });
        this.cinematicBgmStartInput.addEventListener('change', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            this.cinematicBgmRenderWaveform();
            this.cinematicBgmUpdateEffectiveRate();
        });
        this.cinematicBgmEndInput.addEventListener('change', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            this.cinematicBgmRenderWaveform();
            this.cinematicBgmUpdateEffectiveRate();
        });
        this.cinematicBgmManualRateInput.addEventListener('change', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            this.cinematicBgmUpdateEffectiveRate();
        });
        this.cinematicBgmTargetDurationInput.addEventListener('change', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            this.cinematicBgmUpdateEffectiveRate();
        });
        this.cinematicBgmClipPlayBtn.addEventListener('click', () => {
            const audio = this.cinematicBgmPreviewAudio;
            const draft = this.cinematicEditingBgmConfig();
            if (!audio || !draft) return;
            if (!audio.paused && this.cinematicBgmClipPreviewPlaying) {
                audio.pause();
                this.cinematicBgmClipPreviewPlaying = false;
                this.cinematicBgmClipPlayBtn.textContent = 'Play Clip';
                this.setCinematicBgmPlayerButtonState(false);
                return;
            }
            this.cinematicBgmSyncSelectionFromInputs();
            const rate = clampMusicRate(Number(this.cinematicBgmRateInput.value) || 1);
            audio.playbackRate = rate;
            audio.currentTime = draft.audioStartSeconds;
            this.cinematicBgmClipPreviewPlaying = true;
            this.cinematicBgmClipPlayBtn.textContent = 'Stop Clip';
            this.setCinematicBgmPlayerButtonState(true);
            audio.onended = () => {
                this.cinematicBgmClipPreviewPlaying = false;
                this.cinematicBgmClipPlayBtn.textContent = 'Play Clip';
                this.setCinematicBgmPlayerButtonState(false);
            };
            audio.ontimeupdate = () => {
                const current = this.cinematicEditingBgmConfig();
                if (!current || !this.cinematicBgmClipPreviewPlaying) return;
                if (audio.currentTime >= current.audioEndSeconds) {
                    audio.pause();
                    this.cinematicBgmClipPreviewPlaying = false;
                    this.cinematicBgmClipPlayBtn.textContent = 'Play Clip';
                    this.setCinematicBgmPlayerButtonState(false);
                }
            };
            void audio.play().catch((error) => this.setCinematicStatus(`Clip preview failed: ${String(error)}`));
            if (!this.cinematicBgmPreviewRaf) this.cinematicBgmPreviewRaf = window.requestAnimationFrame(this.cinematicBgmPreviewTick);
        });
        this.cinematicBgmRecommendBtn.addEventListener('click', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            this.cinematicBgmRecommendClip();
        });
        (this.root.querySelector('[data-act="cinematic-bgm-apply"]') as HTMLButtonElement).addEventListener('click', () => {
            this.cinematicBgmSyncSelectionFromInputs();
            const current = this.cinematicEditingBgmConfig();
            if (!current || !String(current.audioPath || '').trim()) {
                this.setCinematicStatus('Please select an audio track first');
                return;
            }
            if (current.audioEndSeconds <= current.audioStartSeconds) {
                this.setCinematicStatus('Audio clip end must be greater than start');
                return;
            }
            current.audioPlaybackRate = cinematicBgmEffectiveRate(current);
            this.cinematicBgmApplyConfig(current);
            this.cinematicBgmTimelineSelected = true;
            this.refreshCinematicUi();
            this.closeCinematicBgmModal();
            this.setCinematicStatus('BGM applied to timeline');
        });
        (this.root.querySelector('[data-act="cinematic-bgm-save"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.saveCinematicBgm().catch((error) => {
                this.setCinematicStatus(`Save BGM failed: ${String(error)}`);
            });
        });
        (this.root.querySelector('[data-act="cinematic-bgm-delete"]') as HTMLButtonElement).addEventListener('click', () => {
            void this.deleteCinematicBgm().catch((error) => {
                this.setCinematicStatus(`Delete BGM failed: ${String(error)}`);
            });
        });
        const waveToSec = (clientX: number) => {
            const rect = this.cinematicBgmWaveCanvas.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
            return ratio * Math.max(0.001, this.cinematicBgmAudioDurationSec || 0.001);
        };
        this.cinematicBgmWaveCanvas.addEventListener('pointerdown', (event) => {
            const draft = this.cinematicEditingBgmConfig();
            if (!draft || this.cinematicBgmAudioDurationSec <= 0) return;
            const sec = waveToSec(event.clientX);
            const start = draft.audioStartSeconds;
            const end = draft.audioEndSeconds;
            const handleSec = Math.max(0.06, this.cinematicBgmAudioDurationSec / this.cinematicBgmWaveCanvas.width * 6);
            let mode: 'range' | 'start' | 'end' = 'range';
            if (Math.abs(sec - start) <= handleSec) mode = 'start';
            else if (Math.abs(sec - end) <= handleSec) mode = 'end';
            this.cinematicBgmWaveDrag = { active: true, pointerId: event.pointerId, mode, anchorSec: sec };
            this.cinematicBgmWaveCanvas.setPointerCapture(event.pointerId);
            if (mode === 'range') {
                draft.audioStartSeconds = sec;
                draft.audioEndSeconds = sec;
                this.cinematicBgmStartInput.value = sec.toFixed(3);
                this.cinematicBgmEndInput.value = sec.toFixed(3);
                this.cinematicBgmRenderWaveform();
            }
        });
        this.cinematicBgmWaveCanvas.addEventListener('pointermove', (event) => {
            const draft = this.cinematicEditingBgmConfig();
            if (!this.cinematicBgmWaveDrag.active || event.pointerId !== this.cinematicBgmWaveDrag.pointerId || !draft) return;
            const sec = waveToSec(event.clientX);
            if (this.cinematicBgmWaveDrag.mode === 'start') {
                draft.audioStartSeconds = clamp(sec, 0, draft.audioEndSeconds - 0.01);
            } else if (this.cinematicBgmWaveDrag.mode === 'end') {
                draft.audioEndSeconds = clamp(sec, draft.audioStartSeconds + 0.01, this.cinematicBgmAudioDurationSec);
            } else {
                draft.audioStartSeconds = Math.min(this.cinematicBgmWaveDrag.anchorSec, sec);
                draft.audioEndSeconds = Math.max(this.cinematicBgmWaveDrag.anchorSec, sec);
            }
            this.cinematicBgmStartInput.value = draft.audioStartSeconds.toFixed(3);
            this.cinematicBgmEndInput.value = draft.audioEndSeconds.toFixed(3);
            this.cinematicBgmRenderWaveform();
            this.cinematicBgmUpdateEffectiveRate();
        });
        const endWaveDrag = (event: PointerEvent) => {
            if (!this.cinematicBgmWaveDrag.active || event.pointerId !== this.cinematicBgmWaveDrag.pointerId) return;
            this.cinematicBgmWaveDrag = { active: false, pointerId: -1, mode: 'range', anchorSec: 0 };
            if (this.cinematicBgmWaveCanvas.hasPointerCapture(event.pointerId)) this.cinematicBgmWaveCanvas.releasePointerCapture(event.pointerId);
        };
        this.cinematicBgmWaveCanvas.addEventListener('pointerup', endWaveDrag);
        this.cinematicBgmWaveCanvas.addEventListener('pointercancel', endWaveDrag);
        const bindPromptModal = (modal: HTMLDivElement, kind: 'simple' | 'complex') => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) this.closeCinematicPromptModal(kind);
            });
        };
        bindPromptModal(this.cinematicSimplePromptModal, 'simple');
        bindPromptModal(this.cinematicComplexPromptModal, 'complex');
        (this.root.querySelector('[data-act="cinematic-simple-prompt-close"]') as HTMLButtonElement).addEventListener('click', () => this.closeCinematicPromptModal('simple'));
        (this.root.querySelector('[data-act="cinematic-complex-prompt-close"]') as HTMLButtonElement).addEventListener('click', () => this.closeCinematicPromptModal('complex'));
        (this.root.querySelector('[data-act="cinematic-simple-prompt-cancel"]') as HTMLButtonElement).addEventListener('click', () => this.closeCinematicPromptModal('simple'));
        (this.root.querySelector('[data-act="cinematic-complex-prompt-cancel"]') as HTMLButtonElement).addEventListener('click', () => this.closeCinematicPromptModal('complex'));
        (this.root.querySelector('[data-act="cinematic-simple-prompt-update"]') as HTMLButtonElement).addEventListener('click', () => {
            this.syncCinematicStateFromInputs();
            this.closeCinematicPromptModal('simple');
        });
        (this.root.querySelector('[data-act="cinematic-complex-prompt-update"]') as HTMLButtonElement).addEventListener('click', () => {
            this.syncCinematicStateFromInputs();
            this.closeCinematicPromptModal('complex');
        });
        (this.root.querySelector('[data-act="cinematic-simple-prompt-save-new"]') as HTMLButtonElement).addEventListener('click', () => {
            this.syncCinematicStateFromInputs();
            void this.saveCinematicVersion(true).then(() => this.closeCinematicPromptModal('simple')).catch((error) => this.setCinematicStatus(`Save version failed: ${String(error)}`));
        });
        (this.root.querySelector('[data-act="cinematic-complex-prompt-save-new"]') as HTMLButtonElement).addEventListener('click', () => {
            this.syncCinematicStateFromInputs();
            void this.saveCinematicVersion(true).then(() => this.closeCinematicPromptModal('complex')).catch((error) => this.setCinematicStatus(`Save version failed: ${String(error)}`));
        });
        const bindCinematicCanvas = (canvas: HTMLCanvasElement, mode: 'top' | 'front') => {
            const centerHitRadius = mode === 'front' ? 120 : 24;
            const handleHitRadius = mode === 'front' ? 120 : 22;
            const findNearestCinematicMapTarget = (p: { x: number; y: number }) => {
                if (!this.cinematicPlan?.shots?.length) return null;
                let best: null | {
                    shotId: string;
                    keyframeId: string;
                    centerDistance: number;
                    handleDistance: number;
                    center: { x: number; y: number };
                    handle: { x: number; y: number };
                } = null;
                this.cinematicPlan.shots.forEach((shot) => {
                    shot.keyframes.forEach((kf) => {
                        const center = mode === 'top'
                            ? this.projectTopForCanvas(canvas, kf.x, kf.z)
                            : this.projectFrontForCanvas(canvas, kf.x, kf.y + this.eyeHeightM);
                        const angle = mode === 'top' ? degToRad(kf.yaw) : degToRad(kf.pitch);
                        const handle = mode === 'top'
                            ? { x: center.x + Math.sin(angle) * 18, y: center.y + Math.cos(angle) * 18 }
                            : { x: center.x + Math.cos(angle) * 18, y: center.y - Math.sin(angle) * 18 };
                        const centerDistance = Math.hypot(center.x - p.x, center.y - p.y);
                        const handleDistance = Math.hypot(handle.x - p.x, handle.y - p.y);
                        const score = Math.min(centerDistance, handleDistance);
                        if (!best || score < Math.min(best.centerDistance, best.handleDistance)) {
                            best = { shotId: shot.shotId, keyframeId: kf.keyframeId, centerDistance, handleDistance, center, handle };
                        }
                    });
                });
                return best;
            };
            canvas.addEventListener('contextmenu', (event) => event.preventDefault());
            canvas.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                if (!this.cinematicWorkspaceOpen()) return;
                const p = mapPointer(canvas, event);
                if (event.button === 2) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: mode === 'top' ? 'top-pan' : 'front-pan', startX: p.x, startY: p.y };
                    canvas.setPointerCapture(event.pointerId);
                    return;
                }
                if (event.button !== 0) return;
                const keyframe = this.selectedCinematicKeyframe();
                if (!keyframe) return;
                const nearest = findNearestCinematicMapTarget(p);
                const currentCenter = mode === 'top'
                    ? this.projectTopForCanvas(canvas, keyframe.x, keyframe.z)
                    : this.projectFrontForCanvas(canvas, keyframe.x, keyframe.y + this.eyeHeightM);
                const currentAngle = mode === 'top' ? degToRad(keyframe.yaw) : degToRad(keyframe.pitch);
                const currentHandle = mode === 'top'
                    ? { x: currentCenter.x + Math.sin(currentAngle) * 18, y: currentCenter.y + Math.cos(currentAngle) * 18 }
                    : { x: currentCenter.x + Math.cos(currentAngle) * 18, y: currentCenter.y - Math.sin(currentAngle) * 18 };
                this.logDebug(`cine.map.${mode}.pointerdown`, `p=(${p.x.toFixed(1)},${p.y.toFixed(1)}) selected=${keyframe.keyframeId} center=(${currentCenter.x.toFixed(1)},${currentCenter.y.toFixed(1)}) handle=(${currentHandle.x.toFixed(1)},${currentHandle.y.toFixed(1)}) nearest=${nearest ? `${nearest.keyframeId} cd=${nearest.centerDistance.toFixed(1)} hd=${nearest.handleDistance.toFixed(1)}` : 'none'}`);
                if (nearest && (nearest.centerDistance <= centerHitRadius || nearest.handleDistance <= handleHitRadius)) {
                    this.selectedCinematicShotId = nearest.shotId;
                    this.selectedCinematicKeyframeId = nearest.keyframeId;
                    this.syncCinematicTimelineState();
                    this.renderCinematicKeyframeList();
                    this.renderCinematicMap();
                    const centerHit = nearest.centerDistance <= centerHitRadius;
                    const handleHit = nearest.handleDistance <= handleHitRadius;
                    const useHandle = handleHit && (!centerHit || nearest.handleDistance < nearest.centerDistance);
                    this.drag = {
                        active: true,
                        pointerId: event.pointerId,
                        mode: mode === 'top' ? (useHandle ? 'top-yaw' : 'top-move') : (useHandle ? 'front-pitch' : 'front-move'),
                        startX: p.x,
                        startY: p.y
                    };
                    this.logDebug(`cine.map.${mode}.drag-start`, `keyframe=${nearest.keyframeId} shot=${nearest.shotId} mode=${this.drag.mode} center=(${nearest.center.x.toFixed(1)},${nearest.center.y.toFixed(1)}) handle=(${nearest.handle.x.toFixed(1)},${nearest.handle.y.toFixed(1)}) centerHit=${centerHit} handleHit=${handleHit}`);
                    canvas.setPointerCapture(event.pointerId);
                    return;
                }
                this.logDebug(`cine.map.${mode}.pointerdown`, 'miss');
            });
            canvas.addEventListener('pointermove', (event) => {
                if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
                const p = mapPointer(canvas, event);
                if (this.drag.mode === 'top-pan') {
                    this.topView.offsetX += p.x - this.drag.startX;
                    this.topView.offsetY += p.y - this.drag.startY;
                    this.drag.startX = p.x; this.drag.startY = p.y;
                } else if (this.drag.mode === 'front-pan') {
                    this.frontView.offsetX += p.x - this.drag.startX;
                    this.frontView.offsetY += p.y - this.drag.startY;
                    this.drag.startX = p.x; this.drag.startY = p.y;
                } else if (this.drag.mode === 'top-move' && mode === 'top') {
                    const keyframe = this.selectedCinematicKeyframe();
                    if (!keyframe) return;
                    const world = this.unprojectTopForCanvas(canvas, p.x, p.y);
                    keyframe.x = world.x;
                    keyframe.z = world.z;
                } else {
                    const keyframe = this.selectedCinematicKeyframe();
                    if (!keyframe) return;
                    if (this.drag.mode === 'top-yaw') {
                        const c = this.projectTopForCanvas(canvas, keyframe.x, keyframe.z);
                        keyframe.yaw = Math.atan2(p.x - c.x, p.y - c.y) * 180 / Math.PI;
                    } else if (this.drag.mode === 'front-pitch') {
                        const c = this.projectFrontForCanvas(canvas, keyframe.x, keyframe.y + this.eyeHeightM);
                        keyframe.pitch = Math.atan2(-(p.y - c.y), p.x - c.x) * 180 / Math.PI;
                    } else if (this.drag.mode === 'front-move' && mode === 'front') {
                        const world = this.unprojectFrontForCanvas(canvas, p.x, p.y);
                        keyframe.x = world.x;
                        keyframe.y = world.y - this.eyeHeightM;
                    }
                    this.logDebug(`cine.map.${mode}.drag-move`, `mode=${this.drag.mode} keyframe=${keyframe.keyframeId} x=${keyframe.x.toFixed(3)} y=${keyframe.y.toFixed(3)} z=${keyframe.z.toFixed(3)} yaw=${keyframe.yaw.toFixed(2)} pitch=${keyframe.pitch.toFixed(2)}`);
                }
                this.renderCinematicMap();
                this.renderCinematicKeyframeList();
            });
            const end = (event: PointerEvent) => {
                if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;
                this.logDebug(`cine.map.${mode}.drag-end`, `mode=${this.drag.mode}`);
                this.drag.active = false;
                this.drag.mode = null;
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                this.renderCinematicMap();
            };
            canvas.addEventListener('pointerup', end);
            canvas.addEventListener('pointercancel', end);
            canvas.addEventListener('wheel', (event) => {
                event.preventDefault();
                const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
                if (mode === 'top') this.topView.zoom = clamp(this.topView.zoom * factor, 0.5, 5);
                else this.frontView.zoom = clamp(this.frontView.zoom * factor, 0.5, 5);
                this.renderCinematicMap();
            }, { passive: false });
        };
        bindCinematicCanvas(this.cinematicTopCanvas, 'top');
        bindCinematicCanvas(this.cinematicFrontCanvas, 'front');
        this.cinematicKeyframeModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicKeyframeModal) this.cinematicKeyframeModal.classList.add('hidden');
        });
        this.cinematicShotModal.addEventListener('click', (event) => {
            if (event.target === this.cinematicShotModal) this.cinematicShotModal.classList.add('hidden');
        });
        const cinematicDragHandle = this.root.querySelector('[data-role="cinematic-workspace-drag-handle"]') as HTMLDivElement;
        cinematicDragHandle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || this.cinematicWorkspaceFullscreen) return;
            const target = event.target as HTMLElement;
            if (target.closest('button,input,select,textarea,label')) return;
            if (!target.closest('.otl-cinematic-header')) return; // Limit drag handle to header
            const rect = this.cinematicWorkspacePanel.getBoundingClientRect();
            this.cinematicWorkspaceDrag = {
                active: true,
                dragging: false,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            cinematicDragHandle.setPointerCapture(event.pointerId);
        });
        cinematicDragHandle.addEventListener('pointermove', (event) => {
            if (!this.cinematicWorkspaceDrag.active || event.pointerId !== this.cinematicWorkspaceDrag.pointerId) return;
            const dx = event.clientX - this.cinematicWorkspaceDrag.startX;
            const dy = event.clientY - this.cinematicWorkspaceDrag.startY;
            if (!this.cinematicWorkspaceDrag.dragging) {
                if (Math.hypot(dx, dy) < 5) return;
                this.cinematicWorkspaceDrag.dragging = true;
                this.cinematicWorkspaceFloatPos = {
                    left: this.cinematicWorkspaceDrag.left,
                    top: this.cinematicWorkspaceDrag.top,
                    initialized: true
                };
                this.pinCinematicWorkspacePanel();
            }
            const nextPos = this.clampCinematicWorkspacePosition(this.cinematicWorkspaceDrag.left + dx, this.cinematicWorkspaceDrag.top + dy);
            const nextLeft = nextPos.left;
            const nextTop = nextPos.top;
            this.cinematicWorkspaceFloatPos = { left: nextLeft, top: nextTop, initialized: true };
            this.cinematicWorkspacePanel.style.left = `${nextLeft}px`;
            this.cinematicWorkspacePanel.style.top = `${nextTop}px`;
        });
        const endCinematicDrag = (event: PointerEvent) => {
            if (!this.cinematicWorkspaceDrag.active || event.pointerId !== this.cinematicWorkspaceDrag.pointerId) return;
            this.cinematicWorkspaceDrag.active = false;
            this.cinematicWorkspaceDrag.dragging = false;
            if (cinematicDragHandle.hasPointerCapture(event.pointerId)) cinematicDragHandle.releasePointerCapture(event.pointerId);
        };
        cinematicDragHandle.addEventListener('pointerup', endCinematicDrag);
        cinematicDragHandle.addEventListener('pointercancel', endCinematicDrag);
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
            if (act === 'edit-hotspots' && poiId) {
                void this.hotspotController.openEditorForPoi(poiId);
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
            const cinematicEditing = this.cinematicWorkspaceOpen() && !!this.selectedCinematicKeyframe();
            if (event.button === 2) {
                this.drag = { active: true, pointerId: event.pointerId, mode: 'top-pan', startX: p.x, startY: p.y };
                this.topCanvas.setPointerCapture(event.pointerId);
                return;
            }
            if (event.button !== 0) return;
            const selected = cinematicEditing ? null : this.selectedPoi();
            const selectedKeyframe = cinematicEditing ? this.selectedCinematicKeyframe() : null;
            if (selectedKeyframe) {
                const c = this.projectTop(selectedKeyframe.x, selectedKeyframe.z);
                const yawR = degToRad(selectedKeyframe.yaw);
                const hx = c.x + Math.sin(yawR) * 26;
                const hy = c.y + Math.cos(yawR) * 26;
                if (Math.hypot(hx - p.x, hy - p.y) < 10) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: 'top-yaw', startX: p.x, startY: p.y };
                    this.topCanvas.setPointerCapture(event.pointerId);
                    return;
                }
                if (Math.hypot(c.x - p.x, c.y - p.y) < 10) {
                    this.drag = { active: true, pointerId: event.pointerId, mode: 'front-move', startX: p.x, startY: p.y };
                    this.topCanvas.setPointerCapture(event.pointerId);
                    return;
                }
            }
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
            if (cinematicEditing && this.cinematicPlan) {
                let nearestKf: CinematicKeyframe | null = null;
                this.cinematicPlan.shots.forEach((shot) => {
                    shot.keyframes.forEach((kf) => {
                        const c = this.projectTop(kf.x, kf.z);
                        const d = Math.hypot(c.x - p.x, c.y - p.y);
                        if (d < nd) { nd = d; nearestKf = kf; }
                    });
                });
                if (nearestKf && nd <= 10) {
                    this.selectedCinematicShotId = nearestKf.shotId;
                    this.selectedCinematicKeyframeId = nearestKf.keyframeId;
                    this.refreshCinematicUi();
                }
                return;
            }
            this.pois.forEach((poi) => {
                const c = this.projectTop(poi.targetX, poi.targetZ);
                const d = Math.hypot(c.x - p.x, c.y - p.y);
                if (d < nd) { nd = d; nearest = poi; }
            });
            if (nearest && nd <= 10) {
                this.selectedPoiId = nearest.poiId;
                this.refreshPoiControls();
                this.hotspotController.activatePoi(this.selectedPoiId);
                return;
            }
            const world = this.unprojectTop(p.x, p.y);
            const poi = this.createPoi(world.x, 0, world.z);
            this.pois.push(poi);
            this.selectedPoiId = poi.poiId;
            this.refreshPoiControls();
            this.hotspotController.activatePoi(this.selectedPoiId);
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
                const keyframe = this.cinematicWorkspaceOpen() ? this.selectedCinematicKeyframe() : null;
                if (keyframe) {
                    const c = this.projectTop(keyframe.x, keyframe.z);
                    keyframe.yaw = Math.atan2(p.x - c.x, p.y - c.y) * 180 / Math.PI;
                    this.drawViews();
                    this.renderCinematicKeyframeList();
                    return;
                }
                const poi = this.selectedPoi();
                if (!poi) return;
                const c = this.projectTop(poi.targetX, poi.targetZ);
                poi.targetYaw = Math.atan2(p.x - c.x, p.y - c.y) * 180 / Math.PI;
                this.drawViews();
            } else if (this.drag.mode === 'front-move') {
                const keyframe = this.cinematicWorkspaceOpen() ? this.selectedCinematicKeyframe() : null;
                if (!keyframe) return;
                const world = this.unprojectTop(p.x, p.y);
                keyframe.x = world.x;
                keyframe.z = world.z;
                this.drawViews();
                this.renderCinematicKeyframeList();
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
            const cinematicEditing = this.cinematicWorkspaceOpen() && !!this.selectedCinematicKeyframe();
            if (event.button === 2) {
                this.drag = { active: true, pointerId: event.pointerId, mode: 'front-pan', startX: p.x, startY: p.y };
                this.frontCanvas.setPointerCapture(event.pointerId);
                return;
            }
            if (event.button !== 0) return;

            const selected = cinematicEditing ? null : this.selectedPoi();
            const selectedKeyframe = cinematicEditing ? this.selectedCinematicKeyframe() : null;
            if (selectedKeyframe) {
                const c = this.projectFront(selectedKeyframe.x, selectedKeyframe.y + this.eyeHeightM);
                const pitchR = degToRad(selectedKeyframe.pitch);
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
            if (cinematicEditing && this.cinematicPlan) {
                let nearestKf: CinematicKeyframe | null = null;
                this.cinematicPlan.shots.forEach((shot) => {
                    shot.keyframes.forEach((kf) => {
                        const c = this.projectFront(kf.x, kf.y + this.eyeHeightM);
                        const d = Math.hypot(c.x - p.x, c.y - p.y);
                        if (d < nd) { nd = d; nearestKf = kf; }
                    });
                });
                if (nearestKf && nd <= 10) {
                    this.selectedCinematicShotId = nearestKf.shotId;
                    this.selectedCinematicKeyframeId = nearestKf.keyframeId;
                    this.refreshCinematicUi();
                }
                return;
            }
            this.pois.forEach((poi) => {
                const c = this.projectFront(poi.targetX, this.poiEyeY(poi));
                const d = Math.hypot(c.x - p.x, c.y - p.y);
                if (d < nd) { nd = d; nearest = poi; }
            });
            if (nearest && nd <= 10) {
                this.selectedPoiId = nearest.poiId;
                this.refreshPoiControls();
                this.hotspotController.activatePoi(this.selectedPoiId);
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
                const keyframe = this.cinematicWorkspaceOpen() ? this.selectedCinematicKeyframe() : null;
                if (keyframe) {
                    const c = this.projectFront(keyframe.x, keyframe.y + this.eyeHeightM);
                    keyframe.pitch = Math.atan2(-(p.y - c.y), p.x - c.x) * 180 / Math.PI;
                    this.drawViews();
                    this.renderCinematicKeyframeList();
                    return;
                }
                const poi = this.selectedPoi();
                if (!poi) return;
                const c = this.projectFront(poi.targetX, this.poiEyeY(poi));
                poi.targetPitch = Math.atan2(-(p.y - c.y), p.x - c.x) * 180 / Math.PI;
                this.drawViews();
            } else if (this.drag.mode === 'front-move') {
                const keyframe = this.cinematicWorkspaceOpen() ? this.selectedCinematicKeyframe() : null;
                if (keyframe) {
                    const world = this.unprojectFront(p.x, p.y);
                    keyframe.x = world.x;
                    keyframe.y = world.y - this.eyeHeightM;
                    this.drawViews();
                    this.renderCinematicKeyframeList();
                    return;
                }
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

const mountOTCinematicWorkspacePanel = (options: CinematicWorkspaceOptions): CinematicWorkspaceController => {
    const panel = new CinematicWorkspacePanel(options);
    ;(window as Window & { __otCinematicWorkspacePanel?: unknown }).__otCinematicWorkspacePanel = panel;
    return {
        open: () => {
            void panel.openCinematicWorkspace();
        },
        close: () => {
            panel.closeCinematicWorkspace();
        },
        toggle: () => {
            if ((panel as unknown as { cinematicWorkspaceOpen: () => boolean }).cinematicWorkspaceOpen()) panel.closeCinematicWorkspace();
            else void panel.openCinematicWorkspace();
        },
        openCinematicWorkspace: () => panel.openCinematicWorkspace(),
        closeCinematicWorkspace: () => panel.closeCinematicWorkspace()
    };
};

export {
    mountOTCinematicWorkspacePanel,
    type CinematicWorkspaceController,
    type CinematicWorkspaceOptions
};

export const OT_CINEMATIC_WORKSPACE_TEST_EXPORT = {
    OT_TOUR_CSV_HEADERS,
    OT_TOUR_CSV_VERSION,
    escapeCsv
};
