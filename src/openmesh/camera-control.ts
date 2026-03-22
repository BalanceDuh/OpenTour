import type { CameraState, MviewCameraState } from './cinematic-lite-types';

export type MarmosetViewLike = {
    rotation: [number, number] | number[];
    pivot: [number, number, number] | number[] | { x: number; y: number; z: number; };
    radius: number;
    fov: number;
    updateView?: () => void;
    updateProjection?: () => void;
};

export type MarmosetViewerLike = {
    scene?: { view?: MarmosetViewLike | null; } | null;
    wake?: () => void;
    reDrawScene?: () => void;
};

export type ViewPresetLike = {
    view: string;
    label: string;
    yawDeltaDeg: number;
    pitchDeg: number;
    note: string;
};

export const CL_CAMERA_CONTROL_MODE = 'deg';

const finiteOr = (value: unknown, fallback: number) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

export const degToRad = (value: number) => value * Math.PI / 180;
export const radToDeg = (value: number) => value * 180 / Math.PI;

export const normalizeAngleRad = (value: number) => {
    let result = value % (Math.PI * 2);
    if (result > Math.PI) result -= Math.PI * 2;
    if (result < -Math.PI) result += Math.PI * 2;
    return result;
};

export const normalizeAngleDeg = (value: number) => {
    let result = value % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
};

export const clampPitchDeg = (value: number) => Math.max(-89, Math.min(89, value));
export const shortestAngleDeltaRad = (from: number, to: number) => normalizeAngleRad(to - from);

export const extractPivot = (view: MarmosetViewLike | null | undefined): [number, number, number] => {
    if (Array.isArray(view?.pivot)) return [finiteOr(view.pivot[0], 0), finiteOr(view.pivot[1], 0), finiteOr(view.pivot[2], 0)];
    return [finiteOr(view?.pivot?.x, 0), finiteOr(view?.pivot?.y, 0), finiteOr(view?.pivot?.z, 0)];
};

export const readMviewState = (view: MarmosetViewLike | null | undefined): MviewCameraState => ({
    pivot: extractPivot(view),
    rotation: [finiteOr(view?.rotation?.[0], 0), finiteOr(view?.rotation?.[1], 0)],
    radius: Math.max(0.001, finiteOr(view?.radius, 1)),
    fov: finiteOr(view?.fov, 40)
});

export const deriveCameraState = (mview: MviewCameraState): CameraState => {
    const radius = Math.max(0.001, finiteOr(mview.radius, 1));
    const pitch = finiteOr(mview.rotation?.[0], 0);
    const yaw = finiteOr(mview.rotation?.[1], 0);
    const pivot = mview.pivot || [0, 0, 0];
    const cosPitch = Math.cos(pitch);
    const cameraX = finiteOr(pivot[0], 0) + radius * Math.sin(yaw) * cosPitch;
    const cameraY = finiteOr(pivot[1], 0) - radius * Math.sin(pitch);
    const cameraZ = finiteOr(pivot[2], 0) + radius * Math.cos(yaw) * cosPitch;
    return {
        mview: {
            pivot: [finiteOr(pivot[0], 0), finiteOr(pivot[1], 0), finiteOr(pivot[2], 0)],
            rotation: [pitch, yaw],
            radius,
            fov: finiteOr(mview.fov, 40)
        },
        cameraX,
        cameraY,
        cameraZ,
        lookAtX: finiteOr(pivot[0], 0),
        lookAtY: finiteOr(pivot[1], 0),
        lookAtZ: finiteOr(pivot[2], 0),
        yawDeg: normalizeAngleDeg(radToDeg(yaw)),
        pitchDeg: clampPitchDeg(normalizeAngleDeg(radToDeg(pitch))),
        fovDeg: finiteOr(mview.fov, 40),
        radius
    };
};

export const deriveMviewCameraState = (input: Partial<CameraState>, fallback?: Partial<MviewCameraState>): MviewCameraState => {
    const basePivot = fallback?.pivot || [0, 0, 0];
    const baseRotation = fallback?.rotation || [0, 0];
    const pivotX = finiteOr(input.lookAtX, basePivot[0]);
    const pivotY = finiteOr(input.lookAtY, basePivot[1]);
    const pivotZ = finiteOr(input.lookAtZ, basePivot[2]);
    const hasCameraPosition = [input.cameraX, input.cameraY, input.cameraZ, input.lookAtX, input.lookAtY, input.lookAtZ].every((value) => Number.isFinite(Number(value)));
    const fallbackRadius = finiteOr(fallback?.radius, 1);
    const fallbackPitchDeg = radToDeg(finiteOr(baseRotation[0], 0));
    const fallbackYawDeg = radToDeg(finiteOr(baseRotation[1], 0));
    const seededRadius = Math.max(0.001, finiteOr(input.radius, fallbackRadius));
    const seededPitchDeg = clampPitchDeg(finiteOr(input.pitchDeg, fallbackPitchDeg));
    const seededYawDeg = normalizeAngleDeg(finiteOr(input.yawDeg, fallbackYawDeg));
    const seededCosPitch = Math.cos(degToRad(seededPitchDeg));
    const seededCameraX = pivotX + seededRadius * Math.sin(degToRad(seededYawDeg)) * seededCosPitch;
    const seededCameraY = pivotY - seededRadius * Math.sin(degToRad(seededPitchDeg));
    const seededCameraZ = pivotZ + seededRadius * Math.cos(degToRad(seededYawDeg)) * seededCosPitch;
    const dx = (hasCameraPosition ? finiteOr(input.cameraX, seededCameraX) : seededCameraX) - pivotX;
    const dy = (hasCameraPosition ? finiteOr(input.cameraY, seededCameraY) : seededCameraY) - pivotY;
    const dz = (hasCameraPosition ? finiteOr(input.cameraZ, seededCameraZ) : seededCameraZ) - pivotZ;
    const derivedRadius = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    const radius = Math.max(0.001, Number.isFinite(derivedRadius) && derivedRadius > 0 ? derivedRadius : seededRadius);
    const derivedYawDeg = normalizeAngleDeg(radToDeg(Math.atan2(dx, dz)));
    const derivedPitchDeg = clampPitchDeg(radToDeg(Math.atan2(-dy, Math.sqrt((dx * dx) + (dz * dz)) || 0.0001)));
    const pitchDeg = Number.isFinite(derivedPitchDeg) ? derivedPitchDeg : seededPitchDeg;
    const yawDeg = Number.isFinite(derivedYawDeg) ? derivedYawDeg : seededYawDeg;
    return {
        pivot: [pivotX, pivotY, pivotZ],
        rotation: [degToRad(pitchDeg), degToRad(yawDeg)],
        radius,
        fov: finiteOr(input.fovDeg, finiteOr(fallback?.fov, 40))
    };
};

export const normalizeCameraState = (input: Partial<CameraState>, fallback?: Partial<MviewCameraState>): CameraState => {
    const rawMview = input.mview;
    if (rawMview && Array.isArray(rawMview.pivot) && Array.isArray(rawMview.rotation)) {
        return deriveCameraState({
            pivot: [finiteOr(rawMview.pivot[0], 0), finiteOr(rawMview.pivot[1], 0), finiteOr(rawMview.pivot[2], 0)],
            rotation: [finiteOr(rawMview.rotation[0], 0), finiteOr(rawMview.rotation[1], 0)],
            radius: Math.max(0.001, finiteOr(rawMview.radius, finiteOr(fallback?.radius, 1))),
            fov: finiteOr(rawMview.fov, finiteOr(fallback?.fov, 40))
        });
    }
    return deriveCameraState(deriveMviewCameraState(input, fallback));
};

export const normalizeCameraStateForCl = (input: Partial<CameraState>, fallback?: Partial<MviewCameraState>) => normalizeCameraState(input, fallback);

export const readCameraState = (view: MarmosetViewLike | null | undefined) => deriveCameraState(readMviewState(view));

export const applyMviewState = (view: MarmosetViewLike | null | undefined, state: MviewCameraState, update = true) => {
    if (!view) return;
    view.rotation[0] = state.rotation[0];
    view.rotation[1] = state.rotation[1];
    view.radius = state.radius;
    view.fov = state.fov;
    if (Array.isArray(view.pivot)) {
        view.pivot[0] = state.pivot[0];
        view.pivot[1] = state.pivot[1];
        view.pivot[2] = state.pivot[2];
    } else if (view.pivot) {
        view.pivot.x = state.pivot[0];
        view.pivot.y = state.pivot[1];
        view.pivot.z = state.pivot[2];
    }
    if (update) {
        view.updateView?.();
        view.updateProjection?.();
    }
};

export const wakeViewer = (viewer: MarmosetViewerLike | null | undefined) => {
    viewer?.wake?.();
    viewer?.reDrawScene?.();
};

export const interpolateMviewState = (from: MviewCameraState, to: MviewCameraState, t: number): MviewCameraState => {
    const clamped = Math.max(0, Math.min(1, t));
    const yawDelta = shortestAngleDeltaRad(from.rotation[1], to.rotation[1]);
    return {
        pivot: [
            from.pivot[0] + ((to.pivot[0] - from.pivot[0]) * clamped),
            from.pivot[1] + ((to.pivot[1] - from.pivot[1]) * clamped),
            from.pivot[2] + ((to.pivot[2] - from.pivot[2]) * clamped)
        ],
        rotation: [
            from.rotation[0] + ((to.rotation[0] - from.rotation[0]) * clamped),
            normalizeAngleRad(from.rotation[1] + (yawDelta * clamped))
        ],
        radius: from.radius + ((to.radius - from.radius) * clamped),
        fov: from.fov + ((to.fov - from.fov) * clamped)
    };
};

export const shortestAngleDeltaDeg = (from: number, to: number) => normalizeAngleDeg(to - from);

export const interpolateMviewStateDegrees = (from: MviewCameraState, to: MviewCameraState, t: number): MviewCameraState => {
    const clamped = Math.max(0, Math.min(1, t));
    const yawDelta = shortestAngleDeltaDeg(from.rotation[1], to.rotation[1]);
    const pitchDelta = shortestAngleDeltaDeg(from.rotation[0], to.rotation[0]);
    return {
        pivot: [
            from.pivot[0] + ((to.pivot[0] - from.pivot[0]) * clamped),
            from.pivot[1] + ((to.pivot[1] - from.pivot[1]) * clamped),
            from.pivot[2] + ((to.pivot[2] - from.pivot[2]) * clamped)
        ],
        rotation: [
            from.rotation[0] + (pitchDelta * clamped),
            from.rotation[1] + (yawDelta * clamped)
        ],
        radius: from.radius + ((to.radius - from.radius) * clamped),
        fov: from.fov + ((to.fov - from.fov) * clamped)
    };
};

export const buildPresetCameraStateForCl = (baseState: MviewCameraState, preset: ViewPresetLike): CameraState => deriveCameraState({
    pivot: [...baseState.pivot],
    rotation: [preset.pitchDeg, normalizeAngleDeg(baseState.rotation[1] + preset.yawDeltaDeg)],
    radius: baseState.radius,
    fov: baseState.fov
});

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const animateViewerToState = async (viewer: MarmosetViewerLike, target: MviewCameraState, options?: {
    durationMs?: number;
    onStep?: (payload: { rawT: number; easedT: number; state: MviewCameraState; }) => void;
}) => {
    const view = viewer?.scene?.view;
    if (!view) throw new Error('Marmoset view unavailable');
    const start = readMviewState(view);
    const durationMs = Math.max(0, Number(options?.durationMs || 0));
    await new Promise<void>((resolve) => {
        const begin = performance.now();
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            applyMviewState(view, target, true);
            wakeViewer(viewer);
            options?.onStep?.({ rawT: 1, easedT: 1, state: target });
            resolve();
        };
        const tick = () => {
            if (finished) return;
            const now = performance.now();
            const rawT = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - begin) / durationMs));
            const easedT = easeInOutQuad(rawT);
            const next = interpolateMviewState(start, target, easedT);
            applyMviewState(view, next, true);
            wakeViewer(viewer);
            options?.onStep?.({ rawT, easedT, state: next });
            if (rawT >= 1) return finish();
            window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
        window.setTimeout(finish, durationMs + 160);
    });
};

export const animateViewerToStateDegrees = async (viewer: MarmosetViewerLike, target: MviewCameraState, options?: {
    durationMs?: number;
    onStep?: (payload: { rawT: number; easedT: number; state: MviewCameraState; }) => void;
}) => {
    const view = viewer?.scene?.view;
    if (!view) throw new Error('Marmoset view unavailable');
    const start = readMviewState(view);
    const durationMs = Math.max(0, Number(options?.durationMs || 0));
    await new Promise<void>((resolve) => {
        const begin = performance.now();
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            applyMviewState(view, target, true);
            wakeViewer(viewer);
            options?.onStep?.({ rawT: 1, easedT: 1, state: target });
            resolve();
        };
        const tick = () => {
            if (finished) return;
            const now = performance.now();
            const rawT = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - begin) / durationMs));
            const easedT = easeInOutQuad(rawT);
            const next = interpolateMviewStateDegrees(start, target, easedT);
            applyMviewState(view, next, true);
            wakeViewer(viewer);
            options?.onStep?.({ rawT, easedT, state: next });
            if (rawT >= 1) return finish();
            window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
        window.setTimeout(finish, durationMs + 160);
    });
};

export const animateViewerToStateForCl = async (viewer: MarmosetViewerLike, target: MviewCameraState, options?: {
    durationMs?: number;
    onStep?: (payload: { rawT: number; easedT: number; state: MviewCameraState; }) => void;
}) => animateViewerToStateDegrees(viewer, target, options);

export const sweepViewerForCl = async (viewer: MarmosetViewerLike, target: CameraState & { sweepYawDeg?: number; sweepPitchDeg?: number }, durationMs: number, hooks?: {
    onFrame?: () => void;
}) => {
    const view = viewer?.scene?.view;
    if (!view) throw new Error('Marmoset view unavailable');
    const resolvedTarget = normalizeCameraStateForCl(target, readMviewState(view));
    const start = performance.now();
    await new Promise<void>((resolve) => {
        const tick = () => {
            const now = performance.now();
            const rawT = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - start) / durationMs));
            const wave = Math.sin(rawT * Math.PI);
            applyMviewState(view, {
                pivot: [...resolvedTarget.mview.pivot],
                rotation: [
                    resolvedTarget.mview.rotation[0] + ((target.sweepPitchDeg || 0) * (wave - 0.5)),
                    resolvedTarget.mview.rotation[1] + ((target.sweepYawDeg || 0) * (wave - 0.5))
                ],
                radius: resolvedTarget.mview.radius,
                fov: resolvedTarget.mview.fov
            }, true);
            wakeViewer(viewer);
            hooks?.onFrame?.();
            if (rawT >= 1) return resolve();
            window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
    });
};

const round = (value: number, digits = 6) => Number(Number(value || 0).toFixed(digits));

export const formatCameraStateForDebug = (camera: CameraState) => ({
    mview: {
        pivot: camera.mview.pivot.map((value) => round(value)),
        rotation: camera.mview.rotation.map((value) => round(value)),
        radius: round(camera.mview.radius),
        fov: round(camera.mview.fov)
    },
    derived: {
        camera: [round(camera.cameraX), round(camera.cameraY), round(camera.cameraZ)],
        lookAt: [round(camera.lookAtX), round(camera.lookAtY), round(camera.lookAtZ)],
        yawDeg: round(camera.yawDeg),
        pitchDeg: round(camera.pitchDeg),
        radius: round(camera.radius),
        fovDeg: round(camera.fovDeg)
    }
});

export const diffMviewStates = (current: MviewCameraState, target: MviewCameraState) => ({
    pivot: current.pivot.map((value, index) => round(value - target.pivot[index])),
    rotation: current.rotation.map((value, index) => round(normalizeAngleRad(value - target.rotation[index]))),
    radius: round(current.radius - target.radius),
    fov: round(current.fov - target.fov)
});
