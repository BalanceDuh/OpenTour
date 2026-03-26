type TourDownloadOptions = {
    launcherButton?: HTMLButtonElement;
    apiBaseUrl?: string;
};

type TourDownloadController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
};

type MatchMode = 'all' | 'any';
type FileFormat = 'spz' | 'ply';
type Quality = '100k' | '500k' | 'full_res';
type CoordinateSystem = 'opengl' | 'opencv';
type PlaneLevel = 'ground' | 'eye';

type TourDownloadPayload = {
    tags: string[];
    count: number;
    matchMode: MatchMode;
    fileFormat: FileFormat;
    quality: Quality;
    coordinateSystem: CoordinateSystem;
    planeLevel: PlaneLevel;
    outputDir: string;
    skipExisting: boolean;
};

type SearchResult = {
    id: string;
    displayName: string;
    ownerUsername: string;
    tags: string[];
    previewUrl: string | null;
    worldUrl: string;
    availableFormats: string[];
    availableQualities: string[];
};

type JobItem = {
    worldId: string;
    displayName: string;
    status: 'pending' | 'downloading' | 'downloaded' | 'skipped' | 'failed';
    message: string;
    filePath?: string;
};

type JobResponse = {
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    outputDir: string;
    total: number;
    completed: number;
    downloaded: number;
    skipped: number;
    failed: number;
    message: string;
    warnings: string[];
    items: JobItem[];
};

type AuthStatusResponse = {
    browserOpen: boolean;
    loggedIn?: boolean;
    profileDir: string;
    message: string;
};

type ImportChromeSessionResponse = {
    ok: boolean;
    importedFrom: string;
    importedProfileName: string;
    profileDir: string;
    availableProfiles: Array<{ name: string; path: string }>;
    message: string;
};

const STYLE_ID = 'ot-tour-download-style';
const PANEL_ID = 'ot-tour-download-panel';
const TAG_OPTIONS = [
    { id: 'curated', label: 'All 3D worlds' },
    { id: 'stylized', label: 'Stylized' },
    { id: 'realism', label: 'Realism' },
    { id: 'interior', label: 'Interior' },
    { id: 'exterior', label: 'Exterior' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'sci-fi', label: 'Sci-Fi' }
] as const;

const DEFAULT_OUTPUT_DIR = 'downloads/marble';

const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --otd-bg: #111319;
            --otd-card: #1b1f29;
            --otd-card-2: #222734;
            --otd-input: #10141c;
            --otd-border: #31384a;
            --otd-border-2: #49546c;
            --otd-text: #e7edf8;
            --otd-muted: #95a2bc;
            --otd-main: #79b8ff;
            --otd-main-2: #4594ff;
            --otd-success: #5fd1a8;
            --otd-warn: #f3c46b;
            --otd-danger: #ff7f7f;
        }
        #${PANEL_ID} {
            position: fixed;
            right: 56px;
            top: 84px;
            width: min(500px, calc(100vw - 84px));
            max-height: min(84vh, 860px);
            display: flex;
            flex-direction: column;
            border-radius: 16px;
            border: 1px solid var(--otd-border);
            background: linear-gradient(180deg, rgba(24, 29, 39, 0.98), rgba(13, 17, 24, 0.98));
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.52);
            color: var(--otd-text);
            z-index: 178;
            overflow: hidden;
            pointer-events: auto;
            font-family: "Segoe UI", "Noto Sans", sans-serif;
        }
        #${PANEL_ID}.hidden { display: none; }
        #${PANEL_ID} * { box-sizing: border-box; }
        .otd-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            border-bottom: 1px solid var(--otd-border);
            background: rgba(255, 255, 255, 0.02);
            cursor: move;
        }
        .otd-badge {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #08131f;
            background: linear-gradient(135deg, #9fd1ff, #5d99ff);
            font-size: 14px;
            font-weight: 800;
        }
        .otd-title-wrap { display: flex; flex-direction: column; gap: 2px; }
        .otd-title { font-size: 14px; font-weight: 800; letter-spacing: 0.01em; }
        .otd-subtitle { font-size: 11px; color: var(--otd-muted); }
        .otd-close {
            margin-left: auto;
            width: 30px;
            height: 30px;
            border-radius: 8px;
            border: 1px solid var(--otd-border);
            background: transparent;
            color: var(--otd-text);
            cursor: pointer;
        }
        .otd-content {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 14px;
            overflow-y: auto;
        }
        .otd-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--otd-border);
            background: linear-gradient(180deg, rgba(34, 39, 52, 0.92), rgba(24, 28, 38, 0.92));
        }
        .otd-card-title {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--otd-muted);
        }
        .otd-tag-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .otd-tag-btn,
        .otd-seg-btn,
        .otd-btn {
            border: 1px solid var(--otd-border);
            background: var(--otd-input);
            color: var(--otd-text);
            cursor: pointer;
        }
        .otd-tag-btn {
            height: 32px;
            padding: 0 12px;
            border-radius: 999px;
            font-size: 12px;
        }
        .otd-tag-btn.active,
        .otd-seg-btn.active {
            border-color: rgba(121, 184, 255, 0.7);
            background: rgba(69, 148, 255, 0.18);
            color: #ffffff;
        }
        .otd-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .otd-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }
        .otd-field label {
            font-size: 11px;
            color: var(--otd-muted);
            font-weight: 600;
        }
        .otd-inline-check {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 34px;
            color: var(--otd-text);
            font-size: 12px;
            cursor: pointer;
        }
        .otd-inline-check input {
            width: 15px;
            height: 15px;
            accent-color: var(--otd-main-2);
        }
        .otd-input,
        .otd-select {
            width: 100%;
            height: 34px;
            border-radius: 8px;
            border: 1px solid var(--otd-border);
            background: var(--otd-input);
            color: var(--otd-text);
            padding: 0 10px;
            font-size: 12px;
            outline: none;
        }
        .otd-seg {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .otd-seg-btn,
        .otd-btn {
            height: 34px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            padding: 0 12px;
        }
        .otd-btn.primary {
            background: linear-gradient(135deg, var(--otd-main), var(--otd-main-2));
            border-color: transparent;
            color: #07111c;
        }
        .otd-btn.ghost { background: transparent; }
        .otd-btn.warn {
            border-color: rgba(243, 196, 107, 0.4);
            color: var(--otd-warn);
        }
        .otd-btn:disabled,
        .otd-tag-btn:disabled,
        .otd-seg-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
        .otd-actions {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
        }
        .otd-note,
        .otd-status,
        .otd-summary {
            font-size: 11px;
            line-height: 1.5;
            color: var(--otd-muted);
        }
        .otd-status strong,
        .otd-summary strong { color: var(--otd-text); }
        .otd-result-list,
        .otd-job-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 260px;
            overflow-y: auto;
        }
        .otd-item {
            padding: 10px;
            border-radius: 10px;
            border: 1px solid var(--otd-border);
            background: rgba(10, 13, 20, 0.55);
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .otd-item-head {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .otd-item-title {
            font-size: 12px;
            font-weight: 700;
            flex: 1;
            min-width: 0;
            word-break: break-word;
        }
        .otd-pill {
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10px;
            border: 1px solid var(--otd-border);
            color: var(--otd-muted);
        }
        .otd-pill.ok { color: var(--otd-success); border-color: rgba(95, 209, 168, 0.45); }
        .otd-pill.fail { color: var(--otd-danger); border-color: rgba(255, 127, 127, 0.45); }
        .otd-item-meta,
        .otd-item-sub {
            font-size: 11px;
            color: var(--otd-muted);
            word-break: break-word;
        }
        @media (max-width: 720px) {
            #${PANEL_ID} {
                right: 10px;
                left: 10px;
                top: 70px;
                width: auto;
                max-height: calc(100vh - 84px);
            }
            .otd-grid-2,
            .otd-actions {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

const safeJson = (value: unknown, max = 800) => {
    try {
        const text = JSON.stringify(value);
        if (!text) return '';
        return text.length > max ? `${text.slice(0, max)}...` : text;
    } catch {
        return String(value);
    }
};

const apiFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof json?.error === 'string' ? json.error : `HTTP ${response.status}`;
        throw new Error(message);
    }
    return json as T;
};

class OTTourDownloadPanel {
    private options: TourDownloadOptions;
    private root: HTMLDivElement;
    private previewList: HTMLDivElement;
    private statusEl: HTMLDivElement;
    private summaryEl: HTMLDivElement;
    private jobList: HTMLDivElement;
    private countInput: HTMLInputElement;
    private outputInput: HTMLInputElement;
    private formatSelect: HTMLSelectElement;
    private qualitySelect: HTMLSelectElement;
    private coordinateSelect: HTMLSelectElement;
    private planeSelect: HTMLSelectElement;
    private skipExistingInput: HTMLInputElement;
    private matchButtons: Record<MatchMode, HTMLButtonElement>;
    private previewButton: HTMLButtonElement;
    private importChromeButton: HTMLButtonElement;
    private authButton: HTMLButtonElement;
    private confirmAuthButton: HTMLButtonElement;
    private downloadButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private closeButton: HTMLButtonElement;
    private tagButtons = new Map<string, HTMLButtonElement>();
    private selectedTags = new Set<string>(['curated']);
    private matchMode: MatchMode = 'all';
    private previewResults: SearchResult[] = [];
    private currentJobId: string | null = null;
    private pollTimer = 0;
    private lastRenderedJobSignature = '';

    constructor(options: TourDownloadOptions) {
        this.options = options;
        ensureStyle();

        this.root = document.createElement('div');
        this.root.id = PANEL_ID;
        this.root.classList.add('hidden');

        const header = document.createElement('div');
        header.className = 'otd-header';

        const badge = document.createElement('div');
        badge.className = 'otd-badge';
        badge.textContent = 'TD';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'otd-title-wrap';

        const title = document.createElement('div');
        title.className = 'otd-title';
        title.textContent = 'Tour Download';

        const subtitle = document.createElement('div');
        subtitle.className = 'otd-subtitle';
        subtitle.textContent = 'Batch download Marble public worlds by tag';

        this.closeButton = document.createElement('button');
        this.closeButton.className = 'otd-close';
        this.closeButton.type = 'button';
        this.closeButton.textContent = 'x';

        titleWrap.append(title, subtitle);
        header.append(badge, titleWrap, this.closeButton);

        const content = document.createElement('div');
        content.className = 'otd-content';

        const tagCard = document.createElement('div');
        tagCard.className = 'otd-card';
        tagCard.appendChild(this.makeTitle('Tags'));
        const tagGrid = document.createElement('div');
        tagGrid.className = 'otd-tag-grid';
        TAG_OPTIONS.forEach((tag) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'otd-tag-btn';
            button.textContent = tag.label;
            if (this.selectedTags.has(tag.id)) button.classList.add('active');
            button.addEventListener('click', () => this.toggleTag(tag.id));
            this.tagButtons.set(tag.id, button);
            tagGrid.appendChild(button);
        });
        tagCard.appendChild(tagGrid);

        const configCard = document.createElement('div');
        configCard.className = 'otd-card';
        configCard.appendChild(this.makeTitle('Download Config'));

        const gridTop = document.createElement('div');
        gridTop.className = 'otd-grid-2';
        this.countInput = this.makeInput('number', '6');
        this.countInput.min = '1';
        this.countInput.max = '50';
        this.outputInput = this.makeInput('text', DEFAULT_OUTPUT_DIR);
        gridTop.append(
            this.makeField('Download count', this.countInput),
            this.makeField('Output folder', this.outputInput)
        );

        const gridMid = document.createElement('div');
        gridMid.className = 'otd-grid-2';
        this.formatSelect = this.makeSelect([
            ['spz', 'SPZ'],
            ['ply', 'PLY']
        ]);
        this.formatSelect.value = 'ply';
        this.qualitySelect = this.makeSelect([
            ['100k', 'Low-res (100k)'],
            ['500k', 'Medium (500k)'],
            ['full_res', 'Full res']
        ]);
        this.qualitySelect.value = 'full_res';
        gridMid.append(
            this.makeField('File format', this.formatSelect),
            this.makeField('Quality', this.qualitySelect)
        );

        const gridBottom = document.createElement('div');
        gridBottom.className = 'otd-grid-2';
        this.coordinateSelect = this.makeSelect([
            ['opengl', 'OpenGL'],
            ['opencv', 'OpenCV']
        ]);
        this.planeSelect = this.makeSelect([
            ['ground', 'Ground level'],
            ['eye', 'Eye level']
        ]);
        gridBottom.append(
            this.makeField('Coordinate system', this.coordinateSelect),
            this.makeField('Plane level', this.planeSelect)
        );

        const matchWrap = document.createElement('div');
        matchWrap.className = 'otd-field';
        const matchLabel = document.createElement('label');
        matchLabel.textContent = 'Tag match mode';
        const matchSeg = document.createElement('div');
        matchSeg.className = 'otd-seg';
        const allButton = document.createElement('button');
        allButton.type = 'button';
        allButton.className = 'otd-seg-btn active';
        allButton.textContent = 'Match all';
        const anyButton = document.createElement('button');
        anyButton.type = 'button';
        anyButton.className = 'otd-seg-btn';
        anyButton.textContent = 'Match any';
        allButton.addEventListener('click', () => this.setMatchMode('all'));
        anyButton.addEventListener('click', () => this.setMatchMode('any'));
        this.matchButtons = { all: allButton, any: anyButton };
        matchSeg.append(allButton, anyButton);
        matchWrap.append(matchLabel, matchSeg);

        this.skipExistingInput = document.createElement('input');
        this.skipExistingInput.type = 'checkbox';
        this.skipExistingInput.checked = true;
        const skipExistingWrap = document.createElement('label');
        skipExistingWrap.className = 'otd-inline-check';
        skipExistingWrap.append(this.skipExistingInput, document.createTextNode('Skip existing downloads'));

        const actions = document.createElement('div');
        actions.className = 'otd-actions';
        this.previewButton = document.createElement('button');
        this.previewButton.type = 'button';
        this.previewButton.className = 'otd-btn ghost';
        this.previewButton.textContent = 'Preview';
        this.importChromeButton = document.createElement('button');
        this.importChromeButton.type = 'button';
        this.importChromeButton.className = 'otd-btn ghost';
        this.importChromeButton.textContent = 'Import';
        this.authButton = document.createElement('button');
        this.authButton.type = 'button';
        this.authButton.className = 'otd-btn ghost';
        this.authButton.textContent = 'Login';
        this.confirmAuthButton = document.createElement('button');
        this.confirmAuthButton.type = 'button';
        this.confirmAuthButton.className = 'otd-btn ghost';
        this.confirmAuthButton.textContent = 'Confirm';
        this.downloadButton = document.createElement('button');
        this.downloadButton.type = 'button';
        this.downloadButton.className = 'otd-btn primary';
        this.downloadButton.textContent = 'Start';
        this.stopButton = document.createElement('button');
        this.stopButton.type = 'button';
        this.stopButton.className = 'otd-btn warn';
        this.stopButton.textContent = 'Stop';
        this.stopButton.disabled = true;
        actions.append(this.previewButton, this.importChromeButton, this.authButton, this.confirmAuthButton, this.downloadButton, this.stopButton);

        const note = document.createElement('div');
        note.className = 'otd-note';
        note.textContent = 'PLY is the default mode. Recommended flow: Import Chrome session -> Confirm -> Start. Existing downloads are skipped by default.';

        configCard.append(gridTop, gridMid, gridBottom, matchWrap, skipExistingWrap, actions, note);

        const previewCard = document.createElement('div');
        previewCard.className = 'otd-card';
        previewCard.appendChild(this.makeTitle('Matched Worlds'));
        this.summaryEl = document.createElement('div');
        this.summaryEl.className = 'otd-summary';
        this.summaryEl.textContent = 'No preview yet.';
        this.previewList = document.createElement('div');
        this.previewList.className = 'otd-result-list';
        previewCard.append(this.summaryEl, this.previewList);

        const jobCard = document.createElement('div');
        jobCard.className = 'otd-card';
        jobCard.appendChild(this.makeTitle('Job Progress'));
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'otd-status';
        this.statusEl.textContent = 'Idle.';
        this.jobList = document.createElement('div');
        this.jobList.className = 'otd-job-list';
        jobCard.append(this.statusEl, this.jobList);

        content.append(tagCard, configCard, previewCard, jobCard);
        this.root.append(header, content);
        document.body.appendChild(this.root);

        this.closeButton.addEventListener('click', () => this.close());
        this.previewButton.addEventListener('click', () => {
            void this.runPreview();
        });
        this.importChromeButton.addEventListener('click', () => {
            void this.importChromeSession();
        });
        this.authButton.addEventListener('click', () => {
            void this.openAuthBrowser();
        });
        this.confirmAuthButton.addEventListener('click', () => {
            void this.confirmAuthLogin();
        });
        this.downloadButton.addEventListener('click', () => {
            void this.startJob();
        });
        this.stopButton.addEventListener('click', () => {
            void this.stopJob();
        });

        this.makeDraggable(header);
        this.logDebug('panel.ready', { apiBaseUrl: this.getApiBaseUrl() });
    }

    open() {
        this.root.classList.remove('hidden');
    }

    close() {
        this.root.classList.add('hidden');
    }

    toggle() {
        this.root.classList.toggle('hidden');
    }

    private makeTitle(text: string) {
        const el = document.createElement('div');
        el.className = 'otd-card-title';
        el.textContent = text;
        return el;
    }

    private makeInput(type: string, value: string) {
        const input = document.createElement('input');
        input.className = 'otd-input';
        input.type = type;
        input.value = value;
        return input;
    }

    private makeSelect(options: Array<[string, string]>) {
        const select = document.createElement('select');
        select.className = 'otd-select';
        options.forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        });
        return select;
    }

    private makeField(labelText: string, control: HTMLElement) {
        const wrap = document.createElement('div');
        wrap.className = 'otd-field';
        const label = document.createElement('label');
        label.textContent = labelText;
        wrap.append(label, control);
        return wrap;
    }

    private toggleTag(tagId: string) {
        if (this.selectedTags.has(tagId)) {
            if (this.selectedTags.size === 1) return;
            this.selectedTags.delete(tagId);
        } else {
            if (tagId === 'curated') this.selectedTags.clear();
            else this.selectedTags.delete('curated');
            this.selectedTags.add(tagId);
        }
        this.tagButtons.forEach((button, key) => {
            button.classList.toggle('active', this.selectedTags.has(key));
        });
    }

    private setMatchMode(mode: MatchMode) {
        this.matchMode = mode;
        this.matchButtons.all.classList.toggle('active', mode === 'all');
        this.matchButtons.any.classList.toggle('active', mode === 'any');
    }

    private getApiBaseUrl() {
        return this.options.apiBaseUrl || 'http://localhost:3034/api/ot-tour-download';
    }

    private logDebug(action: string, detail?: unknown) {
        const time = new Date().toLocaleTimeString();
        const suffix = detail === undefined ? '' : ` ${safeJson(detail, 2000)}`;
        const line = `[${time}] ${action}${suffix}`;
        const body = document.querySelector('#otw-debug [data-debug="body"]') as HTMLDivElement | null;
        if (body) {
            const row = document.createElement('div');
            row.className = 'otw-debug-row';
            row.innerHTML = `<span class="otw-debug-time">[${time}]</span><strong>${action}</strong>${suffix}`;
            body.appendChild(row);
            body.scrollTop = body.scrollHeight;
        }
        console.debug(line);
    }

    private setStatus(message: string, detail?: unknown) {
        this.statusEl.textContent = message;
        this.logDebug(`td.status:${message}`, detail);
    }

    private async checkBackendHealth(reason: string) {
        const url = `${this.getApiBaseUrl()}/health`;
        this.logDebug('health.check:start', { reason, url });
        try {
            const result = await apiFetch<{ ok: boolean; service: string; outputDir?: string }>(url);
            this.logDebug('health.check:ok', result);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logDebug('health.check:error', { reason, url, error: message });
            throw new Error(`TD backend unreachable: ${message}. Run npm run serve:ot-tour-download`);
        }
    }

    private async getAuthStatus() {
        const url = `${this.getApiBaseUrl()}/auth/status`;
        this.logDebug('auth.status.request', { url });
        const result = await apiFetch<AuthStatusResponse>(url);
        this.logDebug('auth.status.response', result);
        return result;
    }

    private async importChromeSession() {
        this.setBusy(true, 'Importing Chrome session...');
        try {
            await this.checkBackendHealth('auth-import');
            const url = `${this.getApiBaseUrl()}/auth/import-chrome-session`;
            this.logDebug('auth.import.request', { url });
            const result = await apiFetch<ImportChromeSessionResponse>(url, { method: 'POST' });
            this.setStatus(result.message, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'auth-import' });
        } finally {
            this.setBusy(false);
        }
    }

    private async openAuthBrowser() {
        this.setBusy(true, 'Opening Marble login helper...');
        try {
            await this.checkBackendHealth('auth-login');
            const url = `${this.getApiBaseUrl()}/auth/login`;
            this.logDebug('auth.login.request', { url });
            const result = await apiFetch<AuthStatusResponse>(url, { method: 'POST' });
            this.setStatus(result.message, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'auth-login' });
        } finally {
            this.setBusy(false);
        }
    }

    private async confirmAuthLogin() {
        this.setBusy(true, 'Confirming Marble login...');
        try {
            await this.checkBackendHealth('auth-confirm');
            const url = `${this.getApiBaseUrl()}/auth/confirm`;
            this.logDebug('auth.confirm.request', { url });
            const result = await apiFetch<AuthStatusResponse>(url, { method: 'POST' });
            this.setStatus(result.message, result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'auth-confirm' });
        } finally {
            this.setBusy(false);
        }
    }

    private async ensurePlySessionReady() {
        const status = await this.getAuthStatus();
        if (status.browserOpen && status.loggedIn) return status;
        const url = `${this.getApiBaseUrl()}/auth/login`;
        if (!status.browserOpen) {
            this.logDebug('auth.login.auto', { url });
            const result = await apiFetch<AuthStatusResponse>(url, { method: 'POST' });
            throw new Error(result.message);
        }
        throw new Error('Marble helper browser is open but login is not confirmed yet. Finish login there, click Confirm, then click Start.');
    }

    private getPayload(): TourDownloadPayload {
        return {
            tags: Array.from(this.selectedTags),
            count: clampInt(Number(this.countInput.value) || 1, 1, 50),
            matchMode: this.matchMode,
            fileFormat: this.formatSelect.value as FileFormat,
            quality: this.qualitySelect.value as Quality,
            coordinateSystem: this.coordinateSelect.value as CoordinateSystem,
            planeLevel: this.planeSelect.value as PlaneLevel,
            outputDir: (this.outputInput.value || DEFAULT_OUTPUT_DIR).trim() || DEFAULT_OUTPUT_DIR,
            skipExisting: this.skipExistingInput.checked
        };
    }

    private async runPreview() {
        const payload = this.getPayload();
        this.logDebug('preview.click', payload);
        this.setBusy(true, 'Fetching Marble matches...');
        try {
            await this.checkBackendHealth('preview');
            const url = `${this.getApiBaseUrl()}/search`;
            this.logDebug('preview.request', { url, payload });
            const result = await apiFetch<{ worlds: SearchResult[]; message: string }>(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.previewResults = result.worlds;
            this.summaryEl.innerHTML = `<strong>${result.worlds.length}</strong> world(s) ready. ${result.message}`;
            this.renderPreviewList();
            this.setStatus('Preview updated.', { count: result.worlds.length, message: result.message });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'preview', payload });
        } finally {
            this.setBusy(false);
        }
    }

    private async startJob() {
        const payload = this.getPayload();
        this.logDebug('start.click', payload);
        this.setBusy(true, 'Starting download job...');
        try {
            await this.checkBackendHealth('start');
            if (payload.fileFormat === 'ply') {
                await this.ensurePlySessionReady();
            }
            const url = `${this.getApiBaseUrl()}/jobs`;
            this.logDebug('start.request', { url, payload });
            const result = await apiFetch<JobResponse>(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.currentJobId = result.jobId;
            this.stopButton.disabled = false;
            this.logDebug('start.response', { jobId: result.jobId, status: result.status, total: result.total });
            this.renderJob(result);
            this.startPolling();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'start', payload });
        } finally {
            this.previewButton.disabled = false;
            this.downloadButton.disabled = false;
        }
    }

    private async stopJob() {
        if (!this.currentJobId) return;
        this.stopButton.disabled = true;
        try {
            const url = `${this.getApiBaseUrl()}/jobs/${encodeURIComponent(this.currentJobId)}/cancel`;
            this.logDebug('stop.request', { jobId: this.currentJobId, url });
            const result = await apiFetch<JobResponse>(url, {
                method: 'POST'
            });
            this.renderJob(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(message, { phase: 'stop', jobId: this.currentJobId });
        }
    }

    private startPolling() {
        this.stopPolling();
        this.logDebug('poll.start', { jobId: this.currentJobId });
        const tick = async () => {
            if (!this.currentJobId) return;
            try {
                const url = `${this.getApiBaseUrl()}/jobs/${encodeURIComponent(this.currentJobId)}`;
                const result = await apiFetch<JobResponse>(url);
                this.renderJob(result);
                if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
                    this.logDebug('poll.done', { jobId: result.jobId, status: result.status });
                    this.stopPolling();
                    this.stopButton.disabled = true;
                    return;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.setStatus(message, { phase: 'poll', jobId: this.currentJobId });
                this.stopPolling();
                return;
            }
            this.pollTimer = window.setTimeout(() => {
                void tick();
            }, 1000);
        };
        void tick();
    }

    private stopPolling() {
        if (this.pollTimer) {
            window.clearTimeout(this.pollTimer);
            this.pollTimer = 0;
        }
        this.logDebug('poll.stop', { jobId: this.currentJobId });
    }

    private renderPreviewList() {
        this.previewList.innerHTML = '';
        if (!this.previewResults.length) {
            const empty = document.createElement('div');
            empty.className = 'otd-item-sub';
            empty.textContent = 'No worlds matched the current filter.';
            this.previewList.appendChild(empty);
            return;
        }
        this.previewResults.forEach((world) => {
            const item = document.createElement('div');
            item.className = 'otd-item';
            const head = document.createElement('div');
            head.className = 'otd-item-head';
            const title = document.createElement('div');
            title.className = 'otd-item-title';
            title.textContent = world.displayName;
            const pill = document.createElement('div');
            pill.className = 'otd-pill';
            pill.textContent = world.availableFormats.join('/').toUpperCase();
            head.append(title, pill);
            const meta = document.createElement('div');
            meta.className = 'otd-item-meta';
            meta.textContent = `@${world.ownerUsername} | ${world.tags.join(', ')}`;
            const sub = document.createElement('div');
            sub.className = 'otd-item-sub';
            sub.textContent = `${world.availableQualities.join(', ')} | ${world.worldUrl}`;
            item.append(head, meta, sub);
            this.previewList.appendChild(item);
        });
    }

    private renderJob(job: JobResponse) {
        const signature = JSON.stringify({
            status: job.status,
            completed: job.completed,
            total: job.total,
            downloaded: job.downloaded,
            skipped: job.skipped,
            failed: job.failed,
            items: job.items.map((item) => [item.worldId, item.status, item.message, item.filePath || ''])
        });
        if (signature !== this.lastRenderedJobSignature) {
            this.logDebug('job.update', {
                jobId: job.jobId,
                status: job.status,
                progress: `${job.completed}/${job.total}`,
                downloaded: job.downloaded,
                skipped: job.skipped,
                failed: job.failed,
                message: job.message,
                warnings: job.warnings,
                items: job.items
            });
            this.lastRenderedJobSignature = signature;
        }
        this.statusEl.innerHTML = `<strong>${job.status.toUpperCase()}</strong> - ${job.message} (${job.completed}/${job.total})`;
        this.jobList.innerHTML = '';
        if (job.warnings.length) {
            const warning = document.createElement('div');
            warning.className = 'otd-item-sub';
            warning.textContent = job.warnings.join(' | ');
            this.jobList.appendChild(warning);
        }
        job.items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'otd-item';
            const head = document.createElement('div');
            head.className = 'otd-item-head';
            const title = document.createElement('div');
            title.className = 'otd-item-title';
            title.textContent = item.displayName;
            const pill = document.createElement('div');
            pill.className = `otd-pill ${item.status === 'downloaded' ? 'ok' : item.status === 'failed' ? 'fail' : ''}`;
            pill.textContent = item.status;
            head.append(title, pill);
            const meta = document.createElement('div');
            meta.className = 'otd-item-meta';
            meta.textContent = item.message || item.worldId;
            row.append(head, meta);
            if (item.filePath) {
                const sub = document.createElement('div');
                sub.className = 'otd-item-sub';
                sub.textContent = item.filePath;
                row.appendChild(sub);
            }
            this.jobList.appendChild(row);
        });
    }

    private setBusy(busy: boolean, message?: string) {
        this.previewButton.disabled = busy;
        this.importChromeButton.disabled = busy;
        this.authButton.disabled = busy;
        this.confirmAuthButton.disabled = busy;
        this.downloadButton.disabled = busy;
        if (message) this.setStatus(message, { busy });
    }

    private makeDraggable(handle: HTMLElement) {
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        const onMove = (event: PointerEvent) => {
            this.root.style.left = `${startLeft + event.clientX - startX}px`;
            this.root.style.top = `${startTop + event.clientY - startY}px`;
            this.root.style.right = 'auto';
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointerdown', (event) => {
            if ((event.target as HTMLElement)?.closest('button')) return;
            const rect = this.root.getBoundingClientRect();
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }
}

const mountOTTourDownloadPanel = (options: TourDownloadOptions): TourDownloadController => {
    const panel = new OTTourDownloadPanel(options);
    return {
        open: () => panel.open(),
        close: () => panel.close(),
        toggle: () => panel.toggle()
    };
};

export {
    mountOTTourDownloadPanel,
    type TourDownloadController
};
