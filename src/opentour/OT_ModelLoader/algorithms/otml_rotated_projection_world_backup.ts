import {
    computeProjectionByCoordinate
} from './otml_projection_by_axis';
import { suggestProjectionByCoordinateNaturalRobust } from './otml_projection_natural_robust';
import type {
    ProjectionByAxisResult,
    ProjectionParams,
    SampledPoint
} from './otml_types';
import type { CoordinateId } from '../coordinateViews';

type CanvasSize = {
    width: number;
    height: number;
};

type BuildRotatedProjectionInput = {
    points: SampledPoint[];
    coordinateId: CoordinateId;
    projection: ProjectionParams;
    topSize: CanvasSize;
    frontSize: CanvasSize;
    mode: 'auto' | 'manual';
};

type BuildRotatedProjectionOutput = {
    result: ProjectionByAxisResult;
    projection: ProjectionParams;
};

const buildRotatedProjectionWorldBackup = (input: BuildRotatedProjectionInput): BuildRotatedProjectionOutput => {
    // Backup snapshot of the known-good rotated projection flow.
    // Keep this function unchanged unless intentionally updating rollback baseline.
    let projection = input.projection;

    if (input.mode === 'auto') {
        projection = suggestProjectionByCoordinateNaturalRobust(input.points, input.coordinateId);
    }

    const topRes = computeProjectionByCoordinate(
        input.points,
        input.coordinateId,
        input.topSize.width,
        input.topSize.height,
        projection
    );
    const frontRes = computeProjectionByCoordinate(
        input.points,
        input.coordinateId,
        input.frontSize.width,
        input.frontSize.height,
        projection
    );

    const result: ProjectionByAxisResult = {
        coordinateId: topRes.coordinateId,
        top: topRes.top,
        front: frontRes.front,
        usedProjection: topRes.usedProjection
    };

    if (input.mode === 'auto') {
        projection = {
            xRangeMin: result.top.xRange.min,
            xRangeMax: result.top.xRange.max,
            heightMin: result.top.yRange.min,
            heightMax: result.top.yRange.max,
            sliceMin: result.front.yRange.min,
            sliceMax: result.front.yRange.max
        };
    }

    return {
        result,
        projection
    };
};

export {
    buildRotatedProjectionWorldBackup,
    type BuildRotatedProjectionInput,
    type BuildRotatedProjectionOutput
};
