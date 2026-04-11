import { join } from 'node:path';

import { getEnv } from '../../config/env.mjs';
import { openSqliteDatabase } from '../sqlite/client.mjs';
import { createSqliteStatementRepository } from './statement-repository.mjs';

const ensureColumn = (db, tableName, columnDef) => {
    try {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
    } catch (error) {
        const message = String(error?.message || error || '');
        if (!/duplicate column name/i.test(message)) throw error;
    }
};

export const createWorkflowRepository = (service = 'workflow') => {
    const { dataDir, repoRoot } = getEnv();
    const db = openSqliteDatabase(join(dataDir, 'opentour.db'));
    db.exec(`
CREATE TABLE IF NOT EXISTS ot_model (
    ModelKey TEXT PRIMARY KEY,
    ModelName TEXT NOT NULL,
    FileExt TEXT,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ot_model_coordinate (
    ModelKey TEXT PRIMARY KEY,
    CoordinateSystem TEXT,
    UpAxis TEXT,
    UpDirection TEXT,
    UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ot_model_calibration (
    ModelKey TEXT PRIMARY KEY,
    AxisPresetId TEXT,
    ViewRangeJson TEXT,
    VerticalMapImage BLOB,
    FrontViewImage BLOB,
    UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ot_workflow_snapshot (
    ModelFilename TEXT PRIMARY KEY,
    PayloadJson TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);
`);
    ensureColumn(db, 'ot_model_calibration', 'SourceAxisPresetId TEXT');
    ensureColumn(db, 'ot_model_calibration', 'TargetAxisPresetId TEXT');
    ensureColumn(db, 'ot_model_calibration', 'CanonicalTopSelectionJson TEXT');
    ensureColumn(db, 'ot_model_calibration', 'CanonicalFrontSelectionJson TEXT');
    ensureColumn(db, 'ot_model_calibration', 'BestCameraJson TEXT');
    ensureColumn(db, 'ot_model_calibration', 'SelectedBestCameraId TEXT');
    ensureColumn(db, 'ot_model_calibration', 'ImageMime TEXT');

    const repository = createSqliteStatementRepository({
        service,
        db,
        statements: {
            upsertSnapshot: `
INSERT INTO ot_workflow_snapshot (ModelFilename, PayloadJson, UpdatedAt)
VALUES (@model_filename, @payload_json, @updated_at)
ON CONFLICT(ModelFilename) DO UPDATE SET
    PayloadJson = excluded.PayloadJson,
    UpdatedAt = excluded.UpdatedAt
`,
            getSnapshot: `
SELECT ModelFilename, PayloadJson, UpdatedAt
FROM ot_workflow_snapshot
WHERE ModelFilename = ?
`,
            upsertModel: `
INSERT INTO ot_model (ModelKey, ModelName, FileExt, CreatedAt, UpdatedAt)
VALUES (@model_key, @model_name, @file_ext, @created_at, @updated_at)
ON CONFLICT(ModelKey) DO UPDATE SET
    ModelName = excluded.ModelName,
    FileExt = excluded.FileExt,
    UpdatedAt = excluded.UpdatedAt
`,
            getModelNameByKey: `
SELECT ModelName
FROM ot_model
WHERE ModelKey = ?
`,
            upsertCalibration: `
INSERT INTO ot_model_calibration (
    ModelKey,
    AxisPresetId,
    ViewRangeJson,
    VerticalMapImage, FrontViewImage,
    SourceAxisPresetId,
    TargetAxisPresetId,
    CanonicalTopSelectionJson,
    CanonicalFrontSelectionJson,
    BestCameraJson,
    SelectedBestCameraId,
    ImageMime,
    UpdatedAt
) VALUES (
    @model_key,
    @axis_preset_id,
    @view_range_json,
    @vertical_map_image, @front_view_image,
    @source_axis_preset_id,
    @target_axis_preset_id,
    @canonical_top_selection_json,
    @canonical_front_selection_json,
    @best_camera_json,
    @selected_best_camera_id,
    @image_mime,
    @updated_at
)
ON CONFLICT(ModelKey) DO UPDATE SET
    AxisPresetId = excluded.AxisPresetId,
    ViewRangeJson = excluded.ViewRangeJson,
    VerticalMapImage = excluded.VerticalMapImage,
    FrontViewImage = excluded.FrontViewImage,
    SourceAxisPresetId = excluded.SourceAxisPresetId,
    TargetAxisPresetId = excluded.TargetAxisPresetId,
    CanonicalTopSelectionJson = excluded.CanonicalTopSelectionJson,
    CanonicalFrontSelectionJson = excluded.CanonicalFrontSelectionJson,
    BestCameraJson = excluded.BestCameraJson,
    SelectedBestCameraId = excluded.SelectedBestCameraId,
    ImageMime = excluded.ImageMime,
    UpdatedAt = excluded.UpdatedAt
`,
            getCalibration: `
SELECT
    m.ModelName,
    c.AxisPresetId,
    c.ViewRangeJson,
    c.VerticalMapImage, c.FrontViewImage,
    c.SourceAxisPresetId,
    c.TargetAxisPresetId,
    c.CanonicalTopSelectionJson,
    c.CanonicalFrontSelectionJson,
    c.BestCameraJson,
    c.SelectedBestCameraId,
    c.ImageMime,
    c.UpdatedAt
FROM ot_model_calibration c
JOIN ot_model m ON m.ModelKey = c.ModelKey
WHERE c.ModelKey = ?
`,
            getCalibrationAxis: `
SELECT AxisPresetId, UpdatedAt
FROM ot_model_calibration
WHERE ModelKey = ?
`,
            getCoordinate: `
SELECT
    m.ModelName,
    c.CoordinateSystem,
    c.UpAxis,
    c.UpDirection,
    c.UpdatedAt
FROM ot_model_coordinate c
JOIN ot_model m ON m.ModelKey = c.ModelKey
WHERE c.ModelKey = ?
`,
            clearAllSnapshots: 'DELETE FROM ot_workflow_snapshot',
            clearAllCalibrations: 'DELETE FROM ot_model_calibration',
            clearAllCoordinates: 'DELETE FROM ot_model_coordinate',
            clearAllModels: 'DELETE FROM ot_model'
        }
    });

    return {
        ...repository,
        schemaSource: join(repoRoot, 'scripts', 'opentour-db-schema.sql'),
        clearAllOpentourData: repository.transaction('clearAllOpentourData', () => ({
            snapshots: repository.run('clearAllSnapshots').changes,
            calibrations: repository.run('clearAllCalibrations').changes,
            coordinates: repository.run('clearAllCoordinates').changes,
            models: repository.run('clearAllModels').changes
        }))
    };
};
