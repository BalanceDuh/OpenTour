import type { AxisDir, CoordinateId } from '../coordinateViews';

type SampledPoint = {
    x: number;
    y: number;
    z: number;
    opacity: number;
};

type ProjectionParams = {
    sliceMin: number;
    sliceMax: number;
    xRangeMin: number;
    xRangeMax: number;
    heightMin: number;
    heightMax: number;
};

type RgbaImage = {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
};

type RectNorm = {
    x: number;
    y: number;
    w: number;
    h: number;
};

type ProjectionViewResult = {
    image: RgbaImage;
    density: Float32Array;
    maxDensity: number;
    rect: RectNorm;
    axisX: AxisDir;
    axisY: AxisDir;
    xRange: { min: number; max: number };
    yRange: { min: number; max: number };
};

type ProjectionByAxisResult = {
    coordinateId: CoordinateId;
    top: ProjectionViewResult;
    front: ProjectionViewResult;
    usedProjection: ProjectionParams;
};

type CameraPose = {
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
};

type OverlayPoint = {
    x: number;
    y: number;
    visible: boolean;
};

type CameraOverlayResult = {
    point: OverlayPoint;
    tip: OverlayPoint;
    directionVisible: boolean;
};

type BestFlyCameraInput = {
    points: SampledPoint[];
    coordinateId: CoordinateId;
    topRect: RectNorm;
    frontRect: RectNorm;
    topView: ProjectionViewResult;
    frontView: ProjectionViewResult;
    fovDeg: number;
    eyeHeightMeters: number;
};

type BestFlyCameraCandidate = {
    id: string;
    score: number;
    eye: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    fovDeg: number;
    eyeHeightMeters: number;
};

type BestFlyCameraResult = {
    best: BestFlyCameraCandidate;
    candidates: BestFlyCameraCandidate[];
    center: {
        x: number;
        y: number;
        z: number;
    };
    recommendedFovDeg: number;
    recommendedEyeHeightMeters: number;
    bounds: {
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
        zMin: number;
        zMax: number;
    };
};

export type {
    SampledPoint,
    ProjectionParams,
    RgbaImage,
    RectNorm,
    ProjectionViewResult,
    ProjectionByAxisResult,
    CameraPose,
    OverlayPoint,
    CameraOverlayResult,
    BestFlyCameraInput,
    BestFlyCameraCandidate,
    BestFlyCameraResult
};
