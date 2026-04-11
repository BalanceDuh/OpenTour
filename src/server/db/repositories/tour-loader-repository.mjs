import { join } from 'node:path';

import { getEnv } from '../../config/env.mjs';
import { openSqliteDatabase } from '../sqlite/client.mjs';
import { createSqliteStatementRepository } from './statement-repository.mjs';

export const createTourLoaderRepository = (service = 'ot-tour-loader') => {
    const { dataDir } = getEnv();
    const db = openSqliteDatabase(join(dataDir, 'ot-tour-loader.db'));
    db.exec("CREATE TABLE IF NOT EXISTS model_poi_profiles (\n    model_filename TEXT PRIMARY KEY,\n    eye_height_m REAL NOT NULL,\n    updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS model_pois (\n    model_filename TEXT NOT NULL,\n    poi_id TEXT NOT NULL,\n    poi_name TEXT NOT NULL,\n    sort_order INTEGER NOT NULL,\n    target_x REAL NOT NULL,\n    target_y REAL NOT NULL,\n    target_z REAL NOT NULL,\n    target_yaw REAL NOT NULL,\n    target_pitch REAL NOT NULL,\n    target_fov REAL NOT NULL DEFAULT 60,\n    move_speed_mps REAL NOT NULL,\n    dwell_ms INTEGER NOT NULL,\n    content TEXT NOT NULL,\n    tts_lang TEXT NOT NULL,\n    prompt_template TEXT,\n    screenshot_data_url TEXT,\n    screenshot_blob BLOB,\n    screenshot_blob_mime TEXT,\n    screenshot_updated_at TEXT,\n    content_updated_at TEXT,\n    prompt_updated_at TEXT,\n    updated_at TEXT NOT NULL,\n    PRIMARY KEY (model_filename, poi_id)\n);\n\nCREATE TABLE IF NOT EXISTS model_poi_hotspots (\n    model_filename TEXT NOT NULL,\n    poi_id TEXT NOT NULL,\n    hotspot_id TEXT NOT NULL,\n    title TEXT NOT NULL,\n    sort_order INTEGER NOT NULL,\n    enabled INTEGER NOT NULL DEFAULT 1,\n    trigger_mode TEXT NOT NULL,\n    delay_ms INTEGER NOT NULL DEFAULT 0,\n    payload_type TEXT NOT NULL,\n    display_mode TEXT NOT NULL,\n    region_x REAL NOT NULL,\n    region_y REAL NOT NULL,\n    region_width REAL NOT NULL,\n    region_height REAL NOT NULL,\n    media_src TEXT,\n    caption TEXT,\n    tts_text TEXT,\n    confirm_message TEXT,\n    confirm_confirm_text TEXT,\n    confirm_cancel_text TEXT,\n    anchor_world_x REAL,\n    anchor_world_y REAL,\n    anchor_world_z REAL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    PRIMARY KEY (model_filename, poi_id, hotspot_id)\n);\n\nCREATE INDEX IF NOT EXISTS idx_model_poi_hotspots_model_poi_sort\nON model_poi_hotspots (model_filename, poi_id, sort_order);\n\nCREATE TABLE IF NOT EXISTS model_llm_configs (\n    model_filename TEXT PRIMARY KEY,\n    llm_model_name TEXT NOT NULL,\n    llm_api_key TEXT NOT NULL,\n    selected_provider TEXT,\n    gemini_model_name TEXT,\n    gemini_api_key TEXT,\n    qwen_model_name TEXT,\n    qwen_api_key TEXT,\n    prompt_template TEXT,\n    csv_prompt_template TEXT,\n    move_prompt_template TEXT,\n    updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS model_prompt_configs (\n    model_filename TEXT PRIMARY KEY,\n    prompt_template TEXT,\n    csv_prompt_template TEXT,\n    move_prompt_template TEXT,\n    updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS model_csv_versions (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    model_filename TEXT NOT NULL,\n    version_no INTEGER NOT NULL,\n    status TEXT NOT NULL,\n    source TEXT NOT NULL,\n    csv_text TEXT NOT NULL,\n    llm_model TEXT,\n    csv_prompt_template TEXT,\n    move_prompt_template TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    confirmed_at TEXT,\n    UNIQUE(model_filename, version_no)\n);\n\nCREATE INDEX IF NOT EXISTS idx_model_csv_versions_model_updated\nON model_csv_versions (model_filename, updated_at DESC);\n\nCREATE TABLE IF NOT EXISTS model_cinematic_versions (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    model_filename TEXT NOT NULL,\n    version_no INTEGER NOT NULL,\n    status TEXT NOT NULL,\n    source TEXT NOT NULL,\n    simple_prompt TEXT,\n    planner_prompt TEXT,\n    scene_description TEXT,\n    story_background TEXT,\n    style_text TEXT,\n    target_duration_sec REAL,\n    selected_poi_ids_json TEXT,\n    plan_json TEXT,\n    csv_text TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    confirmed_at TEXT,\n    UNIQUE(model_filename, version_no)\n);\n\nCREATE INDEX IF NOT EXISTS idx_model_cinematic_versions_model_updated\nON model_cinematic_versions (model_filename, updated_at DESC);\n\nCREATE TABLE IF NOT EXISTS global_tts_configs (\n    config_key TEXT PRIMARY KEY,\n    provider TEXT NOT NULL,\n    tts_model TEXT NOT NULL,\n    tts_voice TEXT NOT NULL,\n    api_key TEXT NOT NULL,\n    audio_format TEXT NOT NULL,\n    updated_at TEXT NOT NULL\n);\n");
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN prompt_template TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN csv_prompt_template TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN move_prompt_template TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_pois ADD COLUMN target_fov REAL NOT NULL DEFAULT 60");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_pois ADD COLUMN prompt_template TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_pois ADD COLUMN prompt_updated_at TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN selected_provider TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN gemini_model_name TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN gemini_api_key TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN qwen_model_name TEXT");
    } catch {
        // already exists
    }
    try {
        db.exec("ALTER TABLE model_llm_configs ADD COLUMN qwen_api_key TEXT");
    } catch {
        // already exists
    }

    return createSqliteStatementRepository({
        service,
        db,
        statements: {
            upsertProfile: "INSERT INTO model_poi_profiles (model_filename, eye_height_m, updated_at)\nVALUES (@model_filename, @eye_height_m, @updated_at)\nON CONFLICT(model_filename) DO UPDATE SET\n    eye_height_m = excluded.eye_height_m,\n    updated_at = excluded.updated_at\n",
            upsertPoi: "INSERT INTO model_pois (\n    model_filename, poi_id, poi_name, sort_order,\n    target_x, target_y, target_z,\n    target_yaw, target_pitch, target_fov,\n    move_speed_mps, dwell_ms,\n    content, tts_lang, prompt_template,\n    screenshot_data_url, screenshot_blob, screenshot_blob_mime,\n    screenshot_updated_at, content_updated_at, prompt_updated_at, updated_at\n) VALUES (\n    @model_filename, @poi_id, @poi_name, @sort_order,\n    @target_x, @target_y, @target_z,\n    @target_yaw, @target_pitch, @target_fov,\n    @move_speed_mps, @dwell_ms,\n    @content, @tts_lang, @prompt_template,\n    @screenshot_data_url, @screenshot_blob, @screenshot_blob_mime,\n    @screenshot_updated_at, @content_updated_at, @prompt_updated_at, @updated_at\n)\nON CONFLICT(model_filename, poi_id) DO UPDATE SET\n    poi_name = excluded.poi_name,\n    sort_order = excluded.sort_order,\n    target_x = excluded.target_x,\n    target_y = excluded.target_y,\n    target_z = excluded.target_z,\n    target_yaw = excluded.target_yaw,\n    target_pitch = excluded.target_pitch,\n    target_fov = excluded.target_fov,\n    move_speed_mps = excluded.move_speed_mps,\n    dwell_ms = excluded.dwell_ms,\n    content = excluded.content,\n    tts_lang = excluded.tts_lang,\n    prompt_template = excluded.prompt_template,\n    screenshot_data_url = excluded.screenshot_data_url,\n    screenshot_blob = excluded.screenshot_blob,\n    screenshot_blob_mime = excluded.screenshot_blob_mime,\n    screenshot_updated_at = excluded.screenshot_updated_at,\n    content_updated_at = excluded.content_updated_at,\n    prompt_updated_at = excluded.prompt_updated_at,\n    updated_at = excluded.updated_at\n",
            getProfile: "SELECT model_filename, eye_height_m, updated_at FROM model_poi_profiles WHERE model_filename = ?",
            getPois: "SELECT\n    model_filename, poi_id, poi_name, sort_order,\n    target_x, target_y, target_z,\n    target_yaw, target_pitch, target_fov,\n    move_speed_mps, dwell_ms,\n    content, tts_lang, prompt_template,\n    screenshot_data_url, screenshot_blob, screenshot_blob_mime,\n    screenshot_updated_at, content_updated_at, prompt_updated_at, updated_at\nFROM model_pois\nWHERE model_filename = ?\nORDER BY sort_order ASC, poi_id ASC\n",
            getPoiById: "SELECT\n    model_filename, poi_id, poi_name, sort_order,\n    target_x, target_y, target_z,\n    target_yaw, target_pitch, target_fov,\n    move_speed_mps, dwell_ms,\n    content, tts_lang, prompt_template,\n    screenshot_data_url, screenshot_blob, screenshot_blob_mime,\n    screenshot_updated_at, content_updated_at, prompt_updated_at, updated_at\nFROM model_pois\nWHERE model_filename = ? AND poi_id = ?\nLIMIT 1\n",
            getHotspots: "SELECT\n    model_filename, poi_id, hotspot_id, title, sort_order, enabled,\n    trigger_mode, delay_ms, payload_type, display_mode,\n    region_x, region_y, region_width, region_height,\n    media_src, caption, tts_text,\n    confirm_message, confirm_confirm_text, confirm_cancel_text,\n    anchor_world_x, anchor_world_y, anchor_world_z,\n    created_at, updated_at\nFROM model_poi_hotspots\nWHERE model_filename = ?\nORDER BY poi_id ASC, sort_order ASC, hotspot_id ASC\n",
            clearModelHotspots: "DELETE FROM model_poi_hotspots WHERE model_filename = ?",
            clearPoiHotspots: "DELETE FROM model_poi_hotspots WHERE model_filename = ? AND poi_id = ?",
            upsertHotspot: "INSERT INTO model_poi_hotspots (\n    model_filename, poi_id, hotspot_id, title, sort_order, enabled,\n    trigger_mode, delay_ms, payload_type, display_mode,\n    region_x, region_y, region_width, region_height,\n    media_src, caption, tts_text,\n    confirm_message, confirm_confirm_text, confirm_cancel_text,\n    anchor_world_x, anchor_world_y, anchor_world_z,\n    created_at, updated_at\n) VALUES (\n    @model_filename, @poi_id, @hotspot_id, @title, @sort_order, @enabled,\n    @trigger_mode, @delay_ms, @payload_type, @display_mode,\n    @region_x, @region_y, @region_width, @region_height,\n    @media_src, @caption, @tts_text,\n    @confirm_message, @confirm_confirm_text, @confirm_cancel_text,\n    @anchor_world_x, @anchor_world_y, @anchor_world_z,\n    @created_at, @updated_at\n)\nON CONFLICT(model_filename, poi_id, hotspot_id) DO UPDATE SET\n    title = excluded.title,\n    sort_order = excluded.sort_order,\n    enabled = excluded.enabled,\n    trigger_mode = excluded.trigger_mode,\n    delay_ms = excluded.delay_ms,\n    payload_type = excluded.payload_type,\n    display_mode = excluded.display_mode,\n    region_x = excluded.region_x,\n    region_y = excluded.region_y,\n    region_width = excluded.region_width,\n    region_height = excluded.region_height,\n    media_src = excluded.media_src,\n    caption = excluded.caption,\n    tts_text = excluded.tts_text,\n    confirm_message = excluded.confirm_message,\n    confirm_confirm_text = excluded.confirm_confirm_text,\n    confirm_cancel_text = excluded.confirm_cancel_text,\n    anchor_world_x = excluded.anchor_world_x,\n    anchor_world_y = excluded.anchor_world_y,\n    anchor_world_z = excluded.anchor_world_z,\n    updated_at = excluded.updated_at\n",
            clearModelPois: "DELETE FROM model_pois WHERE model_filename = ?",
            deletePoi: "DELETE FROM model_pois WHERE model_filename = ? AND poi_id = ?",
            upsertLlmConfig: "INSERT INTO model_llm_configs (\n    model_filename,\n    llm_model_name,\n    llm_api_key,\n    selected_provider,\n    gemini_model_name,\n    gemini_api_key,\n    qwen_model_name,\n    qwen_api_key,\n    prompt_template,\n    csv_prompt_template,\n    move_prompt_template,\n    updated_at\n)\nVALUES (\n    @model_filename,\n    @llm_model_name,\n    @llm_api_key,\n    @selected_provider,\n    @gemini_model_name,\n    @gemini_api_key,\n    @qwen_model_name,\n    @qwen_api_key,\n    @prompt_template,\n    @csv_prompt_template,\n    @move_prompt_template,\n    @updated_at\n)\nON CONFLICT(model_filename) DO UPDATE SET\n    llm_model_name = excluded.llm_model_name,\n    llm_api_key = excluded.llm_api_key,\n    selected_provider = excluded.selected_provider,\n    gemini_model_name = excluded.gemini_model_name,\n    gemini_api_key = excluded.gemini_api_key,\n    qwen_model_name = excluded.qwen_model_name,\n    qwen_api_key = excluded.qwen_api_key,\n    prompt_template = excluded.prompt_template,\n    csv_prompt_template = excluded.csv_prompt_template,\n    move_prompt_template = excluded.move_prompt_template,\n    updated_at = excluded.updated_at\n",
            listLegacyLlmPromptRows: "SELECT model_filename, prompt_template, csv_prompt_template, move_prompt_template, updated_at FROM model_llm_configs WHERE model_filename <> ?",
            getLlmConfig: "SELECT model_filename, llm_model_name, llm_api_key, selected_provider, gemini_model_name, gemini_api_key, qwen_model_name, qwen_api_key, prompt_template, csv_prompt_template, move_prompt_template, updated_at\nFROM model_llm_configs\nWHERE model_filename = ?\n",
            getLatestLlmConfig: "SELECT model_filename, llm_model_name, llm_api_key, selected_provider, gemini_model_name, gemini_api_key, qwen_model_name, qwen_api_key, prompt_template, csv_prompt_template, move_prompt_template, updated_at\nFROM model_llm_configs\nORDER BY updated_at DESC\nLIMIT 1\n",
            upsertGlobalLlmConfig: "INSERT INTO model_llm_configs (\n    model_filename,\n    llm_model_name,\n    llm_api_key,\n    selected_provider,\n    gemini_model_name,\n    gemini_api_key,\n    qwen_model_name,\n    qwen_api_key,\n    prompt_template,\n    csv_prompt_template,\n    move_prompt_template,\n    updated_at\n) VALUES (\n    @model_filename,\n    @llm_model_name,\n    @llm_api_key,\n    @selected_provider,\n    @gemini_model_name,\n    @gemini_api_key,\n    @qwen_model_name,\n    @qwen_api_key,\n    @prompt_template,\n    @csv_prompt_template,\n    @move_prompt_template,\n    @updated_at\n)\nON CONFLICT(model_filename) DO UPDATE SET\n    llm_model_name = excluded.llm_model_name,\n    llm_api_key = excluded.llm_api_key,\n    selected_provider = excluded.selected_provider,\n    gemini_model_name = excluded.gemini_model_name,\n    gemini_api_key = excluded.gemini_api_key,\n    qwen_model_name = excluded.qwen_model_name,\n    qwen_api_key = excluded.qwen_api_key,\n    updated_at = excluded.updated_at\n",
            deleteNonGlobalLlmConfigs: "DELETE FROM model_llm_configs WHERE model_filename <> ?",
            getGlobalTtsConfig: "SELECT config_key, provider, tts_model, tts_voice, api_key, audio_format, updated_at\nFROM global_tts_configs\nWHERE config_key = 'aliyun'\n",
            upsertGlobalTtsConfig: "INSERT INTO global_tts_configs (\n    config_key,\n    provider,\n    tts_model,\n    tts_voice,\n    api_key,\n    audio_format,\n    updated_at\n) VALUES (\n    'aliyun',\n    'aliyun',\n    @tts_model,\n    @tts_voice,\n    @api_key,\n    @audio_format,\n    @updated_at\n)\nON CONFLICT(config_key) DO UPDATE SET\n    provider = excluded.provider,\n    tts_model = excluded.tts_model,\n    tts_voice = excluded.tts_voice,\n    api_key = excluded.api_key,\n    audio_format = excluded.audio_format,\n    updated_at = excluded.updated_at\n",
            upsertPromptConfig: "INSERT INTO model_prompt_configs (\n    model_filename,\n    prompt_template,\n    csv_prompt_template,\n    move_prompt_template,\n    updated_at\n) VALUES (\n    @model_filename,\n    @prompt_template,\n    @csv_prompt_template,\n    @move_prompt_template,\n    @updated_at\n)\nON CONFLICT(model_filename) DO UPDATE SET\n    prompt_template = excluded.prompt_template,\n    csv_prompt_template = excluded.csv_prompt_template,\n    move_prompt_template = excluded.move_prompt_template,\n    updated_at = excluded.updated_at\n",
            getPromptConfig: "SELECT model_filename, prompt_template, csv_prompt_template, move_prompt_template, updated_at\nFROM model_prompt_configs\nWHERE model_filename = ?\n",
            getCsvVersionMaxNo: "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version_no\nFROM model_csv_versions\nWHERE model_filename = ?\n",
            insertCsvVersion: "INSERT INTO model_csv_versions (\n    model_filename,\n    version_no,\n    status,\n    source,\n    csv_text,\n    llm_model,\n    csv_prompt_template,\n    move_prompt_template,\n    created_at,\n    updated_at,\n    confirmed_at\n) VALUES (\n    @model_filename,\n    @version_no,\n    @status,\n    @source,\n    @csv_text,\n    @llm_model,\n    @csv_prompt_template,\n    @move_prompt_template,\n    @created_at,\n    @updated_at,\n    @confirmed_at\n)\n",
            getCsvVersionList: "SELECT\n    id,\n    model_filename,\n    version_no,\n    status,\n    source,\n    llm_model,\n    created_at,\n    updated_at,\n    confirmed_at,\n    LENGTH(csv_text) AS csv_chars\nFROM model_csv_versions\nWHERE model_filename = ?\nORDER BY version_no DESC, id DESC\n",
            getCsvVersionById: "SELECT\n    id,\n    model_filename,\n    version_no,\n    status,\n    source,\n    csv_text,\n    llm_model,\n    csv_prompt_template,\n    move_prompt_template,\n    created_at,\n    updated_at,\n    confirmed_at\nFROM model_csv_versions\nWHERE id = ? AND model_filename = ?\n",
            updateCsvVersion: "UPDATE model_csv_versions\nSET csv_text = @csv_text,\n    updated_at = @updated_at,\n    llm_model = COALESCE(@llm_model, llm_model),\n    csv_prompt_template = COALESCE(@csv_prompt_template, csv_prompt_template),\n    move_prompt_template = COALESCE(@move_prompt_template, move_prompt_template)\nWHERE id = @id AND model_filename = @model_filename\n",
            confirmCsvVersion: "UPDATE model_csv_versions\nSET status = 'confirmed',\n    confirmed_at = @confirmed_at,\n    updated_at = @updated_at,\n    csv_text = @csv_text\nWHERE id = @id AND model_filename = @model_filename\n",
            deleteCsvVersion: "DELETE FROM model_csv_versions WHERE id = ? AND model_filename = ?",
            getCinematicVersionMaxNo: "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version_no\nFROM model_cinematic_versions\nWHERE model_filename = ?\n",
            insertCinematicVersion: "INSERT INTO model_cinematic_versions (\n    model_filename,\n    version_no,\n    status,\n    source,\n    simple_prompt,\n    planner_prompt,\n    scene_description,\n    story_background,\n    style_text,\n    target_duration_sec,\n    selected_poi_ids_json,\n    plan_json,\n    csv_text,\n    created_at,\n    updated_at,\n    confirmed_at\n) VALUES (\n    @model_filename,\n    @version_no,\n    @status,\n    @source,\n    @simple_prompt,\n    @planner_prompt,\n    @scene_description,\n    @story_background,\n    @style_text,\n    @target_duration_sec,\n    @selected_poi_ids_json,\n    @plan_json,\n    @csv_text,\n    @created_at,\n    @updated_at,\n    @confirmed_at\n)\n",
            getCinematicVersionList: "SELECT\n    id,\n    model_filename,\n    version_no,\n    status,\n    source,\n    created_at,\n    updated_at,\n    confirmed_at,\n    LENGTH(plan_json) AS plan_chars\nFROM model_cinematic_versions\nWHERE model_filename = ?\nORDER BY version_no DESC, id DESC\n",
            getCinematicVersionById: "SELECT\n    id,\n    model_filename,\n    version_no,\n    status,\n    source,\n    simple_prompt,\n    planner_prompt,\n    scene_description,\n    story_background,\n    style_text,\n    target_duration_sec,\n    selected_poi_ids_json,\n    plan_json,\n    csv_text,\n    created_at,\n    updated_at,\n    confirmed_at\nFROM model_cinematic_versions\nWHERE id = ? AND model_filename = ?\n",
            listNonEmptyCinematicPlans: "SELECT id, plan_json FROM model_cinematic_versions WHERE plan_json IS NOT NULL AND plan_json <> ''",
            updateCinematicPlanJson: "UPDATE model_cinematic_versions SET plan_json = @plan_json, updated_at = @updated_at WHERE id = @id",
            updateCinematicVersion: "UPDATE model_cinematic_versions\nSET status = @status,\n    source = @source,\n    simple_prompt = @simple_prompt,\n    planner_prompt = @planner_prompt,\n    scene_description = @scene_description,\n    story_background = @story_background,\n    style_text = @style_text,\n    target_duration_sec = @target_duration_sec,\n    selected_poi_ids_json = @selected_poi_ids_json,\n    plan_json = @plan_json,\n    csv_text = @csv_text,\n    updated_at = @updated_at,\n    confirmed_at = @confirmed_at\nWHERE id = @id AND model_filename = @model_filename\n",
            deleteCinematicVersion: "DELETE FROM model_cinematic_versions WHERE id = ? AND model_filename = ?"
        }
    });
};
