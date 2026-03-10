import { WebPCodec } from '@playcanvas/splat-transform';
import { Color, Quat, Vec3, createGraphicsDevice } from 'playcanvas';

import { Events } from '../../events';
import { MappedReadFileSystem } from '../../io';
import { Scene } from '../../scene';
import { getSceneConfig } from '../../scene-config';
import { buildRotationToCoordinate } from '../OT_ModelLoader/algorithms/otml_projection_by_axis';
import { COORDINATE_IDS, type CoordinateId } from '../OT_ModelLoader';

type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type QueueDispatchTask = {
    task_id: string;
    type: 'MOVE' | 'LOOK' | 'SPEAK' | 'PAUSE' | 'EMPHASIZE' | 'END';
    poi_id: string | null;
    poi_name?: string | null;
    coordinates: { x: number; y: number; z: number };
    look?: { yaw: number | null; pitch: number | null } | null;
    content: { text: string; audio_url: string | null };
    execution_mode: 'BLOCKING' | 'INTERRUPTIBLE';
    move_speed_mps?: number | null;
    dwell_ms?: number | null;
    tts_lang?: string | null;
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

type AssetRef = {
    name: string;
    file?: File;
    url?: string;
};

type CalibrationRecord = {
    axisPresetId?: string | null;
    sourceAxisPresetId?: string | null;
    targetAxisPresetId?: string | null;
    selectedBestCameraId?: string | null;
    bestCamera?: {
        eye?: { x?: number; y?: number; z?: number };
        forward?: { x?: number; y?: number; z?: number };
        fovDeg?: number;
        eyeHeightMeters?: number;
    } | null;
};

type ModelEntry = {
    id: string;
    displayName: string;
    assets: {
        model: AssetRef | null;
        calibration: AssetRef | null;
        csv: AssetRef | null;
        audio: AssetRef | null;
    };
    valid: boolean;
    errors: string[];
};

type LiveManifest = {
    source: 'local' | 'server';
    sessionId?: string;
    rootLabel: string;
    intros: AssetRef[];
    models: ModelEntry[];
};

type SourceMode = 'local' | 'server';

type LiveSettings = {
    introDurationSec: number;
    modelSpeed: number;
    subtitleFontSize: number;
    subtitleColor: string;
};

type QueueFilter = 'CHAT' | 'SYSTEM' | 'ALL';

type PlaylistStatus = 'pending' | 'loading' | 'ready' | 'playing' | 'completed' | 'skipped' | 'error';

type PlaylistItemState = {
    model: ModelEntry;
    status: PlaylistStatus;
    note: string;
    roundsCompleted: number;
};

type LivePhase = 'IDLE' | 'INTRO' | 'PRELOADING' | 'TOUR' | 'INTERRUPTING' | 'SWITCHING' | 'ERROR';

type ServerSessionPayload = {
    sessionId: string;
    rootPath: string;
    intros: Array<{ id: string; name: string; url: string }>;
    models: Array<{
        id: string;
        displayName: string;
        valid: boolean;
        errors: string[];
        assets: {
            model: { name: string; url: string } | null;
            calibration: { name: string; url: string } | null;
            csv: { name: string; url: string } | null;
            audio: { name: string; url: string } | null;
        };
    }>;
};

type SessionCurrentResponse = { ok: true; session: ServerSessionPayload | null };

const TP_API = 'http://localhost:3032/api/ot-tour-player';
const LIVE_API = 'http://localhost:3035/api/ot-live-stream';
const DEFAULT_SERVER_PATH = '/Users/duheng/Development/OpenCode/OpenTour/Live';
const MODEL_EXTENSIONS = ['.ply', '.splat', '.ksplat', '.spz', '.sog', '.lcc'];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const shuffle = <T>(items: T[]) => {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const choose = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)] || null;

const asText = (value: unknown) => String(value || '').trim();

const fileExt = (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx).toLowerCase() : '';
};

const displayPoi = (name?: string | null, id?: string | null) => String(name || id || '-');

const worldLabelFromModel = (name?: string | null) => {
    const text = String(name || '').trim();
    const match = text.match(/(\d+)/);
    return match ? `World${match[1]}` : (text || 'World');
};

const normalizeCoordinateId = (value: string | null | undefined): CoordinateId | null => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (COORDINATE_IDS.includes(raw as CoordinateId)) return raw as CoordinateId;
    const lower = raw.toLowerCase();
    for (let i = 0; i < COORDINATE_IDS.length; i += 1) {
        if (COORDINATE_IDS[i].toLowerCase() === lower) return COORDINATE_IDS[i];
    }
    return null;
};

const el = <T extends HTMLElement>(selector: string) => {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
    return node as T;
};

class LiveSceneHost {
    readonly canvas = el<HTMLCanvasElement>('#canvas');
    readonly events = new Events();
    scene!: Scene;
    currentModelFilename: string | null = null;
    private loadedRootTransform: { rotation: Quat } | null = null;
    private debug: ((message: string, detail?: unknown) => void) | null = null;

    setDebugLogger(logger: (message: string, detail?: unknown) => void) {
        this.debug = logger;
    }

    private log(message: string, detail?: unknown) {
        this.debug?.(message, detail);
    }

    private async waitForFrames(count = 2) {
        for (let i = 0; i < count; i += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            this.scene.camera.onUpdate(1 / 60);
            this.scene.forceRender = true;
        }
    }

    async init() {
        WebPCodec.wasmUrl = new URL('static/lib/webp/webp.wasm', document.baseURI).toString();
        const graphicsDevice = await createGraphicsDevice(this.canvas, {
            deviceTypes: ['webgl2'],
            antialias: false,
            depth: false,
            stencil: false,
            xrCompatible: false,
            powerPreference: 'high-performance'
        });
        const sceneConfig = getSceneConfig([{ show: { grid: false, bound: false, cameraPoses: false, shBands: 3 }, camera: { overlay: false } }]);
        this.scene = new Scene(this.events, sceneConfig, this.canvas, graphicsDevice);
        const selectedClr = new Color(1, 1, 0, 1);
        const unselectedClr = new Color(0, 0, 1, 0.5);
        const lockedClr = new Color(0, 0, 0, 0.05);
        let controlMode: 'orbit' | 'fly' = 'fly';
        let cameraOverlay = false;
        let viewBands = 3;
        let outlineSelection = false;
        let cameraBound = false;
        let showCameraPoses = false;
        const cameraMode = 'centers';
        this.events.function('selection', () => null);
        this.events.function('selectedClr', () => selectedClr);
        this.events.function('unselectedClr', () => unselectedClr);
        this.events.function('lockedClr', () => lockedClr);
        this.events.function('camera.mode', () => cameraMode);
        this.events.function('camera.overlay', () => cameraOverlay);
        this.events.function('view.outlineSelection', () => outlineSelection);
        this.events.function('camera.bound', () => cameraBound);
        this.events.function('view.bands', () => viewBands);
        this.events.function('camera.controlMode', () => controlMode);
        this.events.function('camera.flySpeed', () => this.scene.camera.flySpeed);
        this.events.function('camera.showPoses', () => showCameraPoses);
        this.events.on('camera.setOverlay', (value: boolean) => { cameraOverlay = value; this.events.fire('camera.overlay', value); });
        this.events.on('view.setOutlineSelection', (value: boolean) => { outlineSelection = value; this.events.fire('view.outlineSelection', value); });
        this.events.on('camera.setBound', (value: boolean) => { cameraBound = value; this.events.fire('camera.bound', value); });
        this.events.on('camera.setShowPoses', (value: boolean) => { showCameraPoses = value; this.events.fire('camera.showPoses', value); });
        this.events.on('view.setBands', (value: number) => { viewBands = value; this.events.fire('view.bands', value); });
        this.events.on('camera.setControlMode', (mode: 'orbit' | 'fly') => {
            controlMode = mode;
            this.scene.camera.controlMode = mode;
            this.events.fire('camera.controlMode', mode);
        });
        this.events.on('camera.setFlySpeed', (value: number) => {
            this.scene.camera.flySpeed = value;
            this.events.fire('camera.flySpeed', value);
        });
        this.scene.start();
        this.scene.camera.controlMode = 'fly';
        if ((this.scene as unknown as { grid?: { visible?: boolean } }).grid) {
            (this.scene as unknown as { grid: { visible?: boolean } }).grid.visible = false;
        }
        const maybeUnderlay = (this.scene as unknown as { underlay?: { visible?: boolean } }).underlay;
        if (maybeUnderlay) maybeUnderlay.visible = false;
        this.events.fire('camera.setControlMode', 'fly');
    }

    async loadModel(file: File) {
        this.log('model.load.start', { name: file.name, size: file.size });
        const fs = new MappedReadFileSystem();
        fs.addFile(file.name, file);
        const splat = await this.scene.assetLoader.load(file.name, fs);
        this.scene.clear();
        this.scene.contentRoot.setLocalRotation(Quat.IDENTITY);
        await this.scene.add(splat);
        this.loadedRootTransform = {
            rotation: this.scene.contentRoot.getLocalRotation().clone()
        };
        this.scene.camera.focus();
        await this.waitForFrames(2);
        this.scene.camera.controlMode = 'fly';
        this.currentModelFilename = file.name;
        this.log('model.load.done', {
            name: file.name,
            rootRotation: this.quatSnapshot(this.scene.contentRoot.getLocalRotation()),
            camera: this.getLiveCameraPose()
        });
    }

    private quatSnapshot(quat: Quat) {
        return { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
    }

    getLiveCameraPose() {
        const eye = this.scene.camera.mainCamera.getPosition();
        const forward = this.scene.camera.mainCamera.forward;
        return {
            pose: {
                eye: { x: eye.x, y: eye.y, z: eye.z },
                forward: { x: forward.x, y: forward.y, z: forward.z }
            },
            fovDeg: this.scene.camera.fov
        };
    }

    async setLiveCameraPose(pose: CameraPose, fovDeg: number, logEvent: string | null = 'camera.pose.applied') {
        const eye = new Vec3(pose.eye.x, pose.eye.y, pose.eye.z);
        const forward = new Vec3(pose.forward.x, pose.forward.y, pose.forward.z);
        const forwardLen = forward.length();
        if (forwardLen < 1e-6) return;
        forward.mulScalar(1 / forwardLen);
        const target = eye.clone().add(forward.mulScalar(2.6));
        this.scene.camera.fov = Math.max(20, Math.min(120, fovDeg));
        this.scene.camera.controlMode = 'fly';
        this.scene.camera.setPose(eye, target, 0);
        await this.waitForFrames(3);
        this.scene.forceRender = true;
        if (logEvent) {
            this.log(logEvent, {
                pose,
                fovDeg: this.scene.camera.fov
            });
        }
    }

    async applyCalibration(modelFilename: string, text: string) {
        this.log('calibration.upload.start', { modelFilename, chars: text.length });
        const parsed = JSON.parse(text) as { calibration?: CalibrationRecord } & Record<string, unknown>;
        const calibration = (parsed.calibration && typeof parsed.calibration === 'object' ? parsed.calibration : parsed) as CalibrationRecord;
        this.log('calibration.upload.parsed', {
            modelFilename,
            axisPresetId: calibration.axisPresetId || null,
            sourceAxisPresetId: calibration.sourceAxisPresetId || null,
            targetAxisPresetId: calibration.targetAxisPresetId || null,
            selectedBestCameraId: calibration.selectedBestCameraId || null,
            hasBestCamera: Boolean(calibration.bestCamera?.eye && calibration.bestCamera?.forward)
        });
        const response = await fetch('/api/model/calibration', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename, calibration: { ...calibration, modelFilename } })
        });
        if (!response.ok) throw new Error(await response.text());

        const sourcePreset = normalizeCoordinateId(calibration.sourceAxisPresetId || calibration.axisPresetId);
        const targetPreset = normalizeCoordinateId(calibration.targetAxisPresetId || calibration.axisPresetId);
        if (sourcePreset && targetPreset && sourcePreset !== targetPreset && targetPreset === 'R-Yup-Zback') {
            const rotationPlan = buildRotationToCoordinate(sourcePreset, targetPreset);
            const root = this.scene.contentRoot;
            const before = root.getLocalRotation().clone();
            const baseRotation = this.loadedRootTransform?.rotation?.clone() ?? before.clone();
            const delta = new Quat(rotationPlan.quaternion.x, rotationPlan.quaternion.y, rotationPlan.quaternion.z, rotationPlan.quaternion.w);
            const finalRotation = new Quat();
            finalRotation.mul2(baseRotation, delta);
            root.setLocalRotation(finalRotation);
            this.scene.forceRender = true;
            this.log('calibration.rotate.applied', {
                modelFilename,
                sourcePreset,
                targetPreset,
                beforeRotation: this.quatSnapshot(before),
                baseRotation: this.quatSnapshot(baseRotation),
                delta: this.quatSnapshot(delta),
                finalRotation: this.quatSnapshot(finalRotation)
            });
        } else {
            this.log('calibration.rotate.skipped', { modelFilename, sourcePreset: sourcePreset || null, targetPreset: targetPreset || null });
        }

        const bestCamera = calibration.bestCamera;
        if (bestCamera?.eye && bestCamera?.forward) {
            const pose = {
                eye: { x: Number(bestCamera.eye.x || 0), y: Number(bestCamera.eye.y || 0), z: Number(bestCamera.eye.z || 0) },
                forward: { x: Number(bestCamera.forward.x || 0), y: Number(bestCamera.forward.y || 0), z: Number(bestCamera.forward.z || 1) }
            };
            const fovDeg = Number(bestCamera.fovDeg || 62);
            this.log('calibration.bestCamera.target', { modelFilename, pose, fovDeg, eyeHeightMeters: bestCamera.eyeHeightMeters ?? null });
            await this.setLiveCameraPose(pose, fovDeg, 'calibration.bestCamera.cameraApplied');
            const live = this.getLiveCameraPose();
            const diff = {
                eye: {
                    x: Math.abs(live.pose.eye.x - pose.eye.x),
                    y: Math.abs(live.pose.eye.y - pose.eye.y),
                    z: Math.abs(live.pose.eye.z - pose.eye.z)
                },
                forward: {
                    x: Math.abs(live.pose.forward.x - pose.forward.x),
                    y: Math.abs(live.pose.forward.y - pose.forward.y),
                    z: Math.abs(live.pose.forward.z - pose.forward.z)
                },
                fovDeg: Math.abs(live.fovDeg - fovDeg)
            };
            this.log('calibration.bestCamera.applied', { modelFilename, live, diff });
        } else {
            this.log('calibration.bestCamera.missing', { modelFilename });
        }
    }
}

class LiveStreamApp {
    private readonly sceneHost = new LiveSceneHost();
    private readonly stage = el<HTMLDivElement>('#live-stage');
    private readonly introVideo = el<HTMLVideoElement>('#live-intro-video');
    private readonly stageCurtain = el<HTMLDivElement>('#live-stage-curtain');
    private readonly subtitleEl = el<HTMLDivElement>('#live-subtitle');
    private readonly playlistBody = el<HTMLDivElement>('[data-role="playlist-body"]');
    private readonly queueBody = el<HTMLDivElement>('[data-role="queue-body"]');
    private readonly queueCountEl = el<HTMLSpanElement>('[data-role="queue-count"]');
    private readonly queueFilterChatBtn = el<HTMLButtonElement>('[data-filter="CHAT"]');
    private readonly queueFilterSystemBtn = el<HTMLButtonElement>('[data-filter="SYSTEM"]');
    private readonly queueFilterAllBtn = el<HTMLButtonElement>('[data-filter="ALL"]');
    private readonly queueMapToggleBtn = el<HTMLButtonElement>('[data-act="toggle-queue-map"]');
    private readonly queueMapPanel = el<HTMLDivElement>('[data-role="queue-map-panel"]');
    private readonly queueMapBody = el<HTMLDivElement>('[data-role="queue-map-body"]');
    private readonly priorityBody = el<HTMLDivElement>('[data-role="priority-body"]');
    private readonly interruptBody = el<HTMLDivElement>('[data-role="interrupt-body"]');
    private readonly transcriptBody = el<HTMLDivElement>('[data-role="transcript-body"]');
    private readonly debugBody = el<HTMLDivElement>('[data-role="debug-body"]');
    private readonly debugToolbar = el<HTMLDivElement>('.live-debug-toolbar');
    private readonly nowPlayingEl = el<HTMLDivElement>('[data-role="now-playing"]');
    private readonly timerEl = el<HTMLSpanElement>('[data-role="timer"]');
    private readonly pathInput = el<HTMLInputElement>('[data-role="server-path"]');
    private readonly localInput = el<HTMLInputElement>('[data-role="folder-input"]');
    private readonly sourceSummaryEl = el<HTMLDivElement>('[data-role="source-summary"]');
    private readonly sourceModalSummaryEl = el<HTMLDivElement>('[data-role="source-modal-summary"]');
    private readonly panel = el<HTMLDivElement>('#live-panel');
    private readonly debugConsole = el<HTMLDivElement>('#live-debug-console');
    private readonly panelToggle = el<HTMLButtonElement>('[data-act="toggle-panel"]');
    private readonly chooseFolderBtn = el<HTMLButtonElement>('[data-act="choose-folder"]');
    private readonly configBtn = el<HTMLButtonElement>('[data-act="open-config"]');
    private readonly playPauseBtn = el<HTMLButtonElement>('[data-act="toggle-playback"]');
    private readonly stopBtn = el<HTMLButtonElement>('[data-act="stop-live"]');
    private readonly chatInput = el<HTMLInputElement>('[data-role="chat-input"]');
    private readonly chatSendBtn = el<HTMLButtonElement>('[data-act="send-chat"]');
    private readonly debugToggleBtn = el<HTMLButtonElement>('[data-act="toggle-debug"]');
    private readonly clearDebugBtn = el<HTMLButtonElement>('[data-act="clear-debug"]');
    private readonly sourceModal = el<HTMLDivElement>('#live-source-modal');
    private readonly configModal = el<HTMLDivElement>('#live-config-modal');
    private readonly sourceModeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="live-source-mode"]'));
    private readonly sourceConfirmBtn = el<HTMLButtonElement>('[data-act="confirm-source"]');
    private readonly sourceCancelBtn = el<HTMLButtonElement>('[data-act="cancel-source-btn"]');
    private readonly sourceBackdrop = el<HTMLDivElement>('[data-act="cancel-source-backdrop"]');
    private readonly sourcePickLocalBtn = el<HTMLButtonElement>('[data-act="pick-local-folder"]');
    private readonly configCloseBtn = el<HTMLButtonElement>('[data-act="close-config"]');
    private readonly configBackdrop = el<HTMLDivElement>('[data-act="close-config-backdrop"]');
    private readonly introDurationInput = el<HTMLInputElement>('[data-role="intro-duration"]');
    private readonly modelSpeedInput = el<HTMLSelectElement>('[data-role="model-speed"]');
    private readonly subtitleSizeInput = el<HTMLInputElement>('[data-role="subtitle-size"]');
    private readonly subtitleColorInput = el<HTMLInputElement>('[data-role="subtitle-color"]');

    private manifest: LiveManifest | null = null;
    private playlistState = new Map<string, PlaylistItemState>();
    private order: string[] = [];
    private orderCursor = 0;
    private roundsCompleted = 0;
    private phase: LivePhase = 'IDLE';
    private active = false;
    private stopRequested = false;
    private currentModel: ModelEntry | null = null;
    private tpSessionId = '';
    private tpSnapshot: QueueSnapshot | null = null;
    private pendingTaskStatus: 'COMPLETED' | 'SKIPPED' | 'FAILED' | undefined;
    private playbackToken = 0;
    private paused = false;
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmBaseVolume = 0.62;
    private liveEventSource: EventSource | null = null;
    private tpEventSource: EventSource | null = null;
    private currentServerSessionId: string | null = null;
    private objectUrls = new Map<string, string>();
    private interruptLogs: string[] = [];
    private readonly debugLogs: string[] = [];
    private sourceMode: SourceMode = 'server';
    private selectedLocalManifest: LiveManifest | null = null;
    private timerHandle: number | null = null;
    private startedAtMs = 0;
    private elapsedBeforePauseMs = 0;
    private currentTaskAudio: HTMLAudioElement | null = null;
    private currentStatus = 'Ready for live stream.';
    private queueFilter: QueueFilter = 'CHAT';
    private queueMapVisible = false;
    private settings: LiveSettings = {
        introDurationSec: 0,
        modelSpeed: 1,
        subtitleFontSize: 26,
        subtitleColor: '#d7a733'
    };

    async init() {
        this.pathInput.value = DEFAULT_SERVER_PATH;
        this.queueFilter = 'CHAT';
        this.introDurationInput.value = '0';
        this.modelSpeedInput.value = '1';
        this.subtitleSizeInput.value = String(this.settings.subtitleFontSize);
        this.subtitleColorInput.value = this.settings.subtitleColor;
        this.sceneHost.setDebugLogger((message, detail) => this.logDebug(message, detail));
        await this.sceneHost.init();
        this.bindEvents();
        this.connectLiveEvents();
        await this.tryResumeServerSession();
        if (!this.active) this.setPhase('IDLE', 'Ready for live stream.');
        this.applySubtitleStyle();
        this.updateSourceSummary();
        this.updatePlayPauseUi();
        this.updateTimer();
        this.render();
    }

    private bindEvents() {
        this.panelToggle.addEventListener('click', () => {
            this.panel.classList.toggle('collapsed');
            this.panelToggle.title = this.panel.classList.contains('collapsed') ? 'Show Panel' : 'Hide Panel';
        });
        this.debugToolbar.addEventListener('click', (event) => {
            if (!this.debugConsole.classList.contains('collapsed')) return;
            const target = event.target as HTMLElement;
            if (target.closest('button,input,select,textarea,label,a')) return;
            this.debugConsole.classList.remove('collapsed');
            this.debugToggleBtn.title = 'Collapse Debug';
        });
        this.debugToggleBtn.addEventListener('click', () => {
            this.debugConsole.classList.toggle('collapsed');
            this.debugToggleBtn.title = this.debugConsole.classList.contains('collapsed') ? 'Expand Debug' : 'Collapse Debug';
        });
        this.configBtn.addEventListener('click', () => this.openConfigModal());
        this.chooseFolderBtn.addEventListener('click', () => this.openSourceModal());
        this.playPauseBtn.addEventListener('click', () => void this.togglePlayback());
        this.clearDebugBtn.addEventListener('click', () => {
            this.debugLogs.length = 0;
            this.renderDebug();
        });
        this.sourcePickLocalBtn.addEventListener('click', () => this.localInput.click());
        this.sourceBackdrop.addEventListener('click', () => this.closeSourceModal());
        this.sourceCancelBtn.addEventListener('click', () => this.closeSourceModal());
        this.sourceConfirmBtn.addEventListener('click', () => void this.confirmSourceSelection());
        this.configBackdrop.addEventListener('click', () => this.closeConfigModal());
        this.configCloseBtn.addEventListener('click', () => this.closeConfigModal());
        this.sourceModeInputs.forEach((input) => input.addEventListener('change', () => {
            this.sourceMode = input.value === 'local' ? 'local' : 'server';
            this.syncSourceModal();
        }));
        this.pathInput.addEventListener('input', () => this.updateSourceSummary());
        this.queueFilterChatBtn.addEventListener('click', () => { this.queueFilter = 'CHAT'; this.renderQueues(); });
        this.queueFilterSystemBtn.addEventListener('click', () => { this.queueFilter = 'SYSTEM'; this.renderQueues(); });
        this.queueFilterAllBtn.addEventListener('click', () => { this.queueFilter = 'ALL'; this.renderQueues(); });
        this.queueMapToggleBtn.addEventListener('click', () => {
            this.queueMapVisible = !this.queueMapVisible;
            this.renderQueues();
        });
        this.localInput.addEventListener('change', async () => {
            const files = this.localInput.files ? Array.from(this.localInput.files) : [];
            this.localInput.value = '';
            if (files.length < 1) return;
            this.selectedLocalManifest = this.buildLocalManifest(files);
            this.sourceMode = 'local';
            this.syncSourceModal();
            this.updateSourceSummary();
            this.appendTranscript('system', `Local folder ready: ${this.selectedLocalManifest.rootLabel}`);
        });
        this.stopBtn.addEventListener('click', () => {
            this.stopLive();
        });
        this.chatSendBtn.addEventListener('click', () => void this.sendChat());
        this.chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.sendChat();
            }
        });
        this.introDurationInput.addEventListener('input', () => {
            this.settings.introDurationSec = Math.max(0, Number(this.introDurationInput.value || '0'));
        });
        this.modelSpeedInput.addEventListener('change', () => {
            this.settings.modelSpeed = Math.max(0.25, Number(this.modelSpeedInput.value || '1'));
        });
        this.subtitleSizeInput.addEventListener('input', () => {
            this.settings.subtitleFontSize = Math.max(18, Math.min(64, Number(this.subtitleSizeInput.value || '26')));
            this.applySubtitleStyle();
        });
        this.subtitleColorInput.addEventListener('input', () => {
            this.settings.subtitleColor = this.subtitleColorInput.value || '#d7a733';
            this.applySubtitleStyle();
        });
    }

    private connectLiveEvents() {
        this.liveEventSource = new EventSource(`${LIVE_API}/events`);
        const handleSession = async (event: MessageEvent) => {
            try {
                const payload = JSON.parse(event.data || '{}');
                if (payload?.session) await this.startLive(this.normalizeServerManifest(payload.session), true);
            } catch {
                // ignore malformed event
            }
        };
        this.liveEventSource.addEventListener('session.started', (event) => void handleSession(event as MessageEvent));
        this.liveEventSource.addEventListener('session.current', (event) => void handleSession(event as MessageEvent));
    }

    private async tryResumeServerSession() {
        const response = await fetch(`${LIVE_API}/session/current`).catch((): Response | null => null);
        if (!response || !response.ok) return;
        const payload = await response.json() as SessionCurrentResponse;
        if (payload.session) await this.startLive(this.normalizeServerManifest(payload.session), true);
    }

    private normalizeServerManifest(session: ServerSessionPayload): LiveManifest {
        const withOrigin = (url: string) => url.startsWith('http') ? url : `http://localhost:3035${url}`;
        return {
            source: 'server',
            sessionId: session.sessionId,
            rootLabel: session.rootPath,
            intros: session.intros.map((item) => ({ name: item.name, url: withOrigin(item.url) })),
            models: session.models.map((model) => ({
                id: model.id,
                displayName: model.displayName,
                valid: model.valid,
                errors: model.errors,
                assets: {
                    model: model.assets.model ? { name: model.assets.model.name, url: withOrigin(model.assets.model.url) } : null,
                    calibration: model.assets.calibration ? { name: model.assets.calibration.name, url: withOrigin(model.assets.calibration.url) } : null,
                    csv: model.assets.csv ? { name: model.assets.csv.name, url: withOrigin(model.assets.csv.url) } : null,
                    audio: model.assets.audio ? { name: model.assets.audio.name, url: withOrigin(model.assets.audio.url) } : null
                }
            }))
        };
    }

    private formatElapsed(ms: number) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const ss = String(totalSec % 60).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    private updateTimer() {
        const elapsed = this.active
            ? this.elapsedBeforePauseMs + (this.paused ? 0 : Math.max(0, Date.now() - this.startedAtMs))
            : this.elapsedBeforePauseMs;
        this.timerEl.textContent = this.formatElapsed(elapsed);
    }

    private startTimer() {
        if (this.timerHandle) window.clearInterval(this.timerHandle);
        this.timerHandle = window.setInterval(() => this.updateTimer(), 250);
        this.updateTimer();
    }

    private stopTimer(reset = false) {
        if (this.timerHandle) {
            window.clearInterval(this.timerHandle);
            this.timerHandle = null;
        }
        if (reset) {
            this.startedAtMs = 0;
            this.elapsedBeforePauseMs = 0;
        }
        this.updateTimer();
    }

    private updatePlayPauseUi() {
        const state = !this.active ? 'idle' : this.paused ? 'paused' : 'playing';
        this.playPauseBtn.dataset.state = state;
        this.playPauseBtn.setAttribute('aria-label', state === 'playing' ? 'Pause live' : 'Start live');
        this.playPauseBtn.title = state === 'playing' ? 'Pause live' : state === 'paused' ? 'Resume live' : 'Start live';
    }

    private updateSourceSummary() {
        const text = this.sourceMode === 'local'
            ? (this.selectedLocalManifest ? `Local | ${this.selectedLocalManifest.rootLabel}` : 'Local | No folder selected')
            : `Server | ${this.pathInput.value.trim() || DEFAULT_SERVER_PATH}`;
        this.sourceSummaryEl.textContent = text;
        this.sourceModalSummaryEl.textContent = text;
        return;
    }

    private openSourceModal() {
        this.syncSourceModal();
        this.sourceModal.hidden = false;
        document.body.classList.add('live-modal-open');
    }

    private closeSourceModal() {
        this.sourceModal.hidden = true;
        if (this.configModal.hidden) document.body.classList.remove('live-modal-open');
    }

    private openConfigModal() {
        this.configModal.hidden = false;
        document.body.classList.add('live-modal-open');
    }

    private closeConfigModal() {
        this.configModal.hidden = true;
        if (this.sourceModal.hidden) document.body.classList.remove('live-modal-open');
    }

    private syncSourceModal() {
        this.sourceModeInputs.forEach((input) => {
            input.checked = input.value === this.sourceMode;
        });
        this.sourceModal.dataset.mode = this.sourceMode;
        this.updateSourceSummary();
    }

    private async confirmSourceSelection() {
        if (this.sourceMode === 'local' && !this.selectedLocalManifest) {
            this.setStatus('Choose a local folder before confirming.');
            return;
        }
        this.updateSourceSummary();
        this.closeSourceModal();
    }

    private async fetchServerManifest() {
        const response = await fetch(`${LIVE_API}/session/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: this.pathInput.value.trim() || DEFAULT_SERVER_PATH })
        });
        if (!response.ok) throw new Error(await response.text());
        const payload = await response.json();
        return this.normalizeServerManifest(payload.session);
    }

    private async togglePlayback() {
        if (this.active) {
            if (this.paused) this.resumeLive();
            else this.pauseLive();
            return;
        }
        try {
            const manifest = this.sourceMode === 'local'
                ? this.selectedLocalManifest
                : await this.fetchServerManifest();
            if (!manifest) {
                this.setStatus(this.sourceMode === 'local' ? 'Choose a local folder first.' : 'Select a server folder first.');
                return;
            }
            await this.startLive(manifest);
        } catch (error) {
            this.logDebug('playback.start.error', { error: error instanceof Error ? error.message : String(error) });
            this.setStatus(`Live start failed: ${String(error)}`);
        }
    }

    private pauseLive() {
        if (!this.active || this.paused) return;
        this.paused = true;
        this.elapsedBeforePauseMs += Math.max(0, Date.now() - this.startedAtMs);
        this.introVideo.pause();
        this.bgmAudio?.pause();
        this.currentTaskAudio?.pause();
        if ('speechSynthesis' in window) window.speechSynthesis.pause();
        this.setStatus('Live paused.');
        this.updatePlayPauseUi();
        this.updateTimer();
    }

    private resumeLive() {
        if (!this.active || !this.paused) return;
        this.paused = false;
        this.startedAtMs = Date.now();
        if (this.phase === 'INTRO') void this.introVideo.play().catch((): void => undefined);
        if (this.phase === 'TOUR') void this.bgmAudio?.play().catch((): void => undefined);
        if (this.currentTaskAudio) void this.currentTaskAudio.play().catch((): void => undefined);
        if ('speechSynthesis' in window) window.speechSynthesis.resume();
        this.setStatus(`Resuming ${worldLabelFromModel(this.currentModel?.displayName) || 'live stream'}`);
        this.updatePlayPauseUi();
        this.updateTimer();
    }

    private stopLive() {
        this.stopRequested = true;
        this.active = false;
        this.paused = false;
        this.playbackToken += 1;
        this.stopAudio();
        this.closeTpEvents();
        this.currentTaskAudio?.pause();
        this.currentTaskAudio = null;
        window.speechSynthesis.cancel();
        this.stopTimer(true);
        this.tpSessionId = '';
        this.setPhase('IDLE', 'Live stream stopped.');
        this.updatePlayPauseUi();
    }

    private async waitWhilePaused(token: number) {
        while (this.paused && !this.stopRequested && token === this.playbackToken) {
            await sleep(80);
        }
    }

    private buildLocalManifest(files: File[]): LiveManifest {
        const rootName = files[0]?.webkitRelativePath?.split('/')[0] || 'Live';
        const intros: AssetRef[] = [];
        const groups = new Map<string, File[]>();
        files.forEach((file) => {
            const path = file.webkitRelativePath || file.name;
            const parts = path.split('/');
            if (parts.length === 2 && /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
                intros.push({ name: file.name, file });
                return;
            }
            if (parts.length === 3 && parts[1].toLowerCase() === 'intros' && /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
                intros.push({ name: file.name, file });
                return;
            }
            if (parts.length < 3) return;
            const folder = parts[1];
            const current = groups.get(folder) || [];
            current.push(file);
            groups.set(folder, current);
        });
        const models = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en')).map(([folder, items], index) => {
            const calibration = items.find((file) => /calibration/i.test(file.name) && fileExt(file.name) === '.json') || null;
            const csv = items.find((file) => fileExt(file.name) === '.csv') || null;
            const audio = items.find((file) => ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(fileExt(file.name))) || null;
            const model = items.find((file) => MODEL_EXTENSIONS.includes(fileExt(file.name)) && !/calibration/i.test(file.name)) || null;
            const errors = [] as string[];
            if (!model) errors.push('missing model file');
            if (!calibration) errors.push('missing calibration json');
            if (!csv) errors.push('missing csv');
            if (!audio) errors.push('missing audio');
            return {
                id: `model_${index + 1}`,
                displayName: folder,
                valid: errors.length < 1,
                errors,
                assets: {
                    model: model ? { name: model.name, file: model } : null,
                    calibration: calibration ? { name: calibration.name, file: calibration } : null,
                    csv: csv ? { name: csv.name, file: csv } : null,
                    audio: audio ? { name: audio.name, file: audio } : null
                }
            };
        });
        return { source: 'local', rootLabel: rootName, intros, models };
    }

    private async startLive(manifest: LiveManifest, silent = false) {
        if (silent && this.active && manifest.source === 'server' && manifest.sessionId && manifest.sessionId === this.currentServerSessionId) {
            return;
        }
        if (!silent && this.active) {
            this.stopRequested = true;
            this.active = false;
            this.playbackToken += 1;
            this.closeTpEvents();
            this.stopAudio();
            await sleep(120);
        }

        this.manifest = manifest;
        this.sourceMode = manifest.source;
        this.queueFilter = 'CHAT';
        this.currentServerSessionId = manifest.sessionId || null;
        this.playlistState = new Map(manifest.models.map((model) => [model.id, {
            model,
            status: model.valid ? 'pending' : 'error',
            note: model.valid ? 'Waiting' : model.errors.join(', '),
            roundsCompleted: 0
        }]));
        this.order = [];
        this.orderCursor = 0;
        this.roundsCompleted = 0;
        this.active = true;
        this.stopRequested = false;
        this.paused = false;
        this.playbackToken += 1;
        this.startedAtMs = Date.now();
        this.elapsedBeforePauseMs = 0;
        this.startTimer();
        this.updatePlayPauseUi();
        this.prepareNextRound();
        this.render();
        this.appendTranscript('system', `Live stream armed: ${manifest.rootLabel}`);
        this.logDebug('live.start', {
            source: manifest.source,
            rootLabel: manifest.rootLabel,
            modelCount: manifest.models.length,
            introCount: manifest.intros.length
        });
        this.setStatus(`Live stream started from ${manifest.rootLabel}`);
        void this.runLoop(this.playbackToken);
    }

    private prepareNextRound() {
        if (!this.manifest) return;
        this.order = shuffle(this.manifest.models.filter((model) => model.valid).map((model) => model.id));
        this.orderCursor = 0;
        this.roundsCompleted += 1;
        this.playlistState.forEach((state) => {
            if (state.model.valid) {
                state.status = 'pending';
                state.note = `Round ${this.roundsCompleted} queued`;
            }
        });
        this.render();
    }

    private async runLoop(token: number) {
        while (this.active && !this.stopRequested && token === this.playbackToken) {
            await this.waitWhilePaused(token);
            if (!this.manifest) return;
            if (this.orderCursor >= this.order.length) this.prepareNextRound();
            const modelId = this.order[this.orderCursor];
            const item = modelId ? this.playlistState.get(modelId) : null;
            if (!item) {
                this.orderCursor += 1;
                continue;
            }
            try {
                await this.playModelEntry(item, token);
                item.status = 'completed';
                item.note = `Round ${this.roundsCompleted} complete`;
                item.roundsCompleted += 1;
                this.logDebug('model.cycle.done', { modelId: item.model.id, model: item.model.displayName, round: this.roundsCompleted });
            } catch (error) {
                item.status = 'error';
                item.note = error instanceof Error ? error.message : String(error);
                this.logDebug('model.cycle.error', { modelId: item.model.id, model: item.model.displayName, error: item.note });
                this.appendTranscript('system', `Skipped ${item.model.displayName}: ${item.note}`);
            }
            this.orderCursor += 1;
            this.render();
            await this.waitWhilePaused(token);
            await sleep(240);
        }
    }

    private async playModelEntry(item: PlaylistItemState, token: number) {
        const model = item.model;
        this.currentModel = model;
        this.logDebug('model.cycle.start', { modelId: model.id, model: model.displayName, round: this.roundsCompleted });
        item.status = 'loading';
        item.note = 'Preloading model, calibration, csv, and music';
        this.render();

        const intro = choose(this.manifest?.intros || []);
        const prep = this.prepareModel(model, token);
        const introPromise = intro ? this.playIntro(intro, model.displayName, token) : sleep(450);
        this.setPhase('INTRO', `Opening ${model.displayName}`);
        const prepared = await prep;
        await this.waitWhilePaused(token);
        await introPromise;
        if (this.stopRequested || token !== this.playbackToken) return;

        item.status = 'ready';
        item.note = 'Intro complete. Entering tour.';
        this.render();
        await this.transitionToModel(token);
        await this.startBgm(prepared.audioUrl);
        this.setPhase('TOUR', `Touring ${model.displayName}`);
        item.status = 'playing';
        item.note = 'Running tour tasks';
        this.render();

        this.tpSessionId = prepared.sessionId;
        this.openTpEvents(prepared.sessionId);
        this.pendingTaskStatus = undefined;
        await this.runTpLoop(prepared.sessionId, token);
        this.closeTpEvents();
        this.stopBgm();
        await this.fadeCurtain(token);
    }

    private async prepareModel(model: ModelEntry, token: number) {
        if (!model.assets.model || !model.assets.calibration || !model.assets.csv || !model.assets.audio) {
            throw new Error(model.errors.join(', ') || 'missing model assets');
        }
        const modelFile = await this.assetAsFile(model.assets.model);
        this.logDebug('asset.model.ready', { model: model.displayName, name: modelFile.name, bytes: modelFile.size });
        const calibrationText = await this.assetAsText(model.assets.calibration);
        this.logDebug('asset.calibration.ready', { model: model.displayName, chars: calibrationText.length });
        const csvText = await this.assetAsText(model.assets.csv);
        this.logDebug('asset.csv.ready', { model: model.displayName, chars: csvText.length, lines: csvText.split(/\r?\n/).length });
        const audioUrl = await this.assetAsUrl(model.assets.audio);
        this.logDebug('asset.audio.ready', { model: model.displayName, name: model.assets.audio.name });
        if (this.stopRequested || token !== this.playbackToken) throw new Error('cancelled');
        await this.sceneHost.loadModel(modelFile);
        await this.sceneHost.applyCalibration(modelFile.name, calibrationText);
        const sessionId = await this.createTpSession(modelFile.name, csvText);
        this.logDebug('prepare.done', { model: model.displayName, sessionId });
        return { sessionId, audioUrl };
    }

    private async playIntro(intro: AssetRef, modelName: string, token: number) {
        const url = await this.assetAsUrl(intro);
        if (this.stopRequested || token !== this.playbackToken) return;
        this.stage.classList.add('mode-intro');
        this.stage.classList.remove('mode-model');
        this.nowPlayingEl.textContent = `${worldLabelFromModel(modelName)} | Intro: ${intro.name}`;
        this.introVideo.src = url;
        this.introVideo.currentTime = 0;
        this.introVideo.muted = false;
        this.introVideo.volume = 1;
        this.introVideo.classList.add('visible');
        await this.revealCurtain(token);
        let ended = false;
        this.introVideo.onended = () => { ended = true; };
        this.introVideo.onerror = () => { ended = true; };
        void this.introVideo.play().catch(() => { ended = true; });
        const limit = this.settings.introDurationSec > 0 ? this.settings.introDurationSec : Number.POSITIVE_INFINITY;
        while (!ended && this.introVideo.currentTime < limit && !this.stopRequested && token === this.playbackToken) {
            await this.waitWhilePaused(token);
            await sleep(100);
        }
        this.introVideo.onended = null;
        this.introVideo.onerror = null;
    }

    private async transitionToModel(token: number) {
        if (this.stopRequested || token !== this.playbackToken) return;
        this.stage.classList.add('mode-model');
        await this.fadeCurtain(token);
        this.introVideo.classList.remove('visible');
        this.introVideo.pause();
        this.introVideo.removeAttribute('src');
        this.introVideo.load();
        this.stage.classList.remove('mode-intro');
    }

    private async revealCurtain(token: number) {
        if (this.stopRequested || token !== this.playbackToken) return;
        this.stageCurtain.classList.add('open');
        await sleep(620);
    }

    private async fadeCurtain(token: number) {
        if (this.stopRequested || token !== this.playbackToken) return;
        this.stageCurtain.classList.remove('open');
        await sleep(420);
        this.stageCurtain.classList.add('open');
        await sleep(320);
    }

    private async createTpSession(modelFilename: string, csvText: string) {
        const sessionId = `sess_${Date.now().toString(36)}`;
        const response = await fetch(`${TP_API}/script`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, model_filename: modelFilename, csv_text: csvText })
        });
        if (!response.ok) throw new Error(await response.text());
        const payload = await response.json();
        this.logDebug('tp.session.created', {
            sessionId: payload.session_id || sessionId,
            modelFilename,
            scriptQueue: payload?.snapshot?.scriptQueue?.length ?? 0,
            priorityQueue: payload?.snapshot?.priorityQueue?.length ?? 0
        });
        this.tpSnapshot = payload.snapshot || null;
        this.renderQueues();
        return String(payload.session_id || sessionId);
    }

    private openTpEvents(sessionId: string) {
        this.closeTpEvents();
        this.tpEventSource = new EventSource(`${TP_API}/events?session_id=${encodeURIComponent(sessionId)}`);
        this.tpEventSource.addEventListener('queue.updated', (event) => {
            try {
                const payload = JSON.parse((event as MessageEvent).data || '{}');
                this.tpSnapshot = {
                    sessionId: payload.sessionId,
                    runningTask: payload.runningTask || null,
                    scriptQueue: payload.scriptQueue || [],
                    priorityQueue: payload.priorityQueue || [],
                    version: payload.version || 0
                };
                this.renderQueues();
            } catch {
                // ignore queue update parse error
            }
        });
        this.tpEventSource.addEventListener('interrupt.debug', (event) => {
            try {
                const payload = JSON.parse((event as MessageEvent).data || '{}');
                const line = `${payload?.matched ? 'Matched' : 'Fallback'} | ${payload?.matchedPoi?.poiName || payload?.userCommand || '-'}`;
                this.interruptLogs.unshift(line);
                this.interruptLogs = this.interruptLogs.slice(0, 8);
                this.renderInterrupts();
            } catch {
                // ignore interrupt parse error
            }
        });
    }

    private closeTpEvents() {
        if (this.tpEventSource) {
            this.tpEventSource.close();
            this.tpEventSource = null;
        }
    }

    private async runTpLoop(sessionId: string, token: number) {
        while (!this.stopRequested && token === this.playbackToken) {
            await this.waitWhilePaused(token);
            const response = await fetch(`${TP_API}/next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, status: this.pendingTaskStatus })
            });
            if (!response.ok) throw new Error(await response.text());
            const payload = await response.json();
            this.pendingTaskStatus = undefined;
            this.tpSnapshot = payload.snapshot || null;
            this.renderQueues();
            const task = payload.task as QueueDispatchTask | null;
            if (!task) return;
            this.logDebug('tp.next.task', { sessionId, taskId: task.task_id, type: task.type, poi: displayPoi(task.poi_name, task.poi_id) });
            this.nowPlayingEl.textContent = `${worldLabelFromModel(this.currentModel?.displayName)} | ${task.type} | ${displayPoi(task.poi_name, task.poi_id)}`;
            await this.waitWhilePaused(token);
            this.pendingTaskStatus = await this.executeTask(task, token);
        }
    }

    private async executeTask(task: QueueDispatchTask, token: number) {
        try {
            const speechPromise = task.content?.text ? this.speakText(task, token) : Promise.resolve();
            if (task.type === 'MOVE' || task.type === 'LOOK') {
                const movePromise = this.moveToTask(task, token);
                if (task.execution_mode === 'INTERRUPTIBLE') await movePromise;
                else await Promise.all([movePromise, speechPromise]);
            } else {
                await speechPromise;
                if (task.dwell_ms) await sleep(Math.max(0, Number(task.dwell_ms)) / this.settings.modelSpeed);
            }
            return this.stopRequested || token !== this.playbackToken ? 'SKIPPED' : 'COMPLETED';
        } catch {
            return 'FAILED';
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

    private async moveToTask(task: QueueDispatchTask, token: number) {
        const live = this.sceneHost.getLiveCameraPose();
        const to = this.cameraPoseFromTask(task);
        const from = live.pose;
        const distance = Math.hypot(to.eye.x - from.eye.x, to.eye.y - from.eye.y, to.eye.z - from.eye.z);
        const speed = Math.max(0.2, Number(task.move_speed_mps ?? 0.8) * this.settings.modelSpeed);
        const duration = Math.max(260, (distance / speed) * 1000);
        const startAt = performance.now();
        while (true) {
            if (this.stopRequested || token !== this.playbackToken) return;
            await this.waitWhilePaused(token);
            const t = clamp((performance.now() - startAt) / duration, 0, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
            const lerp = (a: number, b: number) => a + (b - a) * ease;
            await this.sceneHost.setLiveCameraPose({
                eye: { x: lerp(from.eye.x, to.eye.x), y: lerp(from.eye.y, to.eye.y), z: lerp(from.eye.z, to.eye.z) },
                forward: { x: lerp(from.forward.x, to.forward.x), y: lerp(from.forward.y, to.forward.y), z: lerp(from.forward.z, to.forward.z) }
            }, live.fovDeg, null);
            if (t >= 1) break;
            await sleep(16);
        }
        const dwellMs = Math.max(0, Number(task.dwell_ms ?? 0)) / this.settings.modelSpeed;
        if (dwellMs > 0) await sleep(dwellMs);
    }

    private resolveSpeechLang(task: QueueDispatchTask) {
        const requested = asText(task.tts_lang);
        if (requested) return requested;
        return /[\u3400-\u9fff]/.test(task.content?.text || '') ? 'zh-CN' : 'en-US';
    }

    private async speakText(task: QueueDispatchTask, token: number) {
        const text = asText(task.content?.text);
        if (!text) return;
        this.subtitleEl.textContent = text;
        this.applySubtitleStyle();
        this.duckMusic(true);
        try {
            const audioUrl = asText(task.content?.audio_url);
            if (audioUrl) {
                await new Promise<void>((resolve) => {
                    const audio = new Audio(audioUrl);
                    this.currentTaskAudio = audio;
                    audio.onended = () => resolve();
                    audio.onerror = () => resolve();
                    void audio.play().catch(() => resolve());
                });
                this.currentTaskAudio = null;
                return;
            }
            if (!('speechSynthesis' in window)) {
                await sleep(Math.max(1000, Math.min(8000, text.length * 120)) / this.settings.modelSpeed);
                return;
            }
            await new Promise<void>((resolve) => {
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = this.resolveSpeechLang(task);
                utter.rate = Math.max(0.7, Math.min(2, this.settings.modelSpeed));
                utter.pitch = 1;
                utter.volume = 1;
                utter.onend = () => resolve();
                utter.onerror = () => resolve();
                if (this.stopRequested || token !== this.playbackToken) {
                    resolve();
                    return;
                }
                window.speechSynthesis.speak(utter);
            });
        } finally {
            if (this.subtitleEl.textContent === text) this.subtitleEl.textContent = '';
            this.applySubtitleStyle();
            this.duckMusic(false);
        }
    }

    private async sendChat() {
        const message = this.chatInput.value.trim();
        if (!message || !this.tpSessionId) return;
        this.chatInput.value = '';
        this.setPhase('INTERRUPTING', `Answering: ${message}`);
        this.appendTranscript('user', message);
        const response = await fetch(`${TP_API}/interrupt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: this.tpSessionId, user_command: message, user_name: 'Live Audience' })
        });
        if (!response.ok) {
            const errorText = await response.text();
            this.logDebug('interrupt.error', { message, error: errorText });
            this.appendTranscript('system', `Interrupt failed: ${errorText}`);
            return;
        }
        const payload = await response.json();
        this.logDebug('interrupt.queued', { message, payload });
        this.appendTranscript('system', payload.message || 'Interrupt queued.');
        this.setPhase('TOUR', `Resuming ${worldLabelFromModel(this.currentModel?.displayName) || 'tour'}`);
    }

    private logDebug(message: string, detail?: unknown) {
        const time = new Date().toLocaleTimeString();
        const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
        this.debugLogs.unshift(`[${time}] ${message}${suffix}`);
        this.debugLogs.splice(120);
        this.renderDebug();
        console.debug(`[OT_LiveStream] ${message}`, detail);
    }

    private async assetAsFile(asset: AssetRef) {
        if (asset.file) return asset.file;
        const response = await fetch(asset.url || '');
        if (!response.ok) throw new Error(await response.text());
        const blob = await response.blob();
        return new File([blob], asset.name, { type: blob.type || 'application/octet-stream' });
    }

    private async assetAsText(asset: AssetRef) {
        if (asset.file) return asset.file.text();
        const response = await fetch(asset.url || '');
        if (!response.ok) throw new Error(await response.text());
        return response.text();
    }

    private async assetAsUrl(asset: AssetRef) {
        if (asset.url && !asset.file) return asset.url;
        const key = `${asset.name}-${asset.file?.lastModified || 0}-${asset.file?.size || 0}`;
        if (!this.objectUrls.has(key) && asset.file) {
            this.objectUrls.set(key, URL.createObjectURL(asset.file));
        }
        return this.objectUrls.get(key) || asset.url || '';
    }

    private async startBgm(url: string) {
        this.stopBgm();
        this.bgmAudio = new Audio(url);
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = this.bgmBaseVolume;
        this.bgmAudio.crossOrigin = 'anonymous';
        await this.bgmAudio.play().catch((): void => undefined);
    }

    private stopBgm() {
        if (!this.bgmAudio) return;
        this.bgmAudio.pause();
        this.bgmAudio.currentTime = 0;
        this.bgmAudio.src = '';
        this.bgmAudio.load();
        this.bgmAudio = null;
    }

    private duckMusic(active: boolean) {
        if (!this.bgmAudio) return;
        this.bgmAudio.volume = active ? this.bgmBaseVolume * 0.24 : this.bgmBaseVolume;
    }

    private stopAudio() {
        this.stopBgm();
        if (this.currentTaskAudio) {
            this.currentTaskAudio.pause();
            this.currentTaskAudio = null;
        }
        this.introVideo.pause();
        this.introVideo.removeAttribute('src');
        this.introVideo.load();
    }

    private applySubtitleStyle() {
        this.subtitleEl.style.fontSize = `${this.settings.subtitleFontSize}px`;
        this.subtitleEl.style.color = this.settings.subtitleColor;
        this.subtitleEl.classList.toggle('empty', !this.subtitleEl.textContent?.trim());
    }

    private setPhase(phase: LivePhase, status: string) {
        this.phase = phase;
        this.setStatus(status);
    }

    private setStatus(text: string) {
        this.currentStatus = text;
    }

    private appendTranscript(role: 'system' | 'user', text: string) {
        const row = document.createElement('div');
        row.className = `live-log ${role}`;
        row.textContent = `${new Date().toLocaleTimeString()} | ${role === 'user' ? 'CHAT' : 'SYSTEM'} | ${text}`;
        this.transcriptBody.prepend(row);
        while (this.transcriptBody.children.length > 18) {
            this.transcriptBody.lastElementChild?.remove();
        }
    }

    private renderQueues() {
        const setActive = (btn: HTMLButtonElement, active: boolean) => btn.classList.toggle('active', active);
        setActive(this.queueFilterChatBtn, this.queueFilter === 'CHAT');
        setActive(this.queueFilterSystemBtn, this.queueFilter === 'SYSTEM');
        setActive(this.queueFilterAllBtn, this.queueFilter === 'ALL');
        this.queueMapPanel.classList.toggle('hidden', !this.queueMapVisible);

        const allTasks = [
            ...(this.tpSnapshot?.priorityQueue || []).map((task) => ({ ...task, viewKind: 'CHAT' as const })),
            ...(this.tpSnapshot?.scriptQueue || []).map((task) => ({ ...task, viewKind: 'SYSTEM' as const }))
        ];
        const visibleTasks = allTasks.filter((task) => {
            if (this.queueFilter === 'ALL') return true;
            return task.viewKind === this.queueFilter;
        });
        this.queueCountEl.textContent = String(visibleTasks.length);

        const renderList = (target: HTMLDivElement, tasks: Array<QueueViewTask & { viewKind?: QueueFilter }>) => {
            target.innerHTML = '';
            if (tasks.length < 1) {
                const empty = document.createElement('div');
                empty.className = 'otp-empty';
                empty.textContent = 'Initialize session to view logs';
                target.appendChild(empty);
                return;
            }
            tasks.forEach((task) => {
                const row = document.createElement('div');
                row.className = `live-task${task.viewKind === 'CHAT' ? ' interrupt' : ''}`;
                row.innerHTML = `<strong>${task.action}</strong><span>${displayPoi(task.poiName, task.poiId)} · ${task.behavior}</span>`;
                target.appendChild(row);
            });
        };
        renderList(this.queueBody, visibleTasks);
        const priority = this.tpSnapshot?.priorityQueue || [];
        renderList(this.priorityBody, priority);
        this.queueMapBody.textContent = this.currentModel
            ? `${this.currentModel.displayName}\nQueue: ${visibleTasks.length} item(s)`
            : 'Initialize session to view logs';
    }

    private renderInterrupts() {
        this.interruptBody.innerHTML = '';
        if (this.interruptLogs.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'live-empty';
            empty.textContent = 'Empty';
            this.interruptBody.appendChild(empty);
            return;
        }
        this.interruptLogs.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'live-task interrupt';
            row.textContent = item;
            this.interruptBody.appendChild(row);
        });
    }

    private renderDebug() {
        this.debugBody.innerHTML = '';
        if (this.debugLogs.length < 1) {
            const empty = document.createElement('div');
            empty.className = 'live-empty';
            empty.textContent = 'Empty';
            this.debugBody.appendChild(empty);
            return;
        }
        this.debugLogs.forEach((line) => {
            const row = document.createElement('div');
            row.className = 'live-debug-row';
            row.textContent = line;
            this.debugBody.appendChild(row);
        });
    }

    private renderPlaylist() {
        this.playlistBody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        Array.from(this.playlistState.values()).forEach((item) => {
            const row = document.createElement('div');
            row.className = `live-playlist-item ${item.status}${this.currentModel?.id === item.model.id ? ' current' : ''}`;
            row.innerHTML = `<div class="title">${item.model.displayName}</div><div class="meta">${item.note}</div>`;
            fragment.appendChild(row);
        });
        this.playlistBody.appendChild(fragment);
    }

    private render() {
        this.updatePlayPauseUi();
        this.updateSourceSummary();
        this.applySubtitleStyle();
        this.debugToggleBtn.title = this.debugConsole.classList.contains('collapsed') ? 'Expand Debug' : 'Collapse Debug';
        this.renderPlaylist();
        this.renderQueues();
        this.renderInterrupts();
        this.renderDebug();
    }
}

const bootstrap = () => {
    document.body.innerHTML = `
        <div id="live-app">
            <div id="live-stage-shell">
                <div id="live-stage" class="mode-intro">
                    <div id="canvas-container"><canvas id="canvas"></canvas></div>
                    <video id="live-intro-video" playsinline preload="auto"></video>
                    <div id="live-stage-curtain"></div>
                    <div id="live-chrome-top">
                        <div class="live-brand">OpenTour World Streaming</div>
                        <div class="live-pill" data-role="now-playing">Waiting for showtime</div>
                    </div>
                    <div id="live-subtitle"></div>
                </div>
                <input data-role="folder-input" type="file" webkitdirectory directory multiple hidden />
            </div>
            <aside id="live-panel">
                <details class="live-panel-card live-panel-section" open>
                    <summary class="live-section-summary"><span>Chat</span></summary>
                    <div class="live-chat-bar"><input class="live-input" data-role="chat-input" placeholder="Ask the live guide..." /><button type="button" class="live-icon-btn live-tool-btn enter" data-act="send-chat" title="Interrupt" aria-label="Interrupt"><span class="icon-enter"></span></button></div>
                </details>
                <details class="live-panel-card live-panel-section" open>
                    <summary class="live-section-summary"><span>Playlist</span></summary>
                    <div data-role="playlist-body"></div>
                </details>
                <details class="live-panel-card live-panel-section" open>
                    <summary class="live-section-summary"><span>Script Queue</span><span class="live-badge" data-role="queue-count">0</span></summary>
                    <div class="live-queue-filter-row">
                        <div class="live-tabs">
                            <button class="live-tab active" data-filter="CHAT">Chat</button>
                            <button class="live-tab" data-filter="SYSTEM">System</button>
                            <button class="live-tab" data-filter="ALL">All</button>
                        </div>
                        <div class="live-transcript-tools">
                            <button class="live-icon-btn live-tool-btn" data-act="toggle-queue-map" title="Toggle Tour Map" aria-label="Toggle Tour Map"><svg class="otp-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M5 12h14" /><path d="M12 5a10 10 0 0 1 0 14" /><path d="M12 5a10 10 0 0 0 0 14" /></svg></button>
                        </div>
                    </div>
                    <div class="live-map-panel hidden" data-role="queue-map-panel">
                        <div class="live-map-head">TopView (position + yaw)</div>
                        <div class="live-map-body" data-role="queue-map-body">Initialize session to view logs</div>
                    </div>
                    <div data-role="queue-body" class="live-list"></div>
                </details>
                <details class="live-panel-card live-panel-section">
                    <summary class="live-section-summary"><span>Interrupt Queue</span></summary>
                    <div data-role="priority-body"></div>
                </details>
                <details class="live-panel-card live-panel-section">
                    <summary class="live-section-summary"><span>Intent Trace</span></summary>
                    <div data-role="interrupt-body"></div>
                </details>
                <details class="live-panel-card live-panel-section" open>
                    <summary class="live-section-summary"><span>Transcript</span></summary>
                    <div data-role="transcript-body"></div>
                </details>
            </aside>
            <section id="live-debug-console" class="live-panel-card">
                <div class="live-debug-toolbar">
                    <div class="live-debug-left">
                        <div class="live-section-title no-margin">Debug Console</div>
                        <button type="button" class="live-icon-btn transport" data-act="toggle-playback" data-state="idle" aria-label="Start live" title="Start live"><span class="icon-play"></span></button>
                        <button type="button" class="live-icon-btn stop" data-act="stop-live" aria-label="Stop live" title="Stop live"><span class="icon-stop"></span></button>
                        <div class="live-timer" data-role="timer">00:00:00</div>
                    </div>
                    <div class="live-debug-right">
                        <div class="live-source-summary compact" data-role="source-summary">Server | /Users/duheng/Development/OpenCode/OpenTour/Live</div>
                        <button type="button" class="live-icon-btn folder" data-act="choose-folder" aria-label="Choose source" title="Choose source"><span class="icon-folder"></span></button>
                        <button type="button" class="live-icon-btn config" data-act="open-config" aria-label="Playback settings" title="Playback settings"><span class="icon-gear"></span></button>
                        <button type="button" class="live-icon-btn stack" data-act="toggle-panel" aria-label="Hide Panel" title="Hide Panel"><span class="icon-panel"></span></button>
                        <button type="button" class="live-icon-btn broom" data-act="clear-debug" aria-label="Clear Debug" title="Clear Debug"><span class="icon-clear"></span></button>
                        <button type="button" class="live-icon-btn eyeoff" data-act="toggle-debug" aria-label="Hide Debug" title="Hide Debug"><span class="icon-chevron"></span></button>
                    </div>
                </div>
                <div data-role="debug-body"></div>
            </section>
            <div id="live-source-modal" hidden>
                <div class="live-modal-backdrop" data-act="cancel-source-backdrop"></div>
                <div class="live-modal-card">
                    <div class="live-section-title">Source</div>
                    <label class="live-source-option"><input type="radio" name="live-source-mode" value="server" checked />Server Folder</label>
                    <label class="live-source-option"><input type="radio" name="live-source-mode" value="local" />Local Folder</label>
                    <div class="live-modal-pane server-pane">
                        <input class="live-input" data-role="server-path" placeholder="Server Live folder path" />
                    </div>
                    <div class="live-modal-pane local-pane">
                        <button type="button" class="live-btn ghost" data-act="pick-local-folder">Choose Local Folder</button>
                        <div class="live-modal-hint" data-role="source-modal-summary">Local | No folder selected</div>
                    </div>
                    <div class="live-modal-actions">
                        <button type="button" class="live-btn ghost" data-act="cancel-source-btn">Cancel</button>
                        <button type="button" class="live-btn" data-act="confirm-source">Confirm</button>
                    </div>
                </div>
            </div>
            <div id="live-config-modal" hidden>
                <div class="live-modal-backdrop" data-act="close-config-backdrop"></div>
                <div class="live-modal-card">
                    <div class="live-section-title">Playback Settings</div>
                    <label class="live-config-modal-row"><span>Intro Duration (0 = full clip)</span><input class="live-mini-input" type="number" min="0" step="1" data-role="intro-duration" placeholder="auto" /></label>
                    <label class="live-config-modal-row"><span>Model Speed</span><select class="live-mini-input" data-role="model-speed"><option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1.0x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2.0x</option></select></label>
                    <label class="live-config-modal-row"><span>Subtitle Size</span><input class="live-mini-input range" type="range" min="18" max="64" step="1" data-role="subtitle-size" /></label>
                    <label class="live-config-modal-row"><span>Subtitle Color</span><input class="live-color-input" type="color" data-role="subtitle-color" value="#d7a733" /></label>
                    <div class="live-modal-actions"><button type="button" class="live-btn" data-act="close-config">Done</button></div>
                </div>
            </div>
        </div>
    `;
};

const injectStyle = () => {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --live-bg: #090a0f;
            --live-surface: rgba(12, 15, 23, 0.84);
            --live-surface-2: rgba(18, 24, 35, 0.72);
            --live-line: rgba(255, 255, 255, 0.11);
            --live-text: #f7f1e5;
            --live-muted: #a79f92;
            --live-accent: #d4b483;
            --live-danger: #d66d5c;
        }
        html, body { margin: 0; min-height: 100%; background: radial-gradient(circle at top, #16131a 0%, #090a0f 42%, #040507 100%); color: var(--live-text); font-family: Georgia, "Times New Roman", serif; overflow: hidden; }
        #live-app { min-height: 100vh; }
        #live-stage-shell { position: fixed; left: 18px; top: 18px; width: calc(100vw - 432px); height: calc((100vw - 432px) * 9 / 16); min-width: 0; z-index: 1; }
        #live-stage { position: absolute; left: 0; top: 0; width: 100%; height: 100%; aspect-ratio: 16 / 9; border-radius: 22px; overflow: hidden; background: linear-gradient(160deg, rgba(9, 11, 18, 0.98), rgba(4, 6, 10, 0.98)); border: 1px solid rgba(255,255,255,0.16); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 0 1px rgba(247,241,229,0.1), 0 40px 120px rgba(0,0,0,0.52); }
        #canvas-container, #canvas { width: 100%; height: 100%; display: block; }
        #live-intro-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 900ms ease, transform 1400ms ease; transform: scale(1.04); }
        #live-intro-video.visible { opacity: 1; transform: scale(1); }
        #live-stage.mode-model #canvas-container { opacity: 1; transform: scale(1); }
        #live-stage.mode-intro #canvas-container { opacity: 0.42; transform: scale(1.015); }
        #canvas-container { transition: opacity 1200ms ease, transform 1400ms ease; }
        #live-stage-curtain { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.96), rgba(10,10,14,0.2) 24%, rgba(10,10,14,0.2) 76%, rgba(0,0,0,0.96)); opacity: 1; pointer-events: none; transition: opacity 700ms ease; }
        #live-stage-curtain.open { opacity: 0; }
        #live-chrome-top { position: absolute; inset: 18px 18px auto 18px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; pointer-events: none; }
        .live-brand, .live-pill { background: rgba(7, 9, 15, 0.54); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(16px); }
        .live-brand { padding: 12px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.01em; font-family: "Segoe UI", "Noto Sans", sans-serif; text-transform: none; }
        .live-pill { padding: 12px 16px; border-radius: 18px; font-size: 13px; max-width: 50%; text-align: right; }
        #live-subtitle { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: min(72%, 920px); text-align: center; font-size: clamp(18px, 1.9vw, 32px); line-height: 1.42; padding: 14px 22px; border-radius: 22px; color: #d7a733; background: rgba(0,0,0,0.48); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 20px 40px rgba(0,0,0,0.3); transition: opacity 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
        #live-subtitle.empty { opacity: 0; background: transparent; border-color: transparent; box-shadow: none; pointer-events: none; }
        .live-input { min-width: 0; width: 100%; height: 36px; border-radius: 10px; border: 1px solid rgba(137,156,181,0.18); background: rgba(255,255,255,0.04); color: var(--live-text); padding: 0 12px; font-size: 12px; }
        .live-btn { height: 36px; border-radius: 10px; border: 1px solid rgba(137,156,181,0.22); background: linear-gradient(180deg, rgba(28,36,48,0.96), rgba(16,24,34,0.96)); color: #dce6f5; padding: 0 14px; cursor: pointer; font-size: 12px; }
        .live-btn.ghost { background: rgba(255,255,255,0.04); border-color: var(--live-line); }
        .live-btn.danger { border-color: rgba(214,109,92,0.28); background: linear-gradient(180deg, rgba(214,109,92,0.26), rgba(214,109,92,0.06)); }
        .live-icon-btn { width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(137,156,181,0.2); background: linear-gradient(180deg, rgba(22,30,43,0.96), rgba(17,24,36,0.96)); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.025); cursor: pointer; position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; color: #d6e1f0; }
        .live-icon-btn.transport { color: #59d784; border-color: rgba(89,215,132,0.32); }
        .live-icon-btn.stop { color: #ff6a5c; border-color: rgba(255,106,92,0.34); }
        .live-icon-btn span { display: block; position: relative; width: 14px; height: 14px; }
        .live-icon-btn.folder span::before { content: ''; display: block; width: 12px; height: 8px; border: 1.35px solid currentColor; border-top-left-radius: 2.5px; border-top-right-radius: 2.5px; border-bottom-left-radius: 2px; border-bottom-right-radius: 2px; position: absolute; left: 1px; top: 4px; }
        .live-icon-btn.folder span::after { content: ''; position: absolute; left: 1px; top: 1px; width: 6px; height: 3px; border: 1.35px solid currentColor; border-bottom: none; border-top-left-radius: 2px; border-top-right-radius: 2px; }
        .live-icon-btn.transport .icon-play::before { content: ''; position: absolute; left: 4px; top: 1px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 8px solid currentColor; }
        .live-icon-btn.transport[data-state="playing"] .icon-play::before, .live-icon-btn.transport[data-state="playing"] .icon-play::after { content: ''; position: absolute; top: 1px; width: 3px; height: 12px; background: currentColor; border-radius: 2px; }
        .live-icon-btn.transport[data-state="playing"] .icon-play::before { left: 3px; border: 0; }
        .live-icon-btn.transport[data-state="playing"] .icon-play::after { right: 3px; }
        .live-icon-btn.stop .icon-stop::before { content: ''; position: absolute; left: 2px; top: 2px; width: 10px; height: 10px; background: currentColor; border-radius: 2px; }
        .live-icon-btn.config .icon-gear::before { content: ''; position: absolute; inset: 3px; border: 1.4px solid currentColor; border-radius: 50%; }
        .live-icon-btn.config .icon-gear::after { content: ''; position: absolute; left: 5px; top: 5px; width: 4px; height: 4px; border-radius: 50%; border: 1.4px solid currentColor; box-shadow: 0 -6px 0 -1px #17202e, 0 -6px 0 0 currentColor, 0 6px 0 -1px #17202e, 0 6px 0 0 currentColor, 6px 0 0 -1px #17202e, 6px 0 0 0 currentColor, -6px 0 0 -1px #17202e, -6px 0 0 0 currentColor; }
        .live-icon-btn.stack .icon-panel::before { content: ''; position: absolute; inset: 1px; border: 1.35px solid currentColor; border-radius: 2px; }
        .live-icon-btn.stack .icon-panel::after { content: ''; position: absolute; top: 1px; bottom: 1px; right: 3px; width: 3px; background: currentColor; border-radius: 1px; }
        .live-icon-btn.broom .icon-clear::before { content: ''; position: absolute; left: 5px; top: 1px; width: 1.5px; height: 12px; background: currentColor; transform: rotate(45deg); transform-origin: center; }
        .live-icon-btn.broom .icon-clear::after { content: ''; position: absolute; left: 2px; top: 8px; width: 7px; height: 4px; border: 1.35px solid currentColor; border-top: none; transform: rotate(45deg); }
        .live-icon-btn.eyeoff .icon-chevron::before { content: ''; position: absolute; left: 3px; top: 5px; width: 8px; height: 8px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
        .live-icon-btn.enter .icon-enter::before { content: ''; position: absolute; left: 2px; top: 6px; width: 9px; height: 0; border-top: 1.5px solid currentColor; }
        .live-icon-btn.enter .icon-enter::after { content: ''; position: absolute; left: 7px; top: 3px; width: 5px; height: 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); }
        #live-debug-console.collapsed .live-icon-btn.eyeoff .icon-chevron::before { top: 2px; transform: rotate(-135deg); }
        .live-icon-btn:hover { border-color: rgba(221,230,243,0.4); background: linear-gradient(180deg, rgba(28,38,53,0.98), rgba(19,28,41,0.98)); }
        .live-source-summary, .live-timer { min-height: 30px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(137,156,181,0.18); background: rgba(255,255,255,0.035); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .live-source-summary { min-width: 210px; max-width: 330px; font-size: 10px; color: #aab5c6; }
        .live-source-summary.compact { min-width: 0; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .live-timer { min-width: 84px; justify-content: center; font-size: 10px; color: #ff6a5c; border-color: rgba(255,106,92,0.26); }
        .live-mini-input { height: 38px; border-radius: 12px; border: 1px solid var(--live-line); background: rgba(255,255,255,0.04); color: var(--live-text); padding: 0 10px; min-width: 90px; }
        .live-color-input { width: 44px; height: 38px; border-radius: 12px; border: 1px solid var(--live-line); background: transparent; }
        #live-panel { position: fixed; top: 0; right: 0; width: 360px; bottom: 0; padding: 18px 18px 18px 0; display: flex; flex-direction: column; gap: 12px; overflow: auto; transition: opacity 300ms ease; z-index: 3; color: #e2e2e9; font-family: "Segoe UI", "Noto Sans", sans-serif; }
        #live-panel.collapsed { width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
        #live-debug-console { position: fixed; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column; border-color: rgba(255,255,255,0.16); min-height: 52px; max-height: 228px; padding: 10px 12px 12px; z-index: 6; border-radius: 14px 14px 0 0; border-left: 0; border-right: 0; border-bottom: 0; }
        #live-debug-console.collapsed { min-height: 40px; max-height: 40px; padding-top: 8px; padding-bottom: 8px; }
        .live-panel-card { border-radius: 14px; border: 1px solid #33333e; background: #1a1a20; padding: 0; box-shadow: 0 24px 60px rgba(0,0,0,0.35); backdrop-filter: none; overflow: hidden; }
        .live-section-title { font-size: 11px; letter-spacing: 0.04em; text-transform: none; color: #c7d3e3; margin-bottom: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .live-section-title.no-margin { margin-bottom: 0; font-size: 11px; }
        .live-section-summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; margin: 0; color: #e2e2e9; font-size: 12px; font-weight: 700; background: #23232a; border-bottom: 1px solid #33333e; }
        .live-section-summary::-webkit-details-marker { display: none; }
        .live-panel-section[open] .live-section-summary::after { content: '−'; font-size: 18px; line-height: 1; }
        .live-panel-section:not([open]) .live-section-summary::after { content: '+'; font-size: 16px; line-height: 1; }
        .live-chat-bar { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 8px; background: #23232a; border-top: 1px solid #33333e; }
        .live-badge { font-size: 10px; color: #8b8b99; padding: 2px 6px; border-radius: 999px; border: 1px solid #33333e; background: #151519; }
        .live-queue-filter-row { display:flex; align-items:center; justify-content:space-between; width:100%; gap:10px; padding:8px 12px; border-bottom:1px solid #33333e; background:#23232a; }
        .live-transcript-tools { display:flex; align-items:center; gap:8px; margin-left:auto; }
        .live-tabs { display:flex; gap:4px; padding:2px; border:1px solid #33333e; border-radius:8px; background:#151519; }
        .live-tab { border:none; background:transparent; color:#8b8b99; font-size:10px; height:22px; border-radius:6px; padding:0 8px; cursor:pointer; }
        .live-tab.active { color:#fff; background:#2d2d37; }
        .live-tool-btn { width:30px; height:30px; border:1px solid #33333e; border-radius:8px; background:#151519; color:#e2e2e9; flex: 0 0 auto; }
        .live-tool-btn .otp-icon { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        .live-map-panel { margin: 10px 12px 0; border:1px solid #33333e; border-radius:10px; background:rgba(25,27,36,0.98); box-shadow:0 16px 30px rgba(0,0,0,0.45); overflow:hidden; }
        .live-map-panel.hidden { display:none; }
        .live-map-head { height:30px; padding:0 8px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #33333e; background:#23232a; font-size:12px; font-weight:600; }
        .live-map-body { min-height:170px; display:flex; align-items:center; justify-content:center; background:#0b0f19; color:#8b8b99; font-size:11px; text-align:center; padding:12px; }
        .live-debug-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 30px; }
        .live-debug-left, .live-debug-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .live-debug-left { justify-content: flex-start; }
        .live-debug-right { justify-content: flex-end; flex: 1 1 auto; }
        .live-list, [data-role="playlist-body"], [data-role="priority-body"], [data-role="interrupt-body"], [data-role="transcript-body"] { flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:6px; min-height:0; background:#151519; scrollbar-width: auto; scrollbar-color: #454554 #151519; }
        #live-panel::-webkit-scrollbar, .live-list::-webkit-scrollbar, [data-role="playlist-body"]::-webkit-scrollbar, [data-role="priority-body"]::-webkit-scrollbar, [data-role="interrupt-body"]::-webkit-scrollbar, [data-role="transcript-body"]::-webkit-scrollbar { width: 10px; }
        #live-panel::-webkit-scrollbar-track, .live-list::-webkit-scrollbar-track, [data-role="playlist-body"]::-webkit-scrollbar-track, [data-role="priority-body"]::-webkit-scrollbar-track, [data-role="interrupt-body"]::-webkit-scrollbar-track, [data-role="transcript-body"]::-webkit-scrollbar-track { background:#151519; }
        #live-panel::-webkit-scrollbar-thumb, .live-list::-webkit-scrollbar-thumb, [data-role="playlist-body"]::-webkit-scrollbar-thumb, [data-role="priority-body"]::-webkit-scrollbar-thumb, [data-role="interrupt-body"]::-webkit-scrollbar-thumb, [data-role="transcript-body"]::-webkit-scrollbar-thumb { background:#454554; border-radius:999px; border:2px solid #151519; }
        .live-playlist-item, .live-task, .live-log { border-radius: 8px; border: 1px solid #33333e; background: #1e1e25; padding: 8px; margin-bottom: 0; font-size: 11px; line-height: 1.45; }
        .live-playlist-item.current { border-color: rgba(59,130,246,0.55); background: rgba(59,130,246,0.12); }
        .live-playlist-item.completed { opacity: 0.72; }
        .live-playlist-item.error { border-color: rgba(214,109,92,0.45); }
        .live-playlist-item .title { font-size: 13px; font-weight: 700; }
        .live-playlist-item .meta, .live-task span { color: #8b8b99; font-size: 11px; display: block; margin-top: 4px; }
        .live-task.interrupt { border-color: rgba(212,180,131,0.25); }
        .live-log { font-size: 11px; line-height: 1.45; color: #8b8b99; }
        .live-log.user { color: #f3d9bf; }
        .otp-empty { color:#8b8b99; font-size:11px; text-align:center; padding:24px 10px; opacity:0.8; }
        #live-debug-console.collapsed .live-debug-toolbar { min-height: 28px; height: 28px; padding: 0; margin: 0; border-bottom: 0; cursor: default; flex-wrap: nowrap; }
        #live-debug-console.collapsed .live-debug-left,
        #live-debug-console.collapsed .live-debug-right { flex-wrap: nowrap; }
        #live-debug-console.collapsed .live-section-title.no-margin { font-size: 11px; color: #d7e1ef; }
        #live-debug-console.collapsed [data-role="debug-body"] { display: none; }
        [data-role="debug-body"] { overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 1.5; color: #b9c7da; min-height: 0; flex: 1 1 auto; }
        .live-debug-row { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: pre-wrap; word-break: break-word; }
        .live-empty { color: var(--live-muted); font-size: 12px; padding: 6px 2px; }
        #live-source-modal, #live-config-modal { position: fixed; inset: 0; z-index: 30; }
        .live-modal-backdrop { position: absolute; inset: 0; background: rgba(2, 4, 10, 0.72); }
        .live-modal-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 40px)); border-radius: 22px; border: 1px solid var(--live-line); background: rgba(11, 15, 23, 0.96); padding: 18px; box-shadow: 0 30px 80px rgba(0,0,0,0.45); display: flex; flex-direction: column; gap: 12px; }
        .live-source-option { display: flex; gap: 10px; align-items: center; }
        .live-modal-pane { display: none; }
        #live-source-modal[data-mode="server"] .server-pane { display: block; }
        #live-source-modal[data-mode="local"] .local-pane { display: block; }
        .live-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .live-modal-hint { min-height: 20px; color: var(--live-muted); font-size: 13px; }
        .live-config-modal-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--live-muted); }
        .live-config-modal-row .range { flex: 1 1 auto; }
        @media (max-width: 1280px) {
            #live-stage-shell { left: 12px; top: 12px; width: calc(100vw - 24px); height: calc((100vw - 24px) * 9 / 16); }
            #live-panel { left: 0; right: 0; top: auto; width: auto; bottom: 0; max-height: 240px; padding: 12px; }
            #live-panel.collapsed { display: none; }
            #live-debug-console { left: 0; right: 0; bottom: 0; }
            .live-debug-toolbar { flex-direction: column; align-items: stretch; }
            .live-debug-left, .live-debug-right { flex-wrap: wrap; }
        }
    `;
    document.head.appendChild(style);
};

const main = async () => {
    bootstrap();
    injectStyle();
    const app = new LiveStreamApp();
    await app.init();
};

void main();
