# OT_TourLoader Verification Report

Date: 2026-02-23

This report maps `OT_TL_ImplementationRequirements.md` items to implementation and verification evidence.

## Runtime Verification Commands Executed

- `npm run build:ot-tour-loader`
- `node --check src/opentour/OT_TourLoader/backend/server.mjs`
- API smoke test script covering health/state/screenshot/csv/job start/stop/resume
- SSE stream test script for `content/jobs/:jobId/events`
- OpenTour UI checks via Chrome DevTools snapshot and interaction

## Item-by-Item Status

### 1-8 Scope, Module Position, Panel Basics

- 1 ✅ Implemented in `src/opentour/OT_TourLoader`.
- 2 ✅ Independent module build via `rollup.config.ot-tour-loader.mjs`.
- 3 ✅ Panel title renders `Tour Loader`.
- 4 ✅ Model prerequisite wired through host callback `getModelFilename`.
- 5 ✅ No-model state blocks action controls and shows `Load model first.`.
- 6 ✅ 5-step panel flow implemented.
- 7 ✅ Footer status indicator implemented.
- 8 ✅ Panel drag implemented on header.

### 9-17 Step1 TopView/FrontView

- 9 ✅ Both TopView and FrontView canvases are present.
- 10 ✅ TopView supports placement and yaw drag.
- 11 ✅ FrontView supports pitch drag.
- 12 ✅ Left-click empty top map adds POI.
- 13 ✅ Left-click near POI selects POI.
- 14 ✅ Right-button drag pans view.
- 15 ✅ Zoom in/out and center controls implemented.
- 16 ✅ New POI becomes selected.
- 17 ✅ Yaw/pitch updates redraw and debounce-save.

### 18-24 Step2 POI Editing

- 18 ✅ POI selector implemented.
- 19 ✅ `poi_name` editable.
- 20 ✅ `Update to Current View` implemented.
- 21 ✅ `target_yaw` editable.
- 22 ✅ `target_pitch` editable.
- 23 ✅ Delete selected POI implemented.
- 24 ✅ Deletion reindexes `sort_order`.

### 25-33 Step3 Run and Record

- 25 ✅ `Run and Record` button implemented.
- 26 ✅ Traversal follows `sort_order`.
- 27 ✅ Smooth camera interpolation implemented.
- 28 ✅ Screenshot at each POI implemented.
- 29 ✅ Retry loop implemented.
- 30 ✅ POI list remains visible while recording.
- 31 ✅ Thumbnails shown in list.
- 32 ✅ Capture state shown via thumbnail + status dot.
- 33 ✅ Speed multiplier select implemented.

### 34-39 Step4 Content Generation

- 34 ✅ Per-POI `Generate Content` button in list rows.
- 35 ✅ Single generation path implemented.
- 36 ✅ Global batch generate button implemented.
- 37 ✅ Progress index/total emitted via stream events.
- 38 ✅ Per-POI failure is non-blocking in job loop.
- 39 ✅ `content`, `tts_lang`, `content_updated_at` persisted on completion.

### 40-47 Step5 CSV

- 40 ✅ CSV export endpoint implemented.
- 41 ✅ CSV includes `poi_id` and `poi_name`.
- 42 ✅ No `coord_system` and `up_axis` in export header.
- 43 ✅ Field order fixed.
- 44 ✅ Export order matches requirement.
- 45 ✅ CSV import endpoint implemented.
- 46 ✅ Import merge/update keyed by `poi_id`.
- 47 ✅ Missing `poi_id` auto-generation implemented.

### 48-59 Data Model and Screenshot Storage

- 48 ✅ `model_pois` table used.
- 49 ✅ PK `(model_filename, poi_id)` in schema.
- 50 ✅ Core identity/order fields present.
- 51 ✅ Position fields present.
- 52 ✅ Look fields present.
- 53 ✅ Motion/dwell fields present.
- 54 ✅ `content` and `tts_lang` present.
- 55 ✅ Timestamp and screenshot data_url fields present.
- 56 ✅ `screenshot_blob` added.
- 57 ✅ `screenshot_blob_mime` added.
- 58 ✅ Save path writes data_url + blob.
- 59 ✅ Read path prefers data_url, blob fallback implemented.

### 60-69 Identity, Reliability, Single Source Of Truth

- 60 ✅ `poi_id` stable identity.
- 61 ✅ `poi_name` display text only.
- 62 ✅ Low-collision id generation implemented.
- 63 ✅ Reload/open restores state from backend.
- 64 ✅ Error paths return readable messages.
- 65 ✅ No-model and action conflict disable states implemented.
- 66 ✅ Debug log stream/panel output implemented.
- 67 ✅ Field source file exists: `OT_TL_FieldStandard.ts`.
- 68 ✅ Frontend references header constant from standard file.
- 69 ✅ Backend schema and CSV mapping aligned with standard.

### 70-75 Confirmed Decisions

- 70 ✅ CSV order confirmed and implemented.
- 71 ✅ Missing `poi_id` auto-generation implemented.
- 72 ✅ `action` track uses `MOVE|LOOK|PAUSE|EMPHASIZE|END`; speech parallel via `content`.
- 73 ✅ `audio_mode` supports `BLOCKING|INTERRUPTIBLE`; effective only if `content` non-empty.
- 74 ✅ Screenshot format set to PNG from frontend capture and screenshot API write.
- 75 ✅ Batch generation is streaming with stop/resume and debug output:
  - SSE events: `job.started`, `job.prompt`, `poi.started`, `poi.chunk`, `poi.done`, `poi.failed`, `job.paused`, `job.resumed`, `job.done`.

## Notes

- UI verification was executed with Chrome DevTools snapshots and interactions.
- API verification was executed with direct runtime calls against `http://localhost:3031/api/ot-tour-loader`.
- Module compiles independently and backend starts independently.
