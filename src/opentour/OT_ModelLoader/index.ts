import {
    mountOTMLIntelligentAlignPanel,
    type OTMLIntelligentAlignController
} from './OT_ML_IntelligentAlign';
import {
    mountOTMLStep3DualView2D,
    type OTMLStep3DualView2DController
} from './OT_ML_Step3DualView2D';
import type { CoordinateRotationPlan } from './algorithms/otml_projection_by_axis';

type OTModelLoaderPanelOptions = {
    loadModelFile: (file: File) => Promise<void>;
    launcherButton?: HTMLButtonElement;
    applyRotateToCanonical?: (plan: CoordinateRotationPlan) => Promise<void> | void;
    resetModelToLoadedState?: () => Promise<void> | void;
    clearDbResiduals?: () => Promise<any>;
    previewFlyCamera?: (pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }, fovDeg: number) => Promise<void> | void;
    getLiveCameraPose?: () => { pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }; fovDeg: number } | null;
    getWorldSamplePoints?: () => Array<{ x: number; y: number; z: number; opacity: number }>;
};

type OTModelLoaderPanelController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
};

const STYLE_ID = 'ot-model-loader-style';
const SUPPORTED_EXTENSIONS = ['.ply', '.splat', '.ksplat', '.spz', '.sog', '.json', '.lcc'];

const supportsModel = (filename: string) => {
    const lower = filename.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext));
};

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #ot-model-loader-panel {
            position: fixed;
            top: 90px;
            right: 60px;
            width: 340px;
            max-height: calc(100vh - 110px);
            overflow-y: auto;
            z-index: 102;
            border: 1px solid #30363d;
            background: #0d1117;
            border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
            color: #f0f6fc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            pointer-events: auto;
        }

        #ot-model-loader-panel.hidden {
            display: none;
        }

        .ot-model-loader-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2px;
            cursor: move;
        }

        .ot-model-loader-title {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: -0.2px;
        }

        .ot-model-loader-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 14px;
            overflow: hidden;
        }

        .ot-model-loader-step-head {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }

        .ot-model-loader-step-badge {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            margin-right: 10px;
            color: #ffffff;
            background: #2f81f7;
        }

        .ot-model-loader-step {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #f0f6fc;
        }

        .ot-model-loader-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .ot-model-loader-row.split .ot-model-loader-btn {
            flex: 1 1 50%;
        }

        .ot-model-loader-drop-zone {
            border: 1px dashed #30363d;
            border-radius: 6px;
            padding: 20px 10px;
            text-align: center;
            background: rgba(255, 255, 255, 0.02);
            cursor: pointer;
            transition: 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        .ot-model-loader-drop-zone:hover,
        .ot-model-loader-drop-zone.drag-over {
            border-color: #2f81f7;
            background: rgba(47, 129, 247, 0.05);
        }

        .ot-model-loader-drop-zone svg {
            color: #8b949e;
        }

        .ot-model-loader-drop-zone:hover svg,
        .ot-model-loader-drop-zone.drag-over svg {
            color: #2f81f7;
        }

        .ot-model-loader-drop-main {
            font-size: 13px;
            color: #f0f6fc;
            font-weight: 500;
        }

        .ot-model-loader-drop-sub {
            font-size: 11px;
            color: #8b949e;
        }

        .ot-model-loader-btn {
            height: 32px;
            border-radius: 6px;
            border: 1px solid #30363d;
            background: transparent;
            color: #f0f6fc;
            padding: 0 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
        }

        .ot-model-loader-btn.primary {
            background: #2f81f7;
            border-color: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .ot-model-loader-btn.ghost {
            color: #8b949e;
        }
        .ot-model-loader-btn.icon {
            width: 36px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .ot-model-loader-btn.full {
            width: 100%;
        }

        .ot-model-loader-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .ot-model-loader-text {
            font-size: 12px;
            line-height: 1.4;
            color: #8b949e;
        }

        .ot-model-loader-status {
            font-size: 11px;
            color: #8b949e;
            min-height: 18px;
            margin-top: 0;
        }

        .ot-model-loader-summary-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-top: 8px;
        }

        .ot-model-loader-summary-panel {
            border: 1px solid #2b3f5f;
            border-radius: 6px;
            background: #040b18;
            padding: 2px;
        }

        .ot-model-loader-summary-label {
            font-size: 10px;
            color: #8fa5bc;
            margin: 2px 0 4px 2px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        .ot-model-loader-summary-map {
            width: 100%;
            height: 130px;
            display: block;
            border-radius: 4px;
            border: 1px solid #263750;
            background: #060c16;
        }

        .ot-model-loader-summary-tools {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
        }

        .ot-model-loader-summary-zoom {
            display: inline-flex;
            gap: 6px;
        }

        @media (max-width: 900px) {
            #ot-model-loader-panel {
                right: 12px;
                top: 82px;
                width: min(340px, calc(100vw - 24px));
            }
        }
    `;

    document.head.appendChild(style);
};

class OTModelLoaderPanel implements OTModelLoaderPanelController {
    private readonly root: HTMLDivElement;

    private readonly headEl: HTMLDivElement;

    private readonly modelTextEl: HTMLDivElement;

    private readonly projectionTextEl: HTMLDivElement;

    private readonly statusEl: HTMLDivElement;

    private readonly loadZoneEl: HTMLDivElement;

    private readonly fileInput: HTMLInputElement;

    private readonly uploadInput: HTMLInputElement;

    private readonly shareDownloadBtn: HTMLButtonElement;

    private readonly shareUploadBtn: HTMLButtonElement;

    private readonly summaryMapCanvas: HTMLCanvasElement;

    private readonly summaryFrontCanvas: HTMLCanvasElement;

    private readonly summaryZoomInBtn: HTMLButtonElement;

    private readonly summaryZoomOutBtn: HTMLButtonElement;

    private readonly summaryRefreshBtn: HTMLButtonElement;

    private readonly alignPanel: OTMLIntelligentAlignController;

    private readonly step3DualView2D: OTMLStep3DualView2DController;

    private pending = false;

    private currentModelFilename: string | null = null;

    private currentModelFile: File | null = null;

    private panelDragActive = false;

    private panelDragPointerId = -1;

    private panelDragStartX = 0;

    private panelDragStartY = 0;

    private panelDragBaseLeft = 0;

    private panelDragBaseTop = 0;

    constructor(private readonly options: OTModelLoaderPanelOptions) {
        ensureStyle();

        this.root = document.createElement('div');
        this.root.id = 'ot-model-loader-panel';
        this.root.classList.add('hidden');
        this.root.innerHTML = `
            <div class="ot-model-loader-head" data-role="drag-handle">
                <div class="ot-model-loader-title">Modal Loader</div>
                <button type="button" class="ot-model-loader-btn ghost icon" data-act="hide" title="Hide" aria-label="Hide">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M6 6l12 12"></path>
                        <path d="M18 6L6 18"></path>
                    </svg>
                </button>
            </div>
            <div class="ot-model-loader-card">
                <div class="ot-model-loader-step-head">
                    <div class="ot-model-loader-step-badge">1</div>
                    <div class="ot-model-loader-step">Load</div>
                </div>
                <div class="ot-model-loader-drop-zone" data-act="load">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <div class="ot-model-loader-drop-main">Drop .ply file here</div>
                    <div class="ot-model-loader-drop-sub">or click to browse</div>
                </div>
                <div class="ot-model-loader-text" data-role="model-text" style="margin-top:8px">当前模型: 未加载</div>
            </div>
            <div class="ot-model-loader-card">
                <div class="ot-model-loader-step-head">
                    <div class="ot-model-loader-step-badge">2</div>
                    <div class="ot-model-loader-step">Align</div>
                </div>
                <div class="ot-model-loader-row">
                    <button type="button" class="ot-model-loader-btn primary full" data-act="open-align" disabled>Intelligent Align</button>
                </div>
            </div>
            <div class="ot-model-loader-card">
                <div class="ot-model-loader-step-head">
                    <div class="ot-model-loader-step-badge">3</div>
                    <div class="ot-model-loader-step">Share</div>
                </div>
                <div class="ot-model-loader-row split">
                    <button type="button" class="ot-model-loader-btn" data-act="share-download" disabled>Download</button>
                    <button type="button" class="ot-model-loader-btn" data-act="share-upload" disabled>Upload</button>
                </div>
            </div>
            <div class="ot-model-loader-card">
                <div class="ot-model-loader-summary-row">
                    <div class="ot-model-loader-summary-panel">
                        <div class="ot-model-loader-summary-label">2D MAP</div>
                        <canvas class="ot-model-loader-summary-map" data-summary-canvas="map" width="160" height="130"></canvas>
                    </div>
                    <div class="ot-model-loader-summary-panel">
                        <div class="ot-model-loader-summary-label">FRONT VIEW</div>
                        <canvas class="ot-model-loader-summary-map" data-summary-canvas="front" width="160" height="130"></canvas>
                    </div>
                </div>
                <div class="ot-model-loader-summary-tools">
                    <div class="ot-model-loader-summary-zoom">
                        <button type="button" class="ot-model-loader-btn ghost" data-act="summary-zoom-in">+</button>
                        <button type="button" class="ot-model-loader-btn ghost" data-act="summary-zoom-out">-</button>
                        <button type="button" class="ot-model-loader-btn ghost" data-act="summary-refresh" title="Refresh projection from DB">↻</button>
                    </div>
                </div>
            </div>
            <div class="ot-model-loader-status" data-role="status">Ready</div>
            <div class="ot-model-loader-status" data-role="projection-text"></div>
        `;

        this.headEl = this.root.querySelector('[data-role="drag-handle"]') as HTMLDivElement;
        this.modelTextEl = this.root.querySelector('[data-role="model-text"]') as HTMLDivElement;
        this.projectionTextEl = this.root.querySelector('[data-role="projection-text"]') as HTMLDivElement;
        this.statusEl = this.root.querySelector('[data-role="status"]') as HTMLDivElement;
        this.loadZoneEl = this.root.querySelector('[data-act="load"]') as HTMLDivElement;
        this.summaryMapCanvas = this.root.querySelector('[data-summary-canvas="map"]') as HTMLCanvasElement;
        this.summaryFrontCanvas = this.root.querySelector('[data-summary-canvas="front"]') as HTMLCanvasElement;
        this.summaryZoomInBtn = this.root.querySelector('[data-act="summary-zoom-in"]') as HTMLButtonElement;
        this.summaryZoomOutBtn = this.root.querySelector('[data-act="summary-zoom-out"]') as HTMLButtonElement;
        this.summaryRefreshBtn = this.root.querySelector('[data-act="summary-refresh"]') as HTMLButtonElement;
        this.shareDownloadBtn = this.root.querySelector('[data-act="share-download"]') as HTMLButtonElement;
        this.shareUploadBtn = this.root.querySelector('[data-act="share-upload"]') as HTMLButtonElement;
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = SUPPORTED_EXTENSIONS.join(',');
        this.fileInput.hidden = true;
        this.root.appendChild(this.fileInput);

        this.uploadInput = document.createElement('input');
        this.uploadInput.type = 'file';
        this.uploadInput.accept = 'application/json,.json';
        this.uploadInput.hidden = true;
        this.root.appendChild(this.uploadInput);

        this.alignPanel = mountOTMLIntelligentAlignPanel({
            applyRotateToCanonical: this.options.applyRotateToCanonical,
            resetModelToLoadedState: this.options.resetModelToLoadedState,
            clearDbResiduals: this.options.clearDbResiduals,
            previewFlyCamera: this.options.previewFlyCamera,
            getLiveCameraPose: this.options.getLiveCameraPose,
            getWorldSamplePoints: this.options.getWorldSamplePoints
        });

        this.step3DualView2D = mountOTMLStep3DualView2D({
            mapCanvas: this.summaryMapCanvas,
            frontCanvas: this.summaryFrontCanvas,
            statusElement: this.projectionTextEl,
            zoomInButton: this.summaryZoomInBtn,
            zoomOutButton: this.summaryZoomOutBtn,
            refreshButton: this.summaryRefreshBtn,
            getFlyCameraPose: () => this.options.getLiveCameraPose?.()?.pose || null,
            getModelFilename: () => this.currentModelFilename,
            getWorldSamplePoints: this.options.getWorldSamplePoints
        });
        this.alignPanel.attachStep3DualViewSink(this.step3DualView2D);

        this.drawSummaryPlaceholder('map');
        this.drawSummaryPlaceholder('front');

        document.body.appendChild(this.root);

        (this.root.querySelector('[data-act="hide"]') as HTMLButtonElement).addEventListener('click', () => this.close());
        (this.root.querySelector('[data-act="open-align"]') as HTMLButtonElement).addEventListener('click', () => {
            this.alignPanel.open();
        });
        this.shareDownloadBtn.addEventListener('click', () => {
            void this.downloadCalibration();
        });
        this.shareUploadBtn.addEventListener('click', () => {
            if (this.pending) return;
            this.uploadInput.click();
        });

        this.headEl.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (target.closest('button,input,select,textarea,label,a')) return;

            const rect = this.root.getBoundingClientRect();
            this.root.style.left = `${rect.left}px`;
            this.root.style.top = `${rect.top}px`;
            this.root.style.right = 'auto';

            this.panelDragActive = true;
            this.panelDragPointerId = event.pointerId;
            this.panelDragStartX = event.clientX;
            this.panelDragStartY = event.clientY;
            this.panelDragBaseLeft = rect.left;
            this.panelDragBaseTop = rect.top;
            this.headEl.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        this.headEl.addEventListener('pointermove', (event) => {
            if (!this.panelDragActive || event.pointerId !== this.panelDragPointerId) return;
            const dx = event.clientX - this.panelDragStartX;
            const dy = event.clientY - this.panelDragStartY;
            this.root.style.left = `${this.panelDragBaseLeft + dx}px`;
            this.root.style.top = `${this.panelDragBaseTop + dy}px`;
            event.preventDefault();
        });

        const endPanelDrag = (event: PointerEvent) => {
            if (!this.panelDragActive || event.pointerId !== this.panelDragPointerId) return;
            this.panelDragActive = false;
            this.panelDragPointerId = -1;
            if (this.headEl.hasPointerCapture(event.pointerId)) {
                this.headEl.releasePointerCapture(event.pointerId);
            }
        };

        this.headEl.addEventListener('pointerup', endPanelDrag);
        this.headEl.addEventListener('pointercancel', endPanelDrag);

        this.loadZoneEl.addEventListener('click', () => {
            if (this.pending) return;
            this.fileInput.click();
        });

        this.loadZoneEl.addEventListener('dragover', (event) => {
            event.preventDefault();
            if (this.pending) return;
            this.loadZoneEl.classList.add('drag-over');
        });

        this.loadZoneEl.addEventListener('dragleave', () => {
            this.loadZoneEl.classList.remove('drag-over');
        });

        this.loadZoneEl.addEventListener('drop', (event) => {
            event.preventDefault();
            this.loadZoneEl.classList.remove('drag-over');
            if (this.pending) return;
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            void this.handleSelectedFile(file);
        });

        this.fileInput.addEventListener('change', async () => {
            const file = this.fileInput.files?.[0];
            if (!file || this.pending) return;
            await this.handleSelectedFile(file);
        });
        this.uploadInput.addEventListener('change', async () => {
            const file = this.uploadInput.files?.[0];
            if (!file || this.pending) return;
            await this.uploadCalibration(file);
        });
    }

    open() {
        this.root.classList.remove('hidden');
    }

    close() {
        this.root.classList.add('hidden');
    }

    toggle() {
        this.root.classList.toggle('hidden');
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private drawSummaryPlaceholder(type: 'map' | 'front') {
        const canvas = this.root.querySelector(`canvas[data-summary-canvas="${type}"]`) as HTMLCanvasElement | null;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#f3f5f7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#d0d7de';
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    }

    private setShareButtonsEnabled(enabled: boolean) {
        this.shareDownloadBtn.disabled = !enabled;
        this.shareUploadBtn.disabled = !enabled;
    }

    private async downloadCalibration() {
        const modelFilename = this.currentModelFilename;
        if (!modelFilename) {
            this.setStatus('Download failed: no model loaded.');
            return;
        }
        this.pending = true;
        this.setLauncherBusy(true);
        this.setStatus('Preparing calibration download...');
        try {
            const response = await fetch(`/api/model/calibration?modelFilename=${encodeURIComponent(modelFilename)}`);
            if (!response.ok) {
                const body = await response.json().catch((_error: unknown): null => null);
                throw new Error(body?.error || `HTTP ${response.status}`);
            }
            const payload = await response.json();
            if (!payload?.found || !payload?.calibration) {
                throw new Error('No saved calibration in DB. Please run Confirm & Apply first.');
            }

            let calibration = payload.calibration as Record<string, unknown>;
            const live = this.options.getLiveCameraPose?.();
            if (live?.pose?.eye && live?.pose?.forward) {
                const eye = live.pose.eye;
                const forward = live.pose.forward;
                const forwardLen = Math.hypot(forward.x, forward.y, forward.z);
                const normalizedForward = forwardLen > 1e-6
                    ? {
                        x: forward.x / forwardLen,
                        y: forward.y / forwardLen,
                        z: forward.z / forwardLen
                    }
                    : { x: 0, y: 0, z: 1 };
                const yawDeg = Math.atan2(normalizedForward.x, normalizedForward.z) * 180 / Math.PI;
                const pitchDeg = Math.atan2(
                    normalizedForward.y,
                    Math.hypot(normalizedForward.x, normalizedForward.z)
                ) * 180 / Math.PI;

                calibration = {
                    ...calibration,
                    selectedBestCameraId: null,
                    bestCamera: {
                        ...(calibration.bestCamera && typeof calibration.bestCamera === 'object'
                            ? calibration.bestCamera as object
                            : {}),
                        eye: {
                            x: Number(eye.x),
                            y: Number(eye.y),
                            z: Number(eye.z)
                        },
                        forward: normalizedForward,
                        fovDeg: Number(live.fovDeg),
                        targetX: Number(eye.x),
                        targetY: Number(eye.y),
                        targetZ: Number(eye.z),
                        targetYaw: Number(yawDeg),
                        targetPitch: Number(pitchDeg)
                    }
                };

                const saveResponse = await fetch('/api/model/calibration', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        modelFilename,
                        calibration: {
                            ...calibration,
                            modelFilename
                        }
                    })
                });
                if (!saveResponse.ok) {
                    const body = await saveResponse.json().catch((_error: unknown): null => null);
                    throw new Error(body?.error || `HTTP ${saveResponse.status}`);
                }
            }

            const text = JSON.stringify({
                version: 1,
                modelFilename: payload.modelFilename || modelFilename,
                calibration
            }, null, 2);
            const blob = new Blob([text], { type: 'application/json' });
            const filename = `${modelFilename.replace(/\.[^/.]+$/, '')}.otml-calibration.json`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            this.setStatus(`Downloaded calibration: ${filename}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Download failed: ${message}`);
        } finally {
            this.pending = false;
            this.setLauncherBusy(false);
        }
    }

    private async uploadCalibration(file: File) {
        const modelFilename = this.currentModelFilename;
        if (!modelFilename) {
            this.setStatus('Upload failed: load model first.');
            this.uploadInput.value = '';
            return;
        }

        this.pending = true;
        this.setLauncherBusy(true);
        this.setStatus(`Uploading calibration: ${file.name}...`);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as {
                modelFilename?: string;
                calibration?: unknown;
                ok?: boolean;
                found?: boolean;
                axisPresetId?: string;
            };

            const sourceModelFilename = String(parsed.modelFilename || modelFilename);
            if (sourceModelFilename !== modelFilename) {
                throw new Error(`ModelFileName mismatch: expected '${modelFilename}', got '${sourceModelFilename}'`);
            }

            const calibration = parsed.calibration && typeof parsed.calibration === 'object'
                ? parsed.calibration
                : parsed;
            if (!calibration || typeof calibration !== 'object') {
                throw new Error('Invalid calibration file content.');
            }

            const response = await fetch('/api/model/calibration', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelFilename,
                    calibration: {
                        ...(calibration as object),
                        modelFilename
                    }
                })
            });
            if (!response.ok) {
                const body = await response.json().catch((_error: unknown): null => null);
                throw new Error(body?.error || `HTTP ${response.status}`);
            }

            if (this.currentModelFile) {
                await this.alignPanel.setModelFile(this.currentModelFile);
            }
            this.setStatus(`Upload successful: ${file.name}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Upload failed: ${message}`);
        } finally {
            this.pending = false;
            this.setLauncherBusy(false);
            this.uploadInput.value = '';
        }
    }

    private async handleSelectedFile(file: File) {
        if (!supportsModel(file.name)) {
            this.setStatus(`Unsupported file: ${file.name}`);
            return;
        }

        this.pending = true;
        this.setLauncherBusy(true);
        this.loadZoneEl.classList.remove('drag-over');
        this.setStatus(`Loading ${file.name}...`);
        try {
            await this.options.loadModelFile(file);
            this.currentModelFilename = file.name;
            this.currentModelFile = file;
            this.modelTextEl.textContent = `当前模型: ${file.name}`;
            (this.root.querySelector('[data-act="open-align"]') as HTMLButtonElement).disabled = false;
            this.setShareButtonsEnabled(true);
            await this.alignPanel.setModelFile(file);
            this.setStatus(`Loaded: ${file.name}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.currentModelFilename = null;
            this.currentModelFile = null;
            await this.alignPanel.setModelFile(null);
            (this.root.querySelector('[data-act="open-align"]') as HTMLButtonElement).disabled = true;
            this.setShareButtonsEnabled(false);
            this.setStatus(`Load failed: ${message}`);
        } finally {
            this.pending = false;
            this.setLauncherBusy(false);
            this.fileInput.value = '';
        }
    }

    private setLauncherBusy(pending: boolean) {
        if (!this.options.launcherButton) return;
        this.options.launcherButton.disabled = pending;
        this.options.launcherButton.textContent = pending ? '...' : 'ML';
    }
}

const mountOTModelLoaderPanel = (options: OTModelLoaderPanelOptions): OTModelLoaderPanelController => {
    return new OTModelLoaderPanel(options);
};

export {
    mountOTModelLoaderPanel,
    type OTModelLoaderPanelController,
    type OTModelLoaderPanelOptions
};

export {
    COORDINATE_IDS,
    COORDINATE_NAMING_RULES,
    KEY_BINDING_STANDARD,
    OPERATION_NAMING_STANDARD,
    COORDINATE_VIEW_PROFILES,
    COORDINATE_VIEW_PROFILE_LIST,
    COORDINATE_PROFILE_VALIDATION,
    getCoordinateViewProfile,
    getOperationNameByKey,
    getCoordinateControlBinding,
    type AxisDir,
    type CoordinateId,
    type AxisDefinition,
    type SemanticDirections,
    type ViewProjection,
    type MoveOperationName,
    type LookOperationName,
    type OperationName,
    type ControlKeyCode,
    type MoveOperationMapping,
    type LookOperationMapping,
    type CoordinateControlBinding,
    type CoordinateViewProfile
} from './coordinateViews';

export {
    mountOTMLIntelligentAlignPanel,
    type OTMLIntelligentAlignController,
    type OTMLIntelligentAlignOptions
} from './OT_ML_IntelligentAlign';

export {
    mountOTMLStep3DualView2D,
    type OTMLStep3DualView2DController,
    type OTMLStep3DualView2DOptions
} from './OT_ML_Step3DualView2D';
