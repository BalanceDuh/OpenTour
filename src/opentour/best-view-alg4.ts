import {
    comboToWorldPoint,
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

const buildCandidate = (
    comboId: AxisComboId,
    axisPresetId: string | undefined,
    id: string,
    label: string,
    score: number,
    eyeCombo: CameraPoint,
    dir2: { x: number; z: number },
    lookDistance: number,
    pitchDeg: number,
    fovDeg: number
): BestViewCandidate => {
    const pitchRad = pitchDeg * (Math.PI / 180);
    const targetCombo = {
        x: eyeCombo.x + dir2.x * lookDistance,
        y: eyeCombo.y + Math.tan(pitchRad) * lookDistance * 0.28,
        z: eyeCombo.z + dir2.z * lookDistance
    };

    return {
        id,
        label,
        score,
        clarity: score / 100,
        yawDeg: Math.atan2(dir2.z, dir2.x) * (180 / Math.PI),
        pitchDeg,
        cameraStart: {
            eye: comboToWorldPoint(comboId, eyeCombo, axisPresetId),
            target: comboToWorldPoint(comboId, targetCombo, axisPresetId),
            fov: fovDeg,
            reason: `alg4-projection-only-${comboId}`
        }
    };
};

const generateBestViewCandidatesAlg4 = (options: {
    comboId: AxisComboId;
    axisPresetId?: string;
    roi: RoiBounds;
    sampledPoints: SampledPoint[];
    floorY?: number;
    eyeHeight?: number;
    fovDeg: number;
}): BestViewCandidate[] => {
    const spanX = Math.max(0.5, options.roi.maxX - options.roi.minX);
    const spanZ = Math.max(0.5, options.roi.maxZ - options.roi.minZ);
    const centerX = (options.roi.minX + options.roi.maxX) * 0.5;
    const centerZ = (options.roi.minZ + options.roi.maxZ) * 0.5;
    const floorY = Number.isFinite(options.floorY) ? (options.floorY as number) : options.roi.minY;
    const eyeHeight = Number.isFinite(options.eyeHeight) ? (options.eyeHeight as number) : 2.2;
    const centerY = clamp(floorY + eyeHeight, options.roi.minY, options.roi.maxY);

    const eyeCombo = {
        x: centerX,
        y: centerY,
        z: centerZ
    };

    const lookDistance = Math.max(1.2, Math.max(spanX, spanZ) * 0.24);

    const levelDir = normalize2(0, 1);
    const isoDir = normalize2(0.72, 0.72);
    const topDir = normalize2(-0.45, 0.9);

    return [
        buildCandidate(options.comboId, options.axisPresetId, 'a4-level', 'Level View', 96, eyeCombo, levelDir, lookDistance, 0, options.fovDeg),
        buildCandidate(options.comboId, options.axisPresetId, 'a4-iso', 'Isometric View', 92, eyeCombo, isoDir, lookDistance, 11, options.fovDeg),
        buildCandidate(options.comboId, options.axisPresetId, 'a4-top', 'Top-down View', 86, eyeCombo, topDir, lookDistance, 32, options.fovDeg)
    ];
};

export { generateBestViewCandidatesAlg4 };
