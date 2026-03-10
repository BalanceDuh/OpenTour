import {
    COORDINATE_IDS,
    getCoordinateViewProfile,
    type AxisDir,
    type CoordinateId
} from './coordinateViews';
import {
    defaultProjectionParams,
    suggestProjectionByCoordinate,
    buildRotationToCoordinate,
    transformPointsByRotationPlan,
    type CoordinateRotationPlan
} from './algorithms/otml_projection_by_axis';
import { suggestProjectionByCoordinateQuantileStep3 } from './algorithms/otml_projection_quantile_step3';
import { suggestProjectionByCoordinateNatural } from './algorithms/otml_projection_natural';
import { suggestProjectionByCoordinateNaturalRobust } from './algorithms/otml_projection_natural_robust';
import { projectCameraToRaster } from './algorithms/otml_camera_to_raster';
import { recommendBestFlyCamera } from './algorithms/otml_best_fly_camera';
import { buildOriginalProjectionIndependent } from './algorithms/otml_original_projection_independent';
import { buildRotatedProjectionWorldBackup } from './algorithms/otml_rotated_projection_world_backup';
import type {
    BestFlyCameraCandidate,
    CameraPose,
    ProjectionByAxisResult,
    ProjectionParams,
    RectNorm,
    SampledPoint
} from './algorithms/otml_types';

type OTMLIntelligentAlignOptions = {
    applyRotateToCanonical?: (plan: CoordinateRotationPlan) => Promise<void> | void;
    resetModelToLoadedState?: () => Promise<void> | void;
    clearDbResiduals?: () => Promise<any>;
    previewFlyCamera?: (pose: CameraPose, fovDeg: number) => Promise<void> | void;
    getLiveCameraPose?: () => { pose: CameraPose; fovDeg: number } | null;
    getWorldSamplePoints?: () => SampledPoint[];
};

type OTMLStep3DualViewSink = {
    setCanonicalPoints: (points: SampledPoint[]) => void;
    setFlyCameraPose: (pose: CameraPose | null) => void;
    redraw: () => void;
};

type OTMLIntelligentAlignController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
    setModelFile: (file: File | null) => Promise<void>;
    resetWorkflow: () => Promise<void>;
    attachStep3DualViewSink: (sink: OTMLStep3DualViewSink | null) => void;
};

type PaneId = 'original' | 'canonical';

type CanonicalViewId = 'top' | 'front';

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'pan';

type ParseResult = {
    points: SampledPoint[];
    issues: string[];
    meta: {
        format: 'ascii' | 'binary_little_endian' | 'unsupported' | 'unknown';
        vertexCount: number;
    };
};

const STYLE_ID = 'ot-ml-intelligent-align-style';
const CANONICAL_COORDINATE_ID: CoordinateId = 'R-Yup-Zback';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const isCoordinateId = (value: string): value is CoordinateId => {
    return COORDINATE_IDS.includes(value as CoordinateId);
};

const normalizeCoordinateId = (value: string | null | undefined): CoordinateId | null => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (isCoordinateId(raw)) return raw;
    const lower = raw.toLowerCase();
    for (let i = 0; i < COORDINATE_IDS.length; i += 1) {
        if (COORDINATE_IDS[i].toLowerCase() === lower) return COORDINATE_IDS[i];
    }
    return null;
};

type PresetDisplayItem = {
    id: CoordinateId;
    label: string;
};

const OPENGL_PRESET_ITEMS: PresetDisplayItem[] = [
    { id: 'R-Ydown-Zback', label: 'R-Ydown-Zback (Marble)' },
    { id: 'R-Yup-Zback', label: 'R-Yup-Zback (Standard)' },
    { id: 'R-Ydown-Zfwd', label: 'R-Ydown-Zfwd (OpenCV)' },
    { id: 'L-Yup-Zfwd', label: 'L-Yup-Zfwd (DirectX)' },
    { id: 'L-Ydown-Zfwd', label: 'L-Ydown-Zfwd (Vulkan)' }
];

const OPENGL_PRESET_IDS = new Set<CoordinateId>(OPENGL_PRESET_ITEMS.map((item) => item.id));

const isRectNorm = (rect: unknown): rect is RectNorm => {
    if (!rect || typeof rect !== 'object') return false;
    const r = rect as RectNorm;
    return Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
        && r.w > 0 && r.h > 0;
};

const axisValue = (point: SampledPoint, axis: AxisDir) => {
    if (axis === '+X') return point.x;
    if (axis === '-X') return -point.x;
    if (axis === '+Y') return point.y;
    if (axis === '-Y') return -point.y;
    if (axis === '+Z') return point.z;
    return -point.z;
};

type StoredViewRange = {
    top: { xMin: number; xMax: number; yMin: number; yMax: number };
    front: { xMin: number; xMax: number; yMin: number; yMax: number };
};

type OTMLCalibrationRecord = {
    modelFilename?: string;
    axisPresetId: string;
    sourceAxisPresetId?: string | null;
    targetAxisPresetId?: string | null;
    viewRange: StoredViewRange;
    verticalMapImage: string | null;
    frontViewImage: string | null;
    canonicalTopSelection?: RectNorm | null;
    canonicalFrontSelection?: RectNorm | null;
    bestCamera?: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number }; fovDeg?: number; eyeHeightMeters?: number } | null;
    selectedBestCameraId?: string | null;
    imageMime?: string | null;
};

const computeAxisSpan = (points: SampledPoint[], axis: AxisDir) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        const v = axisValue(p, axis);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
        count += 1;
    }
    if (count === 0 || !Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: -1, max: 1, span: 2, count: 0 };
    }
    return { min, max, span: Math.max(1e-6, max - min), count };
};

const summarizePointCloud = (points: SampledPoint[]) => {
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    let zMin = Number.POSITIVE_INFINITY;
    let zMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
        if (p.z < zMin) zMin = p.z;
        if (p.z > zMax) zMax = p.z;
    }
    return { xMin, xMax, yMin, yMax, zMin, zMax };
};

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .otml-align-modal {
        position: fixed;
        inset: 0;
        background: rgba(2, 8, 20, 0.72);
        backdrop-filter: blur(3px);
        z-index: 160;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 14px;
    }
    .otml-align-modal.visible { display: flex; }
    .otml-align-shell {
        width: min(1320px, calc(100vw - 12px));
        height: min(860px, calc(100vh - 12px));
        border-radius: 12px;
        border: 1px solid #1a3d6f;
        background: #071126;
        box-shadow: 0 18px 56px rgba(0, 0, 0, 0.5);
        color: #d8e6fb;
        font-family: "Segoe UI", Tahoma, sans-serif;
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr) 340px;
        overflow: hidden;
    }
    .otml-btn {
        height: 32px;
        border: 1px solid #2d4f7e;
        background: #0b1b38;
        color: #d8e6fb;
        border-radius: 7px;
        padding: 0 12px;
        font-size: 12px;
        cursor: pointer;
    }
    .otml-btn:hover { border-color: #4f75ab; }
    .otml-btn.primary { background: linear-gradient(180deg, #2f77ff, #255dcc); border-color: #5e8de8; color: #fff; }
    .otml-btn.warn { background: linear-gradient(180deg, #562236, #3d1528); border-color: #8f3154; color: #ffd2df; }
    .otml-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .otml-params {
        border-right: 1px solid #18365f;
        background: rgba(8, 18, 39, 0.84);
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .otml-params-head,
    .otml-side-head {
        padding: 14px;
        border-bottom: 1px solid #1a355a;
        display: flex;
        justify-content: flex-start;
        align-items: center;
    }
    .otml-params-head h2,
    .otml-side-head h2 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
    }
    .otml-side-head { justify-content: space-between; }
    .otml-params-body { padding: 14px; overflow: auto; }
    .otml-mini-title { font-size: 10px; font-weight: 700; color: #8ca5c7; letter-spacing: 0.07em; margin-bottom: 8px; }
    .otml-field-title { font-size: 10px; font-weight: 700; color: #8ca5c7; letter-spacing: 0.07em; margin-bottom: 6px; }
    .otml-select {
        width: 100%;
        height: 32px;
        border-radius: 7px;
        border: 1px solid #24466f;
        background: #081a36;
        color: #e4efff;
        padding: 0 10px;
        font-size: 12px;
    }
    .otml-check-row { display: flex; gap: 10px; margin-bottom: 16px; }
    .otml-check-row label { display: flex; gap: 4px; align-items: center; font-size: 11px; color: #b8cae3; }
    .otml-param-group { margin-bottom: 14px; }
    .otml-param-group.compact { margin-bottom: 0; }
    .otml-param-label { font-size: 11px; font-weight: 700; margin-bottom: 6px; letter-spacing: 0.05em; }
    .otml-param-label.red { color: #ff5a5a; }
    .otml-param-label.green { color: #1fdb88; }
    .otml-param-label.blue { color: #6ba6ff; }
    .otml-minmax { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .otml-minmax .cell {
        border: 1px solid #24466f;
        border-radius: 7px;
        background: #081a36;
        padding: 6px 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .otml-minmax .tag {
        color: #7e97b9;
        font-size: 9px;
        letter-spacing: 0.05em;
        min-width: 24px;
        flex: 0 0 auto;
    }
    .otml-minmax input,
    .otml-single input,
    .otml-field input {
        width: 100%;
        border: none;
        background: transparent;
        color: #e6f1ff;
        font-size: 12px;
        outline: none;
        text-align: right;
    }
    .otml-twin { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 4px 0 8px; }
    .otml-single { border: 1px solid #24466f; border-radius: 7px; background: #081a36; padding: 6px 8px; }
    .otml-single input { text-align: left; }

    .otml-main {
        padding: 14px;
        display: grid;
        grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px;
        min-height: 0;
        overflow: auto;
    }
    .otml-pane {
        border: 1px solid #1f4f84;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.4);
        padding: 10px;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
    .otml-pane.active { box-shadow: inset 0 0 0 1px rgba(64, 136, 255, 0.45); }
    .otml-pane-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .otml-pane-title { font-weight: 700; }
    .otml-pane-note { font-size: 11px; color: #8ca6c9; }
    .otml-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 0; flex: 1 1 auto; }
    .otml-canvas-card { border: 1px solid #234669; border-radius: 8px; background: #020b1c; padding: 8px; display: flex; flex-direction: column; min-height: 0; position: relative; }
    .otml-tag {
        font-size: 11px;
        color: #89a6c9;
        margin-bottom: 6px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .otml-tag::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #5ea4ff;
        flex: 0 0 auto;
    }
    .otml-tag[data-role$='front-tag']::before { background: #e2b840; }
    .otml-canvas-wrap { position: relative; flex: 1 1 auto; min-height: 0; }
    .otml-canvas {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: 6px;
        border: none;
        background: transparent;
        background-image:
            linear-gradient(to right, rgba(24, 167, 179, 0.17) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(24, 167, 179, 0.17) 1px, transparent 1px);
        background-size: 20px 20px;
    }
    .otml-view-tools {
        position: absolute;
        right: 8px;
        bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .otml-view-tool {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: 1px solid #2c4f7b;
        background: rgba(6, 17, 36, 0.9);
        color: #b9d3f6;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
    }
    .otml-view-tool:hover { border-color: #4f75ab; color: #e4f0ff; }

    .otml-icon-tools { display: flex; gap: 6px; }
    .otml-icon-wrap { position: relative; }
    .otml-icon-btn {
        width: 26px;
        height: 26px;
        border-radius: 7px;
        border: 1px solid #2b4f7b;
        background: #0b1b38;
        color: #aac8f2;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .otml-icon-btn:hover { border-color: #4f75ab; color: #e3f0ff; }
    .otml-tip {
        position: absolute;
        right: 0;
        top: calc(100% + 4px);
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #345a87;
        background: #0a1e3e;
        color: #dbe9ff;
        font-size: 10px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
        z-index: 5;
    }
    .otml-icon-wrap:hover .otml-tip { opacity: 1; }

    .otml-side {
        border-left: 1px solid #18365f;
        background: rgba(8, 18, 39, 0.84);
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .otml-side-body { padding: 14px; overflow: auto; flex: 1 1 auto; min-height: 0; }
    .otml-preset-groups { display: grid; gap: 12px; }
    .otml-preset-group .otml-mini-title { margin-bottom: 6px; }
    .otml-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .otml-preset-grid.opengl { grid-template-columns: 1fr; }
    .otml-preset {
        height: 28px;
        border-radius: 7px;
        border: 1px solid #2b4f7b;
        background: #0a1b37;
        color: #d8e6fb;
        font-size: 9px;
        cursor: pointer;
        padding: 0 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .otml-preset.active { border-color: #3f89ff; background: #0f2a57; color: #90c1ff; }
    .otml-status { min-height: 20px; font-size: 12px; color: #8ca6c9; margin-top: 10px; }
    .otml-candidate-title { margin-top: 10px; font-size: 10px; font-weight: 700; color: #8ca5c7; letter-spacing: 0.07em; }
    .otml-candidate-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .otml-candidate-btn {
        height: 30px;
        border-radius: 7px;
        border: 1px solid #2b4f7b;
        background: #0a1b37;
        color: #d8e6fb;
        font-size: 11px;
        cursor: pointer;
    }
    .otml-candidate-btn.active { border-color: #69a8ff; background: #173463; color: #ffffff; }
    .otml-candidate-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .otml-side-tools { display: inline-flex; align-items: center; gap: 6px; }
    .otml-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #30507a;
        background: #091935;
        color: #9cb6d8;
        cursor: pointer;
    }
    .otml-close-btn:hover { color: #e2efff; border-color: #4f75ab; }
    .otml-side-action[aria-busy='true'] { opacity: 0.7; }

    @media (max-width: 1220px) {
        .otml-align-shell { grid-template-columns: 1fr; height: calc(100vh - 12px); overflow: auto; }
        .otml-params, .otml-side { border: 1px solid #18365f; border-radius: 10px; }
        .otml-main { order: 2; grid-template-rows: auto auto; }
        .otml-params { order: 1; }
        .otml-side { order: 3; }
    }
    @media (max-width: 860px) {
        .otml-pair { grid-template-columns: 1fr; }
    }
    `;
    document.head.appendChild(style);
};

const drawViewToCanvas = (
    canvas: HTMLCanvasElement,
    result: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front'],
    borderColor: string,
    overlay?: { pointX: number; pointY: number; tipX: number; tipY: number; showDirection: boolean },
    showBoundingBox = true,
    boxRect?: RectNorm,
    rasterView?: RasterViewState,
    modelAspect?: number,
    candidatePoints?: Array<{ pointX: number; pointY: number; selected: boolean }>
): CanvasFitTransform | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const sw = result.image.width;
    const sh = result.image.height;
    const xSpan = Math.max(1e-6, result.xRange.max - result.xRange.min);
    const ySpan = Math.max(1e-6, result.yRange.max - result.yRange.min);
    const targetAspect = Number.isFinite(modelAspect) && (modelAspect as number) > 0
        ? (modelAspect as number)
        : (xSpan / ySpan);
    const canvasAspect = canvas.width / Math.max(1, canvas.height);

    let baseDw = canvas.width;
    let baseDh = canvas.height;
    if (targetAspect > canvasAspect) {
        baseDh = baseDw / targetAspect;
    } else {
        baseDw = baseDh * targetAspect;
    }
    const zoom = clamp(rasterView?.zoom ?? 1, 0.3, 8);
    const dw = baseDw * zoom;
    const dh = baseDh * zoom;
    const dx = (canvas.width - dw) * 0.5 + (rasterView?.offsetX ?? 0);
    const dy = (canvas.height - dh) * 0.5 + (rasterView?.offsetY ?? 0);

    const image = new ImageData(new Uint8ClampedArray(result.image.pixels), sw, sh);
    const rasterCanvas = document.createElement('canvas');
    rasterCanvas.width = sw;
    rasterCanvas.height = sh;
    const rasterCtx = rasterCanvas.getContext('2d');
    if (!rasterCtx) return null;
    rasterCtx.putImageData(image, 0, 0);

    ctx.fillStyle = '#020a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rasterCanvas, 0, 0, sw, sh, dx, dy, dw, dh);

    const rect = boxRect ?? result.rect;
    const x = dx + rect.x * dw;
    const y = dy + rect.y * dh;
    const w = rect.w * dw;
    const h = rect.h * dh;

    if (showBoundingBox) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = borderColor;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + h, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w, y + h, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    if (overlay) {
        const overlayPointX = dx + (overlay.pointX / Math.max(1, sw)) * dw;
        const overlayPointY = dy + (overlay.pointY / Math.max(1, sh)) * dh;
        const overlayTipX = dx + (overlay.tipX / Math.max(1, sw)) * dw;
        const overlayTipY = dy + (overlay.tipY / Math.max(1, sh)) * dh;
        ctx.strokeStyle = '#ffd85e';
        ctx.fillStyle = '#ffd85e';
        ctx.lineWidth = 2;
        if (overlay.showDirection) {
            ctx.beginPath();
            ctx.moveTo(overlayPointX, overlayPointY);
            ctx.lineTo(overlayTipX, overlayTipY);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(overlayPointX, overlayPointY, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    if (candidatePoints && candidatePoints.length > 0) {
        candidatePoints.forEach((candidate) => {
            const xPos = dx + (candidate.pointX / Math.max(1, sw)) * dw;
            const yPos = dy + (candidate.pointY / Math.max(1, sh)) * dh;
            ctx.fillStyle = candidate.selected ? '#ffd85e' : '#80b9ff';
            ctx.strokeStyle = candidate.selected ? '#ffe9a2' : '#2d6ec2';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(xPos, yPos, candidate.selected ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    return {
        dx,
        dy,
        dw,
        dh,
        sourceWidth: sw,
        sourceHeight: sh
    };
};

type CanvasFitTransform = {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    sourceWidth: number;
    sourceHeight: number;
};

type RasterViewState = {
    zoom: number;
    offsetX: number;
    offsetY: number;
};

const clearCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#020a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const PLY_TYPE_SIZE: Record<string, number> = {
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

const readPlyValue = (view: DataView, offset: number, type: string) => {
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

const findHeaderEndOffset = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length - 11; i += 1) {
        if (
            bytes[i] === 101 && bytes[i + 1] === 110 && bytes[i + 2] === 100 && bytes[i + 3] === 95 &&
            bytes[i + 4] === 104 && bytes[i + 5] === 101 && bytes[i + 6] === 97 && bytes[i + 7] === 100 &&
            bytes[i + 8] === 101 && bytes[i + 9] === 114
        ) {
            let end = i + 10;
            if (bytes[end] === 13 && bytes[end + 1] === 10) end += 2;
            else if (bytes[end] === 10) end += 1;
            return end;
        }
    }
    return -1;
};

const parsePlyPoints = async (file: File): Promise<ParseResult> => {
    const issues: string[] = [];
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.ply')) {
        return {
            points: [],
            issues: ['Current parser supports .ply only. For other formats, no projection points are available yet.'],
            meta: { format: 'unsupported', vertexCount: 0 }
        };
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const headerEnd = findHeaderEndOffset(bytes);
    if (headerEnd < 0) {
        return {
            points: [],
            issues: ['PLY header end not found (end_header).'],
            meta: { format: 'unknown', vertexCount: 0 }
        };
    }

    const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
    const lines = headerText.split(/\r?\n/);
    const formatLine = lines.find((line) => line.startsWith('format ')) || '';
    const isAscii = formatLine.includes('ascii');
    const isBinaryLE = formatLine.includes('binary_little_endian');
    if (!isAscii && !isBinaryLE) {
        return {
            points: [],
            issues: [`Unsupported PLY format line: ${formatLine || '<empty>'}`],
            meta: { format: 'unsupported', vertexCount: 0 }
        };
    }

    const vertexLine = lines.find((line) => line.startsWith('element vertex ')) || '';
    const vertexCount = Number(vertexLine.split(/\s+/)[2] || 0);
    if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
        return {
            points: [],
            issues: ['Vertex count missing or invalid.'],
            meta: { format: isAscii ? 'ascii' : 'binary_little_endian', vertexCount: 0 }
        };
    }

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
        if (!line.startsWith('property ')) continue;
        if (line.startsWith('property list')) continue;
        const seg = line.trim().split(/\s+/);
        if (seg.length >= 3) {
            if (inVertex) props.push({ type: seg[1], name: seg[2] });
            if (inChunk) chunkProps.push({ type: seg[1], name: seg[2] });
        }
    }

    const chunkLine = lines.find((line) => line.startsWith('element chunk ')) || '';
    const chunkCount = Number(chunkLine.split(/\s+/)[2] || 0);

    const ix = props.findIndex((p) => p.name === 'x' || p.name === 'means_0' || p.name === 'position_x');
    const iy = props.findIndex((p) => p.name === 'y' || p.name === 'means_1' || p.name === 'position_y');
    const iz = props.findIndex((p) => p.name === 'z' || p.name === 'means_2' || p.name === 'position_z');
    const io = props.findIndex((p) => p.name === 'opacity' || p.name === 'alpha');

    const packedPositionIndex = props.findIndex((p) => p.name === 'packed_position');
    const packedColorIndex = props.findIndex((p) => p.name === 'packed_color');
    const hasPlainPosition = ix >= 0 && iy >= 0 && iz >= 0;
    const hasPackedPosition = packedPositionIndex >= 0 && chunkCount > 0 && chunkProps.length > 0;

    if (!hasPlainPosition && !hasPackedPosition) {
        return {
            points: [],
            issues: ['Required XYZ properties were not found in PLY vertex properties.'],
            meta: { format: isAscii ? 'ascii' : 'binary_little_endian', vertexCount }
        };
    }

    const points: SampledPoint[] = [];
    const step = Math.max(1, Math.floor(vertexCount / 45000));
    const propOffsets: number[] = [];
    let rollingOffset = 0;
    for (const p of props) {
        propOffsets.push(rollingOffset);
        rollingOffset += PLY_TYPE_SIZE[p.type] || 4;
    }

    if (isAscii) {
        if (!hasPlainPosition) {
            return {
                points: [],
                issues: ['ASCII PLY without plain x/y/z is not supported for projection yet.'],
                meta: { format: 'ascii', vertexCount }
            };
        }
        const body = new TextDecoder().decode(bytes.slice(headerEnd));
        const rows = body.split(/\r?\n/);
        for (let vi = 0, ri = 0; vi < vertexCount && ri < rows.length; vi += 1, ri += 1) {
            if (vi % step !== 0) continue;
            const row = rows[ri].trim();
            if (!row) continue;
            const seg = row.split(/\s+/);
            const x = Number(seg[ix]);
            const y = Number(seg[iy]);
            const z = Number(seg[iz]);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            const opRaw = io >= 0 ? Number(seg[io]) : 1;
            const opacity = io >= 0 ? 1 / (1 + Math.exp(-opRaw)) : 1;
            if (opacity < 0.04) continue;
            points.push({ x, y, z, opacity });
            if (points.length >= 50000) break;
        }
        if (points.length === 0) issues.push('ASCII PLY parsed but produced zero valid points (check opacity/property mapping).');
        return {
            points,
            issues,
            meta: { format: 'ascii', vertexCount }
        };
    }

    const view = new DataView(buffer, headerEnd);
    const rowSize = props.reduce((sum, p) => sum + (PLY_TYPE_SIZE[p.type] || 4), 0);
    if (rowSize <= 0) {
        return {
            points: [],
            issues: ['Computed vertex row size is invalid.'],
            meta: { format: 'binary_little_endian', vertexCount }
        };
    }

    const chunkStride = chunkProps.reduce((sum, p) => sum + (PLY_TYPE_SIZE[p.type] || 4), 0);
    const chunkOffsets: number[] = [];
    let chunkRun = 0;
    for (const p of chunkProps) {
        chunkOffsets.push(chunkRun);
        chunkRun += PLY_TYPE_SIZE[p.type] || 4;
    }
    const chunkTableBytes = Math.max(0, chunkCount) * chunkStride;
    const vertexBaseOffset = chunkTableBytes;

    if (!hasPlainPosition && hasPackedPosition) {
        const chunkPropIndex = (name: string) => chunkProps.findIndex((p) => p.name === name);
        const chunkMinX = chunkPropIndex('min_x');
        const chunkMinY = chunkPropIndex('min_y');
        const chunkMinZ = chunkPropIndex('min_z');
        const chunkMaxX = chunkPropIndex('max_x');
        const chunkMaxY = chunkPropIndex('max_y');
        const chunkMaxZ = chunkPropIndex('max_z');

        const chunks: Array<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = [];
        for (let ci = 0; ci < chunkCount; ci += 1) {
            const base = ci * chunkStride;
            if (base + chunkStride > view.byteLength) break;
            const readChunk = (propIdx: number) => {
                if (propIdx < 0) return 0;
                return Number(readPlyValue(view, base + chunkOffsets[propIdx], chunkProps[propIdx].type));
            };
            chunks.push({
                minX: readChunk(chunkMinX),
                minY: readChunk(chunkMinY),
                minZ: readChunk(chunkMinZ),
                maxX: readChunk(chunkMaxX),
                maxY: readChunk(chunkMaxY),
                maxZ: readChunk(chunkMaxZ)
            });
        }

        const unpackUnorm = (value: number, bits: number) => value / ((1 << bits) - 1);
        for (let vi = 0; vi < vertexCount; vi += 1) {
            if (vi % step !== 0) continue;
            const base = vertexBaseOffset + vi * rowSize;
            if (base + rowSize > view.byteLength) break;
            const packedPos = Number(readPlyValue(view, base + propOffsets[packedPositionIndex], props[packedPositionIndex].type));
            const chunk = chunks[Math.floor(vi / 256)];
            if (!chunk || !Number.isFinite(packedPos)) continue;

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

            let opacity = 1;
            if (packedColorIndex >= 0) {
                const packedColor = Number(readPlyValue(view, base + propOffsets[packedColorIndex], props[packedColorIndex].type));
                const alphaByte = packedColor & 0xff;
                opacity = alphaByte / 255;
            }
            if (opacity >= 0.04) points.push({ x, y, z, opacity });
            if (points.length >= 50000) break;
        }
    } else {
        for (let vi = 0; vi < vertexCount; vi += 1) {
            const base = vertexBaseOffset + vi * rowSize;
            if (base + rowSize > view.byteLength) break;
            if (vi % step === 0) {
                const x = Number(readPlyValue(view, base + propOffsets[ix], props[ix].type));
                const y = Number(readPlyValue(view, base + propOffsets[iy], props[iy].type));
                const z = Number(readPlyValue(view, base + propOffsets[iz], props[iz].type));
                const opRaw = io >= 0
                    ? Number(readPlyValue(view, base + propOffsets[io], props[io].type))
                    : 1;
                if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                    const opacity = io >= 0 ? 1 / (1 + Math.exp(-opRaw)) : 1;
                    if (opacity >= 0.04) points.push({ x, y, z, opacity });
                }
                if (points.length >= 50000) break;
            }
        }
    }

    if (points.length === 0) issues.push('Binary PLY parsed but produced zero valid points (check layout/property mapping).');
    return {
        points,
        issues,
        meta: { format: 'binary_little_endian', vertexCount }
    };
};

class OTMLIntelligentAlignPanel implements OTMLIntelligentAlignController {
    private readonly modal: HTMLDivElement;

    private readonly statusEl: HTMLDivElement;

    private readonly paneOriginalEl: HTMLDivElement;

    private readonly paneCanonicalEl: HTMLDivElement;

    private readonly originalTopCanvas: HTMLCanvasElement;

    private readonly originalFrontCanvas: HTMLCanvasElement;

    private readonly originalTopWrapEl: HTMLDivElement;

    private readonly originalFrontWrapEl: HTMLDivElement;

    private readonly canonicalTopWrapEl: HTMLDivElement;

    private readonly canonicalFrontWrapEl: HTMLDivElement;

    private readonly canonicalTopCanvas: HTMLCanvasElement;

    private readonly canonicalFrontCanvas: HTMLCanvasElement;

    private readonly originalTitleEl: HTMLDivElement;

    private readonly originalTopTagEl: HTMLDivElement;

    private readonly originalFrontTagEl: HTMLDivElement;

    private readonly canonicalTopTagEl: HTMLDivElement;

    private readonly canonicalFrontTagEl: HTMLDivElement;

    private readonly paramInputs: Record<keyof ProjectionParams, HTMLInputElement>;

    private readonly flyEyeHeightInput: HTMLInputElement;

    private readonly flyFovInput: HTMLInputElement;

    private readonly candidateGridEl: HTMLDivElement;

    private activePane: PaneId = 'original';

    private selectedSourceCoordinateId: CoordinateId = 'R-Ydown-Zback';

    private originalProjectionParams: ProjectionParams = defaultProjectionParams();

    private canonicalProjectionParams: ProjectionParams = defaultProjectionParams();

    private sampledPoints: SampledPoint[] = [];

    private originalSampledPoints: SampledPoint[] = [];

    private currentModelFilename: string | null = null;

    private canonicalSampledPoints: SampledPoint[] | null = null;

    private originalResult: ProjectionByAxisResult | null = null;

    private canonicalResult: ProjectionByAxisResult | null = null;

    private rotatedToCanonical = false;

    private bestCamera: CameraPose | null = null;

    private bestCameraCandidates: BestFlyCameraCandidate[] = [];

    private selectedBestCameraId: string | null = null;

    private flyEyeHeightMeters = 1.65;

    private flyFovDeg = 120;

    private liveCameraPose: CameraPose | null = null;

    private step3DualViewSink: OTMLStep3DualViewSink | null = null;

    private livePreviewRaf = 0;

    private parseIssues: string[] = [];

    private canonicalTopSelection: RectNorm | null = null;

    private canonicalFrontSelection: RectNorm | null = null;

    private canonicalTopTransform: CanvasFitTransform | null = null;

    private canonicalFrontTransform: CanvasFitTransform | null = null;

    private canonicalTopRasterView: RasterViewState = { zoom: 1, offsetX: 0, offsetY: 0 };

    private canonicalFrontRasterView: RasterViewState = { zoom: 1, offsetX: 0, offsetY: 0 };

    private originalModelAspect = { top: 1, front: 1 };

    private canonicalModelAspect = { top: 1, front: 1 };

    private dragState: {
        pointerId: number;
        view: CanonicalViewId;
        mode: DragMode;
        startX: number;
        startY: number;
        startRect: RectNorm;
        startOffsetX: number;
        startOffsetY: number;
    } | null = null;

    constructor(private readonly options: OTMLIntelligentAlignOptions) {
        ensureStyle();

        this.modal = document.createElement('div');
        this.modal.className = 'otml-align-modal';
        this.modal.innerHTML = `
            <div class="otml-align-shell">
                <div class="otml-params">
                    <div class="otml-params-head">
                        <h2>PARAMETERS</h2>
                    </div>
                    <div class="otml-params-body">
                        <div class="otml-mini-title">2D MAP STYLE</div>
                        <select class="otml-select" aria-label="2D map style">
                            <option>Visual</option>
                        </select>

                        <div class="otml-mini-title" style="margin-top:14px;">OVERLAYS</div>
                        <div class="otml-check-row">
                            <label><input type="checkbox" checked /> Density Heat</label>
                            <label><input type="checkbox" checked /> Contour</label>
                            <label><input type="checkbox" checked /> Grid</label>
                        </div>

                        <div class="otml-param-group">
                            <div class="otml-param-label red">X-AXIS</div>
                            <div class="otml-minmax">
                                <div class="cell"><div class="tag">MIN</div><input data-param="xRangeMin" type="number" step="0.1" /></div>
                                <div class="cell"><div class="tag">MAX</div><input data-param="xRangeMax" type="number" step="0.1" /></div>
                            </div>
                        </div>

                        <div class="otml-param-group">
                            <div class="otml-param-label green">PLANE-B</div>
                            <div class="otml-minmax">
                                <div class="cell"><div class="tag">MIN</div><input data-param="heightMin" type="number" step="0.1" /></div>
                                <div class="cell"><div class="tag">MAX</div><input data-param="heightMax" type="number" step="0.1" /></div>
                            </div>
                        </div>

                        <div class="otml-param-group">
                            <div class="otml-param-label blue">SLICE (M)</div>
                            <div class="otml-minmax">
                                <div class="cell"><div class="tag">MIN</div><input data-param="sliceMin" type="number" step="0.1" /></div>
                                <div class="cell"><div class="tag">MAX</div><input data-param="sliceMax" type="number" step="0.1" /></div>
                            </div>
                        </div>

                        <div class="otml-twin">
                            <div class="otml-param-group compact">
                                <div class="otml-field-title">EYE HEIGHT (M)</div>
                                    <div class="otml-single"><input data-param="flyEyeHeight" type="number" step="0.1" value="1.65" /></div>
                            </div>
                            <div class="otml-param-group compact">
                                <div class="otml-field-title">FOV</div>
                                    <div class="otml-single"><input data-param="flyFov" type="number" step="1" value="120" /></div>
                            </div>
                        </div>
                        <div class="otml-pane-note">Enter: use current params (no auto-boundary)</div>
                    </div>
                </div>

                <div class="otml-main">
                    <div class="otml-pane active" data-pane="original">
                        <div class="otml-pane-head">
                            <div>
                                <div class="otml-pane-title" data-role="original-title">Original Projection</div>
                            </div>
                            <div class="otml-icon-tools">
                                <div class="otml-icon-wrap">
                                    <button type="button" class="otml-icon-btn" data-act="original-redraw-natural-robust" aria-label="Robust natural redraw original">
                                        <span style="font-size:10px;font-weight:700;line-height:1;">N*</span>
                                    </button>
                                    <span class="otml-tip">Natural Robust</span>
                                </div>
                                <div class="otml-icon-wrap">
                                    <button type="button" class="otml-icon-btn" data-act="rotate" aria-label="Rotate to canonical">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="23 4 23 10 17 10"></polyline>
                                            <path d="M20.49 15A9 9 0 1 1 23 10"></path>
                                        </svg>
                                    </button>
                                    <span class="otml-tip">Rotate</span>
                                </div>
                            </div>
                        </div>
                        <div class="otml-pair">
                            <div class="otml-canvas-card"><div class="otml-tag" data-role="original-top-tag">Top View [X, Y]</div><div class="otml-canvas-wrap" data-role="original-top-wrap"><canvas class="otml-canvas" data-canvas="original-top" width="420" height="210"></canvas></div></div>
                            <div class="otml-canvas-card"><div class="otml-tag" data-role="original-front-tag">Front View [X, Y]</div><div class="otml-canvas-wrap" data-role="original-front-wrap"><canvas class="otml-canvas" data-canvas="original-front" width="420" height="210"></canvas></div></div>
                        </div>
                    </div>

                    <div class="otml-pane" data-pane="canonical">
                        <div class="otml-pane-head">
                            <div>
                                <div class="otml-pane-title">Rotated Projection (R-Yup-Zback)</div>
                            </div>
                            <div class="otml-icon-tools">
                                <div class="otml-icon-wrap">
                                    <button type="button" class="otml-icon-btn" data-act="canonical-redraw" aria-label="Redraw canonical view">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="1 4 1 10 7 10"></polyline>
                                            <polyline points="23 20 23 14 17 14"></polyline>
                                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>
                                            <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14"></path>
                                        </svg>
                                    </button>
                                    <span class="otml-tip">Redraw</span>
                                </div>
                                <div class="otml-icon-wrap">
                                    <button type="button" class="otml-icon-btn" data-act="recommend" aria-label="Recommend best fly camera">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M21 3 14 10"></path>
                                            <path d="M10 14 3 21"></path>
                                            <path d="M21 3 16 21 10 14 3 8Z"></path>
                                        </svg>
                                    </button>
                                    <span class="otml-tip">Best View</span>
                                </div>
                                <div class="otml-icon-wrap">
                                    <button type="button" class="otml-icon-btn" data-act="canonical-redraw-quantile" aria-label="Step3 quantile redraw">
                                        <span style="font-size:10px;font-weight:700;line-height:1;">Q</span>
                                    </button>
                                    <span class="otml-tip">Quantile 2-98</span>
                                </div>
                            </div>
                        </div>
                        <div class="otml-pair">
                            <div class="otml-canvas-card">
                                <div class="otml-tag" data-role="canonical-top-tag">Top View [X, -Z]</div>
                                <div class="otml-canvas-wrap" data-role="canonical-top-wrap">
                                    <canvas class="otml-canvas" data-canvas="canonical-top" width="420" height="210"></canvas>
                                    <div class="otml-view-tools">
                                        <button type="button" class="otml-view-tool" data-act="canonical-top-plus" aria-label="Zoom in top">+</button>
                                        <button type="button" class="otml-view-tool" data-act="canonical-top-minus" aria-label="Zoom out top">−</button>
                                        <button type="button" class="otml-view-tool" data-act="canonical-top-center" aria-label="Center top box">◎</button>
                                    </div>
                                </div>
                            </div>
                            <div class="otml-canvas-card">
                                <div class="otml-tag" data-role="canonical-front-tag">Front View [X, Y]</div>
                                <div class="otml-canvas-wrap" data-role="canonical-front-wrap">
                                    <canvas class="otml-canvas" data-canvas="canonical-front" width="420" height="210"></canvas>
                                    <div class="otml-view-tools">
                                        <button type="button" class="otml-view-tool" data-act="canonical-front-plus" aria-label="Zoom in front">+</button>
                                        <button type="button" class="otml-view-tool" data-act="canonical-front-minus" aria-label="Zoom out front">−</button>
                                        <button type="button" class="otml-view-tool" data-act="canonical-front-center" aria-label="Center front box">◎</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="otml-side">
                    <div class="otml-side-head">
                        <h2>CANDIDATES</h2>
                        <div class="otml-side-tools">
                            <div class="otml-icon-wrap">
                                <button type="button" class="otml-icon-btn otml-side-action" data-act="clear-db" aria-label="Clear DB residuals">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M7 7l1 12h8l1-12" /><path d="M10 11v5" /><path d="M14 11v5" />
                                    </svg>
                                </button>
                                <span class="otml-tip">Clear DB</span>
                            </div>
                            <div class="otml-icon-wrap">
                                <button type="button" class="otml-icon-btn otml-side-action" data-act="reset-workflow" aria-label="Reset workflow">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="1 4 1 10 7 10"></polyline>
                                        <polyline points="23 20 23 14 17 14"></polyline>
                                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>
                                        <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14"></path>
                                    </svg>
                                </button>
                                <span class="otml-tip">Reset</span>
                            </div>
                            <div class="otml-icon-wrap">
                                <button type="button" class="otml-icon-btn otml-side-action" data-act="confirm" aria-label="Confirm and apply">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                        <path d="M17 21v-8H7v8"></path>
                                        <path d="M7 3v5h8"></path>
                                    </svg>
                                </button>
                                <span class="otml-tip">Confirm &amp; Apply</span>
                            </div>
                            <button type="button" class="otml-close-btn" data-act="close">x</button>
                        </div>
                    </div>
                    <div class="otml-side-body">
                        <div class="otml-preset-groups">
                            <div class="otml-preset-group">
                                <div class="otml-mini-title">OPENGL</div>
                                <div class="otml-preset-grid opengl" data-role="preset-grid-opengl"></div>
                            </div>
                            <div class="otml-preset-group">
                                <div class="otml-mini-title">OTHERS</div>
                                <div class="otml-preset-grid others" data-role="preset-grid-others"></div>
                            </div>
                        </div>
                        <div class="otml-status" data-role="status"></div>
                        <div class="otml-candidate-title">BEST VIEW POINTS</div>
                        <div class="otml-candidate-grid" data-role="candidate-grid"></div>
                    </div>
                </div>
            </div>
        `;

        this.statusEl = this.modal.querySelector('[data-role="status"]') as HTMLDivElement;
        this.paneOriginalEl = this.modal.querySelector('[data-pane="original"]') as HTMLDivElement;
        this.paneCanonicalEl = this.modal.querySelector('[data-pane="canonical"]') as HTMLDivElement;
        this.originalTopCanvas = this.modal.querySelector('[data-canvas="original-top"]') as HTMLCanvasElement;
        this.originalFrontCanvas = this.modal.querySelector('[data-canvas="original-front"]') as HTMLCanvasElement;
        this.originalTopWrapEl = this.modal.querySelector('[data-role="original-top-wrap"]') as HTMLDivElement;
        this.originalFrontWrapEl = this.modal.querySelector('[data-role="original-front-wrap"]') as HTMLDivElement;
        this.canonicalTopCanvas = this.modal.querySelector('[data-canvas="canonical-top"]') as HTMLCanvasElement;
        this.canonicalFrontCanvas = this.modal.querySelector('[data-canvas="canonical-front"]') as HTMLCanvasElement;
        this.canonicalTopWrapEl = this.modal.querySelector('[data-role="canonical-top-wrap"]') as HTMLDivElement;
        this.canonicalFrontWrapEl = this.modal.querySelector('[data-role="canonical-front-wrap"]') as HTMLDivElement;
        this.originalTitleEl = this.modal.querySelector('[data-role="original-title"]') as HTMLDivElement;
        this.originalTopTagEl = this.modal.querySelector('[data-role="original-top-tag"]') as HTMLDivElement;
        this.originalFrontTagEl = this.modal.querySelector('[data-role="original-front-tag"]') as HTMLDivElement;
        this.canonicalTopTagEl = this.modal.querySelector('[data-role="canonical-top-tag"]') as HTMLDivElement;
        this.canonicalFrontTagEl = this.modal.querySelector('[data-role="canonical-front-tag"]') as HTMLDivElement;

        this.paramInputs = {
            sliceMin: this.modal.querySelector('[data-param="sliceMin"]') as HTMLInputElement,
            sliceMax: this.modal.querySelector('[data-param="sliceMax"]') as HTMLInputElement,
            xRangeMin: this.modal.querySelector('[data-param="xRangeMin"]') as HTMLInputElement,
            xRangeMax: this.modal.querySelector('[data-param="xRangeMax"]') as HTMLInputElement,
            heightMin: this.modal.querySelector('[data-param="heightMin"]') as HTMLInputElement,
            heightMax: this.modal.querySelector('[data-param="heightMax"]') as HTMLInputElement
        };
        this.flyEyeHeightInput = this.modal.querySelector('[data-param="flyEyeHeight"]') as HTMLInputElement;
        this.flyFovInput = this.modal.querySelector('[data-param="flyFov"]') as HTMLInputElement;
        this.candidateGridEl = this.modal.querySelector('[data-role="candidate-grid"]') as HTMLDivElement;

        this.bind();
        this.renderPresetButtons();
        this.renderCandidateButtons();
        this.syncParamInputs();
        this.syncFlyParamInputs();
        document.body.appendChild(this.modal);
        this.setStatus('Load a model first, then validate source projection.');
    }

    open() {
        this.modal.classList.add('visible');
        this.startLivePreviewLoop();
        if (this.originalResult) {
            requestAnimationFrame(() => {
                this.recomputePane('original', 'manual');
            });
        }
    }

    close() {
        this.modal.classList.remove('visible');
        this.stopLivePreviewLoop();
    }

    toggle() {
        this.modal.classList.toggle('visible');
        if (this.modal.classList.contains('visible')) {
            this.startLivePreviewLoop();
            if (this.originalResult) {
                requestAnimationFrame(() => {
                    this.recomputePane('original', 'manual');
                });
            }
        } else this.stopLivePreviewLoop();
    }

    async setModelFile(file: File | null) {
        this.resetFlowState();
        this.currentModelFilename = file?.name ?? null;
        this.debugLog('setModelFile:start', { name: file?.name ?? null, size: file?.size ?? 0 });
        if (!file) {
            this.sampledPoints = [];
            this.originalSampledPoints = [];
            this.renderAll();
            this.setStatus('No model loaded.');
            this.debugLog('setModelFile:empty');
            return;
        }
        const parsed = await parsePlyPoints(file);
        this.sampledPoints = parsed.points;
        this.originalSampledPoints = parsed.points.map((point) => ({ ...point }));
        this.canonicalSampledPoints = null;
        this.parseIssues = parsed.issues;
        if (this.sampledPoints.length > 0) {
            this.originalProjectionParams = suggestProjectionByCoordinate(this.originalSampledPoints, this.selectedSourceCoordinateId);
            this.canonicalProjectionParams = suggestProjectionByCoordinate(this.sampledPoints, CANONICAL_COORDINATE_ID);
            this.syncParamInputs();
        }
        this.debugLog('setModelFile:parsed', {
            format: parsed.meta.format,
            vertexCount: parsed.meta.vertexCount,
            sampledPoints: parsed.points.length,
            issues: parsed.issues,
            pointStats: summarizePointCloud(parsed.points),
            sampleFirst5: parsed.points.slice(0, 5)
        });
        if (this.sampledPoints.length > 0) {
            await this.tryRestoreCalibration(file.name);
        }
        this.setStatus(this.sampledPoints.length > 0
            ? `Model parsed: ${this.sampledPoints.length} samples. Validate source projection first.`
            : 'Model loaded. PLY samples unavailable; projection preview empty.');
        this.recomputePane('original', 'auto');
        this.pushStep3DualView();
    }

    async resetWorkflow() {
        this.resetFlowState();
        if (this.options.resetModelToLoadedState) await this.options.resetModelToLoadedState();
        this.recomputePane('original', 'auto');
        this.setStatus('Workflow reset to model-loaded baseline.');
    }

    attachStep3DualViewSink(sink: OTMLStep3DualViewSink | null) {
        this.step3DualViewSink = sink;
        this.pushStep3DualView();
    }

    private rasterViewToDataUrl(view: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front'], mime: string) {
        const canvas = document.createElement('canvas');
        canvas.width = view.image.width;
        canvas.height = view.image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const data = new ImageData(new Uint8ClampedArray(view.image.pixels), view.image.width, view.image.height);
        ctx.putImageData(data, 0, 0);
        return canvas.toDataURL(mime, 0.72);
    }

    private buildCalibrationRecord(modelFilename: string): OTMLCalibrationRecord | null {
        if (!this.canonicalResult) return null;
        const imageMime = 'image/webp';
        const topSelection = this.canonicalTopSelection ?? this.canonicalResult.top.rect;
        const frontSelection = this.canonicalFrontSelection ?? this.canonicalResult.front.rect;
        const verticalMapImage = this.rasterViewToDataUrl(this.canonicalResult.top, imageMime);
        const frontViewImage = this.rasterViewToDataUrl(this.canonicalResult.front, imageMime);

        return {
            modelFilename,
            axisPresetId: CANONICAL_COORDINATE_ID,
            sourceAxisPresetId: this.selectedSourceCoordinateId,
            targetAxisPresetId: CANONICAL_COORDINATE_ID,
            viewRange: {
                top: {
                    xMin: this.canonicalResult.top.xRange.min,
                    xMax: this.canonicalResult.top.xRange.max,
                    yMin: this.canonicalResult.top.yRange.min,
                    yMax: this.canonicalResult.top.yRange.max
                },
                front: {
                    xMin: this.canonicalResult.front.xRange.min,
                    xMax: this.canonicalResult.front.xRange.max,
                    yMin: this.canonicalResult.front.yRange.min,
                    yMax: this.canonicalResult.front.yRange.max
                }
            },
            verticalMapImage,
            frontViewImage,
            canonicalTopSelection: topSelection,
            canonicalFrontSelection: frontSelection,
            bestCamera: this.bestCamera ? {
                eye: this.bestCamera.eye,
                forward: this.bestCamera.forward,
                fovDeg: this.flyFovDeg,
                eyeHeightMeters: this.flyEyeHeightMeters
            } : null,
            selectedBestCameraId: this.selectedBestCameraId,
            imageMime
        };
    }

    private async putCalibrationToDb(modelFilename: string, calibration: OTMLCalibrationRecord) {
        const response = await fetch('/api/model/calibration', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelFilename, calibration })
        });
        if (!response.ok) {
            const body = await response.json().catch((_error: unknown): null => null);
            throw new Error(body?.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    private async getCalibrationFromDb(modelFilename: string): Promise<{ modelFilename: string; calibration: OTMLCalibrationRecord } | null> {
        const response = await fetch(`/api/model/calibration?modelFilename=${encodeURIComponent(modelFilename)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!body?.found || !body?.calibration) return null;
        return {
            modelFilename: String(body.modelFilename || modelFilename),
            calibration: body.calibration as OTMLCalibrationRecord
        };
    }

    private applyCalibrationRecord(calibration: OTMLCalibrationRecord) {
        const sourcePreset = normalizeCoordinateId(calibration.sourceAxisPresetId || calibration.axisPresetId)
            || this.selectedSourceCoordinateId;
        this.selectedSourceCoordinateId = sourcePreset;
        this.renderPresetButtons();

        if (calibration.viewRange?.top && calibration.viewRange?.front) {
            this.canonicalProjectionParams = {
                xRangeMin: Number(calibration.viewRange.top.xMin),
                xRangeMax: Number(calibration.viewRange.top.xMax),
                heightMin: Number(calibration.viewRange.top.yMin),
                heightMax: Number(calibration.viewRange.top.yMax),
                sliceMin: Number(calibration.viewRange.front.yMin),
                sliceMax: Number(calibration.viewRange.front.yMax)
            };
        }

        if (isRectNorm(calibration.canonicalTopSelection)) {
            this.canonicalTopSelection = calibration.canonicalTopSelection;
        }
        if (isRectNorm(calibration.canonicalFrontSelection)) {
            this.canonicalFrontSelection = calibration.canonicalFrontSelection;
        }

        const bestCamera = calibration.bestCamera;
        if (bestCamera && bestCamera.eye && bestCamera.forward) {
            this.bestCamera = {
                eye: bestCamera.eye,
                forward: bestCamera.forward
            };
            if (Number.isFinite(bestCamera.fovDeg)) this.flyFovDeg = Number(bestCamera.fovDeg);
            if (Number.isFinite(bestCamera.eyeHeightMeters)) this.flyEyeHeightMeters = Number(bestCamera.eyeHeightMeters);
            this.syncFlyParamInputs();
        }
        this.selectedBestCameraId = calibration.selectedBestCameraId || null;
    }

    private async tryRestoreCalibration(modelFilename: string) {
        try {
            const loaded = await this.getCalibrationFromDb(modelFilename);
            if (!loaded) return;
            if (loaded.modelFilename !== modelFilename) {
                throw new Error(`ModelFileName mismatch: expected '${modelFilename}', got '${loaded.modelFilename}'`);
            }
            this.applyCalibrationRecord(loaded.calibration);

            const sourcePreset = normalizeCoordinateId(loaded.calibration.sourceAxisPresetId || loaded.calibration.axisPresetId);
            const targetPreset = normalizeCoordinateId(loaded.calibration.targetAxisPresetId || loaded.calibration.axisPresetId);
            if (sourcePreset && targetPreset && sourcePreset !== targetPreset && targetPreset === CANONICAL_COORDINATE_ID) {
                const rotationPlan = buildRotationToCoordinate(sourcePreset, targetPreset);
                if (this.options.applyRotateToCanonical) {
                    await this.options.applyRotateToCanonical(rotationPlan);
                }
                this.rotatedToCanonical = true;
                this.canonicalSampledPoints = transformPointsByRotationPlan(this.sampledPoints, rotationPlan);
            }

            this.recomputePane('canonical', 'manual');
            this.pushStep3DualView();
            if (this.bestCamera && this.options.previewFlyCamera) {
                await Promise.resolve(this.options.previewFlyCamera(this.bestCamera, this.flyFovDeg));
            }
            this.setStatus(`Calibration restored from DB for ${modelFilename}.`);
            this.debugLog('calibration:restored', {
                modelFilename,
                sourceAxisPresetId: loaded.calibration.sourceAxisPresetId,
                targetAxisPresetId: loaded.calibration.targetAxisPresetId,
                selectedBestCameraId: loaded.calibration.selectedBestCameraId
            });
        } catch (error) {
            this.debugLog('calibration:restore-failed', { modelFilename, error: String(error) });
            this.setStatus(`Calibration restore skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async confirmAndApply() {
        const modelFilename = this.currentModelFilename;
        if (!modelFilename) throw new Error('No model loaded.');
        if (this.sampledPoints.length === 0) throw new Error('No sampled points available.');

        if (!this.rotatedToCanonical && this.selectedSourceCoordinateId !== CANONICAL_COORDINATE_ID) {
            const rotationPlan = buildRotationToCoordinate(this.selectedSourceCoordinateId, CANONICAL_COORDINATE_ID);
            if (this.options.applyRotateToCanonical) {
                await this.options.applyRotateToCanonical(rotationPlan);
            }
            this.rotatedToCanonical = true;
            this.canonicalSampledPoints = transformPointsByRotationPlan(this.sampledPoints, rotationPlan);
        }

        if (!this.canonicalResult) {
            this.recomputePane('canonical', 'manual');
        }
        if (!this.canonicalResult) {
            throw new Error('Canonical projection is unavailable.');
        }

        const calibration = this.buildCalibrationRecord(modelFilename);
        if (!calibration) {
            throw new Error('Failed to build calibration payload.');
        }
        await this.putCalibrationToDb(modelFilename, calibration);

        this.pushStep3DualView();
        this.setStatus(this.bestCamera
            ? 'Confirmed and saved. Rotation, canonical ranges and selected view points are persisted.'
            : 'Confirmed and saved. Rotation and canonical view points are persisted.');
        this.debugLog('confirm:success', {
            modelFilename,
            sourceAxisPresetId: calibration.sourceAxisPresetId,
            targetAxisPresetId: calibration.targetAxisPresetId,
            selectedBestCameraId: calibration.selectedBestCameraId
        });
    }

    private bind() {
        this.modal.querySelector('[data-act="close"]')?.addEventListener('click', () => this.close());

        this.modal.querySelector('[data-act="reset-workflow"]')?.addEventListener('click', () => {
            void this.resetWorkflow();
        });

        this.modal.querySelector('[data-act="rotate"]')?.addEventListener('click', async () => {
            this.debugLog('rotate:click', { sourceCoordinate: this.selectedSourceCoordinateId, sampledPoints: this.sampledPoints.length });
            if (this.sampledPoints.length === 0) {
                this.setStatus('No sampled points. Load a .ply model to continue.');
                this.debugLog('rotate:blocked', { reason: 'no sampled points' });
                return;
            }
            const rotationPlan = buildRotationToCoordinate(this.selectedSourceCoordinateId, CANONICAL_COORDINATE_ID);
            this.debugLog('rotate:solve-basis', rotationPlan);
            if (this.options.applyRotateToCanonical) {
                await this.options.applyRotateToCanonical(rotationPlan);
            }
            this.canonicalSampledPoints = transformPointsByRotationPlan(this.sampledPoints, rotationPlan);
            this.rotatedToCanonical = true;
            this.activePane = 'canonical';
            this.syncActivePaneStyle();
            this.syncParamInputs();
            this.recomputeFromTrigger('canonical', 'auto', 'rotate-click');
            this.bestCamera = null;
            this.bestCameraCandidates = [];
            this.selectedBestCameraId = null;
            this.renderCandidateButtons();
            this.pushStep3DualView();
            this.setStatus(`Model rotated to canonical ${CANONICAL_COORDINATE_ID}. Canonical screenshots now use Top[X, -Z] and Front[X, Y].`);
            this.debugLog('rotate:done', {
                target: CANONICAL_COORDINATE_ID,
                canonicalPointStats: summarizePointCloud(this.canonicalSampledPoints),
                canonicalSampleFirst5: this.canonicalSampledPoints.slice(0, 5)
            });
        });

        this.modal.querySelector('[data-act="canonical-redraw"]')?.addEventListener('click', () => {
            this.recomputeFromTrigger('canonical', 'auto', 'canonical-redraw');
            this.setStatus('Canonical pane auto-redrawn with recalculated bounds.');
        });

        this.modal.querySelector('[data-act="original-redraw-natural-robust"]')?.addEventListener('click', () => {
            void this.redrawOriginalByNaturalRobust();
        });

        this.modal.querySelector('[data-act="canonical-redraw-quantile"]')?.addEventListener('click', () => {
            this.redrawCanonicalByStep3Quantile();
        });

        this.modal.querySelector('[data-act="canonical-top-plus"]')?.addEventListener('click', () => {
            this.adjustCanonicalRasterZoom('top', 1.12);
        });
        this.modal.querySelector('[data-act="canonical-top-minus"]')?.addEventListener('click', () => {
            this.adjustCanonicalRasterZoom('top', 1 / 1.12);
        });
        this.modal.querySelector('[data-act="canonical-top-center"]')?.addEventListener('click', () => {
            this.centerCanonicalRaster('top');
        });

        this.modal.querySelector('[data-act="canonical-front-plus"]')?.addEventListener('click', () => {
            this.adjustCanonicalRasterZoom('front', 1.12);
        });
        this.modal.querySelector('[data-act="canonical-front-minus"]')?.addEventListener('click', () => {
            this.adjustCanonicalRasterZoom('front', 1 / 1.12);
        });
        this.modal.querySelector('[data-act="canonical-front-center"]')?.addEventListener('click', () => {
            this.centerCanonicalRaster('front');
        });

        this.canonicalTopCanvas.addEventListener('pointerdown', (event) => {
            this.beginSelectionDrag('top', event);
        });
        this.canonicalFrontCanvas.addEventListener('pointerdown', (event) => {
            this.beginSelectionDrag('front', event);
        });
        this.canonicalTopCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
        this.canonicalFrontCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
        window.addEventListener('pointermove', (event) => {
            this.continueSelectionDrag(event);
        });
        window.addEventListener('pointerup', (event) => {
            this.endSelectionDrag(event);
        });

        this.modal.querySelector('[data-act="recommend"]')?.addEventListener('click', () => {
            this.recommendBestCamera(false);
        });

        this.candidateGridEl.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const id = target.getAttribute('data-candidate-id');
            if (!id) return;
            this.selectBestCameraCandidate(id, true);
        });

        this.modal.querySelector('[data-act="confirm"]')?.addEventListener('click', async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            if (button.disabled) return;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.title = 'Saving...';
            try {
                await this.confirmAndApply();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.setStatus(`Confirm failed: ${message}`);
                this.debugLog('confirm:failed', { error: message });
            } finally {
                button.disabled = false;
                button.removeAttribute('aria-busy');
                button.title = 'Confirm & Apply';
            }
        });

        this.modal.querySelector('[data-act="clear-db"]')?.addEventListener('click', async () => {
            if (!this.options.clearDbResiduals) {
                this.setStatus('Clear DB is unavailable in this environment.');
                return;
            }
            const ok = window.confirm('Clear all DB residuals and reset workflow?');
            if (!ok) return;
            const result = await this.options.clearDbResiduals();
            await this.resetWorkflow();
            const deleted = result?.deleted;
            if (deleted) {
                this.setStatus(`DB cleared. calibration=${deleted.calibrations ?? 0}, coordinate=${deleted.coordinates ?? 0}, snapshot=${deleted.snapshots ?? 0}, model=${deleted.models ?? 0}`);
            } else {
                this.setStatus('DB cleared and workflow reset.');
            }
        });

        [this.paneOriginalEl, this.paneCanonicalEl].forEach((pane) => {
            pane.addEventListener('pointerdown', () => {
                const paneId = pane.getAttribute('data-pane') as PaneId;
                this.activePane = paneId;
                this.syncActivePaneStyle();
                this.syncParamInputs();
            });
        });

        Object.entries(this.paramInputs).forEach(([key, input]) => {
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const target = this.activePane === 'original' ? this.originalProjectionParams : this.canonicalProjectionParams;
                const value = Number.parseFloat(input.value);
                if (Number.isFinite(value)) {
                    (target as any)[key] = value;
                }
                this.recomputePane(this.activePane, 'manual');
                this.setStatus(`${this.activePane === 'original' ? 'Original' : 'Canonical'} pane redrawn from manual params.`);
            });
        });

        [this.flyEyeHeightInput, this.flyFovInput].forEach((input) => {
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                this.applyFlyParamInputs();
                this.recommendBestCamera(true);
            });
        });
    }

    private async clearNaturalInterferenceCaches() {
        const report: {
            localStorageCleared: boolean;
            sessionStorageCleared: boolean;
            cacheStorageDeleted: number;
            errors: string[];
        } = {
            localStorageCleared: false,
            sessionStorageCleared: false,
            cacheStorageDeleted: 0,
            errors: []
        };

        try {
            window.localStorage?.clear();
            report.localStorageCleared = true;
        } catch (error) {
            report.errors.push(`localStorage:${error instanceof Error ? error.message : String(error)}`);
        }

        try {
            window.sessionStorage?.clear();
            report.sessionStorageCleared = true;
        } catch (error) {
            report.errors.push(`sessionStorage:${error instanceof Error ? error.message : String(error)}`);
        }

        try {
            if ('caches' in window) {
                const names = await caches.keys();
                for (let i = 0; i < names.length; i += 1) {
                    const ok = await caches.delete(names[i]);
                    if (ok) report.cacheStorageDeleted += 1;
                }
            }
        } catch (error) {
            report.errors.push(`cacheStorage:${error instanceof Error ? error.message : String(error)}`);
        }

        this.debugLog('original:natural-cache-clear', report);
        return report;
    }

    private async redrawOriginalByNaturalRobust() {
        if (this.originalSampledPoints.length === 0) {
            this.setStatus('No sampled points. Load model first.');
            this.debugLog('original:natural-robust-redraw:blocked', { reason: 'no sampled points' });
            return;
        }

        const beforeProjection = {
            ...this.originalProjectionParams
        };
        const meanStdCandidate = suggestProjectionByCoordinate(this.originalSampledPoints, this.selectedSourceCoordinateId);
        const naturalCandidate = suggestProjectionByCoordinateNatural(this.originalSampledPoints, this.selectedSourceCoordinateId);
        const robustCandidate = suggestProjectionByCoordinateNaturalRobust(this.originalSampledPoints, this.selectedSourceCoordinateId);

        await this.clearNaturalInterferenceCaches();

        this.originalProjectionParams = robustCandidate;
        this.originalResult = null;
        this.originalModelAspect = { top: 1, front: 1 };
        this.recomputePane('original', 'manual');
        if (this.activePane === 'original') this.syncParamInputs();

        this.debugLog('original:natural-robust-redraw', {
            coordinateId: this.selectedSourceCoordinateId,
            points: this.originalSampledPoints.length,
            beforeProjection,
            meanStdCandidate,
            naturalCandidate,
            robustCandidate,
            appliedProjection: this.originalProjectionParams,
            mode: 'natural-robust-opacity-filter'
        });
        this.setStatus('Original pane redrawn with Natural Robust bounds.');
    }

    private redrawCanonicalByStep3Quantile() {
        const points = this.getCanonicalWorldPointsOrNull('canonical-redraw-quantile');
        if (!points) {
            this.setStatus('Canonical projection requires world points. Rotate model first.');
            this.debugLog('canonical:quantile-redraw:blocked', { reason: 'no world points', mode: 'world-only' });
            return;
        }

        this.canonicalProjectionParams = suggestProjectionByCoordinateQuantileStep3(points, CANONICAL_COORDINATE_ID);
        this.canonicalTopSelection = null;
        this.canonicalFrontSelection = null;
        this.canonicalTopRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
        this.canonicalFrontRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
        this.bestCamera = null;
        this.bestCameraCandidates = [];
        this.selectedBestCameraId = null;
        this.renderCandidateButtons();
        this.recomputeFromTrigger('canonical', 'manual', 'canonical-redraw-quantile');
        if (this.activePane === 'canonical') this.syncParamInputs();
        this.pushStep3DualView();

        this.debugLog('canonical:quantile-redraw', {
            points: points.length,
            projection: this.canonicalProjectionParams,
            mode: 'step3-quantile-2-98-pad-world-only'
        });
        this.setStatus('Canonical pane redrawn with Step3-style quantile bounds (2%-98% + pad).');
    }

    private getCanonicalSelection(view: CanonicalViewId): RectNorm | null {
        return view === 'top' ? this.canonicalTopSelection : this.canonicalFrontSelection;
    }

    private setCanonicalSelection(view: CanonicalViewId, rect: RectNorm) {
        const clamped: RectNorm = {
            x: clamp(rect.x, 0, 1 - rect.w),
            y: clamp(rect.y, 0, 1 - rect.h),
            w: clamp(rect.w, 0.04, 1),
            h: clamp(rect.h, 0.04, 1)
        };
        if (view === 'top') {
            this.canonicalTopSelection = clamped;
            const linked = this.ensureCanonicalSelection('front');
            if (linked) {
                this.canonicalFrontSelection = {
                    x: clamp(clamped.x, 0, 1 - clamped.w),
                    y: linked.y,
                    w: clamped.w,
                    h: linked.h
                };
            }
        } else {
            this.canonicalFrontSelection = clamped;
            const linked = this.ensureCanonicalSelection('top');
            if (linked) {
                this.canonicalTopSelection = {
                    x: clamp(clamped.x, 0, 1 - clamped.w),
                    y: linked.y,
                    w: clamped.w,
                    h: linked.h
                };
            }
        }
    }

    private getCanonicalRasterView(view: CanonicalViewId): RasterViewState {
        return view === 'top' ? this.canonicalTopRasterView : this.canonicalFrontRasterView;
    }

    private setCanonicalRasterView(view: CanonicalViewId, next: RasterViewState) {
        if (view === 'top') this.canonicalTopRasterView = next;
        else this.canonicalFrontRasterView = next;
    }

    private getCanonicalTransform(view: CanonicalViewId): CanvasFitTransform | null {
        return view === 'top' ? this.canonicalTopTransform : this.canonicalFrontTransform;
    }

    private getCanvasForView(view: CanonicalViewId): HTMLCanvasElement {
        return view === 'top' ? this.canonicalTopCanvas : this.canonicalFrontCanvas;
    }

    private ensureCanonicalSelection(view: CanonicalViewId): RectNorm | null {
        const existing = this.getCanonicalSelection(view);
        if (existing) return existing;
        if (!this.canonicalResult) return null;
        const base = view === 'top' ? this.canonicalResult.top.rect : this.canonicalResult.front.rect;
        const rect = { x: base.x, y: base.y, w: base.w, h: base.h };
        this.setCanonicalSelection(view, rect);
        return rect;
    }

    private adjustCanonicalRasterZoom(view: CanonicalViewId, factor: number) {
        const curr = this.getCanonicalRasterView(view);
        const zoom = clamp(curr.zoom * factor, 0.4, 6);
        const ratio = zoom / Math.max(1e-6, curr.zoom);
        const next: RasterViewState = {
            zoom,
            offsetX: curr.offsetX * ratio,
            offsetY: curr.offsetY * ratio
        };
        this.setCanonicalRasterView(view, next);
        this.renderCanonicalPane();
    }

    private centerCanonicalRaster(view: CanonicalViewId) {
        const curr = this.getCanonicalRasterView(view);
        this.setCanonicalRasterView(view, {
            zoom: curr.zoom,
            offsetX: 0,
            offsetY: 0
        });
        this.renderCanonicalPane();
    }

    private eventToCanvasPoint(event: PointerEvent, canvas: HTMLCanvasElement) {
        const bounds = canvas.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * canvas.width;
        const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * canvas.height;
        return { x, y };
    }

    private pickDragMode(point: { x: number; y: number }, rect: RectNorm, transform: CanvasFitTransform): DragMode | null {
        const left = transform.dx + rect.x * transform.dw;
        const top = transform.dy + rect.y * transform.dh;
        const right = left + rect.w * transform.dw;
        const bottom = top + rect.h * transform.dh;
        const radius = 10;
        const dist = (x: number, y: number) => Math.hypot(point.x - x, point.y - y);
        if (dist(left, top) <= radius) return 'nw';
        if (dist(right, top) <= radius) return 'ne';
        if (dist(left, bottom) <= radius) return 'sw';
        if (dist(right, bottom) <= radius) return 'se';
        if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return 'move';
        return null;
    }

    private beginSelectionDrag(view: CanonicalViewId, event: PointerEvent) {
        const selection = this.ensureCanonicalSelection(view);
        if (!selection) return;
        const canvas = this.getCanvasForView(view);
        let transform = this.getCanonicalTransform(view);
        if (!transform) {
            this.renderCanonicalPane();
            transform = this.getCanonicalTransform(view);
        }
        if (!transform) return;

        const point = this.eventToCanvasPoint(event, canvas);
        const rasterView = this.getCanonicalRasterView(view);
        const isPan = event.button === 2;
        const mode = isPan ? 'pan' : this.pickDragMode(point, selection, transform);
        if (!mode) return;

        event.preventDefault();
        this.activePane = 'canonical';
        this.syncActivePaneStyle();
        this.syncParamInputs();
        this.dragState = {
            pointerId: event.pointerId,
            view,
            mode,
            startX: point.x,
            startY: point.y,
            startRect: { x: selection.x, y: selection.y, w: selection.w, h: selection.h },
            startOffsetX: rasterView.offsetX,
            startOffsetY: rasterView.offsetY
        };
        try {
            canvas.setPointerCapture(event.pointerId);
        } catch {
            // ignore
        }
    }

    private continueSelectionDrag(event: PointerEvent) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
        const { view, mode, startX, startY, startRect, startOffsetX, startOffsetY } = this.dragState;
        const transform = this.getCanonicalTransform(view);
        if (!transform) return;
        const canvas = this.getCanvasForView(view);
        const point = this.eventToCanvasPoint(event, canvas);
        if (mode === 'pan') {
            this.setCanonicalRasterView(view, {
                zoom: this.getCanonicalRasterView(view).zoom,
                offsetX: startOffsetX + (point.x - startX),
                offsetY: startOffsetY + (point.y - startY)
            });
            this.renderCanonicalPane();
            return;
        }
        const dx = (point.x - startX) / Math.max(1e-6, transform.dw);
        const dy = (point.y - startY) / Math.max(1e-6, transform.dh);
        const minSize = 0.04;

        let left = startRect.x;
        let top = startRect.y;
        let right = startRect.x + startRect.w;
        let bottom = startRect.y + startRect.h;

        if (mode === 'move') {
            const width = startRect.w;
            const height = startRect.h;
            left = clamp(startRect.x + dx, 0, 1 - width);
            top = clamp(startRect.y + dy, 0, 1 - height);
            right = left + width;
            bottom = top + height;
        } else if (mode === 'nw') {
            left = clamp(startRect.x + dx, 0, startRect.x + startRect.w - minSize);
            top = clamp(startRect.y + dy, 0, startRect.y + startRect.h - minSize);
        } else if (mode === 'ne') {
            right = clamp(startRect.x + startRect.w + dx, startRect.x + minSize, 1);
            top = clamp(startRect.y + dy, 0, startRect.y + startRect.h - minSize);
        } else if (mode === 'sw') {
            left = clamp(startRect.x + dx, 0, startRect.x + startRect.w - minSize);
            bottom = clamp(startRect.y + startRect.h + dy, startRect.y + minSize, 1);
        } else {
            right = clamp(startRect.x + startRect.w + dx, startRect.x + minSize, 1);
            bottom = clamp(startRect.y + startRect.h + dy, startRect.y + minSize, 1);
        }

        const next: RectNorm = {
            x: left,
            y: top,
            w: clamp(right - left, minSize, 1),
            h: clamp(bottom - top, minSize, 1)
        };
        this.setCanonicalSelection(view, next);
        this.renderCanonicalPane();
    }

    private endSelectionDrag(event: PointerEvent) {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
        const view = this.dragState.view;
        const canvas = this.getCanvasForView(view);
        try {
            canvas.releasePointerCapture(event.pointerId);
        } catch {
            // ignore
        }
        this.dragState = null;
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private getCanonicalWorldPointsOrNull(reason: string): SampledPoint[] | null {
        const points = this.options.getWorldSamplePoints?.() || [];
        if (points.length < 120) {
            this.debugLog('canonical:world-points-missing', {
                reason,
                points: points.length,
                mode: 'world-only'
            });
            return null;
        }
        return points;
    }

    private pushStep3DualView() {
        if (!this.step3DualViewSink) return;
        const points = this.canonicalSampledPoints ?? this.sampledPoints;
        this.debugLog('step3Sink:push', {
            source: this.canonicalSampledPoints ? 'canonical' : 'raw',
            points: points.length,
            stats: summarizePointCloud(points)
        });
        this.step3DualViewSink.setCanonicalPoints(points);
        this.step3DualViewSink.setFlyCameraPose(this.liveCameraPose ?? this.bestCamera);
        this.step3DualViewSink.redraw();
    }

    private updateLiveCameraFromHost() {
        const live = this.options.getLiveCameraPose?.();
        if (!live) return false;

        const prev = this.liveCameraPose;
        this.liveCameraPose = live.pose;
        if (!prev) return true;
        const de = Math.hypot(
            prev.eye.x - live.pose.eye.x,
            prev.eye.y - live.pose.eye.y,
            prev.eye.z - live.pose.eye.z
        );
        const df = Math.hypot(
            prev.forward.x - live.pose.forward.x,
            prev.forward.y - live.pose.forward.y,
            prev.forward.z - live.pose.forward.z
        );
        return de > 1e-3 || df > 1e-3;
    }

    private startLivePreviewLoop() {
        if (this.livePreviewRaf) return;
        const tick = () => {
            this.livePreviewRaf = 0;
            if (!this.modal.classList.contains('visible')) return;
            const changed = this.updateLiveCameraFromHost();
            if (changed) {
                this.pushStep3DualView();
                if (this.canonicalResult) this.renderCanonicalPane();
            }
            this.livePreviewRaf = window.requestAnimationFrame(tick);
        };
        this.livePreviewRaf = window.requestAnimationFrame(tick);
    }

    private stopLivePreviewLoop() {
        if (!this.livePreviewRaf) return;
        window.cancelAnimationFrame(this.livePreviewRaf);
        this.livePreviewRaf = 0;
    }

    private syncFlyParamInputs() {
        this.flyEyeHeightInput.value = this.flyEyeHeightMeters.toFixed(2);
        this.flyFovInput.value = this.flyFovDeg.toFixed(0);
    }

    private applyFlyParamInputs() {
        const nextEye = Number.parseFloat(this.flyEyeHeightInput.value);
        const nextFov = Number.parseFloat(this.flyFovInput.value);
        if (Number.isFinite(nextEye)) this.flyEyeHeightMeters = clamp(nextEye, 0.6, 6);
        if (Number.isFinite(nextFov)) this.flyFovDeg = clamp(nextFov, 20, 120);
        this.syncFlyParamInputs();
    }

    private renderCandidateButtons() {
        this.candidateGridEl.innerHTML = '';
        if (this.bestCameraCandidates.length === 0) {
            const ids = ['P1', 'P2', 'P3'];
            ids.forEach((label) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'otml-candidate-btn';
                btn.textContent = label;
                btn.disabled = true;
                this.candidateGridEl.appendChild(btn);
            });
            return;
        }

        this.bestCameraCandidates.forEach((candidate, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `otml-candidate-btn${this.selectedBestCameraId === candidate.id ? ' active' : ''}`;
            btn.textContent = `P${index + 1}`;
            btn.setAttribute('data-candidate-id', candidate.id);
            btn.title = `${candidate.id} eye=(${candidate.eye.x.toFixed(2)}, ${candidate.eye.y.toFixed(2)}, ${candidate.eye.z.toFixed(2)})`;
            this.candidateGridEl.appendChild(btn);
        });
    }

    private selectBestCameraCandidate(candidateId: string, applyToScene: boolean) {
        const candidate = this.bestCameraCandidates.find(item => item.id === candidateId);
        if (!candidate) return;
        this.selectedBestCameraId = candidate.id;
        this.flyFovDeg = candidate.fovDeg;
        this.flyEyeHeightMeters = candidate.eyeHeightMeters;
        this.syncFlyParamInputs();
        this.bestCamera = {
            eye: candidate.eye,
            forward: candidate.forward
        };
        this.pushStep3DualView();
        this.renderCandidateButtons();
        this.renderAll();
        this.setStatus(`P${Math.max(1, this.bestCameraCandidates.indexOf(candidate) + 1)} eye=(${candidate.eye.x.toFixed(2)}, ${candidate.eye.y.toFixed(2)}, ${candidate.eye.z.toFixed(2)}) fov=${candidate.fovDeg.toFixed(0)} eyeH=${candidate.eyeHeightMeters.toFixed(2)}`);
        if (applyToScene && this.options.previewFlyCamera) {
            void Promise.resolve(this.options.previewFlyCamera(this.bestCamera, this.flyFovDeg));
        }
    }

    private debugLog(action: string, detail?: unknown) {
        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${action}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`;
        const w = window as unknown as {
            __otStep3Debug?: {
                otmlAlign?: unknown[];
            };
        };
        if (!w.__otStep3Debug) w.__otStep3Debug = {};
        if (!w.__otStep3Debug.otmlAlign) w.__otStep3Debug.otmlAlign = [];
        w.__otStep3Debug.otmlAlign.push({
            ts: new Date().toISOString(),
            action,
            detail
        });
        if (w.__otStep3Debug.otmlAlign.length > 400) {
            w.__otStep3Debug.otmlAlign.splice(0, w.__otStep3Debug.otmlAlign.length - 400);
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

    private syncActivePaneStyle() {
        this.paneOriginalEl.classList.toggle('active', this.activePane === 'original');
        this.paneCanonicalEl.classList.toggle('active', this.activePane === 'canonical');
    }

    private syncParamInputs() {
        const source = this.activePane === 'original' ? this.originalProjectionParams : this.canonicalProjectionParams;
        this.paramInputs.sliceMin.value = source.sliceMin.toFixed(2);
        this.paramInputs.sliceMax.value = source.sliceMax.toFixed(2);
        this.paramInputs.xRangeMin.value = source.xRangeMin.toFixed(2);
        this.paramInputs.xRangeMax.value = source.xRangeMax.toFixed(2);
        this.paramInputs.heightMin.value = source.heightMin.toFixed(2);
        this.paramInputs.heightMax.value = source.heightMax.toFixed(2);
    }

    private syncOriginalCanvasResolution() {
        const pickSize = (wrap: HTMLDivElement, fallbackW: number, fallbackH: number) => {
            const width = Math.max(1, Math.round(wrap.clientWidth || fallbackW));
            const height = Math.max(1, Math.round(wrap.clientHeight || fallbackH));
            return { width, height };
        };

        const topSize = pickSize(this.originalTopWrapEl, this.originalTopCanvas.width, this.originalTopCanvas.height);
        const frontSize = pickSize(this.originalFrontWrapEl, this.originalFrontCanvas.width, this.originalFrontCanvas.height);
        if (this.originalTopCanvas.width !== topSize.width || this.originalTopCanvas.height !== topSize.height) {
            this.originalTopCanvas.width = topSize.width;
            this.originalTopCanvas.height = topSize.height;
        }
        if (this.originalFrontCanvas.width !== frontSize.width || this.originalFrontCanvas.height !== frontSize.height) {
            this.originalFrontCanvas.width = frontSize.width;
            this.originalFrontCanvas.height = frontSize.height;
        }

        this.debugLog('original:canvas-size-sync', {
            topWrap: { w: topSize.width, h: topSize.height },
            frontWrap: { w: frontSize.width, h: frontSize.height },
            appliedCanvas: {
                top: { w: this.originalTopCanvas.width, h: this.originalTopCanvas.height },
                front: { w: this.originalFrontCanvas.width, h: this.originalFrontCanvas.height }
            }
        });

        return {
            top: { width: this.originalTopCanvas.width, height: this.originalTopCanvas.height },
            front: { width: this.originalFrontCanvas.width, height: this.originalFrontCanvas.height }
        };
    }

    private syncCanonicalCanvasResolution() {
        const pickSize = (wrap: HTMLDivElement, fallbackW: number, fallbackH: number) => {
            const width = Math.max(1, Math.round(wrap.clientWidth || fallbackW));
            const height = Math.max(1, Math.round(wrap.clientHeight || fallbackH));
            return { width, height };
        };

        const topSize = pickSize(this.canonicalTopWrapEl, this.canonicalTopCanvas.width, this.canonicalTopCanvas.height);
        const frontSize = pickSize(this.canonicalFrontWrapEl, this.canonicalFrontCanvas.width, this.canonicalFrontCanvas.height);
        if (this.canonicalTopCanvas.width !== topSize.width || this.canonicalTopCanvas.height !== topSize.height) {
            this.canonicalTopCanvas.width = topSize.width;
            this.canonicalTopCanvas.height = topSize.height;
        }
        if (this.canonicalFrontCanvas.width !== frontSize.width || this.canonicalFrontCanvas.height !== frontSize.height) {
            this.canonicalFrontCanvas.width = frontSize.width;
            this.canonicalFrontCanvas.height = frontSize.height;
        }

        this.debugLog('canonical:canvas-size-sync', {
            topWrap: { w: topSize.width, h: topSize.height },
            frontWrap: { w: frontSize.width, h: frontSize.height },
            appliedCanvas: {
                top: { w: this.canonicalTopCanvas.width, h: this.canonicalTopCanvas.height },
                front: { w: this.canonicalFrontCanvas.width, h: this.canonicalFrontCanvas.height }
            }
        });

        return {
            top: { width: this.canonicalTopCanvas.width, height: this.canonicalTopCanvas.height },
            front: { width: this.canonicalFrontCanvas.width, height: this.canonicalFrontCanvas.height }
        };
    }

    private getViewModelAspect(points: SampledPoint[], view: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front']) {
        const spanX = computeAxisSpan(points, view.axisX);
        const spanY = computeAxisSpan(points, view.axisY);
        const aspect = spanX.span / Math.max(1e-6, spanY.span);
        return {
            axisX: view.axisX,
            axisY: view.axisY,
            modelSpanX: spanX.span,
            modelSpanY: spanY.span,
            modelCountX: spanX.count,
            modelCountY: spanY.count,
            modelAspect: aspect,
            rangeSpanX: Math.max(1e-6, view.xRange.max - view.xRange.min),
            rangeSpanY: Math.max(1e-6, view.yRange.max - view.yRange.min),
            rangeAspect: Math.max(1e-6, view.xRange.max - view.xRange.min) / Math.max(1e-6, view.yRange.max - view.yRange.min)
        };
    }

    private debugRenderFit(
        pane: PaneId,
        viewName: 'top' | 'front',
        view: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front'],
        transform: CanvasFitTransform | null,
        aspectUsed: number
    ) {
        if (!transform) return;
        const rect = view.rect;
        this.debugLog('render:fit', {
            pane,
            view: viewName,
            axisX: view.axisX,
            axisY: view.axisY,
            aspectUsed,
            imageSize: { w: view.image.width, h: view.image.height },
            drawRect: {
                dx: Number(transform.dx.toFixed(2)),
                dy: Number(transform.dy.toFixed(2)),
                dw: Number(transform.dw.toFixed(2)),
                dh: Number(transform.dh.toFixed(2))
            },
            occupiedRect: {
                x: Number((transform.dx + rect.x * transform.dw).toFixed(2)),
                y: Number((transform.dy + rect.y * transform.dh).toFixed(2)),
                w: Number((rect.w * transform.dw).toFixed(2)),
                h: Number((rect.h * transform.dh).toFixed(2))
            }
        });
    }

    private renderPresetButtons() {
        const openglHost = this.modal.querySelector('[data-role="preset-grid-opengl"]') as HTMLDivElement;
        const othersHost = this.modal.querySelector('[data-role="preset-grid-others"]') as HTMLDivElement;
        openglHost.innerHTML = '';
        othersHost.innerHTML = '';
        const onSelectPreset = (id: CoordinateId) => {
            this.selectedSourceCoordinateId = id;
            this.debugLog('sourcePreset:select', { coordinateId: id, sampledPoints: this.originalSampledPoints.length });
            if (this.originalSampledPoints.length > 0) {
                this.originalProjectionParams = suggestProjectionByCoordinateNaturalRobust(this.originalSampledPoints, this.selectedSourceCoordinateId);
                if (this.activePane === 'original') this.syncParamInputs();
                this.debugLog('sourcePreset:auto-bounds', {
                    xRangeMin: this.originalProjectionParams.xRangeMin,
                    xRangeMax: this.originalProjectionParams.xRangeMax,
                    planeBMin: this.originalProjectionParams.heightMin,
                    planeBMax: this.originalProjectionParams.heightMax,
                    sliceMin: this.originalProjectionParams.sliceMin,
                    sliceMax: this.originalProjectionParams.sliceMax
                });
            }
            this.renderPresetButtons();
            this.recomputeFromTrigger('original', 'auto', 'preset-click');
            if (this.originalSampledPoints.length === 0) {
                this.setStatus(`Source projection switched to ${id}, but no sampled points are available yet.`);
            } else {
                this.setStatus(`Source projection switched to ${id}. (No model rotation applied)`);
            }
        };

        const appendButton = (host: HTMLDivElement, item: PresetDisplayItem) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `otml-preset${item.id === this.selectedSourceCoordinateId ? ' active' : ''}`;
            button.textContent = item.label;
            button.title = item.label;
            button.addEventListener('click', () => onSelectPreset(item.id));
            host.appendChild(button);
        };

        OPENGL_PRESET_ITEMS.forEach((item) => {
            appendButton(openglHost, item);
        });

        COORDINATE_IDS
            .filter((id) => !OPENGL_PRESET_IDS.has(id))
            .forEach((id) => {
                appendButton(othersHost, { id, label: id });
            });
    }

    private resetFlowState() {
        this.debugLog('resetFlowState');
        this.activePane = 'original';
        this.syncActivePaneStyle();
        this.selectedSourceCoordinateId = 'R-Ydown-Zback';
        this.originalProjectionParams = defaultProjectionParams();
        this.canonicalProjectionParams = defaultProjectionParams();
        this.originalResult = null;
        this.canonicalResult = null;
        this.originalSampledPoints = [];
        this.canonicalSampledPoints = null;
        this.bestCamera = null;
        this.bestCameraCandidates = [];
        this.selectedBestCameraId = null;
        this.flyEyeHeightMeters = 1.65;
        this.flyFovDeg = 120;
        this.liveCameraPose = null;
        this.parseIssues = [];
        this.canonicalTopSelection = null;
        this.canonicalFrontSelection = null;
        this.canonicalTopTransform = null;
        this.canonicalFrontTransform = null;
        this.canonicalTopRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
        this.canonicalFrontRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
        this.originalModelAspect = { top: 1, front: 1 };
        this.canonicalModelAspect = { top: 1, front: 1 };
        this.dragState = null;
        this.rotatedToCanonical = false;
        this.renderPresetButtons();
        this.renderCandidateButtons();
        this.syncParamInputs();
        this.syncFlyParamInputs();
        this.renderAll();
        this.pushStep3DualView();
    }

    private recomputeFromTrigger(pane: PaneId, mode: 'auto' | 'manual', trigger: string) {
        this.debugLog('trigger:recompute', {
            trigger,
            pane,
            mode,
            originalCanvas: { w: this.originalTopCanvas.width, h: this.originalTopCanvas.height },
            canonicalCanvas: { w: this.canonicalTopCanvas.width, h: this.canonicalTopCanvas.height }
        });
        this.recomputePane(pane, mode);
    }

    private recomputePane(pane: PaneId, mode: 'auto' | 'manual' = 'auto') {
        const originalPoints = this.originalSampledPoints;
        this.debugLog('recomputePane:start', {
            pane,
            sourceCoordinate: this.selectedSourceCoordinateId,
            sampledPoints: pane === 'original' ? originalPoints.length : this.sampledPoints.length,
            parseIssues: this.parseIssues,
            projection: pane === 'original' ? this.originalProjectionParams : this.canonicalProjectionParams,
            mode
        });
        const pointsForPane = pane === 'original' ? originalPoints : this.sampledPoints;
        if (pointsForPane.length === 0) {
            if (pane === 'original') this.renderOriginalPane();
            else this.renderCanonicalPane();
            this.debugLog('recomputePane:skip-empty', { pane, reason: 'no sampled points' });
            return;
        }
        if (pane === 'original') {
            const originalCanvasSize = this.syncOriginalCanvasResolution();
            const originalComputed = buildOriginalProjectionIndependent({
                points: originalPoints,
                coordinateId: this.selectedSourceCoordinateId,
                projection: this.originalProjectionParams,
                topSize: originalCanvasSize.top,
                frontSize: originalCanvasSize.front,
                mode
            });
            this.originalResult = originalComputed.result;
            this.originalProjectionParams = originalComputed.projection;
            if (this.activePane === 'original') this.syncParamInputs();
            this.debugLog('recomputePane:original-done', {
                source: 'loaded-original-points',
                points: originalPoints.length,
                maxTopDensity: this.originalResult.top.maxDensity,
                maxFrontDensity: this.originalResult.front.maxDensity,
                topRect: this.originalResult.top.rect,
                frontRect: this.originalResult.front.rect,
                topRange: { x: this.originalResult.top.xRange, y: this.originalResult.top.yRange },
                frontRange: { x: this.originalResult.front.xRange, y: this.originalResult.front.yRange }
            });
            const originalTopDiag = this.getViewModelAspect(originalPoints, this.originalResult.top);
            const originalFrontDiag = this.getViewModelAspect(originalPoints, this.originalResult.front);
            this.originalModelAspect = { top: originalTopDiag.modelAspect, front: originalFrontDiag.modelAspect };
            this.debugLog('aspect:diagnostics', {
                pane: 'original',
                sourceCoordinate: this.selectedSourceCoordinateId,
                source: 'loaded-original-points',
                top: originalTopDiag,
                front: originalFrontDiag
            });
            this.renderOriginalPane();
        } else {
            const canonicalPoints = this.getCanonicalWorldPointsOrNull('recompute-canonical');
            if (!canonicalPoints) {
                this.canonicalResult = null;
                this.canonicalTopTransform = null;
                this.canonicalFrontTransform = null;
                this.renderCanonicalPane();
                this.setStatus('Canonical projection unavailable: world points not ready.');
                this.debugLog('recomputePane:canonical-skip-world-missing', { mode: 'world-only' });
                return;
            }
            const canonicalCanvasSize = this.syncCanonicalCanvasResolution();
            const rotatedComputed = buildRotatedProjectionWorldBackup({
                points: canonicalPoints,
                coordinateId: CANONICAL_COORDINATE_ID,
                projection: this.canonicalProjectionParams,
                topSize: canonicalCanvasSize.top,
                frontSize: canonicalCanvasSize.front,
                mode
            });
            this.canonicalResult = rotatedComputed.result;
            this.canonicalProjectionParams = rotatedComputed.projection;
            if (this.activePane === 'canonical') this.syncParamInputs();
            if (mode === 'auto') {
                this.canonicalTopSelection = null;
                this.canonicalFrontSelection = null;
                this.canonicalTopRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
                this.canonicalFrontRasterView = { zoom: 1, offsetX: 0, offsetY: 0 };
            }
            this.debugLog('recomputePane:canonical-done', {
                source: 'world-only',
                maxTopDensity: this.canonicalResult.top.maxDensity,
                maxFrontDensity: this.canonicalResult.front.maxDensity,
                topRect: this.canonicalResult.top.rect,
                frontRect: this.canonicalResult.front.rect,
                topRange: { x: this.canonicalResult.top.xRange, y: this.canonicalResult.top.yRange },
                frontRange: { x: this.canonicalResult.front.xRange, y: this.canonicalResult.front.yRange }
            });
            const canonicalTopDiag = this.getViewModelAspect(canonicalPoints, this.canonicalResult.top);
            const canonicalFrontDiag = this.getViewModelAspect(canonicalPoints, this.canonicalResult.front);
            this.canonicalModelAspect = { top: canonicalTopDiag.modelAspect, front: canonicalFrontDiag.modelAspect };
            this.debugLog('aspect:diagnostics', {
                pane: 'canonical',
                sourceCoordinate: CANONICAL_COORDINATE_ID,
                top: canonicalTopDiag,
                front: canonicalFrontDiag
            });
            this.renderCanonicalPane();
        }
        this.updatePaneLabels();
        this.pushStep3DualView();
    }

    private recommendBestCamera(fromManualParams: boolean) {
        this.debugLog('recommend:click', { hasCanonical: Boolean(this.canonicalResult) });
        if (!this.canonicalResult) {
            this.setStatus('Canonical pane not ready. Click Rotate first.');
            this.debugLog('recommend:blocked', { reason: 'canonical projection missing' });
            return;
        }

        this.applyFlyParamInputs();

        const canonicalPoints = this.getCanonicalWorldPointsOrNull('recommend-best-fly-camera');
        if (!canonicalPoints) {
            this.setStatus('World points unavailable. Cannot recommend fly camera.');
            this.debugLog('recommend:blocked', { reason: 'no world points', mode: 'world-only' });
            return;
        }

        let best = recommendBestFlyCamera({
            points: canonicalPoints,
            coordinateId: CANONICAL_COORDINATE_ID,
            topRect: this.canonicalTopSelection ?? this.canonicalResult.top.rect,
            frontRect: this.canonicalFrontSelection ?? this.canonicalResult.front.rect,
            topView: this.canonicalResult.top,
            frontView: this.canonicalResult.front,
            fovDeg: this.flyFovDeg,
            eyeHeightMeters: this.flyEyeHeightMeters
        });

        if (!fromManualParams) {
            this.flyFovDeg = best.recommendedFovDeg;
            this.flyEyeHeightMeters = best.recommendedEyeHeightMeters;
            this.syncFlyParamInputs();
            best = recommendBestFlyCamera({
                points: canonicalPoints,
                coordinateId: CANONICAL_COORDINATE_ID,
                topRect: this.canonicalTopSelection ?? this.canonicalResult.top.rect,
                frontRect: this.canonicalFrontSelection ?? this.canonicalResult.front.rect,
                topView: this.canonicalResult.top,
                frontView: this.canonicalResult.front,
                fovDeg: this.flyFovDeg,
                eyeHeightMeters: this.flyEyeHeightMeters
            });
        }

        this.bestCameraCandidates = best.candidates;
        this.renderCandidateButtons();
        this.selectBestCameraCandidate(best.best.id, true);
        this.debugLog('recommend:done', { best: best.best, center: best.center, bounds: best.bounds, candidates: best.candidates, fromManualParams });
    }

    private overlayForView(result: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front'], canvas: HTMLCanvasElement) {
        const pose = this.liveCameraPose ?? this.bestCamera;
        if (!pose) return undefined;
        const overlay = projectCameraToRaster(result, pose, canvas.width, canvas.height);
        return {
            pointX: overlay.point.x,
            pointY: overlay.point.y,
            tipX: overlay.tip.x,
            tipY: overlay.tip.y,
            showDirection: overlay.directionVisible
        };
    }

    private candidatePointsForView(result: ProjectionByAxisResult['top'] | ProjectionByAxisResult['front'], canvas: HTMLCanvasElement) {
        if (this.bestCameraCandidates.length === 0) return undefined;
        return this.bestCameraCandidates.map((candidate) => {
            const overlay = projectCameraToRaster(result, { eye: candidate.eye, forward: candidate.forward }, canvas.width, canvas.height);
            return {
                pointX: overlay.point.x,
                pointY: overlay.point.y,
                selected: candidate.id === this.selectedBestCameraId
            };
        });
    }

    private updatePaneLabels() {
        const formatAxis = (axis: string) => axis.startsWith('+') ? axis.slice(1) : axis;
        const sourceProfile = getCoordinateViewProfile(this.selectedSourceCoordinateId);
        const canonicalProfile = getCoordinateViewProfile(CANONICAL_COORDINATE_ID);
        const topPair = `[${formatAxis(sourceProfile.topView.screenRight)}, ${formatAxis(sourceProfile.topView.screenUp)}]`;
        const frontPair = `[${formatAxis(sourceProfile.frontView.screenRight)}, ${formatAxis(sourceProfile.frontView.screenUp)}]`;
        const canonicalTopPair = `[${formatAxis(canonicalProfile.topView.screenRight)}, ${formatAxis(canonicalProfile.topView.screenUp)}]`;
        const canonicalFrontPair = `[${formatAxis(canonicalProfile.frontView.screenRight)}, ${formatAxis(canonicalProfile.frontView.screenUp)}]`;

        this.originalTitleEl.textContent = `Original Projection (${this.selectedSourceCoordinateId})`;
        this.originalTopTagEl.textContent = `Top View ${topPair}`;
        this.originalFrontTagEl.textContent = `Front View ${frontPair}`;
        this.canonicalTopTagEl.textContent = `Top View ${canonicalTopPair}`;
        this.canonicalFrontTagEl.textContent = `Front View ${canonicalFrontPair}`;
    }

    private renderOriginalPane() {
        if (this.originalResult) {
            const topTransform = drawViewToCanvas(
                this.originalTopCanvas,
                this.originalResult.top,
                '#ff4d4d',
                undefined,
                false,
                undefined,
                undefined,
                this.originalModelAspect.top
            );
            const frontTransform = drawViewToCanvas(
                this.originalFrontCanvas,
                this.originalResult.front,
                '#20d463',
                undefined,
                false,
                undefined,
                undefined,
                this.originalModelAspect.front
            );
            this.debugRenderFit('original', 'top', this.originalResult.top, topTransform, this.originalModelAspect.top);
            this.debugRenderFit('original', 'front', this.originalResult.front, frontTransform, this.originalModelAspect.front);
            return;
        }
        clearCanvas(this.originalTopCanvas);
        clearCanvas(this.originalFrontCanvas);
    }

    private renderCanonicalPane() {
        if (this.canonicalResult) {
            const topSelection = this.ensureCanonicalSelection('top') ?? this.canonicalResult.top.rect;
            const frontSelection = this.ensureCanonicalSelection('front') ?? this.canonicalResult.front.rect;
            this.canonicalTopTransform = drawViewToCanvas(
                this.canonicalTopCanvas,
                this.canonicalResult.top,
                '#ff4d4d',
                this.overlayForView(this.canonicalResult.top, this.canonicalTopCanvas),
                true,
                topSelection,
                this.canonicalTopRasterView,
                this.canonicalModelAspect.top,
                this.candidatePointsForView(this.canonicalResult.top, this.canonicalTopCanvas)
            );
            this.canonicalFrontTransform = drawViewToCanvas(
                this.canonicalFrontCanvas,
                this.canonicalResult.front,
                '#20d463',
                this.overlayForView(this.canonicalResult.front, this.canonicalFrontCanvas),
                true,
                frontSelection,
                this.canonicalFrontRasterView,
                this.canonicalModelAspect.front,
                this.candidatePointsForView(this.canonicalResult.front, this.canonicalFrontCanvas)
            );
            this.debugRenderFit('canonical', 'top', this.canonicalResult.top, this.canonicalTopTransform, this.canonicalModelAspect.top);
            this.debugRenderFit('canonical', 'front', this.canonicalResult.front, this.canonicalFrontTransform, this.canonicalModelAspect.front);
            return;
        }
        this.canonicalTopTransform = null;
        this.canonicalFrontTransform = null;
        clearCanvas(this.canonicalTopCanvas);
        clearCanvas(this.canonicalFrontCanvas);
    }

    private renderAll() {
        this.updatePaneLabels();
        this.renderOriginalPane();
        this.renderCanonicalPane();
    }
}

const mountOTMLIntelligentAlignPanel = (options: OTMLIntelligentAlignOptions): OTMLIntelligentAlignController => {
    return new OTMLIntelligentAlignPanel(options);
};

export {
    mountOTMLIntelligentAlignPanel,
    type OTMLIntelligentAlignController,
    type OTMLIntelligentAlignOptions
};
