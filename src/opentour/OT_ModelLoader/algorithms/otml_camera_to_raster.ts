import type { AxisDir } from '../coordinateViews';
import type { CameraOverlayResult, CameraPose, OverlayPoint, ProjectionViewResult } from './otml_types';

const axisValue = (point: { x: number; y: number; z: number }, axis: AxisDir) => {
    if (axis === '+X') return point.x;
    if (axis === '-X') return -point.x;
    if (axis === '+Y') return point.y;
    if (axis === '-Y') return -point.y;
    if (axis === '+Z') return point.z;
    return -point.z;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const worldToOverlay = (
    view: ProjectionViewResult,
    point: { x: number; y: number; z: number },
    canvasWidth: number,
    canvasHeight: number
): OverlayPoint => {
    const x = axisValue(point, view.axisX);
    const y = axisValue(point, view.axisY);
    const xn = (x - view.xRange.min) / Math.max(1e-6, view.xRange.max - view.xRange.min);
    const yn = (y - view.yRange.min) / Math.max(1e-6, view.yRange.max - view.yRange.min);
    const visible = xn >= 0 && xn <= 1 && yn >= 0 && yn <= 1;

    return {
        x: clamp(xn, 0, 1) * canvasWidth,
        y: (1 - clamp(yn, 0, 1)) * canvasHeight,
        visible
    };
};

const projectCameraToRaster = (
    view: ProjectionViewResult,
    pose: CameraPose,
    canvasWidth: number,
    canvasHeight: number,
    directionLength = 1.5
): CameraOverlayResult => {
    const tip = {
        x: pose.eye.x + pose.forward.x * directionLength,
        y: pose.eye.y + pose.forward.y * directionLength,
        z: pose.eye.z + pose.forward.z * directionLength
    };

    const pointOverlay = worldToOverlay(view, pose.eye, canvasWidth, canvasHeight);
    const tipOverlay = worldToOverlay(view, tip, canvasWidth, canvasHeight);

    return {
        point: pointOverlay,
        tip: tipOverlay,
        directionVisible: pointOverlay.visible && tipOverlay.visible
    };
};

export {
    projectCameraToRaster
};
