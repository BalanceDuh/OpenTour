import { getCoordinateViewProfile, type AxisDir, type CoordinateId } from '../coordinateViews';
import type { ProjectionParams, SampledPoint } from './otml_types';

const axisValue = (point: SampledPoint, axis: AxisDir) => {
    if (axis === '+X') return point.x;
    if (axis === '-X') return -point.x;
    if (axis === '+Y') return point.y;
    if (axis === '-Y') return -point.y;
    if (axis === '+Z') return point.z;
    return -point.z;
};

const rangeFromPoints = (points: SampledPoint[], axis: AxisDir, padRatio = 0.03) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (let i = 0; i < points.length; i += 1) {
        const v = axisValue(points[i], axis);
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
        count += 1;
    }

    if (count < 8 || !Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: -5, max: 5 };
    }

    if (Math.abs(max - min) < 1e-6) {
        const pad = Math.max(0.25, Math.abs(max) * 0.2);
        return { min: min - pad, max: max + pad };
    }

    const span = max - min;
    const pad = Math.max(0.02, span * padRatio);
    return { min: min - pad, max: max + pad };
};

const selectRobustPoints = (points: SampledPoint[]) => {
    const hi = points.filter((p) => p.opacity >= 0.14);
    if (hi.length >= Math.max(1200, Math.floor(points.length * 0.12))) return hi;
    const mid = points.filter((p) => p.opacity >= 0.08);
    if (mid.length >= Math.max(800, Math.floor(points.length * 0.08))) return mid;
    const low = points.filter((p) => p.opacity >= 0.04);
    return low.length >= 100 ? low : points;
};

const suggestProjectionByCoordinateNaturalRobust = (points: SampledPoint[], coordinateId: CoordinateId): ProjectionParams => {
    const profile = getCoordinateViewProfile(coordinateId);
    const robustPoints = selectRobustPoints(points);

    const x = rangeFromPoints(robustPoints, profile.topView.screenRight);
    const planeB = rangeFromPoints(robustPoints, profile.topView.screenUp);
    const slice = rangeFromPoints(robustPoints, profile.frontView.screenUp);

    return {
        xRangeMin: x.min,
        xRangeMax: x.max,
        heightMin: planeB.min,
        heightMax: planeB.max,
        sliceMin: slice.min,
        sliceMax: slice.max
    };
};

export { suggestProjectionByCoordinateNaturalRobust };
