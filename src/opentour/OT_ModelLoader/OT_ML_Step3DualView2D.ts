import type { CameraPose, SampledPoint } from './algorithms/otml_types';
import { buildStep3RuntimeFromDbCalibration } from './algorithms/otml_step3_runtime_from_db_images';

type DualViewId = 'map' | 'front';

type Vec3Point = {
    x: number;
    y: number;
    z: number;
};

type ViewRange = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type Step3Raster = {
    width: number;
    height: number;
    image: Uint8ClampedArray;
    range: ViewRange;
};

type Step3OwnRuntime = {
    projectionMode: 'top-x-negz__front-x-y';
    map: Step3Raster;
    front: Step3Raster;
};

const RASTER_LONG_EDGE = 560;
const RASTER_MIN_SHORT_EDGE = 24;

type OTMLStep3DualView2DOptions = {
    parent?: HTMLElement;
    mapCanvas?: HTMLCanvasElement;
    frontCanvas?: HTMLCanvasElement;
    statusElement?: HTMLElement;
    zoomInButton?: HTMLButtonElement;
    zoomOutButton?: HTMLButtonElement;
    refreshButton?: HTMLButtonElement;
    getFlyCameraPose?: () => CameraPose | null;
    getWorldSamplePoints?: () => SampledPoint[];
    getModelFilename?: () => string | null;
    points?: SampledPoint[];
};

type OTMLStep3DualView2DController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
    destroy: () => void;
    setCanonicalPoints: (points: SampledPoint[]) => void;
    setFlyCameraPose: (pose: CameraPose | null) => void;
    setFlyCameraProvider: (provider: (() => CameraPose | null) | null) => void;
    redraw: () => void;
};

type ViewDrawLayout = {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
};

const STYLE_ID = 'ot-ml-step3-dualview-2d-style';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const debugPush = (scope: string, payload: unknown) => {
    const w = window as unknown as {
        __otStep3Debug?: {
            otmlDualView?: unknown[];
        };
    };
    if (!w.__otStep3Debug) w.__otStep3Debug = {};
    if (!w.__otStep3Debug.otmlDualView) w.__otStep3Debug.otmlDualView = [];
    w.__otStep3Debug.otmlDualView.push({
        ts: new Date().toISOString(),
        scope,
        ...payload as object
    });
    if (w.__otStep3Debug.otmlDualView.length > 300) {
        w.__otStep3Debug.otmlDualView.splice(0, w.__otStep3Debug.otmlDualView.length - 300);
    }
};

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .otml-step3-dualview.hidden { display: none; }
    `;
    document.head.appendChild(style);
};

const safeNumber = (v: number, fallback = 0) => Number.isFinite(v) ? v : fallback;

const quantile = (values: number[], q: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
    return sorted[idx];
};

const spanInv = (min: number, max: number) => {
    const span = max - min;
    if (Math.abs(span) < 1e-6) return 1e6;
    return 1 / span;
};

const viewAxes = (p: Vec3Point, view: DualViewId) => {
    if (view === 'map') {
        return { x: p.x, y: -p.z };
    }
    return { x: p.x, y: p.y };
};

const buildViewRange = (points: Vec3Point[], view: DualViewId): ViewRange => {
    const xVals: number[] = [];
    const yVals: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        const a = viewAxes(p, view);
        xVals.push(a.x);
        yVals.push(a.y);
    }

    if (xVals.length < 8 || yVals.length < 8) {
        return { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    }

    const xLow = quantile(xVals, 0.02);
    const xHigh = quantile(xVals, 0.98);
    const yLow = quantile(yVals, 0.02);
    const yHigh = quantile(yVals, 0.98);
    const xPad = Math.max(0.05, (xHigh - xLow) * 0.08);
    const yPad = Math.max(0.05, (yHigh - yLow) * 0.08);

    const xMin = xLow - xPad;
    const xMax = xHigh + xPad;
    const yMin = yLow - yPad;
    const yMax = yHigh + yPad;

    if (Math.abs(xMax - xMin) < 1e-6 || Math.abs(yMax - yMin) < 1e-6) {
        return { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    }

    return { xMin, xMax, yMin, yMax };
};

const blurDensity3x3 = (src: Float32Array, width: number, height: number) => {
    const temp = new Float32Array(src.length);
    const out = new Float32Array(src.length);

    for (let y = 0; y < height; y += 1) {
        const row = y * width;
        for (let x = 0; x < width; x += 1) {
            const xm1 = x > 0 ? x - 1 : x;
            const xp1 = x + 1 < width ? x + 1 : x;
            temp[row + x] = (src[row + xm1] + src[row + x] * 2 + src[row + xp1]) * 0.25;
        }
    }

    for (let y = 0; y < height; y += 1) {
        const ym1 = y > 0 ? y - 1 : y;
        const yp1 = y + 1 < height ? y + 1 : y;
        const row = y * width;
        const rowM1 = ym1 * width;
        const rowP1 = yp1 * width;
        for (let x = 0; x < width; x += 1) {
            out[row + x] = (temp[rowM1 + x] + temp[row + x] * 2 + temp[rowP1 + x]) * 0.25;
        }
    }

    return out;
};

const blurDensityNTimes = (src: Float32Array, width: number, height: number, count: number) => {
    let out = src;
    for (let i = 0; i < count; i += 1) {
        out = blurDensity3x3(out, width, height);
    }
    return out;
};

const rasterizeView = (
    points: Vec3Point[],
    range: ViewRange,
    view: DualViewId,
    width: number,
    height: number,
    opacities: number[]
): Uint8ClampedArray => {
    const density = new Float32Array(width * height);
    const xInv = spanInv(range.xMin, range.xMax);
    const yInv = spanInv(range.yMin, range.yMax);

    for (let i = 0; i < points.length; i += 1) {
        const a = viewAxes(points[i], view);
        const u = (a.x - range.xMin) * xInv;
        const v = 1 - ((a.y - range.yMin) * yInv);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const xf = u * (width - 1);
        const yf = v * (height - 1);
        const x0 = clamp(Math.floor(xf), 0, width - 1);
        const y0 = clamp(Math.floor(yf), 0, height - 1);
        const x1 = clamp(x0 + 1, 0, width - 1);
        const y1 = clamp(y0 + 1, 0, height - 1);
        const tx = xf - x0;
        const ty = yf - y0;
        const weight = clamp(safeNumber(opacities[i], 1), 0.05, 1);

        density[y0 * width + x0] += weight * (1 - tx) * (1 - ty);
        density[y0 * width + x1] += weight * tx * (1 - ty);
        density[y1 * width + x0] += weight * (1 - tx) * ty;
        density[y1 * width + x1] += weight * tx * ty;
    }

    const blurNear = blurDensityNTimes(density, width, height, 1);
    const blurMid = blurDensityNTimes(density, width, height, 2);
    const blurWide = blurDensityNTimes(density, width, height, 4);

    const detail = new Float32Array(density.length);
    const nonZeroBase: number[] = [];
    for (let i = 0; i < density.length; i += 1) {
        if (density[i] > 0) nonZeroBase.push(density[i]);
    }
    const baseP92 = nonZeroBase.length > 0 ? quantile(nonZeroBase, 0.92) : 1;

    for (let i = 0; i < detail.length; i += 1) {
        const local = density[i] / Math.max(1e-6, baseP92);
        const keepFine = Math.pow(clamp(local, 0, 1), 0.75);
        const smoothMix = 1 - keepFine;
        const blended = blurNear[i] * keepFine + blurMid[i] * smoothMix * 0.62 + blurWide[i] * smoothMix * 0.38;
        detail[i] = Math.max(0, blended);
    }

    const nonZero: number[] = [];
    for (let i = 0; i < detail.length; i += 1) {
        if (detail[i] > 0) nonZero.push(detail[i]);
    }
    const p70 = nonZero.length > 0 ? quantile(nonZero, 0.7) : 0;
    const p985 = nonZero.length > 0 ? Math.max(quantile(nonZero, 0.985), p70 + 1e-6) : 1;
    const lowLog = Math.log1p(Math.max(1e-6, p70));
    const highLogSpan = Math.max(1e-6, Math.log1p(p985) - Math.log1p(Math.max(1e-6, p70)));

    const image = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const value = detail[i];
            const valueLog = Math.log1p(value);

            let intensity = 0;
            if (value > 0) {
                if (value <= p70 || lowLog <= 1e-6) {
                    intensity = lowLog <= 1e-6 ? 0 : (valueLog / lowLog) * 0.16;
                } else {
                    const hi = clamp((valueLog - Math.log1p(Math.max(1e-6, p70))) / highLogSpan, 0, 1);
                    intensity = 0.16 + 0.84 * Math.pow(hi, 0.78);
                }

                const xm1 = x > 0 ? x - 1 : x;
                const xp1 = x + 1 < width ? x + 1 : x;
                const ym1 = y > 0 ? y - 1 : y;
                const yp1 = y + 1 < height ? y + 1 : y;
                const gx = Math.abs(detail[y * width + xp1] - detail[y * width + xm1]);
                const gy = Math.abs(detail[yp1 * width + x] - detail[ym1 * width + x]);
                const edge = clamp((gx + gy) / Math.max(1e-6, p985 * 0.9), 0, 1);
                intensity = clamp(intensity + edge * 0.12, 0, 1);
            }

            const shade = Math.round(250 - intensity * 238);
            const base = i * 4;
            image[base + 0] = shade;
            image[base + 1] = shade;
            image[base + 2] = Math.min(255, shade + 3);
            image[base + 3] = 255;
        }
    }

    if (nonZero.length > 0) {
        debugPush('rasterize-quality', {
            view,
            p70,
            p985,
            nonZero: nonZero.length
        });
    }

    return image;
};

const normalizeToUv = (x: number, y: number, range: ViewRange) => {
    const u = (x - range.xMin) * spanInv(range.xMin, range.xMax);
    const v = 1 - ((y - range.yMin) * spanInv(range.yMin, range.yMax));
    return { u, v };
};

const normalize = (v: Vec3Point): Vec3Point => {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-8) return { x: 1, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const computeRasterSizeByRange = (range: ViewRange, longEdge = RASTER_LONG_EDGE) => {
    const xSpan = Math.max(1e-6, range.xMax - range.xMin);
    const ySpan = Math.max(1e-6, range.yMax - range.yMin);
    const aspect = xSpan / ySpan;
    const major = Math.max(240, Math.round(longEdge));

    if (aspect >= 1) {
        const width = major;
        const height = Math.max(RASTER_MIN_SHORT_EDGE, Math.round(width / aspect));
        return { width, height, aspect };
    }

    const height = major;
    const width = Math.max(RASTER_MIN_SHORT_EDGE, Math.round(height * aspect));
    return { width, height, aspect };
};

const buildRuntime = (pointsInput: SampledPoint[], longEdge = RASTER_LONG_EDGE): Step3OwnRuntime => {
    const points: Vec3Point[] = [];
    const opacities: number[] = [];
    for (let i = 0; i < pointsInput.length; i += 1) {
        const sp = pointsInput[i];
        if (!Number.isFinite(sp.x) || !Number.isFinite(sp.y) || !Number.isFinite(sp.z)) continue;
        points.push({ x: sp.x, y: sp.y, z: sp.z });
        opacities.push(clamp(safeNumber(sp.opacity, 1), 0.05, 1));
    }

    const mapRange = buildViewRange(points, 'map');
    const frontRange = buildViewRange(points, 'front');
    const mapSize = computeRasterSizeByRange(mapRange, longEdge);
    const frontSize = computeRasterSizeByRange(frontRange, longEdge);

    return {
        projectionMode: 'top-x-negz__front-x-y',
        map: {
            width: mapSize.width,
            height: mapSize.height,
            image: rasterizeView(points, mapRange, 'map', mapSize.width, mapSize.height, opacities),
            range: mapRange
        },
        front: {
            width: frontSize.width,
            height: frontSize.height,
            image: rasterizeView(points, frontRange, 'front', frontSize.width, frontSize.height, opacities),
            range: frontRange
        }
    };
};

const makeRasterCanvas = (raster: Step3Raster) => {
    const canvas = document.createElement('canvas');
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.image), raster.width, raster.height), 0, 0);
    }
    return canvas;
};

const syncCanvasResolutionToClient = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.max(1, Math.round(rect.width));
    const targetH = Math.max(1, Math.round(rect.height));
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        return true;
    }
    return false;
};

const defaultStatusElement = () => document.createElement('div');

class OTMLStep3DualView2DPanel implements OTMLStep3DualView2DController {
    private readonly root: HTMLDivElement | null;

    private readonly statusEl: HTMLElement;

    private readonly canvases: Record<DualViewId, HTMLCanvasElement>;

    private readonly overlayCanvases: Record<DualViewId, HTMLCanvasElement>;

    private readonly zoom: Record<DualViewId, number> = { map: 1, front: 1 };

    private readonly getWorldSamplePoints: (() => SampledPoint[]) | null;

    private readonly getModelFilename: (() => string | null) | null;

    private readonly viewLayouts: Record<DualViewId, ViewDrawLayout | null> = { map: null, front: null };

    private runtime: Step3OwnRuntime | null = null;

    private rasterCanvas: Record<DualViewId, HTMLCanvasElement | null> = { map: null, front: null };

    private activeModelFilename: string | null = null;

    private dbRuntimeReadyForModel: string | null = null;

    private dbFetchInFlight = false;

    private lastDbFetchAt = 0;

    private flyCameraPose: CameraPose | null = null;

    private flyCameraProvider: (() => CameraPose | null) | null;

    private rafId = 0;

    private lastProjectionRefreshAt = 0;

    private lastOverlayDrawAt = 0;

    private lastOverlayPose: CameraPose | null = null;

    private externalZoomInHandler: (() => void) | null = null;

    private externalZoomOutHandler: (() => void) | null = null;

    private readonly zoomInButton: HTMLButtonElement | null;

    private readonly zoomOutButton: HTMLButtonElement | null;

    private readonly refreshButton: HTMLButtonElement | null;

    private externalRefreshHandler: (() => void) | null = null;

    constructor(options: OTMLStep3DualView2DOptions) {
        ensureStyle();
        this.flyCameraProvider = options.getFlyCameraPose || null;
        this.getWorldSamplePoints = options.getWorldSamplePoints || null;
        this.getModelFilename = options.getModelFilename || null;
        this.zoomInButton = options.zoomInButton || null;
        this.zoomOutButton = options.zoomOutButton || null;
        this.refreshButton = options.refreshButton || null;

        if (options.mapCanvas && options.frontCanvas) {
            this.root = null;
            this.statusEl = options.statusElement || defaultStatusElement();
            this.canvases = {
                map: options.mapCanvas,
                front: options.frontCanvas
            };
            this.overlayCanvases = {
                map: this.ensureOverlayCanvas(this.canvases.map),
                front: this.ensureOverlayCanvas(this.canvases.front)
            };
            this.bindExternalZoomButtons();
        } else {
            this.root = document.createElement('div');
            this.root.className = 'otml-step3-dualview';
            this.root.innerHTML = `
                <div class="otml-step3-status">Step3 ready. Waiting for points.</div>
                <div>
                    <canvas data-canvas="map" width="320" height="260"></canvas>
                    <canvas data-canvas="front" width="320" height="260"></canvas>
                </div>
            `;
            this.statusEl = this.root.querySelector('.otml-step3-status') as HTMLDivElement;
            this.canvases = {
                map: this.root.querySelector('[data-canvas="map"]') as HTMLCanvasElement,
                front: this.root.querySelector('[data-canvas="front"]') as HTMLCanvasElement
            };
            this.overlayCanvases = {
                map: this.ensureOverlayCanvas(this.canvases.map),
                front: this.ensureOverlayCanvas(this.canvases.front)
            };
            const parent = options.parent || document.body;
            parent.appendChild(this.root);
        }

        if (options.points && options.points.length > 0) {
            this.setCanonicalPoints(options.points);
        } else {
            this.redraw();
        }

        debugPush('init', {
            hasWorldSource: Boolean(this.getWorldSamplePoints),
            hasModelSource: Boolean(this.getModelFilename)
        });
        this.startLoop();
    }

    open() {
        if (!this.root) return;
        this.root.classList.remove('hidden');
        this.redraw();
    }

    close() {
        if (!this.root) return;
        this.root.classList.add('hidden');
    }

    toggle() {
        if (!this.root) return;
        this.root.classList.toggle('hidden');
        if (!this.root.classList.contains('hidden')) this.redraw();
    }

    destroy() {
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        if (this.externalZoomInHandler && this.zoomInButton) {
            this.zoomInButton.removeEventListener('click', this.externalZoomInHandler);
        }
        if (this.externalZoomOutHandler && this.zoomOutButton) {
            this.zoomOutButton.removeEventListener('click', this.externalZoomOutHandler);
        }
        if (this.externalRefreshHandler && this.refreshButton) {
            this.refreshButton.removeEventListener('click', this.externalRefreshHandler);
        }
        this.root?.remove();
    }

    setCanonicalPoints(points: SampledPoint[]) {
        void points;
        this.refreshProjection('canonical-update', false);
        this.redraw();
    }

    setFlyCameraPose(pose: CameraPose | null) {
        this.flyCameraPose = pose;
        this.redrawOverlayOnly();
    }

    setFlyCameraProvider(provider: (() => CameraPose | null) | null) {
        this.flyCameraProvider = provider;
    }

    redraw() {
        this.renderBaseView('map');
        this.renderBaseView('front');
        this.renderOverlayView('map');
        this.renderOverlayView('front');
    }

    private redrawOverlayOnly() {
        this.renderOverlayView('map');
        this.renderOverlayView('front');
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private bindExternalZoomButtons() {
        if (this.zoomInButton) {
            this.zoomInButton.disabled = false;
            this.externalZoomInHandler = () => {
                this.zoom.map = clamp(this.zoom.map * 1.12, 0.5, 5);
                this.zoom.front = clamp(this.zoom.front * 1.12, 0.5, 5);
                this.redraw();
            };
            this.zoomInButton.addEventListener('click', this.externalZoomInHandler);
        }
        if (this.zoomOutButton) {
            this.zoomOutButton.disabled = false;
            this.externalZoomOutHandler = () => {
                this.zoom.map = clamp(this.zoom.map / 1.12, 0.5, 5);
                this.zoom.front = clamp(this.zoom.front / 1.12, 0.5, 5);
                this.redraw();
            };
            this.zoomOutButton.addEventListener('click', this.externalZoomOutHandler);
        }
        if (this.refreshButton) {
            this.refreshButton.disabled = false;
            this.externalRefreshHandler = () => {
                this.refreshProjection('manual-refresh', true);
                this.redraw();
            };
            this.refreshButton.addEventListener('click', this.externalRefreshHandler);
        }
    }

    private async refreshRuntimeFromDb(modelFilename: string, reason: string) {
        if (this.dbFetchInFlight) return;
        this.dbFetchInFlight = true;
        this.lastDbFetchAt = performance.now();
        try {
            const response = await fetch(`/api/model/calibration?modelFilename=${encodeURIComponent(modelFilename)}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const payload = await response.json();
            if (!payload?.found || !payload?.calibration) {
                this.runtime = null;
                this.rasterCanvas = { map: null, front: null };
                this.viewLayouts.map = null;
                this.viewLayouts.front = null;
                this.dbRuntimeReadyForModel = null;
                this.setStatus('Projection unavailable: no cached calibration images in DB.');
                debugPush('projection-db-missing', {
                    reason,
                    modelFilename
                });
                return;
            }

            const runtime = await buildStep3RuntimeFromDbCalibration(payload.calibration);
            if (!runtime) {
                this.runtime = null;
                this.rasterCanvas = { map: null, front: null };
                this.viewLayouts.map = null;
                this.viewLayouts.front = null;
                this.dbRuntimeReadyForModel = null;
                this.setStatus('Projection unavailable: DB calibration image incomplete.');
                debugPush('projection-db-invalid', {
                    reason,
                    modelFilename
                });
                return;
            }

            this.runtime = runtime as Step3OwnRuntime;
            this.rasterCanvas.map = makeRasterCanvas(this.runtime.map);
            this.rasterCanvas.front = makeRasterCanvas(this.runtime.front);
            this.dbRuntimeReadyForModel = modelFilename;
            this.setStatus('Projection fixed: Top[X,-Z], Front[X,Y] (db)');
            debugPush('projection-refresh', {
                reason,
                source: 'db',
                modelFilename,
                rasterSize: {
                    map: { w: this.runtime.map.width, h: this.runtime.map.height },
                    front: { w: this.runtime.front.width, h: this.runtime.front.height }
                },
                mapRange: this.runtime.map.range,
                frontRange: this.runtime.front.range,
                updatedAt: payload.updatedAt || null
            });
            this.redraw();
        } catch (error) {
            this.runtime = null;
            this.rasterCanvas = { map: null, front: null };
            this.viewLayouts.map = null;
            this.viewLayouts.front = null;
            this.dbRuntimeReadyForModel = null;
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(`Projection unavailable: ${message}`);
            debugPush('projection-db-error', {
                reason,
                modelFilename,
                error: message
            });
        } finally {
            this.dbFetchInFlight = false;
        }
    }

    private refreshProjection(reason: string, force = false) {
        const modelFilename = this.getModelFilename?.() || null;
        if (!modelFilename) {
            const hadRuntime = Boolean(this.runtime);
            this.runtime = null;
            this.rasterCanvas = { map: null, front: null };
            this.viewLayouts.map = null;
            this.viewLayouts.front = null;
            this.dbRuntimeReadyForModel = null;
            this.setStatus('Projection unavailable: load model first.');
            debugPush('projection-no-model', {
                reason,
                source: 'none'
            });
            return hadRuntime;
        }

        const modelChanged = this.activeModelFilename !== modelFilename;
        this.activeModelFilename = modelFilename;

        if (modelChanged) {
            this.runtime = null;
            this.rasterCanvas = { map: null, front: null };
            this.viewLayouts.map = null;
            this.viewLayouts.front = null;
            this.dbRuntimeReadyForModel = null;
        }

        if (force || modelChanged) {
            void this.refreshRuntimeFromDb(modelFilename, reason);
        }

        if (!this.runtime) {
            this.setStatus(this.dbFetchInFlight
                ? 'Projection loading from DB...'
                : 'Projection unavailable: no cached calibration images in DB.');
            return false;
        }

        return false;
    }

    private computeStats(points: SampledPoint[]) {
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
    }

    private startLoop() {
        const tick = () => {
            this.rafId = 0;
            const projectionChanged = this.refreshProjection('raf');
            const baseCanvasNeedsResize = this.baseCanvasNeedsResize();
            const next = this.flyCameraProvider ? this.flyCameraProvider() : this.flyCameraPose;
            const prev = this.flyCameraPose;
            if (next) this.flyCameraPose = next;
            const visible = !this.root || !this.root.classList.contains('hidden');
            if (visible) {
                if (projectionChanged || baseCanvasNeedsResize) {
                    this.redraw();
                } else {
                    const now = performance.now();
                    const poseChanged = this.hasPoseChanged(this.flyCameraPose, prev)
                        || this.hasPoseChanged(this.flyCameraPose, this.lastOverlayPose);
                    if (poseChanged || now - this.lastOverlayDrawAt > 100) {
                        this.redrawOverlayOnly();
                        this.lastOverlayDrawAt = now;
                        this.lastOverlayPose = this.flyCameraPose
                            ? {
                                eye: { ...this.flyCameraPose.eye },
                                forward: { ...this.flyCameraPose.forward }
                            }
                            : null;
                    }
                }
            }
            this.rafId = window.requestAnimationFrame(tick);
        };
        this.rafId = window.requestAnimationFrame(tick);
    }

    private baseCanvasNeedsResize() {
        const views: DualViewId[] = ['map', 'front'];
        for (let i = 0; i < views.length; i += 1) {
            const view = views[i];
            const canvas = this.canvases[view];
            const rect = canvas.getBoundingClientRect();
            const targetW = Math.max(1, Math.round(rect.width));
            const targetH = Math.max(1, Math.round(rect.height));
            if (canvas.width !== targetW || canvas.height !== targetH) return true;
        }
        return false;
    }

    private hasPoseChanged(a: CameraPose | null, b: CameraPose | null) {
        if (!a && !b) return false;
        if (!a || !b) return true;
        const de = Math.hypot(a.eye.x - b.eye.x, a.eye.y - b.eye.y, a.eye.z - b.eye.z);
        const df = Math.hypot(a.forward.x - b.forward.x, a.forward.y - b.forward.y, a.forward.z - b.forward.z);
        return de > 1e-3 || df > 1e-3;
    }

    private ensureOverlayCanvas(baseCanvas: HTMLCanvasElement) {
        const parent = baseCanvas.parentElement;
        if (!parent) return baseCanvas;
        const style = window.getComputedStyle(parent);
        if (style.position === 'static') parent.style.position = 'relative';

        baseCanvas.style.position = 'relative';
        baseCanvas.style.zIndex = '1';
        baseCanvas.style.display = 'block';

        const overlay = document.createElement('canvas');
        overlay.className = 'otml-step3-overlay';
        overlay.width = baseCanvas.width;
        overlay.height = baseCanvas.height;
        overlay.style.position = 'absolute';
        overlay.style.left = `${baseCanvas.offsetLeft}px`;
        overlay.style.top = `${baseCanvas.offsetTop}px`;
        overlay.style.width = `${Math.max(1, baseCanvas.clientWidth)}px`;
        overlay.style.height = `${Math.max(1, baseCanvas.clientHeight)}px`;
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2';
        parent.appendChild(overlay);
        return overlay;
    }

    private syncOverlayResolution(viewId: DualViewId, allowBaseResize = true) {
        const base = this.canvases[viewId];
        const overlay = this.overlayCanvases[viewId];
        if (allowBaseResize) {
            syncCanvasResolutionToClient(base);
        }
        overlay.style.left = `${base.offsetLeft}px`;
        overlay.style.top = `${base.offsetTop}px`;
        overlay.style.width = `${Math.max(1, base.clientWidth)}px`;
        overlay.style.height = `${Math.max(1, base.clientHeight)}px`;
        if (overlay.width !== base.width || overlay.height !== base.height) {
            overlay.width = base.width;
            overlay.height = base.height;
            return true;
        }
        return false;
    }

    private drawOverlay(viewId: DualViewId, ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) {
        if (!this.runtime || !this.flyCameraPose) return;

        const eye = {
            x: safeNumber(this.flyCameraPose.eye.x),
            y: safeNumber(this.flyCameraPose.eye.y),
            z: safeNumber(this.flyCameraPose.eye.z)
        };
        const forward = normalize({
            x: safeNumber(this.flyCameraPose.forward.x, 1),
            y: safeNumber(this.flyCameraPose.forward.y, 0),
            z: safeNumber(this.flyCameraPose.forward.z, 0)
        });
        const tip = {
            x: eye.x + forward.x * 1.5,
            y: eye.y + forward.y * 1.5,
            z: eye.z + forward.z * 1.5
        };

        const range = viewId === 'map' ? this.runtime.map.range : this.runtime.front.range;
        const eyeAxes = viewAxes(eye, viewId);
        const tipAxes = viewAxes(tip, viewId);
        const eyeUvRaw = normalizeToUv(eyeAxes.x, eyeAxes.y, range);
        const tipUvRaw = normalizeToUv(tipAxes.x, tipAxes.y, range);

        const pointVisible = eyeUvRaw.u >= 0 && eyeUvRaw.u <= 1 && eyeUvRaw.v >= 0 && eyeUvRaw.v <= 1;
        if (!pointVisible) return;

        const point = { u: clamp01(eyeUvRaw.u), v: clamp01(eyeUvRaw.v) };
        const tipRaw = { u: tipUvRaw.u, v: tipUvRaw.v };
        const pointX = dx + point.u * dw;
        const pointY = dy + point.v * dh;
        const tipX = dx + tipRaw.u * dw;
        const tipY = dy + tipRaw.v * dh;

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.fillStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pointX, pointY, 4.5, 0, Math.PI * 2);
        ctx.fill();

        const directionVisible = Math.hypot(tipRaw.u - eyeUvRaw.u, tipRaw.v - eyeUvRaw.v) > 1e-4;
        if (directionVisible) {
            ctx.beginPath();
            ctx.moveTo(pointX, pointY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            const angle = Math.atan2(tipY - pointY, tipX - pointX);
            const head = 9;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - Math.cos(angle - Math.PI / 7) * head, tipY - Math.sin(angle - Math.PI / 7) * head);
            ctx.lineTo(tipX - Math.cos(angle + Math.PI / 7) * head, tipY - Math.sin(angle + Math.PI / 7) * head);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    private drawGridPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number) {
        ctx.fillStyle = '#060c16';
        ctx.fillRect(0, 0, width, height);

        const glow = ctx.createRadialGradient(width * 0.68, height * 0.58, 4, width * 0.68, height * 0.58, Math.max(width, height) * 0.5);
        glow.addColorStop(0, 'rgba(245, 114, 32, 0.14)');
        glow.addColorStop(0.4, 'rgba(59, 130, 246, 0.06)');
        glow.addColorStop(1, 'rgba(6, 12, 22, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        const minor = Math.max(12, Math.round(Math.min(width, height) / 12));
        const major = minor * 2;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(73, 93, 120, 0.22)';
        for (let x = 0.5; x < width; x += minor) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0.5; y < height; y += minor) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(164, 188, 214, 0.26)';
        for (let x = 0.5; x < width; x += major) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0.5; y < height; y += major) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(226, 232, 240, 0.72)';
        ctx.beginPath();
        ctx.moveTo(0, 0.5);
        ctx.lineTo(width, 0.5);
        ctx.lineTo(width - 0.5, height);
        ctx.lineTo(0.5, height);
        ctx.closePath();
        ctx.stroke();
    }

    private renderBaseView(viewId: DualViewId) {
        const canvas = this.canvases[viewId];
        const resized = this.syncOverlayResolution(viewId);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawGridPlaceholder(ctx, canvas.width, canvas.height);

        if (!this.runtime || !this.rasterCanvas[viewId]) {
            this.viewLayouts[viewId] = null;
            return;
        }

        const source = this.rasterCanvas[viewId] as HTMLCanvasElement;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const dw = source.width * scale * this.zoom[viewId];
        const dh = source.height * scale * this.zoom[viewId];
        const dx = (canvas.width - dw) * 0.5;
        const dy = (canvas.height - dh) * 0.5;

        ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, dw, dh);
        ctx.strokeStyle = 'rgba(143, 155, 176, 0.28)';
        ctx.lineWidth = 1;
        const spacing = clamp(Math.min(dw, dh) / 8, 14, 26);
        for (let x = dx + spacing; x < dx + dw; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(x, dy);
            ctx.lineTo(x, dy + dh);
            ctx.stroke();
        }
        for (let y = dy + spacing; y < dy + dh; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(dx, y);
            ctx.lineTo(dx + dw, y);
            ctx.stroke();
        }

        this.viewLayouts[viewId] = { dx, dy, dw, dh };
        if (resized) {
            const octx = this.overlayCanvases[viewId].getContext('2d');
            if (octx) octx.clearRect(0, 0, this.overlayCanvases[viewId].width, this.overlayCanvases[viewId].height);
        }
    }

    private renderOverlayView(viewId: DualViewId) {
        const canvas = this.overlayCanvases[viewId];
        this.syncOverlayResolution(viewId, false);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const layout = this.viewLayouts[viewId];
        if (!layout || !this.runtime) return;
        this.drawOverlay(viewId, ctx, layout.dx, layout.dy, layout.dw, layout.dh);
    }
}

const mountOTMLStep3DualView2D = (options: OTMLStep3DualView2DOptions = {}): OTMLStep3DualView2DController => {
    return new OTMLStep3DualView2DPanel(options);
};

export {
    mountOTMLStep3DualView2D,
    type OTMLStep3DualView2DController,
    type OTMLStep3DualView2DOptions
};
