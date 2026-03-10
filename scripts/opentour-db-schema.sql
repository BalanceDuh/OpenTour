PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ot_model (
    ModelKey TEXT PRIMARY KEY,
    ModelName TEXT NOT NULL COLLATE NOCASE UNIQUE,
    FileExt TEXT,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ot_model_coordinate (
    ModelKey TEXT PRIMARY KEY,
    CoordinateSystem TEXT NOT NULL CHECK (CoordinateSystem IN ('OpenCV', 'OpenGL')),
    UpAxis TEXT NOT NULL CHECK (UpAxis IN ('Y', 'Z')),
    UpDirection TEXT NOT NULL CHECK (UpDirection IN ('Up', 'Down')),
    ConfirmedAt TEXT,
    UpdatedAt TEXT NOT NULL,
    FOREIGN KEY (ModelKey) REFERENCES ot_model(ModelKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ot_model_calibration (
    ModelKey TEXT PRIMARY KEY,
    AxisPresetId TEXT NOT NULL,
    ViewRangeJson TEXT NOT NULL,
    VerticalMapImage BLOB,
    FrontViewImage BLOB,
    SourceAxisPresetId TEXT,
    TargetAxisPresetId TEXT,
    CanonicalTopSelectionJson TEXT,
    CanonicalFrontSelectionJson TEXT,
    BestCameraJson TEXT,
    SelectedBestCameraId TEXT,
    ImageMime TEXT,
    UpdatedAt TEXT NOT NULL,
    FOREIGN KEY (ModelKey) REFERENCES ot_model(ModelKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ot_workflow_snapshot (
    ModelFilename TEXT PRIMARY KEY,
    PayloadJson TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ot_model_updated_at
    ON ot_model(UpdatedAt);

CREATE INDEX IF NOT EXISTS idx_ot_model_coordinate_updated_at
    ON ot_model_coordinate(UpdatedAt);

CREATE INDEX IF NOT EXISTS idx_ot_model_calibration_updated_at
    ON ot_model_calibration(UpdatedAt);

CREATE INDEX IF NOT EXISTS idx_ot_workflow_snapshot_updated_at
    ON ot_workflow_snapshot(UpdatedAt);
