# OT_TourLoader Frontend-Backend Contract

This document defines the isolated implementation target, system background, and full API contract for `OT_TourLoader`.

## 1) Goals

- Build `OT_TourLoader` as a fully isolated module under `src/opentour/OT_TourLoader`.
- Keep compile boundary minimal: independent build artifact, independent dev start, independent server.
- Keep runtime boundary clear: panel UI and API layer are decoupled.
- Support future autonomous usage via Chrome DevTools, Playwright, and LLM agents.
- Keep data contract stable for POI lifecycle, screenshot storage, streaming content generation, and CSV import/export.

## 2) Non-Goals

- No reuse of external OpenTour business modules.
- No dependency on existing workflow/calibration endpoints.
- No hidden coupling to non-`OT_TourLoader` state stores.

## 3) Background And Constraints

- The module serves Gaussian Splat POI authoring and guided tour scripting.
- Model is already loaded; `model_filename` is mandatory context.
- Coordinate-system fields are intentionally removed from exported CSV.
- Screenshot format is PNG.
- Content generation must be streaming, with stop and resume.

## 4) Isolation Requirements

- All frontend and backend source for this module must live under `src/opentour/OT_TourLoader`.
- Suggested layout:

```text
src/opentour/OT_TourLoader/
  frontend/
    index.ts
    panel.ts
    map-top-view.ts
    map-front-view.ts
    state.ts
    api-client.ts
    csv.ts
    debug-console.ts
  backend/
    server.ts
    routes.ts
    store.ts
    schema.sql
    csv-parser.ts
    csv-writer.ts
    llm-stream.ts
    jobs.ts
  shared/
    contracts.ts
    field-standard.ts
  OT_TL_FieldStandard.ts
  OT_TL_ImplementationRequirements.md
  OT_TL_FrontendBackendContract.md
```

- Independent compile/start requirements:
  - `build:ot-tour-loader`: compile frontend only for module artifact.
  - `build:ot-tour-loader:server`: compile backend only.
  - `develop:ot-tour-loader`: run module frontend watch + module backend server.
- Do not import existing wizard/model-loader/server route implementations.

## 5) Canonical Data Model

### 5.1 Table `model_pois`

Primary key:
- `(model_filename, poi_id)`

Fields:
- `model_filename`, `poi_id`, `poi_name`, `sort_order`
- `target_x`, `target_y`, `target_z`
- `target_yaw`, `target_pitch`
- `move_speed_mps`, `dwell_ms`
- `content`, `tts_lang`
- `screenshot_data_url`, `screenshot_blob`, `screenshot_blob_mime`
- `screenshot_updated_at`, `content_updated_at`, `updated_at`

Screenshot persistence:
- Store both `screenshot_data_url` and `screenshot_blob`/`screenshot_blob_mime`.
- Read path preference: `screenshot_data_url` first; fallback to reconstructed data URL from blob.

### 5.2 Action and Audio Semantics

- `action`: `MOVE | LOOK | PAUSE | EMPHASIZE | END`
- `audio_mode`: `BLOCKING | INTERRUPTIBLE`
- `content` is parallel speech track:
  - if `content` is non-empty, speech may run for that row.
  - if `content` is empty, row executes visual action only.
- `audio_mode` is effective only when `content` is non-empty.

## 6) CSV Contract

### 6.1 Export CSV Header (fixed order)

```csv
version,seq,action,audio_mode,poi_id,poi_name,target_x,target_y,target_z,target_yaw,target_pitch,move_speed_mps,dwell_ms,content,tts_lang,model_filename,eye_height_m
```

### 6.2 Import Rules

- `poi_id` missing -> auto-generate stable id.
- Merge/update by `poi_id`.
- `poi_name` updates display text.
- Unknown columns are ignored.

## 7) API Base

- Base path: `/api/ot-tour-loader`
- Content type: `application/json` unless otherwise specified.
- All requests requiring model context must include `modelFilename`.

## 8) Detailed API Contract

### 8.1 Health

#### `GET /api/ot-tour-loader/health`

Response:

```json
{
  "ok": true,
  "service": "ot-tour-loader",
  "version": "1.0.0"
}
```

### 8.2 Load Full State

#### `GET /api/ot-tour-loader/state?modelFilename=<name>`

Response:

```json
{
  "ok": true,
  "found": true,
  "modelFilename": "scene.ply",
  "profile": {
    "eyeHeightM": 1.65,
    "updatedAt": "2026-02-23T12:00:00.000Z"
  },
  "pois": [
    {
      "poiId": "poi_001",
      "poiName": "Lobby",
      "sortOrder": 0,
      "targetX": 1.2,
      "targetY": 0,
      "targetZ": -2.1,
      "targetYaw": 30,
      "targetPitch": -4,
      "moveSpeedMps": 0.8,
      "dwellMs": 1600,
      "content": "Welcome to the lobby.",
      "ttsLang": "en-US",
      "screenshotDataUrl": "data:image/png;base64,...",
      "screenshotUpdatedAt": "2026-02-23T12:01:00.000Z",
      "contentUpdatedAt": "2026-02-23T12:02:00.000Z",
      "updatedAt": "2026-02-23T12:02:00.000Z"
    }
  ]
}
```

### 8.3 Save Full State

#### `PUT /api/ot-tour-loader/state`

Request:

```json
{
  "modelFilename": "scene.ply",
  "profile": { "eyeHeightM": 1.65 },
  "pois": []
}
```

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "totalPois": 0,
  "updatedAt": "2026-02-23T12:00:00.000Z"
}
```

### 8.4 Create POI

#### `POST /api/ot-tour-loader/pois`

Request:

```json
{
  "modelFilename": "scene.ply",
  "poi": {
    "poiId": "",
    "poiName": "POI 1",
    "sortOrder": 0,
    "targetX": 0,
    "targetY": 0,
    "targetZ": 0,
    "targetYaw": 0,
    "targetPitch": 0,
    "moveSpeedMps": 0.8,
    "dwellMs": 1500,
    "content": "",
    "ttsLang": ""
  }
}
```

Rules:
- If `poi.poiId` is empty, server generates one.

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "poiId": "poi_9f1d4c",
  "updatedAt": "2026-02-23T12:10:00.000Z"
}
```

### 8.5 Update POI

#### `PATCH /api/ot-tour-loader/pois/:poiId`

Request:

```json
{
  "modelFilename": "scene.ply",
  "patch": {
    "poiName": "Entrance",
    "targetYaw": 22.5,
    "targetPitch": -3.2,
    "content": "We begin at the entrance.",
    "ttsLang": "en-US"
  }
}
```

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "poiId": "poi_9f1d4c",
  "updatedAt": "2026-02-23T12:12:00.000Z"
}
```

### 8.6 Delete POI

#### `DELETE /api/ot-tour-loader/pois/:poiId?modelFilename=<name>`

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "poiId": "poi_9f1d4c"
}
```

### 8.7 Save Screenshot

#### `POST /api/ot-tour-loader/pois/:poiId/screenshot`

Request:

```json
{
  "modelFilename": "scene.ply",
  "imageMime": "image/png",
  "screenshotDataUrl": "data:image/png;base64,..."
}
```

Behavior:
- Server decodes data URL and writes both `screenshot_data_url` and `screenshot_blob`.

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "poiId": "poi_001",
  "screenshotUpdatedAt": "2026-02-23T12:20:00.000Z"
}
```

### 8.8 CSV Export

#### `GET /api/ot-tour-loader/csv/export?modelFilename=<name>&kind=script_v2`

Response:
- `200 text/csv; charset=utf-8` with fixed header in section 6.1.

### 8.9 CSV Import

#### `POST /api/ot-tour-loader/csv/import`

Request:

```json
{
  "modelFilename": "scene.ply",
  "csvText": "version,seq,..."
}
```

Response:

```json
{
  "ok": true,
  "modelFilename": "scene.ply",
  "totalRows": 24,
  "imported": 24,
  "generatedPoiIds": 2,
  "updatedAt": "2026-02-23T12:30:00.000Z"
}
```

### 8.10 Start Content Generation Job

#### `POST /api/ot-tour-loader/content/jobs`

Request:

```json
{
  "modelFilename": "scene.ply",
  "mode": "single",
  "poiIds": ["poi_001"],
  "llm": {
    "provider": "gemini",
    "model": "gemini-3.0-pro",
    "apiKey": "***",
    "promptTemplate": "..."
  }
}
```

`mode` values:
- `single`
- `batch`

Response:

```json
{
  "ok": true,
  "jobId": "job_20260223_001",
  "status": "running"
}
```

### 8.11 Stream Job Events (SSE)

#### `GET /api/ot-tour-loader/content/jobs/:jobId/events`

SSE event types:
- `job.started`
- `poi.started`
- `poi.chunk`
- `poi.done`
- `poi.failed`
- `job.paused`
- `job.resumed`
- `job.done`
- `job.error`

Example event payload:

```json
{
  "jobId": "job_20260223_001",
  "poiId": "poi_001",
  "chunk": "The lobby opens with...",
  "index": 1,
  "total": 8,
  "ts": "2026-02-23T12:35:00.000Z"
}
```

### 8.12 Stop Job

#### `POST /api/ot-tour-loader/content/jobs/:jobId/stop`

Response:

```json
{
  "ok": true,
  "jobId": "job_20260223_001",
  "status": "paused"
}
```

### 8.13 Resume Job

#### `POST /api/ot-tour-loader/content/jobs/:jobId/resume`

Response:

```json
{
  "ok": true,
  "jobId": "job_20260223_001",
  "status": "running",
  "resumeFromIndex": 3
}
```

## 9) Debug Window Contract

Frontend debug panel must show:
- request summary (provider/model/poi count)
- streaming output chunks
- per-POI completion/failure
- stop/resume transitions
- final job summary

Minimum event object fields shown in debug UI:
- `jobId`, `event`, `poiId`, `index`, `total`, `message`, `ts`

## 10) Automation Readiness (DevTools / Playwright / LLM Agent)

- Every interactive UI control must have stable `data-testid`.
- Every step has deterministic state markers for assertion.
- API-first operations enable headless orchestration without UI.
- SSE stream events provide deterministic progress checkpoints for automated tests.

## 11) Error Contract

All error responses:

```json
{
  "ok": false,
  "error": {
    "code": "OT_TL_VALIDATION_ERROR",
    "message": "modelFilename required",
    "details": {}
  }
}
```

Suggested error codes:
- `OT_TL_VALIDATION_ERROR`
- `OT_TL_NOT_FOUND`
- `OT_TL_CONFLICT`
- `OT_TL_DB_ERROR`
- `OT_TL_LLM_ERROR`
- `OT_TL_JOB_STOPPED`

## 12) Versioning

- Contract version key: `ot_tour_loader_contract_version`.
- Initial value: `1.0.0`.
- Any CSV header change or API shape change requires version bump.
