import {
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    TTS_VOICE_OPTIONS_BY_MODEL,
    CSV_ICON_DELETE
} from '../constants';
import {
    describeTimingValue,
    escapeCsv,
    formatCsvTimingSummary,
    normalizeCsvTimingConfig,
    normalizeCsvVoiceConfig,
    summarizeCsvVoiceConfig
} from '../utils';
import {
    type CsvTimingConfigState,
    type CsvTimingSummary,
    type CsvVersionSummary,
    type CsvVoiceConfigState,
    type TtsVoiceOption
} from '../types';

export const parseCsvText = (csvText: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    const text = String(csvText || '');
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            row.push(cell);
            cell = '';
            continue;
        }
        if (ch === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        if (ch === '\r') continue;
        cell += ch;
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    if (rows.length < 1) return { headers: [], rows: [] as string[][] };
    const headers = rows[0].map((item) => String(item || ''));
    const width = Math.max(1, headers.length);
    const body = rows.slice(1).map((item) => {
        const out = item.slice(0, width).map((v) => String(v || ''));
        while (out.length < width) out.push('');
        return out;
    });
    return { headers, rows: body };
};

export const buildCsvTextFromGrid = (headers: string[], rows: string[][], fallbackText: string) => {
    if (headers.length < 1) return String(fallbackText || '');
    const width = headers.length;
    const lines: string[] = [];
    lines.push(headers.map((item) => escapeCsv(item)).join(','));
    rows.forEach((row) => {
        const cols = row.slice(0, width).map((item) => escapeCsv(item));
        while (cols.length < width) cols.push('');
        lines.push(cols.join(','));
    });
    return lines.join('\n');
};

export const renderCsvGrid = (options: {
    tableEl: HTMLTableElement;
    wrapEl: HTMLDivElement;
    headers: string[];
    rows: string[][];
    onDeleteRow: (rowIndex: number) => void;
    onEditContent: (rowIndex: number, colIndex: number) => void;
    onInputCell: (rowIndex: number, colIndex: number, value: string) => void;
}) => {
    const { tableEl, wrapEl, headers, rows, onDeleteRow, onEditContent, onInputCell } = options;
    tableEl.innerHTML = '';
    if (headers.length < 1) {
        const empty = document.createElement('div');
        empty.className = 'otl-muted';
        empty.style.padding = '10px';
        empty.textContent = 'No CSV content';
        wrapEl.innerHTML = '';
        wrapEl.appendChild(empty);
        return;
    }
    wrapEl.innerHTML = '';
    wrapEl.appendChild(tableEl);
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const rowActionTh = document.createElement('th');
    rowActionTh.className = 'row-action';
    rowActionTh.textContent = '#';
    headRow.appendChild(rowActionTh);
    headers.forEach((header) => {
        const th = document.createElement('th');
        th.textContent = header;
        headRow.appendChild(th);
    });
    head.appendChild(headRow);
    tableEl.appendChild(head);

    const body = document.createElement('tbody');
    if (rows.length < 1) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = headers.length + 1;
        td.className = 'otl-csv-grid-empty';
        td.textContent = 'No CSV rows';
        tr.appendChild(td);
        body.appendChild(tr);
    }
    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        const actionTd = document.createElement('td');
        actionTd.className = 'row-action';
        const tools = document.createElement('div');
        tools.className = 'otl-csv-row-tools';
        const rowNo = document.createElement('span');
        rowNo.className = 'otl-csv-row-index';
        rowNo.textContent = String(rowIndex + 1);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'otl-csv-row-delete';
        delBtn.title = `Delete row ${rowIndex + 1}`;
        delBtn.innerHTML = CSV_ICON_DELETE;
        delBtn.addEventListener('click', () => onDeleteRow(rowIndex));
        tools.appendChild(rowNo);
        tools.appendChild(delBtn);
        actionTd.appendChild(tools);
        tr.appendChild(actionTd);
        headers.forEach((headerName, colIndex) => {
            const td = document.createElement('td');
            const isContentCol = String(headerName || '').trim().toLowerCase() === 'content';
            if (isContentCol) {
                const preview = document.createElement('div');
                preview.className = 'otl-csv-content-cell';
                preview.textContent = String(row[colIndex] || '');
                preview.title = 'Click to edit content';
                preview.addEventListener('click', () => onEditContent(rowIndex, colIndex));
                td.appendChild(preview);
                tr.appendChild(td);
                return;
            }
            const input = document.createElement('input');
            input.className = 'otl-csv-grid-cell';
            input.type = 'text';
            input.value = String(row[colIndex] || '');
            input.addEventListener('input', () => onInputCell(rowIndex, colIndex, input.value));
            td.appendChild(input);
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
    tableEl.appendChild(body);
};

export const renderCsvVersionList = (options: {
    listEl: HTMLDivElement;
    versions: CsvVersionSummary[];
    selectedVersionId: number | null;
    selectAction: string;
}) => {
    const { listEl, versions, selectedVersionId, selectAction } = options;
    listEl.innerHTML = '';
    if (versions.length < 1) {
        const empty = document.createElement('div');
        empty.className = 'otl-muted';
        empty.textContent = 'No CSV versions yet';
        listEl.appendChild(empty);
        return;
    }
    const frag = document.createDocumentFragment();
    versions.forEach((version) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `otl-csv-version-item${version.id === selectedVersionId ? ' active' : ''}`;
        btn.setAttribute('data-act', selectAction);
        btn.setAttribute('data-version-id', String(version.id));
        const status = version.status === 'confirmed' ? 'confirmed' : 'draft';
        btn.textContent = `v${version.versionNo} ${status} ${version.updatedAt}`;
        frag.appendChild(btn);
    });
    listEl.appendChild(frag);
};

export const renderCsvVoiceConfig = (options: {
    config: CsvVoiceConfigState;
    enabledInput: HTMLInputElement;
    modelSelect: HTMLSelectElement;
    fixedSelect: HTMLSelectElement;
    listEl: HTMLDivElement;
    summaryEl: HTMLDivElement;
    itemRole: string;
}) => {
    const normalizedConfig = normalizeCsvVoiceConfig(options.config);
    const voiceOptions = TTS_VOICE_OPTIONS_BY_MODEL[normalizedConfig.model] || TTS_VOICE_OPTIONS_BY_MODEL[DEFAULT_TTS_MODEL] || [];
    options.enabledInput.checked = normalizedConfig.enabled;
    options.modelSelect.value = normalizedConfig.model;
    options.fixedSelect.innerHTML = voiceOptions.map((option) => `<option value="${option.value}">${option.label} - ${option.subtitle} (${option.value})</option>`).join('');
    options.fixedSelect.value = normalizedConfig.fixedVoice;
    const grouped = new Map<string, TtsVoiceOption[]>();
    voiceOptions.forEach((option) => {
        const list = grouped.get(option.group) || [];
        list.push(option);
        grouped.set(option.group, list);
    });
    options.listEl.innerHTML = '';
    grouped.forEach((items, group) => {
        const title = document.createElement('div');
        title.className = 'otl-voice-group-title';
        title.textContent = group;
        options.listEl.appendChild(title);
        items.forEach((option) => {
            const label = document.createElement('label');
            label.className = 'otl-voice-item';
            const checked = normalizedConfig.voicePool.includes(option.value);
            label.innerHTML = `
                <input type="checkbox" data-role="${options.itemRole}" value="${option.value}" ${checked ? 'checked' : ''} />
                <div class="otl-voice-item-main">
                    <div>${option.label} - ${option.subtitle}</div>
                    <div class="otl-voice-code">${option.value}</div>
                </div>
            `;
            options.listEl.appendChild(label);
        });
    });
    options.summaryEl.textContent = summarizeCsvVoiceConfig(normalizedConfig);
    return normalizedConfig;
};

export const renderCsvTimingConfig = (options: {
    config: CsvTimingConfigState;
    enabledInput: HTMLInputElement;
    timingInput: HTMLInputElement;
    minimumEl: HTMLDivElement;
    estimatedEl: HTMLDivElement;
    summaryEl: HTMLDivElement;
    summary: CsvTimingSummary | null;
}) => {
    const normalizedConfig = normalizeCsvTimingConfig(options.config);
    options.enabledInput.checked = normalizedConfig.enabled;
    options.timingInput.value = String(normalizedConfig.targetDurationSec);
    options.minimumEl.textContent = describeTimingValue(options.summary?.minimumAchievableSec);
    options.estimatedEl.textContent = describeTimingValue(options.summary?.estimatedDurationSec);
    options.summaryEl.textContent = normalizedConfig.enabled
        ? `Timing: ${formatCsvTimingSummary(options.summary || {
            enabled: true,
            targetDurationSec: normalizedConfig.targetDurationSec,
            minimumAchievableSec: options.summary?.minimumAchievableSec ?? null,
            estimatedDurationSec: options.summary?.estimatedDurationSec ?? null
        }) || `目标 ${normalizedConfig.targetDurationSec}s`}`
        : 'Timing: default generation';
    return normalizedConfig;
};

export const downloadCsvText = async (options: {
    csvText: string;
    fallbackName: string;
    preferSavePicker: boolean;
    onPickerFallback?: (error: unknown) => void;
}) => {
    const picker = options.preferSavePicker
        ? (window as Window & {
            showSaveFilePicker?: (pickerOptions: {
                suggestedName: string;
                types: Array<{ description: string; accept: Record<string, string[]> }>;
            }) => Promise<{ createWritable: () => Promise<{ write: (contents: string) => Promise<void>; close: () => Promise<void> }> }>;
        }).showSaveFilePicker
        : undefined;
    if (typeof picker === 'function') {
        try {
            const handle = await picker({
                suggestedName: options.fallbackName,
                types: [{
                    description: 'CSV file',
                    accept: { 'text/csv': ['.csv'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(options.csvText);
            await writable.close();
            return;
        } catch (error) {
            options.onPickerFallback?.(error);
        }
    }
    const blob = new Blob([options.csvText], { type: 'text/csv;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = options.fallbackName;
    a.click();
    URL.revokeObjectURL(blobUrl);
};
