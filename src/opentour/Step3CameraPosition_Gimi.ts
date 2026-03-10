type AxisDirection = 'xp' | 'xn' | 'yp' | 'yn' | 'zp' | 'zn';
type GimiView = 'top' | 'front';

type Vec3 = {
    x: number;
    y: number;
    z: number;
};

type CameraPose = {
    eye: Vec3;
    forward: Vec3;
};

type SamplePoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
};

type ViewRange = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type Raster = {
    width: number;
    height: number;
    range: ViewRange;
    image: Uint8ClampedArray;
};

type CoordinateInput = {
    axisPresetId?: string;
    coordinateSystem?: string;
    upAxis?: string;
    upDirection?: string;
};

type Basis3 = {
    right: Vec3;
    up: Vec3;
    front: Vec3;
};

type Runtime = {
    coordinatePresetId: string;
    basis: Basis3;
    top: Raster;
    front: Raster;
};

type OverlayResult = {
    valid: boolean;
    pointVisible: boolean;
    point: { u: number; v: number };
    pointRaw: { u: number; v: number };
    directionVisible: boolean;
    directionTo: { u: number; v: number };
    directionToRaw: { u: number; v: number };
};

const PRESET: Record<string, { up: AxisDirection; front: AxisDirection }> = {
    'r-yup-xfwd': { up: 'yp', front: 'xp' },
    'r-yup-xback': { up: 'yp', front: 'xn' },
    'r-yup-zfwd': { up: 'yp', front: 'zp' },
    'r-yup-zback': { up: 'yp', front: 'zn' },
    'r-ydown-xfwd': { up: 'yn', front: 'xp' },
    'r-ydown-xback': { up: 'yn', front: 'xn' },
    'r-ydown-zfwd': { up: 'yn', front: 'zp' },
    'r-ydown-zback': { up: 'yn', front: 'zn' },
    'r-zup-xfwd': { up: 'zp', front: 'xp' },
    'r-zup-xback': { up: 'zp', front: 'xn' },
    'r-zup-yfwd': { up: 'zp', front: 'yp' },
    'r-zup-yback': { up: 'zp', front: 'yn' },
    'r-zdown-xfwd': { up: 'zn', front: 'xp' },
    'r-zdown-xback': { up: 'zn', front: 'xn' },
    'r-zdown-yfwd': { up: 'zn', front: 'yp' },
    'r-zdown-yback': { up: 'zn', front: 'yn' }
};

const DEFAULT_PRESET = 'r-zup-yfwd';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const safe = (v: number, fallback = 0) => Number.isFinite(v) ? v : fallback;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
});

const normalize = (v: Vec3): Vec3 => {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-8) return { x: 1, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const axisVector = (axis: AxisDirection): Vec3 => {
    if (axis === 'xp') return { x: 1, y: 0, z: 0 };
    if (axis === 'xn') return { x: -1, y: 0, z: 0 };
    if (axis === 'yp') return { x: 0, y: 1, z: 0 };
    if (axis === 'yn') return { x: 0, y: -1, z: 0 };
    if (axis === 'zp') return { x: 0, y: 0, z: 1 };
    return { x: 0, y: 0, z: -1 };
};

const sanitizePreset = (raw?: string) => String(raw || '').trim().toLowerCase().replace(/_/g, '-');

const presetFromCoordinateFields = (coordinateSystem?: string, upAxis?: string, upDirection?: string) => {
    const system = String(coordinateSystem || '').trim().toLowerCase();
    const axis = String(upAxis || '').trim().toLowerCase();
    const direction = String(upDirection || '').trim().toLowerCase();

    if (axis === 'y' && direction === 'down') return system === 'opengl' ? 'r-ydown-zback' : 'r-ydown-zfwd';
    if (axis === 'y' && direction === 'up') return system === 'opengl' ? 'r-yup-zback' : 'r-yup-zfwd';
    if (axis === 'z' && direction === 'down') return system === 'opengl' ? 'r-zdown-yback' : 'r-zdown-yfwd';
    return system === 'opengl' ? 'r-zup-yback' : 'r-zup-yfwd';
};

const resolvePresetId = (input?: CoordinateInput) => {
    const direct = sanitizePreset(input?.axisPresetId);
    if (PRESET[direct]) return direct;

    const fieldPreset = presetFromCoordinateFields(input?.coordinateSystem, input?.upAxis, input?.upDirection);
    const normalizedFieldPreset = sanitizePreset(fieldPreset);
    if (PRESET[normalizedFieldPreset]) return normalizedFieldPreset;

    return DEFAULT_PRESET;
};

const buildBasis = (presetId: string): Basis3 => {
    const preset = PRESET[presetId] || PRESET[DEFAULT_PRESET];
    const up = axisVector(preset.up);
    const front = axisVector(preset.front);
    const right = normalize(cross(front, up));
    return { right, up, front };
};

const worldToBasisPoint = (p: Vec3, basis: Basis3): Vec3 => ({
    x: dot(p, basis.right),
    y: dot(p, basis.up),
    z: dot(p, basis.front)
});

const quantile = (values: number[], q: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
    return sorted[index];
};

const buildRange = (points: Vec3[], view: GimiView): ViewRange => {
    const xs: number[] = [];
    const ys: number[] = [];

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        xs.push(p.x);
        ys.push(view === 'top' ? p.z : p.y);
    }

    if (xs.length < 8 || ys.length < 8) {
        return { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    }

    const xLow = quantile(xs, 0.02);
    const xHigh = quantile(xs, 0.98);
    const yLow = quantile(ys, 0.02);
    const yHigh = quantile(ys, 0.98);
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

const spanInv = (min: number, max: number) => {
    const span = max - min;
    if (Math.abs(span) < 1e-6) return 1e6;
    return 1 / span;
};

const toUv = (x: number, y: number, range: ViewRange) => ({
    u: (x - range.xMin) * spanInv(range.xMin, range.xMax),
    v: 1 - ((y - range.yMin) * spanInv(range.yMin, range.yMax))
});

const rasterize = (
    points: Vec3[],
    opacities: number[],
    range: ViewRange,
    view: GimiView,
    width: number,
    height: number
) => {
    const density = new Float32Array(width * height);

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = p.x;
        const y = view === 'top' ? p.z : p.y;
        const uv = toUv(x, y, range);
        if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) continue;
        const px = clamp(Math.floor(uv.u * (width - 1)), 0, width - 1);
        const py = clamp(Math.floor(uv.v * (height - 1)), 0, height - 1);
        density[py * width + px] += clamp(safe(opacities[i], 1), 0.05, 1);
    }

    let maxDensity = 0;
    for (let i = 0; i < density.length; i++) {
        if (density[i] > maxDensity) maxDensity = density[i];
    }

    const out = new Uint8ClampedArray(width * height * 4);
    const den = Math.max(1e-6, Math.log1p(maxDensity));
    for (let i = 0; i < density.length; i++) {
        const intensity = maxDensity <= 0 ? 0 : Math.log1p(density[i]) / den;
        const base = i * 4;
        const shade = Math.floor((1 - intensity) * 255);
        out[base + 0] = shade;
        out[base + 1] = shade;
        out[base + 2] = shade;
        out[base + 3] = 255;
    }
    return out;
};

const buildStep3GimiRuntime = (input: {
    coordinate: CoordinateInput;
    sampledPoints: SamplePoint[];
    topWidth: number;
    topHeight: number;
    frontWidth: number;
    frontHeight: number;
}): Runtime => {
    const coordinatePresetId = resolvePresetId(input.coordinate);
    const basis = buildBasis(coordinatePresetId);

    const converted: Vec3[] = [];
    const opacities: number[] = [];
    for (let i = 0; i < input.sampledPoints.length; i++) {
        const p = input.sampledPoints[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        converted.push(worldToBasisPoint({ x: p.x, y: p.y, z: p.z }, basis));
        opacities.push(clamp(safe(p.opacity, 1), 0.05, 1));
    }

    const topRange = buildRange(converted, 'top');
    const frontRange = buildRange(converted, 'front');

    return {
        coordinatePresetId,
        basis,
        top: {
            width: input.topWidth,
            height: input.topHeight,
            range: topRange,
            image: rasterize(converted, opacities, topRange, 'top', input.topWidth, input.topHeight)
        },
        front: {
            width: input.frontWidth,
            height: input.frontHeight,
            range: frontRange,
            image: rasterize(converted, opacities, frontRange, 'front', input.frontWidth, input.frontHeight)
        }
    };
};

const projectStep3GimiCamera = (input: {
    runtime: Runtime;
    cameraPose: CameraPose | null | undefined;
    view: GimiView;
    directionLengthMeters?: number;
}): OverlayResult => {
    const fail: OverlayResult = {
        valid: false,
        pointVisible: false,
        point: { u: 0.5, v: 0.5 },
        pointRaw: { u: 0.5, v: 0.5 },
        directionVisible: false,
        directionTo: { u: 0.5, v: 0.5 },
        directionToRaw: { u: 0.5, v: 0.5 }
    };
    if (!input.runtime || !input.cameraPose) return fail;

    const eye = {
        x: safe(input.cameraPose.eye.x),
        y: safe(input.cameraPose.eye.y),
        z: safe(input.cameraPose.eye.z)
    };
    const forward = normalize({
        x: safe(input.cameraPose.forward.x, 1),
        y: safe(input.cameraPose.forward.y),
        z: safe(input.cameraPose.forward.z)
    });
    const len = Math.max(0.2, safe(input.directionLengthMeters ?? 1.5, 1.5));
    const tip = {
        x: eye.x + forward.x * len,
        y: eye.y + forward.y * len,
        z: eye.z + forward.z * len
    };

    const eyeLocal = worldToBasisPoint(eye, input.runtime.basis);
    const tipLocal = worldToBasisPoint(tip, input.runtime.basis);
    const range = input.view === 'top' ? input.runtime.top.range : input.runtime.front.range;

    const eyeRaw = toUv(eyeLocal.x, input.view === 'top' ? eyeLocal.z : eyeLocal.y, range);
    const tipRaw = toUv(tipLocal.x, input.view === 'top' ? tipLocal.z : tipLocal.y, range);

    const point = { u: clamp01(eyeRaw.u), v: clamp01(eyeRaw.v) };
    const directionTo = { u: clamp01(tipRaw.u), v: clamp01(tipRaw.v) };
    const pointVisible = eyeRaw.u >= 0 && eyeRaw.u <= 1 && eyeRaw.v >= 0 && eyeRaw.v <= 1;
    const directionVisible = Math.hypot(tipRaw.u - eyeRaw.u, tipRaw.v - eyeRaw.v) > 1e-4;

    return {
        valid: true,
        pointVisible,
        point,
        pointRaw: eyeRaw,
        directionVisible,
        directionTo,
        directionToRaw: tipRaw
    };
};

const overlayUvToCanvas = (uv: { u: number; v: number }, width: number, height: number) => ({
    x: uv.u * width,
    y: uv.v * height
});

export {
    DEFAULT_PRESET as STEP3_GIMI_DEFAULT_PRESET,
    buildStep3GimiRuntime,
    projectStep3GimiCamera,
    overlayUvToCanvas
};

export type {
    CameraPose as Step3GimiCameraPose,
    CoordinateInput as Step3GimiCoordinateInput,
    OverlayResult as Step3GimiOverlayResult,
    Runtime as Step3GimiRuntime,
    SamplePoint as Step3GimiSamplePoint
};
