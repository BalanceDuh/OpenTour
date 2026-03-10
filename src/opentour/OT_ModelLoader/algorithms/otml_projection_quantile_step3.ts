import { getCoordinateViewProfile, type AxisDir, type CoordinateId } from '../coordinateViews';
import type { ProjectionParams, SampledPoint } from './otml_types';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const axisValue = (point: SampledPoint, axis: AxisDir) => {
    if (axis === '+X') return point.x;
    if (axis === '-X') return -point.x;
    if (axis === '+Y') return point.y;
    if (axis === '-Y') return -point.y;
    if (axis === '+Z') return point.z;
    return -point.z;
};

const quantile = (values: number[], q: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
    return sorted[idx];
};

const buildAxisRangeStep3Style = (points: SampledPoint[], axis: AxisDir) => {
    const values: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
        const v = axisValue(points[i], axis);
        if (Number.isFinite(v)) values.push(v);
    }

    if (values.length < 8) {
        return { min: -5, max: 5 };
    }

    const low = quantile(values, 0.02);
    const high = quantile(values, 0.98);
    const pad = Math.max(0.05, (high - low) * 0.08);
    const min = low - pad;
    const max = high + pad;

    if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-6) {
        return { min: -5, max: 5 };
    }

    return { min, max };
};

const suggestProjectionByCoordinateQuantileStep3 = (
    points: SampledPoint[],
    coordinateId: CoordinateId
): ProjectionParams => {
    const profile = getCoordinateViewProfile(coordinateId);

    const x = buildAxisRangeStep3Style(points, profile.topView.screenRight);
    const planeB = buildAxisRangeStep3Style(points, profile.topView.screenUp);
    const slice = buildAxisRangeStep3Style(points, profile.frontView.screenUp);

    return {
        xRangeMin: x.min,
        xRangeMax: x.max,
        heightMin: planeB.min,
        heightMax: planeB.max,
        sliceMin: slice.min,
        sliceMax: slice.max
    };
};

export { suggestProjectionByCoordinateQuantileStep3 };
