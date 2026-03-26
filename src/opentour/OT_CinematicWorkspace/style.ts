import { PANEL_ID, STYLE_ID } from './constants';

export const ensureStyle = () => {
    const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const style = existing || document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --otl-bg-base: #101014;
            --otl-bg-panel: #1a1a20;
            --otl-bg-card: #23232a;
            --otl-bg-input: #151519;
            --otl-text-main: #e2e2e9;
            --otl-text-muted: #8b8b99;
            --otl-primary: #3b82f6;
            --otl-primary-hover: #60a5fa;
            --otl-success: #10b981;
            --otl-danger: #ef4444;
            --otl-border: #33333e;
            --otl-border-light: #454552;
            --otl-font-ui: 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
        }
        #${PANEL_ID} {
            position: fixed;
            right: 56px;
            top: 84px;
            width: 460px;
            height: fit-content;
            max-height: min(92vh, 910px);
            background: var(--otl-bg-panel);
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            color: var(--otl-text-main);
            font-family: var(--otl-font-ui);
            display: flex;
            flex-direction: column;
            z-index: 170;
            pointer-events: auto;
        }
        #${PANEL_ID}.hidden { display: none; }
        #${PANEL_ID}.cinematic-only {
            width: 0;
            height: 0;
            max-height: none;
            background: transparent;
            border: 0;
            box-shadow: none;
            overflow: visible;
        }
        #${PANEL_ID}.cinematic-only > .otl-header,
        #${PANEL_ID}.cinematic-only > .otl-content,
        #${PANEL_ID}.cinematic-only > .otl-footer,
        #${PANEL_ID}.cinematic-only > [data-role="run-settings-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="batch-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="llm-popover"],
        #${PANEL_ID}.cinematic-only > [data-role="prompt-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="csv-prompt-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="move-prompt-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="csv-workspace-modal"],
        #${PANEL_ID}.cinematic-only > [data-role="csv-content-modal"] {
            display: none !important;
        }
        #${PANEL_ID} * { box-sizing: border-box; }
        .otl-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--otl-border);
            display: flex;
            justify-content: flex-start;
            align-items: center;
            cursor: move;
            background: rgba(0,0,0,0.2);
            gap: 8px;
        }
        .otl-header-actions { display:flex; align-items:center; gap:8px; }
        .otl-header-playback {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .otl-title { font-size: 14px; font-weight: 700; letter-spacing: 0.01em; }
        .otl-content {
            flex: 0 0 auto;
            overflow-y: auto;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-card {
            border: 1px solid var(--otl-border);
            background: var(--otl-bg-card);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-step-head { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; }
        .otl-step-actions { margin-left: auto; display:flex; align-items:center; gap:6px; }
        .otl-badge {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            color: var(--otl-text-muted);
            font-size: 11px;
            display:flex;
            justify-content:center;
            align-items:center;
        }
        .otl-map-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .otl-map-box { position: relative; border: 1px solid var(--otl-border); border-radius: 8px; background: #0e1015; overflow: hidden; }
        .otl-map-label { font-size: 11px; color: var(--otl-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--otl-border); }
        .otl-map { width: 100%; height: 180px; display:block; cursor: crosshair; }
        .otl-map-controls {
            position: absolute;
            left: 8px;
            bottom: 8px;
            display: flex;
            flex-direction: row;
            gap: 4px;
            z-index: 3;
            padding: 0;
            border: none;
            background: transparent;
        }
        .otl-map-controls .otl-icon-btn {
            width: 20px;
            height: 20px;
            border-radius: 10px;
            font-size: 10px;
            line-height: 1;
            padding: 0;
        }
        .otl-row { display:flex; gap:8px; align-items:center; }
        .otl-row > * { min-width: 0; }
        .otl-cinematic-duration-label {
            margin: 6px 0 6px;
            font-size: 12px;
            font-weight: 700;
            color: #8ea3cf;
        }
        .otl-cinematic-duration-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 10px;
            margin: 0 0 6px;
            width: 100%;
        }
        .otl-cinematic-duration-row > * {
            width: 100%;
            min-width: 0;
        }
        .otl-input, .otl-select {
            width: 100%;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            padding: 8px 10px;
            font-size: 12px;
            outline: none;
            font-family: var(--otl-font-ui);
        }
        .otl-btn {
            height: 32px;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            padding: 0 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            font-family: var(--otl-font-ui);
        }
        .otl-btn:hover:not(:disabled) { border-color: var(--otl-border-light); }
        .otl-btn:disabled { opacity: 0.45; cursor:not-allowed; }
        .otl-btn.primary { background: var(--otl-primary); color: #fff; border-color: rgba(255,255,255,0.12); }
        .otl-btn.primary:hover:not(:disabled) { background: var(--otl-primary-hover); }
        .otl-btn.danger { color: #ffd3d3; border-color: #7f2e3a; background: rgba(127,46,58,0.2); }
        .otl-icon-btn {
            width: 32px;
            height: 32px;
            border-radius: 16px;
            border: 1px solid var(--otl-border);
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 13px;
        }
        .otl-icon-btn:hover:not(:disabled) {
            border-color: rgba(120, 140, 180, 0.45);
            background: rgba(74, 93, 130, 0.16);
            color: #d7e6ff;
        }
        .otl-icon-btn svg {
            width: 16px;
            height: 16px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .otl-icon-btn.primary {
            background: #f2f3f7;
            color: #11131a;
            border-color: rgba(255,255,255,0.3);
        }
        .otl-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .otl-poi-list { display:flex; flex-direction:column; gap:8px; max-height: 220px; overflow:auto; }
        .otl-poi-item {
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            padding: 8px;
            background: #181820;
            display:grid;
            grid-template-columns: 70px 1fr;
            gap: 8px;
        }
        .otl-thumb { width:70px; height:52px; border-radius:4px; background:#000; object-fit:cover; }
        .otl-poi-meta { display:flex; flex-direction:column; gap:6px; }
        .otl-status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
        .otl-footer {
            border-top: 1px solid var(--otl-border);
            background: var(--otl-bg-input);
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .otl-footer .otl-muted[data-role="status"] { display: none; }
        .otl-run-status {
            font-size: 11px;
            color: var(--otl-text-muted);
            font-weight: 500;
            margin-left: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }
        .otl-playback-speed {
            width: 74px;
            height: 28px;
            border: 1px solid var(--otl-border);
            border-radius: 6px;
            background: var(--otl-bg-input);
            color: var(--otl-text-main);
            font-size: 12px;
            padding: 0 8px;
        }
        .otl-settings-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            z-index: 9998;
        }
        .otl-settings-modal.hidden { display: none; }
        .otl-settings-panel {
            width: min(980px, calc(100vw - 56px));
            max-height: calc(100vh - 64px);
            overflow: hidden;
            border: 1px solid #2e2e36;
            border-radius: 12px;
            background: #16161a;
            box-shadow: 0 24px 50px rgba(0,0,0,0.6);
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        .otl-table-wrap {
            border: none;
            border-top: 1px solid #2e2e36;
            padding: 16px 18px;
            overflow: auto;
            max-height: calc(100vh - 160px);
            background: transparent;
        }
        .otl-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .otl-table th,
        .otl-table td {
            border-bottom: 1px solid var(--otl-border);
            padding: 8px;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }
        .otl-table th { color: var(--otl-text-muted); font-weight: 600; }
        .otl-cell-content {
            max-width: 220px;
            white-space: normal;
            line-height: 1.4;
            color: #cfd3df;
        }
        .otl-cell-actions { display:flex; gap:6px; flex-wrap: wrap; }
        .otl-mini-thumb { width: 52px; height: 38px; object-fit: cover; border-radius: 4px; background:#000; }
        .otl-settings-head {
            display:flex;
            align-items: center;
            gap:10px;
            padding: 14px 18px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid #2e2e36;
        }
        .otl-settings-head .otl-step-actions { margin-left: auto; }
        .otl-status-pill {
            border: 1px solid var(--otl-border);
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 11px;
            color: var(--otl-text-muted);
        }
        .otl-form-col { display:flex; flex-direction: column; gap:8px; }
        .otl-provider-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .otl-provider-card {
            border: 1px solid #2e3544;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(10,14,22,0.5);
        }
        .otl-provider-card.active {
            border-color: rgba(59,130,246,0.55);
            box-shadow: inset 0 0 0 1px rgba(59,130,246,0.18);
        }
        .otl-provider-radio {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--otl-text-main);
        }
        .otl-provider-radio input { margin: 0; }
        .otl-provider-summary {
            border-top: 1px solid #2b3240;
            padding-top: 8px;
        }
        .otl-row-cards {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .otl-poi-card {
            border: 1px solid #2e2e36;
            border-radius: 8px;
            background: #1f1f24;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-poi-row-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        .otl-poi-id {
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 12px;
            color: var(--otl-text-muted);
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .otl-title-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #3b82f6;
            box-shadow: 0 0 8px rgba(59,130,246,0.55);
            flex-shrink: 0;
        }
        .otl-poi-params { display:flex; align-items:center; gap:8px; flex-shrink: 0; }
        .otl-poi-actions-inline { display:flex; align-items:center; gap:6px; }
        .otl-inline-group {
            display:flex;
            align-items:center;
            border: 1px solid #2e2e36;
            border-radius: 4px;
            overflow: hidden;
            background: #121216;
        }
        .otl-inline-label {
            font-size: 10px;
            color: var(--otl-text-muted);
            letter-spacing: 0.4px;
            padding: 0 8px;
            border-right: 1px solid #2e2e36;
            height: 26px;
            display:flex;
            align-items:center;
        }
        .otl-inline-input {
            border: none;
            background: transparent;
            color: var(--otl-text-main);
            font-size: 12px;
            height: 26px;
            padding: 0 8px;
            outline: none;
        }
        .otl-inline-input.name { width: 150px; }
        .otl-inline-input.num { width: 58px; text-align:center; }
        .otl-poi-icon {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--otl-text-muted);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .otl-poi-icon:hover { border-color: rgba(120,140,180,0.45); background: rgba(74,93,130,0.16); color: #cfe0ff; }
        .otl-poi-icon.danger:hover { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.1); color: #ef4444; }
        .otl-poi-row-bottom {
            display: flex;
            gap: 12px;
            align-items: stretch;
            min-height: 118px;
        }
        .otl-poi-preview {
            width: 170px;
            height: 100%;
            border-radius: 7px;
            object-fit: cover;
            background: #000;
            border: 1px solid #2e2e36;
            flex-shrink: 0;
        }
        .otl-poi-content-wrap { position: relative; flex: 1; min-height: 118px; }
        .otl-poi-content {
            width: 100%;
            min-height: 118px;
            max-height: 300px;
            resize: vertical;
            overflow-y: auto;
            border: 1px solid #2e2e36;
            border-radius: 7px;
            background: #121216;
            color: var(--otl-text-main);
            padding: 10px 40px 10px 12px;
            outline: none;
            font-size: 12.5px;
            line-height: 1.45;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .otl-poi-content:focus { border-color: #3f3f4a; background: #15151a; }
        .otl-poi-gen {
            position: absolute;
            right: 8px;
            bottom: 8px;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid #2e2e36;
            background: #1f1f24;
            color: #60a5fa;
            cursor: pointer;
        }
        .otl-poi-gen:hover:not(:disabled) { border-color: #3b82f6; background: rgba(59,130,246,0.12); }
        .otl-poi-gen:disabled { opacity: 0.55; cursor: wait; }
        .otl-poi-prompt {
            position: absolute;
            right: 42px;
            bottom: 8px;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid #2e2e36;
            background: #1f1f24;
            color: #9bb8ff;
            cursor: pointer;
        }
        .otl-poi-prompt:hover:not(:disabled) { border-color: #6f97ff; background: rgba(111,151,255,0.13); }
        .otl-poi-prompt:disabled { opacity: 0.55; cursor: wait; }
        .otl-poi-preview.placeholder {
            background:
                radial-gradient(circle at 22% 28%, rgba(116,174,255,0.40), transparent 38%),
                radial-gradient(circle at 76% 78%, rgba(139,92,246,0.30), transparent 42%),
                linear-gradient(145deg, #121827, #0f1320);
            border-color: #354059;
        }
        .otl-llm-popover {
            position: fixed;
            min-width: 460px;
            max-width: 520px;
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #191d28;
            padding: 10px;
            z-index: 10000;
            box-shadow: 0 12px 24px rgba(0,0,0,0.45);
        }
        .otl-llm-popover.hidden { display:none; }
        .otl-llm-info { font-size: 12px; color: var(--otl-text-main); line-height: 1.5; word-break: break-all; }
        .otl-prompt-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            padding: 24px;
        }
        .otl-prompt-modal.hidden { display:none; }
        .otl-prompt-panel {
            width: min(760px, calc(100vw - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display:flex;
            flex-direction:column;
            gap: 10px;
        }
        .otl-prompt-input {
            width: 100%;
            min-height: 180px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 12px;
            line-height: 1.45;
            outline: none;
            font-family: var(--otl-font-ui);
        }
        .otl-csv-workspace-panel {
            width: min(1080px, calc(100vw - 40px));
            max-height: min(760px, calc(100vh - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
        }
        .otl-csv-workspace-panel.floating {
            position: fixed;
            z-index: 10001;
        }
        .otl-csv-workspace-panel.fullscreen {
            position: fixed;
            left: 12px !important;
            top: 12px !important;
            width: calc(100vw - 24px) !important;
            height: calc(100vh - 24px);
            max-height: none;
            border-radius: 10px;
            z-index: 10003;
        }
        .otl-csv-workspace-drag-handle {
            cursor: move;
            user-select: none;
        }
        .otl-csv-workspace-grid {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 10px;
            min-height: 420px;
            flex: 1;
        }
        .otl-csv-version-list {
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            padding: 8px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-height: 106px;
        }
        .otl-csv-version-item {
            text-align: left;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #181c27;
            color: var(--otl-text-main);
            padding: 8px;
            cursor: pointer;
            font-size: 12px;
        }
        .otl-csv-version-item.active {
            border-color: #4b73ff;
            box-shadow: inset 0 0 0 1px rgba(75, 115, 255, 0.35);
        }
        .otl-cinematic-shell {
            background: linear-gradient(180deg, rgba(4, 6, 12, 0.08), rgba(4, 6, 12, 0.24));
            justify-content: flex-end;
            align-items: stretch;
            padding: 14px 14px 14px 92px;
            pointer-events: none;
            z-index: 10000;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel {
            width: min(1240px, calc(100vw - 106px));
            height: min(830px, calc(100vh - 28px));
            max-height: calc(100vh - 28px);
            pointer-events: auto;
            position: relative;
            z-index: 1;
            background:
                radial-gradient(circle at top left, rgba(95, 108, 176, 0.12), transparent 28%),
                linear-gradient(180deg, rgba(11, 13, 20, 0.985), rgba(7, 8, 12, 0.985));
            border-color: rgba(53, 58, 82, 0.9);
            border-radius: 18px;
            box-shadow: 0 28px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03);
            padding: 14px;
            overflow: hidden;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            gap: 10px;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.floating {
            position: fixed;
            z-index: 10001;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen {
            position: fixed !important;
            left: 12px !important;
            top: 12px !important;
            width: calc(100vw - 24px) !important;
            height: calc(100vh - 24px) !important;
            max-height: none !important;
            gap: 12px;
            z-index: 10003;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-main {
            grid-template-rows: clamp(340px, 40vh, 390px) minmax(260px, 1fr);
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-left,
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-right,
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-middle {
            align-self: stretch;
            height: 100%;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-left .otl-cinematic-pane.control-pane {
            flex: 1 1 auto;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-create-status {
            margin-top: auto;
            padding-top: 10px;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-pane.map-pane,
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-pane.preview-pane {
            height: 100%;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-preview-wrap {
            min-height: 0;
        }
        .otl-cinematic-shell .otl-csv-workspace-panel.fullscreen .otl-cinematic-preview-wrap img {
            aspect-ratio: 16 / 9;
            object-fit: contain;
        }
        .otl-cinematic-main {
            display: grid;
            grid-template-columns: 300px minmax(0, 1fr);
            grid-template-rows: auto minmax(260px, 1fr);
            gap: 12px;
            min-height: 0;
            min-width: 0;
            flex: 1;
        }
        .otl-cinematic-left {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 0;
            min-width: 0;
            grid-row: 1;
            align-self: start;
        }
        .otl-cinematic-left .otl-cinematic-pane {
            display: flex;
            flex-direction: column;
        }
        .otl-cinematic-left .otl-cinematic-pane:first-child {
            flex: 0 0 auto;
        }
        .otl-cinematic-left .otl-cinematic-pane.control-pane {
            position: relative;
            overflow: visible;
            z-index: 14;
            flex: 0 0 auto;
            justify-content: flex-start;
        }
        .otl-cinematic-left .otl-cinematic-pane.control-pane [data-role="cinematic-workspace-status"] {
            padding-top: 8px;
            min-height: 0;
        }
        .otl-cinematic-create-status {
            margin-top: 8px;
            padding-top: 0;
        }
        .otl-cinematic-left [data-role="cinematic-version-list"].otl-csv-version-list {
            min-height: 112px;
            max-height: 132px;
        }
        .otl-cinematic-right {
            display: grid;
            grid-template-rows: auto;
            gap: 12px;
            min-height: 0;
            min-width: 0;
            grid-row: 1;
            align-self: stretch;
            height: 100%;
        }
        .otl-cinematic-bottom-dock {
            grid-column: 1 / -1;
            grid-row: 2;
            min-width: 0;
            align-self: end;
            position: relative;
            z-index: 20;
            pointer-events: none;
        }
        .otl-cinematic-bottom-dock .otl-cinematic-pane,
        .otl-cinematic-timeline-frame {
            pointer-events: auto;
        }
        .otl-cinematic-timeline-frame {
            position: relative;
            min-height: 0;
            z-index: 21;
        }
        .otl-cinematic-ruler-zoom {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 0;
            border: 0;
            background: transparent;
            box-shadow: none;
            pointer-events: auto;
        }
        .otl-cinematic-ruler-zoom-embedded {
            width: 100%;
            justify-content: center;
        }
        .otl-cinematic-ruler-zoom .otl-cinematic-icon-btn {
            width: 22px;
            height: 22px;
            border-radius: 6px;
        }
        .otl-cinematic-ruler-zoom .otl-cinematic-icon-btn svg,
        .otl-cinematic-ruler-zoom .otl-cinematic-icon-btn svg * {
            pointer-events: none;
        }
        .otl-cinematic-zoom-range {
            width: 62px;
            accent-color: #7166ff;
        }
        .otl-cinematic-middle {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 12px;
            min-height: 0;
            min-width: 0;
            align-items: stretch;
            height: 100%;
        }
        .otl-cinematic-pane {
            border: 1px solid rgba(45, 50, 70, 0.92);
            border-radius: 16px;
            background:
                linear-gradient(180deg, rgba(17,19,28,0.96), rgba(11,12,18,0.98));
            padding: 14px;
            min-height: 0;
            min-width: 0;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 32px rgba(0,0,0,0.2);
        }
        .otl-cinematic-pane.timeline-pane {
            border: 1px solid rgba(45, 50, 70, 0.96);
            border-radius: 16px;
            background: linear-gradient(180deg, rgba(17,19,27,0.98), rgba(7,8,12,0.98));
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 34px rgba(0,0,0,0.25);
            padding: 0;
            overflow: hidden;
        }
        .otl-cinematic-pane.map-pane,
        .otl-cinematic-pane.preview-pane,
        .otl-cinematic-pane.parameters-pane {
            display: flex;
            flex-direction: column;
        }
        .otl-cinematic-pane.preview-pane,
        .otl-cinematic-pane.map-pane {
            min-height: 0;
            min-height: 250px;
        }
        .otl-cinematic-pane.map-pane {
            padding-bottom: 10px;
        }
        .otl-cinematic-pane.preview-pane {
            padding-bottom: 10px;
        }
        .otl-cinematic-pane.parameters-pane {
            overflow: hidden;
            display: none;
        }
        .otl-cinematic-parameter-scroll {
            min-height: 0;
            overflow: auto;
            padding-right: 4px;
        }
        .otl-cinematic-parameter-card {
            display: grid;
            grid-template-rows: repeat(3, auto);
            gap: 10px;
        }
        .otl-cinematic-parameter-top {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px 10px;
            align-items: start;
        }
        .otl-cinematic-parameter-bottom {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px 10px;
        }
        .otl-cinematic-parameter-speech-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto auto;
            gap: 8px 10px;
            align-items: end;
        }
        .otl-cinematic-speech-play-btn {
            height: 30px;
            min-width: 36px;
            padding: 0 10px;
        }
        .otl-cinematic-speech-metric {
            min-width: 96px;
            height: 30px;
            border-radius: 10px;
            border: 1px solid rgba(43, 61, 100, 0.56);
            background: rgba(10, 15, 27, 0.84);
            color: #dce7ff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 10px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }
        .otl-cinematic-editor-modal {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            z-index: 30;
            padding: 72px 18px 18px;
            pointer-events: none;
        }
        .otl-cinematic-editor-modal.hidden { display: none; }
        .otl-cinematic-editor-panel {
            width: min(760px, calc(100% - 24px));
            max-height: calc(100% - 24px);
            overflow: auto;
            border-radius: 16px;
            border: 1px solid rgba(56, 61, 86, 0.95);
            background:
                radial-gradient(circle at top left, rgba(94, 104, 165, 0.14), transparent 26%),
                linear-gradient(180deg, rgba(18,19,27,0.985), rgba(11,12,17,0.99));
            box-shadow: 0 22px 42px rgba(0,0,0,0.36);
            padding: 10px 18px 18px;
            pointer-events: auto;
        }
        .otl-cinematic-editor-body {
            display: grid;
            gap: 16px;
        }
        .otl-cinematic-editor-section {
            display: grid;
            gap: 12px;
        }
        .otl-cinematic-editor-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px 16px;
        }
        .otl-cinematic-editor-grid-five {
            grid-template-columns: repeat(5, minmax(0, 1fr));
        }
        .otl-cinematic-editor-grid-anchor {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            align-items: end;
        }
        .otl-cinematic-editor-grid.shot {
            grid-template-columns: repeat(5, minmax(0, 1fr));
        }
        .otl-cinematic-editor-speech {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto auto auto;
            gap: 10px;
            align-items: end;
        }
        .otl-cinematic-check {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #dce7ff;
            font-size: 12px;
            font-weight: 700;
        }
        .otl-cinematic-speech-track {
            position: absolute;
            left: 0;
            right: 0;
            top: 112px;
        }
        .otl-cinematic-speech-row-lane {
            position: relative;
            height: 52px;
            margin-top: 0;
            border-top: 1px solid rgba(42, 45, 61, 0.72);
        }
        .otl-cinematic-speech-chip {
            position: absolute;
            top: 11px;
            height: 28px;
            border-radius: 9px;
            border: 1px solid rgba(73, 166, 119, 0.4);
            background: linear-gradient(180deg, rgba(26, 64, 48, 0.9), rgba(13, 33, 24, 0.96));
            color: #d8ffea;
            font-size: 10px;
            padding: 0 10px;
            display: inline-flex;
            align-items: center;
            overflow: hidden;
            white-space: nowrap;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .otl-cinematic-speech-chip.active {
            border-color: rgba(94, 152, 255, 0.95);
            box-shadow: inset 0 0 0 1px rgba(94, 152, 255, 0.42), 0 0 0 1px rgba(94, 152, 255, 0.18);
        }
        .otl-cinematic-poi-list {
            max-height: 220px;
            overflow: auto;
        }
        .otl-cinematic-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 0;
            min-height: 44px;
        }
        .otl-cinematic-header-left {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
            flex: 1;
        }
        .otl-cinematic-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 0 0 auto;
        }
        .otl-cinematic-title-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .otl-cinematic-mini-toggle {
            height: 28px;
            padding: 0 10px;
            border-radius: 999px;
            border: 1px solid rgba(72, 92, 135, 0.58);
            background: rgba(18, 24, 40, 0.92);
            color: #d6e2ff;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            font-family: var(--otl-font-ui);
            cursor: pointer;
        }
        .otl-cinematic-badge {
            border-radius: 7px;
            background: rgba(86, 110, 160, 0.34);
            color: #f0f5ff;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.12em;
            padding: 6px 9px;
        }
        .otl-cinematic-playbar {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            justify-content: flex-start;
        }
        .otl-cinematic-actions {
            display: flex;
            gap: 6px;
            margin-left: auto;
            flex: 0 0 auto;
        }
        .otl-cinematic-speed-select {
            height: 38px;
            min-width: 78px;
            padding: 0 30px 0 12px;
            border-radius: 12px;
            border: 1px solid rgba(72, 92, 135, 0.6);
            background: rgba(20, 28, 46, 0.95);
            color: #eef4ff;
            font-size: 12px;
            font-weight: 700;
            font-family: var(--otl-font-ui);
        }
        .otl-cinematic-icon-btn {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            border: 1px solid rgba(72, 92, 135, 0.6);
            background: rgba(20, 28, 46, 0.95);
            color: #eef4ff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
        }
        .otl-cinematic-icon-btn svg,
        .otl-cinematic-section-title svg,
        .otl-cinematic-poi-trigger svg,
        .otl-cinematic-mini-play svg {
            width: 18px;
            height: 18px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.9;
            stroke-linecap: round;
            stroke-linejoin: round;
            flex: 0 0 auto;
        }
        .otl-cinematic-icon-btn:hover {
            border-color: rgba(103, 141, 255, 0.95);
            background: rgba(26, 39, 67, 1);
            transform: translateY(-1px);
        }
        .otl-cinematic-icon-btn.primary {
            border-color: rgba(74, 122, 255, 0.75);
            box-shadow: 0 0 0 1px rgba(74,122,255,0.18) inset;
        }
        .otl-cinematic-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }
        .otl-cinematic-section-title {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 13px;
            font-weight: 700;
            color: #eef3ff;
        }
        .otl-cinematic-step-badge {
            border-radius: 999px;
            border: 1px solid rgba(72, 92, 135, 0.65);
            padding: 5px 12px;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.14em;
            color: #cad8ff;
        }
        .otl-cinematic-subactions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .otl-cinematic-poi-box {
            border: 1px solid rgba(56, 61, 86, 0.95);
            border-radius: 14px;
            background: rgba(12, 13, 20, 0.92);
            overflow: visible;
            position: relative;
            z-index: 20;
        }
        .otl-cinematic-poi-trigger {
            width: 100%;
            border: 0;
            background: transparent;
            color: #eaf1ff;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            font-family: var(--otl-font-ui);
        }
        .otl-cinematic-poi-items {
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 6px);
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px 12px 12px;
            max-height: 300px;
            overflow: auto;
            border: 1px solid rgba(56, 61, 86, 0.95);
            border-radius: 12px;
            background: rgba(12, 13, 20, 0.98);
            box-shadow: 0 18px 28px rgba(0,0,0,0.36);
        }
        .otl-cinematic-poi-items.hidden {
            display: none;
        }
        .otl-cinematic-poi-picker-list {
            position: static;
            left: auto;
            right: auto;
            top: auto;
            max-height: 360px;
            margin-top: 6px;
            box-shadow: none;
        }
        .otl-cinematic-poi-row {
            display: grid;
            grid-template-columns: 18px 1fr auto;
            gap: 10px;
            align-items: center;
            padding: 10px 12px;
            border: 1px solid rgba(42, 57, 95, 0.55);
            border-radius: 12px;
            background: rgba(13, 18, 31, 0.88);
            color: #edf3ff;
        }
        .otl-cinematic-poi-row .otl-muted { color: #8e9ec2; }
        .otl-cinematic-grid-inputs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
        }
        .otl-cinematic-field {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .otl-cinematic-field label {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #7f92ba;
        }
        .otl-cinematic-media-box {
            margin-top: 0;
            padding-top: 0;
            border-top: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-cinematic-media-actions-row {
            display: flex;
            gap: 10px;
            align-items: center;
            justify-content: space-between;
        }
        .otl-cinematic-media-actions-right {
            display: inline-flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            margin-left: auto;
        }
        .otl-cinematic-media-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .otl-cinematic-media-right {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .otl-cinematic-media-path-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: end;
        }
        .otl-cinematic-media-anchor-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: end;
        }
        .otl-cinematic-anchor-clear-btn {
            width: 100%;
            min-height: 38px;
        }
        .otl-cinematic-media-icon-btn {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid rgba(72, 92, 135, 0.6);
            background: rgba(20, 28, 46, 0.95);
            color: #eef4ff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
        }
        .otl-cinematic-media-icon-btn:hover {
            border-color: rgba(103, 141, 255, 0.95);
            background: rgba(26, 39, 67, 1);
            transform: translateY(-1px);
        }
        .otl-cinematic-media-icon-btn svg {
            width: 16px;
            height: 16px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.9;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .otl-cinematic-media-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .otl-cinematic-media-note {
            font-size: 11px;
            color: #8ea0c9;
        }
        .otl-cinematic-timeline {
            position: relative;
            height: 360px;
            overflow: hidden;
            border: 0;
            border-radius: 0;
            background:
                linear-gradient(180deg, rgba(15, 17, 24, 0.98), rgba(7, 8, 13, 0.99)),
                linear-gradient(90deg, rgba(100,120,255,0.025), rgba(255,255,255,0));
            min-width: 0;
            box-shadow: none;
        }
        .otl-cinematic-timeline-shell {
            display: grid;
            grid-template-columns: 224px minmax(0, 1fr);
            height: 100%;
            min-width: 0;
        }
        .otl-cinematic-timeline-side {
            border-right: 1px solid rgba(42, 45, 61, 0.95);
            background: linear-gradient(180deg, rgba(22,24,33,0.98), rgba(15,16,23,0.98));
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .otl-cinematic-sequence-head {
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0 10px;
            border-bottom: 1px solid rgba(42, 45, 61, 0.95);
            color: #d9e4ff;
            font-size: 11px;
            font-weight: 700;
        }
        .otl-cinematic-sequence-head.empty {
            color: transparent;
        }
        .otl-cinematic-sequence-head.controls {
            color: inherit;
        }
        .otl-cinematic-sequence-pill {
            height: 18px;
            min-width: 18px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(69, 98, 168, 0.18);
            color: #8ea9ff;
            font-size: 10px;
            font-weight: 800;
        }
        .otl-cinematic-lane-side {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        .otl-cinematic-lane-title,
        .otl-cinematic-lane-audio {
            position: relative;
            padding: 0 16px;
            border-bottom: 1px solid rgba(42, 45, 61, 0.95);
            color: #8d9ab9;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 700;
        }
        .otl-cinematic-lane-title { height: 84px; }
        .otl-cinematic-lane-audio { height: 38px; }
        .otl-cinematic-lane-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: rgba(255,255,255,0.22);
        }
        .otl-cinematic-lane-tools {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .otl-cinematic-lane-tool {
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #667493;
            opacity: 0.82;
        }
        .otl-cinematic-timeline-main {
            min-width: 0;
            display: flex;
            flex-direction: column;
        }
        .otl-cinematic-ruler-wrap {
            position: relative;
            height: 30px;
            overflow: auto hidden;
            border-bottom: 1px solid rgba(42, 45, 61, 0.95);
            background: linear-gradient(180deg, rgba(22,24,33,0.98), rgba(15,16,22,0.98));
            scrollbar-width: none;
        }
        .otl-cinematic-ruler-wrap::-webkit-scrollbar { display: none; }
        .otl-cinematic-ruler-inner,
        .otl-cinematic-track-scroll {
            position: relative;
            min-width: 760px;
        }
        .otl-cinematic-ruler-inner { height: 30px; }
        .otl-cinematic-track-wrap {
            flex: 1;
            position: relative;
            overflow: auto;
            background:
                linear-gradient(180deg, rgba(11,12,17,0.98), rgba(7,8,12,0.99)),
                linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
        }
        .otl-cinematic-track-scroll {
            min-height: 122px;
        }
        .otl-cinematic-time-ruler {
            position: absolute;
            inset: 0;
        }
        .otl-cinematic-tick {
            position: absolute;
            bottom: 0;
            width: 1px;
            height: 8px;
            background: rgba(112, 118, 148, 0.28);
        }
        .otl-cinematic-tick.major {
            height: 18px;
            background: rgba(143, 152, 196, 0.72);
        }
        .otl-cinematic-tick.mid {
            height: 13px;
            background: rgba(126, 135, 171, 0.5);
        }
        .otl-cinematic-tick-label {
            position: absolute;
            top: 3px;
            transform: translateX(6px);
            font-size: 9px;
            color: #949ab8;
            letter-spacing: 0.02em;
        }
        .otl-cinematic-track-grid {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }
        .otl-cinematic-grid-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: rgba(255,255,255,0.035);
        }
        .otl-cinematic-grid-line.major {
            background: rgba(255,255,255,0.06);
        }
        .otl-cinematic-grid-line.mid {
            background: rgba(255,255,255,0.045);
        }
        .otl-cinematic-shot-row {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 84px;
            border-bottom: 1px solid rgba(42, 45, 61, 0.72);
        }
        .otl-cinematic-shot-bar {
            position: absolute;
            top: 12px;
            height: 42px;
            border-radius: 12px;
            border: 1px solid rgba(88, 92, 111, 0.75);
            background:
                linear-gradient(180deg, rgba(70, 72, 86, 0.18), rgba(29, 31, 40, 0.72)),
                repeating-linear-gradient(135deg, rgba(255,255,255,0.038) 0 4px, rgba(255,255,255,0.012) 4px 8px);
            color: #e5ecff;
            font-size: 10px;
            padding: 11px 10px 6px;
            overflow: visible;
            min-width: 0;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 18px rgba(0,0,0,0.16);
        }
        .otl-cinematic-shot-bar.active {
            border-color: rgba(118, 102, 255, 0.95);
            background:
                linear-gradient(180deg, rgba(99, 87, 214, 0.34), rgba(35, 32, 66, 0.78)),
                repeating-linear-gradient(135deg, rgba(145,139,255,0.09) 0 4px, rgba(255,255,255,0.022) 4px 8px);
            box-shadow: 0 0 0 1px rgba(118,102,255,0.28), 0 12px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .otl-cinematic-shot-line {
            position: absolute;
            left: 10px;
            right: 10px;
            top: -11px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            pointer-events: none;
        }
        .otl-cinematic-shot-title {
            font-weight: 800;
            text-align: left;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 3px 8px;
            border-radius: 6px;
            background: rgba(6, 7, 12, 0.98);
            border: 1px solid rgba(69, 73, 93, 0.92);
            max-width: calc(100% - 74px);
        }
        .otl-cinematic-shot-meta {
            font-size: 10px;
            color: #b3c1e7;
            text-align: right;
            padding: 3px 8px;
            border-radius: 6px;
            background: rgba(6, 7, 12, 0.98);
            border: 1px solid rgba(69, 73, 93, 0.92);
            white-space: nowrap;
        }
        .otl-cinematic-shot-markers {
            position: relative;
            height: 30px;
            margin-top: 1px;
        }
        .otl-cinematic-keyframe-marker {
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            min-width: 18px;
            padding: 0;
            border: 0;
            background: transparent;
            cursor: pointer;
        }
        .otl-cinematic-keyframe-marker-label {
            font-size: 8px;
            font-weight: 700;
            line-height: 1;
            color: #7a819f;
            white-space: nowrap;
            pointer-events: none;
        }
        .otl-cinematic-pane.parameters-pane .otl-cinematic-section-head {
            margin-bottom: 10px !important;
        }
        .otl-cinematic-pane.parameters-pane .otl-cinematic-field {
            gap: 4px;
        }
        .otl-cinematic-pane.parameters-pane .otl-cinematic-field label {
            font-size: 10px;
            letter-spacing: 0.05em;
        }
        .otl-cinematic-pane.parameters-pane .otl-input,
        .otl-cinematic-pane.parameters-pane .otl-select {
            font-size: 11px;
            padding: 6px 8px;
            min-height: 30px;
        }
        .otl-cinematic-pane.parameters-pane .otl-btn {
            height: 28px;
            font-size: 11px;
            padding: 0 8px;
        }
        .otl-cinematic-pane.parameters-pane .otl-cinematic-keyframe-heading {
            display: none;
        }
        .otl-cinematic-keyframe-marker-diamond {
            width: 11px;
            height: 11px;
            border-radius: 3px;
            border: 1px solid rgba(139, 141, 158, 0.88);
            background: linear-gradient(180deg, rgba(34, 36, 46, 0.98), rgba(15, 16, 22, 0.98));
            rotate: 45deg;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.2);
            pointer-events: none;
        }
        .otl-cinematic-keyframe-marker.active .otl-cinematic-keyframe-marker-label {
            color: #eef2ff;
        }
        .otl-cinematic-keyframe-marker.active .otl-cinematic-keyframe-marker-diamond {
            background: linear-gradient(180deg, rgba(123, 113, 255, 1), rgba(91, 80, 238, 0.98));
            border-color: #f3f5ff;
            box-shadow: 0 0 0 4px rgba(110,98,255,0.18), inset 0 1px 0 rgba(255,255,255,0.22);
        }
        .otl-cinematic-playhead {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: linear-gradient(180deg, rgba(115, 103, 255, 1), rgba(115, 103, 255, 0.12));
            transform: translateX(0);
            pointer-events: none;
            z-index: 4;
        }
        .otl-cinematic-playhead::before {
            content: '';
            position: absolute;
            top: 0;
            left: 50%;
            width: 10px;
            height: 10px;
            background: #7666ff;
            border-radius: 50%;
            transform: translate(-50%, -18%);
            box-shadow: 0 0 0 3px rgba(110,98,255,0.18);
        }
        .otl-cinematic-request-hint {
            font-size: 11px;
            color: #8595b8;
            line-height: 1.45;
        }
        .otl-cinematic-panel-title {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #95a8cf;
            margin-bottom: 12px;
        }
        .otl-cinematic-map-wrap {
            position: relative;
            border: 1px solid rgba(43, 59, 97, 0.54);
            border-radius: 14px;
            overflow: hidden;
            background: radial-gradient(circle at center, rgba(18,29,56,0.55), rgba(7,10,19,0.96));
            min-height: 210px;
        }
        .otl-cinematic-map-split {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            min-height: 0;
            flex: 1;
        }
        .otl-cinematic-map-box {
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            flex: 1;
            min-height: 0;
        }
        .otl-cinematic-map-box canvas {
            display: block;
            width: 100%;
            height: 100%;
            aspect-ratio: 260 / 146;
            max-width: 100%;
            object-fit: contain;
            flex: 1;
            min-height: 0;
            touch-action: none;
        }
        .otl-cinematic-map-box .otl-map-controls {
            align-self: flex-start;
            margin-top: 8px;
        }
        .otl-cinematic-preview-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 0;
            flex: 1;
            width: 100%;
        }
        .otl-cinematic-map-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 8px;
            min-height: 30px;
        }
        .otl-cinematic-preview-footer-spacer {
            min-height: 30px;
            margin-top: 8px;
            width: 100%;
            flex: 0 0 auto;
        }
        .otl-cinematic-preview-wrap {
            border: 1px solid rgba(43, 59, 97, 0.54);
            border-radius: 14px;
            overflow: hidden;
            background: rgba(7,10,19,0.96);
            width: auto;
            aspect-ratio: 16 / 9;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            min-height: 0;
            flex: 0 1 auto;
            display: flex;
            flex-direction: column;
        }
        .otl-cinematic-preview-wrap img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #050912;
            flex: 1;
            min-height: 0;
        }
        .otl-cinematic-map-meta {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            margin-bottom: 8px;
            gap: 12px;
            min-height: 24px;
        }
        .otl-cinematic-map-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .otl-cinematic-map-current {
            border-radius: 8px;
            background: rgba(40, 54, 88, 0.78);
            color: #d5e1ff;
            padding: 5px 8px;
            font-size: 11px;
            font-weight: 700;
        }
        .otl-cinematic-route-toggle {
            height: 30px;
            padding: 0 12px;
            border-radius: 999px;
            border: 1px solid rgba(72, 92, 135, 0.58);
            background: rgba(20, 28, 46, 0.95);
            color: #d6e2ff;
            font-size: 11px;
            font-weight: 700;
            font-family: var(--otl-font-ui);
            cursor: pointer;
        }
        .otl-cinematic-route-toggle.active {
            border-color: rgba(74, 122, 255, 0.82);
            background: rgba(20, 42, 92, 0.95);
            color: #f0f5ff;
        }
        .otl-cinematic-prompt-modal {
            position: fixed;
            inset: 0;
            background: rgba(4, 4, 8, 0.76);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            z-index: 10020;
            backdrop-filter: blur(18px);
        }
        .otl-cinematic-prompt-modal.hidden { display: none; }
        .otl-cinematic-prompt-panel {
            width: min(980px, calc(100vw - 40px));
            min-height: 560px;
            max-height: calc(100vh - 40px);
            border-radius: 16px;
            border: 1px solid rgba(56, 61, 86, 0.95);
            background:
                radial-gradient(circle at top left, rgba(94, 104, 165, 0.14), transparent 26%),
                linear-gradient(180deg, rgba(18,19,27,0.985), rgba(11,12,17,0.99));
            box-shadow: 0 28px 60px rgba(0,0,0,0.5);
            display: grid;
            grid-template-rows: auto 1fr;
            overflow: hidden;
        }
        .otl-cinematic-prompt-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px 6px;
            border-bottom: 1px solid rgba(56, 61, 86, 0.65);
        }
        .otl-cinematic-keyframe-head-left {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex-wrap: nowrap;
        }
        .otl-cinematic-keyframe-head-tools {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            justify-content: flex-start;
            flex-wrap: wrap;
        }
        .otl-cinematic-keyframe-toolbar-grid {
            width: 100%;
            align-items: center;
        }
        .otl-cinematic-title-meta {
            color: #95a7cf;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }
        .otl-cinematic-camera-section {
            margin-top: 4px;
            padding-top: 12px;
            border-top: 1px solid rgba(51, 70, 109, 0.48);
        }
        .otl-cinematic-prompt-body {
            display: grid;
            grid-template-columns: 240px 1fr;
            min-height: 0;
        }
        .otl-cinematic-prompt-versions {
            border-right: 1px solid rgba(56, 61, 86, 0.65);
            padding: 14px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .otl-cinematic-prompt-editor {
            display: grid;
            grid-template-rows: 1fr auto;
            min-height: 0;
        }
        .otl-cinematic-prompt-text {
            width: 100%;
            height: 100%;
            border: 0;
            background: transparent;
            color: #f3f7ff;
            resize: none;
            padding: 18px;
            line-height: 1.6;
            outline: none;
            font-size: 14px;
            font-family: var(--otl-font-ui);
        }
        .otl-cinematic-prompt-footer {
            border-top: 1px solid rgba(56, 61, 86, 0.65);
            padding: 14px 18px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        .otl-cinematic-prompt-version-item {
            border: 1px solid rgba(56, 61, 86, 0.92);
            border-radius: 12px;
            background: rgba(15, 16, 24, 0.92);
            color: #dce7ff;
            text-align: left;
            padding: 12px;
            cursor: pointer;
        }
        .otl-cinematic-prompt-version-item.active {
            border-color: #7666ff;
            box-shadow: inset 0 0 0 1px rgba(118,102,255,0.26);
            background: rgba(37, 32, 66, 0.92);
        }
        .otl-cinematic-prompt-version-meta {
            color: #7f92ba;
            font-size: 11px;
            margin-top: 6px;
        }
        .otl-cinematic-parameter-speech {
            min-height: 30px;
            font-size: 11px;
            resize: none;
        }
        .otl-cinematic-mini {
            display: none;
            align-items: center;
            gap: 14px;
            min-width: 340px;
            padding-left: 12px;
        }
        .otl-cinematic-mini-play {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            border: 1px solid rgba(72, 92, 135, 0.58);
            background: rgba(20, 28, 46, 0.95);
            color: #eef4ff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .otl-cinematic-mini-timeline {
            position: relative;
            flex: 1;
            height: 40px;
            border: 1px solid rgba(46, 63, 103, 0.45);
            border-radius: 999px;
            background: linear-gradient(180deg, rgba(6,9,18,0.98), rgba(8,11,20,0.98));
            overflow: hidden;
        }
        .otl-cinematic-mini-track,
        .otl-cinematic-mini-progress {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            height: 6px;
            border-radius: 999px;
        }
        .otl-cinematic-mini-track {
            left: 12px;
            right: 12px;
            background: rgba(83, 104, 148, 0.26);
        }
        .otl-cinematic-mini-progress {
            left: 12px;
            background: linear-gradient(90deg, rgba(44,117,255,0.88), rgba(120,170,255,0.88));
            min-width: 6px;
        }
        .otl-cinematic-mini-playhead {
            position: absolute;
            top: 50%;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #f3f7ff;
            box-shadow: 0 0 0 4px rgba(47,124,255,0.18);
            transform: translate(-50%, -50%);
        }
        .otl-cinematic-mini-time {
            min-width: 56px;
            color: #9ab0da;
            font-size: 11px;
            font-weight: 700;
        }
        .otl-cinematic-bgm-modal {
            position: fixed;
            inset: 0;
            background: rgba(4, 4, 8, 0.76);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            z-index: 10030;
            backdrop-filter: blur(16px);
        }
        .otl-cinematic-bgm-modal.hidden { display: none; }
        .otl-cinematic-bgm-panel {
            width: min(980px, calc(100vw - 24px));
            max-height: calc(100vh - 24px);
            border-radius: 16px;
            border: 1px solid rgba(56, 61, 86, 0.95);
            background: linear-gradient(180deg, rgba(18, 19, 27, 0.985), rgba(11, 12, 17, 0.99));
            box-shadow: 0 28px 60px rgba(0,0,0,0.5);
            display: grid;
            grid-template-rows: auto 1fr;
            overflow: hidden;
        }
        .otl-cinematic-bgm-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(56, 61, 86, 0.65);
        }
        .otl-cinematic-bgm-grid {
            display: grid;
            grid-template-columns: 320px 1fr;
            gap: 14px;
            min-height: 0;
            padding: 14px;
        }
        .otl-cinematic-bgm-library,
        .otl-cinematic-bgm-editor {
            min-height: 0;
            border: 1px solid rgba(56, 61, 86, 0.74);
            border-radius: 12px;
            background: rgba(10, 12, 18, 0.92);
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-cinematic-bgm-list {
            min-height: 0;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .otl-cinematic-bgm-item {
            width: 100%;
            border: 1px solid rgba(50, 62, 92, 0.64);
            border-radius: 10px;
            background: rgba(17, 23, 36, 0.9);
            color: #ecf3ff;
            padding: 8px 10px;
            text-align: left;
            cursor: pointer;
            font-family: var(--otl-font-ui);
            font-size: 12px;
        }
        .otl-cinematic-bgm-item.active {
            border-color: rgba(96, 136, 255, 0.92);
            box-shadow: inset 0 0 0 1px rgba(96, 136, 255, 0.25);
        }
        .otl-cinematic-bgm-item .meta {
            display: block;
            color: #8ca2d0;
            font-size: 10px;
            margin-top: 4px;
        }
        .otl-cinematic-bgm-toolbar {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
        }
        .otl-cinematic-bgm-list-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .otl-cinematic-bgm-head-actions {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .otl-cinematic-bgm-head-actions .otl-cinematic-icon-btn.primary {
            border-color: rgba(74, 122, 255, 0.78);
            background: rgba(34, 72, 156, 0.92);
        }
        .otl-cinematic-bgm-head-actions .otl-cinematic-icon-btn.primary:hover {
            background: rgba(44, 84, 176, 0.98);
        }
        .otl-cinematic-bgm-head-actions .otl-cinematic-icon-btn.danger {
            border-color: rgba(255, 96, 118, 0.42);
            background: rgba(42, 14, 20, 0.92);
            color: #ffd4da;
        }
        .otl-cinematic-bgm-head-actions .otl-cinematic-icon-btn.danger:hover {
            border-color: rgba(255, 120, 138, 0.62);
            background: rgba(54, 16, 24, 0.96);
        }
        .otl-cinematic-bgm-list-head .otl-cinematic-icon-btn {
            width: 34px;
            height: 34px;
            border-radius: 10px;
        }
        .otl-cinematic-bgm-player {
            display: flex;
            justify-content: flex-start;
            gap: 12px;
            align-items: center;
            flex-wrap: nowrap;
            min-width: 0;
        }
        .otl-cinematic-bgm-player .otl-cinematic-icon-btn {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            flex: 0 0 auto;
        }
        .otl-cinematic-bgm-player .otl-select {
            width: auto;
            min-width: 70px;
            padding-right: 28px;
            flex: 0 0 auto;
        }
        .otl-cinematic-bgm-time {
            white-space: nowrap;
            min-width: 0;
            text-align: left;
            flex: 0 0 auto;
        }
        .otl-cinematic-bgm-progress-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
        .otl-cinematic-bgm-wave {
            width: 100%;
            height: 120px;
            border-radius: 10px;
            border: 1px solid rgba(50, 62, 92, 0.64);
            background: linear-gradient(180deg, rgba(6, 9, 16, 0.98), rgba(8, 12, 22, 0.98));
            cursor: crosshair;
        }
        .otl-cinematic-bgm-range {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr)) auto auto;
            gap: 8px;
            align-items: end;
        }
        .otl-cinematic-bgm-params {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            align-items: end;
        }
        .otl-cine-record-btn {
            height: 38px;
            padding: 0 12px;
            border: 1px solid rgba(72, 92, 135, 0.6);
            border-radius: 12px;
            background: rgba(20, 28, 46, 0.95);
            color: #eef4ff;
            font-weight: 700;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            cursor: pointer;
            transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
            font-family: var(--otl-font-ui);
            white-space: nowrap;
        }
        .otl-cine-record-btn.recording {
            border-color: rgba(255, 84, 110, 0.58);
            background: rgba(40, 10, 18, 0.92);
            color: #ffe2e7;
        }
        .otl-cine-record-btn.paused {
            border-color: rgba(160, 122, 132, 0.58);
            background: rgba(32, 18, 23, 0.92);
            color: #f1d8de;
        }
        .otl-cine-record-btn:hover {
            border-color: rgba(103, 141, 255, 0.95);
            background: rgba(26, 39, 67, 1);
            transform: translateY(-1px);
        }
        .otl-cine-record-btn .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ff4766;
            box-shadow: 0 0 0 4px rgba(255, 71, 102, 0.18);
        }
        .otl-cine-record-btn.recording .dot {
            animation: otl-rec-pulse 1.1s ease-in-out infinite;
        }
        .otl-cine-record-btn.hidden { display: none; }
        .otl-cine-record-timer {
            min-width: 52px;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            color: #a7bad6;
            font-variant-numeric: tabular-nums;
        }
        .otl-cine-record-timer.active {
            color: #ffd6dd;
        }
        .otl-cine-record-timer.paused {
            color: #d6c0c5;
        }
        @keyframes otl-rec-pulse {
            0%, 100% { opacity: 1; box-shadow: 0 0 0 4px rgba(255, 71, 102, 0.18); }
            50% { opacity: 0.45; box-shadow: 0 0 0 6px rgba(255, 71, 102, 0.08); }
        }
        .otl-cine-record-modal {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            background: rgba(4, 9, 18, 0.72);
            z-index: 40;
            padding: 84px 22px 22px;
        }
        .otl-cine-record-modal.hidden { display: none; }
        .otl-cine-record-panel {
            width: min(1160px, calc(100vw - 90px));
            max-height: calc(100vh - 110px);
            display: flex;
            flex-direction: column;
            border-radius: 18px;
            border: 1px solid rgba(102, 132, 176, 0.34);
            background: linear-gradient(180deg, rgba(13, 20, 34, 0.98), rgba(9, 14, 26, 0.98));
            box-shadow: 0 28px 68px rgba(2, 5, 12, 0.6);
            overflow: hidden;
        }
        .otl-cine-record-tool-group { position: relative; }
        .otl-cine-record-popover {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            width: min(360px, calc(100vw - 70px));
            border-radius: 12px;
            border: 1px solid rgba(106, 138, 184, 0.32);
            background: rgba(12, 19, 32, 0.96);
            box-shadow: 0 18px 48px rgba(3, 6, 16, 0.56);
            padding: 10px;
            display: none;
            z-index: 5;
        }
        .otl-cine-record-popover.open { display: block; }
        .otl-cine-record-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .otl-cine-record-pop-close { background: none; border: 0; color: #b8cae6; cursor: pointer; font-size: 18px; }
        .otl-cine-record-row {
            display: grid;
            grid-template-columns: 120px 1fr;
            align-items: center;
            gap: 8px;
            margin-top: 7px;
            color: #9eb2d1;
            font-size: 12px;
        }
        .otl-cine-record-row select,
        .otl-cine-record-row input[type="range"],
        .otl-cine-record-row input[type="number"],
        .otl-cine-record-row input[type="color"] {
            width: 100%;
        }
        .otl-cine-record-check {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #afc0da;
            margin-top: 8px;
        }
        .otl-cine-record-inline {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 8px;
        }
        .otl-cine-record-section {
            border: 1px solid rgba(96, 127, 170, 0.28);
            border-radius: 14px;
            padding: 12px;
            background: rgba(14, 21, 36, 0.6);
        }
        .otl-cine-record-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
            gap: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(102, 132, 176, 0.2);
        }
        .otl-cine-record-section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #d5e4ff; }
        .otl-cine-record-section-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .otl-cine-record-content { flex: 1; overflow: auto; padding-top: 2px; }
        .otl-cine-record-pagination { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid rgba(96, 127, 170, 0.32); border-radius: 10px; background: rgba(11, 17, 28, 0.74); }
        .otl-cine-record-page-btn { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
        .otl-cine-record-page-label { min-width: 62px; text-align: center; font-size: 11px; color: #a9bbd7; font-weight: 600; letter-spacing: 0.03em; }
        .otl-cine-record-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
        }
        .otl-cine-record-card-item {
            border: 1px solid rgba(90, 120, 164, 0.34);
            border-radius: 12px;
            background: rgba(8, 13, 24, 0.9);
            overflow: hidden;
        }
        .otl-cine-record-video { width: 100%; aspect-ratio: 16 / 9; background: #000; }
        .otl-cine-record-card-body { padding: 8px 10px 10px; display: grid; gap: 6px; }
        .otl-cine-record-name { font-size: 13px; font-weight: 700; color: #eaf2ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .otl-cine-record-meta { font-size: 11px; color: #8ea3c2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .otl-cine-record-status {
            justify-self: start;
            font-size: 10px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #c8d6ed;
            border: 1px solid rgba(118, 141, 174, 0.4);
            padding: 2px 6px;
            border-radius: 999px;
        }
        .otl-cine-record-status.processing { color: #d8b768; border-color: rgba(216, 183, 104, 0.45); }
        .otl-cine-record-status.warn { color: #f0a1a1; border-color: rgba(240, 161, 161, 0.45); }
        .otl-cine-record-actions { display: flex; justify-content: flex-end; }
        .otl-cine-record-delete { border: 0; background: none; color: #c2d2ea; cursor: pointer; }
        .otl-cine-record-status-line {
            padding: 10px 0 2px;
            border-top: 1px solid rgba(102, 132, 176, 0.18);
            margin-top: 12px;
        }
        .otl-csv-workspace-panel.recording-lock .otl-cinematic-main,
        .otl-csv-workspace-panel.recording-lock .otl-cinematic-bottom-dock {
            pointer-events: none;
            opacity: 0.78;
        }
        .otl-cinematic-shell.mini {
            align-items: flex-end;
            padding: 16px 16px 90px 96px;
        }
        .otl-cinematic-shell.mini .otl-csv-workspace-panel {
            width: auto;
            min-width: 520px;
            height: auto;
            padding: 14px 16px;
        }
        .otl-cinematic-shell.mini .otl-cinematic-main,
        .otl-cinematic-shell.mini .otl-cinematic-header .otl-cinematic-actions {
            display: none;
        }
        .otl-cinematic-shell.mini .otl-cinematic-mini {
            display: flex;
        }
        @media (max-width: 1180px) {
            .otl-cinematic-main { grid-template-columns: 280px minmax(0, 1fr); }
            .otl-cinematic-middle { grid-template-columns: 1fr; }
            .otl-cinematic-parameter-top,
            .otl-cinematic-parameter-bottom { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .otl-cinematic-parameter-speech-row { grid-template-columns: minmax(0, 1fr) auto auto; }
        }
        @media (max-width: 980px) {
            .otl-cinematic-main,
            .otl-cinematic-right,
            .otl-cinematic-middle,
            .otl-cinematic-prompt-body,
            .otl-cinematic-bgm-grid,
            .otl-cinematic-map-split,
            .otl-cinematic-grid-inputs { grid-template-columns: 1fr; }
            .otl-cinematic-right { grid-template-rows: auto auto minmax(260px, 1fr); }
            .otl-cinematic-parameter-top,
            .otl-cinematic-parameter-bottom { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .otl-cinematic-parameter-speech-row { grid-template-columns: 1fr; }
            .otl-cinematic-bgm-player,
            .otl-cinematic-bgm-range,
            .otl-cinematic-bgm-params { grid-template-columns: 1fr; }
            .otl-cine-record-grid { grid-template-columns: 1fr; }
            .otl-cine-record-title { font-size: 22px; }
            .otl-cine-record-row { grid-template-columns: 1fr; }
            .otl-cine-record-section-head { flex-wrap: wrap; }
        }
        .otl-csv-editor {
            width: 100%;
            min-height: 420px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 12px;
            line-height: 1.45;
            outline: none;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        }
        .otl-csv-grid-wrap {
            width: 100%;
            min-height: 420px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            overflow: auto;
        }
        .otl-csv-grid {
            width: max-content;
            min-width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .otl-csv-grid th,
        .otl-csv-grid td {
            border-right: 1px solid #272c3a;
            border-bottom: 1px solid #272c3a;
            padding: 0;
            vertical-align: top;
            background: #11131b;
        }
        .otl-csv-grid th {
            position: sticky;
            top: 0;
            z-index: 2;
            background: #1a1f2c;
            color: #aeb9d7;
            font-weight: 700;
            padding: 7px 8px;
            min-width: 120px;
        }
        .otl-csv-grid td {
            min-width: 120px;
        }
        .otl-csv-grid th.row-action,
        .otl-csv-grid td.row-action {
            min-width: 64px;
            width: 64px;
            text-align: center;
            padding: 0;
        }
        .otl-csv-grid td.row-action {
            background: #121625;
        }
        .otl-csv-row-tools {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 4px 4px;
        }
        .otl-csv-row-index {
            color: #8fa0c8;
            font-size: 11px;
            min-width: 20px;
            text-align: right;
        }
        .otl-csv-row-delete {
            width: 22px;
            height: 22px;
            border-radius: 6px;
            border: 1px solid #3a445e;
            background: #171d2b;
            color: #f08686;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        }
        .otl-csv-row-delete:hover {
            border-color: #e27878;
            background: rgba(226, 120, 120, 0.16);
        }
        .otl-csv-row-delete svg {
            width: 12px;
            height: 12px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .otl-csv-grid-empty {
            padding: 10px;
            color: var(--otl-text-muted);
            text-align: center;
            font-size: 12px;
        }
        .otl-csv-grid-cell {
            width: 100%;
            min-width: 120px;
            border: none;
            outline: none;
            background: transparent;
            color: var(--otl-text-main);
            padding: 7px 8px;
            font-size: 12px;
            line-height: 1.35;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        }
        .otl-csv-grid-cell:focus {
            background: rgba(75, 115, 255, 0.16);
            box-shadow: inset 0 0 0 1px rgba(75, 115, 255, 0.35);
        }
        .otl-csv-content-cell {
            min-height: 31px;
            padding: 7px 8px;
            color: var(--otl-text-main);
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 320px;
        }
        .otl-csv-content-cell:hover {
            background: rgba(75, 115, 255, 0.12);
        }
        .otl-csv-content-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-csv-content-modal.hidden { display: none; }
        .otl-csv-content-panel {
            width: min(860px, calc(100vw - 40px));
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-csv-content-input {
            width: 100%;
            min-height: 300px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
            color: var(--otl-text-main);
            resize: vertical;
            padding: 10px;
            font-size: 13px;
            line-height: 1.5;
            outline: none;
        }
        .otl-csv-voice-tools {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .otl-csv-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .otl-csv-toolbar-sep {
            width: 1px;
            height: 22px;
            background: rgba(148, 163, 184, 0.18);
            margin: 0 2px;
        }
        .otl-check {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--otl-text-main);
            font-size: 12px;
        }
        .otl-check input { accent-color: var(--otl-primary); }
        .otl-voice-pill {
            border: 1px solid var(--otl-border);
            border-radius: 999px;
            padding: 4px 10px;
            background: #121723;
            color: #cbd5e1;
            font-size: 11px;
        }
        .otl-voice-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-voice-modal.hidden { display: none; }
        #${PANEL_ID}.cinematic-only > .otl-voice-modal {
            z-index: 10010;
            background: rgba(5, 8, 16, 0.62);
            backdrop-filter: blur(10px);
        }
        #${PANEL_ID}.cinematic-only > .otl-voice-modal .otl-voice-panel {
            width: min(760px, calc(100vw - 80px));
            max-height: min(760px, calc(100vh - 80px));
            border-radius: 18px;
            border: 1px solid rgba(52, 72, 118, 0.56);
            background: linear-gradient(180deg, rgba(10,14,24,0.98), rgba(7,10,19,0.98));
            box-shadow: 0 24px 48px rgba(0,0,0,0.42);
            padding: 20px;
            gap: 14px;
        }
        .otl-voice-modal.workspace-local {
            position: absolute;
            inset: 0;
            background: transparent;
            align-items: flex-start;
            justify-content: flex-end;
            z-index: 34;
            padding: 72px 18px 18px;
            pointer-events: none;
        }
        .otl-voice-modal.workspace-local .otl-voice-panel {
            width: min(760px, calc(100% - 24px));
            max-height: calc(100% - 24px);
            border-radius: 16px;
            border: 1px solid rgba(56, 61, 86, 0.95);
            background:
                radial-gradient(circle at top left, rgba(94, 104, 165, 0.14), transparent 26%),
                linear-gradient(180deg, rgba(18,19,27,0.985), rgba(11,12,17,0.99));
            box-shadow: 0 22px 42px rgba(0,0,0,0.36);
            padding: 18px;
            gap: 12px;
            pointer-events: auto;
        }
        .otl-voice-panel {
            width: min(520px, calc(100vw - 32px));
            max-height: min(720px, calc(100vh - 32px));
            overflow: auto;
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .otl-config-modal {
            position: fixed;
            inset: 0;
            background: rgba(4,6,10,0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 24px;
        }
        .otl-config-modal.hidden { display: none; }
        .otl-config-modal.workspace-local {
            position: absolute;
            inset: 0;
            background: transparent;
            align-items: flex-start;
            justify-content: flex-end;
            z-index: 34;
            padding: 72px 18px 18px;
            pointer-events: none;
        }
        .otl-config-modal.workspace-local .otl-config-panel {
            width: min(420px, calc(100% - 24px));
            max-height: calc(100% - 24px);
            border-radius: 16px;
            border: 1px solid rgba(56, 61, 86, 0.95);
            background:
                radial-gradient(circle at top left, rgba(94, 104, 165, 0.14), transparent 26%),
                linear-gradient(180deg, rgba(18,19,27,0.985), rgba(11,12,17,0.99));
            box-shadow: 0 22px 42px rgba(0,0,0,0.36);
            padding: 16px;
            pointer-events: auto;
        }
        .otl-config-panel {
            width: min(420px, calc(100vw - 32px));
            border: 1px solid var(--otl-border);
            border-radius: 12px;
            background: #171a24;
            box-shadow: 0 16px 36px rgba(0,0,0,0.55);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .otl-config-stat {
            border: 1px solid var(--otl-border);
            border-radius: 10px;
            background: #11131b;
            padding: 10px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }
        .otl-config-stat strong {
            color: var(--otl-text-main);
            font-size: 14px;
        }
        .otl-voice-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 420px;
            overflow: auto;
            padding-right: 4px;
        }
        .otl-voice-group-title {
            color: var(--otl-text-muted);
            font-size: 11px;
            margin-top: 8px;
        }
        .otl-voice-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border: 1px solid var(--otl-border);
            border-radius: 8px;
            background: #11131b;
        }
        .otl-voice-item-main {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .otl-voice-code {
            color: var(--otl-text-muted);
            font-size: 11px;
        }
        .otl-toolbar-title {
            font-size: 11px;
            color: var(--otl-text-muted);
            margin-right: 4px;
        }
        .otl-muted { color: var(--otl-text-muted); font-size: 11px; }
        .otl-hidden { display: none !important; }
        @media (max-width: 980px) {
            #${PANEL_ID} {
                right: 8px;
                top: 72px;
                width: min(460px, calc(100vw - 16px));
                height: fit-content;
                max-height: calc(100vh - 82px);
            }
            .otl-map-grid { grid-template-columns: 1fr; }
            .otl-settings-panel { width: min(760px, calc(100vw - 16px)); }
            .otl-poi-row-top { flex-wrap: wrap; }
            .otl-poi-row-bottom { flex-direction: column; height: auto; }
            .otl-poi-preview { width: 100%; height: 140px; }
            .otl-provider-tabs { grid-template-columns: 1fr; }
            .otl-csv-workspace-panel { width: min(1080px, calc(100vw - 16px)); }
            .otl-csv-workspace-grid { grid-template-columns: 1fr; min-height: 0; }
            .otl-csv-version-list { max-height: 180px; }
            .otl-csv-grid-wrap { min-height: 260px; }
            .otl-csv-editor { min-height: 260px; }
        }
    `;
    if (!existing) document.head.appendChild(style);
};
