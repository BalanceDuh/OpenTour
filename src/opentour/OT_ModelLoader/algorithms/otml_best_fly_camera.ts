import { getCoordinateViewProfile, type AxisDir } from '../coordinateViews';
import type { BestFlyCameraCandidate, BestFlyCameraInput, BestFlyCameraResult } from './otml_types';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const axisVector = (axis: AxisDir) => {
    if (axis === '+X') return { x: 1, y: 0, z: 0 };
    if (axis === '-X') return { x: -1, y: 0, z: 0 };
    if (axis === '+Y') return { x: 0, y: 1, z: 0 };
    if (axis === '-Y') return { x: 0, y: -1, z: 0 };
    if (axis === '+Z') return { x: 0, y: 0, z: 1 };
    return { x: 0, y: 0, z: -1 };
};

const addScaled = (base: { x: number; y: number; z: number }, axis: AxisDir, value: number) => {
    const v = axisVector(axis);
    return {
        x: base.x + v.x * value,
        y: base.y + v.y * value,
        z: base.z + v.z * value
    };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const worldValueFromNorm = (norm: number, min: number, max: number, inverted: boolean) => {
    const t = inverted ? (1 - norm) : norm;
    return lerp(min, max, clamp(t, 0, 1));
};

type WorldComponent = 'x' | 'y' | 'z';

const axisRangeToWorld = (axis: AxisDir, min: number, max: number): { component: WorldComponent; min: number; max: number } => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (axis === '+X') return { component: 'x', min: lo, max: hi };
    if (axis === '-X') return { component: 'x', min: -hi, max: -lo };
    if (axis === '+Y') return { component: 'y', min: lo, max: hi };
    if (axis === '-Y') return { component: 'y', min: -hi, max: -lo };
    if (axis === '+Z') return { component: 'z', min: lo, max: hi };
    return { component: 'z', min: -hi, max: -lo };
};

const resolveWorldRanges = (ranges: Array<{ min: number; max: number }>) => {
    if (ranges.length === 0) return { min: -0.5, max: 0.5, center: 0 };
    let min = ranges[0].min;
    let max = ranges[0].max;
    for (let i = 1; i < ranges.length; i += 1) {
        const r = ranges[i];
        const overlapMin = Math.max(min, r.min);
        const overlapMax = Math.min(max, r.max);
        if (overlapMin <= overlapMax) {
            min = overlapMin;
            max = overlapMax;
        } else {
            min = (min + r.min) * 0.5;
            max = (max + r.max) * 0.5;
        }
    }
    return { min, max, center: (min + max) * 0.5 };
};

const normalize = (v: { x: number; y: number; z: number }) => {
    const len = Math.hypot(v.x, v.y, v.z);
    if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: 0, z: -1 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const subtract = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z
    };
};

const recommendBestFlyCamera = (input: BestFlyCameraInput): BestFlyCameraResult => {
    const profile = getCoordinateViewProfile(input.coordinateId);

    const topXMin = worldValueFromNorm(input.topRect.x, input.topView.xRange.min, input.topView.xRange.max, false);
    const topXMax = worldValueFromNorm(input.topRect.x + input.topRect.w, input.topView.xRange.min, input.topView.xRange.max, false);
    const topYTop = worldValueFromNorm(input.topRect.y, input.topView.yRange.min, input.topView.yRange.max, true);
    const topYBottom = worldValueFromNorm(input.topRect.y + input.topRect.h, input.topView.yRange.min, input.topView.yRange.max, true);

    const frontXMin = worldValueFromNorm(input.frontRect.x, input.frontView.xRange.min, input.frontView.xRange.max, false);
    const frontXMax = worldValueFromNorm(input.frontRect.x + input.frontRect.w, input.frontView.xRange.min, input.frontView.xRange.max, false);
    const frontYTop = worldValueFromNorm(input.frontRect.y, input.frontView.yRange.min, input.frontView.yRange.max, true);
    const frontYBottom = worldValueFromNorm(input.frontRect.y + input.frontRect.h, input.frontView.yRange.min, input.frontView.yRange.max, true);

    const topXWorld = axisRangeToWorld(input.topView.axisX, topXMin, topXMax);
    const topYWorld = axisRangeToWorld(input.topView.axisY, topYBottom, topYTop);
    const frontXWorld = axisRangeToWorld(input.frontView.axisX, frontXMin, frontXMax);
    const frontYWorld = axisRangeToWorld(input.frontView.axisY, frontYBottom, frontYTop);

    const xResolved = resolveWorldRanges([
        ...(topXWorld.component === 'x' ? [{ min: topXWorld.min, max: topXWorld.max }] : []),
        ...(frontXWorld.component === 'x' ? [{ min: frontXWorld.min, max: frontXWorld.max }] : [])
    ]);
    const yResolved = resolveWorldRanges([
        ...(topXWorld.component === 'y' ? [{ min: topXWorld.min, max: topXWorld.max }] : []),
        ...(topYWorld.component === 'y' ? [{ min: topYWorld.min, max: topYWorld.max }] : []),
        ...(frontXWorld.component === 'y' ? [{ min: frontXWorld.min, max: frontXWorld.max }] : []),
        ...(frontYWorld.component === 'y' ? [{ min: frontYWorld.min, max: frontYWorld.max }] : [])
    ]);
    const zResolved = resolveWorldRanges([
        ...(topXWorld.component === 'z' ? [{ min: topXWorld.min, max: topXWorld.max }] : []),
        ...(topYWorld.component === 'z' ? [{ min: topYWorld.min, max: topYWorld.max }] : []),
        ...(frontXWorld.component === 'z' ? [{ min: frontXWorld.min, max: frontXWorld.max }] : []),
        ...(frontYWorld.component === 'z' ? [{ min: frontYWorld.min, max: frontYWorld.max }] : [])
    ]);

    const xMin = xResolved.min;
    const xMax = xResolved.max;
    const yMin = yResolved.min;
    const yMax = yResolved.max;
    const zMin = zResolved.min;
    const zMax = zResolved.max;

    const center = {
        x: xResolved.center,
        y: (yMin + yMax) * 0.5,
        z: (zMin + zMax) * 0.5
    };

    const spanX = Math.max(0.1, xResolved.max - xResolved.min);
    const spanY = Math.max(0.1, yMax - yMin);
    const spanZ = Math.max(0.1, zMax - zMin);

    const horizontalSpan = Math.max(spanX, spanZ);
    const recommendedFovDeg = clamp(70 + (horizontalSpan / Math.max(1e-6, spanY)) * 8, 65, 100);
    const recommendedEyeHeightMeters = clamp(spanY * 0.34, 1.2, 2.2);

    const effectiveFovDeg = clamp(Number.isFinite(input.fovDeg) ? input.fovDeg : recommendedFovDeg, 20, 120);
    const effectiveEyeHeightMeters = clamp(Number.isFinite(input.eyeHeightMeters) ? input.eyeHeightMeters : recommendedEyeHeightMeters, 0.6, Math.max(0.8, spanY));

    const forwardAxis = profile.axes.forward;
    const floorY = yMin;
    const eyeY = clamp(floorY + effectiveEyeHeightMeters, floorY + 0.35, yMax - 0.1);

    const baseEye = {
        x: xResolved.center,
        y: eyeY,
        z: zResolved.center
    };

    const sideOffset = Math.max(0.25, Math.min(spanX, spanZ) * 0.18);
    const depthOffset = Math.max(0.12, Math.min(spanX, spanZ) * 0.08);

    const lookTarget = addScaled(center, forwardAxis, Math.max(0.5, Math.min(spanX, spanZ) * 0.22));

    const buildCandidate = (id: string, score: number, eye: { x: number; y: number; z: number }): BestFlyCameraCandidate => {
        const forward = normalize(subtract(lookTarget, eye));
        return {
            id,
            score,
            eye,
            forward,
            fovDeg: effectiveFovDeg,
            eyeHeightMeters: effectiveEyeHeightMeters
        };
    };

    const leftEye = addScaled(addScaled(baseEye, profile.semantic.left, sideOffset), forwardAxis, depthOffset);
    const rightEye = addScaled(addScaled(baseEye, profile.semantic.right, sideOffset), forwardAxis, depthOffset);

    const candidates: BestFlyCameraCandidate[] = [
        buildCandidate('best-main', 1, baseEye),
        buildCandidate('best-left', 0.9, leftEye),
        buildCandidate('best-right', 0.89, rightEye)
    ];

    return {
        best: candidates[0],
        candidates,
        center,
        recommendedFovDeg,
        recommendedEyeHeightMeters,
        bounds: {
            xMin,
            xMax,
            yMin,
            yMax,
            zMin,
            zMax
        }
    };
};

export {
    recommendBestFlyCamera
};
