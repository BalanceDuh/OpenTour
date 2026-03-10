type AxisComboId = 'combo-1' | 'combo-2' | 'combo-3' | 'combo-4';
type AxisDirection = 'xp' | 'xn' | 'yp' | 'yn' | 'zp' | 'zn';
type OverlayView = 'map' | 'front';

type ProjectionParams = {
    sliceMin: number;
    sliceMax: number;
    xRangeMin: number;
    xRangeMax: number;
    heightMin: number;
    heightMax: number;
};

type PlaneAdjust = {
    comboId: AxisComboId;
    axisPresetId?: string;
    transformBasis?: {
        right: AxisDirection;
        up: AxisDirection;
        front: AxisDirection;
    };
    viewMapping?: OverlayViewMapping;
    projection: ProjectionParams;
    liveProjection?: ProjectionParams;
};

type AxisComponent = 'x' | 'y' | 'z';

type ViewAxisMapping = {
    xComponent: AxisComponent;
    yComponent: AxisComponent;
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
    displayProjection: ProjectionParams;
    projectionSource: 'saved' | 'live';
    mappingUsed: ViewAxisMapping;
    axisXRaw: number;
    axisYRaw: number;
    axisXNorm: number;
    axisYNorm: number;
    axisXInRange: boolean;
    axisYInRange: boolean;
};

type Basis3 = {
    right: [number, number, number];
    up: [number, number, number];
    front: [number, number, number];
};

type AxisPreset = {
    up: AxisDirection;
    front: AxisDirection;
};

const PRESETS: Record<string, AxisPreset> = {
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

const DEFAULT_PRESET = 'r-zup-yfwd';

const FALLBACK_RESULT = (): OverlayResult => ({
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
    projectionSource: 'saved',
    mappingUsed: {
        xComponent: 'x',
        yComponent: 'z',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    },
    axisXRaw: 0,
    axisYRaw: 0,
    axisXNorm: 0.5,
    axisYNorm: 0.5,
    axisXInRange: true,
    axisYInRange: true,
    displayProjection: {
        sliceMin: 0,
        sliceMax: 1,
        xRangeMin: 0,
        xRangeMax: 1,
        heightMin: 0,
        heightMax: 1
    }
});

const n = (x: number, d = 0) => Number.isFinite(x) ? x : d;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const DEFAULT_VIEW_MAPPING: OverlayViewMapping = {
    map: {
        xComponent: 'x',
        yComponent: 'z',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    },
    front: {
        xComponent: 'x',
        yComponent: 'y',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    }
};

const R_ZUP_YFWD_VIEW_MAPPING: OverlayViewMapping = {
    map: {
        xComponent: 'x',
        yComponent: 'z',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    },
    front: {
        xComponent: 'x',
        yComponent: 'y',
        xSign: 1,
        ySign: 1,
        invertVertical: true
    }
};

const normalize3 = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-6) return [0, 0, 1];
    return [v[0] / len, v[1] / len, v[2] / len];
};

const dot3 = (a: [number, number, number], b: [number, number, number]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

const comboBasis = (comboId: AxisComboId, axisPresetId?: string): Basis3 => {
    if (comboId === 'combo-1') {
        return {
            right: axisToVec('xp'),
            up: axisToVec('yn'),
            front: axisToVec('zp')
        };
    }
    if (comboId === 'combo-2') {
        return {
            right: axisToVec('xp'),
            up: axisToVec('yp'),
            front: axisToVec('zn')
        };
    }
    if (comboId === 'combo-3') {
        return {
            right: axisToVec('xp'),
            up: axisToVec('zp'),
            front: axisToVec('yp')
        };
    }

    const presetId = PRESETS[axisPresetId || ''] ? (axisPresetId as string) : DEFAULT_PRESET;
    const preset = PRESETS[presetId];
    const up = axisToVec(preset.up);
    const front = axisToVec(preset.front);
    const right = normalize3(cross3(up, front));
    return { right, up, front };
};

const comboBasisFromTransform = (basis: { right: AxisDirection; up: AxisDirection; front: AxisDirection }): Basis3 => {
    return {
        right: axisToVec(basis.right),
        up: axisToVec(basis.up),
        front: axisToVec(basis.front)
    };
};

const worldToCombo = (p: { x: number; y: number; z: number }, basis: Basis3) => {
    const v: [number, number, number] = [n(p.x), n(p.y), n(p.z)];
    return {
        x: dot3(v, basis.right),
        y: dot3(v, basis.up),
        z: dot3(v, basis.front)
    };
};

const toUv = (
    x: number,
    y: number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    invertVertical = true
) => {
    const sx = Math.max(1e-6, xMax - xMin);
    const sy = Math.max(1e-6, yMax - yMin);
    const u = (x - xMin) / sx;
    const vNorm = (y - yMin) / sy;
    const v = invertVertical ? (1 - vNorm) : vNorm;
    return { u, v };
};

const getAxisValue = (
    p: { x: number; y: number; z: number },
    component: AxisComponent
) => {
    if (component === 'x') return p.x;
    if (component === 'y') return p.y;
    return p.z;
};

const resolveViewMapping = (
    planeAdjust: PlaneAdjust,
    view: OverlayView
): ViewAxisMapping => {
    const mapping = planeAdjust.viewMapping;
    const fallbackSet = (
        planeAdjust.comboId === 'combo-4' &&
        (planeAdjust.axisPresetId || DEFAULT_PRESET) === DEFAULT_PRESET
    ) ? R_ZUP_YFWD_VIEW_MAPPING : DEFAULT_VIEW_MAPPING;
    const fallback = fallbackSet[view];
    if (!mapping) return fallback;
    const candidate = mapping[view];
    if (!candidate) return fallback;
    return {
        xComponent: candidate.xComponent || fallback.xComponent,
        yComponent: candidate.yComponent || fallback.yComponent,
        xSign: candidate.xSign === -1 ? -1 : 1,
        ySign: candidate.ySign === -1 ? -1 : 1,
        invertVertical: typeof candidate.invertVertical === 'boolean' ? candidate.invertVertical : fallback.invertVertical
    };
};

const buildStep3LiveOverlay = (input: {
    planeAdjust: PlaneAdjust | null | undefined;
    cameraPose: CameraPose | null | undefined;
    view: OverlayView;
    directionLengthMeters?: number;
}): OverlayResult => {
    const fail = FALLBACK_RESULT();
    const planeAdjust = input.planeAdjust;
    const pose = input.cameraPose;
    if (!planeAdjust || !pose) return fail;

    const basis = planeAdjust.transformBasis
        ? comboBasisFromTransform(planeAdjust.transformBasis)
        : comboBasis(planeAdjust.comboId, planeAdjust.axisPresetId);
    const eye = {
        x: n(pose.eye.x),
        y: n(pose.eye.y),
        z: n(pose.eye.z)
    };
    const fwd = normalize3([n(pose.forward.x), n(pose.forward.y), n(pose.forward.z)]);
    const len = Math.max(0.2, n(input.directionLengthMeters, 1.5));
    const tip = {
        x: eye.x + fwd[0] * len,
        y: eye.y + fwd[1] * len,
        z: eye.z + fwd[2] * len
    };

    const eyeCombo = worldToCombo(eye, basis);
    const tipCombo = worldToCombo(tip, basis);

    const base = planeAdjust.projection;
    const displayProjection: ProjectionParams = {
        sliceMin: n(base.sliceMin, 0),
        sliceMax: n(base.sliceMax, 1),
        xRangeMin: n(base.xRangeMin, 0),
        xRangeMax: n(base.xRangeMax, 1),
        heightMin: n(base.heightMin, 0),
        heightMax: n(base.heightMax, 1)
    };

    const mapping = resolveViewMapping(planeAdjust, input.view);
    const xMin = displayProjection.xRangeMin;
    const xMax = displayProjection.xRangeMax;
    const yMin = input.view === 'map' ? displayProjection.heightMin : displayProjection.sliceMin;
    const yMax = input.view === 'map' ? displayProjection.heightMax : displayProjection.sliceMax;

    const eyeX = getAxisValue(eyeCombo, mapping.xComponent) * mapping.xSign;
    const eyeY = getAxisValue(eyeCombo, mapping.yComponent) * mapping.ySign;
    const tipX = getAxisValue(tipCombo, mapping.xComponent) * mapping.xSign;
    const tipY = getAxisValue(tipCombo, mapping.yComponent) * mapping.ySign;

    const pointRaw = toUv(eyeX, eyeY, xMin, xMax, yMin, yMax, mapping.invertVertical);
    const directionToRaw = toUv(tipX, tipY, xMin, xMax, yMin, yMax, mapping.invertVertical);

    const point = { u: clamp01(pointRaw.u), v: clamp01(pointRaw.v) };
    const directionTo = { u: clamp01(directionToRaw.u), v: clamp01(directionToRaw.v) };

    const directionVisible = Math.hypot(directionToRaw.u - pointRaw.u, directionToRaw.v - pointRaw.v) > 1e-4;
    const pointVisible = pointRaw.u >= 0 && pointRaw.u <= 1 && pointRaw.v >= 0 && pointRaw.v <= 1;
    const sx = Math.max(1e-6, xMax - xMin);
    const sy = Math.max(1e-6, yMax - yMin);
    const axisXNorm = (eyeX - xMin) / sx;
    const axisYNorm = (eyeY - yMin) / sy;

    return {
        valid: true,
        pointVisible,
        point,
        pointRaw,
        eyeCombo,
        tipCombo,
        directionVisible,
        directionFrom: point,
        directionTo,
        directionToRaw,
        displayProjection,
        projectionSource: 'saved',
        mappingUsed: mapping,
        axisXRaw: eyeX,
        axisYRaw: eyeY,
        axisXNorm,
        axisYNorm,
        axisXInRange: axisXNorm >= 0 && axisXNorm <= 1,
        axisYInRange: axisYNorm >= 0 && axisYNorm <= 1
    };
};

export {
    buildStep3LiveOverlay
};

export type {
    PlaneAdjust as Step3PlaneAdjust,
    ViewAxisMapping as Step3ViewAxisMapping,
    OverlayViewMapping as Step3OverlayViewMapping,
    CameraPose as Step3CameraPose,
    OverlayView as Step3OverlayView,
    OverlayResult as Step3OverlayResult
};
