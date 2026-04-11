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

export const createProducerRepository = (service = 'ot-tour-producer') => {
    const { dataDir } = getEnv();
    const db = openSqliteDatabase(join(dataDir, 'ot-tour-producer.db'));
    db.exec("CREATE TABLE IF NOT EXISTS producer_videos (\n    id TEXT PRIMARY KEY,\n    model_filename TEXT,\n    name TEXT NOT NULL,\n    mime_type TEXT NOT NULL,\n    width INTEGER,\n    height INTEGER,\n    duration_sec REAL,\n    size_bytes INTEGER NOT NULL,\n    sha256 TEXT,\n    thumbnail_jpeg BLOB,\n    data BLOB NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS producer_video_snapshots (\n    id TEXT PRIMARY KEY,\n    video_id TEXT NOT NULL,\n    sort_order INTEGER NOT NULL,\n    timestamp_sec REAL NOT NULL,\n    mime_type TEXT NOT NULL,\n    data BLOB NOT NULL,\n    created_at TEXT NOT NULL,\n    FOREIGN KEY(video_id) REFERENCES producer_videos(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS producer_assets (\n    id TEXT PRIMARY KEY,\n    kind TEXT NOT NULL,\n    name TEXT,\n    mime_type TEXT NOT NULL,\n    width INTEGER,\n    height INTEGER,\n    duration_sec REAL,\n    size_bytes INTEGER NOT NULL,\n    data BLOB NOT NULL,\n    meta_json TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS producer_output_records (\n    id TEXT PRIMARY KEY,\n    model_filename TEXT,\n    asset_id TEXT NOT NULL,\n    name TEXT,\n    saved INTEGER NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    FOREIGN KEY(asset_id) REFERENCES producer_assets(id) ON DELETE CASCADE\n);\n\nCREATE INDEX IF NOT EXISTS idx_producer_videos_updated\nON producer_videos(updated_at DESC);\n\nCREATE INDEX IF NOT EXISTS idx_producer_video_snapshots_video\nON producer_video_snapshots(video_id, sort_order ASC);\n\nCREATE INDEX IF NOT EXISTS idx_producer_assets_kind_updated\nON producer_assets(kind, updated_at DESC);\n\nCREATE INDEX IF NOT EXISTS idx_producer_outputs_model_saved_updated\nON producer_output_records(model_filename, saved, updated_at DESC);\n");
    ensureColumn(db, 'producer_videos', 'model_filename TEXT');
    ensureColumn(db, 'producer_videos', 'sha256 TEXT');
    db.exec("CREATE INDEX IF NOT EXISTS idx_producer_videos_model_updated ON producer_videos(model_filename, updated_at DESC)");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_producer_videos_model_sha256 ON producer_videos(model_filename, sha256)");

    return createSqliteStatementRepository({
        service,
        db,
        statements: {
            upsertVideo: "INSERT INTO producer_videos (\n    id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, thumbnail_jpeg, data, created_at, updated_at\n) VALUES (\n    @id, @model_filename, @name, @mime_type, @width, @height, @duration_sec, @size_bytes, @sha256, @thumbnail_jpeg, @data, @created_at, @updated_at\n)\nON CONFLICT(id) DO UPDATE SET\n    model_filename = excluded.model_filename,\n    name = excluded.name,\n    mime_type = excluded.mime_type,\n    width = excluded.width,\n    height = excluded.height,\n    duration_sec = excluded.duration_sec,\n    size_bytes = excluded.size_bytes,\n    sha256 = excluded.sha256,\n    thumbnail_jpeg = excluded.thumbnail_jpeg,\n    data = excluded.data,\n    updated_at = excluded.updated_at\n",
            listVideos: "SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at\nFROM producer_videos\nORDER BY updated_at DESC, created_at DESC\n",
            listVideosByModel: "SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at\nFROM producer_videos\nWHERE model_filename = ?\nORDER BY updated_at DESC, created_at DESC\n",
            getVideoById: "SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, thumbnail_jpeg, data, created_at, updated_at\nFROM producer_videos\nWHERE id = ?\n",
            getVideoByModelAndSha: "SELECT id, model_filename, name, mime_type, width, height, duration_sec, size_bytes, sha256, created_at, updated_at\nFROM producer_videos\nWHERE model_filename = ? AND sha256 = ?\nLIMIT 1\n",
            deleteVideoSnapshotsByVideo: "DELETE FROM producer_video_snapshots WHERE video_id = ?",
            insertVideoSnapshot: "INSERT INTO producer_video_snapshots (\n    id, video_id, sort_order, timestamp_sec, mime_type, data, created_at\n) VALUES (\n    @id, @video_id, @sort_order, @timestamp_sec, @mime_type, @data, @created_at\n)\n",
            listVideoSnapshotsByVideo: "SELECT id, video_id, sort_order, timestamp_sec, mime_type, created_at\nFROM producer_video_snapshots\nWHERE video_id = ?\nORDER BY sort_order ASC\n",
            getVideoSnapshotById: "SELECT id, video_id, sort_order, timestamp_sec, mime_type, data, created_at\nFROM producer_video_snapshots\nWHERE id = ?\n",
            insertAsset: "INSERT INTO producer_assets (\n    id, kind, name, mime_type, width, height, duration_sec, size_bytes, data, meta_json, created_at, updated_at\n) VALUES (\n    @id, @kind, @name, @mime_type, @width, @height, @duration_sec, @size_bytes, @data, @meta_json, @created_at, @updated_at\n)\n",
            getAssetById: "SELECT id, kind, name, mime_type, width, height, duration_sec, size_bytes, data, meta_json, created_at, updated_at\nFROM producer_assets\nWHERE id = ?\n",
            listAssetsByKind: "SELECT id, kind, name, mime_type, width, height, duration_sec, size_bytes, created_at, updated_at\nFROM producer_assets\nWHERE kind = ?\nORDER BY updated_at DESC\n",
            deleteAssetById: "DELETE FROM producer_assets WHERE id = ?",
            insertOutputRecord: "INSERT INTO producer_output_records (\n    id, model_filename, asset_id, name, saved, created_at, updated_at\n) VALUES (\n    @id, @model_filename, @asset_id, @name, @saved, @created_at, @updated_at\n)\n",
            getOutputRecordById: "SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,\n       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes\nFROM producer_output_records r\nJOIN producer_assets a ON a.id = r.asset_id\nWHERE r.id = ?\nLIMIT 1\n",
            listOutputRecords: "SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,\n       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes\nFROM producer_output_records r\nJOIN producer_assets a ON a.id = r.asset_id\nORDER BY r.updated_at DESC\n",
            listOutputRecordsByModel: "SELECT r.id, r.model_filename, r.asset_id, r.name, r.saved, r.created_at, r.updated_at,\n       a.mime_type, a.width, a.height, a.duration_sec, a.size_bytes\nFROM producer_output_records r\nJOIN producer_assets a ON a.id = r.asset_id\nWHERE r.model_filename = ?\nORDER BY r.updated_at DESC\n",
            updateOutputRecordSave: "UPDATE producer_output_records\nSET saved = @saved, updated_at = @updated_at\nWHERE id = @id\n",
            deleteOutputRecordById: "DELETE FROM producer_output_records WHERE id = ?"
        }
    });
};
