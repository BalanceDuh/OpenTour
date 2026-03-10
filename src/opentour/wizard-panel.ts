import { Mat4, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { ElementType } from '../element';
import {
    buildRefreshRaster,
    type StrategyRasterResult,
    type StrategyRasterStats,
    type StrategyRoiResult
} from './refresh-quality-strategy';
import {
    getComboAxisLabels
} from './best-view-generator';
import {
    DEFAULT_RIGHT_HANDED_PRESET_ID,
    RIGHT_HANDED_AXIS_PRESETS,
    type RightHandedAxisPresetId
} from './axis-presets';
import {
    buildStep3CameraOverlay,
    calculateScreenPosition,
    calculateContainRect,
    type Step3CameraOverlayResult,
    type Step3ViewRange
} from './Step3CameraPosition';

type CameraPoint = { x: number; y: number; z: number };

type CameraPosePair = {
    cameraWorld: {
        eye: CameraPoint;
        forward: CameraPoint;
    };
    cameraModelLocal: {
        eye: CameraPoint;
        forward: CameraPoint;
    };
};

type CameraStart = {
    eye: CameraPoint;
    target: CameraPoint;
    fov: number;
    reason?: string;
};

type MapStyle = 'navigation' | 'visual' | 'color';

type SampledPoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
    r: number;
    g: number;
    b: number;
    hasColor: boolean;
};

type AxisComboId = 'combo-1' | 'combo-2' | 'combo-3' | 'combo-4';

type ProjectionParams = {
    sliceMin: number;
    sliceMax: number;
    xRangeMin: number;
    xRangeMax: number;
    heightMin: number;
    heightMax: number;
};

type RectNorm = { x: number; y: number; w: number; h: number };

type Candidate = {
    id: string;
    label: string;
    score: number;
    cameraStart: CameraStart;
};

type WorkflowSnapshot = {
    version: 1;
    modelFilename: string;
    selectedComboId: AxisComboId | null;
    projection: ProjectionParams;
    mapBoundary: RectNorm | null;
    frontBoundary: RectNorm | null;
    top3: Candidate[];
    finalCamera: CameraStart | null;
    confirmedAt: string | null;
};

type CalibrationRecord = {
    axisPresetId: string;
    viewRange: Step3ViewRange;
    verticalMapImage: string | null;
    frontViewImage: string | null;
    imageMime?: string | null;
    sourceAxisPresetId?: string | null;
    targetAxisPresetId?: string | null;
    canonicalTopSelection?: RectNorm | null;
    canonicalFrontSelection?: RectNorm | null;
    bestCamera?: unknown;
    selectedBestCameraId?: string | null;
};

type ComboRuntime = {
    id: AxisComboId;
    title: string;
    subtitle: string;
    mapLabel: string;
    frontLabel: string;
    mapRect: RectNorm;
    frontRect: RectNorm;
};

type DragMode = 'none' | 'move' | 'resize-tl' | 'resize-br' | 'front-min' | 'front-max' | 'front-move';

type DragState = {
    active: boolean;
    comboId: AxisComboId;
    target: 'map' | 'front';
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: RectNorm;
    startZoom: number;
};

type PreviewViewport = {
    zoom: number;
    offsetX: number;
    offsetY: number;
};

type RasterStats = StrategyRasterStats;
type RoiResult = StrategyRoiResult;
type RasterResult = StrategyRasterResult;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const getSceneInstance = () => {
    return (window as any).opentour?.scene || (window as any).scene;
};

const getEventsInstance = () => {
    return (window as any).opentour?.events;
};

const hashString = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
};

const TYPE_SIZE: Record<string, number> = {
    char: 1,
    uchar: 1,
    int8: 1,
    uint8: 1,
    short: 2,
    ushort: 2,
    int16: 2,
    uint16: 2,
    int: 4,
    uint: 4,
    int32: 4,
    uint32: 4,
    float: 4,
    float32: 4,
    double: 8,
    float64: 8
};

const readNumber = (view: DataView, offset: number, type: string) => {
    switch (type) {
        case 'char':
        case 'int8': return view.getInt8(offset);
        case 'uchar':
        case 'uint8': return view.getUint8(offset);
        case 'short':
        case 'int16': return view.getInt16(offset, true);
        case 'ushort':
        case 'uint16': return view.getUint16(offset, true);
        case 'int':
        case 'int32': return view.getInt32(offset, true);
        case 'uint':
        case 'uint32': return view.getUint32(offset, true);
        case 'double':
        case 'float64': return view.getFloat64(offset, true);
        default: return view.getFloat32(offset, true);
    }
};

const COMBOS: Array<{ id: AxisComboId; title: string; subtitle: string; mapLabel: string; frontLabel: string }> = [
    { id: 'combo-1', title: 'A. OpenCV (R-Ydown-Zfwd)', subtitle: 'Map[X,Z], Front[X,-Y]', mapLabel: 'MAP [X, Z]', frontLabel: 'FRONT [X, -Y]' },
    { id: 'combo-2', title: 'B. OpenGL (R-Yup-Zback)', subtitle: 'Map[X,-Z], Front[X,Y]', mapLabel: 'MAP [X, -Z]', frontLabel: 'FRONT [X, Y]' },
    { id: 'combo-3', title: 'C. R-Zup-Yfwd', subtitle: 'Map[X,Y], Front[X,Z]', mapLabel: 'MAP [X, Y]', frontLabel: 'FRONT [X, Z]' },
    { id: 'combo-4', title: 'D. Preset Matched (2D + Front)', subtitle: 'Pick any right-handed preset to drive map/front projections', mapLabel: 'MAP [Preset]', frontLabel: 'FRONT [Preset]' }
];

const ensureStyle = () => {
    if (document.getElementById('otw-style')) return;
    const style = document.createElement('style');
    style.id = 'otw-style';
    style.textContent = `
    #otw-panel {
        position: fixed;
        top: 90px;
        right: 60px;
        width: 340px;
        max-height: calc(100vh - 110px);
        overflow-y: auto;
        z-index: 90;
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
    }
    #otw-panel.hidden { display: none; }
    .otw-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
        cursor: move;
    }
    .otw-title { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
    .otw-card {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 14px;
        overflow: hidden;
    }
    .otw-step-head {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
    }
    .otw-step-badge {
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
    .otw-step {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #f0f6fc;
    }
    .otw-row { display: flex; gap: 8px; align-items: center; }
    .otw-drop-zone {
        border: 1px dashed #30363d;
        border-radius: 6px;
        padding: 20px 10px;
        text-align: center;
        background: rgba(255,255,255,0.02);
        cursor: pointer;
        transition: 0.2s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
    .otw-drop-zone:hover {
        border-color: #2f81f7;
        background: rgba(47,129,247,0.05);
    }
    .otw-drop-zone svg { color: #8b949e; }
    .otw-drop-zone:hover svg { color: #2f81f7; }
    .otw-drop-main { font-size: 13px; color: #f0f6fc; font-weight: 500; }
    .otw-drop-sub { font-size: 11px; color: #8b949e; }
    .otw-btn {
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
    .otw-btn.primary {
        background: #2f81f7;
        border-color: rgba(255,255,255,0.1);
        color: #fff;
    }
    .otw-btn.primary:hover { background: #58a6ff; }
    .otw-btn.ghost { color: #8b949e; }
    .otw-btn.warn {
        color: #ffb3b3;
        border-color: #6a2d33;
        background: rgba(88, 18, 27, 0.25);
    }
    .otw-btn.warn:hover {
        border-color: #8a3942;
        background: rgba(120, 28, 40, 0.28);
    }
    .otw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .otw-text { font-size: 12px; line-height: 1.4; color: #8b949e; }
    .otw-status { font-size: 11px; color: #8b949e; min-height: 18px; margin-top: -8px; }
    #otw-debug {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        margin: 0;
        background: rgba(13, 17, 23, 0.95);
        border-top: 1px solid #30363d;
        border-radius: 0;
        font-family: Consolas, monospace;
        font-size: 11px;
        color: #8b949e;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 200;
        backdrop-filter: blur(4px);
    }
    #otw-debug.hidden { display: none; }
    .otw-debug-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: #161b22;
        border-bottom: 1px solid #30363d;
        cursor: pointer;
    }
    .otw-debug-tools {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .otw-debug-actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .otw-debug-body {
        max-height: 150px;
        overflow-y: auto;
        padding: 8px 10px;
        white-space: pre-wrap;
        user-select: text;
        -webkit-user-select: text;
    }
    .otw-debug-body.collapsed { display: none; }
    .otw-debug-row {
        border-bottom: 1px solid rgba(48, 54, 61, 0.4);
        padding: 4px 0;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
    }
    .otw-debug-time { color: #58a6ff; margin-right: 6px; }

    #otw-modal {
        position: fixed;
        inset: 0;
        z-index: 120;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(4, 9, 18, 0.78);
    }
    #otw-modal.visible { display: flex; }
    .otw-dialog {
        width: min(1280px, calc(100vw - 32px));
        height: min(780px, calc(100vh - 28px));
        border: 1px solid #2a4066;
        border-radius: 14px;
        background:
            linear-gradient(rgba(14, 27, 50, 0.16) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14, 27, 50, 0.16) 1px, transparent 1px),
            #040b16;
        background-size: 40px 40px, 40px 40px, auto;
        color: #d5e8ff;
        font-family: "Segoe UI", sans-serif;
        display: grid;
        grid-template-columns: 1fr 320px;
        overflow: hidden;
    }
    .otw-main { padding: 10px 14px 12px; border-right: 1px solid #1f2c44; display: flex; flex-direction: column; }
    .otw-side { padding: 14px; display: flex; flex-direction: column; }
    .otw-dialog { position: relative; }
    .otw-close-floating {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 3;
        width: 34px;
        padding: 0;
    }
    .otw-style-block {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: nowrap;
        min-width: 0;
    }
    .otw-style-block label { font-size: 12px; color: #8fa6c1; white-space: nowrap; }
    .otw-style-block select {
        height: 30px;
        width: 230px;
        border-radius: 6px;
        border: 1px solid #2e456a;
        background: rgba(7, 15, 28, 0.95);
        color: #e1efff;
        padding: 0 8px;
    }
    .otw-overlay-row { display: flex; gap: 10px; flex-wrap: nowrap; align-items: center; }
    .otw-overlay-row label { font-size: 12px; color: #9db4d1; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
    .otw-overlay-row input { accent-color: #3a8bff; }
    .otw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; min-height: 0; }
    .otw-combo {
        border: 1px solid #31455f;
        border-radius: 10px;
        padding: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        cursor: pointer;
        position: relative;
        background: rgba(12, 22, 38, 0.5);
    }
    .otw-combo.sel { border-color: #2f8dff; box-shadow: inset 0 0 0 1px #2f8dff; }
    .otw-combo-title { grid-column: 1 / -1; font-size: 12px; color: #9fb3ca; }
    .otw-combo-sub { grid-column: 1 / -1; margin-top: -4px; font-size: 11px; color: #6f8dac; }
    .otw-combo-refresh {
        position: absolute;
        right: 10px;
        top: 8px;
        width: 40px;
        height: 26px;
        border-radius: 5px;
        border: 1px solid #3a8bff;
        background: rgba(10, 31, 58, 0.9);
        color: #9eceff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
    }
    .otw-preview {
        border: 1px solid #33435a;
        border-radius: 6px;
        height: 180px;
        background: radial-gradient(circle at center, rgba(17, 33, 56, 0.6), rgba(5, 10, 18, 0.95));
        position: relative;
    }
    .otw-preview canvas { width: 100%; height: 100%; display: block; border-radius: 6px; }
    .otw-tag { position: absolute; left: 6px; top: 6px; font-size: 10px; color: #8fa5bc; text-transform: uppercase; letter-spacing: 0.06em; }
    .otw-zoom {
        position: absolute;
        left: 8px;
        bottom: 8px;
        display: inline-flex;
        gap: 4px;
        z-index: 3;
    }
    .otw-zoom-btn {
        width: 22px;
        height: 22px;
        border-radius: 4px;
        border: 1px solid rgba(143, 165, 188, 0.35);
        background: rgba(142, 165, 191, 0.12);
        color: #b5c7db;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
    }
    .otw-zoom-btn:hover {
        background: rgba(142, 165, 191, 0.22);
        border-color: rgba(143, 165, 188, 0.55);
    }
    .otw-summary-tools {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
    }
    .otw-summary-zoom {
        display: inline-flex;
        gap: 6px;
    }
    .otw-axis-preset-panel {
        border: 1px solid #1f334f;
        border-radius: 10px;
        background: rgba(5, 12, 24, 0.82);
        padding: 10px;
        margin-top: 10px;
    }
    .otw-axis-preset-title {
        font-size: 11px;
        letter-spacing: 0.04em;
        color: #8fa6c1;
        margin-bottom: 8px;
        text-transform: uppercase;
    }
    .otw-axis-preset-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
    }
    .otw-axis-preset-btn {
        height: 28px;
        border-radius: 6px;
        border: 1px solid #2e456a;
        background: rgba(10, 22, 40, 0.9);
        color: #d6e6f8;
        font-size: 11px;
        line-height: 1;
        padding: 0 6px;
        cursor: pointer;
        text-align: center;
    }
    .otw-axis-preset-btn:hover {
        border-color: #4a74aa;
        background: rgba(14, 31, 54, 0.96);
    }
    .otw-axis-preset-btn.active {
        border-color: #3a8bff;
        box-shadow: inset 0 0 0 1px #3a8bff;
        color: #eef6ff;
    }
    .otw-summary-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 8px;
    }
    .otw-summary-panel {
        border: 1px solid #2b3f5f;
        border-radius: 6px;
        background: #040b18;
        padding: 2px;
    }
    .otw-summary-label {
        font-size: 10px;
        color: #8fa5bc;
        margin: 2px 0 4px 2px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .otw-summary-map {
        width: 100%;
        height: 130px;
        display: block;
        border-radius: 4px;
    }
    .otw-controls {
        margin-top: 12px;
        border: 1px solid #223550;
        border-radius: 12px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
        background: rgba(10, 18, 32, 0.86);
    }
    .otw-controls-row { display: flex; width: 100%; }
    .otw-controls-row.left { justify-content: flex-start; }
    .otw-controls-row.center { justify-content: center; }
    .otw-controls-row.right { justify-content: flex-end; }
    .otw-controls-row.between { justify-content: space-between; }
    .otw-controls-row.end { align-items: flex-end; }
    .otw-param-row-wrap { display: flex; gap: 8px; }
    .otw-view-param-wrap { justify-content: flex-start; }
    .otw-param {
        min-width: 160px;
        border: 1px solid #2b3f5f;
        border-radius: 10px;
        padding: 6px 8px;
        background: rgba(6, 14, 28, 0.72);
    }
    .otw-param-name {
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 6px;
        letter-spacing: 0.03em;
    }
    .otw-param-name.x { color: #ff6666; }
    .otw-param-name.y { color: #37d877; }
    .otw-param-name.z { color: #43a0ff; }
    .otw-param-row {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        align-items: center;
        gap: 6px;
    }
    .otw-param-row.single {
        grid-template-columns: 1fr;
    }
    .otw-param-label {
        font-size: 10px;
        text-transform: uppercase;
        color: #8ea8c8;
        letter-spacing: 0.04em;
    }
    .otw-controls input {
        height: 28px;
        border-radius: 6px;
        border: 1px solid #2e456a;
        background: rgba(7, 15, 28, 0.9);
        color: #e1efff;
        padding: 0 7px;
        width: 100%;
        box-sizing: border-box;
    }
    .otw-controls select {
        height: 28px;
        border-radius: 6px;
        border: 1px solid #2e456a;
        background: rgba(7, 15, 28, 0.9);
        color: #e1efff;
        padding: 0 7px;
        width: 100%;
        box-sizing: border-box;
    }
    .otw-action-buttons { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: nowrap; align-items: flex-end; }
    .otw-btn.full { width: 100%; }
    .otw-row.split .otw-btn { flex: 1 1 50%; }
    .otw-status { display: none; }
    .otw-side h4 { margin: 2px 0 10px; font-size: 13px; letter-spacing: 0.04em; color: #92a8c2; }
    .otw-candidate {
        border: 1px solid #2f405c;
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 10px;
        background: rgba(15, 24, 40, 0.75);
        cursor: pointer;
    }
    .otw-candidate.sel { border-color: #19cc66; background: rgba(14, 35, 25, 0.82); }
    .otw-candidate .score { font-size: 12px; color: #7de8a5; font-weight: 700; }
    .otw-candidate .name { font-size: 14px; font-weight: 600; margin-top: 3px; }
    .otw-candidate .pos { font-size: 11px; color: #8ea9c9; margin-top: 4px; }
    .otw-side .spacer { flex: 1; }
    .otw-side .maintenance { padding-top: 10px; }
    .otw-side .maintenance .otw-btn { width: 100%; }
    .otw-side .bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-top: 1px solid #253650; padding-top: 12px; }
    @media (max-width: 1200px) {
        .otw-dialog { grid-template-columns: 1fr; }
        .otw-main { border-right: none; border-bottom: 1px solid #1f2c44; }
        .otw-style-block { min-width: 0; flex-wrap: wrap; }
        .otw-overlay-row { flex-wrap: wrap; }
        .otw-action-buttons { justify-content: flex-start; flex-wrap: wrap; }
        .otw-controls-row.left, .otw-controls-row.center, .otw-controls-row.right, .otw-controls-row.between { justify-content: flex-start; }
        .otw-param-row-wrap { flex-wrap: wrap; }
        .otw-controls-row.end { align-items: stretch; }
        .otw-action-buttons { justify-content: flex-start; }
    }
    `;
    document.head.appendChild(style);
};

const suggestProjection = (): ProjectionParams => {
    // Logic cleared. Returning defaults.
    return {
        sliceMin: 0.5,
        sliceMax: 2.5,
        xRangeMin: -5,
        xRangeMax: 5,
        heightMin: -5,
        heightMax: 5
    };
};

const defaultCombos = (): ComboRuntime[] => {
    return COMBOS.map((item) => ({
        ...item,
        mapRect: { x: 0.14, y: 0.16, w: 0.54, h: 0.58 },
        frontRect: { x: 0.12, y: 0.2, w: 0.58, h: 0.52 }
    }));
};

class OpenTourWizardPanel {
    private events: Events;
    private loadModelFile: (file: File) => Promise<void>;
    private launcherButton: HTMLButtonElement;
    private root: HTMLDivElement;
    private step1LoadBtn: HTMLElement;
    private step2OpenBtn: HTMLButtonElement;
    private step3DownloadBtn: HTMLButtonElement;
    private step3UploadBtn: HTMLButtonElement;
    private summaryMapCanvas: HTMLCanvasElement;
    private summaryMapImage: HTMLImageElement | null = null;
    private summaryFrontCanvas: HTMLCanvasElement;
    private summaryFrontImage: HTMLImageElement | null = null;
    private summaryMapZoom = 1;
    private summaryCalibration: CalibrationRecord | null = null;
    private statusEl: HTMLDivElement;
    private summaryText: HTMLDivElement;
    private modelText: HTMLDivElement;
    private fileInput: HTMLInputElement;
    private uploadInput: HTMLInputElement;
    private modal: HTMLDivElement;
    private combos: ComboRuntime[] = defaultCombos();
    private selectedComboId: AxisComboId | null = null;
    private projection: ProjectionParams = suggestProjection();
    private boundaryConfirmed = false;
    private candidates: Candidate[] = [];
    private selectedCandidateId: string | null = null;
    private currentModelFilename: string | null = null;
    private confirmedCamera: CameraStart | null = null;
    private dragState: DragState = {
        active: false,
        comboId: 'combo-1',
        target: 'map',
        mode: 'none',
        startX: 0,
        startY: 0,
        startRect: { x: 0, y: 0, w: 0, h: 0 },
        startZoom: 1
    };
    private previewViewport: Record<string, PreviewViewport> = {};
    private rasterCache: Record<string, RasterResult> = {};
    private candidateHost: HTMLDivElement;
    private projectionInputs: Record<keyof ProjectionParams, HTMLInputElement>;
    private sampledPoints: SampledPoint[] = [];
    private sampledPointSource = 'unknown';
    private mapStyleInput: HTMLSelectElement;
    private overlayHeatInput: HTMLInputElement;
    private overlayContourInput: HTMLInputElement;
    private overlayGridInput: HTMLInputElement;
    private eyeHeightInput: HTMLInputElement;
    private fovInput: HTMLInputElement;
    private panelDragActive = false;
    private panelDragPointerId = -1;
    private panelDragStartX = 0;
    private panelDragStartY = 0;
    private panelDragBaseLeft = 0;
    private panelDragBaseTop = 0;
    private debugRoot: HTMLDivElement;
    private debugBody: HTMLDivElement | null = null;
    private activeAxisPresetId: RightHandedAxisPresetId = DEFAULT_RIGHT_HANDED_PRESET_ID;
    private lastOverlayProbeAt = 0;
    private lastOverlayProbeKey = '';
    private summaryCalibrationSource: 'none' | 'sqlite' = 'none';

    constructor(events: Events, loadModelFile: (file: File) => Promise<void>, launcherButton: HTMLButtonElement) {
        this.events = events;
        this.loadModelFile = loadModelFile;
        this.launcherButton = launcherButton;
        ensureStyle();
        this.launcherButton.title = 'Model Loader';
        this.launcherButton.setAttribute('aria-label', 'Model Loader');

        this.root = document.createElement('div');
        this.root.id = 'otw-panel';
        this.root.classList.add('hidden');
        this.root.innerHTML = `
            <div class="otw-head">
                <div class="otw-title">Model Loader</div>
                <button class="otw-btn ghost" data-act="toggle">Hide</button>
            </div>
            <div class="otw-card">
                <div class="otw-step-head">
                    <div class="otw-step-badge">1</div>
                    <div class="otw-step">Load</div>
                </div>
                <div class="otw-drop-zone" data-act="load">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <div class="otw-drop-main">Drop .ply file here</div>
                    <div class="otw-drop-sub">or click to browse</div>
                </div>
                <div class="otw-text" data-role="model-text" style="margin-top:8px">未加载模型。</div>
            </div>
            <div class="otw-card">
                <div class="otw-step-head">
                    <div class="otw-step-badge">2</div>
                    <div class="otw-step">Align</div>
                </div>
                <div class="otw-row">
                    <button class="otw-btn primary full" data-act="open-step2" disabled>Intelligent Align</button>
                </div>
            </div>
            <div class="otw-card">
                <div class="otw-step-head">
                    <div class="otw-step-badge">3</div>
                    <div class="otw-step">Share</div>
                </div>
                <div class="otw-row split">
                    <button class="otw-btn" data-act="download" disabled>Download</button>
                    <button class="otw-btn" data-act="upload" disabled>Upload</button>
                </div>
            </div>
            <div class="otw-card">
                <div class="otw-text" data-role="summary-text">未确认组合。</div>
                <div class="otw-summary-row">
                    <div class="otw-summary-panel">
                        <div class="otw-summary-label">2D MAP</div>
                        <canvas class="otw-summary-map" data-summary-canvas="map" width="160" height="130"></canvas>
                    </div>
                    <div class="otw-summary-panel">
                        <div class="otw-summary-label">FRONT VIEW</div>
                        <canvas class="otw-summary-map" data-summary-canvas="front" width="160" height="130"></canvas>
                    </div>
                </div>
                <div class="otw-summary-tools">
                    <div class="otw-summary-zoom">
                        <button class="otw-btn ghost" data-summary="zoom-in">+</button>
                        <button class="otw-btn ghost" data-summary="zoom-out">-</button>
                    </div>
                </div>
            </div>
            <div class="otw-status" data-role="status"></div>
        `;

        this.debugRoot = document.createElement('div');
        this.debugRoot.id = 'otw-debug';
        this.debugRoot.innerHTML = `
            <div class="otw-debug-head">
                <span>Debug Console</span>
                <div class="otw-debug-tools">
                    <div class="otw-debug-actions">
                        <button class="otw-btn ghost" data-debug="toolbar" style="height:20px; font-size:10px;">RT</button>
                        <button class="otw-btn ghost" data-debug="ml" style="height:20px; font-size:10px;">ML</button>
                        <button class="otw-btn ghost" data-debug="tl" style="height:20px; font-size:10px;">TL</button>
                        <button class="otw-btn ghost" data-debug="tp" style="height:20px; font-size:10px;">TP</button>
                        <button class="otw-btn ghost" data-debug="download" style="height:20px; font-size:10px;">DL</button>
                        <button class="otw-btn ghost" data-debug="2d" style="height:20px; font-size:10px;">2D</button>
                        <button class="otw-btn ghost" data-debug="grid" style="height:20px; font-size:10px;">Grid</button>
                    </div>
                    <div class="otw-debug-actions">
                    <button class="otw-btn ghost" data-debug="copy" style="height:20px; font-size:10px;">Copy</button>
                    <button class="otw-btn ghost" data-debug="clear" style="height:20px; font-size:10px;">Clear</button>
                    <button class="otw-btn ghost" data-debug="toggle" style="height:20px; font-size:10px;">▼</button>
                    </div>
                </div>
            </div>
            <div class="otw-debug-body" data-debug="body"></div>
        `;

        this.step1LoadBtn = this.root.querySelector('[data-act="load"]') as HTMLElement;
        this.step2OpenBtn = this.root.querySelector('[data-act="open-step2"]') as HTMLButtonElement;
        this.step3DownloadBtn = this.root.querySelector('[data-act="download"]') as HTMLButtonElement;
        this.step3UploadBtn = this.root.querySelector('[data-act="upload"]') as HTMLButtonElement;
        this.summaryMapCanvas = this.root.querySelector('canvas[data-summary-canvas="map"]') as HTMLCanvasElement;
        this.summaryFrontCanvas = this.root.querySelector('canvas[data-summary-canvas="front"]') as HTMLCanvasElement;
        this.statusEl = this.root.querySelector('[data-role="status"]') as HTMLDivElement;
        this.summaryText = this.root.querySelector('[data-role="summary-text"]') as HTMLDivElement;
        this.modelText = this.root.querySelector('[data-role="model-text"]') as HTMLDivElement;

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.ply,.splat,.sog,.ksplat,.spz,.ssproj';
        this.fileInput.hidden = true;

        this.uploadInput = document.createElement('input');
        this.uploadInput.type = 'file';
        this.uploadInput.accept = 'application/json,.json';
        this.uploadInput.hidden = true;

        this.modal = document.createElement('div');
        this.modal.id = 'otw-modal';
        this.modal.innerHTML = `
            <div class="otw-dialog">
                <button class="otw-btn ghost otw-close-floating" data-modal="close">✕</button>
                <div class="otw-main">
                    <div class="otw-grid" data-role="combo-grid"></div>
                    <div class="otw-controls">
                        <div class="otw-controls-row left">
                            <div class="otw-style-block">
                                <label for="otw-map-style">2D Map Style</label>
                                <select id="otw-map-style">
                                    <option value="navigation">Navigation</option>
                                    <option value="visual" selected>Visual</option>
                                    <option value="color">Color</option>
                                </select>
                                <div class="otw-overlay-row">
                                    <label><input id="otw-overlay-heat" type="checkbox" checked /> Density Heat</label>
                                    <label><input id="otw-overlay-contour" type="checkbox" checked /> Contour</label>
                                    <label><input id="otw-overlay-grid" type="checkbox" checked /> Grid</label>
                                </div>
                            </div>
                        </div>
                        <div class="otw-controls-row center">
                            <div class="otw-param-row-wrap">
                                <div class="otw-param">
                                    <div class="otw-param-name x">X-AXIS</div>
                                    <div class="otw-param-row">
                                        <span class="otw-param-label">Min</span>
                                        <input data-proj="xRangeMin" type="number" min="-99999" max="99999" step="0.1" title="X Min" />
                                        <span class="otw-param-label">Max</span>
                                        <input data-proj="xRangeMax" type="number" min="-99999" max="99999" step="0.1" title="X Max" />
                                    </div>
                                </div>
                                <div class="otw-param">
                                    <div class="otw-param-name y">PLANE-B</div>
                                    <div class="otw-param-row">
                                        <span class="otw-param-label">Min</span>
                                        <input data-proj="heightMin" type="number" min="-99999" max="99999" step="0.1" title="Plane B Min" />
                                        <span class="otw-param-label">Max</span>
                                        <input data-proj="heightMax" type="number" min="-99999" max="99999" step="0.1" title="Plane B Max" />
                                    </div>
                                </div>
                                <div class="otw-param">
                                    <div class="otw-param-name z">SLICE (M)</div>
                                    <div class="otw-param-row">
                                        <span class="otw-param-label">Min</span>
                                        <input data-proj="sliceMin" type="number" min="-99999" max="99999" step="0.1" title="Slice Min (m)" />
                                        <span class="otw-param-label">Max</span>
                                        <input data-proj="sliceMax" type="number" min="-99999" max="99999" step="0.1" title="Slice Max (m)" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="otw-controls-row left end">
                            <div class="otw-param-row-wrap otw-view-param-wrap">
                                <div class="otw-param">
                                    <div class="otw-param-name">EYE HEIGHT (M)</div>
                                    <div class="otw-param-row single">
                                        <input data-role="eye-height" type="number" min="0" max="10" step="0.1" value="1.65" title="Eye Height (m)" />
                                    </div>
                                </div>
                                <div class="otw-param">
                                    <div class="otw-param-name">FOV</div>
                                    <div class="otw-param-row single">
                                        <input data-role="fov" type="number" min="0" max="150" step="1" value="120" title="FOV" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="otw-side">
                    <h4>CANDIDATES</h4>
                    <div data-role="candidate-list"></div>
                    <div class="otw-axis-preset-panel">
                        <div class="otw-axis-preset-title">Right-Handed Axis Presets</div>
                        <div class="otw-axis-preset-grid" data-role="axis-preset-grid"></div>
                    </div>
                    <div class="spacer"></div>
                    <div class="maintenance">
                        <button class="otw-btn warn" data-modal="clear-db">Clear All DB Residuals</button>
                    </div>
                    <div class="bottom">
                        <button class="otw-btn ghost" data-modal="cancel">Cancel</button>
                        <button class="otw-btn primary" data-modal="confirm-apply">Confirm & Apply</button>
                    </div>
                </div>
            </div>
        `;

        this.candidateHost = this.modal.querySelector('[data-role="candidate-list"]') as HTMLDivElement;
        this.projectionInputs = {
            sliceMin: this.modal.querySelector('[data-proj="sliceMin"]') as HTMLInputElement,
            sliceMax: this.modal.querySelector('[data-proj="sliceMax"]') as HTMLInputElement,
            xRangeMin: this.modal.querySelector('[data-proj="xRangeMin"]') as HTMLInputElement,
            xRangeMax: this.modal.querySelector('[data-proj="xRangeMax"]') as HTMLInputElement,
            heightMin: this.modal.querySelector('[data-proj="heightMin"]') as HTMLInputElement,
            heightMax: this.modal.querySelector('[data-proj="heightMax"]') as HTMLInputElement
        };
        this.mapStyleInput = this.modal.querySelector('#otw-map-style') as HTMLSelectElement;
        this.overlayHeatInput = this.modal.querySelector('#otw-overlay-heat') as HTMLInputElement;
        this.overlayContourInput = this.modal.querySelector('#otw-overlay-contour') as HTMLInputElement;
        this.overlayGridInput = this.modal.querySelector('#otw-overlay-grid') as HTMLInputElement;
        this.eyeHeightInput = this.modal.querySelector('[data-role="eye-height"]') as HTMLInputElement;
        this.fovInput = this.modal.querySelector('[data-role="fov"]') as HTMLInputElement;
        this.debugBody = this.debugRoot.querySelector('[data-debug="body"]');

        this.renderAxisPresetButtons();

        document.body.appendChild(this.root);
        document.body.appendChild(this.fileInput);
        document.body.appendChild(this.uploadInput);
        document.body.appendChild(this.modal);
        document.body.appendChild(this.debugRoot);

        this.bind();
        this.bindDebug();
        this.syncProjectionInputs();
        this.renderSummaryMap();
        this.setStatus('默认折叠。点击左侧第一个工具按钮打开向导。');
    }

    private debugLog(action: string, detail?: any) {
        if (!this.debugBody) return;
        const row = document.createElement('div');
        row.className = 'otw-debug-row';
        const time = new Date().toLocaleTimeString();
        const json = detail ? ` ${JSON.stringify(detail)}` : '';
        row.innerHTML = `<span class="otw-debug-time">[${time}]</span><strong>${action}</strong>${json}`;
        this.debugBody.appendChild(row);
        this.debugBody.scrollTop = this.debugBody.scrollHeight;
    }

    private bindDebug() {
        const copyBtn = this.debugRoot.querySelector('[data-debug="copy"]') as HTMLButtonElement | null;
        const clearBtn = this.debugRoot.querySelector('[data-debug="clear"]');
        const toggleBtn = this.debugRoot.querySelector('[data-debug="toggle"]');
        const toolbarBtn = this.debugRoot.querySelector('[data-debug="toolbar"]');
        const mlBtn = this.debugRoot.querySelector('[data-debug="ml"]');
        const tlBtn = this.debugRoot.querySelector('[data-debug="tl"]');
        const tpBtn = this.debugRoot.querySelector('[data-debug="tp"]');
        const downloadBtn = this.debugRoot.querySelector('[data-debug="download"]');
        const step3Btn = this.debugRoot.querySelector('[data-debug="2d"]');
        const gridBtn = this.debugRoot.querySelector('[data-debug="grid"]');
        const body = this.debugRoot.querySelector('[data-debug="body"]');
        copyBtn?.addEventListener('click', async () => {
            const text = this.debugBody?.innerText?.trim() ?? '';
            if (!text) {
                this.setStatus('Debug 为空，无可复制内容。');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                this.setStatus('Debug 已复制到剪贴板。');
            } catch {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                try {
                    document.execCommand('copy');
                    this.setStatus('Debug 已复制到剪贴板。');
                } finally {
                    ta.remove();
                }
            }
        });
        clearBtn?.addEventListener('click', () => {
            if (this.debugBody) this.debugBody.innerHTML = '';
        });
        toolbarBtn?.addEventListener('click', () => this.events.fire('opentour.toolbar.toggle'));
        mlBtn?.addEventListener('click', () => this.events.fire('opentour.open.modelLoader'));
        tlBtn?.addEventListener('click', () => this.events.fire('opentour.open.tourLoader'));
        tpBtn?.addEventListener('click', () => this.events.fire('opentour.open.tourPlayer'));
        downloadBtn?.addEventListener('click', () => this.events.fire('opentour.open.tourDownload'));
        step3Btn?.addEventListener('click', () => this.events.fire('opentour.open.step3'));
        gridBtn?.addEventListener('click', () => this.events.fire('opentour.toggle.grid'));
        toggleBtn?.addEventListener('click', () => {
            body?.classList.toggle('collapsed');
            if (toggleBtn) toggleBtn.textContent = body?.classList.contains('collapsed') ? '▶' : '▼';
        });
    }

    private bind() {
        const panelHead = this.root.querySelector('.otw-head') as HTMLDivElement;
        panelHead.addEventListener('pointerdown', (event) => {
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
            panelHead.setPointerCapture(event.pointerId);
        });
        panelHead.addEventListener('pointermove', (event) => {
            if (!this.panelDragActive || event.pointerId !== this.panelDragPointerId) return;
            const dx = event.clientX - this.panelDragStartX;
            const dy = event.clientY - this.panelDragStartY;
            const rect = this.root.getBoundingClientRect();
            const maxLeft = Math.max(0, window.innerWidth - rect.width);
            const maxTop = Math.max(0, window.innerHeight - rect.height);
            const left = clamp(this.panelDragBaseLeft + dx, 0, maxLeft);
            const top = clamp(this.panelDragBaseTop + dy, 0, maxTop);
            this.root.style.left = `${left}px`;
            this.root.style.top = `${top}px`;
        });
        const endPanelDrag = (event: PointerEvent) => {
            if (!this.panelDragActive || event.pointerId !== this.panelDragPointerId) return;
            this.panelDragActive = false;
            this.panelDragPointerId = -1;
            try {
                panelHead.releasePointerCapture(event.pointerId);
            } catch {
            }
        };
        panelHead.addEventListener('pointerup', endPanelDrag);
        panelHead.addEventListener('pointercancel', endPanelDrag);

        (this.root.querySelector('[data-act="toggle"]') as HTMLButtonElement).addEventListener('click', () => {
            this.root.classList.add('hidden');
        });

        this.step1LoadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', () => {
            this.onLoadModel().catch((error) => this.setStatus(`加载失败: ${String(error)}`));
        });

        this.step2OpenBtn.addEventListener('click', async () => {
            this.debugLog('Intelligent Align (AI Reco)', { sampledPoints: this.sampledPoints.length });
            const modelFilename = this.currentModelFilename;
            if (this.sampledPoints.length < 500) {
                await this.ensureSampledPointsReady('open-modal', modelFilename);
            }
            if ((this.currentModelFilename ?? null) !== (modelFilename ?? null)) return;
            this.openModal();
        });

        this.step3DownloadBtn.addEventListener('click', () => {
            this.downloadSnapshot().catch((error) => this.setStatus(`Download失败: ${String(error)}`));
        });
        this.step3UploadBtn.addEventListener('click', () => this.uploadInput.click());
        this.uploadInput.addEventListener('change', () => {
            this.uploadSnapshot().catch((error) => this.setStatus(`Upload失败: ${String(error)}`));
        });

        this.modal.addEventListener('click', (event) => {
            if (event.target === this.modal) this.closeModal();
        });

        (this.modal.querySelector('[data-modal="close"]') as HTMLButtonElement).addEventListener('click', () => this.closeModal());
        (this.modal.querySelector('[data-modal="cancel"]') as HTMLButtonElement).addEventListener('click', () => this.closeModal());
        (this.modal.querySelector('[data-modal="clear-db"]') as HTMLButtonElement).addEventListener('click', async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            if (button.disabled) return;
            const confirmed = window.confirm('将清空 OpenTour 数据库中的所有残值（校准、坐标、快照）。该操作不可恢复，是否继续？');
            if (!confirmed) return;
            const label = button.textContent || 'Clear All DB Residuals';
            button.disabled = true;
            button.textContent = 'Clearing...';
            try {
                const result = await this.clearAllCalibrationResidualsFromDb();
                this.clearSummaryCalibrationRuntime();
                this.setStatus(
                    `数据库已清空：calibration=${result.deleted?.calibrations ?? 0}, coordinate=${result.deleted?.coordinates ?? 0}, snapshot=${result.deleted?.snapshots ?? 0}, model=${result.deleted?.models ?? 0}`
                );
                this.debugLog('DB Clear All [Done]', result);
            } catch (error) {
                this.debugLog('DB Clear All [Failed]', { error: String(error) });
                this.setStatus(`清空数据库失败: ${String(error)}`);
            } finally {
                button.disabled = false;
                button.textContent = label;
            }
        });
        (this.modal.querySelector('[data-modal="confirm-apply"]') as HTMLButtonElement).addEventListener('click', async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            if (button.disabled) return;
            const label = button.textContent || 'Confirm & Apply';
            button.disabled = true;
            button.textContent = 'Saving...';
            try {
                await this.confirmStep2();
            } catch (error) {
                this.debugLog('Confirm Apply [Failed]', { error: String(error) });
                this.setStatus(`保存失败: ${String(error)}`);
                alert(`保存失败: ${String(error)}`);
            } finally {
                button.disabled = false;
                button.textContent = label;
            }
        });

        Object.values(this.projectionInputs).forEach((input) => {
            input.addEventListener('change', () => {
                this.boundaryConfirmed = false;
            });
            input.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (!this.selectedComboId) return;
                this.pullProjectionFromInputs();
                const combo = this.combos.find((c) => c.id === this.selectedComboId);
                if (!combo) return;
                const card = this.modal.querySelector(`[data-combo-id="${combo.id}"]`) as HTMLDivElement;
                if (!card) return;
                await this.recomputeSelectedCombo(card, combo, false);
            });
        });

        [this.eyeHeightInput, this.fovInput].forEach((input) => {
            input.addEventListener('change', () => {
                this.boundaryConfirmed = false;
            });
        });

        this.mapStyleInput.addEventListener('change', () => {
            this.redrawAllComboCanvases();
        });
        [this.overlayHeatInput, this.overlayContourInput, this.overlayGridInput].forEach((input) => {
            input.addEventListener('change', () => {
                this.redrawAllComboCanvases();
            });
        });

        (this.root.querySelector('[data-summary="zoom-in"]') as HTMLButtonElement).addEventListener('click', () => {
            this.summaryMapZoom = clamp(this.summaryMapZoom * 1.2, 0.8, 6);
            this.renderSummaryMap();
        });
        (this.root.querySelector('[data-summary="zoom-out"]') as HTMLButtonElement).addEventListener('click', () => {
            this.summaryMapZoom = clamp(this.summaryMapZoom / 1.2, 0.8, 6);
            this.renderSummaryMap();
        });

        this.events.on('prerender', () => {
            if (this.summaryCalibration) this.renderSummaryMap();
        });

        window.addEventListener('pointermove', (event) => this.onDragMove(event));
        window.addEventListener('pointerup', () => {
            this.dragState.active = false;
        });
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private resetRuntimeState() {
        this.combos = defaultCombos();
        this.selectedComboId = null;
        this.projection = suggestProjection();
        this.boundaryConfirmed = false;
        this.candidates = [];
        this.selectedCandidateId = null;
        this.confirmedCamera = null;
        this.summaryMapImage = null;
        this.summaryFrontImage = null;
        this.summaryCalibration = null;
        this.summaryCalibrationSource = 'none';
        this.sampledPoints = [];
        this.sampledPointSource = 'unknown';
        this.rasterCache = {};
        this.previewViewport = {};
        this.lastOverlayProbeAt = 0;
        this.lastOverlayProbeKey = '';
        this.activeAxisPresetId = DEFAULT_RIGHT_HANDED_PRESET_ID;
        this.summaryText.textContent = '未确认组合。';
        this.syncProjectionInputs();
        this.renderAxisPresetButtons();
        this.renderCandidates();
        this.renderSummaryMap();
    }

    private async parsePlyPointsFromFile(file: File): Promise<SampledPoint[]> {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let marker = -1;
        for (let i = 0; i < bytes.length - 10; i++) {
            if (
                bytes[i] === 101 && bytes[i + 1] === 110 && bytes[i + 2] === 100 && bytes[i + 3] === 95 &&
                bytes[i + 4] === 104 && bytes[i + 5] === 101 && bytes[i + 6] === 97 && bytes[i + 7] === 100 &&
                bytes[i + 8] === 101 && bytes[i + 9] === 114
            ) {
                marker = i;
                break;
            }
        }
        let headerEnd = -1;
        if (marker >= 0) {
            // 'end_header' length is 10
            headerEnd = marker + 10;
            if (bytes[headerEnd] === 13 && bytes[headerEnd + 1] === 10) {
                headerEnd += 2;
            } else if (bytes[headerEnd] === 10) {
                headerEnd += 1;
            }
        }
        if (headerEnd < 0) return [];

        const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
        const lines = headerText.split(/\r?\n/);
        const formatLine = lines.find((l) => l.startsWith('format ')) || '';
        const isAscii = formatLine.includes('ascii');
        const vertexLine = lines.find((l) => l.startsWith('element vertex ')) || '';
        const vertexCount = Number(vertexLine.split(/\s+/)[2] || 0);
        if (!Number.isFinite(vertexCount) || vertexCount <= 0) return [];

        const props: Array<{ name: string; type: string }> = [];
        const chunkProps: Array<{ name: string; type: string }> = [];
        let inVertex = false;
        let inChunk = false;
        for (const line of lines) {
            if (line.startsWith('element ')) {
                inVertex = line.startsWith('element vertex ');
                inChunk = line.startsWith('element chunk ');
                continue;
            }
            if (!inVertex && !inChunk) continue;
            if (line.startsWith('property list')) continue;
            if (line.startsWith('property ')) {
                const seg = line.trim().split(/\s+/);
                if (seg.length >= 3) {
                    if (inVertex) props.push({ type: seg[1], name: seg[2] });
                    if (inChunk) chunkProps.push({ type: seg[1], name: seg[2] });
                }
            }
        }
        if (props.length === 0) return [];

        const chunkLine = lines.find((l) => l.startsWith('element chunk ')) || '';
        const chunkCount = Number(chunkLine.split(/\s+/)[2] || 0);

        const idx = {
            x: props.findIndex((p) => p.name === 'x' || p.name === 'means_0' || p.name === 'position_x'),
            y: props.findIndex((p) => p.name === 'y' || p.name === 'means_1' || p.name === 'position_y'),
            z: props.findIndex((p) => p.name === 'z' || p.name === 'means_2' || p.name === 'position_z'),
            opacity: props.findIndex((p) => p.name === 'opacity' || p.name === 'alpha'),
            state: props.findIndex((p) => p.name === 'state'),
            r: props.findIndex((p) => p.name === 'f_dc_0' || p.name === 'red' || p.name === 'r'),
            g: props.findIndex((p) => p.name === 'f_dc_1' || p.name === 'green' || p.name === 'g'),
            b: props.findIndex((p) => p.name === 'f_dc_2' || p.name === 'blue' || p.name === 'b')
        };
        const packedIdx = {
            position: props.findIndex((p) => p.name === 'packed_position'),
            rotation: props.findIndex((p) => p.name === 'packed_rotation'),
            scale: props.findIndex((p) => p.name === 'packed_scale'),
            color: props.findIndex((p) => p.name === 'packed_color')
        };
        const hasPlainPosition = idx.x >= 0 && idx.y >= 0 && idx.z >= 0;
        const hasPackedPosition = packedIdx.position >= 0 && chunkCount > 0 && chunkProps.length > 0;
        if (!hasPlainPosition && !hasPackedPosition) return [];

        const points: SampledPoint[] = [];
        // 40 K samples is enough for the 420×180 preview canvases while
        // keeping synchronous rendering fast (8 canvases rendered on open).
        const target = 40000;
        const step = Math.max(1, Math.floor(vertexCount / target));

        if (isAscii) {
            const body = new TextDecoder().decode(bytes.slice(headerEnd));
            const rows = body.split(/\r?\n/);
            let vi = 0;
            for (let i = 0; i < rows.length && vi < vertexCount; i++, vi++) {
                if (vi % step !== 0) continue;
                const row = rows[i].trim();
                if (!row) continue;
                const seg = row.split(/\s+/);
                const x = Number(seg[idx.x]);
                const y = Number(seg[idx.y]);
                const z = Number(seg[idx.z]);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
                if (idx.state >= 0 && Number(seg[idx.state]) !== 0) continue;
                const opRaw = idx.opacity >= 0 ? Number(seg[idx.opacity]) : 1;
                const opacity = idx.opacity >= 0 ? 1 / (1 + Math.exp(-opRaw)) : 1;
                if (opacity < 0.1) continue;
                const hasColor = idx.r >= 0 && idx.g >= 0 && idx.b >= 0;
                const rawR = hasColor ? Number(seg[idx.r]) : 0;
                const rawG = hasColor ? Number(seg[idx.g]) : 0;
                const rawB = hasColor ? Number(seg[idx.b]) : 0;
                const useDc = hasColor && props[idx.r].name.startsWith('f_dc_');
                points.push({
                    x, y, z,
                    opacity,
                    r: useDc ? clamp(rawR * 255 + 128, 0, 255) : clamp(rawR, 0, 255),
                    g: useDc ? clamp(rawG * 255 + 128, 0, 255) : clamp(rawG, 0, 255),
                    b: useDc ? clamp(rawB * 255 + 128, 0, 255) : clamp(rawB, 0, 255),
                    hasColor
                });
            }
            return points;
        }

        const view = new DataView(buffer, headerEnd);
        const chunkStride = chunkProps.reduce((acc, p) => acc + (TYPE_SIZE[p.type] || 4), 0);
        const chunkOffsets: number[] = [];
        let chunkRun = 0;
        chunkProps.forEach((p) => {
            chunkOffsets.push(chunkRun);
            chunkRun += TYPE_SIZE[p.type] || 4;
        });

        const stride = props.reduce((acc, p) => acc + (TYPE_SIZE[p.type] || 4), 0);
        const propOffsets: number[] = [];
        let run = 0;
        props.forEach((p) => {
            propOffsets.push(run);
            run += TYPE_SIZE[p.type] || 4;
        });

        const chunkPropIndex = (name: string) => chunkProps.findIndex((p) => p.name === name);

        const chunkMinX = chunkPropIndex('min_x');
        const chunkMinY = chunkPropIndex('min_y');
        const chunkMinZ = chunkPropIndex('min_z');
        const chunkMaxX = chunkPropIndex('max_x');
        const chunkMaxY = chunkPropIndex('max_y');
        const chunkMaxZ = chunkPropIndex('max_z');
        const chunkMinR = chunkPropIndex('min_r');
        const chunkMinG = chunkPropIndex('min_g');
        const chunkMinB = chunkPropIndex('min_b');
        const chunkMaxR = chunkPropIndex('max_r');
        const chunkMaxG = chunkPropIndex('max_g');
        const chunkMaxB = chunkPropIndex('max_b');

        const chunkTableBytes = Math.max(0, chunkCount) * chunkStride;
        const vertexBaseOffset = chunkTableBytes;

        if (!hasPlainPosition && hasPackedPosition) {
            type ChunkBounds = {
                minX: number;
                minY: number;
                minZ: number;
                maxX: number;
                maxY: number;
                maxZ: number;
                minR: number;
                minG: number;
                minB: number;
                maxR: number;
                maxG: number;
                maxB: number;
            };
            const chunks: ChunkBounds[] = [];
            for (let ci = 0; ci < chunkCount; ci++) {
                const base = ci * chunkStride;
                if (base + chunkStride > view.byteLength) break;
                const readChunk = (propIdx: number) => propIdx >= 0
                    ? Number(readNumber(view, base + chunkOffsets[propIdx], chunkProps[propIdx].type))
                    : 0;
                chunks.push({
                    minX: readChunk(chunkMinX),
                    minY: readChunk(chunkMinY),
                    minZ: readChunk(chunkMinZ),
                    maxX: readChunk(chunkMaxX),
                    maxY: readChunk(chunkMaxY),
                    maxZ: readChunk(chunkMaxZ),
                    minR: readChunk(chunkMinR),
                    minG: readChunk(chunkMinG),
                    minB: readChunk(chunkMinB),
                    maxR: readChunk(chunkMaxR),
                    maxG: readChunk(chunkMaxG),
                    maxB: readChunk(chunkMaxB)
                });
            }

            const unpackUnorm = (value: number, bits: number) => value / ((1 << bits) - 1);
            for (let vi = 0; vi < vertexCount; vi++) {
                if (vi % step !== 0) continue;
                const base = vertexBaseOffset + vi * stride;
                if (base + stride > view.byteLength) break;

                const packedPos = Number(readNumber(view, base + propOffsets[packedIdx.position], props[packedIdx.position].type));
                const packedColor = packedIdx.color >= 0
                    ? Number(readNumber(view, base + propOffsets[packedIdx.color], props[packedIdx.color].type))
                    : 0;
                const chunk = chunks[Math.floor(vi / 256)];
                if (!chunk) continue;

                const px = (packedPos >>> 21) & 0x7ff;
                const py = (packedPos >>> 11) & 0x3ff;
                const pz = packedPos & 0x7ff;

                const nx = unpackUnorm(px, 11);
                const ny = unpackUnorm(py, 10);
                const nz = unpackUnorm(pz, 11);

                const x = chunk.minX + nx * (chunk.maxX - chunk.minX);
                const y = chunk.minY + ny * (chunk.maxY - chunk.minY);
                const z = chunk.minZ + nz * (chunk.maxZ - chunk.minZ);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
                if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6 || Math.abs(z) > 1e6) continue;

                const a = packedColor & 0xff;
                const opacity = a / 255;
                if (opacity < 0.1) continue;

                const rc = (packedColor >>> 24) & 0xff;
                const gc = (packedColor >>> 16) & 0xff;
                const bc = (packedColor >>> 8) & 0xff;
                const nr = rc / 255;
                const ng = gc / 255;
                const nb = bc / 255;
                const rr = clamp((chunk.minR + nr * (chunk.maxR - chunk.minR)) * 255, 0, 255);
                const gg = clamp((chunk.minG + ng * (chunk.maxG - chunk.minG)) * 255, 0, 255);
                const bb = clamp((chunk.minB + nb * (chunk.maxB - chunk.minB)) * 255, 0, 255);

                points.push({ x, y, z, opacity, r: rr, g: gg, b: bb, hasColor: true });
            }
            return points;
        }

        for (let vi = 0; vi < vertexCount; vi++) {
            if (vi % step !== 0) continue;
            const base = vertexBaseOffset + vi * stride;
            if (base + stride > view.byteLength) break;
            const x = Number(readNumber(view, base + propOffsets[idx.x], props[idx.x].type));
            const y = Number(readNumber(view, base + propOffsets[idx.y], props[idx.y].type));
            const z = Number(readNumber(view, base + propOffsets[idx.z], props[idx.z].type));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6 || Math.abs(z) > 1e6) continue;
            if (idx.state >= 0) {
                const s = Number(readNumber(view, base + propOffsets[idx.state], props[idx.state].type));
                if (s !== 0) continue;
            }
            const opRaw = idx.opacity >= 0 ? Number(readNumber(view, base + propOffsets[idx.opacity], props[idx.opacity].type)) : 1;
            const opacity = idx.opacity >= 0 ? 1 / (1 + Math.exp(-opRaw)) : 1;
            if (opacity < 0.1) continue;
            const hasColor = idx.r >= 0 && idx.g >= 0 && idx.b >= 0;
            let rr = 0;
            let gg = 0;
            let bb = 0;
            if (hasColor) {
                rr = Number(readNumber(view, base + propOffsets[idx.r], props[idx.r].type));
                gg = Number(readNumber(view, base + propOffsets[idx.g], props[idx.g].type));
                bb = Number(readNumber(view, base + propOffsets[idx.b], props[idx.b].type));
                const useDc = props[idx.r].name.startsWith('f_dc_');
                rr = useDc ? clamp(rr * 255 + 128, 0, 255) : clamp(rr, 0, 255);
                gg = useDc ? clamp(gg * 255 + 128, 0, 255) : clamp(gg, 0, 255);
                bb = useDc ? clamp(bb * 255 + 128, 0, 255) : clamp(bb, 0, 255);
            }
            points.push({ x, y, z, opacity, r: rr, g: gg, b: bb, hasColor });
        }
        return points;
    }

    private extractModelPoints(): number {
        const scene = getSceneInstance();
        const events = getEventsInstance();
        const points: SampledPoint[] = [];
        const pushPoint = (x: number, y: number, z: number, opacity = 1, r = 0, g = 0, b = 0, hasColor = false) => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
            points.push({ x, y, z, opacity: clamp(opacity, 0, 1), r, g, b, hasColor });
        };

        let splats: any[] = [];
        try {
            splats = events?.invoke?.('scene.allSplats') || [];
            if ((!splats || splats.length === 0) && scene?.getElementsByType) {
                splats = scene.getElementsByType(ElementType.splat) || [];
            }
        } catch {
            splats = [];
        }

        splats.forEach((splat) => {
            const splatData = splat?.splatData;
            if (splatData && typeof splatData.getProp === 'function') {
                const px = splatData.getProp('x') || splatData.getProp('position_x') || splatData.getProp('means_0');
                const py = splatData.getProp('y') || splatData.getProp('position_y') || splatData.getProp('means_1');
                const pz = splatData.getProp('z') || splatData.getProp('position_z') || splatData.getProp('means_2');
                const opRaw = splatData.getProp('opacity') || splatData.getProp('alpha');
                const state = splatData.getProp('state');
                const r = splatData.getProp('f_dc_0');
                const g = splatData.getProp('f_dc_1');
                const b = splatData.getProp('f_dc_2');
                const world = splat?.worldTransform;
                const wp = new Vec3();
                if (px?.length && py?.length && pz?.length) {
                    const step = Math.max(1, Math.floor(px.length / 22000));
                    for (let i = 0; i < px.length; i += step) {
                        if (state && state[i] !== 0) continue;
                        let op = 1;
                        if (opRaw) {
                            const v = Number(opRaw[i]);
                            op = 1 / (1 + Math.exp(-v));
                        }
                        if (op < 0.1) continue;

                        wp.set(Number(px[i]), Number(py[i]), Number(pz[i]));
                        if (world?.transformPoint) {
                            world.transformPoint(wp, wp);
                        }

                        if (r && g && b) {
                            pushPoint(
                                wp.x,
                                wp.y,
                                wp.z,
                                op,
                                clamp(Number(r[i]) * 255 + 128, 0, 255),
                                clamp(Number(g[i]) * 255 + 128, 0, 255),
                                clamp(Number(b[i]) * 255 + 128, 0, 255),
                                true
                            );
                        } else {
                            pushPoint(wp.x, wp.y, wp.z, op, 0, 0, 0, false);
                        }
                    }
                }
            }
            const entity = splat?.entity;
            if (entity?.getPosition) {
                const p = entity.getPosition();
                pushPoint(p.x, p.y, p.z, 0.4, 0, 0, 0, false);
            } else if (entity?.getLocalPosition) {
                const p = entity.getLocalPosition();
                pushPoint(p.x, p.y, p.z, 0.4, 0, 0, 0, false);
            }
        });

        if (points.length > 400) {
            this.sampledPoints = points;
            this.sampledPointSource = 'scene-splats';
            return this.sampledPoints.length;
        }

        const bound = scene?.bound;
        if (!bound?.center || !bound?.halfExtents) {
            this.sampledPoints = points;
            this.sampledPointSource = points.length > 0 ? 'scene-splats-partial' : 'no-source';
            return this.sampledPoints.length;
        }
        this.sampledPoints = points;
        this.sampledPointSource = points.length > 0 ? 'scene-splats-partial' : 'no-source';
        return this.sampledPoints.length;
    }

    private async ensureSampledPointsReady(reason: string, modelFilename?: string): Promise<boolean> {
        const expectedModel = modelFilename ?? this.currentModelFilename;
        if (this.sampledPoints.length >= 500) return true;
        for (let attempt = 0; attempt < 40; attempt++) {
            if ((expectedModel ?? null) !== (this.currentModelFilename ?? null)) {
                this.debugLog('Sampling Dropped', {
                    reason,
                    expectedModel,
                    currentModel: this.currentModelFilename,
                    attempt: attempt + 1
                });
                return false;
            }
            const scene = getSceneInstance();
            let sceneSplats = 0;
            try {
                sceneSplats = scene?.getElementsByType?.(ElementType.splat)?.length || 0;
            } catch {
                sceneSplats = 0;
            }
            const count = this.extractModelPoints();
            this.debugLog('Sampling Probe', {
                reason,
                attempt: attempt + 1,
                sceneSplats,
                sampledPoints: count,
                sampledPointSource: this.sampledPointSource
            });
            if (count >= 500) return true;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        this.debugLog('Sampling HardFail', {
            reason,
            sampledPoints: this.sampledPoints.length,
            sampledPointSource: this.sampledPointSource,
            message: 'No valid model points available. Load a model first or wait for scene splats to be ready.',
            modelFilename: expectedModel
        });
        return false;
    }

    private async onLoadModel() {
        const file = this.fileInput.files?.[0];
        if (!file) return;
        const modelFilename = file.name;
        this.setStatus('正在加载模型...');
        this.resetRuntimeState();
        this.currentModelFilename = modelFilename;
        this.modelText.textContent = `当前模型: ${modelFilename}`;
        this.events.fire('opentour.axisPreset.apply', this.activeAxisPresetId);
        this.debugLog('Model Load Start', {
            modelFilename,
            axisPreset: this.activeAxisPresetId
        });

        try {
            const parsed = await this.parsePlyPointsFromFile(file);
            if ((this.currentModelFilename ?? null) !== modelFilename) return;
            this.debugLog('PLY Parse', {
                file: modelFilename,
                parsedPoints: parsed.length
            });
            if (parsed.length > 500) {
                this.sampledPoints = parsed;
                this.sampledPointSource = 'ply-parse';
            }
        } catch {
        }

        await this.loadModelFile(file);
        if ((this.currentModelFilename ?? null) !== modelFilename) return;
        if (this.sampledPoints.length < 500) {
            await this.ensureSampledPointsReady('onLoadModel', modelFilename);
        }
        if ((this.currentModelFilename ?? null) !== modelFilename) return;
        if (this.sampledPoints.length < 500) {
            this.debugLog('Sampling Warning', {
                model: modelFilename,
                sampledPoints: this.sampledPoints.length,
                sampledPointSource: this.sampledPointSource,
                reason: 'No reliable splat points extracted; 2D map quality may be poor.'
            });
        }

        let calibration: CalibrationRecord | null = null;
        try {
            calibration = await this.getCalibrationFromDb(modelFilename);
        } catch (error) {
            this.debugLog('Model Calibration Restore Warning', {
                modelFilename,
                error: String(error)
            });
        }
        if ((this.currentModelFilename ?? null) !== modelFilename) return;
        if (calibration?.axisPresetId) {
            const presetId = calibration.axisPresetId as RightHandedAxisPresetId;
            if (RIGHT_HANDED_AXIS_PRESETS.some((preset) => preset.id === presetId)) {
                this.activeAxisPresetId = presetId;
                this.events.fire('opentour.axisPreset.apply', presetId);
                this.renderAxisPresetButtons();
            }
        }
        if (calibration) {
            this.applyCalibrationToSummary(calibration, 'sqlite');
            this.debugLog('Model Calibration Restored', {
                modelFilename,
                source: 'sqlite',
                axisPresetId: calibration.axisPresetId || null,
                viewRange: calibration.viewRange || null
            });
        }

        const restored = await this.fetchFullSnapshot(modelFilename);
        if ((this.currentModelFilename ?? null) !== modelFilename) return;
        if (restored) {
            this.applySnapshot(restored);
            this.setStatus('Step1完成：已恢复该模型上次确认结果。请按需打开Step2继续。');
        } else {
            this.setStatus(calibration ? 'Step1完成：已从SQLite恢复确认参数。' : 'Step1完成，请打开组合弹窗完成Step2。');
        }
        this.step2OpenBtn.disabled = false;
        this.step3DownloadBtn.disabled = false;
        this.step3UploadBtn.disabled = false;
        this.debugLog('Model Load Ready', {
            modelFilename,
            sampledPoints: this.sampledPoints.length,
            sampledPointSource: this.sampledPointSource,
            axisPreset: this.activeAxisPresetId,
            hasCalibration: Boolean(calibration)
        });
        this.fileInput.value = '';
    }

    private openModal() {
        this.modal.classList.add('visible');
        this.syncProjectionInputs();
        this.renderComboCards();
        this.renderCandidates();
    }

    private closeModal() {
        this.modal.classList.remove('visible');
    }

    private renderComboCards() {
        const grid = this.modal.querySelector('[data-role="combo-grid"]') as HTMLDivElement;
        grid.innerHTML = '';
        this.combos.forEach((combo) => {
            combo.frontRect.x = combo.mapRect.x;
            combo.frontRect.w = combo.mapRect.w;
            const tags = this.getComboPlaneTags(combo.id);
            const card = document.createElement('div');
            card.className = `otw-combo${this.selectedComboId === combo.id ? ' sel' : ''}`;
            card.dataset.comboId = combo.id;
            card.innerHTML = `
                <div class="otw-combo-title">${combo.title}</div>
                <button class="otw-combo-refresh" type="button" title="Regenerate this combo">↻</button>
                <div class="otw-preview" data-target="map">
                    <div class="otw-tag">${tags.verticalLabel}</div>
                    <canvas width="420" height="210"></canvas>
                    <div class="otw-zoom">
                        <button class="otw-zoom-btn" data-zoom-target="map" data-zoom="in" type="button">+</button>
                        <button class="otw-zoom-btn" data-zoom-target="map" data-zoom="out" type="button">-</button>
                        <button class="otw-zoom-btn" data-zoom-target="map" data-zoom="center" type="button">◎</button>
                    </div>
                </div>
                <div class="otw-preview" data-target="front">
                    <div class="otw-tag">${tags.frontLabel}</div>
                    <canvas width="420" height="210"></canvas>
                    <div class="otw-zoom">
                        <button class="otw-zoom-btn" data-zoom-target="front" data-zoom="in" type="button">+</button>
                        <button class="otw-zoom-btn" data-zoom-target="front" data-zoom="out" type="button">-</button>
                        <button class="otw-zoom-btn" data-zoom-target="front" data-zoom="center" type="button">◎</button>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                this.selectedComboId = combo.id;
                this.boundaryConfirmed = false;
                this.renderComboCards();
            });

            const mapCanvas = card.querySelector('[data-target="map"] canvas') as HTMLCanvasElement;
            const frontCanvas = card.querySelector('[data-target="front"] canvas') as HTMLCanvasElement;
            this.drawPreviewCanvas(mapCanvas, combo.mapRect, '#ff4d4d', combo.id, 'map', this.getCachedOrBlankRaster(combo.id, 'map', mapCanvas.width, mapCanvas.height));
            this.drawPreviewCanvas(frontCanvas, combo.frontRect, '#20d463', combo.id, 'front', this.getCachedOrBlankRaster(combo.id, 'front', frontCanvas.width, frontCanvas.height));
            const refreshBtn = card.querySelector('.otw-combo-refresh') as HTMLButtonElement;
            refreshBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                await this.fullRegenerateComboCard(card, combo);
            });
            card.querySelectorAll('.otw-zoom-btn').forEach((btn) => {
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const el = btn as HTMLButtonElement;
                    const t = (el.dataset.zoomTarget as 'map' | 'front') || 'map';
                    const action = el.dataset.zoom || 'in';
                    const canvas = t === 'map' ? mapCanvas : frontCanvas;
                    if (action === 'center') {
                        this.centerPreviewOnRect(combo.id, t, canvas);
                    } else {
                        const dir = action === 'in' ? 1 : -1;
                        this.adjustPreviewZoom(combo.id, t, dir, canvas);
                    }
                });
            });
            mapCanvas.addEventListener('pointerdown', (event) => this.onDragStart(event, combo.id, 'map', mapCanvas));
            frontCanvas.addEventListener('pointerdown', (event) => this.onDragStart(event, combo.id, 'front', frontCanvas));
            grid.appendChild(card);
        });
    }

    private redrawAllComboCanvases() {
        this.renderComboCards();
    }

    private redrawComboCanvases(comboId: AxisComboId) {
        const combo = this.combos.find((c) => c.id === comboId);
        if (!combo) return;
        const card = this.modal.querySelector(`[data-combo-id="${combo.id}"]`) as HTMLDivElement;
        if (!card) return;
        this.regenerateComboCard(card, combo);
    }

    private regenerateComboCard(card: HTMLDivElement, combo: ComboRuntime) {
        const mapCanvas = card.querySelector('[data-target="map"] canvas') as HTMLCanvasElement;
        const frontCanvas = card.querySelector('[data-target="front"] canvas') as HTMLCanvasElement;
        if (mapCanvas) this.drawPreviewCanvas(
            mapCanvas,
            combo.mapRect,
            '#ff4d4d',
            combo.id,
            'map',
            this.getCachedOrBlankRaster(combo.id, 'map', mapCanvas.width, mapCanvas.height)
        );
        if (frontCanvas) this.drawPreviewCanvas(
            frontCanvas,
            combo.frontRect,
            '#20d463',
            combo.id,
            'front',
            this.getCachedOrBlankRaster(combo.id, 'front', frontCanvas.width, frontCanvas.height)
        );
    }

    /**
     * Refresh Card Quality Pipeline
     *
     * Implementation tag: OT-Refresh2DFront-QualityPipeline
     * Version: 1.0.0
     * Implemented by model: openai/gpt-5.3-codex
     *
     * Purpose:
     * - Rebuild the selected combo card MAP + FRONT using current projection params.
     * - Run filtering/outlier rejection, score density quality, extract ROI.
     * - Publish candidate output (top list) based on combo quality.
     */
    private async fullRegenerateComboCard(card: HTMLDivElement, combo: ComboRuntime) {
        await this.recomputeSelectedCombo(card, combo, true);
    }

    private async recomputeSelectedCombo(card: HTMLDivElement, combo: ComboRuntime, autoProjection: boolean) {
        const modelFilename = this.currentModelFilename;
        if (!modelFilename) return;
        const mapCanvas = card.querySelector('[data-target="map"] canvas') as HTMLCanvasElement;
        const frontCanvas = card.querySelector('[data-target="front"] canvas') as HTMLCanvasElement;
        if (!mapCanvas || !frontCanvas) return;

        const ready = await this.ensureSampledPointsReady('refresh-card', modelFilename);
        if ((this.currentModelFilename ?? null) !== modelFilename) return;
        if (!ready) {
            this.setStatus('无法生成2D图：未获取到模型点。请先重新加载模型。');
            return;
        }

        this.pullProjectionFromInputs();
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const startedAt = performance.now();

        this.debugLog('Refresh Card [Start]', {
            runId,
            impl: 'OT-Refresh2DFront-DensityV2',
            comboId: combo.id,
            comboTitle: combo.title,
            sampledPoints: this.sampledPoints.length,
            sampledPointSource: this.sampledPointSource,
            projectionSnapshot: this.projection,
            autoProjection
        });

        const mapRaster = this.renderProjectionRaster(
            combo.id,
            'map',
            mapCanvas.width,
            mapCanvas.height,
            autoProjection ? null : this.projection
        );

        if (autoProjection) {
            this.projection = mapRaster.autoProjection;
            this.syncProjectionInputs();
        }
        const frontRaster = this.renderProjectionRaster(
            combo.id,
            'front',
            frontCanvas.width,
            frontCanvas.height,
            this.projection
        );

        this.rasterCache[this.cacheKey(combo.id, 'map')] = mapRaster;
        this.rasterCache[this.cacheKey(combo.id, 'front')] = frontRaster;

        combo.mapRect = mapRaster.roi.rect;
        const frontPad = 0.04;
        const fy = clamp(frontRaster.roi.rect.y, frontPad, 1 - frontPad - 0.08);
        const fh = clamp(frontRaster.roi.rect.h, 0.08, 1 - frontPad - fy);
        combo.frontRect = {
            ...frontRaster.roi.rect,
            x: combo.mapRect.x,
            w: combo.mapRect.w,
            y: fy,
            h: fh
        };

        this.regenerateComboCard(card, combo);

        this.debugLog('Refresh Card [Step2 Transform]', {
            runId,
            comboId: combo.id,
            transformRule: mapRaster.transformRule,
            floorY: Number(mapRaster.floorY.toFixed(4)),
            source: mapRaster.diagnostics.source,
            sliceMode: mapRaster.diagnostics.sliceMode,
            projection: this.projection,
            sliceCandidates: mapRaster.diagnostics.sliceCandidates
        });
        this.debugLog('Refresh Card [Step3 MAP Raster]', { runId, stats: mapRaster.stats, roi: mapRaster.roi });
        this.debugLog('Refresh Card [Step4 FRONT Raster]', { runId, stats: frontRaster.stats, roi: frontRaster.roi });
        this.debugLog('Refresh Card [Done]', {
            runId,
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
            comboId: combo.id
        });

        this.setStatus(`${combo.title} 已刷新并回填参数。`);
    }

    private getCurrentMapStyle(): MapStyle {
        const v = this.mapStyleInput.value as MapStyle;
        if (v === 'navigation' || v === 'visual' || v === 'color') return v;
        return 'visual';
    }

    private axisPresetForCombo(comboId: AxisComboId) {
        if (comboId === 'combo-1') return 'r-ydown-zfwd';
        if (comboId === 'combo-2') return 'r-yup-zback';
        if (comboId === 'combo-3') return 'r-zup-yfwd';
        return this.activeAxisPresetId;
    }

    private getComboLabels(comboId: AxisComboId) {
        return getComboAxisLabels(comboId, this.axisPresetForCombo(comboId));
    }

    private getComboPlaneTags(comboId: AxisComboId) {
        const labels = this.getComboLabels(comboId);
        const verticalPlane = labels.mapLabel.replace(/^MAP\s*/i, '');
        const frontPlane = labels.frontLabel.replace(/^FRONT\s*/i, '');
        return {
            verticalLabel: `垂直视图 ${verticalPlane}`,
            frontLabel: `正视图 ${frontPlane}`
        };
    }

    private renderProjectionRaster(
        comboId: AxisComboId,
        target: 'map' | 'front',
        width: number,
        height: number,
        fixedProjection: ProjectionParams | null
    ) {
        return buildRefreshRaster({
            sampledPoints: this.sampledPoints,
            comboId,
            target,
            width,
            height,
            mapStyle: this.getCurrentMapStyle(),
            projectionHint: this.projection,
            fixedProjection,
            axisPresetId: this.axisPresetForCombo(comboId),
            source: this.sampledPointSource
        });
    }

    private previewKey(comboId: AxisComboId, target: 'map' | 'front') {
        return `${comboId}:${target}`;
    }

    private cacheKey(comboId: AxisComboId, target: 'map' | 'front') {
        return `${comboId}:${target}`;
    }

    private getCachedOrBlankRaster(comboId: AxisComboId, target: 'map' | 'front', w: number, h: number): RasterResult {
        const cached = this.rasterCache[this.cacheKey(comboId, target)];
        if (cached) return cached;
        return {
            density: new Float32Array(w * h),
            maxDensity: 0,
            threshold: 0,
            image: new Uint8ClampedArray(w * h * 4),
            stats: {
                totalTransformed: 0,
                accepted: 0,
                filteredOpacity: 0,
                filteredOutlier: 0,
                filteredSlice: 0,
                filteredBounds: 0,
                avg: 0,
                std: 0,
                threshold: 0,
                maxDensity: 0
            },
            roi: { rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, score: 0, count: 0, fallback: true, coverage: 0, edgeRatio: 0 },
            floorY: 0,
            transformRule: '',
            autoProjection: this.projection,
            diagnostics: {
                sampleStep: 0,
                transformRule: '',
                source: this.sampledPointSource,
                sliceMode: 'absolute',
                requestedProjection: null,
                selectedProjection: this.projection,
                sliceCandidates: []
            }
        } as RasterResult;
    }

    private getPreviewViewport(comboId: AxisComboId, target: 'map' | 'front') {
        const key = this.previewKey(comboId, target);
        if (!this.previewViewport[key]) {
            this.previewViewport[key] = { zoom: 1, offsetX: 0, offsetY: 0 };
        }
        return this.previewViewport[key];
    }

    private clampViewport(view: PreviewViewport, canvas: HTMLCanvasElement) {
        const scaledW = canvas.width * view.zoom;
        const scaledH = canvas.height * view.zoom;
        const minX = Math.min(0, canvas.width - scaledW);
        const minY = Math.min(0, canvas.height - scaledH);
        view.offsetX = clamp(view.offsetX, minX, 0);
        view.offsetY = clamp(view.offsetY, minY, 0);
    }

    private adjustPreviewZoom(comboId: AxisComboId, target: 'map' | 'front', dir: 1 | -1, canvas: HTMLCanvasElement) {
        const view = this.getPreviewViewport(comboId, target);
        const oldZoom = view.zoom;
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.5;
        const worldX = (centerX - view.offsetX) / Math.max(1e-6, oldZoom);
        const worldY = (centerY - view.offsetY) / Math.max(1e-6, oldZoom);
        const factor = dir > 0 ? 1.2 : 1 / 1.2;
        view.zoom = clamp(view.zoom * factor, 1, 8);
        view.offsetX = centerX - worldX * view.zoom;
        view.offsetY = centerY - worldY * view.zoom;
        this.clampViewport(view, canvas);
        this.redrawComboCanvases(comboId);
    }

    private centerPreviewOnRect(comboId: AxisComboId, target: 'map' | 'front', canvas: HTMLCanvasElement) {
        const combo = this.combos.find((c) => c.id === comboId);
        if (!combo) return;
        const rect = target === 'map' ? combo.mapRect : combo.frontRect;
        const view = this.getPreviewViewport(comboId, target);
        const rcx = (rect.x + rect.w * 0.5) * canvas.width;
        const rcy = (rect.y + rect.h * 0.5) * canvas.height;
        view.offsetX = canvas.width * 0.5 - rcx * view.zoom;
        view.offsetY = canvas.height * 0.5 - rcy * view.zoom;
        this.clampViewport(view, canvas);
        this.redrawComboCanvases(comboId);
    }

    private canvasToContent(
        canvas: HTMLCanvasElement,
        comboId: AxisComboId,
        target: 'map' | 'front',
        clientX: number,
        clientY: number
    ) {
        const bounds = canvas.getBoundingClientRect();
        const sx = ((clientX - bounds.left) / bounds.width) * canvas.width;
        const sy = ((clientY - bounds.top) / bounds.height) * canvas.height;
        const view = this.getPreviewViewport(comboId, target);
        const cx = (sx - view.offsetX) / Math.max(1e-6, view.zoom);
        const cy = (sy - view.offsetY) / Math.max(1e-6, view.zoom);
        return { x: cx, y: cy };
    }

    private drawOverlay(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        density: Float32Array,
        maxDensity: number,
        threshold: number
    ) {
        if (this.overlayHeatInput.checked && maxDensity > 0) {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const den = Math.max(1e-6, maxDensity);
            for (let i = 0; i < density.length; i++) {
                const d = Math.pow(density[i] / den, 0.7);
                if (d < 0.12) continue;
                const p = i * 4;
                img.data[p + 0] = clamp(img.data[p + 0] * (1 - 0.32 * d) + 255 * 0.32 * d, 0, 255);
                img.data[p + 1] = clamp(img.data[p + 1] * (1 - 0.22 * d) + 120 * 0.22 * d, 0, 255);
                img.data[p + 2] = clamp(img.data[p + 2] * (1 - 0.15 * d), 0, 255);
            }
            ctx.putImageData(img, 0, 0);
        }

        if (this.overlayContourInput.checked) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.strokeStyle = 'rgba(255, 220, 130, 0.95)';
            ctx.lineWidth = 1;
            for (let y = 1; y < h - 1; y += 2) {
                for (let x = 1; x < w - 1; x += 2) {
                    const i = y * w + x;
                    const v = density[i];
                    if (v < threshold) continue;
                    const edge = density[i - 1] < threshold || density[i + 1] < threshold || density[i - w] < threshold || density[i + w] < threshold;
                    if (!edge) continue;
                    ctx.beginPath();
                    ctx.moveTo(x - 1, y);
                    ctx.lineTo(x + 1, y);
                    ctx.stroke();
                }
            }
        }

        if (this.overlayGridInput.checked) {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 10; i++) {
                const x = (canvas.width * i) / 10;
                const y = (canvas.height * i) / 10;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        }
    }

    private drawPreviewCanvas(
        canvas: HTMLCanvasElement,
        rect: RectNorm,
        color: string,
        comboId: AxisComboId,
        target: 'map' | 'front',
        precomputed?: RasterResult
    ) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#040912';
        ctx.fillRect(0, 0, w, h);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const octx = offscreen.getContext('2d');
        if (!octx) return;

        octx.fillStyle = '#040912';
        octx.fillRect(0, 0, w, h);
        octx.fillStyle = 'rgba(137,171,206,0.2)';
        for (let y = 4; y < h; y += 10) {
            for (let x = 4; x < w; x += 10) {
                octx.fillRect(x, y, 1, 1);
            }
        }
        const raster = precomputed ?? this.renderProjectionRaster(comboId, target, w, h, null);
        const baseImage = new ImageData(new Uint8ClampedArray(raster.image), w, h);
        octx.putImageData(baseImage, 0, 0);
        this.drawOverlay(octx, offscreen, raster.density, raster.maxDensity, raster.threshold);
        const rx = rect.x * w;
        const ry = rect.y * h;
        const rw = rect.w * w;
        const rh = rect.h * h;
        octx.strokeStyle = color;
        octx.lineWidth = 2;
        octx.strokeRect(rx, ry, rw, rh);
        octx.fillStyle = color;
        if (target === 'map') {
            octx.beginPath();
            octx.arc(rx, ry, 4, 0, Math.PI * 2);
            octx.arc(rx + rw, ry + rh, 4, 0, Math.PI * 2);
            octx.fill();
        } else {
            octx.beginPath();
            octx.arc(rx + rw, ry, 4, 0, Math.PI * 2);
            octx.arc(rx + rw, ry + rh, 4, 0, Math.PI * 2);
            octx.fill();
        }

        const view = this.getPreviewViewport(comboId, target);
        this.clampViewport(view, canvas);
        ctx.drawImage(offscreen, view.offsetX, view.offsetY, w * view.zoom, h * view.zoom);

        if (comboId === this.selectedComboId) {
            ctx.strokeStyle = '#2f8dff';
            ctx.strokeRect(1, 1, w - 2, h - 2);
        }
    }

    private onDragStart(event: PointerEvent, comboId: AxisComboId, target: 'map' | 'front', canvas: HTMLCanvasElement) {
        if (event.button !== 0) return;
        if (this.selectedComboId !== comboId) return;
        const combo = this.combos.find((item) => item.id === comboId);
        if (!combo) return;

        const p = this.canvasToContent(canvas, comboId, target, event.clientX, event.clientY);
        const px = p.x;
        const py = p.y;
        const base = target === 'map' ? combo.mapRect : combo.frontRect;
        const rx = base.x * canvas.width;
        const ry = base.y * canvas.height;
        const rw = base.w * canvas.width;
        const rh = base.h * canvas.height;
        const near = (x: number, y: number) => Math.abs(px - x) < 10 && Math.abs(py - y) < 10;

        let mode: DragMode = 'none';
        if (target === 'map') {
            if (near(rx, ry)) mode = 'resize-tl';
            else if (near(rx + rw, ry + rh)) mode = 'resize-br';
            else if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) mode = 'move';
        } else {
            if (near(rx + rw, ry)) mode = 'front-min';
            else if (near(rx + rw, ry + rh)) mode = 'front-max';
            else if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) mode = 'front-move';
        }
        if (mode === 'none') return;

        this.dragState = {
            active: true,
            comboId,
            target,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...base },
            startZoom: this.getPreviewViewport(comboId, target).zoom
        };
        canvas.setPointerCapture(event.pointerId);
    }

    private onDragMove(event: PointerEvent) {
        if (!this.dragState.active) return;
        const combo = this.combos.find((item) => item.id === this.dragState.comboId);
        if (!combo) return;
        const card = this.modal.querySelector(`[data-combo-id="${combo.id}"]`) as HTMLDivElement;
        if (!card) return;
        const canvas = card.querySelector(`[data-target="${this.dragState.target}"] canvas`) as HTMLCanvasElement;
        if (!canvas) return;

        const zoom = Math.max(1e-6, this.dragState.startZoom || 1);
        const dx = (event.clientX - this.dragState.startX) / canvas.getBoundingClientRect().width / zoom;
        const dy = (event.clientY - this.dragState.startY) / canvas.getBoundingClientRect().height / zoom;
        const r = { ...this.dragState.startRect };
        let out = { ...r };

        if (this.dragState.target === 'map') {
            if (this.dragState.mode === 'move') {
                out.x = clamp(r.x + dx, 0, 1 - r.w);
                out.y = clamp(r.y + dy, 0, 1 - r.h);
            } else if (this.dragState.mode === 'resize-tl') {
                const nx = clamp(r.x + dx, 0.02, r.x + r.w - 0.08);
                const ny = clamp(r.y + dy, 0.02, r.y + r.h - 0.08);
                out.w = r.w + (r.x - nx);
                out.h = r.h + (r.y - ny);
                out.x = nx;
                out.y = ny;
            } else if (this.dragState.mode === 'resize-br') {
                out.w = clamp(r.w + dx, 0.08, 1 - r.x - 0.02);
                out.h = clamp(r.h + dy, 0.08, 1 - r.y - 0.02);
            }
            combo.mapRect = out;
            combo.frontRect = {
                ...combo.frontRect,
                x: out.x,
                w: out.w
            };
        } else {
            if (this.dragState.mode === 'front-move') {
                out.y = clamp(r.y + dy, 0, 1 - r.h);
            } else if (this.dragState.mode === 'front-min') {
                const ny = clamp(r.y + dy, 0.02, r.y + r.h - 0.08);
                out.h = r.h + (r.y - ny);
                out.y = ny;
            } else if (this.dragState.mode === 'front-max') {
                out.h = clamp(r.h + dy, 0.08, 1 - r.y - 0.02);
            }
            combo.frontRect = {
                ...out,
                x: combo.mapRect.x,
                w: combo.mapRect.w
            };
        }
        const frontPad = 0.04;
        combo.frontRect.y = clamp(combo.frontRect.y, frontPad, 1 - frontPad - 0.08);
        combo.frontRect.h = clamp(combo.frontRect.h, 0.08, 1 - frontPad - combo.frontRect.y);
        this.boundaryConfirmed = false;
        this.redrawComboCanvases(combo.id);
    }

    private syncProjectionInputs() {
        this.projectionInputs.sliceMin.value = this.projection.sliceMin.toFixed(2);
        this.projectionInputs.sliceMax.value = this.projection.sliceMax.toFixed(2);
        this.projectionInputs.xRangeMin.value = this.projection.xRangeMin.toFixed(2);
        this.projectionInputs.xRangeMax.value = this.projection.xRangeMax.toFixed(2);
        this.projectionInputs.heightMin.value = this.projection.heightMin.toFixed(2);
        this.projectionInputs.heightMax.value = this.projection.heightMax.toFixed(2);
    }

    private pullProjectionFromInputs() {
        const p = {
            sliceMin: parseFloat(this.projectionInputs.sliceMin.value),
            sliceMax: parseFloat(this.projectionInputs.sliceMax.value),
            xRangeMin: parseFloat(this.projectionInputs.xRangeMin.value),
            xRangeMax: parseFloat(this.projectionInputs.xRangeMax.value),
            heightMin: parseFloat(this.projectionInputs.heightMin.value),
            heightMax: parseFloat(this.projectionInputs.heightMax.value)
        };
        this.projection = {
            sliceMin: Number.isFinite(p.sliceMin) ? p.sliceMin : this.projection.sliceMin,
            sliceMax: Number.isFinite(p.sliceMax) ? p.sliceMax : this.projection.sliceMax,
            xRangeMin: Number.isFinite(p.xRangeMin) ? p.xRangeMin : this.projection.xRangeMin,
            xRangeMax: Number.isFinite(p.xRangeMax) ? p.xRangeMax : this.projection.xRangeMax,
            heightMin: Number.isFinite(p.heightMin) ? p.heightMin : this.projection.heightMin,
            heightMax: Number.isFinite(p.heightMax) ? p.heightMax : this.projection.heightMax
        };
    }

    private renderCandidates() {
        this.candidateHost.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'otw-text';
        empty.textContent = '最佳视角候选与匹配已禁用。';
        this.candidateHost.appendChild(empty);
    }

    private renderAxisPresetButtons() {
        const host = this.modal.querySelector('[data-role="axis-preset-grid"]') as HTMLDivElement | null;
        if (!host) return;
        host.innerHTML = '';
        RIGHT_HANDED_AXIS_PRESETS.forEach((preset) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `otw-axis-preset-btn${preset.id === this.activeAxisPresetId ? ' active' : ''}`;
            button.textContent = preset.label;
            button.title = preset.note ? `${preset.label} - ${preset.note}` : preset.label;
            button.addEventListener('click', async () => {
                this.activeAxisPresetId = preset.id;
                this.events.fire('opentour.axisPreset.apply', preset.id);
                delete this.rasterCache[this.cacheKey('combo-4', 'map')];
                delete this.rasterCache[this.cacheKey('combo-4', 'front')];
                this.renderAxisPresetButtons();
                this.renderComboCards();
                if (this.modal.classList.contains('visible') && this.sampledPoints.length > 0) {
                    const combo = this.combos.find((c) => c.id === 'combo-4');
                    const card = this.modal.querySelector('[data-combo-id="combo-4"]') as HTMLDivElement | null;
                    if (combo && card) {
                        await this.recomputeSelectedCombo(card, combo, false);
                    }
                }
                this.setStatus(`已应用主画面坐标轴: ${preset.label}`);
            });
            host.appendChild(button);
        });
    }

    private getEyeHeight(): number {
        const v = Number.parseFloat(this.eyeHeightInput?.value || '1.65');
        return Number.isFinite(v) ? clamp(v, 0, 10) : 1.65;
    }

    private getFovInput(): number {
        const v = Number.parseFloat(this.fovInput?.value || '120');
        return Number.isFinite(v) ? clamp(v, 0, 150) : 120;
    }

    private getSelectedCombo(): ComboRuntime | null {
        return this.combos.find((combo) => combo.id === this.selectedComboId) ?? null;
    }

    private buildSnapshot(): WorkflowSnapshot | null {
        if (!this.currentModelFilename) return null;
        const combo = this.getSelectedCombo();
        return {
            version: 1,
            modelFilename: this.currentModelFilename,
            selectedComboId: this.selectedComboId,
            projection: { ...this.projection },
            mapBoundary: combo ? { ...combo.mapRect } : null,
            frontBoundary: combo ? { ...combo.frontRect } : null,
            top3: this.candidates.map((candidate) => ({ ...candidate })),
            finalCamera: this.confirmedCamera ? { ...this.confirmedCamera } : null,
            confirmedAt: this.confirmedCamera ? new Date().toISOString() : null
        };
    }

    private applySnapshot(snapshot: WorkflowSnapshot) {
        this.currentModelFilename = snapshot.modelFilename;
        this.modelText.textContent = `当前模型: ${snapshot.modelFilename}`;
        this.selectedComboId = snapshot.selectedComboId;
        this.projection = snapshot.projection;
        const combo = this.getSelectedCombo();
        if (combo && snapshot.mapBoundary && snapshot.frontBoundary) {
            combo.mapRect = { ...snapshot.mapBoundary };
            combo.frontRect = { ...snapshot.frontBoundary };
        }
        this.candidates = Array.isArray(snapshot.top3) ? snapshot.top3 : [];
        this.selectedCandidateId = this.candidates[0]?.id ?? null;
        this.confirmedCamera = snapshot.finalCamera;
        this.step2OpenBtn.disabled = false;
        this.step3DownloadBtn.disabled = false;
        this.step3UploadBtn.disabled = false;
        this.boundaryConfirmed = Boolean(snapshot.mapBoundary && snapshot.frontBoundary);
        this.syncProjectionInputs();
        this.renderCandidates();
        if (this.selectedComboId) this.redrawComboCanvases(this.selectedComboId);
        this.renderSummaryMap();
        this.summaryText.textContent = snapshot.selectedComboId
            ? `已确认: ${snapshot.selectedComboId}，边界与最终视角已恢复。`
            : '未确认组合。';
    }

    private rectToWorldBounds(combo: ComboRuntime) {
        const map = combo.mapRect;
        const front = combo.frontRect;
        const mapMinX = lerp(this.projection.xRangeMin, this.projection.xRangeMax, map.x);
        const mapMaxX = lerp(this.projection.xRangeMin, this.projection.xRangeMax, map.x + map.w);
        const zTop = lerp(this.projection.heightMin, this.projection.heightMax, 1 - map.y);
        const zBottom = lerp(this.projection.heightMin, this.projection.heightMax, 1 - (map.y + map.h));
        const yTop = lerp(this.projection.sliceMin, this.projection.sliceMax, 1 - front.y);
        const yBottom = lerp(this.projection.sliceMin, this.projection.sliceMax, 1 - (front.y + front.h));
        const minX = Math.min(mapMinX, mapMaxX);
        const maxX = Math.max(mapMinX, mapMaxX);
        const minMapY = Math.min(zBottom, zTop);
        const maxMapY = Math.max(zBottom, zTop);
        const minFrontY = Math.min(yBottom, yTop);
        const maxFrontY = Math.max(yBottom, yTop);
        return {
            map: {
                xMin: minX,
                xMax: maxX,
                yMin: minMapY,
                yMax: maxMapY
            },
            front: {
                xMin: minX,
                xMax: maxX,
                yMin: minFrontY,
                yMax: maxFrontY
            }
        };
    }

    private rasterToPngBase64(raster: RasterResult, width: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const img = new ImageData(new Uint8ClampedArray(raster.image), width, height);
        ctx.putImageData(img, 0, 0);
        return canvas.toDataURL('image/png');
    }

    private async putCalibrationToDb(calibration: CalibrationRecord, modelFilenameOverride?: string | null) {
        const modelFilename = modelFilenameOverride ?? this.currentModelFilename;
        if (!modelFilename) return;
        const response = await fetch('/api/model/calibration', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename, calibration })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    private async getCalibrationFromDb(modelFilenameOverride?: string | null): Promise<CalibrationRecord | null> {
        const modelFilename = modelFilenameOverride ?? this.currentModelFilename;
        if (!modelFilename) return null;
        const response = await fetch(`/api/model/calibration?modelFilename=${encodeURIComponent(modelFilename)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data?.found || !data?.calibration) return null;
        return data.calibration as CalibrationRecord;
    }

    private async clearAllCalibrationResidualsFromDb() {
        const response = await fetch('/api/model/calibration/clear-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{
            ok: boolean;
            deleted?: {
                snapshots: number;
                calibrations: number;
                coordinates: number;
                models: number;
            };
        }>;
    }

    private clearSummaryCalibrationRuntime() {
        this.summaryCalibration = null;
        this.summaryCalibrationSource = 'none';
        this.summaryMapImage = null;
        this.summaryFrontImage = null;
        this.boundaryConfirmed = false;
        this.summaryText.textContent = '数据库残值已清空，请重新执行 Step2 确认。';
        this.renderSummaryMap();
    }

    private applyCalibrationToSummary(cal: CalibrationRecord, source: 'sqlite' = 'sqlite') {
        this.summaryCalibration = cal;
        this.summaryCalibrationSource = source;
        const presetId = (cal.axisPresetId || DEFAULT_RIGHT_HANDED_PRESET_ID).toLowerCase() as RightHandedAxisPresetId;
        if (RIGHT_HANDED_AXIS_PRESETS.some((preset) => preset.id === presetId)) {
            this.activeAxisPresetId = presetId;
            this.events.fire('opentour.axisPreset.apply', presetId);
            this.renderAxisPresetButtons();
        }
        if (cal.verticalMapImage) {
            const img = new Image();
            const imageMime = cal.imageMime || 'image/png';
            img.src = `data:${imageMime};base64,${cal.verticalMapImage}`;
            this.summaryMapImage = img;
        } else {
            this.summaryMapImage = null;
        }
        if (cal.frontViewImage) {
            const img = new Image();
            const imageMime = cal.imageMime || 'image/png';
            img.src = `data:${imageMime};base64,${cal.frontViewImage}`;
            this.summaryFrontImage = img;
        } else {
            this.summaryFrontImage = null;
        }
    }

    private buildCalibrationFromSelection(): CalibrationRecord | null {
        if (!this.selectedComboId) return null;
        const combo = this.getSelectedCombo();
        if (!combo) return null;
        const mapRaster = this.rasterCache[this.cacheKey(combo.id, 'map')];
        const frontRaster = this.rasterCache[this.cacheKey(combo.id, 'front')];
        if (!mapRaster || !frontRaster) return null;

        const viewRange = this.rectToWorldBounds(combo);
        const axisPresetId = this.axisPresetForCombo(combo.id) || DEFAULT_RIGHT_HANDED_PRESET_ID;
        return {
            axisPresetId,
            viewRange,
            verticalMapImage: this.rasterToPngBase64(mapRaster, 420, 210),
            frontViewImage: this.rasterToPngBase64(frontRaster, 420, 210)
        };
    }

    private async confirmStep2() {
        const modelFilename = this.currentModelFilename;
        if (!modelFilename) {
            this.setStatus('请先加载模型。');
            return;
        }
        if (!this.selectedComboId) {
            this.setStatus('请先选择组合。');
            return;
        }
        this.confirmedCamera = null;
        this.setStatus('正在保存Step2结果...');

        let calibration = this.buildCalibrationFromSelection();
        if (!calibration) {
            const combo = this.getSelectedCombo();
            const card = combo
                ? (this.modal.querySelector(`[data-combo-id="${combo.id}"]`) as HTMLDivElement | null)
                : null;
            if (combo && card) {
                this.debugLog('Confirm Apply [Auto Refresh]', { comboId: combo.id, reason: 'raster cache missing' });
                await this.recomputeSelectedCombo(card, combo, false);
                calibration = this.buildCalibrationFromSelection();
            }
        }
        if (!calibration) {
            this.setStatus('请先刷新选中卡片以生成边界图像。');
            alert('请先刷新选中卡片以生成边界图像。(Calibration generation failed)');
            return;
        }

        const saved = await this.putCalibrationToDb(calibration, modelFilename);
        if ((this.currentModelFilename ?? null) !== modelFilename) {
            this.debugLog('Confirm Apply [Dropped]', {
                reason: 'model switched during save',
                expectedModel: modelFilename,
                currentModel: this.currentModelFilename
            });
            alert('模型已切换，保存取消。');
            return;
        }
        this.debugLog('Confirm Apply [DB Saved]', {
            modelFilename,
            comboId: this.selectedComboId,
            axisPresetId: calibration.axisPresetId,
            viewRange: calibration.viewRange,
            selectedCandidate: null,
            response: saved
        });

        const snapshot = this.buildSnapshot();
        let snapshotWarning = false;
        if (snapshot) {
            try {
                await this.saveFullSnapshot(snapshot);
                if ((this.currentModelFilename ?? null) !== modelFilename) return;
            } catch (error) {
                snapshotWarning = true;
                this.debugLog('Confirm Apply [Snapshot Save Warning]', { error: String(error) });
            }
        } else {
            snapshotWarning = true;
            this.debugLog('Confirm Apply [Snapshot Skip]', { reason: 'snapshot unavailable' });
        }

        let cal: CalibrationRecord | null = null;
        try {
            cal = await this.getCalibrationFromDb(modelFilename);
            if ((this.currentModelFilename ?? null) !== modelFilename) return;
        } catch (error) {
            this.debugLog('Confirm Apply [Reload Warning]', { error: String(error) });
        }
        if (!cal) {
            throw new Error(`SQLite reload failed for model: ${modelFilename}`);
        }

        this.applyCalibrationToSummary(cal, 'sqlite');
        this.debugLog('Confirm Apply [Loaded Calibration]', {
            modelFilename,
            source: 'sqlite',
            axisPresetId: cal.axisPresetId,
            viewRange: cal.viewRange
        });

        this.summaryText.textContent = `已确认: ${snapshot?.selectedComboId ?? this.selectedComboId}，主界面显示2D地图。`;
        this.renderSummaryMap();
        this.closeModal();
        this.setStatus(snapshotWarning ? 'Step2确认成功，校准已保存（全量流程快照保存异常，请查看Debug）。' : 'Step2确认成功，已保存全量流程快照。');
    }

    private getLiveCameraPoseForSummary(): CameraPosePair | null {
        const scene = getSceneInstance();
        const camera = scene?.camera;
        const eye = camera?.position;
        const forward = camera?.forward;
        if (!eye || !forward) return null;
        if (
            !Number.isFinite(eye.x) ||
            !Number.isFinite(eye.y) ||
            !Number.isFinite(eye.z) ||
            !Number.isFinite(forward.x) ||
            !Number.isFinite(forward.y) ||
            !Number.isFinite(forward.z)
        ) {
            return null;
        }

        const worldEye = new Vec3(eye.x, eye.y, eye.z);
        const worldForward = new Vec3(forward.x, forward.y, forward.z);
        if (worldForward.lengthSq() < 1e-8) return null;
        worldForward.normalize();

        const worldTip = worldEye.clone().add(worldForward);
        const modelEye = worldEye.clone();
        const modelTip = worldTip.clone();

        const rootWorld = scene?.contentRoot?.getWorldTransform?.();
        if (rootWorld) {
            const invRoot = new Mat4();
            invRoot.invert(rootWorld);
            invRoot.transformPoint(worldEye, modelEye);
            invRoot.transformPoint(worldTip, modelTip);
        }

        const modelForward = modelTip.sub(modelEye.clone());
        if (modelForward.lengthSq() < 1e-8) return null;
        modelForward.normalize();

        return {
            cameraWorld: {
                eye: { x: worldEye.x, y: worldEye.y, z: worldEye.z },
                forward: { x: worldForward.x, y: worldForward.y, z: worldForward.z }
            },
            cameraModelLocal: {
                eye: { x: modelEye.x, y: modelEye.y, z: modelEye.z },
                forward: { x: modelForward.x, y: modelForward.y, z: modelForward.z }
            }
        };
    }

    private getSummaryImageRect(canvas: HTMLCanvasElement) {
        const w = canvas.width;
        const h = canvas.height;
        const zoom = this.summaryMapZoom;
        const rw = w * zoom;
        const rh = h * zoom;
        const rx = (w - rw) * 0.5;
        const ry = (h - rh) * 0.5;
        return { x: rx, y: ry, w: rw, h: rh };
    }

    private drawSummaryLiveOverlay(canvas: HTMLCanvasElement, view: 'map' | 'front', posePair: CameraPosePair | null): Step3CameraOverlayResult | null {
        if (!this.summaryCalibration?.viewRange) return null;
        if (!posePair) return null;
        const overlay = buildStep3CameraOverlay({
            axisPresetId: this.summaryCalibration.axisPresetId,
            viewRange: this.summaryCalibration.viewRange,
            cameraPose: posePair.cameraModelLocal,
            view,
            directionLengthMeters: 1.5
        });
        if (!overlay.valid) return overlay;

        const ctx = canvas.getContext('2d');
        if (!ctx) return overlay;

        const image = view === 'map' ? this.summaryMapImage : this.summaryFrontImage;
        const pos = calculateScreenPosition(
            overlay,
            image?.naturalWidth || canvas.width,
            image?.naturalHeight || canvas.height,
            canvas.width,
            canvas.height,
            this.summaryMapZoom
        );
        if (!pos) return overlay;

        if (overlay.directionVisible) {
            const x1 = pos.pointX;
            const y1 = pos.pointY;
            const x2 = pos.tipX;
            const y2 = pos.tipY;
            ctx.strokeStyle = '#ffd54f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len > 1e-4) {
                const ux = dx / len;
                const uy = dy / len;
                const pxh = -uy;
                const pyh = ux;
                const ah = 7;
                const aw = 4;
                ctx.fillStyle = '#ffd54f';
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - ux * ah + pxh * aw, y2 - uy * ah + pyh * aw);
                ctx.lineTo(x2 - ux * ah - pxh * aw, y2 - uy * ah - pyh * aw);
                ctx.closePath();
                ctx.fill();
            }
        }

        const px = pos.pointX;
        const py = pos.pointY;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = pos.pointVisible ? '#ff4d4d' : '#ff9b47';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
        ctx.stroke();

        return overlay;
    }

    private roundProbe(v: number, d = 3) {
        const m = 10 ** d;
        return Math.round(v * m) / m;
    }

    private logSummaryOverlayProbe(mapOverlay: Step3CameraOverlayResult | null, frontOverlay: Step3CameraOverlayResult | null, posePair: CameraPosePair | null) {
        if (!this.summaryCalibration?.viewRange || !mapOverlay || !frontOverlay) return;
        if (!posePair) return;
        const now = Date.now();
        if (now - this.lastOverlayProbeAt < 700) return;

        const worldEye = posePair.cameraWorld.eye;
        const worldForward = posePair.cameraWorld.forward;
        const modelEye = posePair.cameraModelLocal.eye;
        const modelForward = posePair.cameraModelLocal.forward;

        const key = [
            worldEye.x.toFixed(2), worldEye.y.toFixed(2), worldEye.z.toFixed(2),
            worldForward.x.toFixed(2), worldForward.y.toFixed(2), worldForward.z.toFixed(2),
            modelEye.x.toFixed(2), modelEye.y.toFixed(2), modelEye.z.toFixed(2),
            modelForward.x.toFixed(2), modelForward.y.toFixed(2), modelForward.z.toFixed(2),
            mapOverlay.pointRaw.u.toFixed(2), mapOverlay.pointRaw.v.toFixed(2),
            frontOverlay.pointRaw.u.toFixed(2), frontOverlay.pointRaw.v.toFixed(2)
        ].join('|');
        if (key === this.lastOverlayProbeKey) return;
        this.lastOverlayProbeAt = now;
        this.lastOverlayProbeKey = key;

        this.debugLog('Step3 Overlay Probe', {
            modelFilename: this.currentModelFilename,
            source: this.summaryCalibrationSource,
            axisPresetId: this.summaryCalibration.axisPresetId,
            basisUsed: mapOverlay.basisUsed,
            viewRange: this.summaryCalibration.viewRange,
            cameraWorld: {
                eye: {
                    x: this.roundProbe(worldEye.x),
                    y: this.roundProbe(worldEye.y),
                    z: this.roundProbe(worldEye.z)
                },
                forward: {
                    x: this.roundProbe(worldForward.x),
                    y: this.roundProbe(worldForward.y),
                    z: this.roundProbe(worldForward.z)
                }
            },
            cameraModelLocal: {
                eye: {
                    x: this.roundProbe(modelEye.x),
                    y: this.roundProbe(modelEye.y),
                    z: this.roundProbe(modelEye.z)
                },
                forward: {
                    x: this.roundProbe(modelForward.x),
                    y: this.roundProbe(modelForward.y),
                    z: this.roundProbe(modelForward.z)
                }
            },
            map: {
                mappingUsed: mapOverlay.mappingUsed,
                eyeCombo: {
                    x: this.roundProbe(mapOverlay.eyeCombo.x),
                    y: this.roundProbe(mapOverlay.eyeCombo.y),
                    z: this.roundProbe(mapOverlay.eyeCombo.z)
                },
                axisRaw: {
                    x: this.roundProbe(mapOverlay.axisXRaw),
                    y: this.roundProbe(mapOverlay.axisYRaw)
                },
                axisNorm: {
                    x: this.roundProbe(mapOverlay.axisXNorm),
                    y: this.roundProbe(mapOverlay.axisYNorm)
                },
                axisInRange: {
                    x: mapOverlay.axisXInRange,
                    y: mapOverlay.axisYInRange
                },
                pointRaw: {
                    u: this.roundProbe(mapOverlay.pointRaw.u),
                    v: this.roundProbe(mapOverlay.pointRaw.v)
                },
                pointClamped: {
                    u: this.roundProbe(mapOverlay.point.u),
                    v: this.roundProbe(mapOverlay.point.v)
                },
                directionToRaw: {
                    u: this.roundProbe(mapOverlay.directionToRaw.u),
                    v: this.roundProbe(mapOverlay.directionToRaw.v)
                },
                inRange: mapOverlay.pointVisible
            },
            front: {
                mappingUsed: frontOverlay.mappingUsed,
                eyeCombo: {
                    x: this.roundProbe(frontOverlay.eyeCombo.x),
                    y: this.roundProbe(frontOverlay.eyeCombo.y),
                    z: this.roundProbe(frontOverlay.eyeCombo.z)
                },
                axisRaw: {
                    x: this.roundProbe(frontOverlay.axisXRaw),
                    y: this.roundProbe(frontOverlay.axisYRaw)
                },
                axisNorm: {
                    x: this.roundProbe(frontOverlay.axisXNorm),
                    y: this.roundProbe(frontOverlay.axisYNorm)
                },
                axisInRange: {
                    x: frontOverlay.axisXInRange,
                    y: frontOverlay.axisYInRange
                },
                pointRaw: {
                    u: this.roundProbe(frontOverlay.pointRaw.u),
                    v: this.roundProbe(frontOverlay.pointRaw.v)
                },
                pointClamped: {
                    u: this.roundProbe(frontOverlay.point.u),
                    v: this.roundProbe(frontOverlay.point.v)
                },
                directionToRaw: {
                    u: this.roundProbe(frontOverlay.directionToRaw.u),
                    v: this.roundProbe(frontOverlay.directionToRaw.v)
                },
                inRange: frontOverlay.pointVisible
            }
        });
    }

    private drawSummaryBase(canvas: HTMLCanvasElement, image: HTMLImageElement | null) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const parent = canvas.parentElement as HTMLElement;
        const displayW = Math.max(100, (parent?.clientWidth || 160) - 4);
        const displayH = 130;
        if (canvas.width !== displayW || canvas.height !== displayH) {
            canvas.width = displayW;
            canvas.height = displayH;
        }
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#040b18';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(62, 96, 140, 0.35)';
        for (let i = 0; i <= 10; i++) {
            const x = (w * i) / 10;
            const y = (h * i) / 10;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        if (image) {
            const zoom = this.summaryMapZoom;
            const dw = w * zoom;
            const dh = h * zoom;
            const dx = (w - dw) * 0.5;
            const dy = (h - dh) * 0.5;
            ctx.drawImage(image, dx, dy, dw, dh);
        }
    }

    private renderSummaryMap() {
        this.drawSummaryBase(this.summaryMapCanvas, this.summaryMapImage);
        this.drawSummaryBase(this.summaryFrontCanvas, this.summaryFrontImage);
        const posePair = this.getLiveCameraPoseForSummary();
        const mapOverlay = this.drawSummaryLiveOverlay(this.summaryMapCanvas, 'map', posePair);
        const frontOverlay = this.drawSummaryLiveOverlay(this.summaryFrontCanvas, 'front', posePair);
        this.logSummaryOverlayProbe(mapOverlay, frontOverlay, posePair);
    }

    private async fetchFullSnapshot(modelFilename: string): Promise<WorkflowSnapshot | null> {
        try {
            const response = await fetch(`/api/workflow/full?modelFilename=${encodeURIComponent(modelFilename)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data?.found || !data?.payload) return null;
            return data.payload as WorkflowSnapshot;
        } catch {
            const raw = localStorage.getItem(`opentour-workflow:${modelFilename}`);
            if (!raw) return null;
            try {
                return JSON.parse(raw) as WorkflowSnapshot;
            } catch {
                return null;
            }
        }
    }

    private async saveFullSnapshot(payload: WorkflowSnapshot) {
        try {
            const response = await fetch('/api/workflow/full', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelFilename: payload.modelFilename, payload })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch {
            localStorage.setItem(`opentour-workflow:${payload.modelFilename}`, JSON.stringify(payload));
        }
    }

    private async downloadSnapshot() {
        if (!this.currentModelFilename) {
            this.setStatus('请先加载模型。');
            return;
        }
        let payload: WorkflowSnapshot | null = null;
        try {
            const response = await fetch(`/api/workflow/export?modelFilename=${encodeURIComponent(this.currentModelFilename)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            payload = data?.payload ?? null;
        } catch {
            payload = await this.fetchFullSnapshot(this.currentModelFilename);
        }
        if (!payload) {
            this.setStatus('当前模型没有可下载的全量流程包。');
            return;
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `opentour-workflow-${this.currentModelFilename.replace(/\.[^/.]+$/, '')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 800);
        this.setStatus('已下载全量流程包。');
    }

    private async uploadSnapshot() {
        const file = this.uploadInput.files?.[0];
        if (!file) return;
        const text = await file.text();
        const payload = JSON.parse(text) as WorkflowSnapshot;
        if (!payload?.modelFilename) {
            throw new Error('JSON缺少modelFilename');
        }
        if (!this.currentModelFilename) {
            throw new Error('请先Load模型');
        }
        if (payload.modelFilename !== this.currentModelFilename) {
            throw new Error(`模型不匹配: ${payload.modelFilename} != ${this.currentModelFilename}`);
        }
        let restored: WorkflowSnapshot | null = null;
        try {
            const response = await fetch('/api/workflow/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelFilename: this.currentModelFilename, payload })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            restored = (data?.payload as WorkflowSnapshot) ?? null;
        } catch {
            localStorage.setItem(`opentour-workflow:${payload.modelFilename}`, JSON.stringify(payload));
            restored = payload;
        }
        if (!restored) throw new Error('返回为空');
        this.applySnapshot(restored);
        this.setStatus('Upload覆盖完成，主界面和viewer已刷新。');
        this.uploadInput.value = '';
    }
}

const mountOpenTourWizardPanel = (events: Events, loadModelFile: (file: File) => Promise<void>, launcherButton: HTMLButtonElement) => {
    new OpenTourWizardPanel(events, loadModelFile, launcherButton);
};

export { mountOpenTourWizardPanel };
