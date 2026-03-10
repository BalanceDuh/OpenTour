import { getCoordinateViewProfile, type AxisDir, type CoordinateId } from '../coordinateViews';
import type { ProjectionByAxisResult, ProjectionParams, ProjectionViewResult, RectNorm, SampledPoint } from './otml_types';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const axisValue = (point: SampledPoint, axis: AxisDir) => {
    if (axis === '+X') return point.x;
    if (axis === '-X') return -point.x;
    if (axis === '+Y') return point.y;
    if (axis === '-Y') return -point.y;
    if (axis === '+Z') return point.z;
    return -point.z;
};

const defaultProjectionParams = (): ProjectionParams => ({
    sliceMin: -3,
    sliceMax: 3,
    xRangeMin: -8,
    xRangeMax: 8,
    heightMin: -2,
    heightMax: 6
});

const percentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
    return sorted[idx];
};

const meanStdRange = (values: number[], sigma = 3, padRatio = 0.05) => {
    if (values.length === 0) return { min: -1, max: 1 };
    let sum = 0;
    let count = 0;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        sum += v;
        count += 1;
    }
    if (count === 0) return { min: -1, max: 1 };
    const mean = sum / count;
    let sq = 0;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        const d = v - mean;
        sq += d * d;
    }
    const std = Math.sqrt(Math.max(1e-10, sq / Math.max(1, count - 1)));
    let min = mean - sigma * std;
    let max = mean + sigma * std;
    if (Math.abs(max - min) < 1e-5) {
        const pad = Math.max(0.5, Math.abs(mean) * 0.2);
        min -= pad;
        max += pad;
    }
    const span = Math.max(1e-4, max - min);
    const pad = span * padRatio;
    return { min: min - pad, max: max + pad };
};

const suggestProjectionByCoordinate = (points: SampledPoint[], coordinateId: CoordinateId): ProjectionParams => {
    const profile = getCoordinateViewProfile(coordinateId);
    const xAxis = profile.topView.screenRight;
    const planeBAxis = profile.topView.screenUp;
    const sliceAxis = profile.frontView.screenUp;
    const source = points.filter((p) => p.opacity >= 0.08);
    const pts = source.length > 0 ? source : points;

    const x = meanStdRange(pts.map((p) => axisValue(p, xAxis)), 3, 0.05);
    const planeB = meanStdRange(pts.map((p) => axisValue(p, planeBAxis)), 3, 0.05);
    const slice = meanStdRange(pts.map((p) => axisValue(p, sliceAxis)), 3, 0.05);

    return {
        xRangeMin: x.min,
        xRangeMax: x.max,
        heightMin: planeB.min,
        heightMax: planeB.max,
        sliceMin: slice.min,
        sliceMax: slice.max
    };
};

const createRectFallback = (): RectNorm => ({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 });

const computeRectFromDensity = (density: Float32Array, width: number, height: number): RectNorm => {
    const samples: number[] = [];
    for (let i = 0; i < density.length; i += 1) if (density[i] > 0) samples.push(density[i]);
    if (samples.length === 0) return createRectFallback();

    let sum = 0;
    for (const v of samples) sum += v;
    const mean = sum / samples.length;
    let sq = 0;
    for (const v of samples) sq += (v - mean) * (v - mean);
    const std = Math.sqrt(Math.max(1e-10, sq / Math.max(1, samples.length - 1)));
    const threshold = mean + std * 2;

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = y * width + x;
            if (density[idx] < threshold) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < minX || maxY < minY) return createRectFallback();

    const inflateX = Math.max(2, Math.round((maxX - minX + 1) * 0.08));
    const inflateY = Math.max(2, Math.round((maxY - minY + 1) * 0.08));
    minX = clamp(minX - inflateX, 0, width - 1);
    minY = clamp(minY - inflateY, 0, height - 1);
    maxX = clamp(maxX + inflateX, 0, width - 1);
    maxY = clamp(maxY + inflateY, 0, height - 1);

    return { x: minX / width, y: minY / height, w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height };
};

const drawRaster = (
    points: SampledPoint[],
    axisX: AxisDir,
    axisY: AxisDir,
    width: number,
    height: number,
    tint: [number, number, number],
    fixedRange?: { xMin: number; xMax: number; yMin: number; yMax: number }
): ProjectionViewResult => {
    const xRange = fixedRange ? { min: Math.min(fixedRange.xMin, fixedRange.xMax), max: Math.max(fixedRange.xMin, fixedRange.xMax) } : meanStdRange(points.map((p) => axisValue(p, axisX)));
    const yRange = fixedRange ? { min: Math.min(fixedRange.yMin, fixedRange.yMax), max: Math.max(fixedRange.yMin, fixedRange.yMax) } : meanStdRange(points.map((p) => axisValue(p, axisY)));

    const density = new Float32Array(width * height);
    for (const point of points) {
        const x = axisValue(point, axisX);
        const y = axisValue(point, axisY);
        const xn = (x - xRange.min) / Math.max(1e-6, xRange.max - xRange.min);
        const yn = (y - yRange.min) / Math.max(1e-6, yRange.max - yRange.min);
        if (xn < 0 || xn > 1 || yn < 0 || yn > 1) continue;
        const px = Math.round(xn * (width - 1));
        const py = Math.round((1 - yn) * (height - 1));
        density[py * width + px] += clamp(point.opacity, 0.05, 1);
    }

    const nonZero: number[] = [];
    for (let i = 0; i < density.length; i += 1) if (density[i] > 0) nonZero.push(density[i]);
    const robustMax = nonZero.length > 0 ? Math.max(1e-6, percentile(nonZero, 0.99)) : 0;

    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
        const alpha = robustMax > 0 ? clamp(Math.log1p(density[i]) / Math.log1p(robustMax), 0, 1) : 0;
        const base = i * 4;
        const bg = 8;
        pixels[base + 0] = Math.round(bg + tint[0] * alpha);
        pixels[base + 1] = Math.round(bg + tint[1] * alpha);
        pixels[base + 2] = Math.round(bg + tint[2] * alpha);
        pixels[base + 3] = 255;
    }

    return {
        image: { width, height, pixels },
        density,
        maxDensity: robustMax,
        rect: computeRectFromDensity(density, width, height),
        axisX,
        axisY,
        xRange,
        yRange
    };
};



type RotationQuaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};

type CoordinateRotationPlan = {
    sourceCoordinateId: CoordinateId;
    targetCoordinateId: CoordinateId;
    quaternion: RotationQuaternion;
    matrix: [number, number, number, number, number, number, number, number, number];
};

const transformPointsByRotationPlan = (
    points: SampledPoint[],
    plan: CoordinateRotationPlan
): SampledPoint[] => {
    const m = plan.matrix;
    const out: SampledPoint[] = new Array(points.length);
    for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        out[i] = {
            x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
            y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
            z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
            opacity: p.opacity
        };
    }
    return out;
};

const axisVector = (axis: AxisDir): [number, number, number] => {
    if (axis === '+X') return [1, 0, 0];
    if (axis === '-X') return [-1, 0, 0];
    if (axis === '+Y') return [0, 1, 0];
    if (axis === '-Y') return [0, -1, 0];
    if (axis === '+Z') return [0, 0, 1];
    return [0, 0, -1];
};

const matMul = (a: number[][], b: number[][]) => {
    const out = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
            out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
        }
    }
    return out;
};

const matTranspose = (m: number[][]) => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]]
];

const quatFromBasisMatrix = (m: number[][]): RotationQuaternion => {
    const m00 = m[0][0];
    const m01 = m[0][1];
    const m02 = m[0][2];
    const m10 = m[1][0];
    const m11 = m[1][1];
    const m12 = m[1][2];
    const m20 = m[2][0];
    const m21 = m[2][1];
    const m22 = m[2][2];

    const trace = m00 + m11 + m22;
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 1;

    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        w = 0.25 * s;
        x = (m21 - m12) / s;
        y = (m02 - m20) / s;
        z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }

    const len = Math.hypot(x, y, z, w) || 1;
    return { x: x / len, y: y / len, z: z / len, w: w / len };
};

const buildRotationToCoordinate = (
    sourceCoordinateId: CoordinateId,
    targetCoordinateId: CoordinateId = 'R-Yup-Zback'
): CoordinateRotationPlan => {
    const source = getCoordinateViewProfile(sourceCoordinateId);
    const target = getCoordinateViewProfile(targetCoordinateId);

    const sx = axisVector(source.axes.right);
    const sy = axisVector(source.axes.up);
    const sz = axisVector(source.axes.forward);

    const tx = axisVector(target.axes.right);
    const ty = axisVector(target.axes.up);
    const tz = axisVector(target.axes.forward);

    const bSource = [
        [sx[0], sy[0], sz[0]],
        [sx[1], sy[1], sz[1]],
        [sx[2], sy[2], sz[2]]
    ];

    const bTarget = [
        [tx[0], ty[0], tz[0]],
        [tx[1], ty[1], tz[1]],
        [tx[2], ty[2], tz[2]]
    ];

    const rot = matMul(bTarget, matTranspose(bSource));
    const quaternion = quatFromBasisMatrix(rot);

    return {
        sourceCoordinateId,
        targetCoordinateId,
        quaternion,
        matrix: [
            rot[0][0], rot[0][1], rot[0][2],
            rot[1][0], rot[1][1], rot[1][2],
            rot[2][0], rot[2][1], rot[2][2]
        ]
    };
};

const computeProjectionByCoordinate = (
    points: SampledPoint[],
    coordinateId: CoordinateId,
    width = 420,
    height = 210,
    projection?: ProjectionParams
): ProjectionByAxisResult => {
    const profile = getCoordinateViewProfile(coordinateId);
    const usedProjection = projection ?? defaultProjectionParams();
    const top = drawRaster(points, profile.topView.screenRight, profile.topView.screenUp, width, height, [255, 90, 90], {
        xMin: usedProjection.xRangeMin,
        xMax: usedProjection.xRangeMax,
        yMin: usedProjection.heightMin,
        yMax: usedProjection.heightMax
    });
    const front = drawRaster(points, profile.frontView.screenRight, profile.frontView.screenUp, width, height, [50, 214, 99], {
        xMin: usedProjection.xRangeMin,
        xMax: usedProjection.xRangeMax,
        yMin: usedProjection.sliceMin,
        yMax: usedProjection.sliceMax
    });

    return { coordinateId, top, front, usedProjection };
};

export {
    computeProjectionByCoordinate,
    defaultProjectionParams,
    suggestProjectionByCoordinate,
    buildRotationToCoordinate,
    transformPointsByRotationPlan,
    type RotationQuaternion,
    type CoordinateRotationPlan
};
