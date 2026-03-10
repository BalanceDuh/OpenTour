# OT_TourLoader Implementation Requirements

This document is the canonical implementation requirement list for `OT_TourLoader`.

## Scope And Module Position

1. Module name is fixed as `OT_TourLoader`, located at `supersplat/src/opentour/OT_TourLoader`.
2. Module target is an independent panel capability with minimal compile boundary, at the same level as `OT_ModelLoader`.
3. Panel title is `Tour Loader`.
4. Usage prerequisite is that the model is already loaded and `model_filename` is available.
5. If model is not loaded, panel must show a blocking hint and disable save/export/record actions.

## Panel Flow And UX

6. Main flow has 5 fixed steps: Step1 map views, Step2 POI edit, Step3 Run and Record, Step4 content generation, Step5 CSV export/import.
7. Panel must expose status text at all times (Ready/Busy/Error/Done).
8. Panel position can be dragged without changing business data.

## Step1: TopView + FrontView Interaction

9. Step1 must load and show both `TopView` and `FrontView`.
10. `TopView` is used for 2D placement and `yaw` drag interactions.
11. `FrontView` is used for `pitch` drag interactions.
12. Left click on empty area creates a new POI.
13. Left click on an existing POI selects that POI.
14. Right-click drag performs map panning.
15. View tools include zoom in, zoom out, and reset/center.
16. Newly created POI becomes selected immediately.
17. Any yaw/pitch change updates UI immediately and enters persistence queue.

## Step2: POI Selection And Editing

18. Step2 provides POI selector (list or dropdown).
19. `poi_name` is editable.
20. `Update to Current View` writes current camera pose into selected POI.
21. `target_yaw` supports direct input/adjustment.
22. `target_pitch` supports direct input/adjustment.
23. Selected POI can be deleted.
24. Deleting POI must reindex `sort_order`.

## Step3: Run And Record

25. Step3 provides `Run and Record` action.
26. Recording traversal follows `sort_order`.
27. Traversal movement is smooth interpolation, not teleport.
28. Screenshot is captured automatically at each POI.
29. Screenshot capture includes retry mechanism.
30. POI list remains visible during recording.
31. POI list shows thumbnail per POI.
32. POI list shows capture state per POI (not recorded/success/failed).
33. Recording speed multiplier is supported (for example 0.5x/1x/1.5x/2x).

## Step4: Content Generation

34. Every POI row has an individual `Generate Content` button.
35. Per-POI generation only updates the selected row.
36. A global `Batch Generate` button generates content for all POIs.
37. Batch generation must show progress (current index/total).
38. Failure on one POI does not block remaining POIs.
39. On success, persist `content`, `tts_lang`, and `content_updated_at`.

## Step5: CSV Export And Import

40. Step5 supports standard Tour CSV export.
41. Export must include both `poi_id` and `poi_name`.
42. Export must not include `coord_system` and `up_axis`.
43. Export field order is fixed.
44. Export field order:

```csv
version,seq,action,audio_mode,poi_id,poi_name,target_x,target_y,target_z,target_yaw,target_pitch,move_speed_mps,dwell_ms,content,tts_lang,model_filename,eye_height_m
```

45. Step5 supports CSV import.
46. Import prefers merge/update by `poi_id`; `poi_name` updates display text.
47. If CSV row has no `poi_id`, auto-generate `poi_id`.

## Data Model And Persistence

48. Database target table is `model_pois`.
49. Primary key is fixed as `(model_filename, poi_id)`.
50. Required fields include: `model_filename, poi_id, poi_name, sort_order`.
51. Required fields include: `target_x, target_y, target_z`.
52. Required fields include: `target_yaw, target_pitch`.
53. Required fields include: `move_speed_mps, dwell_ms`.
54. Required fields include: `content, tts_lang`.
55. Required fields include: `screenshot_data_url, screenshot_updated_at, content_updated_at, updated_at`.
56. Table includes `screenshot_blob` (`BLOB`).
57. Table includes `screenshot_blob_mime` (`TEXT`).
58. Screenshot persistence writes both `screenshot_data_url` and blob representation.
59. Screenshot read path prefers data URL; if absent, reconstruct from blob + mime.

## Identity And Reliability Rules

60. `poi_id` is stable business identity and must not change when `poi_name` changes.
61. `poi_name` is display/narration text and is not a unique key.
62. New POIs require low-collision ID generation strategy (for example uuid or timestamp + random).
63. Closing and reopening panel must restore latest persisted state.
64. Any step failure must show clear error and must not clear existing data.
65. Busy operations must disable conflicting actions.
66. Key operations must emit debug logs for diagnosis.
67. Field source of truth is `OT_TL_FieldStandard.ts`.
68. CSV export logic should reference field constants from that standard file, not hard-coded duplicates.
69. Server/persistence mappings must align with that standard file.

## Confirmed Decisions (User Confirmed)

70. CSV field order in item 44 is confirmed.
71. Missing `poi_id` on CSV import must auto-generate `poi_id`.
72. `action` is the visual/state track and speech runs in parallel through `content`:
    - Allowed actions: `MOVE`, `LOOK`, `PAUSE`, `EMPHASIZE`, `END`.
    - Any action row may speak if `content` is non-empty.
    - If `content` is empty, that row performs action only.
    - `EMPHASIZE` is a short emphasis beat (camera micro-motion/hold) using existing row params.
73. `audio_mode` is confirmed as:
    - `BLOCKING`: if the row has `content`, speech must finish before advancing to next row.
    - `INTERRUPTIBLE`: if the row has `content`, speech may be interrupted and can continue/resume.
    - If `content` is empty, `audio_mode` is ignored.
74. Screenshot format is PNG.
75. Batch generation must use streaming model calls, stream input/output to debug window, support stop in the middle, and support continue/resume.

## Execution Semantics For 72/73

- Action track and speech track are parallel.
- Action track always follows `seq` order.
- Speech starts only when `content` is non-empty.
- For `BLOCKING`, speech completion gates row advance.
- For `INTERRUPTIBLE`, speech interruption is allowed and continue/resume must be supported.
