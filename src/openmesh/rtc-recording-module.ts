type RecordingButtonVariant = 'A' | 'B';
type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';

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

type RecordingAudioMixRuntime = {
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    masterGain: GainNode;
    musicGain: GainNode;
    duckGain: GainNode;
    ttsGain: GainNode;
    compressor: DynamicsCompressorNode;
    sources: WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>;
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

type RtcRecordingModuleOptions = {
    getModelFilename: () => string | null;
    getCaptureCanvas: () => HTMLCanvasElement | null;
    requestCaptureRender?: () => void;
    isPlaybackActive: () => boolean;
    isPlaybackPaused: () => boolean;
    playPlayback: () => void;
    pausePlayback: () => void;
    disableInterrupts?: (disabled: boolean) => void;
    getCurrentPlaybackAudio?: () => HTMLAudioElement | null;
    transcodeApiBaseUrl?: string;
    setStatus?: (text: string) => void;
};

type RtcRecordingModuleController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
    setPlaybackAudioElement: (audio: HTMLAudioElement | null) => void;
    setSubtitleText: (text: string) => void;
    handlePlaybackStateChange: (state: PlaybackState) => void;
};

const RECORDING_STYLE_ID = 'cinelite-rtc-recording-style';
const RECORDING_MODAL_ID = 'cinelite-rtc-recording-modal';
const RECORDING_DB_NAME = 'cinelite-rtc-recordings';

const ensureRecordingStyle = () => {
    if (document.getElementById(RECORDING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = RECORDING_STYLE_ID;
    style.textContent = `
        .otp-record-btn {
            height: 32px;
            padding: 0 14px;
            border-radius: 999px;
            border: 1px solid rgba(255, 110, 110, 0.38);
            background: rgba(24, 16, 18, 0.96);
            color: #ffd7d7;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.03em;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
        }
        .otp-record-btn:hover { border-color: rgba(255, 110, 110, 0.58); background: rgba(52, 18, 22, 0.96); }
        .otp-record-dot { width: 10px; height: 10px; border-radius: 999px; border: 1.6px solid #ff6767; background: transparent; flex: 0 0 auto; }
        .otp-record-btn.recording { border-color: rgba(255, 91, 91, 0.88); color: #fff3f3; box-shadow: 0 0 0 1px rgba(255, 91, 91, 0.12), 0 0 22px rgba(255, 72, 72, 0.18); }
        .otp-record-btn.recording .otp-record-dot { background: #ff5c5c; box-shadow: 0 0 12px rgba(255, 92, 92, 0.8); }
        .otp-record-btn.hidden { display: none !important; }
        .otp-record-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .otp-record-timer { font-size: 10px; color: #ffb3b3; min-width: 58px; text-align: center; }
        .otp-modal { position: fixed; inset: 0; z-index: 230; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(6, 8, 12, 0.56); backdrop-filter: blur(8px); }
        .otp-modal.hidden { display: none; }
        .otp-modal .hidden { display: none !important; }
        .otp-modal-card { width: min(900px, calc(100vw - 32px)); max-height: min(84vh, 780px); overflow: auto; border-radius: 18px; border: 1px solid rgba(110, 122, 148, 0.25); background: linear-gradient(180deg, rgba(16, 18, 24, 0.98), rgba(12, 14, 19, 0.98)); box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5); padding: 18px; }
        .otp-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .otp-modal-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; justify-content: flex-end; margin-left: auto; }
        .otp-modal-head-actions .otp-icon-btn { width: 32px; height: 32px; }
        .otp-modal-title { font-size: 18px; font-weight: 800; color: #f3f7ff; }
        .otp-modal-note { color: #aab7ce; font-size: 12px; margin-top: 4px; }
        .otp-modal-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .otp-modal-section { border: 1px solid var(--otp-border); border-radius: 12px; background: rgba(24, 27, 36, 0.96); padding: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .otp-modal-section.span-2 { grid-column: 1 / -1; }
        .otp-modal-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .otp-modal-section-actions { display: inline-flex; align-items: center; gap: 6px; }
        .otp-modal-section-actions .otp-icon-btn { width: 28px; height: 28px; }
        .otp-modal-section-title { font-size: 12px; font-weight: 800; color: #eef4ff; letter-spacing: 0.04em; text-transform: uppercase; }
        .otp-modal-hover-group { position: relative; }
        .otp-modal-tool-btn { width: 32px; height: 32px; }
        .otp-modal-popover { position: absolute; top: calc(100% + 8px); right: 0; width: min(520px, calc(100vw - 54px)); min-width: 460px; border: 1px solid rgba(112, 121, 147, 0.35); border-radius: 12px; background: rgba(16, 20, 30, 0.98); box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); padding: 12px; display: none; z-index: 14; }
        .otp-modal-popover.open { display: flex; flex-direction: column; gap: 10px; }
        .otp-modal-popover-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .otp-modal-popover-close { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--otp-border); background: rgba(18, 21, 30, 0.96); color: #cfd9ec; cursor: pointer; display: grid; place-items: center; padding: 0; }
        .otp-modal-popover-close .otp-icon { width: 12px; height: 12px; stroke-width: 2.2; }
        .otp-modal-row { display: grid; grid-template-columns: 132px minmax(0, 1fr); align-items: center; gap: 12px; }
        .otp-modal-row label, .otp-modal-check { font-size: 12px; color: #d9e4f6; }
        .otp-modal-row > label { display: flex; align-items: center; min-height: 32px; white-space: nowrap; }
        .otp-modal-row select, .otp-modal-row input[type="range"] { width: 100%; }
        .otp-modal-row select { height: 32px; border-radius: 8px; border: 1px solid var(--otp-border); background: var(--otp-input); color: var(--otp-text); padding: 0 8px; }
        .otp-modal-row input[type="checkbox"] { margin: 0; flex: 0 0 auto; }
        .otp-modal-check { display: flex; align-items: center; justify-content: flex-start; gap: 8px; min-height: 32px; width: 100%; margin-left: 0; text-align: left; white-space: nowrap; }
        .otp-modal-check input[type="checkbox"] { margin: 0; width: 14px; height: 14px; flex: 0 0 14px; }
        .otp-modal-check span { flex: 1 1 auto; min-width: 0; text-align: left; }
        .otp-inline-actions { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }
        .otp-inline-actions input[type="range"] { flex: 1 1 auto; min-width: 0; }
        .otp-playlist { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto; }
        .otp-playlist-item { border: 1px solid rgba(112, 121, 147, 0.22); border-radius: 10px; background: rgba(14, 16, 22, 0.92); padding: 8px 10px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 30px; gap: 10px; align-items: center; font-size: 12px; }
        .otp-playlist-preview { width: 34px; height: 24px; border-radius: 8px; border: 1px solid rgba(96, 138, 255, 0.35); background: rgba(18, 24, 38, 0.96); color: #d7e5ff; cursor: pointer; font-size: 11px; font-weight: 700; display: grid; place-items: center; padding: 0; line-height: 1; }
        .otp-playlist-preview.playing { border-color: rgba(90, 165, 255, 0.8); background: rgba(59, 130, 246, 0.18); color: #fff; }
        .otp-playlist-item > div { min-width: 0; }
        .otp-playlist-item > div > div:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .otp-playlist-meta { font-size: 10px; color: #97a3b6; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .otp-playlist-remove { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--otp-border); background: rgba(32, 18, 18, 0.92); color: #ffd0d0; cursor: pointer; display: grid; place-items: center; padding: 0; }
        .otp-playlist-remove .otp-icon { width: 12px; height: 12px; stroke-width: 2.2; }
        .otp-modal-footer { display: flex; justify-content: flex-start; gap: 10px; margin-top: 16px; }
        .otp-recordings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .otp-record-card { border: 1px solid rgba(112, 121, 147, 0.22); border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, rgba(18, 22, 32, 0.98), rgba(10, 13, 20, 0.98)); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2); position: relative; }
        .otp-record-slot-empty { border: 1px dashed rgba(112, 121, 147, 0.38); border-radius: 14px; min-height: 220px; background: rgba(10, 13, 20, 0.5); }
        .otp-record-video { width: 100%; aspect-ratio: 16 / 9; display: block; background: #000; }
        .otp-record-menu-anchor { position: absolute; right: 10px; top: 10px; z-index: 4; }
        .otp-record-menu-btn { width: 30px; height: 30px; border-radius: 10px; border: 1px solid rgba(255, 109, 109, 0.35); background: rgba(25, 10, 12, 0.9); color: #ffd8d8; cursor: pointer; display: grid; place-items: center; padding: 0; }
        .otp-record-menu-btn .otp-icon { width: 14px; height: 14px; stroke-width: 2.2; fill: none; stroke: currentColor; }
        .otp-record-card-body { padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .otp-record-topline { display: block; min-width: 0; }
        .otp-record-subline { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
        .otp-record-name { font-size: 11px; font-weight: 600; color: #eef4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .otp-record-status { display: inline-flex; align-items: center; gap: 6px; width: fit-content; max-width: 100%; padding: 2px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; background: rgba(58, 130, 246, 0.14); color: #bad4ff; flex-shrink: 0; white-space: nowrap; }
        .otp-record-subline .otp-record-status { font-size: 8px; padding: 2px 6px; margin-left: auto; }
        .otp-record-status.warn { background: rgba(245, 158, 11, 0.14); color: #ffd89a; }
        .otp-record-status.processing { background: rgba(87, 166, 255, 0.14); color: #a8d2ff; }
        .otp-record-meta { font-size: 10px; color: #97a3b6; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .otp-value-out { min-width: 44px; text-align: right; color: #a8c6ff; font-size: 11px; display: inline-flex; align-items: center; justify-content: flex-end; white-space: nowrap; }
        .otp-modal-row input[type="color"] { width: 100%; height: 32px; border-radius: 8px; border: 1px solid var(--otp-border); background: var(--otp-input); padding: 4px; }
        @keyframes otp-rec-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 90, 90, 0.16); } 50% { box-shadow: 0 0 0 5px rgba(255, 90, 90, 0.04); } }
        @media (max-width: 1080px) {
            .otp-modal-head { flex-direction: column; }
            .otp-modal-head-actions { justify-content: flex-start; margin-left: 0; }
            .otp-modal-popover { left: 0; right: auto; width: min(520px, calc(100vw - 54px)); min-width: 0; }
            .otp-recordings-grid { grid-template-columns: 1fr; }
            .otp-modal-row { grid-template-columns: 1fr; }
            .otp-modal-check { white-space: normal; align-items: flex-start; margin-left: 0; }
            .otp-inline-actions { flex-wrap: wrap; }
        }
    `;
    document.head.appendChild(style);
};

class RtcRecordingModule implements RtcRecordingModuleController {
    private readonly options: RtcRecordingModuleOptions;
    private readonly modalEl: HTMLDivElement;
    private readonly modalStatusEl: HTMLDivElement;
    private readonly recordTimerEl: HTMLSpanElement;
    private readonly recordOpenBtn: HTMLButtonElement;
    private readonly recordPauseBtn: HTMLButtonElement;
    private readonly recordStopBtn: HTMLButtonElement;
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

    private recordTimerId = 0;
    private recordingPlaylist: RecordingAudioItem[] = [];
    private recordingResults: StoredRecordingEntry[] = [];
    private recordingDbPromise: Promise<IDBDatabase> | null = null;
    private readonly recordingObjectUrls = new Map<string, string>();
    private activeRecording: RecordingRuntime | null = null;
    private recordingAudioMix: RecordingAudioMixRuntime | null = null;
    private recordingCompositorCanvas: HTMLCanvasElement | null = null;
    private recordingCompositorCtx: CanvasRenderingContext2D | null = null;
    private recordingCompositorRaf = 0;
    private recordingSubtitleText = '';
    private musicAudioEl: HTMLAudioElement | null = null;
    private musicIndex = 0;
    private previewAudioEl: HTMLAudioElement | null = null;
    private previewTrackId: string | null = null;
    private playbackAudioEl: HTMLAudioElement | null = null;
    private playbackState: PlaybackState = 'idle';
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

    constructor(options: RtcRecordingModuleOptions, recordOpenBtn: HTMLButtonElement, recordPauseBtn: HTMLButtonElement, recordStopBtn: HTMLButtonElement, recordTimerEl: HTMLSpanElement) {
        ensureRecordingStyle();
        this.options = options;
        this.recordOpenBtn = recordOpenBtn;
        this.recordPauseBtn = recordPauseBtn;
        this.recordStopBtn = recordStopBtn;
        this.recordTimerEl = recordTimerEl;

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

        this.modalEl = document.createElement('div');
        this.modalEl.id = RECORDING_MODAL_ID;
        this.modalEl.className = 'otp-modal hidden';
        this.modalEl.innerHTML = `
            <div class="otp-modal-card">
                <div class="otp-modal-head">
                    <div class="otp-modal-title">Recording</div>
                    <div class="otp-modal-head-actions">
                        <button class="otp-record-btn" type="button" data-record-modal="start" title="Start Recording" aria-label="Start Recording"><span class="otp-record-dot"></span><span class="otp-record-label">Rec</span></button>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="video" title="Video Settings" aria-label="Video Settings"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg></button>
                            <section class="otp-modal-popover" data-record-popover="video">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Video</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="video" title="Close"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button></div>
                                <div class="otp-modal-row"><label>Frame Rate</label><select data-record="frame-rate"><option value="24" selected>24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div>
                                <div class="otp-modal-row"><label>Quality</label><select data-record="quality"><option value="standard" selected>Standard 18 Mbps</option><option value="high">High 28 Mbps</option><option value="ultra">Ultra 40 Mbps</option></select></div>
                                <div class="otp-modal-row"><label>MP4 Compression</label><select data-record="compression"><option value="original">Original</option><option value="fast_export">Fast Export</option><option value="balanced">Balanced</option><option value="archive_smallest">Archive Smallest</option><option value="target_10mb" selected>Target 10MB</option></select></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="auto-play" checked /><span>Auto-start playback when recording begins</span></label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="stop-with-playback" checked /><span>Stop recording automatically when playback finishes</span></label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="hide-panel" /><span>Temporarily hide Recording dialog during capture</span></label>
                            </section>
                        </div>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="audio" title="Audio Settings" aria-label="Audio Settings"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h4l5 4V6l-5 4H4z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19.5 6.5a7 7 0 0 1 0 11" /></svg></button>
                            <section class="otp-modal-popover" data-record-popover="audio">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Audio</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="audio" title="Close"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="include-tts" checked /><span>Capture RTC playback narration</span></label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="include-music" checked /><span>Capture playlist music</span></label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="disable-interrupts" checked /><span>Disable RTC chat input while recording</span></label>
                                <label class="otp-modal-check"><input type="checkbox" data-record="music-loop" checked /><span>Loop playlist when audio ends before playback</span></label>
                                <div class="otp-modal-row"><label>Master Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="100" data-record="master-volume" /><span class="otp-value-out" data-record="master-volume-out">100%</span></div></div>
                                <div class="otp-modal-row"><label>TTS Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="100" data-record="tts-volume" /><span class="otp-value-out" data-record="tts-volume-out">100%</span></div></div>
                                <div class="otp-modal-row"><label>Music Volume</label><div class="otp-inline-actions"><input type="range" min="0" max="100" value="35" data-record="music-volume" /><span class="otp-value-out" data-record="music-volume-out">35%</span></div></div>
                            </section>
                        </div>
                        <div class="otp-modal-hover-group">
                            <button class="otp-icon-btn otp-modal-tool-btn" type="button" data-record-popover-trigger="subtitle" title="Subtitle Settings" aria-label="Subtitle Settings"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 11h10" /><path d="M7 15h7" /></svg></button>
                            <section class="otp-modal-popover" data-record-popover="subtitle">
                                <div class="otp-modal-popover-head"><div class="otp-modal-section-title">Subtitles</div><button class="otp-modal-popover-close" type="button" data-record-popover-close="subtitle" title="Close"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button></div>
                                <label class="otp-modal-check"><input type="checkbox" data-record="subtitles-enabled" checked /><span>Burn subtitles into recording preview</span></label>
                                <div class="otp-modal-row"><label>Font</label><select data-record="subtitle-font"><option value="PingFang SC" selected>PingFang SC Semibold</option><option value="Source Han Sans SC">Source Han Sans SC SemiBold</option><option value="Noto Sans SC">Noto Sans SC Medium</option></select></div>
                                <div class="otp-modal-row"><label>Font Size</label><div class="otp-inline-actions"><input type="range" min="24" max="64" value="26" data-record="subtitle-size" /><span class="otp-value-out" data-record="subtitle-size-out">26px</span></div></div>
                                <div class="otp-modal-row"><label>Font Color</label><input type="color" value="#d7a733" data-record="subtitle-color" /></div>
                            </section>
                        </div>
                    </div>
                    <button class="otp-icon-btn" data-record-modal="close" title="Close Recording"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button>
                </div>
                <div class="otp-modal-grid">
                    <section class="otp-modal-section span-2">
                        <div class="otp-modal-section-head">
                            <div class="otp-modal-section-title">Recordings</div>
                            <div class="otp-modal-section-actions">
                                <button class="otp-icon-btn" type="button" data-record="reload-recordings" title="Reload Recordings"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v6h-6" /></svg></button>
                            </div>
                        </div>
                        <div class="otp-recordings-grid" data-record="results"></div>
                        <div class="otp-empty hidden" data-record="results-empty">No recordings yet.</div>
                    </section>
                    <section class="otp-modal-section span-2">
                        <div class="otp-modal-section-head">
                            <div class="otp-modal-section-title">Music Playlist</div>
                            <div class="otp-modal-section-actions">
                                <button class="otp-icon-btn" type="button" data-record="pick-folder" title="Select Folder"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2" /></svg></button>
                                <button class="otp-icon-btn" type="button" data-record="pick-files" title="Add Files"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M14 4v5h5" /><path d="M12 12v5" /><path d="M9.5 14.5h5" /></svg></button>
                                <button class="otp-icon-btn" type="button" data-record="clear-playlist" title="Clear Playlist"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" /></svg></button>
                            </div>
                        </div>
                        <div class="otp-playlist" data-record="playlist"></div>
                        <div class="otp-empty" data-record="playlist-empty">No music selected.</div>
                    </section>
                </div>
                <div class="otp-modal-footer"><div class="otp-modal-note" data-record="modal-status">Ready to record.</div></div>
            </div>
        `;

        this.modalStatusEl = this.modalEl.querySelector('[data-record="modal-status"]') as HTMLDivElement;
        this.recordingFrameRateSelect = this.modalEl.querySelector('[data-record="frame-rate"]') as HTMLSelectElement;
        this.recordingQualitySelect = this.modalEl.querySelector('[data-record="quality"]') as HTMLSelectElement;
        this.recordingCompressionSelect = this.modalEl.querySelector('[data-record="compression"]') as HTMLSelectElement;
        this.recordingIncludeTtsInput = this.modalEl.querySelector('[data-record="include-tts"]') as HTMLInputElement;
        this.recordingIncludeMusicInput = this.modalEl.querySelector('[data-record="include-music"]') as HTMLInputElement;
        this.recordingAutoPlayInput = this.modalEl.querySelector('[data-record="auto-play"]') as HTMLInputElement;
        this.recordingStopWithPlaybackInput = this.modalEl.querySelector('[data-record="stop-with-playback"]') as HTMLInputElement;
        this.recordingHidePanelInput = this.modalEl.querySelector('[data-record="hide-panel"]') as HTMLInputElement;
        this.recordingDisableInterruptsInput = this.modalEl.querySelector('[data-record="disable-interrupts"]') as HTMLInputElement;
        this.recordingMusicLoopInput = this.modalEl.querySelector('[data-record="music-loop"]') as HTMLInputElement;
        this.recordingMasterVolumeInput = this.modalEl.querySelector('[data-record="master-volume"]') as HTMLInputElement;
        this.recordingTtsVolumeInput = this.modalEl.querySelector('[data-record="tts-volume"]') as HTMLInputElement;
        this.recordingMusicVolumeInput = this.modalEl.querySelector('[data-record="music-volume"]') as HTMLInputElement;
        this.recordingSubtitlesEnabledInput = this.modalEl.querySelector('[data-record="subtitles-enabled"]') as HTMLInputElement;
        this.recordingSubtitleFontSelect = this.modalEl.querySelector('[data-record="subtitle-font"]') as HTMLSelectElement;
        this.recordingSubtitleSizeInput = this.modalEl.querySelector('[data-record="subtitle-size"]') as HTMLInputElement;
        this.recordingSubtitleColorInput = this.modalEl.querySelector('[data-record="subtitle-color"]') as HTMLInputElement;
        this.recordingMasterVolumeOut = this.modalEl.querySelector('[data-record="master-volume-out"]') as HTMLSpanElement;
        this.recordingTtsVolumeOut = this.modalEl.querySelector('[data-record="tts-volume-out"]') as HTMLSpanElement;
        this.recordingMusicVolumeOut = this.modalEl.querySelector('[data-record="music-volume-out"]') as HTMLSpanElement;
        this.recordingSubtitleSizeOut = this.modalEl.querySelector('[data-record="subtitle-size-out"]') as HTMLSpanElement;
        this.recordingPlaylistEl = this.modalEl.querySelector('[data-record="playlist"]') as HTMLDivElement;
        this.recordingEmptyEl = this.modalEl.querySelector('[data-record="playlist-empty"]') as HTMLDivElement;
        this.recordingResultsEl = this.modalEl.querySelector('[data-record="results"]') as HTMLDivElement;
        this.recordingResultsEmptyEl = this.modalEl.querySelector('[data-record="results-empty"]') as HTMLDivElement;

        document.body.appendChild(this.audioInputEl);
        document.body.appendChild(this.folderInputEl);
        document.body.appendChild(this.modalEl);

        this.bindEvents();
        this.syncRecordingForm();
        this.renderRecordingPlaylist();
        this.renderRecordingResults();
        this.refreshRecordingButtons();
        this.setPlaybackAudioElement(this.options.getCurrentPlaybackAudio?.() || null);
        void this.loadRecordingResults();
    }

    open() {
        this.syncRecordingForm();
        this.renderRecordingPlaylist();
        this.modalEl.classList.remove('hidden');
    }

    close() {
        this.modalEl.classList.add('hidden');
        if (!this.activeRecording) this.stopPreviewPlayback();
    }

    toggle() {
        this.modalEl.classList.contains('hidden') ? this.open() : this.close();
    }

    setPlaybackAudioElement(audio: HTMLAudioElement | null) {
        this.playbackAudioEl = audio;
        if (audio && this.recordingAudioMix && this.recordingSettings.includeTts) {
            this.connectRecordingAudioElement(audio, 'tts');
        }
    }

    setSubtitleText(text: string) {
        this.recordingSubtitleText = text;
    }

    handlePlaybackStateChange(state: PlaybackState) {
        this.playbackState = state;
        if (this.activeRecording && this.recordingSettings.stopWithPlayback && (state === 'completed' || state === 'stopped' || state === 'idle')) {
            void this.stopRecording(true, `playback-${state}`);
        }
    }

    private transcodeApiBase() {
        return this.options.transcodeApiBaseUrl || 'http://localhost:3033/api/ot-tour-player';
    }

    private setStatus(text: string) {
        this.options.setStatus?.(text);
    }

    private setRecordingModalStatus(text: string) {
        this.modalStatusEl.textContent = text;
    }

    private bindEvents() {
        this.recordOpenBtn.addEventListener('click', () => this.open());
        this.recordPauseBtn.addEventListener('click', () => this.toggleRecordingPause());
        this.recordStopBtn.addEventListener('click', () => { void this.stopRecording(true, 'record-stop-button'); });
        this.modalEl.querySelector('[data-record-modal="close"]')?.addEventListener('click', () => this.close());
        this.modalEl.querySelector('[data-record-modal="start"]')?.addEventListener('click', () => { void this.startRecording(this.recordingSettings.selectedVariant); });
        this.modalEl.querySelector('[data-record="reload-recordings"]')?.addEventListener('click', () => { void this.loadRecordingResults(); });

        this.modalEl.querySelectorAll('[data-record-popover-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverTrigger || '';
                const popover = this.modalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                if (!popover) return;
                const willOpen = !popover.classList.contains('open');
                this.closeRecordingConfigPopovers();
                if (willOpen) popover.classList.add('open');
            });
        });
        this.modalEl.querySelectorAll('[data-record-popover-close]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const target = (button as HTMLButtonElement).dataset.recordPopoverClose || '';
                const popover = this.modalEl.querySelector(`[data-record-popover="${target}"]`) as HTMLDivElement | null;
                popover?.classList.remove('open');
            });
        });
        this.modalEl.addEventListener('click', (event) => {
            if (event.target === this.modalEl) {
                this.close();
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
                this.applyPlaybackVolume();
            });
        };
        syncVolumeOut(this.recordingMasterVolumeInput, this.recordingMasterVolumeOut);
        syncVolumeOut(this.recordingTtsVolumeInput, this.recordingTtsVolumeOut);
        syncVolumeOut(this.recordingMusicVolumeInput, this.recordingMusicVolumeOut);
        this.recordingSubtitleSizeInput.addEventListener('input', () => {
            this.recordingSubtitleSizeOut.textContent = `${this.recordingSubtitleSizeInput.value}px`;
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        });
        [
            this.recordingSubtitlesEnabledInput,
            this.recordingSubtitleFontSelect,
            this.recordingSubtitleColorInput,
            this.recordingFrameRateSelect,
            this.recordingQualitySelect,
            this.recordingCompressionSelect,
            this.recordingIncludeTtsInput,
            this.recordingIncludeMusicInput,
            this.recordingAutoPlayInput,
            this.recordingStopWithPlaybackInput,
            this.recordingHidePanelInput,
            this.recordingDisableInterruptsInput,
            this.recordingMusicLoopInput
        ].forEach((el) => el.addEventListener('change', () => {
            this.recordingSettings = this.collectRecordingSettings(this.recordingSettings.selectedVariant);
        }));

        this.modalEl.querySelector('[data-record="pick-files"]')?.addEventListener('click', async () => {
            if ((window as Window & typeof globalThis & { showOpenFilePicker?: Function }).showOpenFilePicker) {
                try {
                    const handles = await (window as Window & typeof globalThis & { showOpenFilePicker: Function }).showOpenFilePicker({
                        id: 'CinematicLiteRtcMusicFiles',
                        multiple: true,
                        types: [{ description: 'Audio Files', accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'] } }]
                    });
                    const files = await Promise.all(handles.map((handle: FileSystemFileHandle) => handle.getFile()));
                    await this.addAudioFiles(files, 'files');
                } catch (error) {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) this.setRecordingModalStatus(`Add files failed: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
            }
            this.audioInputEl.click();
        });
        this.modalEl.querySelector('[data-record="pick-folder"]')?.addEventListener('click', async () => {
            if ((window as Window & typeof globalThis & { showDirectoryPicker?: Function }).showDirectoryPicker) {
                try {
                    const handle = await (window as Window & typeof globalThis & { showDirectoryPicker: Function }).showDirectoryPicker({ id: 'CinematicLiteRtcMusicFolder' });
                    const files: File[] = [];
                    for await (const value of handle.values()) {
                        if (value.kind === 'file') files.push(await value.getFile());
                    }
                    await this.addAudioFiles(files, 'folder');
                } catch (error) {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) this.setRecordingModalStatus(`Select folder failed: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
            }
            this.folderInputEl.click();
        });
        this.modalEl.querySelector('[data-record="clear-playlist"]')?.addEventListener('click', () => this.clearRecordingPlaylist());
        this.audioInputEl.addEventListener('change', async () => {
            if (this.audioInputEl.files) await this.addAudioFiles(this.audioInputEl.files, 'files');
            this.audioInputEl.value = '';
        });
        this.folderInputEl.addEventListener('change', async () => {
            if (this.folderInputEl.files) await this.addAudioFiles(this.folderInputEl.files, 'folder');
            this.folderInputEl.value = '';
        });
    }

    private closeRecordingConfigPopovers() {
        this.modalEl.querySelectorAll('[data-record-popover]').forEach((element) => element.classList.remove('open'));
    }

    private refreshRecordingButtons() {
        const recording = Boolean(this.activeRecording);
        const paused = Boolean(this.activeRecording?.paused);
        this.recordOpenBtn.classList.toggle('recording', recording);
        this.recordOpenBtn.classList.toggle('hidden', recording);
        this.recordPauseBtn.classList.toggle('hidden', !recording);
        this.recordStopBtn.classList.toggle('hidden', !recording);
        const pauseLabel = this.recordPauseBtn.querySelector('.otp-record-label') as HTMLSpanElement | null;
        if (pauseLabel) pauseLabel.textContent = paused ? 'Resume' : 'Pause';
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
        this.setRecordingModalStatus(`${next.length} audio file(s) added from ${source}.`);
    }

    private clearRecordingPlaylist() {
        this.stopPreviewPlayback();
        this.recordingPlaylist.forEach((item) => URL.revokeObjectURL(item.url));
        this.recordingPlaylist = [];
        this.renderRecordingPlaylist();
        this.setRecordingModalStatus('Playlist cleared.');
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
                <div><div>${item.name}</div><div class="otp-playlist-meta">${min}:${sec} | ${(item.file.size / 1024 / 1024).toFixed(1)} MB</div></div>
                <button class="otp-playlist-remove" type="button" title="Remove"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button>
            `;
            const previewBtn = row.querySelector('.otp-playlist-preview') as HTMLButtonElement;
            const removeBtn = row.querySelector('.otp-playlist-remove') as HTMLButtonElement;
            previewBtn.addEventListener('click', () => { void this.togglePreviewPlayback(item.id); });
            removeBtn.addEventListener('click', () => {
                if (this.previewTrackId === item.id) this.stopPreviewPlayback();
                URL.revokeObjectURL(item.url);
                this.recordingPlaylist = this.recordingPlaylist.filter((entry) => entry.id !== item.id);
                this.renderRecordingPlaylist();
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
            if (this.previewAudioEl.paused) await this.previewAudioEl.play().catch(() => {});
            else this.previewAudioEl.pause();
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
        };
        this.previewAudioEl = audio;
        this.previewTrackId = trackId;
        await audio.play().catch(() => {});
        this.setRecordingModalStatus(`Previewing ${item.name}`);
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

    private applyPlaybackVolume() {
        if (!this.playbackAudioEl) return;
        this.playbackAudioEl.volume = Math.max(0, Math.min(1, this.recordingSettings.masterVolume * this.recordingSettings.ttsVolume));
    }

    private async ensureRecordingAudioMix() {
        if (this.recordingAudioMix) {
            if (this.recordingAudioMix.context.state === 'suspended') await this.recordingAudioMix.context.resume().catch(() => {});
            return this.recordingAudioMix;
        }
        const context = new AudioContext({ sampleRate: 48000 });
        const destination = context.createMediaStreamDestination();
        const masterGain = context.createGain();
        const musicGain = context.createGain();
        const duckGain = context.createGain();
        const ttsGain = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const musicLowShelf = context.createBiquadFilter();
        const musicHighShelf = context.createBiquadFilter();
        musicLowShelf.type = 'lowshelf';
        musicLowShelf.frequency.value = 180;
        musicLowShelf.gain.value = 1.8;
        musicHighShelf.type = 'highshelf';
        musicHighShelf.frequency.value = 3200;
        musicHighShelf.gain.value = 1.4;
        compressor.threshold.value = -20;
        compressor.knee.value = 18;
        compressor.ratio.value = 2.8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;
        duckGain.gain.value = 1;
        musicGain.gain.value = 1;
        ttsGain.gain.value = 1;
        masterGain.gain.value = 1;
        musicGain.connect(musicLowShelf);
        musicLowShelf.connect(musicHighShelf);
        musicHighShelf.connect(duckGain);
        duckGain.connect(masterGain);
        ttsGain.connect(masterGain);
        masterGain.connect(compressor);
        compressor.connect(destination);
        compressor.connect(context.destination);
        this.recordingAudioMix = { context, destination, masterGain, musicGain, duckGain, ttsGain, compressor, sources: new WeakMap() };
        await context.resume().catch(() => {});
        return this.recordingAudioMix;
    }

    private connectRecordingAudioElement(audio: HTMLAudioElement, channel: 'music' | 'tts') {
        const mix = this.recordingAudioMix;
        if (!mix) return;
        if (mix.sources.has(audio)) return;
        const source = mix.context.createMediaElementSource(audio);
        mix.sources.set(audio, source);
        source.connect(channel === 'music' ? mix.musicGain : mix.ttsGain);
    }

    private updateRecordingAudioDucking(active: boolean) {
        const mix = this.recordingAudioMix;
        if (!mix) return;
        const now = mix.context.currentTime;
        const target = active ? 0.58 : 1;
        mix.duckGain.gain.cancelScheduledValues(now);
        mix.duckGain.gain.setTargetAtTime(target, now, active ? 0.02 : 0.12);
    }

    private stopRecordingAudioMix() {
        const mix = this.recordingAudioMix;
        this.recordingAudioMix = null;
        if (!mix) return;
        void mix.context.close().catch(() => {});
    }

    private startMusicPlayback() {
        if (!this.recordingSettings.includeMusic || this.recordingPlaylist.length < 1) return;
        this.stopMusicPlayback();
        this.musicAudioEl = new Audio();
        this.musicAudioEl.preload = 'auto';
        this.musicAudioEl.crossOrigin = 'anonymous';
        this.applyMusicVolume();
        this.connectRecordingAudioElement(this.musicAudioEl, 'music');
        this.musicAudioEl.addEventListener('ended', () => {
            if (this.recordingPlaylist.length < 1) return;
            if (this.musicIndex >= this.recordingPlaylist.length - 1) {
                if (!this.recordingSettings.musicLoop) return;
                this.musicIndex = 0;
            } else {
                this.musicIndex += 1;
            }
            const next = this.recordingPlaylist[this.musicIndex];
            if (!next || !this.musicAudioEl) return;
            this.musicAudioEl.src = next.url;
            void this.musicAudioEl.play().catch(() => {});
        });
        const first = this.recordingPlaylist[0];
        this.musicIndex = 0;
        this.musicAudioEl.src = first.url;
        void this.musicAudioEl.play().catch(() => {});
    }

    private pauseMusicPlayback() {
        this.musicAudioEl?.pause();
    }

    private resumeMusicPlayback() {
        if (!this.musicAudioEl || !this.recordingSettings.includeMusic) return;
        void this.musicAudioEl.play().catch(() => {});
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
                lines.forEach((line, index) => targetCtx.fillText(line, target.width / 2, y + padY + lineHeight * index + lineHeight / 2));
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
    }

    private toggleRecordingPause() {
        const runtime = this.activeRecording;
        if (!runtime) return;
        if (runtime.paused) {
            runtime.recorder.resume();
            runtime.paused = false;
            if (this.options.isPlaybackPaused()) this.options.playPlayback();
            this.resumeMusicPlayback();
            if (this.playbackAudioEl?.paused && this.recordingSettings.includeTts) void this.playbackAudioEl.play().catch(() => {});
            this.setStatus('Recording resumed.');
        } else {
            runtime.recorder.pause();
            runtime.paused = true;
            if (this.options.isPlaybackActive() && !this.options.isPlaybackPaused()) this.options.pausePlayback();
            this.pauseMusicPlayback();
            this.playbackAudioEl?.pause();
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
            if (ctx.measureText(next).width <= maxWidth || !current) current = next;
            else {
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

    private buildProcessingNote(entry: StoredRecordingEntry) {
        const percent = Math.max(0, Math.min(100, Number(entry.transcodePercent) || 0));
        const eta = this.formatEta(entry.transcodeEtaSec);
        return `MP4 ${percent.toFixed(0)}% · ETA ${eta}`;
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
        const response = await fetch(`${this.transcodeApiBase()}/transcode/jobs`, {
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
        return payload?.job as { jobId: string; progress?: { percent?: number; etaSec?: number | null } };
    }

    private async fetchTranscodeJob(jobId: string) {
        const response = await fetch(`${this.transcodeApiBase()}/transcode/jobs/${encodeURIComponent(jobId)}`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = await response.json();
        return payload?.job as { status: 'pending' | 'running' | 'done' | 'error'; progress?: { percent?: number; etaSec?: number | null }; error?: { message?: string } | null };
    }

    private async fetchTranscodeJobResult(jobId: string) {
        const response = await fetch(`${this.transcodeApiBase()}/transcode/jobs/${encodeURIComponent(jobId)}/result`);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        const mp4Blob = await response.blob();
        return { mp4Blob };
    }

    private async transcodeRecordingEntry(entry: StoredRecordingEntry, settings: RecordingSettings, width: number, height: number) {
        this.setRecordingModalStatus('Uploading WebM for MP4 transcoding...');
        const createdJob = await this.createTranscodeJob(entry.blob, settings, width, height, entry.durationSec);
        await this.updateRecordingResult({ ...entry, transcodeJobId: createdJob.jobId, transcodePercent: Number(createdJob.progress?.percent) || 0, transcodeEtaSec: createdJob.progress?.etaSec ?? null, transcodePhase: 'queued', note: this.buildProcessingNote({ ...entry, transcodePercent: Number(createdJob.progress?.percent) || 0, transcodeEtaSec: createdJob.progress?.etaSec ?? null }) });
        while (true) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            const job = await this.fetchTranscodeJob(createdJob.jobId);
            const progressEntry: StoredRecordingEntry = { ...entry, transcodeJobId: createdJob.jobId, transcodePercent: Number(job.progress?.percent) || 0, transcodeEtaSec: job.progress?.etaSec ?? null, transcodePhase: job.status, note: this.buildProcessingNote({ ...entry, transcodePercent: Number(job.progress?.percent) || 0, transcodeEtaSec: job.progress?.etaSec ?? null }) };
            await this.updateRecordingResult(progressEntry);
            this.setRecordingModalStatus(`MP4 transcoding ${Math.round(progressEntry.transcodePercent || 0)}% (ETA ${this.formatEta(progressEntry.transcodeEtaSec)})...`);
            if (job.status === 'done') return { ...(await this.fetchTranscodeJobResult(createdJob.jobId)), jobId: createdJob.jobId };
            if (job.status === 'error') throw new Error(job.error?.message || 'MP4 transcode job failed');
        }
    }

    private openRecordingDb() {
        if (this.recordingDbPromise) return this.recordingDbPromise;
        this.recordingDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(RECORDING_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
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
            this.recordingResults = results.sort((a, b) => b.createdAt - a.createdAt);
            this.renderRecordingResults();
            this.setRecordingModalStatus('Recordings reloaded.');
        } catch (error) {
            this.setRecordingModalStatus(`Load recordings failed: ${error instanceof Error ? error.message : String(error)}`);
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
                video.onloadedmetadata = () => resolve({ durationSec: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth || 0, height: video.videoHeight || 0 });
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
            return { durationSec: meta.durationSec, width: meta.width, height: meta.height, thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.82) };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private renderRecordingMeta(entry: StoredRecordingEntry) {
        const durationMin = Math.floor(entry.durationSec / 60).toString().padStart(2, '0');
        const durationSec = Math.floor(entry.durationSec % 60).toString().padStart(2, '0');
        const createdAt = new Date(entry.createdAt);
        const stamp = `${createdAt.getMonth() + 1}/${createdAt.getDate()} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
        return `${durationMin}:${durationSec} | ${entry.width}x${entry.height} | ${(entry.size / 1024 / 1024).toFixed(1)} MB | ${stamp}${entry.note ? ` | ${entry.note}` : ''}`;
    }

    private renderRecordingStatus(entry: StoredRecordingEntry) {
        const label = entry.status === 'ready' ? 'MP4 Ready' : entry.status === 'processing' ? `Processing MP4 ${Math.round(entry.transcodePercent || 0)}%` : 'WebM Fallback';
        const className = entry.status === 'ready' ? 'otp-record-status' : entry.status === 'processing' ? 'otp-record-status processing' : 'otp-record-status warn';
        return { label, className };
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
        this.recordingResultsEmptyEl.classList.toggle('hidden', visibleItems.length > 0);
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
                <div class="otp-record-menu-anchor"><button class="otp-record-menu-btn" type="button" title="Delete recording" data-action="delete"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" /></svg></button></div>
                <div class="otp-record-card-body"><div class="otp-record-topline"><div class="otp-record-name">${item.name}</div></div><div class="otp-record-subline"><div class="otp-record-meta">${this.renderRecordingMeta(item)}</div><div class="${status.className}">${status.label}</div></div></div>
            `;
            const video = card.querySelector('video') as HTMLVideoElement;
            const deleteBtn = card.querySelector('[data-action="delete"]') as HTMLButtonElement;
            video.poster = item.thumbnailDataUrl;
            deleteBtn.addEventListener('click', () => { void this.removeRecordingResult(item.id); });
            this.recordingResultsEl.appendChild(card);
        }
    }

    private async addRecordingResult(blob: Blob, mimeType: string, extension: string, status: StoredRecordingEntry['status'], note?: string, options?: { durationSecFallback?: number }) {
        const createdAt = Date.now();
        const meta = await this.captureRecordingThumbnail(blob);
        const resolvedDurationSec = meta.durationSec > 0 ? meta.durationSec : Math.max(0, Number(options?.durationSecFallback) || 0);
        const entry: StoredRecordingEntry = {
            id: `rec_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: `tour-recording-${createdAt}.${extension}`,
            status,
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
        return entry;
    }

    private async updateRecordingResult(entry: StoredRecordingEntry) {
        await this.storeRecordingResult(entry);
        const index = this.recordingResults.findIndex((item) => item.id === entry.id);
        if (index >= 0) this.recordingResults[index] = entry;
        else this.recordingResults.unshift(entry);
        this.recordingResults.sort((a, b) => b.createdAt - a.createdAt);
        this.revokeRecordingObjectUrl(entry.id);
        this.renderRecordingResults();
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
    }

    private async startRecording(variant: RecordingButtonVariant) {
        if (this.activeRecording) {
            await this.stopRecording(true, 'button-stop');
            return;
        }
        const canvas = this.options.getCaptureCanvas();
        if (!canvas) {
            this.setStatus('Recording failed: canvas unavailable.');
            return;
        }
        this.recordingSettings = this.collectRecordingSettings(variant);
        this.syncRecordingForm();
        try {
            this.startRecordingCompositor(canvas);
            const recordingCanvas = this.recordingCompositorCanvas || canvas;
            const canvasStream = recordingCanvas.captureStream(this.recordingSettings.frameRate);
            const outputStream = new MediaStream();
            const videoTrack = canvasStream.getVideoTracks()[0];
            if (!videoTrack) throw new Error('No canvas video track available');
            outputStream.addTrack(videoTrack);
            let audioTrack: MediaStreamTrack | null = null;
            if (this.recordingSettings.includeTts || this.recordingSettings.includeMusic) {
                const mix = await this.ensureRecordingAudioMix();
                audioTrack = mix.destination.stream.getAudioTracks()[0] || null;
                if (!audioTrack) throw new Error('Failed to create recording audio mix track.');
                if (this.playbackAudioEl && this.recordingSettings.includeTts) this.connectRecordingAudioElement(this.playbackAudioEl, 'tts');
            }
            if (audioTrack) outputStream.addTrack(audioTrack);
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
            const chunks: BlobPart[] = [];
            const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: this.recordingSettings.videoBitsPerSecond, audioBitsPerSecond: this.recordingSettings.audioBitsPerSecond });
            recorder.ondataavailable = (event) => {
                if (!event.data || event.data.size < 1 || !this.activeRecording) return;
                chunks.push(event.data);
                this.activeRecording.bytesWritten += event.data.size;
            };
            this.activeRecording = { settings: this.recordingSettings, recorder, stream: outputStream, displayStream: null, chunks, startedAt: performance.now(), mimeType, extension: 'webm', bytesWritten: 0, lastProgressLogAt: 0, paused: false };
            this.stopPreviewPlayback();
            recorder.start(1000);
            this.close();
            if (this.recordingSettings.disableInterrupts) this.options.disableInterrupts?.(true);
            this.refreshRecordingButtons();
            this.startRecordingTimer();
            this.setStatus('Recording started.');
            this.setRecordingModalStatus('Recording WebM... MP4 will be produced after capture finishes.');
            if (this.recordingSettings.includeMusic && this.recordingPlaylist.length > 0) this.startMusicPlayback();
            if (this.recordingSettings.autoPlay && !this.options.isPlaybackActive()) this.options.playPlayback();
        } catch (error) {
            this.stopRecordingCompositor();
            this.stopRecordingAudioMix();
            this.activeRecording = null;
            this.stopRecordingTimer();
            this.refreshRecordingButtons();
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Recording failed: ${message}`);
            this.setRecordingModalStatus(message);
        }
    }

    private async stopRecording(save = true, reason = 'manual-stop') {
        const runtime = this.activeRecording;
        if (!runtime) return;
        this.stopRecordingTimer();
        this.stopMusicPlayback();
        if (runtime.paused && runtime.recorder.state === 'paused') {
            runtime.recorder.resume();
            runtime.paused = false;
        }
        const recordedBlob = await new Promise<Blob>((resolve) => {
            runtime.recorder.onstop = () => resolve(new Blob(runtime.chunks, { type: runtime.mimeType }));
            try {
                runtime.recorder.requestData();
            } catch {}
            runtime.recorder.stop();
        });
        runtime.stream.getTracks().forEach((track) => track.stop());
        runtime.displayStream?.getTracks().forEach((track) => track.stop());
        this.stopRecordingCompositor();
        this.stopRecordingAudioMix();
        this.activeRecording = null;
        this.options.disableInterrupts?.(false);
        this.refreshRecordingButtons();
        this.setStatus(save ? 'Recording complete. Saved to Recordings.' : 'Recording cancelled.');
        if (save && recordedBlob.size > 0) {
            this.setRecordingModalStatus('Recording finished. Saving WebM and preparing MP4...');
            const recordedDurationSec = Math.max(0, (performance.now() - runtime.startedAt) / 1000);
            let processingEntry: StoredRecordingEntry | null = null;
            try {
                processingEntry = await this.addRecordingResult(recordedBlob, runtime.mimeType, runtime.extension, 'processing', 'MP4 0% · ETA --:--', { durationSecFallback: recordedDurationSec });
                this.setRecordingModalStatus('WebM saved. MP4 transcoding in progress...');
                const sourceCanvas = this.options.getCaptureCanvas();
                const { mp4Blob, jobId } = await this.transcodeRecordingEntry(processingEntry, runtime.settings, sourceCanvas?.width || 1920, sourceCanvas?.height || 1080);
                const mp4Meta = await this.captureRecordingThumbnail(mp4Blob);
                await this.updateRecordingResult({ ...processingEntry, name: processingEntry.name.replace(/\.[^.]+$/, '.mp4'), status: 'ready', transcodeJobId: jobId, transcodePercent: 100, transcodeEtaSec: 0, transcodeHeartbeatAt: Date.now(), transcodePhase: 'done', mimeType: 'video/mp4', extension: 'mp4', size: mp4Blob.size, durationSec: mp4Meta.durationSec, width: mp4Meta.width, height: mp4Meta.height, thumbnailDataUrl: mp4Meta.thumbnailDataUrl, note: undefined, blob: mp4Blob });
                this.setRecordingModalStatus('MP4 ready in Recordings.');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (processingEntry) await this.updateRecordingResult({ ...processingEntry, status: 'mp4_failed', transcodePhase: 'error', note: `MP4 transcode failed: ${message}` });
                this.setRecordingModalStatus(`MP4 transcode failed. Kept WebM fallback. ${message}`);
            }
        } else {
            this.setRecordingModalStatus(`Recording stopped (${reason}).`);
        }
    }
}

const mountRtcRecordingModule = (options: RtcRecordingModuleOptions & {
    recordOpenBtn: HTMLButtonElement;
    recordPauseBtn: HTMLButtonElement;
    recordStopBtn: HTMLButtonElement;
    recordTimerEl: HTMLSpanElement;
}) => new RtcRecordingModule(options, options.recordOpenBtn, options.recordPauseBtn, options.recordStopBtn, options.recordTimerEl);

export {
    mountRtcRecordingModule,
    type PlaybackState,
    type RtcRecordingModuleController
};
