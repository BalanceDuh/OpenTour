import {
    comboToWorldPoint,
    worldToComboPoint,
    type AxisComboId,
    type BestViewCandidate,
    type CameraPoint,
    type RoiBounds,
    type SampledPoint
} from './best-view-generator';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const normalize2 = (x: number, z: number) => {
    const len = Math.sqrt(x * x + z * z);
    if (len < 1e-6) return { x: 0, z: 1 };
    return { x: x / len, z: z / len };
};

const rotate2 = (dir: { x: number; z: number }, deg: number) => {
    const rad = deg * (Math.PI / 180);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return normalize2(dir.x * c - dir.z * s, dir.x * s + dir.z * c);
};

const yawFromDir = (dir: { x: number; z: number }) => Math.atan2(dir.z, dir.x) * (180 / Math.PI);

const calculateCleanBounds = (points: SampledPoint[], opThreshold: number, fallback: RoiBounds): RoiBounds => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const p of points) {
        if (p.opacity < opThreshold) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }

    if (!Number.isFinite(minX)) return fallback;
    return { minX, maxX, minY, maxY, minZ, maxZ };
};

const directionPenalty = (
    origin: CameraPoint,
    dir: { x: number; z: number },
    points: SampledPoint[],
    range: number,
    lateralRadius: number,
    verticalRadius: number
) => {
    let penalty = 0;
    for (const p of points) {
        const dx = p.x - origin.x;
        const dz = p.z - origin.z;
        const dot = dx * dir.x + dz * dir.z;
        if (dot <= 0 || dot > range) continue;

        const side = Math.abs(dx * -dir.z + dz * dir.x);
        if (side > lateralRadius) continue;
        if (Math.abs(p.y - origin.y) > verticalRadius) continue;

        const forwardWeight = (range - dot) / range;
        const sideWeight = 1 - side / Math.max(1e-6, lateralRadius);
        penalty += forwardWeight * sideWeight * clamp(p.opacity, 0.1, 1);
    }
    return penalty;
};

const localDensity = (origin: CameraPoint, points: SampledPoint[], radius: number) => {
    let d = 0;
    const r2 = radius * radius;
    for (const p of points) {
        const dx = p.x - origin.x;
        const dy = p.y - origin.y;
        const dz = p.z - origin.z;
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 > r2) continue;
        const w = 1 - dist2 / r2;
        d += w * clamp(p.opacity, 0.1, 1);
    }
    return d;
};

const retreatEyeFromDensity = (
    eye: CameraPoint,
    dir: { x: number; z: number },
    points: SampledPoint[],
    bounds: RoiBounds
) => {
    const step = 0.25;
    const maxSteps = 10;
    const safeThreshold = 9.5;
    const localRadius = 0.55;
    let out = { ...eye };
    for (let i = 0; i < maxSteps; i++) {
        const d = localDensity(out, points, localRadius);
        if (d <= safeThreshold) break;
        out = {
            x: clamp(out.x - dir.x * step, bounds.minX, bounds.maxX),
            y: clamp(out.y, bounds.minY, bounds.maxY),
            z: clamp(out.z - dir.z * step, bounds.minZ, bounds.maxZ)
        };
    }
    return out;
};

const findBestDirection = (origin: CameraPoint, points: SampledPoint[], range: number) => {
    const dirs = [
        { x: 1, z: 0 },
        { x: -1, z: 0 },
        { x: 0, z: 1 },
        { x: 0, z: -1 },
        normalize2(1, 1),
        normalize2(1, -1),
        normalize2(-1, 1),
        normalize2(-1, -1)
    ];

    let best = dirs[2];
    let minPenalty = Number.POSITIVE_INFINITY;
    dirs.forEach((d) => {
        const p = directionPenalty(origin, d, points, range, 0.9, 1.1);
        if (p < minPenalty) {
            minPenalty = p;
            best = d;
        }
    });
    return normalize2(best.x, best.z);
};

const makeCandidate = (
    comboId: AxisComboId,
    axisPresetId: string | undefined,
    eyeCombo: CameraPoint,
    dir: { x: number; z: number },
    lookDistance: number,
    fovDeg: number,
    id: string,
    label: string,
    score: number,
    pitchDeg: number
): BestViewCandidate => {
    const pitchRad = pitchDeg * (Math.PI / 180);
    const targetCombo = {
        x: eyeCombo.x + dir.x * lookDistance,
        y: eyeCombo.y + Math.tan(pitchRad) * (lookDistance * 0.3),
        z: eyeCombo.z + dir.z * lookDistance
    };

    return {
        id,
        label,
        score,
        clarity: score / 100,
        yawDeg: yawFromDir(dir),
        pitchDeg,
        cameraStart: {
            eye: comboToWorldPoint(comboId, eyeCombo, axisPresetId),
            target: comboToWorldPoint(comboId, targetCombo, axisPresetId),
            fov: fovDeg,
            reason: `alg3-normalized-${comboId}-yaw${Math.round(yawFromDir(dir))}-pitch${Math.round(pitchDeg)}`
        }
    };
};

const generateBestViewCandidatesAlg3 = (options: {
    comboId: AxisComboId;
    axisPresetId?: string;
    roi: RoiBounds;
    sampledPoints: SampledPoint[];
    floorY?: number;
    eyeHeight?: number;
    fovDeg: number;
}): BestViewCandidate[] => {
    const comboPoints = options.sampledPoints.map((p) => ({
        ...worldToComboPoint(options.comboId, p, options.axisPresetId),
        opacity: p.opacity
    }));
    const cleanBounds = calculateCleanBounds(comboPoints, 0.16, options.roi);
    const bounds: RoiBounds = {
        minX: Math.max(options.roi.minX, cleanBounds.minX),
        maxX: Math.min(options.roi.maxX, cleanBounds.maxX),
        minY: Math.max(options.roi.minY, cleanBounds.minY),
        maxY: Math.min(options.roi.maxY, cleanBounds.maxY),
        minZ: Math.max(options.roi.minZ, cleanBounds.minZ),
        maxZ: Math.min(options.roi.maxZ, cleanBounds.maxZ)
    };

    const floorY = Number.isFinite(options.floorY) ? (options.floorY as number) : bounds.minY;
    const eyeHeight = Number.isFinite(options.eyeHeight) ? (options.eyeHeight as number) : 2.2;
    const eyeCombo = {
        x: (bounds.minX + bounds.maxX) * 0.5,
        y: clamp(floorY + eyeHeight, bounds.minY, bounds.maxY),
        z: (bounds.minZ + bounds.maxZ) * 0.5
    };

    const spanX = Math.max(0.5, bounds.maxX - bounds.minX);
    const spanZ = Math.max(0.5, bounds.maxZ - bounds.minZ);
    const range = Math.max(2.0, Math.max(spanX, spanZ) * 0.24);
    const lookDistance = Math.max(1.5, Math.max(spanX, spanZ) * 0.22);

    const baseDir = findBestDirection(eyeCombo, comboPoints, range);
    const safeEye = retreatEyeFromDensity(eyeCombo, baseDir, comboPoints, bounds);

    const levelScore = 97;
    const isoScore = 93;
    const topScore = 87;

    const level = makeCandidate(options.comboId, options.axisPresetId, safeEye, baseDir, lookDistance, options.fovDeg, 'a3-level', 'Level View', levelScore, 0);
    const iso = makeCandidate(options.comboId, options.axisPresetId, safeEye, rotate2(baseDir, 24), lookDistance, options.fovDeg, 'a3-iso', 'Isometric View', isoScore, 10);
    const top = makeCandidate(options.comboId, options.axisPresetId, safeEye, rotate2(baseDir, -20), lookDistance, options.fovDeg, 'a3-top', 'Top-down View', topScore, 30);

    return [level, iso, top];
};

export { generateBestViewCandidatesAlg3 };
