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

const axisRangeWithPad = (points: SampledPoint[], axis: AxisDir, padRatio = 0.02) => {
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

const suggestProjectionByCoordinateNatural = (points: SampledPoint[], coordinateId: CoordinateId): ProjectionParams => {
    const profile = getCoordinateViewProfile(coordinateId);
    const source = points.filter((p) => p.opacity >= 0.04);
    const pts = source.length > 0 ? source : points;

    const x = axisRangeWithPad(pts, profile.topView.screenRight);
    const planeB = axisRangeWithPad(pts, profile.topView.screenUp);
    const slice = axisRangeWithPad(pts, profile.frontView.screenUp);

    return {
        xRangeMin: x.min,
        xRangeMax: x.max,
        heightMin: planeB.min,
        heightMax: planeB.max,
        sliceMin: slice.min,
        sliceMax: slice.max
    };
};

export { suggestProjectionByCoordinateNatural };
