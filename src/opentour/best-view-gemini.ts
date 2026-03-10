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

const calculateCleanBounds = (points: SampledPoint[], opThreshold: number): RoiBounds => {
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
    if (!Number.isFinite(minX)) {
        return { minX: -1, maxX: 1, minY: -1, maxY: 2, minZ: -1, maxZ: 1 };
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
};

const findClearestDirection = (origin: CameraPoint, points: SampledPoint[], range: number) => {
    const dirs = [
        { x: 1, z: 0 },
        { x: -1, z: 0 },
        { x: 0, z: 1 },
        { x: 0, z: -1 }
    ];
    let best = dirs[2];
    let minScore = Infinity;
    for (const dir of dirs) {
        let score = 0;
        for (const p of points) {
            const dx = p.x - origin.x;
            const dz = p.z - origin.z;
            const dot = dx * dir.x + dz * dir.z;
            if (dot <= 0 || dot >= range) continue;
            const distSq = dx * dx + dz * dz - dot * dot;
            if (distSq < 0.5) score += range - dot;
        }
        if (score < minScore) {
            minScore = score;
            best = dir;
        }
    }
    return normalize2(best.x, best.z);
};

const yawFromDir = (dir: { x: number; z: number }) => Math.atan2(dir.z, dir.x) * (180 / Math.PI);

const rotateY = (dir: { x: number; z: number }, deg: number) => {
    const rad = deg * (Math.PI / 180);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return normalize2(dir.x * c - dir.z * s, dir.x * s + dir.z * c);
};

const makeCandidate = (
    comboId: AxisComboId,
    axisPresetId: string | undefined,
    eyeCombo: CameraPoint,
    dir2: { x: number; z: number },
    lookDistance: number,
    fovDeg: number,
    id: string,
    label: string,
    score: number,
    pitchDeg: number
): BestViewCandidate => {
    const targetCombo = {
        x: eyeCombo.x + dir2.x * lookDistance,
        y: eyeCombo.y + Math.tan((pitchDeg * Math.PI) / 180) * (lookDistance * 0.35),
        z: eyeCombo.z + dir2.z * lookDistance
    };
    return {
        id,
        label,
        score,
        clarity: score / 100,
        yawDeg: yawFromDir(dir2),
        pitchDeg,
        cameraStart: {
            eye: comboToWorldPoint(comboId, eyeCombo, axisPresetId),
            target: comboToWorldPoint(comboId, targetCombo, axisPresetId),
            fov: fovDeg,
            reason: `gemini-omnicenter-${comboId}`
        }
    };
};

const generateBestViewCandidatesGemini = (options: {
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
    const bounds = calculateCleanBounds(comboPoints, 0.2);
    const floorY = Number.isFinite(options.floorY) ? (options.floorY as number) : bounds.minY;
    const eyeHeight = Number.isFinite(options.eyeHeight) ? (options.eyeHeight as number) : 2.2;
    const eyeCombo = {
        x: (bounds.minX + bounds.maxX) * 0.5,
        y: clamp(floorY + eyeHeight, bounds.minY, bounds.maxY),
        z: (bounds.minZ + bounds.maxZ) * 0.5
    };

    const range = Math.max(2.5, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.22);
    const baseDir = findClearestDirection(eyeCombo, comboPoints, range);
    const lookDistance = Math.max(1.8, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.2);

    const level = makeCandidate(options.comboId, options.axisPresetId, eyeCombo, baseDir, lookDistance, options.fovDeg, 'g-level', 'Level View', 98, 0);
    const isoDir = rotateY(baseDir, 25);
    const iso = makeCandidate(options.comboId, options.axisPresetId, eyeCombo, isoDir, lookDistance, options.fovDeg, 'g-iso', 'Isometric View', 95, 8);
    const topDir = rotateY(baseDir, -22);
    const top = makeCandidate(options.comboId, options.axisPresetId, eyeCombo, topDir, lookDistance, options.fovDeg, 'g-top', 'Top-down View', 89, 32);

    return [level, iso, top];
};

export { generateBestViewCandidatesGemini };
