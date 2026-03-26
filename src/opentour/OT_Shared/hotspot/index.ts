type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type HotspotDisplayMode = 'media-plane' | 'floating-dom' | 'media-object';
type HotspotTriggerMode = 'click' | 'auto_on_arrive' | 'delay_after_arrive';
type HotspotPayloadType = 'image' | 'video' | 'confirm';

type HotspotWorldPoint = { x: number; y: number; z: number };

type HotspotRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type HotspotRecord = {
    hotspotId: string;
    title: string;
    enabled: boolean;
    sortOrder: number;
    triggerMode: HotspotTriggerMode;
    delayMs: number;
    payloadType: HotspotPayloadType;
    displayMode: HotspotDisplayMode;
    region: HotspotRegion;
    mediaSrc: string;
    caption: string;
    ttsText: string;
    confirmMessage: string;
    confirmConfirmText: string;
    confirmCancelText: string;
    anchorWorld?: HotspotWorldPoint | null;
    updatedAt?: string;
    createdAt?: string;
};

type HotspotPoi = {
    poiId: string;
    poiName: string;
    targetX: number;
    targetY: number;
    targetZ: number;
    targetYaw: number;
    targetPitch: number;
    targetFov: number;
    hotspots?: HotspotRecord[];
};

type EmbeddedMediaSpec = {
    mode: 'media-plane' | 'media-object';
    kind: 'image' | 'video';
    src: string;
    title?: string;
    caption?: string;
    anchorWorld: HotspotWorldPoint;
    scale?: number;
    orientation?: { yaw: number; pitch: number; roll: number };
    depthOffset?: number;
    selected?: boolean;
    placeholder?: boolean;
    placeholderLabel?: string;
    billboard?: boolean;
};

type ProjectedScreenPoint = {
    x: number;
    y: number;
    visible: boolean;
};

type HotspotModuleOptions = {
    getModelFilename: () => string | null;
    getPoiById: (poiId: string) => HotspotPoi | null;
    moveToPoi: (poiId: string) => Promise<void>;
    captureScreenshotPng?: () => Promise<string>;
    saveState: (reason: string) => Promise<void>;
    setStatus?: (text: string) => void;
    pickWorldPointAtScreen?: (x: number, y: number) => Promise<HotspotWorldPoint | null>;
    projectWorldToScreen?: (point: HotspotWorldPoint) => ProjectedScreenPoint | null;
    resolveAssetUrl?: (value: string) => string;
    showEmbeddedMedia?: (spec: EmbeddedMediaSpec | null) => void;
};

type HotspotActivationOptions = {
    playback?: boolean;
};

type HotspotController = {
    openEditorForPoi: (poiId: string) => Promise<void>;
    activatePoi: (poiId: string | null, options?: HotspotActivationOptions) => void;
    closePresentations: () => void;
    destroy: () => void;
};

const STYLE_ID = 'otl-hotspot-style';

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .otl-hotspot-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 18;
        font-family: "SF Pro Display", "Segoe UI", sans-serif;
    }
    .otl-hotspot-box {
        position: absolute;
        border: 2px solid rgba(125, 180, 255, 0.95);
        background: rgba(68, 124, 255, 0.12);
        border-radius: 10px;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.18) inset, 0 8px 24px rgba(0,0,0,0.18);
        pointer-events: auto;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }
    .otl-hotspot-box:hover {
        transform: scale(1.015);
        background: rgba(68, 124, 255, 0.18);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.22) inset, 0 14px 30px rgba(0,0,0,0.24);
    }
    .otl-hotspot-pill {
        position: absolute;
        top: 8px;
        left: 8px;
        max-width: calc(100% - 16px);
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(8, 12, 22, 0.78);
        color: #eef4ff;
        font-size: 11px;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .otl-hotspot-floating {
        position: absolute;
        min-width: 220px;
        max-width: 360px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(10, 12, 18, 0.92);
        box-shadow: 0 18px 42px rgba(0,0,0,0.38);
        color: #eef4ff;
        overflow: hidden;
        pointer-events: auto;
    }
    .otl-hotspot-floating-media {
        width: 100%;
        display: block;
        max-height: 420px;
        object-fit: contain;
        background: #06070a;
    }
    .otl-hotspot-floating-body {
        padding: 12px 14px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .otl-hotspot-floating-title {
        font-weight: 700;
        font-size: 13px;
    }
    .otl-hotspot-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(8, 12, 22, 0.72);
        color: #fff;
        cursor: pointer;
    }
    .otl-hotspot-dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: rgba(4, 7, 12, 0.72);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
    }
    .otl-hotspot-dialog {
        width: min(760px, calc(100vw - 36px));
        max-height: calc(100vh - 48px);
        overflow: auto;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #0d1018;
        color: #eef4ff;
        box-shadow: 0 28px 80px rgba(0,0,0,0.48);
    }
    .otl-hotspot-dialog-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .otl-hotspot-dialog-media {
        width: 100%;
        display: block;
        max-height: min(68vh, 620px);
        object-fit: contain;
        background: #06070a;
    }
    .otl-hotspot-dialog-body {
        padding: 16px 18px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .otl-hotspot-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    }
    .otl-hotspot-btn {
        border-radius: 12px;
        border: 1px solid #3453a8;
        background: linear-gradient(180deg, #345fd2, #2648a5);
        color: #fff;
        padding: 9px 14px;
        cursor: pointer;
        font-size: 12px;
    }
    .otl-hotspot-btn.secondary {
        background: #161a24;
        border-color: rgba(255,255,255,0.12);
    }
    .otl-hotspot-editor-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(4, 7, 12, 0.7);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
    }
    .otl-hotspot-editor {
        position: relative;
        width: min(1240px, calc(100vw - 28px));
        height: min(800px, calc(100vh - 28px));
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 12px;
        padding: 12px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.1);
        background: linear-gradient(180deg, rgba(11,14,22,0.98), rgba(16,20,31,0.98));
        color: #eef4ff;
        box-shadow: 0 34px 96px rgba(0,0,0,0.5);
    }
    .otl-hotspot-list-col {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .otl-hotspot-editor-toolbar {
        position: absolute;
        top: 12px;
        right: 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        z-index: 2;
    }
    .otl-hotspot-right-col {
        min-width: 0;
        display: grid;
        grid-template-rows: minmax(320px, 1fr) auto;
        gap: 10px;
    }
    .otl-hotspot-stage {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .otl-hotspot-stage-head, .otl-hotspot-side-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .otl-hotspot-head-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
    }
    .otl-hotspot-stage-surface {
        position: relative;
        flex: 1;
        min-height: 360px;
        border-radius: 14px;
        overflow: hidden;
        background: #05070b;
        border: 1px solid rgba(255,255,255,0.08);
    }
    .otl-hotspot-stage-surface img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        user-select: none;
        pointer-events: none;
    }
    .otl-hotspot-stage-overlay {
        position: absolute;
        inset: 0;
        cursor: crosshair;
    }
    .otl-hotspot-stage-box {
        position: absolute;
        border: 2px solid rgba(125, 180, 255, 0.95);
        border-radius: 12px;
        background: rgba(68, 124, 255, 0.12);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.16) inset;
    }
    .otl-hotspot-stage-box.active {
        border-color: #ffd071;
        background: rgba(255, 208, 113, 0.16);
    }
    .otl-hotspot-side {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .otl-hotspot-panel {
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(10, 13, 20, 0.9);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .otl-hotspot-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 160px;
        overflow: auto;
    }
    .otl-hotspot-list-item {
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.03);
        padding: 8px 10px;
        cursor: pointer;
        user-select: none;
    }
    .otl-hotspot-list-item.active {
        border-color: rgba(125, 180, 255, 0.75);
        background: rgba(68, 124, 255, 0.12);
    }
    .otl-hotspot-list-item.dragging {
        opacity: 0.45;
    }
    .otl-hotspot-list-item.drag-over {
        border-color: #ffd071;
        box-shadow: 0 0 0 1px rgba(255, 208, 113, 0.3) inset;
    }
    .otl-hotspot-list-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
    }
    .otl-hotspot-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        background: rgba(255,255,255,0.06);
        color: rgba(235,241,255,0.82);
    }
    .otl-hotspot-form-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
    }
    .otl-hotspot-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }
    .otl-hotspot-form-grid.config-row {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
    }
    .otl-hotspot-form-grid.title-row {
        grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
    }
    .otl-hotspot-form-grid.payload-row {
        grid-template-columns: minmax(160px, 0.85fr) minmax(260px, 1.15fr) minmax(220px, 1fr);
        align-items: start;
    }
    .otl-hotspot-form-grid.four {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .otl-hotspot-input, .otl-hotspot-select, .otl-hotspot-textarea {
        width: 100%;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #121724;
        color: #eef4ff;
        padding: 8px 9px;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
    }
    .otl-hotspot-textarea {
        min-height: 80px;
        resize: vertical;
    }
    .otl-hotspot-textarea.compact {
        min-height: 96px;
    }
    .otl-hotspot-toggle-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        justify-self: end;
    }
    .otl-hotspot-toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        width: 148px;
        padding: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        cursor: pointer;
        user-select: none;
    }
    .otl-hotspot-toggle input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }
    .otl-hotspot-toggle-text {
        position: relative;
        z-index: 1;
        flex: 1 1 50%;
        text-align: center;
        font-size: 11px;
        line-height: 28px;
        color: rgba(220,230,255,0.62);
    }
    .otl-hotspot-toggle-knob {
        position: absolute;
        top: 4px;
        left: 4px;
        width: calc(50% - 4px);
        height: calc(100% - 8px);
        border-radius: 999px;
        background: linear-gradient(180deg, #355fd0, #274aa8);
        box-shadow: 0 8px 18px rgba(12, 22, 52, 0.38);
        transition: transform 140ms ease;
    }
    .otl-hotspot-toggle input:checked + .otl-hotspot-toggle-knob {
        transform: translateX(100%);
    }
    .otl-hotspot-toggle input:not(:checked) ~ .otl-hotspot-toggle-text.off,
    .otl-hotspot-toggle input:checked ~ .otl-hotspot-toggle-text.on {
        color: #eef4ff;
        font-weight: 700;
    }
    .otl-hotspot-source-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
    }
    .otl-hotspot-source-btn {
        white-space: nowrap;
    }
    .otl-hotspot-icon-btn {
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(18, 23, 36, 0.92);
        color: #eef4ff;
        cursor: pointer;
        transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
    }
    .otl-hotspot-icon-btn:hover {
        border-color: rgba(125, 180, 255, 0.65);
        background: rgba(33, 49, 82, 0.96);
        transform: translateY(-1px);
    }
    .otl-hotspot-icon-btn.primary {
        background: linear-gradient(180deg, #3762d8, #2849a6);
        border-color: rgba(125, 180, 255, 0.35);
        box-shadow: 0 10px 24px rgba(28, 56, 124, 0.34);
    }
    .otl-hotspot-icon-btn svg {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
    .otl-hotspot-foot {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: auto;
    }
    .otl-hotspot-note {
        font-size: 11px;
        color: rgba(220,230,255,0.66);
    }
    .otl-hotspot-note:empty {
        display: none;
    }
    @media (max-width: 980px) {
        .otl-hotspot-editor {
            grid-template-columns: 1fr;
            height: auto;
            max-height: calc(100vh - 36px);
        }
        .otl-hotspot-right-col {
            grid-template-rows: minmax(300px, 1fr) auto;
        }
        .otl-hotspot-form-grid.config-row,
        .otl-hotspot-form-grid.title-row,
        .otl-hotspot-form-grid.payload-row,
        .otl-hotspot-form-grid.four {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .otl-hotspot-form-grid.config-row {
            grid-template-columns: 1fr;
        }
        .otl-hotspot-stage-surface {
            min-height: 300px;
        }
    }
    `;
    document.head.appendChild(style);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nowIso = () => new Date().toISOString();

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const defaultHotspot = (index: number): HotspotRecord => ({
    hotspotId: uid('hotspot'),
    title: `Hotspot ${index + 1}`,
    enabled: true,
    sortOrder: index,
    triggerMode: 'click',
    delayMs: 800,
    payloadType: 'image',
    displayMode: 'floating-dom',
    region: { x: 0.38, y: 0.32, width: 0.18, height: 0.18 },
    mediaSrc: '',
    caption: '',
    ttsText: '',
    confirmMessage: '是否继续？',
    confirmConfirmText: '确认',
    confirmCancelText: '取消',
    anchorWorld: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
});

const cloneHotspot = (hotspot: HotspotRecord): HotspotRecord => ({
    ...hotspot,
    region: { ...hotspot.region },
    anchorWorld: hotspot.anchorWorld ? { ...hotspot.anchorWorld } : null
});

const normalizeHotspot = (value: any, index: number): HotspotRecord => {
    const payloadType = value?.payloadType === 'video' || value?.payloadType === 'confirm' ? value.payloadType : 'image';
    const displayMode = value?.displayMode === 'media-plane' || value?.displayMode === 'media-object' ? value.displayMode : 'floating-dom';
    const triggerMode = value?.triggerMode === 'auto_on_arrive' || value?.triggerMode === 'delay_after_arrive' ? value.triggerMode : 'click';
    const base = defaultHotspot(index);
    return {
        ...base,
        hotspotId: String(value?.hotspotId || base.hotspotId),
        title: String(value?.title || base.title),
        enabled: value?.enabled !== false,
        sortOrder: Number.isFinite(Number(value?.sortOrder)) ? Number(value.sortOrder) : index,
        triggerMode,
        delayMs: Math.max(0, Math.floor(Number.isFinite(Number(value?.delayMs)) ? Number(value.delayMs) : base.delayMs)),
        payloadType,
        displayMode,
        region: {
            x: clamp(Number.isFinite(Number(value?.region?.x)) ? Number(value.region.x) : base.region.x, 0, 1),
            y: clamp(Number.isFinite(Number(value?.region?.y)) ? Number(value.region.y) : base.region.y, 0, 1),
            width: clamp(Number.isFinite(Number(value?.region?.width)) ? Number(value.region.width) : base.region.width, 0.04, 1),
            height: clamp(Number.isFinite(Number(value?.region?.height)) ? Number(value.region.height) : base.region.height, 0.04, 1)
        },
        mediaSrc: String(value?.mediaSrc || ''),
        caption: String(value?.caption || ''),
        ttsText: String(value?.ttsText || ''),
        confirmMessage: String(value?.confirmMessage || base.confirmMessage),
        confirmConfirmText: String(value?.confirmConfirmText || base.confirmConfirmText),
        confirmCancelText: String(value?.confirmCancelText || base.confirmCancelText),
        anchorWorld: value?.anchorWorld && Number.isFinite(Number(value.anchorWorld.x))
            ? {
                x: Number(value.anchorWorld.x),
                y: Number(value.anchorWorld.y),
                z: Number(value.anchorWorld.z)
            }
            : null,
        createdAt: value?.createdAt ? String(value.createdAt) : base.createdAt,
        updatedAt: value?.updatedAt ? String(value.updatedAt) : base.updatedAt
    };
};

const relativeToPercent = (value: number) => `${(value * 100).toFixed(3)}%`;

const speakText = (text: string) => {
    const content = String(text || '').trim();
    if (!content || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(content);
    utter.lang = /[\u4e00-\u9fff]/.test(content) ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(utter);
};

const qs = <T extends Element>(root: ParentNode, selector: string) => root.querySelector(selector) as T;

const iconSvg = (name: 'preview' | 'save' | 'delete' | 'new' | 'close') => {
    if (name === 'preview') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3.2" /></svg>';
    }
    if (name === 'save') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h8V4" /><path d="M9 20v-6h6v6" /></svg>';
    }
    if (name === 'delete') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M7 7l1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>';
    }
    if (name === 'close') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6l-12 12" /></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>';
};

class HotspotModule {
    private overlayRoot: HTMLDivElement;
    private floatingRoot: HTMLDivElement;
    private editorBackdrop: HTMLDivElement;
    private stageImageEl: HTMLImageElement;
    private stageOverlayEl: HTMLDivElement;
    private listEl: HTMLDivElement;
    private formEl: HTMLDivElement;
    private editorTitleEl: HTMLDivElement;
    private editorStatusEl: HTMLDivElement;
    private activePoiId: string | null = null;
    private activeHotspots: HotspotRecord[] = [];
    private editorPoiId: string | null = null;
    private editorHotspots: HotspotRecord[] = [];
    private selectedHotspotId: string | null = null;
    private drawState: { active: boolean; pointerId: number; startX: number; startY: number } = { active: false, pointerId: -1, startX: 0, startY: 0 };
    private currentDialogCleanup: (() => void) | null = null;
    private floatingCardEl: HTMLDivElement | null = null;
    private embeddedCloseBtn: HTMLButtonElement | null = null;
    private autoTimers = new Set<number>();
    private floatingRaf = 0;
    private draggedHotspotId: string | null = null;
    private visibleHotspotIds = new Set<string>();
    private filePickerInput: HTMLInputElement;
    private lastActivationPlayback = false;

    constructor(private readonly options: HotspotModuleOptions) {
        ensureStyle();
        this.overlayRoot = document.createElement('div');
        this.overlayRoot.className = 'otl-hotspot-layer';
        this.floatingRoot = document.createElement('div');
        this.floatingRoot.className = 'otl-hotspot-layer';
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.appendChild(this.overlayRoot);
            canvasContainer.appendChild(this.floatingRoot);
        }

        this.editorBackdrop = document.createElement('div');
        this.editorBackdrop.className = 'otl-hotspot-editor-backdrop';
        this.editorBackdrop.style.display = 'none';
        this.editorBackdrop.innerHTML = `
            <div class="otl-hotspot-editor">
                <div class="otl-hotspot-editor-toolbar">
                    <button class="otl-hotspot-icon-btn" type="button" data-act="hotspot-preview" title="Preview">${iconSvg('preview')}</button>
                    <button class="otl-hotspot-icon-btn" type="button" data-act="editor-close" title="Close">${iconSvg('close')}</button>
                </div>
                <aside class="otl-hotspot-list-col">
                    <div class="otl-hotspot-panel" style="height:100%;">
                        <div class="otl-hotspot-side-head">
                            <div style="font-size:16px;font-weight:700;">Hotspot List</div>
                            <div class="otl-hotspot-head-actions">
                                <button class="otl-hotspot-icon-btn primary" type="button" data-act="hotspot-save" title="Save">${iconSvg('save')}</button>
                                <button class="otl-hotspot-icon-btn" type="button" data-act="hotspot-delete" title="Delete">${iconSvg('delete')}</button>
                                <button class="otl-hotspot-icon-btn" type="button" data-act="hotspot-new" title="New">${iconSvg('new')}</button>
                            </div>
                        </div>
                        <div class="otl-hotspot-list" data-role="hotspot-list" style="max-height:none;flex:1 1 auto;"></div>
                    </div>
                </aside>
                <section class="otl-hotspot-right-col">
                    <div class="otl-hotspot-panel otl-hotspot-stage">
                        <div class="otl-hotspot-stage-head">
                        <div>
                            <div style="font-size:16px;font-weight:700;" data-role="editor-title">Hotspots</div>
                            <div class="otl-hotspot-note" data-role="editor-status"></div>
                        </div>
                    </div>
                    <div class="otl-hotspot-stage-surface">
                        <img alt="POI screenshot" data-role="editor-image" />
                        <div class="otl-hotspot-stage-overlay" data-role="editor-overlay"></div>
                    </div>
                    </div>
                    <div class="otl-hotspot-panel" data-role="hotspot-form"></div>
                </section>
            </div>
        `;
        document.body.appendChild(this.editorBackdrop);

        this.filePickerInput = document.createElement('input');
        this.filePickerInput.type = 'file';
        this.filePickerInput.accept = 'image/*,video/mp4,video/quicktime,video/webm';
        this.filePickerInput.hidden = true;
        document.body.appendChild(this.filePickerInput);

        this.stageImageEl = qs(this.editorBackdrop, '[data-role="editor-image"]');
        this.stageOverlayEl = qs(this.editorBackdrop, '[data-role="editor-overlay"]');
        this.listEl = qs(this.editorBackdrop, '[data-role="hotspot-list"]');
        this.formEl = qs(this.editorBackdrop, '[data-role="hotspot-form"]');
        this.editorTitleEl = qs(this.editorBackdrop, '[data-role="editor-title"]');
        this.editorStatusEl = qs(this.editorBackdrop, '[data-role="editor-status"]');

        this.editorBackdrop.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;
            const actionEl = target?.closest('[data-act]') as HTMLElement | null;
            const act = actionEl?.getAttribute('data-act');
            if (event.target === this.editorBackdrop || act === 'editor-close') {
                this.closeEditor();
                return;
            }
            if (act === 'hotspot-new') {
                this.addHotspot();
                return;
            }
            if (act === 'hotspot-delete') {
                this.deleteSelected();
                return;
            }
            if (act === 'hotspot-save') {
                void this.saveEditor();
                return;
            }
            if (act === 'hotspot-preview') {
                void this.previewSelected();
                return;
            }
            if (act === 'source-pick') {
                this.openSourcePicker();
            }
        });

        this.stageOverlayEl.addEventListener('pointerdown', this.onStagePointerDown);
        this.stageOverlayEl.addEventListener('pointermove', this.onStagePointerMove);
        this.stageOverlayEl.addEventListener('pointerup', this.onStagePointerUp);
        this.stageOverlayEl.addEventListener('pointercancel', this.onStagePointerUp);
    }

    destroy() {
        this.closePresentations();
        this.closeEditor();
        this.overlayRoot.remove();
        this.floatingRoot.remove();
        this.editorBackdrop.remove();
        this.filePickerInput.remove();
    }

    async openEditorForPoi(poiId: string) {
        const poi = this.options.getPoiById(poiId);
        if (!poi) return;
        this.editorPoiId = poiId;
        this.editorTitleEl.textContent = `Hotspots - ${poi.poiName}`;
        this.editorStatusEl.textContent = 'Moving camera to POI and capturing current view...';
        this.editorBackdrop.style.display = 'flex';
        await this.options.moveToPoi(poiId);
        const screenshot = await this.options.captureScreenshotPng?.();
        this.stageImageEl.src = screenshot || poi.hotspots?.[0]?.mediaSrc || '';
        this.editorHotspots = (poi.hotspots || []).map((item, index) => normalizeHotspot(item, index));
        this.selectedHotspotId = this.editorHotspots[0]?.hotspotId || null;
        this.editorStatusEl.textContent = '';
        this.renderEditor();
    }

    activatePoi(poiId: string | null, options: HotspotActivationOptions = {}) {
        const playback = Boolean(options.playback);
        if (poiId && this.activePoiId === poiId && this.lastActivationPlayback === playback) {
            this.renderRuntimeOverlay();
            return;
        }
        this.activePoiId = poiId;
        this.lastActivationPlayback = playback;
        this.resetRuntimeState();
        if (!poiId) {
            this.activeHotspots = [];
            return;
        }
        const poi = this.options.getPoiById(poiId);
        this.activeHotspots = (poi?.hotspots || []).map((item, index) => normalizeHotspot(item, index)).filter((item) => item.enabled);
        this.activeHotspots.forEach((hotspot) => {
            if (hotspot.triggerMode === 'click') {
                this.revealHotspot(hotspot.hotspotId);
                return;
            }
            if (!playback) return;
            if (hotspot.triggerMode === 'auto_on_arrive') {
                this.revealHotspot(hotspot.hotspotId);
                this.executeHotspot(hotspot);
            } else if (hotspot.triggerMode === 'delay_after_arrive') {
                const timer = window.setTimeout(() => {
                    this.autoTimers.delete(timer);
                    if (this.activePoiId !== poiId) return;
                    this.revealHotspot(hotspot.hotspotId);
                    this.executeHotspot(hotspot);
                }, hotspot.delayMs);
                this.autoTimers.add(timer);
            }
        });
        this.renderRuntimeOverlay();
    }

    private resetRuntimeState() {
        this.closePresentations();
        this.autoTimers.forEach((timer) => window.clearTimeout(timer));
        this.autoTimers.clear();
        this.visibleHotspotIds.clear();
        this.overlayRoot.innerHTML = '';
    }

    closePresentations() {
        if (this.currentDialogCleanup) {
            this.currentDialogCleanup();
            this.currentDialogCleanup = null;
        }
        if (this.floatingCardEl) {
            this.floatingCardEl.remove();
            this.floatingCardEl = null;
        }
        if (this.floatingRaf) {
            cancelAnimationFrame(this.floatingRaf);
            this.floatingRaf = 0;
        }
        if (this.embeddedCloseBtn) {
            this.embeddedCloseBtn.remove();
            this.embeddedCloseBtn = null;
        }
        this.options.showEmbeddedMedia?.(null);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    private closeEditor() {
        this.editorBackdrop.style.display = 'none';
        this.drawState.active = false;
    }

    private addHotspot() {
        const hotspot = defaultHotspot(this.editorHotspots.length);
        this.editorHotspots.push(hotspot);
        this.selectedHotspotId = hotspot.hotspotId;
        this.renderEditor();
    }

    private deleteSelected() {
        const targetHotspotId = this.selectedHotspotId || this.editorHotspots[0]?.hotspotId || null;
        if (!targetHotspotId) return;
        const beforeCount = this.editorHotspots.length;
        this.editorHotspots = this.editorHotspots.filter((item) => item.hotspotId !== targetHotspotId);
        if (this.editorHotspots.length === beforeCount) return;
        this.selectedHotspotId = this.editorHotspots[0]?.hotspotId || null;
        this.renderEditor();
        void this.saveEditor();
    }

    private renderEditor() {
        const selected = this.selectedHotspot();
        this.listEl.innerHTML = '';
        this.sortedEditorHotspots().forEach((hotspot, index) => {
            const item = document.createElement('div');
            item.className = `otl-hotspot-list-item${hotspot.hotspotId === this.selectedHotspotId ? ' active' : ''}`;
            item.draggable = true;
            item.dataset.hotspotId = hotspot.hotspotId;
            item.innerHTML = `
                <div style="font-weight:700;font-size:12px;">${index + 1}. ${escapeHtml(hotspot.title)}</div>
                <div class="otl-hotspot-list-meta">
                    <span class="otl-hotspot-chip">${escapeHtml(hotspot.payloadType)}</span>
                    <span class="otl-hotspot-chip">${escapeHtml(hotspot.displayMode)}</span>
                    <span class="otl-hotspot-chip">${hotspot.enabled ? 'enabled' : 'disabled'}</span>
                </div>
            `;
            item.addEventListener('click', () => {
                this.selectedHotspotId = hotspot.hotspotId;
                this.renderEditor();
            });
            item.addEventListener('dragstart', (event) => {
                this.draggedHotspotId = hotspot.hotspotId;
                item.classList.add('dragging');
                event.dataTransfer?.setData('text/plain', hotspot.hotspotId);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                this.draggedHotspotId = null;
                this.listEl.querySelectorAll('.otl-hotspot-list-item').forEach((node) => node.classList.remove('dragging', 'drag-over'));
            });
            item.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (!this.draggedHotspotId || this.draggedHotspotId === hotspot.hotspotId) return;
                item.classList.add('drag-over');
            });
            item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop', (event) => {
                event.preventDefault();
                item.classList.remove('drag-over');
                const sourceId = this.draggedHotspotId || event.dataTransfer?.getData('text/plain') || null;
                if (!sourceId || sourceId === hotspot.hotspotId) return;
                this.reorderHotspot(sourceId, hotspot.hotspotId);
            });
            this.listEl.appendChild(item);
        });

        this.stageOverlayEl.innerHTML = '';
        this.sortedEditorHotspots().forEach((hotspot) => {
            const box = document.createElement('div');
            box.className = `otl-hotspot-stage-box${hotspot.hotspotId === this.selectedHotspotId ? ' active' : ''}`;
            box.style.left = relativeToPercent(hotspot.region.x);
            box.style.top = relativeToPercent(hotspot.region.y);
            box.style.width = relativeToPercent(hotspot.region.width);
            box.style.height = relativeToPercent(hotspot.region.height);
            box.title = hotspot.title;
            this.stageOverlayEl.appendChild(box);
        });

        if (!selected) {
            this.formEl.innerHTML = '<div class="otl-hotspot-note">Select a hotspot.</div>';
            return;
        }

        const showMediaFields = selected.payloadType !== 'confirm';
        this.formEl.innerHTML = `
            <div class="otl-hotspot-form-grid config-row">
                <div class="otl-hotspot-side-head"><div style="font-size:13px;font-weight:700;">Hotspot Config</div></div>
                <div class="otl-hotspot-toggle-wrap">
                    <label class="otl-hotspot-toggle">
                        <input type="checkbox" data-field="enabled" ${selected.enabled ? 'checked' : ''} />
                        <span class="otl-hotspot-toggle-knob"></span>
                        <span class="otl-hotspot-toggle-text off">Disabled</span>
                        <span class="otl-hotspot-toggle-text on">Enabled</span>
                    </label>
                </div>
            </div>
            <div class="otl-hotspot-form-grid title-row">
                <div class="otl-hotspot-form-row"><label>Title</label><input class="otl-hotspot-input" data-field="title" value="${escapeHtml(selected.title)}" /></div>
                <div class="otl-hotspot-form-row"><label>Trigger</label><select class="otl-hotspot-select" data-field="triggerMode"><option value="click" ${selected.triggerMode === 'click' ? 'selected' : ''}>Click</option><option value="auto_on_arrive" ${selected.triggerMode === 'auto_on_arrive' ? 'selected' : ''}>Auto On Arrive</option><option value="delay_after_arrive" ${selected.triggerMode === 'delay_after_arrive' ? 'selected' : ''}>Delay After Arrive</option></select></div>
                <div class="otl-hotspot-form-row"><label>Delay (ms)</label><input class="otl-hotspot-input" type="number" min="0" step="100" data-field="delayMs" value="${selected.delayMs}" /></div>
                <div class="otl-hotspot-form-row"><label>Display</label><select class="otl-hotspot-select" data-field="displayMode" ${showMediaFields ? '' : 'disabled'}><option value="floating-dom" ${selected.displayMode === 'floating-dom' ? 'selected' : ''}>Floating DOM</option><option value="media-plane" ${selected.displayMode === 'media-plane' ? 'selected' : ''}>Scene Media Plane</option><option value="media-object" ${selected.displayMode === 'media-object' ? 'selected' : ''}>3D Media Object</option></select></div>
            </div>
            ${showMediaFields ? `
            <div class="otl-hotspot-form-grid payload-row">
                <div class="otl-hotspot-form-row"><label>Payload</label><select class="otl-hotspot-select" data-field="payloadType"><option value="image" ${selected.payloadType === 'image' ? 'selected' : ''}>Image + TTS</option><option value="video" ${selected.payloadType === 'video' ? 'selected' : ''}>Video</option><option value="confirm" ${selected.payloadType === 'confirm' ? 'selected' : ''}>Confirm Dialog</option></select></div>
                <div class="otl-hotspot-form-row"><label>Source Path</label><div class="otl-hotspot-source-row"><input class="otl-hotspot-input" data-field="mediaSrc" value="${escapeHtml(selected.mediaSrc)}" placeholder="/absolute/path or https://..." /><button class="otl-hotspot-btn secondary otl-hotspot-source-btn" type="button" data-act="source-pick">Choose File</button></div></div>
                <div class="otl-hotspot-form-row"><label>TTS Text</label>${selected.payloadType === 'image' ? `<textarea class="otl-hotspot-textarea compact" rows="3" data-field="ttsText" placeholder="Optional narration when image opens">${escapeHtml(selected.ttsText)}</textarea>` : `<textarea class="otl-hotspot-textarea compact" rows="3" data-field="ttsText" disabled placeholder="TTS only used for image payload"></textarea>`}</div>
            </div>
            ` : `
            <div class="otl-hotspot-form-row"><label>Payload</label><select class="otl-hotspot-select" data-field="payloadType"><option value="image" ${selected.payloadType === 'image' ? 'selected' : ''}>Image + TTS</option><option value="video" ${selected.payloadType === 'video' ? 'selected' : ''}>Video</option><option value="confirm" ${selected.payloadType === 'confirm' ? 'selected' : ''}>Confirm Dialog</option></select></div>
            <div class="otl-hotspot-form-row"><label>Message</label><textarea class="otl-hotspot-textarea" data-field="confirmMessage">${escapeHtml(selected.confirmMessage)}</textarea></div>
            <div class="otl-hotspot-form-grid">
                <div class="otl-hotspot-form-row"><label>Confirm Text</label><input class="otl-hotspot-input" data-field="confirmConfirmText" value="${escapeHtml(selected.confirmConfirmText)}" /></div>
                <div class="otl-hotspot-form-row"><label>Cancel Text</label><input class="otl-hotspot-input" data-field="confirmCancelText" value="${escapeHtml(selected.confirmCancelText)}" /></div>
            </div>
            `}
        `;

        this.formEl.querySelectorAll('[data-field]').forEach((node) => {
            node.addEventListener('input', () => this.syncFormToSelected());
            node.addEventListener('change', () => {
                this.syncFormToSelected();
                this.renderEditor();
            });
        });
    }

    private syncFormToSelected() {
        const selected = this.selectedHotspot();
        if (!selected) return;
        const getValue = (name: string) => (this.formEl.querySelector(`[data-field="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null);
        selected.title = String(getValue('title')?.value || selected.title);
        selected.enabled = Boolean((getValue('enabled') as HTMLInputElement | null)?.checked);
        selected.payloadType = ((getValue('payloadType')?.value || selected.payloadType) as HotspotPayloadType);
        selected.triggerMode = ((getValue('triggerMode')?.value || selected.triggerMode) as HotspotTriggerMode);
        selected.delayMs = Math.max(0, Math.floor(Number(getValue('delayMs')?.value || selected.delayMs) || 0));
        selected.displayMode = ((getValue('displayMode')?.value || selected.displayMode) as HotspotDisplayMode);
        selected.mediaSrc = String(getValue('mediaSrc')?.value || '');
        selected.ttsText = String(getValue('ttsText')?.value || '');
        selected.caption = '';
        selected.confirmMessage = String(getValue('confirmMessage')?.value || selected.confirmMessage);
        selected.confirmConfirmText = String(getValue('confirmConfirmText')?.value || selected.confirmConfirmText);
        selected.confirmCancelText = String(getValue('confirmCancelText')?.value || selected.confirmCancelText);
        selected.updatedAt = nowIso();
    }

    private sortedEditorHotspots() {
        return this.editorHotspots.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    }

    private reorderHotspot(sourceId: string, targetId: string) {
        const list = this.sortedEditorHotspots();
        const fromIndex = list.findIndex((item) => item.hotspotId === sourceId);
        const toIndex = list.findIndex((item) => item.hotspotId === targetId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        list.forEach((item, index) => {
            item.sortOrder = index;
            item.updatedAt = nowIso();
        });
        this.editorHotspots = list;
        this.selectedHotspotId = moved.hotspotId;
        this.renderEditor();
    }

    private selectedHotspot() {
        return this.editorHotspots.find((item) => item.hotspotId === this.selectedHotspotId) || null;
    }

    private onStagePointerDown = (event: PointerEvent) => {
        const selected = this.selectedHotspot();
        if (!selected || event.button !== 0) return;
        const rect = this.stageOverlayEl.getBoundingClientRect();
        const startX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const startY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        this.drawState = { active: true, pointerId: event.pointerId, startX, startY };
        this.stageOverlayEl.setPointerCapture(event.pointerId);
        selected.region = { x: startX, y: startY, width: 0.04, height: 0.04 };
        this.renderEditor();
    };

    private onStagePointerMove = (event: PointerEvent) => {
        if (!this.drawState.active || event.pointerId !== this.drawState.pointerId) return;
        const selected = this.selectedHotspot();
        if (!selected) return;
        const rect = this.stageOverlayEl.getBoundingClientRect();
        const currentX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const currentY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        const x = Math.min(this.drawState.startX, currentX);
        const y = Math.min(this.drawState.startY, currentY);
        const width = Math.max(0.03, Math.abs(currentX - this.drawState.startX));
        const height = Math.max(0.03, Math.abs(currentY - this.drawState.startY));
        selected.region = { x, y, width, height };
        selected.updatedAt = nowIso();
        this.renderEditor();
    };

    private onStagePointerUp = (event: PointerEvent) => {
        if (!this.drawState.active || event.pointerId !== this.drawState.pointerId) return;
        this.drawState.active = false;
        if (this.stageOverlayEl.hasPointerCapture(event.pointerId)) {
            this.stageOverlayEl.releasePointerCapture(event.pointerId);
        }
    };

    private async saveEditor() {
        if (!this.editorPoiId) return;
        this.syncFormToSelected();
        await this.refreshAnchors();
        const poi = this.options.getPoiById(this.editorPoiId);
        if (!poi) return;
        poi.hotspots = this.editorHotspots.map((item, index) => ({
            ...cloneHotspot(item),
            sortOrder: index,
            updatedAt: nowIso(),
            createdAt: item.createdAt || nowIso()
        }));
        await this.options.saveState('hotspot-save');
        this.options.setStatus?.(`Saved ${poi.hotspots.length} hotspot(s) for ${poi.poiName}`);
        this.editorStatusEl.textContent = `Saved ${poi.hotspots.length} hotspot(s).`;
    }

    private async refreshAnchors() {
        if (!this.options.pickWorldPointAtScreen) return;
        for (let i = 0; i < this.editorHotspots.length; i += 1) {
            const hotspot = this.editorHotspots[i];
            if (hotspot.payloadType === 'confirm') continue;
            const centerX = clamp(hotspot.region.x + hotspot.region.width * 0.5, 0, 1);
            const centerY = clamp(hotspot.region.y + hotspot.region.height * 0.5, 0, 1);
            const anchor = await this.options.pickWorldPointAtScreen(centerX, centerY);
            if (anchor) hotspot.anchorWorld = anchor;
        }
    }

    private async previewSelected() {
        if (!this.editorPoiId) return;
        this.syncFormToSelected();
        await this.refreshAnchors();
        await this.options.moveToPoi(this.editorPoiId);
        const draftHotspots = this.editorHotspots
            .map((item, index) => normalizeHotspot(cloneHotspot(item), index))
            .filter((item) => item.enabled);
        this.activePoiId = this.editorPoiId;
        this.lastActivationPlayback = false;
        this.resetRuntimeState();
        this.activeHotspots = draftHotspots;
        draftHotspots.forEach((hotspot) => this.visibleHotspotIds.add(hotspot.hotspotId));
        this.renderRuntimeOverlay();
        this.closeEditor();
        this.options.setStatus?.(`Previewing ${draftHotspots.length} hotspot(s) for ${this.options.getPoiById(this.editorPoiId)?.poiName || 'current POI'}`);
    }

    private renderRuntimeOverlay() {
        this.overlayRoot.innerHTML = '';
        this.activeHotspots
            .filter((item) => item.enabled && this.visibleHotspotIds.has(item.hotspotId))
            .forEach((hotspot) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'otl-hotspot-box';
            button.style.left = relativeToPercent(hotspot.region.x);
            button.style.top = relativeToPercent(hotspot.region.y);
            button.style.width = relativeToPercent(hotspot.region.width);
            button.style.height = relativeToPercent(hotspot.region.height);
            button.innerHTML = `<span class="otl-hotspot-pill">${escapeHtml(hotspot.title)}</span>`;
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.executeHotspot(hotspot);
            });
            this.overlayRoot.appendChild(button);
            });
    }

    private revealHotspot(hotspotId: string) {
        this.visibleHotspotIds.add(hotspotId);
        this.renderRuntimeOverlay();
    }

    private executeHotspot(hotspot: HotspotRecord) {
        this.closePresentations();
        if (hotspot.payloadType === 'confirm') {
            this.openConfirmDialog(hotspot);
            return;
        }
        const src = this.resolveAsset(hotspot.mediaSrc);
        if (!src) {
            this.options.setStatus?.(`Missing media source for hotspot ${hotspot.title}`);
            return;
        }
        if (hotspot.displayMode === 'floating-dom') {
            this.openFloatingCard(hotspot, src);
        } else if (hotspot.anchorWorld) {
            this.options.showEmbeddedMedia?.({
                mode: hotspot.displayMode === 'media-object' ? 'media-object' : 'media-plane',
                kind: hotspot.payloadType === 'video' ? 'video' : 'image',
                src,
                title: hotspot.title,
                caption: hotspot.caption,
                anchorWorld: hotspot.anchorWorld
            });
            this.mountEmbeddedCloseButton();
        } else {
            this.openFloatingCard(hotspot, src);
        }
        if (hotspot.payloadType === 'image' && hotspot.ttsText.trim()) {
            speakText(hotspot.ttsText);
        }
    }

    private openFloatingCard(hotspot: HotspotRecord, src: string) {
        const card = document.createElement('div');
        card.className = 'otl-hotspot-floating';
        const mediaTag = hotspot.payloadType === 'video'
            ? `<video class="otl-hotspot-floating-media" src="${escapeAttribute(src)}" controls autoplay muted playsinline loop></video>`
            : `<img class="otl-hotspot-floating-media" src="${escapeAttribute(src)}" alt="${escapeAttribute(hotspot.title)}" />`;
        card.innerHTML = `
            ${mediaTag}
            <button class="otl-hotspot-close" type="button">×</button>
            <div class="otl-hotspot-floating-body">
                <div class="otl-hotspot-floating-title">${escapeHtml(hotspot.title)}</div>
            </div>
        `;
        card.querySelector('.otl-hotspot-close')?.addEventListener('click', () => this.closePresentations());
        this.floatingRoot.appendChild(card);
        this.floatingCardEl = card;
        const updatePosition = () => {
            if (!this.floatingCardEl) return;
            const hostWidth = this.floatingRoot.clientWidth || 320;
            const hostHeight = this.floatingRoot.clientHeight || 240;
            let x = hostWidth * clamp(hotspot.region.x + hotspot.region.width * 0.5, 0.12, 0.88);
            let y = hostHeight * clamp(hotspot.region.y + hotspot.region.height * 0.5, 0.12, 0.88);
            this.floatingCardEl.style.display = 'block';
            if (hotspot.anchorWorld && this.options.projectWorldToScreen) {
                const next = this.options.projectWorldToScreen(hotspot.anchorWorld);
                if (next?.visible) {
                    x = next.x;
                    y = next.y;
                }
                this.floatingRaf = requestAnimationFrame(updatePosition);
            }
            this.floatingCardEl.style.left = `${Math.round(x + 16)}px`;
            this.floatingCardEl.style.top = `${Math.round(y - 40)}px`;
        };
        updatePosition();
    }

    private openConfirmDialog(hotspot: HotspotRecord) {
        const backdrop = document.createElement('div');
        backdrop.className = 'otl-hotspot-dialog-backdrop';
        backdrop.innerHTML = `
            <div class="otl-hotspot-dialog">
                <div class="otl-hotspot-dialog-head">
                    <div style="font-size:15px;font-weight:700;">${escapeHtml(hotspot.title || 'Confirm')}</div>
                    <button class="otl-hotspot-close" type="button">×</button>
                </div>
                <div class="otl-hotspot-dialog-body">
                    <div>${escapeHtml(hotspot.confirmMessage || '是否继续？')}</div>
                    <div class="otl-hotspot-actions">
                        <button class="otl-hotspot-btn secondary" type="button" data-act="cancel">${escapeHtml(hotspot.confirmCancelText || '取消')}</button>
                        <button class="otl-hotspot-btn" type="button" data-act="confirm">${escapeHtml(hotspot.confirmConfirmText || '确认')}</button>
                    </div>
                </div>
            </div>
        `;
        const cleanup = () => backdrop.remove();
        backdrop.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (event.target === backdrop || target.closest('.otl-hotspot-close') || target.getAttribute('data-act') === 'cancel') {
                this.closePresentations();
            }
            if (target.getAttribute('data-act') === 'confirm') {
                this.options.setStatus?.(`Confirmed hotspot: ${hotspot.title}`);
                this.closePresentations();
            }
        });
        document.body.appendChild(backdrop);
        this.currentDialogCleanup = cleanup;
    }

    private mountEmbeddedCloseButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'otl-hotspot-close';
        button.style.position = 'fixed';
        button.style.top = '18px';
        button.style.right = '18px';
        button.style.zIndex = '10002';
        button.textContent = '×';
        button.addEventListener('click', () => this.closePresentations());
        document.body.appendChild(button);
        this.embeddedCloseBtn = button;
    }

    private resolveAsset(value: string) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^(data:|blob:|https?:)/i.test(raw)) return raw;
        if (raw.startsWith('/')) {
            return this.options.resolveAssetUrl ? this.options.resolveAssetUrl(raw) : raw;
        }
        return raw;
    }

    private openSourcePicker() {
        const selected = this.selectedHotspot();
        if (!selected || selected.payloadType === 'confirm') return;
        this.filePickerInput.accept = selected.payloadType === 'video'
            ? 'video/mp4,video/quicktime,video/webm'
            : 'image/*';
        this.filePickerInput.value = '';
        this.filePickerInput.onchange = () => {
            const file = this.filePickerInput.files?.[0] || null;
            if (!file) return;
            const nativePath = String((file as File & { path?: string }).path || '').trim();
            const fallback = this.filePickerInput.value.replace(/^C:\\fakepath\\/i, '').trim() || file.name;
            const resolved = nativePath || fallback;
            const input = this.formEl.querySelector('[data-field="mediaSrc"]') as HTMLInputElement | null;
            if (!input) return;
            input.value = resolved;
            this.syncFormToSelected();
            this.options.setStatus?.(nativePath ? `Source Path selected: ${file.name}` : `Source Path filled with ${fallback}. If preview fails, paste the absolute path manually.`);
        };
        this.filePickerInput.click();
    }
}

const escapeHtml = (value: string) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value: string) => escapeHtml(value);

const createHotspotController = (options: HotspotModuleOptions): HotspotController => {
    const module = new HotspotModule(options);
    return {
        openEditorForPoi: (poiId: string) => module.openEditorForPoi(poiId),
        activatePoi: (poiId: string | null, activationOptions?: HotspotActivationOptions) => module.activatePoi(poiId, activationOptions),
        closePresentations: () => module.closePresentations(),
        destroy: () => module.destroy()
    };
};

export {
    createHotspotController,
    normalizeHotspot,
    type CameraPose,
    type EmbeddedMediaSpec,
    type HotspotController,
    type HotspotActivationOptions,
    type HotspotDisplayMode,
    type HotspotModuleOptions,
    type HotspotPayloadType,
    type HotspotPoi,
    type HotspotRecord,
    type HotspotTriggerMode,
    type HotspotWorldPoint,
    type ProjectedScreenPoint
};
