import {
    getComboAxisLabels,
    worldToComboPoint
} from './best-view-generator';

type AxisComboId = 'combo-1' | 'combo-2' | 'combo-3' | 'combo-4';
type MapStyle = 'navigation' | 'visual' | 'color';
type RasterTarget = 'map' | 'front';

type SampledPoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
    r: number;
    g: number;
    b: number;
    hasColor: boolean;
};

type ProjectionParams = {
    sliceMin: number;
    sliceMax: number;
    xRangeMin: number;
    xRangeMax: number;
    heightMin: number;
    heightMax: number;
};

type RectNorm = { x: number; y: number; w: number; h: number };

type StrategyRasterStats = {
    totalTransformed: number;
    accepted: number;
    filteredOpacity: number;
    filteredOutlier: number;
    filteredSlice: number;
    filteredBounds: number;
    avg: number;
    std: number;
    threshold: number;
    maxDensity: number;
};

type StrategyRoiResult = {
    rect: RectNorm;
    score: number;
    count: number;
    fallback: boolean;
    coverage: number;
    edgeRatio: number;
};

type SliceCandidate = {
    min: number;
    max: number;
    score: number;
    kept: number;
};

type StrategyDiagnostics = {
    sampleStep: number;
    transformRule: string;
    source: string;
    sliceMode: 'absolute';
    requestedProjection: ProjectionParams | null;
    selectedProjection: ProjectionParams;
    sliceCandidates: SliceCandidate[];
};

type StrategyRasterResult = {
    density: Float32Array;
    maxDensity: number;
    threshold: number;
    image: Uint8ClampedArray;
    stats: StrategyRasterStats;
    roi: StrategyRoiResult;
    floorY: number;
    transformRule: string;
    autoProjection: ProjectionParams;
    diagnostics: StrategyDiagnostics;
};

const REFRESH_RECO_IMPL = {
    id: 'OT-Refresh2DFront-DensityV2',
    version: '2.0.0',
    model: 'openai/gpt-5.3-codex'
} as const;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
    return sorted[idx];
};

const transformXYZForCombo = (
    x: number,
    y: number,
    z: number,
    comboId: AxisComboId,
    axisPresetId?: string
): { x: number; y: number; z: number; rule: string } => {
    const p = worldToComboPoint(comboId, { x, y, z }, axisPresetId);
    return {
        x: p.x,
        y: p.y,
        z: p.z,
        rule: getComboAxisLabels(comboId, axisPresetId).transformRule
    };
};

const computeRoiFromDensity = (density: Float32Array, width: number, height: number, threshold: number): StrategyRoiResult => {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    let accum = 0;
    let edgeCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const d = density[i];
            if (d < threshold) continue;
            count++;
            accum += d;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgeCount++;
        }
    }

    if (count === 0) {
        return {
            rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
            score: 0,
            count: 0,
            fallback: true,
            coverage: 0,
            edgeRatio: 0
        };
    }

    const inflateX = Math.max(1, Math.round((maxX - minX + 1) * 0.08));
    const inflateY = Math.max(1, Math.round((maxY - minY + 1) * 0.08));
    minX = clamp(minX - inflateX, 0, width - 1);
    maxX = clamp(maxX + inflateX, 0, width - 1);
    minY = clamp(minY - inflateY, 0, height - 1);
    maxY = clamp(maxY + inflateY, 0, height - 1);

    return {
        rect: {
            x: minX / width,
            y: minY / height,
            w: (maxX - minX + 1) / width,
            h: (maxY - minY + 1) / height
        },
        score: accum / Math.max(1, count),
        count,
        fallback: false,
        coverage: count / Math.max(1, width * height),
        edgeRatio: edgeCount / Math.max(1, count)
    };
};

const createBlankRaster = (width: number, height: number, projection: ProjectionParams, source: string): StrategyRasterResult => {
    const density = new Float32Array(width * height);
    const image = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < image.length; i += 4) {
        image[i + 0] = 4;
        image[i + 1] = 9;
        image[i + 2] = 18;
        image[i + 3] = 255;
    }
    return {
        density,
        maxDensity: 0,
        threshold: 0,
        image,
        stats: {
            totalTransformed: 0,
            accepted: 0,
            filteredOpacity: 0,
            filteredOutlier: 0,
            filteredSlice: 0,
            filteredBounds: 0,
            avg: 0,
            std: 0,
            threshold: 0,
            maxDensity: 0
        },
        roi: {
            rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
            score: 0,
            count: 0,
            fallback: true,
            coverage: 0,
            edgeRatio: 0
        },
        floorY: 0,
        transformRule: '',
        autoProjection: projection,
        diagnostics: {
            sampleStep: 0,
            transformRule: '',
            source,
            sliceMode: 'absolute',
            requestedProjection: null,
            selectedProjection: projection,
            sliceCandidates: []
        }
    };
};

const accumulatePixel = (density: Float32Array, width: number, px: number, py: number, weight: number) => {
    density[py * width + px] += weight;
};

const deriveAutoProjection = (
    points: Array<{ x: number; y: number; z: number; opacity: number }>,
    requested: ProjectionParams | null
) => {
    const yVals = points.map((p) => p.y);
    const fallbackMin = requested?.sliceMin ?? 0.5;
    const fallbackMax = requested?.sliceMax ?? 2.5;

    const sliceCandidatesBase: Array<{ min: number; max: number }> = [
        { min: fallbackMin, max: fallbackMax },
        { min: 0.3, max: 2.3 },
        { min: 0.8, max: 2.8 },
        { min: 1.0, max: 3.0 }
    ];

    const yP15 = percentile(yVals, 0.15);
    const yP55 = percentile(yVals, 0.55);
    const yP85 = percentile(yVals, 0.85);
    sliceCandidatesBase.push(
        { min: clamp(yP15, -2, 3), max: clamp(yP55, 0.8, 5) },
        { min: clamp(yP15 + 0.2, -1, 4), max: clamp(yP85, 1.2, 6) }
    );

    const candidates: SliceCandidate[] = [];
    let best = { min: 0.5, max: 2.5, score: -1, kept: 0 };
    for (const c of sliceCandidatesBase) {
        const kept = points.filter((p) => p.y >= c.min && p.y <= c.max).length;
        const occupancy = kept / Math.max(1, points.length);
        const band = Math.max(0.1, c.max - c.min);
        const bandPenalty = Math.abs(band - 2.0) * 0.08;
        const score = occupancy - bandPenalty;
        candidates.push({ min: Number(c.min.toFixed(2)), max: Number(c.max.toFixed(2)), score: Number(score.toFixed(4)), kept });
        if (score > best.score) best = { ...c, score, kept };
    }

    let sliced = points.filter((p) => p.y >= best.min && p.y <= best.max);
    if (sliced.length < 300) {
        const y05 = percentile(points.map((p) => p.y), 0.05);
        const y95 = percentile(points.map((p) => p.y), 0.95);
        best = {
            min: Number(y05.toFixed(2)),
            max: Number(y95.toFixed(2)),
            score: best.score,
            kept: points.length
        };
        sliced = points.filter((p) => p.y >= best.min && p.y <= best.max);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of sliced) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
        minX = -5; maxX = 5; minZ = -5; maxZ = 5;
    }
    const xPad = Math.max(0.08, (maxX - minX) * 0.08);
    const zPad = Math.max(0.08, (maxZ - minZ) * 0.08);

    const projection: ProjectionParams = {
        sliceMin: Number(best.min.toFixed(2)),
        sliceMax: Number(best.max.toFixed(2)),
        xRangeMin: Number((minX - xPad).toFixed(2)),
        xRangeMax: Number((maxX + xPad).toFixed(2)),
        heightMin: Number((minZ - zPad).toFixed(2)),
        heightMax: Number((maxZ + zPad).toFixed(2))
    };

    return { projection, candidates };
};

/**
 * Refresh Quality Strategy
 *
 * Implementation tag: OT-Refresh2DFront-DensityV2
 * Version: 2.0.0
 * Implemented by model: openai/gpt-5.3-codex
 *
 * Changes in v2.0.0:
 * - Full density accumulation (no downsampling step).
 * - Absolute-height slicing (legacy behavior): default around [0.5m, 2.5m].
 * - Dynamic bounds from min/max of kept points (no percentile wall clipping).
 * - Single-pixel alpha histogram accumulation for robust map extraction.
 */
const buildRefreshRaster = (input: {
    sampledPoints: SampledPoint[];
    comboId: AxisComboId;
    target: RasterTarget;
    width: number;
    height: number;
    mapStyle: MapStyle;
    projectionHint?: ProjectionParams | null;
    fixedProjection?: ProjectionParams | null;
    axisPresetId?: string;
    source?: string;
}): StrategyRasterResult => {
    const {
        sampledPoints,
        comboId,
        target,
        width,
        height,
        mapStyle,
        projectionHint = null,
        fixedProjection = null,
        axisPresetId,
        source = 'unknown'
    } = input;

    const fallbackProjection: ProjectionParams = projectionHint ?? {
        sliceMin: 0.5,
        sliceMax: 2.5,
        xRangeMin: -5,
        xRangeMax: 5,
        heightMin: -5,
        heightMax: 5
    };
    const blank = createBlankRaster(width, height, fallbackProjection, source);
    if (sampledPoints.length === 0) return blank;

    const transformed: Array<{ x: number; y: number; z: number; opacity: number }> = [];
    const step = 1;
    let transformRule = '';

    for (let i = 0; i < sampledPoints.length; i += step) {
        const s = sampledPoints[i];
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
        if (Math.abs(s.x) > 500 || Math.abs(s.y) > 500 || Math.abs(s.z) > 500) continue;
        const t = transformXYZForCombo(s.x, s.y, s.z, comboId, axisPresetId);
        transformRule = t.rule;
        transformed.push({ x: t.x, y: t.y, z: t.z, opacity: s.opacity });
    }
    if (transformed.length === 0) return blank;

    const yVals = transformed.map((p) => p.y);

    let filteredOpacity = 0;
    let filteredOutlier = 0;
    const cleaned: Array<{ x: number; y: number; z: number; opacity: number }> = [];
    for (const p of transformed) {
        if (p.opacity < 0.1) {
            filteredOpacity++;
            continue;
        }
        cleaned.push(p);
    }
    if (cleaned.length === 0) return blank;

    const derived = fixedProjection
        ? { projection: fixedProjection, candidates: [] as SliceCandidate[] }
        : deriveAutoProjection(cleaned, projectionHint);
    const projection = derived.projection;

    const xSpanInv = 1 / Math.max(1e-6, projection.xRangeMax - projection.xRangeMin);
    const zSpanInv = 1 / Math.max(1e-6, projection.heightMax - projection.heightMin);
    const ySpanInv = 1 / Math.max(1e-6, projection.sliceMax - projection.sliceMin);

    const density = new Float32Array(width * height);
    let filteredSlice = 0;
    let filteredBounds = 0;
    let accepted = 0;
    for (const p of cleaned) {
        if (p.y < projection.sliceMin || p.y > projection.sliceMax) {
            filteredSlice++;
            continue;
        }

        const u = (p.x - projection.xRangeMin) * xSpanInv;
        const v = target === 'map'
            ? (1 - (p.z - projection.heightMin) * zSpanInv)
            : (1 - (p.y - projection.sliceMin) * ySpanInv);
        if (u < 0 || u > 1 || v < 0 || v > 1) {
            filteredBounds++;
            continue;
        }

        const px = clamp(Math.floor(u * (width - 1)), 0, width - 1);
        const py = clamp(Math.floor(v * (height - 1)), 0, height - 1);
        accumulatePixel(density, width, px, py, clamp(p.opacity, 0.1, 1));
        accepted++;
    }

    const image = new Uint8ClampedArray(width * height * 4);
    let maxDensity = 0;
    let sum = 0;
    for (let i = 0; i < density.length; i++) {
        maxDensity = Math.max(maxDensity, density[i]);
        sum += density[i];
    }
    const avg = sum / Math.max(1, density.length);
    let variance = 0;
    for (let i = 0; i < density.length; i++) {
        const d = density[i] - avg;
        variance += d * d;
    }
    const std = Math.sqrt(variance / Math.max(1, density.length));
    const threshold = avg + std * 2.0;
    const roi = computeRoiFromDensity(density, width, height, threshold);

    const den = Math.max(1e-6, Math.log1p(maxDensity));
    for (let i = 0; i < density.length; i++) {
        const a = Math.log1p(density[i]) / den;
        const p = i * 4;
        const v = Math.floor((1 - a) * 255);
        if (mapStyle === 'color') {
            image[p + 0] = v;
            image[p + 1] = clamp(v + 12, 0, 255);
            image[p + 2] = clamp(v + 24, 0, 255);
        } else {
            image[p + 0] = v;
            image[p + 1] = v;
            image[p + 2] = v;
        }
        image[p + 3] = 255;
    }

    return {
        density,
        maxDensity,
        threshold,
        image,
        stats: {
            totalTransformed: transformed.length,
            accepted,
            filteredOpacity,
            filteredOutlier,
            filteredSlice,
            filteredBounds,
            avg: Number(avg.toFixed(6)),
            std: Number(std.toFixed(6)),
            threshold: Number(threshold.toFixed(6)),
            maxDensity: Number(maxDensity.toFixed(6))
        },
        roi,
        floorY: Number(percentile(yVals, 0.03).toFixed(4)),
        transformRule,
        autoProjection: projection,
        diagnostics: {
            sampleStep: step,
            transformRule,
            source,
            sliceMode: 'absolute',
            requestedProjection: projectionHint,
            selectedProjection: projection,
            sliceCandidates: derived.candidates
        }
    };
};

export {
    REFRESH_RECO_IMPL,
    buildRefreshRaster
};

export type {
    StrategyRasterStats,
    StrategyRoiResult,
    StrategyRasterResult,
    StrategyDiagnostics
};
