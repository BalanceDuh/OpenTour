import {
    DEFAULT_RIGHT_HANDED_PRESET_ID,
    getRightHandedPreset
} from './axis-presets';

type CameraPoint = { x: number; y: number; z: number };

type CameraStart = {
    eye: CameraPoint;
    target: CameraPoint;
    fov: number;
    reason?: string;
};

type AxisComboId = 'combo-1' | 'combo-2' | 'combo-3' | 'combo-4';

type ProjectionParams = {
    sliceMin: number;
    sliceMax: number;
    xRangeMin: number;
    xRangeMax: number;
    heightMin: number;
    heightMax: number;
};

type SampledPoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
};

type RoiBounds = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
};

type BestViewCandidate = {
    id: string;
    label: string;
    score: number;
    clarity: number;
    yawDeg: number;
    pitchDeg: number;
    cameraStart: CameraStart;
};

type AxisDirection = 'xp' | 'xn' | 'yp' | 'yn' | 'zp' | 'zn';

type ComboAxes = {
    right: AxisDirection;
    up: AxisDirection;
    front: AxisDirection;
};

type ComboAxisLabels = {
    mapLabel: string;
    frontLabel: string;
    transformRule: string;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const vectorFromAxisDirection = (axis: AxisDirection) => {
    if (axis === 'xp') return { x: 1, y: 0, z: 0 };
    if (axis === 'xn') return { x: -1, y: 0, z: 0 };
    if (axis === 'yp') return { x: 0, y: 1, z: 0 };
    if (axis === 'yn') return { x: 0, y: -1, z: 0 };
    if (axis === 'zp') return { x: 0, y: 0, z: 1 };
    return { x: 0, y: 0, z: -1 };
};

const axisDirectionFromVector = (v: CameraPoint): AxisDirection => {
    if (v.x > 0.5) return 'xp';
    if (v.x < -0.5) return 'xn';
    if (v.y > 0.5) return 'yp';
    if (v.y < -0.5) return 'yn';
    if (v.z > 0.5) return 'zp';
    return 'zn';
};

const crossAxisDirection = (a: AxisDirection, b: AxisDirection): AxisDirection => {
    const av = vectorFromAxisDirection(a);
    const bv = vectorFromAxisDirection(b);
    return axisDirectionFromVector({
        x: av.y * bv.z - av.z * bv.y,
        y: av.z * bv.x - av.x * bv.z,
        z: av.x * bv.y - av.y * bv.x
    });
};

const axisExpr = (axis: AxisDirection) => {
    if (axis === 'xp') return 'X';
    if (axis === 'xn') return '-X';
    if (axis === 'yp') return 'Y';
    if (axis === 'yn') return '-Y';
    if (axis === 'zp') return 'Z';
    return '-Z';
};

const axisComponent = (axis: AxisDirection, p: CameraPoint) => {
    if (axis === 'xp') return p.x;
    if (axis === 'xn') return -p.x;
    if (axis === 'yp') return p.y;
    if (axis === 'yn') return -p.y;
    if (axis === 'zp') return p.z;
    return -p.z;
};

const addAxisScaled = (acc: CameraPoint, axis: AxisDirection, value: number) => {
    if (axis === 'xp') acc.x += value;
    else if (axis === 'xn') acc.x -= value;
    else if (axis === 'yp') acc.y += value;
    else if (axis === 'yn') acc.y -= value;
    else if (axis === 'zp') acc.z += value;
    else acc.z -= value;
};

const getComboAxes = (comboId: AxisComboId, axisPresetId?: string): ComboAxes => {
    if (comboId === 'combo-1') return { right: 'xp', up: 'yn', front: 'zp' };
    if (comboId === 'combo-2') return { right: 'xp', up: 'yp', front: 'zn' };
    if (comboId === 'combo-3') return { right: 'xp', up: 'zp', front: 'yp' };

    const preset = getRightHandedPreset(axisPresetId || DEFAULT_RIGHT_HANDED_PRESET_ID)
        ?? getRightHandedPreset(DEFAULT_RIGHT_HANDED_PRESET_ID);
    const up = (preset?.up ?? 'yp') as AxisDirection;
    const front = (preset?.front ?? 'zn') as AxisDirection;
    const right = crossAxisDirection(up, front);
    return { right, up, front };
};

const getComboAxisLabels = (comboId: AxisComboId, axisPresetId?: string): ComboAxisLabels => {
    const axes = getComboAxes(comboId, axisPresetId);
    return {
        mapLabel: `MAP [${axisExpr(axes.right)}, ${axisExpr(axes.front)}]`,
        frontLabel: `FRONT [${axisExpr(axes.right)}, ${axisExpr(axes.up)}]`,
        transformRule: `px=${axisExpr(axes.right)}, py=${axisExpr(axes.up)}, pz=${axisExpr(axes.front)}`
    };
};

const normalizeVec = (v: CameraPoint): CameraPoint => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 1e-6) return { x: 1, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const yawBaseForCombo = (comboId: AxisComboId) => {
    if (comboId === 'combo-1') return 180;
    if (comboId === 'combo-3') return 90;
    if (comboId === 'combo-4') return -90;
    return 0;
};

const buildOutwardDirection = (yawDeg: number, pitchDeg: number): CameraPoint => {
    const yaw = yawDeg * (Math.PI / 180);
    const pitch = pitchDeg * (Math.PI / 180);
    const cp = Math.cos(pitch);
    return normalizeVec({
        x: Math.cos(yaw) * cp,
        y: Math.sin(pitch),
        z: Math.sin(yaw) * cp
    });
};

const scoreOutwardClarity = (
    comboId: AxisComboId,
    axisPresetId: string | undefined,
    roi: RoiBounds,
    centerCombo: CameraPoint,
    dirCombo: CameraPoint,
    fovDeg: number,
    radius: number,
    sampledPoints: SampledPoint[]
) => {
    const dx = roi.maxX - roi.minX;
    const dy = roi.maxY - roi.minY;
    const dz = roi.maxZ - roi.minZ;
    const marginX = Math.max(0.12, dx * 0.08);
    const marginY = Math.max(0.12, dy * 0.08);
    const marginZ = Math.max(0.12, dz * 0.08);

    const minX = roi.minX - marginX;
    const maxX = roi.maxX + marginX;
    const minY = roi.minY - marginY;
    const maxY = roi.maxY + marginY;
    const minZ = roi.minZ - marginZ;
    const maxZ = roi.maxZ + marginZ;

    const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
    const nearThreshold = Math.max(0.25, radius * 0.18);
    const farRef = Math.max(1, radius * 2.6);

    let inside = 0;
    let visible = 0;
    let nearPenalty = 0;
    let depthWeighted = 0;

    for (const sp of sampledPoints) {
        const c = worldToComboPoint(comboId, { x: sp.x, y: sp.y, z: sp.z }, axisPresetId);
        if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY || c.z < minZ || c.z > maxZ) continue;
        inside++;

        const rx = c.x - centerCombo.x;
        const ry = c.y - centerCombo.y;
        const rz = c.z - centerCombo.z;

        const depth = rx * dirCombo.x + ry * dirCombo.y + rz * dirCombo.z;
        if (depth <= 0.02) continue;

        const dist2 = rx * rx + ry * ry + rz * rz;
        const lateral2 = Math.max(0, dist2 - depth * depth);
        const maxLat = depth * tanHalf;
        if (lateral2 > maxLat * maxLat) continue;

        visible++;
        const depthNorm = clamp(depth / farRef, 0, 1);
        depthWeighted += 1 - depthNorm;
        if (depth < nearThreshold) nearPenalty += 1 - depth / nearThreshold;
    }

    if (inside <= 0 || visible <= 0) return 0;
    const coverage = visible / inside;
    const avgDetail = depthWeighted / visible;
    const nearOcc = nearPenalty / visible;
    return coverage * 0.62 + avgDetail * 0.5 - nearOcc * 0.38;
};

const computeOutwardBestView = (
    roi: RoiBounds,
    options: {
        comboId: AxisComboId;
        axisPresetId?: string;
        fovDeg: number;
        pitchDeg: number;
        yawDeg: number;
        sampledPoints: SampledPoint[];
        floorY: number;
        eyeHeight: number;
    }
) => {
    const eyeY = clamp(options.floorY + options.eyeHeight, roi.minY, roi.maxY);
    const centerCombo = {
        x: (roi.minX + roi.maxX) * 0.5,
        y: eyeY,
        z: (roi.minZ + roi.maxZ) * 0.5
    };
    const dx = roi.maxX - roi.minX;
    const dy = roi.maxY - roi.minY;
    const dz = roi.maxZ - roi.minZ;
    const radius = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
    const outwardCombo = buildOutwardDirection(options.yawDeg, options.pitchDeg);
    const lookDistance = Math.max(1, radius * 0.92);

    const eyeCombo = centerCombo;
    const targetCombo = {
        x: eyeCombo.x + outwardCombo.x * lookDistance,
        y: eyeCombo.y + outwardCombo.y * lookDistance,
        z: eyeCombo.z + outwardCombo.z * lookDistance
    };

    const eye = comboToWorldPoint(options.comboId, eyeCombo, options.axisPresetId);
    const target = comboToWorldPoint(options.comboId, targetCombo, options.axisPresetId);
    const clarity = scoreOutwardClarity(
        options.comboId,
        options.axisPresetId,
        roi,
        centerCombo,
        outwardCombo,
        options.fovDeg,
        radius,
        options.sampledPoints
    );

    return {
        eye,
        target,
        clarity
    };
};

const worldToComboPoint = (comboId: AxisComboId, p: CameraPoint, axisPresetId?: string): CameraPoint => {
    const axes = getComboAxes(comboId, axisPresetId);
    return {
        x: axisComponent(axes.right, p),
        y: axisComponent(axes.up, p),
        z: axisComponent(axes.front, p)
    };
};

const comboToWorldPoint = (comboId: AxisComboId, p: CameraPoint, axisPresetId?: string): CameraPoint => {
    const axes = getComboAxes(comboId, axisPresetId);
    const world = { x: 0, y: 0, z: 0 };
    addAxisScaled(world, axes.right, p.x);
    addAxisScaled(world, axes.up, p.y);
    addAxisScaled(world, axes.front, p.z);
    return world;
};

const projectWorldPointToPreview = (
    point: CameraPoint,
    comboId: AxisComboId,
    projection: ProjectionParams,
    view: 'map' | 'front',
    axisPresetId?: string
) => {
    const p = worldToComboPoint(comboId, point, axisPresetId);
    const u = (p.x - projection.xRangeMin) / Math.max(1e-6, projection.xRangeMax - projection.xRangeMin);
    const v = view === 'map'
        ? 1 - ((p.z - projection.heightMin) / Math.max(1e-6, projection.heightMax - projection.heightMin))
        : 1 - ((p.y - projection.sliceMin) / Math.max(1e-6, projection.sliceMax - projection.sliceMin));
    return {
        u: clamp(u, 0, 1),
        v: clamp(v, 0, 1)
    };
};

const projectWorldDirectionToPreview = (
    eye: CameraPoint,
    target: CameraPoint,
    comboId: AxisComboId,
    view: 'map' | 'front',
    axisPresetId?: string
) => {
    const eyeCombo = worldToComboPoint(comboId, eye, axisPresetId);
    const targetCombo = worldToComboPoint(comboId, target, axisPresetId);
    return view === 'map'
        ? { x: targetCombo.x - eyeCombo.x, y: -(targetCombo.z - eyeCombo.z) }
        : { x: targetCombo.x - eyeCombo.x, y: -(targetCombo.y - eyeCombo.y) };
};

const generateBestViewCandidates = (options: {
    comboId: AxisComboId;
    axisPresetId?: string;
    roi: RoiBounds;
    fovDeg: number;
    sampledPoints: SampledPoint[];
    floorY?: number;
    eyeHeight?: number;
}): BestViewCandidate[] => {
    const floorY = Number.isFinite(options.floorY) ? (options.floorY as number) : options.roi.minY;
    const eyeHeight = Number.isFinite(options.eyeHeight) ? (options.eyeHeight as number) : 2.2;
    const yawBase = yawBaseForCombo(options.comboId);
    const viewProfiles = [
        { id: 'r4-iso', label: 'Isometric View', pitchDeg: 22, yawOffsets: [-55, -35, -20, 0, 20, 35, 55] },
        { id: 'r4-level', label: 'Level View', pitchDeg: 8, yawOffsets: [-70, -45, -25, 0, 25, 45, 70] },
        { id: 'r4-top', label: 'Top-down View', pitchDeg: 72, yawOffsets: [-55, -30, 0, 30, 55] }
    ] as const;

    const bestByProfile = viewProfiles.map((profile) => {
        let best: {
            yawDeg: number;
            clarity: number;
            eye: CameraPoint;
            target: CameraPoint;
        } | null = null;

        profile.yawOffsets.forEach((offset) => {
            const yawDeg = yawBase + offset;
            const cam = computeOutwardBestView(options.roi, {
                comboId: options.comboId,
                axisPresetId: options.axisPresetId,
                fovDeg: options.fovDeg,
                pitchDeg: profile.pitchDeg,
                yawDeg,
                sampledPoints: options.sampledPoints,
                floorY,
                eyeHeight
            });
            if (!best || cam.clarity > best.clarity) {
                best = { yawDeg, clarity: cam.clarity, eye: cam.eye, target: cam.target };
            }
        });

        if (!best) {
            const fallbackCam = computeOutwardBestView(options.roi, {
                comboId: options.comboId,
                axisPresetId: options.axisPresetId,
                fovDeg: options.fovDeg,
                pitchDeg: profile.pitchDeg,
                yawDeg: yawBase,
                sampledPoints: options.sampledPoints,
                floorY,
                eyeHeight
            });
            best = { yawDeg: yawBase, clarity: fallbackCam.clarity, eye: fallbackCam.eye, target: fallbackCam.target };
        }

        return {
            id: profile.id,
            label: profile.label,
            pitchDeg: profile.pitchDeg,
            yawDeg: best.yawDeg,
            clarity: best.clarity,
            eye: best.eye,
            target: best.target
        };
    });

    const sorted = [...bestByProfile].sort((a, b) => b.clarity - a.clarity);
    const maxClarity = sorted[0]?.clarity ?? 1;
    const minClarity = sorted[sorted.length - 1]?.clarity ?? 0;

    return sorted.map((v, idx) => {
        const t = maxClarity - minClarity < 1e-6
            ? (sorted.length - idx) / Math.max(1, sorted.length)
            : (v.clarity - minClarity) / (maxClarity - minClarity);
        const score = clamp(Math.round(82 + t * 16), 1, 99);
        return {
            id: v.id,
            label: v.label,
            score,
            clarity: v.clarity,
            yawDeg: v.yawDeg,
            pitchDeg: v.pitchDeg,
            cameraStart: {
                eye: v.eye,
                target: v.target,
                fov: options.fovDeg,
                reason: `r4-outward-${options.comboId}-yaw${Math.round(v.yawDeg)}-pitch${Math.round(v.pitchDeg)}`
            }
        };
    });
};

export {
    getComboAxisLabels,
    getComboAxes,
    worldToComboPoint,
    comboToWorldPoint,
    projectWorldPointToPreview,
    projectWorldDirectionToPreview,
    generateBestViewCandidates
};

export type {
    CameraPoint,
    CameraStart,
    AxisComboId,
    AxisDirection,
    ProjectionParams,
    SampledPoint,
    RoiBounds,
    BestViewCandidate
};
