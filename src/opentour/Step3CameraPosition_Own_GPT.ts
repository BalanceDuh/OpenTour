type Step3OverlayView = 'map' | 'front';

type Vec3Point = {
    x: number;
    y: number;
    z: number;
};

type Step3SamplePoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
};

type Step3ViewRange = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type Step3CameraPose = {
    eye: Vec3Point;
    forward: Vec3Point;
};

type Step3Raster = {
    width: number;
    height: number;
    image: Uint8ClampedArray;
    range: Step3ViewRange;
};

type Step3OwnRuntime = {
    projectionMode: 'top-x-negz__front-x-y';
    map: Step3Raster;
    front: Step3Raster;
};

type Step3OverlayResult = {
    valid: boolean;
    pointVisible: boolean;
    point: { u: number; v: number };
    pointRaw: { u: number; v: number };
    directionVisible: boolean;
    directionTo: { u: number; v: number };
    directionToRaw: { u: number; v: number };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const clamp01 = (v: number) => clamp(v, 0, 1);

const safeNumber = (v: number, fallback = 0) => Number.isFinite(v) ? v : fallback;

const normalize = (v: Vec3Point): Vec3Point => {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-8) return { x: 1, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

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

const viewAxes = (p: Vec3Point, view: Step3OverlayView) => {
    if (view === 'map') {
        return { x: p.x, y: -p.z };
    }
    return { x: p.x, y: p.y };
};

const buildViewRange = (points: Vec3Point[], view: Step3OverlayView): Step3ViewRange => {
    const xVals: number[] = [];
    const yVals: number[] = [];
    for (let i = 0; i < points.length; i++) {
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

const rasterizeView = (
    points: Vec3Point[],
    range: Step3ViewRange,
    view: Step3OverlayView,
    width: number,
    height: number,
    opacities: number[]
): Uint8ClampedArray => {
    const density = new Float32Array(width * height);
    const xInv = spanInv(range.xMin, range.xMax);
    const yInv = spanInv(range.yMin, range.yMax);

    for (let i = 0; i < points.length; i++) {
        const a = viewAxes(points[i], view);
        const u = (a.x - range.xMin) * xInv;
        const v = 1 - ((a.y - range.yMin) * yInv);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const px = clamp(Math.floor(u * (width - 1)), 0, width - 1);
        const py = clamp(Math.floor(v * (height - 1)), 0, height - 1);
        density[py * width + px] += clamp(safeNumber(opacities[i], 1), 0.05, 1);
    }

    let maxDensity = 0;
    for (let i = 0; i < density.length; i++) {
        if (density[i] > maxDensity) maxDensity = density[i];
    }

    const image = new Uint8ClampedArray(width * height * 4);
    const den = Math.max(1e-6, Math.log1p(maxDensity));
    for (let i = 0; i < density.length; i++) {
        const intensity = maxDensity <= 0 ? 0 : Math.log1p(density[i]) / den;
        const base = i * 4;
        const shade = Math.floor((1 - intensity) * 255);
        image[base + 0] = shade;
        image[base + 1] = shade;
        image[base + 2] = shade + 6 > 255 ? 255 : shade + 6;
        image[base + 3] = 255;
    }
    return image;
};

const normalizeToUv = (x: number, y: number, range: Step3ViewRange) => {
    const u = (x - range.xMin) * spanInv(range.xMin, range.xMax);
    const v = 1 - ((y - range.yMin) * spanInv(range.yMin, range.yMax));
    return { u, v };
};

const buildStep3OwnRuntime = (input: {
    sampledPoints: Step3SamplePoint[];
    mapWidth: number;
    mapHeight: number;
    frontWidth: number;
    frontHeight: number;
}): Step3OwnRuntime => {
    const points: Vec3Point[] = [];
    const opacities: number[] = [];
    for (let i = 0; i < input.sampledPoints.length; i++) {
        const sp = input.sampledPoints[i];
        if (!Number.isFinite(sp.x) || !Number.isFinite(sp.y) || !Number.isFinite(sp.z)) continue;
        points.push({ x: sp.x, y: sp.y, z: sp.z });
        opacities.push(clamp(safeNumber(sp.opacity, 1), 0.05, 1));
    }

    const mapRange = buildViewRange(points, 'map');
    const frontRange = buildViewRange(points, 'front');

    return {
        projectionMode: 'top-x-negz__front-x-y',
        map: {
            width: input.mapWidth,
            height: input.mapHeight,
            image: rasterizeView(points, mapRange, 'map', input.mapWidth, input.mapHeight, opacities),
            range: mapRange
        },
        front: {
            width: input.frontWidth,
            height: input.frontHeight,
            image: rasterizeView(points, frontRange, 'front', input.frontWidth, input.frontHeight, opacities),
            range: frontRange
        }
    };
};

const projectStep3CameraOverlay = (input: {
    runtime: Step3OwnRuntime;
    cameraPose: Step3CameraPose | null | undefined;
    view: Step3OverlayView;
    directionLengthMeters?: number;
}): Step3OverlayResult => {
    const fail: Step3OverlayResult = {
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
        x: safeNumber(input.cameraPose.eye.x),
        y: safeNumber(input.cameraPose.eye.y),
        z: safeNumber(input.cameraPose.eye.z)
    };
    const forward = normalize({
        x: safeNumber(input.cameraPose.forward.x, 1),
        y: safeNumber(input.cameraPose.forward.y, 0),
        z: safeNumber(input.cameraPose.forward.z, 0)
    });
    const directionLength = Math.max(0.2, safeNumber(input.directionLengthMeters ?? 1.5, 1.5));
    const tip = {
        x: eye.x + forward.x * directionLength,
        y: eye.y + forward.y * directionLength,
        z: eye.z + forward.z * directionLength
    };

    const range = input.view === 'map' ? input.runtime.map.range : input.runtime.front.range;
    const eyeAxes = viewAxes(eye, input.view);
    const tipAxes = viewAxes(tip, input.view);
    const eyeUvRaw = normalizeToUv(eyeAxes.x, eyeAxes.y, range);
    const tipUvRaw = normalizeToUv(tipAxes.x, tipAxes.y, range);

    const point = { u: clamp01(eyeUvRaw.u), v: clamp01(eyeUvRaw.v) };
    const directionTo = { u: clamp01(tipUvRaw.u), v: clamp01(tipUvRaw.v) };
    const pointVisible = eyeUvRaw.u >= 0 && eyeUvRaw.u <= 1 && eyeUvRaw.v >= 0 && eyeUvRaw.v <= 1;
    const directionVisible = Math.hypot(tipUvRaw.u - eyeUvRaw.u, tipUvRaw.v - eyeUvRaw.v) > 1e-4;

    return {
        valid: true,
        pointVisible,
        point,
        pointRaw: eyeUvRaw,
        directionVisible,
        directionTo,
        directionToRaw: tipUvRaw
    };
};

const overlayUvToCanvas = (uv: { u: number; v: number }, width: number, height: number) => ({
    x: uv.u * width,
    y: uv.v * height
});

export {
    buildStep3OwnRuntime,
    projectStep3CameraOverlay,
    overlayUvToCanvas
};

export type {
    Step3OverlayView,
    Step3SamplePoint,
    Step3OwnRuntime,
    Step3CameraPose,
    Step3OverlayResult,
    Step3ViewRange
};
