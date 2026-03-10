export const OT_TOUR_CSV_VERSION = 'v2' as const;

export const OT_TOUR_CSV_HEADERS = [
    'version',
    'seq',
    'action',
    'audio_mode',
    'poi_id',
    'poi_name',
    'target_x',
    'target_y',
    'target_z',
    'target_yaw',
    'target_pitch',
    'target_fov',
    'move_speed_mps',
    'dwell_ms',
    'content',
    'tts_lang',
    'tts_voice',
    'model_filename',
    'eye_height_m'
] as const;

export const OT_TOUR_DB_TABLE = 'model_pois' as const;

export const OT_TOUR_DB_PRIMARY_KEY = [
    'model_filename',
    'poi_id'
] as const;

export const OT_TOUR_DB_FIELDS = [
    'model_filename',
    'poi_id',
    'poi_name',
    'sort_order',
    'target_x',
    'target_y',
    'target_z',
    'target_yaw',
    'target_pitch',
    'target_fov',
    'move_speed_mps',
    'dwell_ms',
    'content',
    'tts_lang',
    'screenshot_data_url',
    'screenshot_blob',
    'screenshot_blob_mime',
    'screenshot_updated_at',
    'content_updated_at',
    'updated_at'
] as const;

export const OT_TOUR_MODEL_POIS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS model_pois (
    model_filename TEXT NOT NULL,
    poi_id TEXT NOT NULL,
    poi_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    target_x REAL NOT NULL,
    target_y REAL NOT NULL,
    target_z REAL NOT NULL,
    target_yaw REAL NOT NULL,
    target_pitch REAL NOT NULL,
    target_fov REAL NOT NULL,
    move_speed_mps REAL NOT NULL,
    dwell_ms INTEGER NOT NULL,
    content TEXT NOT NULL,
    tts_lang TEXT NOT NULL,
    screenshot_data_url TEXT,
    screenshot_blob BLOB,
    screenshot_blob_mime TEXT,
    screenshot_updated_at TEXT,
    content_updated_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (model_filename, poi_id)
)
`.trim();

export type OTTourCsvHeader = typeof OT_TOUR_CSV_HEADERS[number];
export type OTTourDbField = typeof OT_TOUR_DB_FIELDS[number];
