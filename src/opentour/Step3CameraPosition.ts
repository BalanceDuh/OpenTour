type AxisDirection = 'xp' | 'xn' | 'yp' | 'yn' | 'zp' | 'zn';

type OverlayView = 'map' | 'front';

type ViewRange2D = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type Step3ViewRange = {
    map: ViewRange2D;
    front: ViewRange2D;
};

type ViewAxisMapping = {
    xComponent: 'x' | 'y' | 'z';
    yComponent: 'x' | 'y' | 'z';
    xSign: 1 | -1;
    ySign: 1 | -1;
    invertVertical: boolean;
};

type OverlayViewMapping = {
    map: ViewAxisMapping;
    front: ViewAxisMapping;
};

type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type Basis3 = {
    right: [number, number, number];
    up: [number, number, number];
    front: [number, number, number];
};

type OverlayResult = {
    valid: boolean;
    pointVisible: boolean;
    point: { u: number; v: number };
    pointRaw: { u: number; v: number };
    eyeCombo: { x: number; y: number; z: number };
    tipCombo: { x: number; y: number; z: number };
    directionVisible: boolean;
    directionFrom: { u: number; v: number };
    directionTo: { u: number; v: number };
    directionToRaw: { u: number; v: number };
    mappingUsed: ViewAxisMapping;
    basisUsed: Basis3;
    axisXRaw: number;
    axisYRaw: number;
    axisXNorm: number;
    axisYNorm: number;
    axisXInRange: boolean;
    axisYInRange: boolean;
};

type OverlayScreenPosition = {
    pointX: number;
    pointY: number;
    tipX: number;
    tipY: number;
    pointVisible: boolean;
};

const PRESETS: Record<string, { up: AxisDirection; front: AxisDirection }> = {
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

const DEFAULT_AXIS_PRESET_ID = 'r-zup-yfwd';

const BASE_VIEW_MAPPING: OverlayViewMapping = {
    map: { xComponent: 'x', yComponent: 'z', xSign: 1, ySign: 1, invertVertical: true },
    front: { xComponent: 'x', yComponent: 'y', xSign: 1, ySign: 1, invertVertical: true }
};

const resolveViewMapping = (axisPresetId?: string): OverlayViewMapping => {
    const preset = (axisPresetId || DEFAULT_AXIS_PRESET_ID).toLowerCase();
    if (preset === 'r-zup-yfwd') {
        return {
            map: { ...BASE_VIEW_MAPPING.map, invertVertical: false },
            front: { ...BASE_VIEW_MAPPING.front }
        };
    }
    return {
        map: { ...BASE_VIEW_MAPPING.map },
        front: { ...BASE_VIEW_MAPPING.front }
    };
};

const n = (x: number, d = 0) => Number.isFinite(x) ? x : d;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const normalize3 = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-6) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
};

const dot3 = (a: [number, number, number], b: [number, number, number]) => {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

const cross3 = (a: [number, number, number], b: [number, number, number]): [number, number, number] => {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
};

const axisToVec = (axis: AxisDirection): [number, number, number] => {
    if (axis === 'xp') return [1, 0, 0];
    if (axis === 'xn') return [-1, 0, 0];
    if (axis === 'yp') return [0, 1, 0];
    if (axis === 'yn') return [0, -1, 0];
    if (axis === 'zp') return [0, 0, 1];
    return [0, 0, -1];
};

const getSpan = (min: number, max: number) => {
    const span = max - min;
    if (Math.abs(span) < 1e-6) return span >= 0 ? 1e-6 : -1e-6;
    return span;
};

const basisFromPreset = (axisPresetId?: string): Basis3 => {
    const presetId = PRESETS[axisPresetId || ''] ? String(axisPresetId) : DEFAULT_AXIS_PRESET_ID;
    const preset = PRESETS[presetId];
    const up = axisToVec(preset.up);
    const front = axisToVec(preset.front);
    const right = normalize3(cross3(up, front));
    return { right, up, front };
};

const worldToCombo = (p: { x: number; y: number; z: number }, basis: Basis3) => {
    const v: [number, number, number] = [n(p.x), n(p.y), n(p.z)];
    return {
        x: dot3(v, basis.right),
        y: dot3(v, basis.up),
        z: dot3(v, basis.front)
    };
};

const axisValue = (p: { x: number; y: number; z: number }, c: 'x' | 'y' | 'z') => {
    if (c === 'x') return p.x;
    if (c === 'y') return p.y;
    return p.z;
};

const toUv = (x: number, y: number, range: ViewRange2D, invertVertical: boolean) => {
    const sx = getSpan(n(range.xMin, 0), n(range.xMax, 1));
    const sy = getSpan(n(range.yMin, 0), n(range.yMax, 1));
    const u = (x - n(range.xMin, 0)) / sx;
    const vNorm = (y - n(range.yMin, 0)) / sy;
    return {
        u,
        v: invertVertical ? (1 - vNorm) : vNorm
    };
};

const buildStep3CameraOverlay = (input: {
    axisPresetId?: string;
    viewRange: Step3ViewRange;
    cameraPose: CameraPose | null | undefined;
    view: OverlayView;
    directionLengthMeters?: number;
}): OverlayResult => {
    const fail: OverlayResult = {
        valid: false,
        pointVisible: false,
        point: { u: 0.5, v: 0.5 },
        pointRaw: { u: 0.5, v: 0.5 },
        eyeCombo: { x: 0, y: 0, z: 0 },
        tipCombo: { x: 0, y: 0, z: 0 },
        directionVisible: false,
        directionFrom: { u: 0.5, v: 0.5 },
        directionTo: { u: 0.5, v: 0.5 },
        directionToRaw: { u: 0.5, v: 0.5 },
        mappingUsed: BASE_VIEW_MAPPING.map,
        basisUsed: basisFromPreset(input.axisPresetId),
        axisXRaw: 0,
        axisYRaw: 0,
        axisXNorm: 0.5,
        axisYNorm: 0.5,
        axisXInRange: true,
        axisYInRange: true
    };

    if (!input.cameraPose) return fail;

    const mapping = resolveViewMapping(input.axisPresetId)[input.view];
    const basis = basisFromPreset(input.axisPresetId);

    const eye = {
        x: n(input.cameraPose.eye.x),
        y: n(input.cameraPose.eye.y),
        z: n(input.cameraPose.eye.z)
    };
    const fwd = normalize3([
        n(input.cameraPose.forward.x),
        n(input.cameraPose.forward.y),
        n(input.cameraPose.forward.z)
    ]);
    const len = Math.max(0.2, n(input.directionLengthMeters, 1.5));
    const tip = {
        x: eye.x + fwd[0] * len,
        y: eye.y + fwd[1] * len,
        z: eye.z + fwd[2] * len
    };

    const eyeCombo = worldToCombo(eye, basis);
    const tipCombo = worldToCombo(tip, basis);
    const range = input.viewRange[input.view];

    const eyeX = axisValue(eyeCombo, mapping.xComponent) * mapping.xSign;
    const eyeY = axisValue(eyeCombo, mapping.yComponent) * mapping.ySign;
    const tipX = axisValue(tipCombo, mapping.xComponent) * mapping.xSign;
    const tipY = axisValue(tipCombo, mapping.yComponent) * mapping.ySign;

    const pointRaw = toUv(eyeX, eyeY, range, mapping.invertVertical);
    const directionToRaw = toUv(tipX, tipY, range, mapping.invertVertical);
    const point = { u: clamp01(pointRaw.u), v: clamp01(pointRaw.v) };
    const directionTo = { u: clamp01(directionToRaw.u), v: clamp01(directionToRaw.v) };

    const sx = getSpan(n(range.xMin, 0), n(range.xMax, 1));
    const sy = getSpan(n(range.yMin, 0), n(range.yMax, 1));
    const axisXNorm = (eyeX - n(range.xMin, 0)) / sx;
    const axisYNorm = (eyeY - n(range.yMin, 0)) / sy;

    return {
        valid: true,
        pointVisible: pointRaw.u >= 0 && pointRaw.u <= 1 && pointRaw.v >= 0 && pointRaw.v <= 1,
        point,
        pointRaw,
        eyeCombo,
        tipCombo,
        directionVisible: Math.hypot(directionToRaw.u - pointRaw.u, directionToRaw.v - pointRaw.v) > 1e-4,
        directionFrom: point,
        directionTo,
        directionToRaw,
        mappingUsed: mapping,
        basisUsed: basis,
        axisXRaw: eyeX,
        axisYRaw: eyeY,
        axisXNorm,
        axisYNorm,
        axisXInRange: axisXNorm >= 0 && axisXNorm <= 1,
        axisYInRange: axisYNorm >= 0 && axisYNorm <= 1
    };
};

const calculateContainRect = (
    imageNaturalWidth: number,
    imageNaturalHeight: number,
    containerWidth: number,
    containerHeight: number,
    zoom = 1
) => {
    const imgW = Math.max(1, n(imageNaturalWidth, containerWidth));
    const imgH = Math.max(1, n(imageNaturalHeight, containerHeight));
    const cW = Math.max(1, n(containerWidth, 1));
    const cH = Math.max(1, n(containerHeight, 1));
    const scale = Math.min(cW / imgW, cH / imgH);
    const baseW = imgW * scale;
    const baseH = imgH * scale;
    const renderedW = baseW * Math.max(0.1, n(zoom, 1));
    const renderedH = baseH * Math.max(0.1, n(zoom, 1));
    const offsetX = (cW - renderedW) * 0.5;
    const offsetY = (cH - renderedH) * 0.5;
    return { x: offsetX, y: offsetY, w: renderedW, h: renderedH };
};

const calculateScreenPosition = (
    result: OverlayResult,
    imageNaturalWidth: number,
    imageNaturalHeight: number,
    containerWidth: number,
    containerHeight: number,
    zoom = 1
): OverlayScreenPosition | null => {
    if (!result.valid) return null;
    const rect = calculateContainRect(imageNaturalWidth, imageNaturalHeight, containerWidth, containerHeight, zoom);
    return {
        pointX: rect.x + result.point.u * rect.w,
        pointY: rect.y + result.point.v * rect.h,
        tipX: rect.x + result.directionToRaw.u * rect.w,
        tipY: rect.y + result.directionToRaw.v * rect.h,
        pointVisible: result.pointVisible
    };
};

export {
    DEFAULT_AXIS_PRESET_ID,
    buildStep3CameraOverlay,
    calculateScreenPosition,
    calculateContainRect
};

export type {
    OverlayResult as Step3CameraOverlayResult,
    OverlayView as Step3OverlayView,
    ViewAxisMapping as Step3ViewAxisMapping,
    OverlayViewMapping as Step3OverlayViewMapping,
    CameraPose as Step3CameraPose,
    Step3ViewRange
};
