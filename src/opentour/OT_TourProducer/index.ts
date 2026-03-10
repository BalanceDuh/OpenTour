type ProducerVideo = {
    id: string;
    name: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    thumbnailUrl: string;
};

type ProducerSnapshot = {
    id: string;
    videoId: string;
    order: number;
    timestampSec: number;
    mimeType: string;
    createdAt: string;
    fileUrl: string;
};

type ProducerAsset = {
    id: string;
    kind: string;
    name: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    fileUrl: string;
};

type ProducerOutputRecord = {
    id: string;
    modelFilename: string | null;
    assetId: string;
    name: string;
    saved: boolean;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    fileUrl: string;
};

type ProducerPanelOptions = {
    launcherButton?: HTMLButtonElement;
    apiBaseUrl?: string;
    getModelFilename?: () => string | null;
};

type ProducerPanelController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
};

const STYLE_ID = 'ot-tour-producer-style';
const PANEL_ID = 'ot-tour-producer-panel';

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${PANEL_ID} {
            position: fixed;
            right: 56px;
            top: 84px;
            width: min(580px, calc(100vw - 90px));
            max-height: min(88vh, 900px);
            border-radius: 16px;
            border: 1px solid #2a3650;
            background: linear-gradient(180deg, #101a2c 0%, #0a1220 100%);
            color: #eaf2ff;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
            z-index: 175;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Segoe UI', sans-serif;
        }
        #${PANEL_ID}.hidden { display: none; }
        #${PANEL_ID} * { box-sizing: border-box; }
        .otp2-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 14px;
            border-bottom: 1px solid #22324d;
            background: rgba(7, 16, 30, 0.72);
            cursor: move;
        }
        .otp2-title { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
        .otp2-head .otp2-tools { margin-left: auto; display: flex; gap: 6px; }
        .otp2-icon-btn {
            width: 30px;
            height: 30px;
            border-radius: 15px;
            border: 1px solid #31486d;
            background: #122039;
            color: #cfe2ff;
            cursor: pointer;
            font-weight: 700;
        }
        .otp2-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .otp2-body {
            padding: 12px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otp2-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 12px;
            align-items: start;
        }
        .otp2-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .otp2-card {
            border: 1px solid #2b3b5d;
            border-radius: 10px;
            background: #0f1a2e;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .otp2-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 2px;
            font-size: 13px;
            font-weight: 700;
            color: #d8e7ff;
        }
        .otp2-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 2px;
        }
        .otp2-head-tools { display: flex; align-items: center; gap: 6px; }
        .otp2-title-badge {
            width: 18px;
            height: 18px;
            border-radius: 9px;
            background: #2a63c7;
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            line-height: 1;
            font-weight: 700;
        }
        .otp2-row { display: flex; gap: 8px; align-items: center; }
        .otp2-row.wrap { flex-wrap: wrap; }
        .otp2-source-row { display: flex; gap: 8px; align-items: center; }
        .otp2-select, .otp2-input, .otp2-textarea {
            width: 100%;
            border: 1px solid #30466b;
            border-radius: 7px;
            background: #0a1425;
            color: #eaf2ff;
            padding: 8px;
            font-size: 12px;
        }
        .otp2-textarea { min-height: 96px; resize: vertical; }
        .otp2-btn {
            height: 32px;
            border-radius: 7px;
            border: 1px solid #355383;
            background: #122546;
            color: #dce9ff;
            padding: 0 10px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
        }
        .otp2-btn.primary { background: #2a63c7; border-color: #4f83dc; color: #fff; }
        .otp2-btn.warn { background: #40311d; border-color: #7a5932; color: #ffd9ae; }
        .otp2-btn:disabled { opacity: 0.52; cursor: not-allowed; }
        .otp2-muted { font-size: 11px; color: #92a9cc; }
        .otp2-inline-icon {
            width: 26px;
            height: 26px;
            border-radius: 6px;
            border: 1px solid #355383;
            background: #122546;
            color: #dce9ff;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            line-height: 1;
            font-weight: 700;
            flex: 0 0 auto;
        }
        .otp2-inline-icon:disabled { opacity: 0.52; cursor: not-allowed; }
        .otp2-modal {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(2, 8, 18, 0.58);
            z-index: 210;
        }
        .otp2-modal.hidden { display: none; }
        .otp2-modal-card {
            width: min(330px, calc(100vw - 32px));
            border-radius: 10px;
            border: 1px solid #2d4469;
            background: #0b172b;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.42);
            padding: 10px;
            font-size: 12px;
            color: #d7e7ff;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .otp2-modal-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .otp2-modal-title {
            font-size: 12px;
            font-weight: 700;
            color: #d7e7ff;
        }
        .otp2-preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .otp2-preview-box {
            border: 1px solid #2d4469;
            border-radius: 8px;
            overflow: hidden;
            background: #081121;
            min-height: 132px;
        }
        .otp2-preview-box img, .otp2-preview-box video { width: 100%; height: 132px; object-fit: cover; display: block; }
        .otp2-preview-head { font-size: 11px; padding: 6px; color: #9fc0eb; border-bottom: 1px solid #21324d; }
        .otp2-status { border-top: 1px solid #21314d; padding: 8px 12px; font-size: 12px; color: #98b3da; }
        .otp2-progress {
            height: 7px;
            border-radius: 999px;
            border: 1px solid #2a3f63;
            background: #091424;
            overflow: hidden;
        }
        .otp2-progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #2a63c7 0%, #66b2ff 100%);
            transition: width 0.24s ease;
        }
        .otp2-progress-text {
            font-size: 11px;
            color: #9fc0eb;
        }
        @media (max-width: 900px) {
            #${PANEL_ID} {
                right: 8px;
                top: 72px;
                width: calc(100vw - 16px);
                max-height: calc(100vh - 82px);
            }
            .otp2-layout { grid-template-columns: 1fr; }
            .otp2-preview-grid { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
};

class TourProducerPanel implements ProducerPanelController {
    private readonly root: HTMLDivElement;
    private readonly statusEl: HTMLDivElement;
    private readonly videoSelectEl: HTMLSelectElement;
    private readonly snapshotSelectEl: HTMLSelectElement;
    private readonly videoUploadInput: HTMLInputElement;
    private readonly coverUploadInput: HTMLInputElement;
    private readonly introUploadInput: HTMLInputElement;
    private readonly coverEnableInput: HTMLInputElement;
    private readonly introEnableInput: HTMLInputElement;
    private readonly introDurationInput: HTMLInputElement;
    private readonly introTransitionTypeSelect: HTMLSelectElement;
    private readonly introTransitionDurationInput: HTMLInputElement;
    private readonly introConfigModalEl: HTMLDivElement;
    private readonly introConfigBtn: HTMLButtonElement;
    private readonly introConfigCloseBtn: HTMLButtonElement;
    private readonly coverTitleInput: HTMLInputElement;
    private readonly coverDurationInput: HTMLInputElement;
    private readonly coverPromptInput: HTMLTextAreaElement;
    private readonly coverPreviewEl: HTMLImageElement;
    private readonly coverBasePreviewEl: HTMLImageElement;
    private readonly introPreviewEl: HTMLVideoElement;
    private readonly outputPreviewEl: HTMLVideoElement;
    private readonly genCoverBtn: HTMLButtonElement;
    private readonly composeBtn: HTMLButtonElement;
    private readonly saveOutputBtn: HTMLButtonElement;
    private readonly deleteOutputBtn: HTMLButtonElement;
    private readonly refreshBtn: HTMLButtonElement;
    private readonly composeProgressFillEl: HTMLDivElement;
    private readonly composeProgressTextEl: HTMLDivElement;
    private readonly savedOutputsSelectEl: HTMLSelectElement;

    private panelDrag = { active: false, pointerId: -1, startX: 0, startY: 0, left: 0, top: 0 };
    private videos: ProducerVideo[] = [];
    private snapshots: ProducerSnapshot[] = [];
    private selectedVideoId = '';
    private selectedSnapshotId = '';
    private selectedCoverAssetId = '';
    private selectedIntroAssetId = '';
    private referenceFiles: File[] = [];
    private lastOutputUrl = '';
    private currentDraftOutputRecordId = '';
    private selectedSavedOutputRecordId = '';
    private savedOutputs: ProducerOutputRecord[] = [];
    private busy = false;

    constructor(private readonly options: ProducerPanelOptions) {
        ensureStyle();
        this.root = document.createElement('div');
        this.root.id = PANEL_ID;
        this.root.className = 'hidden';
        this.root.innerHTML = `
            <div class="otp2-head" data-role="drag-handle">
                <div class="otp2-title">Tour Producer</div>
                <div class="otp2-tools">
                    <button class="otp2-icon-btn" data-act="refresh" title="Refresh">↻</button>
                    <button class="otp2-icon-btn" data-act="close" title="Close">✕</button>
                </div>
            </div>
            <div class="otp2-body">
                <div class="otp2-layout">
                    <div class="otp2-col">
                        <section class="otp2-card">
                            <div class="otp2-section-head">
                                <div class="otp2-section-title"><span class="otp2-title-badge">1</span><span>Load</span></div>
                                <button class="otp2-inline-icon" data-act="upload-video" title="Upload MP4 to DB" aria-label="Upload MP4 to DB">↑</button>
                            </div>
                            <div class="otp2-source-row">
                                <select class="otp2-select" data-role="video-select"><option value="">Select a video from DB</option></select>
                                <input type="file" accept="video/mp4" hidden data-role="video-upload" />
                            </div>
                            <div class="otp2-preview-box">
                                <video controls preload="metadata" data-role="source-video"></video>
                            </div>
                        </section>

                        <section class="otp2-card">
                            <div class="otp2-section-head">
                                <div class="otp2-section-title"><span class="otp2-title-badge">2</span><span>Intro</span></div>
                                <div class="otp2-head-tools">
                                    <button class="otp2-inline-icon" data-act="toggle-intro-config" title="Intro Config" aria-label="Intro Config">⚙</button>
                                    <button class="otp2-inline-icon" data-act="upload-intro" title="Upload Intro Video" aria-label="Upload Intro Video">↑</button>
                                </div>
                            </div>
                            <input type="file" accept="video/mp4,video/quicktime" hidden data-role="intro-upload" />
                            <div class="otp2-preview-box">
                                <video controls preload="metadata" data-role="intro-preview"></video>
                            </div>
                        </section>

                        <section class="otp2-card">
                            <div class="otp2-section-title"><span class="otp2-title-badge">3</span><span>Cover</span></div>
                            <div class="otp2-row wrap">
                                <label><input type="checkbox" data-role="cover-enabled" /> Enable cover</label>
                                <label class="otp2-muted">Duration(s)</label>
                                <input class="otp2-input" style="max-width:90px" type="number" min="0.2" max="8" step="0.1" value="2" data-role="cover-duration" />
                                <button class="otp2-btn" data-act="upload-cover-base">Upload cover base</button>
                                <input type="file" accept="image/*" hidden data-role="cover-upload" />
                                <button class="otp2-btn" data-act="upload-cover-refs">Upload refs</button>
                            </div>
                            <div class="otp2-row">
                                <select class="otp2-select" data-role="snapshot-select"><option value="">Uploaded Base</option></select>
                            </div>
                            <div class="otp2-row">
                                <input class="otp2-input" data-role="cover-title" placeholder="标题（必须出现在图里）" />
                            </div>
                            <div class="otp2-row">
                                <textarea class="otp2-textarea" data-role="cover-prompt" placeholder="提示词；可配合上传的参考图"></textarea>
                            </div>
                            <div class="otp2-row wrap">
                                <button class="otp2-btn primary" data-act="generate-cover">Generate Cover</button>
                                <span class="otp2-muted" data-role="cover-ref-info">No refs uploaded</span>
                            </div>
                            <div class="otp2-preview-grid">
                                <div class="otp2-preview-box">
                                    <div class="otp2-preview-head">Base Image</div>
                                    <img alt="base-cover-preview" data-role="cover-base-preview" />
                                </div>
                                <div class="otp2-preview-box">
                                    <div class="otp2-preview-head">Generated Cover</div>
                                    <img alt="cover-preview" data-role="cover-preview" />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div class="otp2-col">
                        <section class="otp2-card">
                            <div class="otp2-section-head">
                                <div class="otp2-section-title"><span class="otp2-title-badge">4</span><span>Compose</span></div>
                                <div class="otp2-head-tools">
                                    <button class="otp2-inline-icon" data-act="save-output" title="Save Current Output" aria-label="Save Current Output">S</button>
                                    <button class="otp2-inline-icon" data-act="delete-output" title="Delete Selected Output" aria-label="Delete Selected Output">D</button>
                                    <button class="otp2-inline-icon" data-act="compose" title="Generate Final Video" aria-label="Generate Final Video">▶</button>
                                </div>
                            </div>
                            <div class="otp2-row">
                                <select class="otp2-select" data-role="saved-outputs-select"><option value="">Saved outputs...</option></select>
                            </div>
                            <div class="otp2-preview-box">
                                <video controls preload="metadata" data-role="output-preview"></video>
                            </div>
                            <div class="otp2-row">
                                <span class="otp2-muted" data-role="compose-plan">Plan: video</span>
                            </div>
                            <div class="otp2-progress" aria-label="Compose Progress"><div class="otp2-progress-fill" data-role="compose-progress-fill"></div></div>
                            <div class="otp2-progress-text" data-role="compose-progress-text">Idle · 0%</div>
                        </section>
                    </div>
                </div>
            </div>
            <div class="otp2-modal hidden" data-role="intro-config-modal">
                <div class="otp2-modal-card">
                    <div class="otp2-modal-head">
                        <div class="otp2-modal-title">Intro Config</div>
                        <button class="otp2-inline-icon" data-act="close-intro-config" title="Close" aria-label="Close">✕</button>
                    </div>
                    <label><input type="checkbox" data-role="intro-enabled" /> Enable intro</label>
                    <div class="otp2-row">
                        <label class="otp2-muted">Intro Duration(s)</label>
                        <input class="otp2-input" style="max-width:120px" type="number" min="0.2" max="30" step="0.1" value="3.2" data-role="intro-duration" />
                    </div>
                    <div class="otp2-row">
                        <label class="otp2-muted">Transition</label>
                        <select class="otp2-select" data-role="intro-transition" style="max-width:180px">
                            <option value="fade_black" selected>Fade Through Black</option>
                            <option value="dissolve">Dissolve</option>
                            <option value="push_left">Push Left</option>
                            <option value="push_right">Push Right</option>
                            <option value="zoom_in">Zoom In</option>
                            <option value="none">None</option>
                        </select>
                    </div>
                    <div class="otp2-row">
                        <label class="otp2-muted">Transition Duration(s)</label>
                        <input class="otp2-input" style="max-width:120px" type="number" min="0.2" max="1.5" step="0.1" value="0.9" data-role="intro-transition-duration" />
                    </div>
                </div>
            </div>
            <div class="otp2-status" data-role="status">Ready</div>
        `;

        this.statusEl = this.root.querySelector('[data-role="status"]') as HTMLDivElement;
        this.videoSelectEl = this.root.querySelector('[data-role="video-select"]') as HTMLSelectElement;
        this.snapshotSelectEl = this.root.querySelector('[data-role="snapshot-select"]') as HTMLSelectElement;
        this.videoUploadInput = this.root.querySelector('[data-role="video-upload"]') as HTMLInputElement;
        this.coverUploadInput = this.root.querySelector('[data-role="cover-upload"]') as HTMLInputElement;
        this.introUploadInput = this.root.querySelector('[data-role="intro-upload"]') as HTMLInputElement;
        this.coverEnableInput = this.root.querySelector('[data-role="cover-enabled"]') as HTMLInputElement;
        this.introEnableInput = this.root.querySelector('[data-role="intro-enabled"]') as HTMLInputElement;
        this.introDurationInput = this.root.querySelector('[data-role="intro-duration"]') as HTMLInputElement;
        this.introTransitionTypeSelect = this.root.querySelector('[data-role="intro-transition"]') as HTMLSelectElement;
        this.introTransitionDurationInput = this.root.querySelector('[data-role="intro-transition-duration"]') as HTMLInputElement;
        this.introConfigModalEl = this.root.querySelector('[data-role="intro-config-modal"]') as HTMLDivElement;
        this.introConfigBtn = this.root.querySelector('[data-act="toggle-intro-config"]') as HTMLButtonElement;
        this.introConfigCloseBtn = this.root.querySelector('[data-act="close-intro-config"]') as HTMLButtonElement;
        this.coverTitleInput = this.root.querySelector('[data-role="cover-title"]') as HTMLInputElement;
        this.coverDurationInput = this.root.querySelector('[data-role="cover-duration"]') as HTMLInputElement;
        this.coverPromptInput = this.root.querySelector('[data-role="cover-prompt"]') as HTMLTextAreaElement;
        this.coverPreviewEl = this.root.querySelector('[data-role="cover-preview"]') as HTMLImageElement;
        this.coverBasePreviewEl = this.root.querySelector('[data-role="cover-base-preview"]') as HTMLImageElement;
        this.introPreviewEl = this.root.querySelector('[data-role="intro-preview"]') as HTMLVideoElement;
        this.outputPreviewEl = this.root.querySelector('[data-role="output-preview"]') as HTMLVideoElement;
        this.genCoverBtn = this.root.querySelector('[data-act="generate-cover"]') as HTMLButtonElement;
        this.composeBtn = this.root.querySelector('[data-act="compose"]') as HTMLButtonElement;
        this.saveOutputBtn = this.root.querySelector('[data-act="save-output"]') as HTMLButtonElement;
        this.deleteOutputBtn = this.root.querySelector('[data-act="delete-output"]') as HTMLButtonElement;
        this.refreshBtn = this.root.querySelector('[data-act="refresh"]') as HTMLButtonElement;
        this.composeProgressFillEl = this.root.querySelector('[data-role="compose-progress-fill"]') as HTMLDivElement;
        this.composeProgressTextEl = this.root.querySelector('[data-role="compose-progress-text"]') as HTMLDivElement;
        this.savedOutputsSelectEl = this.root.querySelector('[data-role="saved-outputs-select"]') as HTMLSelectElement;

        document.body.appendChild(this.root);
        this.bindEvents();
        this.updateOutputActionButtons();
    }

    private apiBase() {
        return this.options.apiBaseUrl || 'http://localhost:3034/api/ot-tour-producer';
    }

    private currentModelFilenameOrNull() {
        const value = String(this.options.getModelFilename?.() || '').trim();
        return value || null;
    }

    open() {
        this.root.classList.remove('hidden');
        void this.reloadAll();
    }

    close() {
        this.root.classList.add('hidden');
        this.introConfigModalEl.classList.add('hidden');
    }

    toggle() {
        if (this.root.classList.contains('hidden')) this.open();
        else this.close();
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private logDebug(action: string, detail?: unknown) {
        const time = new Date().toLocaleTimeString();
        const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
        const line = `[${time}] [OT_TourProducer] ${action}${suffix}`;
        const body = document.querySelector('#otw-debug [data-debug="body"]') as HTMLDivElement | null;
        if (body) {
            const row = document.createElement('div');
            row.className = 'otw-debug-row';
            row.innerHTML = `<span class="otw-debug-time">[${time}]</span><strong>[OT_TourProducer]</strong> ${action}${suffix}`;
            body.appendChild(row);
            body.scrollTop = body.scrollHeight;
        }
        console.debug(line);
    }

    private setComposeProgress(progress: number, phase: string, status?: string) {
        const safe = Math.max(0, Math.min(100, Number(progress) || 0));
        this.composeProgressFillEl.style.width = `${safe.toFixed(1)}%`;
        this.composeProgressTextEl.textContent = `${status ? `${status} · ` : ''}${phase} · ${Math.round(safe)}%`;
    }

    private updateOutputActionButtons() {
        this.saveOutputBtn.disabled = this.busy || !this.currentDraftOutputRecordId;
        this.deleteOutputBtn.disabled = this.busy || (!this.currentDraftOutputRecordId && !this.selectedSavedOutputRecordId);
    }

    private renderSavedOutputsSelect() {
        this.savedOutputsSelectEl.innerHTML = '<option value="">Saved outputs...</option>';
        for (const item of this.savedOutputs) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} · ${(item.durationSec || 0).toFixed(1)}s`;
            this.savedOutputsSelectEl.appendChild(option);
        }
        this.savedOutputsSelectEl.value = this.selectedSavedOutputRecordId;
    }

    private async loadSavedOutputs() {
        const model = this.currentModelFilenameOrNull();
        const path = model
            ? `/outputs?saved=1&modelFilename=${encodeURIComponent(model)}`
            : '/outputs?saved=1';
        let payload = await this.requestJson<{ ok: true; outputs: ProducerOutputRecord[] }>(path);
        if (model && (!payload.outputs || payload.outputs.length === 0)) {
            payload = await this.requestJson<{ ok: true; outputs: ProducerOutputRecord[] }>('/outputs?saved=1');
        }
        this.savedOutputs = payload.outputs || [];
        if (!this.savedOutputs.find((item) => item.id === this.selectedSavedOutputRecordId)) {
            this.selectedSavedOutputRecordId = '';
        }
        this.renderSavedOutputsSelect();
        this.logDebug('compose.outputs.list.loaded', { count: this.savedOutputs.length, modelFilename: model });
        this.updateOutputActionButtons();
    }

    private setBusy(flag: boolean) {
        this.busy = flag;
        this.genCoverBtn.disabled = flag;
        this.composeBtn.disabled = flag;
        this.refreshBtn.disabled = flag;
        this.introConfigBtn.disabled = flag;
        this.introConfigCloseBtn.disabled = flag;
        this.updateOutputActionButtons();
    }

    private async requestJson<T = any>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(`${this.apiBase()}${path}`, init);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        return payload as T;
    }

    private renderComposePlan() {
        const el = this.root.querySelector('[data-role="compose-plan"]') as HTMLSpanElement;
        const labels: string[] = [];
        if (this.coverEnableInput.checked && this.selectedCoverAssetId) labels.push('cover');
        if (this.introEnableInput.checked && this.selectedIntroAssetId) labels.push('intro');
        labels.push('video');
        el.textContent = `Plan: ${labels.join(' + ')}`;
    }

    private fillVideoSelect() {
        this.videoSelectEl.innerHTML = '<option value="">Select a video from DB</option>';
        for (const item of this.videos) {
            const label = `${item.name} · ${item.width || '-'}x${item.height || '-'} · ${(item.durationSec || 0).toFixed(1)}s`;
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = label;
            this.videoSelectEl.appendChild(option);
        }
        this.videoSelectEl.value = this.selectedVideoId;
    }

    private renderSnapshotOptions() {
        this.snapshotSelectEl.innerHTML = '';
        const uploadedOption = document.createElement('option');
        uploadedOption.value = '';
        uploadedOption.textContent = this.selectedCoverAssetId ? 'Uploaded Base' : 'Snapshot Base';
        this.snapshotSelectEl.appendChild(uploadedOption);
        for (const snap of this.snapshots) {
            const option = document.createElement('option');
            option.value = snap.id;
            option.textContent = `Snapshot ${snap.order} · ${snap.timestampSec.toFixed(1)}s`;
            this.snapshotSelectEl.appendChild(option);
        }
        this.snapshotSelectEl.value = this.selectedSnapshotId;
    }

    private async loadSnapshots(videoId: string) {
        if (!videoId) {
            this.snapshots = [];
            this.selectedSnapshotId = '';
            this.renderSnapshotOptions();
            return;
        }
        const payload = await this.requestJson<{ ok: true; snapshots: ProducerSnapshot[] }>(`/videos/${encodeURIComponent(videoId)}/snapshots`);
        this.snapshots = payload.snapshots || [];
        if (!this.snapshots.find((item) => item.id === this.selectedSnapshotId) && !this.selectedCoverAssetId) {
            this.selectedSnapshotId = this.snapshots[0]?.id || '';
        }
        const selected = this.snapshots.find((item) => item.id === this.selectedSnapshotId);
        if (selected) {
            this.coverBasePreviewEl.src = `${this.apiBase()}${selected.fileUrl.replace('/api/ot-tour-producer', '')}`;
        } else if (!this.selectedCoverAssetId) {
            this.coverBasePreviewEl.removeAttribute('src');
        }
        this.renderSnapshotOptions();
    }

    private async reloadAll() {
        this.setBusy(true);
        try {
            const modelFilename = this.currentModelFilenameOrNull();
            let payload = modelFilename
                ? await this.requestJson<{ ok: true; videos: ProducerVideo[] }>(`/videos?modelFilename=${encodeURIComponent(modelFilename)}`)
                : await this.requestJson<{ ok: true; videos: ProducerVideo[] }>('/videos');
            let usingFallbackAll = false;
            if (modelFilename && (!payload.videos || payload.videos.length === 0)) {
                payload = await this.requestJson<{ ok: true; videos: ProducerVideo[] }>('/videos');
                usingFallbackAll = true;
            }
            this.videos = payload.videos || [];
            if (!this.videos.find((item) => item.id === this.selectedVideoId)) {
                this.selectedVideoId = this.videos[0]?.id || '';
            }
            this.fillVideoSelect();
            const selected = this.videos.find((item) => item.id === this.selectedVideoId) || null;
            const sourceVideo = this.root.querySelector('[data-role="source-video"]') as HTMLVideoElement;
            sourceVideo.src = selected ? `${this.apiBase()}/videos/${encodeURIComponent(selected.id)}/file` : '';
            await this.loadSnapshots(this.selectedVideoId);
            await this.loadSavedOutputs();
            this.renderComposePlan();
            this.setStatus(usingFallbackAll
                ? `No exact videos for current model, showing all ${this.videos.length} video(s).`
                : `Loaded ${this.videos.length} video(s) from producer DB.`);
        } catch (error) {
            this.setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.setBusy(false);
        }
    }

    private async fileToDataUrl(file: File) {
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
            reader.readAsDataURL(file);
        });
    }

    private async uploadVideoToDb(file: File) {
        this.setBusy(true);
        try {
            const modelFilename = this.currentModelFilenameOrNull() || '__UNSCOPED__';
            await this.requestJson('/videos/register', {
                method: 'POST',
                headers: {
                    'X-OT-Name': file.name,
                    'X-OT-Mime-Type': file.type || 'video/mp4',
                    'X-OT-Model-Filename': modelFilename
                },
                body: file
            });
            this.setStatus(`Video saved to backend DB: ${file.name} (${modelFilename})`);
            await this.reloadAll();
        } catch (error) {
            this.setStatus(`Video upload failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.setBusy(false);
        }
    }

    private async uploadCoverBase(file: File) {
        this.setBusy(true);
        try {
            const payload = await this.requestJson<{ ok: true; asset: ProducerAsset }>('/cover/upload', {
                method: 'POST',
                headers: {
                    'X-OT-Name': file.name,
                    'X-OT-Mime-Type': file.type || 'image/png'
                },
                body: file
            });
            this.selectedCoverAssetId = payload.asset.id;
            this.selectedSnapshotId = '';
            this.coverBasePreviewEl.src = `${this.apiBase()}/assets/${encodeURIComponent(payload.asset.id)}/file`;
            this.renderSnapshotOptions();
            this.setStatus(`Cover base uploaded: ${file.name}`);
            this.renderComposePlan();
        } catch (error) {
            this.setStatus(`Cover upload failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.setBusy(false);
        }
    }

    private async uploadIntro(file: File) {
        this.setBusy(true);
        try {
            const payload = await this.requestJson<{ ok: true; asset: ProducerAsset }>('/intro/upload', {
                method: 'POST',
                headers: {
                    'X-OT-Name': file.name,
                    'X-OT-Mime-Type': file.type || 'video/mp4'
                },
                body: file
            });
            this.selectedIntroAssetId = payload.asset.id;
            this.introPreviewEl.src = `${this.apiBase()}/assets/${encodeURIComponent(payload.asset.id)}/file`;
            this.renderComposePlan();
            this.setStatus(`Intro uploaded: ${file.name}`);
        } catch (error) {
            this.setStatus(`Intro upload failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.setBusy(false);
        }
    }

    private async generateCover() {
        const title = String(this.coverTitleInput.value || '').trim();
        if (!title) {
            this.setStatus('Cover title is required.');
            return;
        }
        if (!this.selectedSnapshotId && !this.selectedCoverAssetId) {
            this.setStatus('Select one snapshot or upload one base image first.');
            return;
        }
        this.setBusy(true);
        try {
            const referenceImageDataUrls = await Promise.all(this.referenceFiles.map((file) => this.fileToDataUrl(file)));
            const payload = await this.requestJson<{ ok: true; asset: ProducerAsset }>('/cover/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    prompt: this.coverPromptInput.value,
                    baseSnapshotId: this.selectedSnapshotId || null,
                    baseCoverAssetId: this.selectedCoverAssetId || null,
                    referenceImageDataUrls
                })
            });
            this.selectedCoverAssetId = payload.asset.id;
            this.coverPreviewEl.src = `${this.apiBase()}/assets/${encodeURIComponent(payload.asset.id)}/file`;
            this.coverEnableInput.checked = true;
            this.renderComposePlan();
            this.setStatus('Cover generated successfully.');
        } catch (error) {
            this.setStatus(`Cover generate failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.setBusy(false);
        }
    }

    private async compose() {
        if (!this.selectedVideoId) {
            this.setStatus('Please select source video.');
            return;
        }
        if (this.coverEnableInput.checked && !this.selectedCoverAssetId) {
            this.setStatus('Cover is enabled but no generated/uploaded cover image selected.');
            return;
        }
        if (this.introEnableInput.checked && !this.selectedIntroAssetId) {
            this.setStatus('Intro is enabled but no intro video uploaded.');
            return;
        }

        this.setBusy(true);
        try {
            this.setComposeProgress(0, 'queued', 'running');
            const start = await this.requestJson<{ ok: true; job: { jobId: string } }>('/compose/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: this.selectedVideoId,
                    coverEnabled: this.coverEnableInput.checked,
                    coverAssetId: this.selectedCoverAssetId || null,
                    coverDurationSeconds: Number(this.coverDurationInput.value || 2),
                    introEnabled: this.introEnableInput.checked,
                    introAssetId: this.selectedIntroAssetId || null,
                    introTargetDurationSeconds: Number(this.introDurationInput.value || 3.2),
                    introTransitionType: this.introTransitionTypeSelect.value || 'fade_black',
                    introTransitionDurationSeconds: Number(this.introTransitionDurationInput.value || 0.9)
                })
            });
            const jobId = start.job.jobId;
            this.setStatus('Compose started...');
            this.logDebug('compose.start', {
                jobId,
                videoId: this.selectedVideoId,
                introEnabled: this.introEnableInput.checked,
                coverEnabled: this.coverEnableInput.checked
            });

            for (;;) {
                await new Promise((resolve) => window.setTimeout(resolve, 1000));
                const state = await this.requestJson<{ ok: true; job: { status: string; phase: string; progress: number; outputRecordId?: string | null; error?: { message?: string } } }>(`/compose/jobs/${encodeURIComponent(jobId)}`);
                this.setStatus(`Compose ${state.job.status} · ${state.job.phase} · ${Math.round(Number(state.job.progress || 0))}%`);
                this.setComposeProgress(Number(state.job.progress || 0), state.job.phase, state.job.status);
                this.logDebug('compose.progress', {
                    jobId,
                    status: state.job.status,
                    phase: state.job.phase,
                    progress: Number(state.job.progress || 0)
                });
                if (state.job.status === 'done') {
                    this.currentDraftOutputRecordId = String(state.job.outputRecordId || '').trim();
                    this.selectedSavedOutputRecordId = '';
                    this.savedOutputsSelectEl.value = '';
                    this.updateOutputActionButtons();
                    break;
                }
                if (state.job.status === 'error') throw new Error(state.job.error?.message || 'compose_failed');
            }

            this.lastOutputUrl = `${this.apiBase()}/compose/jobs/${encodeURIComponent(jobId)}/result?ts=${Date.now()}`;
            this.outputPreviewEl.src = this.lastOutputUrl;
            this.setStatus('Final video is ready.');
            this.setComposeProgress(100, 'done', 'done');
            this.logDebug('compose.done', { jobId, resultUrl: this.lastOutputUrl, outputRecordId: this.currentDraftOutputRecordId || null });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Compose failed: ${message}`);
            this.setComposeProgress(0, 'error', 'error');
            this.logDebug('compose.error', { message });
        } finally {
            this.setBusy(false);
        }
    }

    private async saveCurrentOutput() {
        if (!this.currentDraftOutputRecordId) {
            this.setStatus('No draft output to save. Generate first.');
            return;
        }
        this.setBusy(true);
        try {
            const recordId = this.currentDraftOutputRecordId;
            this.logDebug('compose.save.start', { recordId });
            const payload = await this.requestJson<{ ok: true; output: ProducerOutputRecord }>(`/outputs/${encodeURIComponent(recordId)}/save`, {
                method: 'POST'
            });
            this.currentDraftOutputRecordId = '';
            await this.loadSavedOutputs();
            this.selectedSavedOutputRecordId = payload.output.id;
            this.renderSavedOutputsSelect();
            this.outputPreviewEl.src = `${this.apiBase()}/outputs/${encodeURIComponent(payload.output.id)}/file?ts=${Date.now()}`;
            this.setStatus('Output saved.');
            this.logDebug('compose.save.ok', { recordId: payload.output.id, name: payload.output.name });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Save output failed: ${message}`);
            this.logDebug('compose.save.error', { message });
        } finally {
            this.setBusy(false);
        }
    }

    private async deleteSelectedOutput() {
        const targetId = this.selectedSavedOutputRecordId || this.currentDraftOutputRecordId;
        if (!targetId) {
            this.setStatus('No output selected to delete.');
            return;
        }
        this.setBusy(true);
        try {
            this.logDebug('compose.delete.start', { recordId: targetId });
            await this.requestJson(`/outputs/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
            if (this.currentDraftOutputRecordId === targetId) this.currentDraftOutputRecordId = '';
            if (this.selectedSavedOutputRecordId === targetId) this.selectedSavedOutputRecordId = '';
            this.outputPreviewEl.removeAttribute('src');
            await this.loadSavedOutputs();
            this.setStatus('Output deleted.');
            this.logDebug('compose.delete.ok', { recordId: targetId });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Delete output failed: ${message}`);
            this.logDebug('compose.delete.error', { message });
        } finally {
            this.setBusy(false);
        }
    }

    private bindEvents() {
        const dragHandle = this.root.querySelector('[data-role="drag-handle"]') as HTMLDivElement;
        dragHandle.addEventListener('pointerdown', (event) => {
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
            this.root.style.left = `${this.panelDrag.left + event.clientX - this.panelDrag.startX}px`;
            this.root.style.top = `${this.panelDrag.top + event.clientY - this.panelDrag.startY}px`;
        });
        const endDrag = (event: PointerEvent) => {
            if (!this.panelDrag.active || event.pointerId !== this.panelDrag.pointerId) return;
            this.panelDrag.active = false;
            if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
        };
        dragHandle.addEventListener('pointerup', endDrag);
        dragHandle.addEventListener('pointercancel', endDrag);

        (this.root.querySelector('[data-act="close"]') as HTMLButtonElement).addEventListener('click', () => this.close());
        this.refreshBtn.addEventListener('click', () => {
            void this.reloadAll();
        });

        this.videoSelectEl.addEventListener('change', () => {
            this.selectedVideoId = this.videoSelectEl.value;
            const selected = this.videos.find((item) => item.id === this.selectedVideoId) || null;
            const sourceVideo = this.root.querySelector('[data-role="source-video"]') as HTMLVideoElement;
            sourceVideo.src = selected ? `${this.apiBase()}/videos/${encodeURIComponent(selected.id)}/file` : '';
            void this.loadSnapshots(this.selectedVideoId);
            this.renderComposePlan();
        });

        this.introConfigBtn.addEventListener('click', () => {
            this.introConfigModalEl.classList.remove('hidden');
        });
        this.introConfigCloseBtn.addEventListener('click', () => {
            this.introConfigModalEl.classList.add('hidden');
        });
        this.introConfigModalEl.addEventListener('click', (event) => {
            if (event.target === this.introConfigModalEl) {
                this.introConfigModalEl.classList.add('hidden');
            }
        });

        this.snapshotSelectEl.addEventListener('change', () => {
            const selectedId = this.snapshotSelectEl.value;
            this.selectedSnapshotId = selectedId;
            if (!selectedId) {
                if (this.selectedCoverAssetId) {
                    this.coverBasePreviewEl.src = `${this.apiBase()}/assets/${encodeURIComponent(this.selectedCoverAssetId)}/file`;
                }
                return;
            }
            const snap = this.snapshots.find((item) => item.id === selectedId);
            if (!snap) return;
            this.selectedCoverAssetId = '';
            this.coverBasePreviewEl.src = `${this.apiBase()}${snap.fileUrl.replace('/api/ot-tour-producer', '')}`;
            this.renderSnapshotOptions();
        });

        (this.root.querySelector('[data-act="upload-video"]') as HTMLButtonElement).addEventListener('click', () => this.videoUploadInput.click());
        this.videoUploadInput.addEventListener('change', () => {
            const file = this.videoUploadInput.files?.[0];
            this.videoUploadInput.value = '';
            if (!file) return;
            void this.uploadVideoToDb(file);
        });

        (this.root.querySelector('[data-act="upload-cover-base"]') as HTMLButtonElement).addEventListener('click', () => this.coverUploadInput.click());
        this.coverUploadInput.addEventListener('change', () => {
            const file = this.coverUploadInput.files?.[0];
            this.coverUploadInput.value = '';
            if (!file) return;
            void this.uploadCoverBase(file);
        });

        (this.root.querySelector('[data-act="upload-cover-refs"]') as HTMLButtonElement).addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = () => {
                this.referenceFiles = Array.from(input.files || []);
                const info = this.root.querySelector('[data-role="cover-ref-info"]') as HTMLSpanElement;
                info.textContent = this.referenceFiles.length > 0
                    ? `${this.referenceFiles.length} reference image(s) ready`
                    : 'No refs uploaded';
            };
            input.click();
        });

        (this.root.querySelector('[data-act="upload-intro"]') as HTMLButtonElement).addEventListener('click', () => this.introUploadInput.click());
        this.introUploadInput.addEventListener('change', () => {
            const file = this.introUploadInput.files?.[0];
            this.introUploadInput.value = '';
            if (!file) return;
            void this.uploadIntro(file);
        });

        this.genCoverBtn.addEventListener('click', () => {
            void this.generateCover();
        });

        this.saveOutputBtn.addEventListener('click', () => {
            void this.saveCurrentOutput();
        });

        this.deleteOutputBtn.addEventListener('click', () => {
            void this.deleteSelectedOutput();
        });

        this.savedOutputsSelectEl.addEventListener('change', () => {
            this.selectedSavedOutputRecordId = this.savedOutputsSelectEl.value;
            if (!this.selectedSavedOutputRecordId) {
                this.updateOutputActionButtons();
                return;
            }
            this.currentDraftOutputRecordId = '';
            this.outputPreviewEl.src = `${this.apiBase()}/outputs/${encodeURIComponent(this.selectedSavedOutputRecordId)}/file?ts=${Date.now()}`;
            this.logDebug('compose.outputs.select', { recordId: this.selectedSavedOutputRecordId });
            this.updateOutputActionButtons();
        });

        this.composeBtn.addEventListener('click', () => {
            void this.compose();
        });

        this.coverEnableInput.addEventListener('change', () => this.renderComposePlan());
        this.introEnableInput.addEventListener('change', () => this.renderComposePlan());
    }
}

const mountOTTourProducerPanel = (options: ProducerPanelOptions): ProducerPanelController => {
    return new TourProducerPanel(options);
};

export {
    mountOTTourProducerPanel,
    type ProducerPanelController,
    type ProducerPanelOptions
};
