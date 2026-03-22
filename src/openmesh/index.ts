import './openmesh.scss';

import {
    ADDRESS_CLAMP_TO_EDGE,
    AMBIENTSRC_ENVALATLAS,
    BLEND_NORMAL,
    BoundingBox,
    CULLFACE_BACK,
    CULLFACE_NONE,
    Color,
    Entity,
    EnvLighting,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    Mesh,
    MeshInstance,
    PlaneGeometry,
    PRIMITIVE_LINES,
    PROJECTION_PERSPECTIVE,
    Quat,
    RENDERSTYLE_SOLID,
    RENDERSTYLE_WIREFRAME,
    StandardMaterial,
    Texture,
    TONEMAP_ACES2,
    TEXTUREPROJECTION_EQUIRECT,
    Vec2,
    Vec3,
    calculateNormals,
    calculateTangents,
    createGraphicsDevice,
    math
} from 'playcanvas';

import { PCApp } from '../pc-app';
import { ViewCube } from './view-cube';

type LogLevel = 'info' | 'warn' | 'error';

type BronzePreset = {
    id: string;
    label: string;
    folderName: string;
    objUrl: string;
    mtlUrl: string;
    tbsceneUrl: string;
    referenceImageUrl: string;
    displayMode: string;
    classifiedMaterialsUrl?: string;
    fidelityManifestUrl?: string;
    mviewSceneUrl?: string;
};

type MaterialSeed = {
    name: string;
    diffuse?: string;
};

type MaterialTextures = {
    diffuse?: string;
    normal?: string;
    ao?: string;
    roughness?: string;
    metalness?: string;
    reflectivity?: string;
    invertGloss?: boolean;
};

type MaterialProfile = {
    metalness: number;
    gloss: number;
    aoIntensity: number;
    normalStrength: number;
    anisotropy: number;
};

type FidelityMaterialEntry = {
    albedo?: string;
    normal?: string;
    metalness?: string;
    roughnessOrGloss?: string;
    ao?: string;
    invertGloss?: boolean;
};

type FidelityManifest = {
    presentation?: {
        materials?: Partial<MaterialProfile>;
    };
};

type MviewScene = {
    mainCamera?: {
        view?: { fov?: number; };
        post?: {
            sharpen?: number;
            grain?: number;
        };
    };
    sky?: {
        backgroundBrightness?: number;
        backgroundColor?: [number, number, number, number?];
    };
    materials?: Array<{
        name: string;
        albedoTex?: string;
        normalTex?: string;
        glossTex?: string;
        reflectivityTex?: string;
    }>;
};

type GeometryChunk = {
    materialName: string;
    positions: Float32Array;
    normals: Float32Array;
    tangents?: Float32Array;
    uvs?: Float32Array;
    indices: Uint32Array | Uint16Array;
    faceCount: number;
    vertexCount: number;
    bounds: BoundingBox;
};

type ModelBundle = {
    chunks: GeometryChunk[];
    bounds: BoundingBox;
    vertexCount: number;
    faceCount: number;
    materialCount: number;
};

type UILayer = {
    app: HTMLDivElement;
    overlay: HTMLDivElement;
    canvas: HTMLCanvasElement;
    status: HTMLSpanElement;
    spinner: HTMLDivElement;
    spinnerLabel: HTMLDivElement;
    loaderNote: HTMLParagraphElement;
    stats: Record<'vertices' | 'triangles' | 'materials' | 'textures', HTMLDivElement>;
    rotation: Record<'x' | 'y' | 'z', HTMLSpanElement>;
    buttons: {
        loadPreset: HTMLButtonElement;
        loadFolder: HTMLButtonElement;
        fit: HTMLButtonElement;
        reset: HTMLButtonElement;
        wireframe: HTMLButtonElement;
        grid: HTMLButtonElement;
        axis: HTMLButtonElement;
    };
    directoryInput: HTMLInputElement;
    consoleLog: HTMLDivElement;
    consoleToggle: HTMLButtonElement;
    consoleClear: HTMLButtonElement;
    consoleCopy: HTMLButtonElement;
    loaderToggle: HTMLButtonElement;
    consoleRoot: HTMLDivElement;
    loaderRoot: HTMLDivElement;
    panels: HTMLDivElement[];
};

type TextureCacheEntry = {
    texture: Texture;
    key: string;
};

type MaterialRuntimeState = {
    material: StandardMaterial;
    near: {
        diffuseMap?: Texture | null;
        normalMap?: Texture | null;
        aoMap?: Texture | null;
        glossMap?: Texture | null;
        metalnessMap?: Texture | null;
        bumpiness: number;
        gloss: number;
        metalness: number;
        aoIntensity: number;
    };
    far: {
        diffuseMap?: Texture | null;
        normalMap?: Texture | null;
        aoMap?: Texture | null;
        glossMap?: Texture | null;
        metalnessMap?: Texture | null;
        bumpiness: number;
        gloss: number;
        metalness: number;
        aoIntensity: number;
    };
    mode: 'near' | 'far';
};

type MaterialLodMode = 'near' | 'far' | 'locked-near';

type ResourceReader = {
    readText: (relativePath: string, encoding?: string) => Promise<string>;
    getUrl: (relativePath: string) => string;
    list?: () => string[];
};

type FolderFileMap = Map<string, File>;

const WORKSPACE_ENV_URL = 'static/env/VertebraeHDRI_v1_512.png';
const CAMERA_FOV = 26;
const CAMERA_NEAR = 5.0;
const CAMERA_FAR = 5000;
const LOG_MAX_LINES = 400;
const DEFAULT_MATERIAL_PROFILE: MaterialProfile = {
    metalness: 0.18,
    gloss: 0.58,
    aoIntensity: 0.26,
    normalStrength: 0.62,
    anisotropy: 16
};

class DebugConsole {
    private readonly root: HTMLDivElement;

    private readonly logEl: HTMLDivElement;

    private readonly toggleButton: HTMLButtonElement;

    private readonly lines: HTMLDivElement[] = [];

    collapsed = true;

    constructor(root: HTMLDivElement, logEl: HTMLDivElement, toggleButton: HTMLButtonElement) {
        this.root = root;
        this.logEl = logEl;
        this.toggleButton = toggleButton;
        this.root.classList.add('collapsed');
        this.toggleButton.textContent = 'Expand';
    }

    log(level: LogLevel, message: string) {
        const row = document.createElement('div');
        row.className = `openmesh-log-line ${level}`;

        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });

        const tag = document.createElement('span');
        tag.className = 'level';
        tag.textContent = level.toUpperCase();

        const body = document.createElement('span');
        body.className = 'message';
        body.textContent = message;

        row.append(time, tag, body);
        this.logEl.appendChild(row);
        this.lines.push(row);
        while (this.lines.length > LOG_MAX_LINES) {
            this.lines.shift()?.remove();
        }
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    clear() {
        this.lines.splice(0).forEach((line) => line.remove());
    }

    copy() {
        const text = this.lines.map((line) => line.textContent || '').join('\n');
        void navigator.clipboard.writeText(text);
    }

    toggle() {
        this.collapsed = !this.collapsed;
        this.root.classList.toggle('collapsed', this.collapsed);
        this.root.classList.toggle('expanded', !this.collapsed);
        this.toggleButton.textContent = this.collapsed ? 'Expand' : 'Collapse';
    }
}

class OrbitCameraController {
    readonly target = new Vec3(0, 220, 0);

    yaw = 28;

    pitch = -16;

    distance = 1720;

    private desiredTarget = this.target.clone();

    private desiredYaw = this.yaw;

    private desiredPitch = this.pitch;

    private desiredDistance = this.distance;

    private pointerState: { mode: 'orbit' | 'pan' | 'none'; x: number; y: number; pointerId: number } = {
        mode: 'none',
        x: 0,
        y: 0,
        pointerId: -1
    };

    constructor(private readonly cameraEntity: Entity, private readonly dom: HTMLElement) {
        dom.addEventListener('contextmenu', (event) => event.preventDefault());
        dom.addEventListener('pointerdown', this.onPointerDown);
        dom.addEventListener('pointermove', this.onPointerMove);
        dom.addEventListener('pointerup', this.onPointerUp);
        dom.addEventListener('pointercancel', this.onPointerUp);
        dom.addEventListener('wheel', this.onWheel, { passive: false });
    }

    private onPointerDown = (event: PointerEvent) => {
        this.dom.setPointerCapture(event.pointerId);
        this.pointerState.pointerId = event.pointerId;
        this.pointerState.x = event.clientX;
        this.pointerState.y = event.clientY;
        this.pointerState.mode = event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
    };

    private onPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerState.pointerId || this.pointerState.mode === 'none') return;
        const dx = event.clientX - this.pointerState.x;
        const dy = event.clientY - this.pointerState.y;
        this.pointerState.x = event.clientX;
        this.pointerState.y = event.clientY;

        if (this.pointerState.mode === 'orbit') {
            this.desiredYaw -= dx * 0.16;
            this.desiredPitch = math.clamp(this.desiredPitch - dy * 0.16, -89, 89);
        } else {
            const scale = this.desiredDistance * 0.0012;
            const right = this.cameraEntity.right.clone().mulScalar(-dx * scale);
            const up = this.cameraEntity.up.clone().mulScalar(dy * scale);
            this.desiredTarget.add(right).add(up);
        }
    };

    private onPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerState.pointerId) return;
        this.pointerState.mode = 'none';
        this.pointerState.pointerId = -1;
        this.dom.releasePointerCapture(event.pointerId);
    };

    private onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const factor = Math.exp(event.deltaY * 0.001);
        this.desiredDistance = math.clamp(this.desiredDistance * factor, 10, 8000);
    };

    align(axis: string) {
        switch (axis) {
            case 'px':
                this.desiredYaw = 90;
                this.desiredPitch = 0;
                break;
            case 'nx':
                this.desiredYaw = 270;
                this.desiredPitch = 0;
                break;
            case 'py':
                this.desiredYaw = 0;
                this.desiredPitch = -89;
                break;
            case 'ny':
                this.desiredYaw = 180;
                this.desiredPitch = 89;
                break;
            case 'pz':
                this.desiredYaw = 0;
                this.desiredPitch = 0;
                break;
            case 'nz':
                this.desiredYaw = 180;
                this.desiredPitch = 0;
                break;
        }
    }

    setFocus(bounds: BoundingBox, fitPadding = 1.04) {
        this.target.copy(bounds.center);
        this.desiredTarget.copy(bounds.center);
        const radius = Math.max(bounds.halfExtents.length(), 1);
        const halfFov = CAMERA_FOV * 0.5 * math.DEG_TO_RAD;
        const fitDistance = (radius * fitPadding) / Math.sin(Math.max(halfFov, 0.12));
        this.distance = fitDistance;
        this.desiredDistance = fitDistance;
    }

    reset(bounds: BoundingBox) {
        this.desiredYaw = 28;
        this.desiredPitch = -16;
        this.setFocus(bounds, 1.12);
    }

    update(deltaTime: number) {
        const t = Math.min(1, deltaTime * 7.5);
        this.target.lerp(this.target, this.desiredTarget, t);
        this.yaw = math.lerp(this.yaw, this.desiredYaw, t);
        this.pitch = math.lerp(this.pitch, this.desiredPitch, t);
        this.distance = math.lerp(this.distance, this.desiredDistance, t);

        const yaw = this.yaw * math.DEG_TO_RAD;
        const pitch = this.pitch * math.DEG_TO_RAD;
        const x = Math.sin(yaw) * Math.cos(pitch) * this.distance;
        const y = Math.sin(-pitch) * this.distance;
        const z = Math.cos(yaw) * Math.cos(pitch) * this.distance;
        this.cameraEntity.setPosition(this.target.x + x, this.target.y + y, this.target.z + z);
        this.cameraEntity.lookAt(this.target);
    }
}

const makePanelsDraggable = (container: HTMLElement, panels: HTMLElement[]) => {
    const containerRect = () => container.getBoundingClientRect();

    panels.forEach((panel) => {
        const rect = panel.getBoundingClientRect();
        const rootRect = containerRect();
        panel.style.position = 'absolute';
        panel.style.left = `${rect.left - rootRect.left}px`;
        panel.style.top = `${rect.top - rootRect.top}px`;
        panel.style.width = `${rect.width}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        panel.addEventListener('pointerdown', (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, input, select, textarea, a, #openmesh-console-log')) return;
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = parseFloat(panel.style.left || '0');
            startTop = parseFloat(panel.style.top || '0');
            panel.classList.add('dragging');
            panel.setPointerCapture(event.pointerId);
        });

        panel.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            const rootRectLive = containerRect();
            const nextLeft = Math.max(0, Math.min(rootRectLive.width - panel.offsetWidth, startLeft + event.clientX - startX));
            const nextTop = Math.max(0, Math.min(rootRectLive.height - panel.offsetHeight, startTop + event.clientY - startY));
            panel.style.left = `${nextLeft}px`;
            panel.style.top = `${nextTop}px`;
        });

        const stop = (event: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('dragging');
            panel.releasePointerCapture(event.pointerId);
        };

        panel.addEventListener('pointerup', stop);
        panel.addEventListener('pointercancel', stop);
    });
};

const formatInt = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));

const decodeLatinText = async (response: Response) => {
    const buffer = await response.arrayBuffer();
    return new TextDecoder('latin1').decode(buffer);
};

const loadImageElement = (url: string, crossOrigin = false) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
});

const createFilteredCanvas = (image: HTMLImageElement, targetSize: number, blurPx: number) => {
    const scale = Math.min(1, targetSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = 'none';
    return canvas;
};

const createIcon = (pathDef: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', pathDef);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
};

const makePanel = (className?: string) => {
    const panel = document.createElement('div');
    panel.className = `openmesh-panel${className ? ` ${className}` : ''}`;
    return panel;
};

const makeStat = (label: string) => {
    const root = document.createElement('div');
    root.className = 'openmesh-stat';
    const value = document.createElement('div');
    value.className = 'openmesh-stat-value';
    value.textContent = '--';
    const title = document.createElement('div');
    title.className = 'openmesh-stat-label';
    title.textContent = label;
    root.append(value, title);
    return { root, value };
};

const createUI = (): UILayer => {
    const app = document.createElement('div');
    app.id = 'openmesh-app';

    const canvasShell = document.createElement('div');
    canvasShell.id = 'openmesh-canvas-shell';

    const canvas = document.createElement('canvas');
    canvas.id = 'openmesh-canvas';
    canvasShell.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.id = 'openmesh-overlay';

    const loader = makePanel();
    loader.id = 'openmesh-loader';
    loader.classList.add('hidden');
    const loaderTitle = document.createElement('div');
    loaderTitle.className = 'openmesh-section-title';
    loaderTitle.textContent = 'Source Loader';
    const actions = document.createElement('div');
    actions.className = 'openmesh-actions';
    const loadPreset = document.createElement('button');
    loadPreset.className = 'openmesh-button primary';
    loadPreset.type = 'button';
    loadPreset.textContent = 'Load Bronze Preset';
    const loadFolder = document.createElement('button');
    loadFolder.className = 'openmesh-button';
    loadFolder.type = 'button';
    loadFolder.textContent = 'Load Local Folder';
    actions.append(loadPreset, loadFolder);

    const toggles = document.createElement('div');
    toggles.className = 'openmesh-toggle-grid';
    const fit = document.createElement('button');
    fit.className = 'openmesh-toggle';
    fit.type = 'button';
    fit.textContent = 'Fit View';
    const reset = document.createElement('button');
    reset.className = 'openmesh-toggle';
    reset.type = 'button';
    reset.textContent = 'Reset';
    const wireframe = document.createElement('button');
    wireframe.className = 'openmesh-toggle';
    wireframe.type = 'button';
    wireframe.textContent = 'Wireframe';
    const grid = document.createElement('button');
    grid.className = 'openmesh-toggle';
    grid.type = 'button';
    grid.textContent = 'Grid';
    const axis = document.createElement('button');
    axis.className = 'openmesh-toggle';
    axis.type = 'button';
    axis.textContent = 'Axis';
    toggles.append(fit, reset, wireframe, grid, axis);

    const loaderNote = document.createElement('p');
    loaderNote.id = 'openmesh-loader-note';
    loaderNote.textContent = '默认走工作区铜车马预设；也支持拖目录载入任意 OBJ/MTL/STL 资产。';

    loader.append(loaderTitle, actions, toggles, loaderNote);

    const viewCubeShell = makePanel();
    viewCubeShell.id = 'openmesh-view-cube-shell';

    const statsPanel = makePanel();
    statsPanel.id = 'openmesh-stats';
    const vertices = makeStat('Vertices');
    const triangles = makeStat('Triangles');
    const materials = makeStat('Materials');
    const textures = makeStat('Textures');
    [vertices, triangles, materials, textures].forEach((entry) => statsPanel.appendChild(entry.root));

    const gizmoPanel = makePanel();
    gizmoPanel.id = 'openmesh-gizmo-panel';
    const gizmoTitle = document.createElement('div');
    gizmoTitle.className = 'openmesh-section-title';
    gizmoTitle.textContent = 'Rotation Readout';
    const rotationReadout = document.createElement('div');
    rotationReadout.id = 'openmesh-rotation-readout';
    const rotationChips = {
        x: document.createElement('span'),
        y: document.createElement('span'),
        z: document.createElement('span')
    };
    (Object.keys(rotationChips) as Array<keyof typeof rotationChips>).forEach((axisName) => {
        const chip = document.createElement('div');
        chip.className = 'openmesh-rotation-chip';
        const axisLabel = document.createElement('span');
        axisLabel.className = 'axis';
        axisLabel.textContent = axisName.toUpperCase();
        rotationChips[axisName].className = 'value';
        rotationChips[axisName].textContent = '0.0 deg';
        chip.append(axisLabel, rotationChips[axisName]);
        rotationReadout.appendChild(chip);
    });
    gizmoPanel.append(gizmoTitle, rotationReadout);

    const consoleRoot = makePanel();
    consoleRoot.id = 'openmesh-console';
    const consoleHead = document.createElement('div');
    consoleHead.id = 'openmesh-console-head';
    const consoleInfo = document.createElement('div');
    consoleInfo.id = 'openmesh-console-info';
    const consoleTitle = document.createElement('div');
    consoleTitle.id = 'openmesh-console-title';
    consoleTitle.textContent = 'Debug';
    const status = document.createElement('span');
    status.id = 'openmesh-status';
    status.textContent = 'Booting OpenMesh...';
    consoleInfo.append(consoleTitle, status);
    const consoleActions = document.createElement('div');
    consoleActions.id = 'openmesh-console-actions';
    const toggleLoader = document.createElement('button');
    toggleLoader.className = 'openmesh-console-button';
    toggleLoader.type = 'button';
    toggleLoader.textContent = 'Source Loader';
    const clearConsole = document.createElement('button');
    clearConsole.className = 'openmesh-console-button';
    clearConsole.type = 'button';
    clearConsole.textContent = 'Clear';
    const copyConsole = document.createElement('button');
    copyConsole.className = 'openmesh-console-button';
    copyConsole.type = 'button';
    copyConsole.textContent = 'Copy';
    const toggleConsole = document.createElement('button');
    toggleConsole.className = 'openmesh-console-button';
    toggleConsole.type = 'button';
    toggleConsole.textContent = 'Expand';
    consoleActions.append(toggleLoader, clearConsole, copyConsole, toggleConsole);
    consoleHead.append(consoleInfo, consoleActions);
    const consoleLog = document.createElement('div');
    consoleLog.id = 'openmesh-console-log';
    consoleRoot.append(consoleHead, consoleLog);

    const spinner = document.createElement('div');
    spinner.id = 'openmesh-spinner';
    const spinnerLabel = document.createElement('div');
    spinnerLabel.id = 'openmesh-spinner-label';
    spinnerLabel.textContent = 'Loading bronze chariot...';
    spinner.appendChild(spinnerLabel);

    const directoryInput = document.createElement('input');
    directoryInput.type = 'file';
    directoryInput.multiple = true;
    directoryInput.setAttribute('webkitdirectory', 'true');
    directoryInput.hidden = true;

    overlay.append(loader, viewCubeShell, consoleRoot, spinner);
    app.append(canvasShell, overlay, directoryInput);
    document.body.appendChild(app);

    return {
        app,
        canvas,
        status,
        spinner,
        spinnerLabel,
        loaderNote,
        stats: {
            vertices: vertices.value,
            triangles: triangles.value,
            materials: materials.value,
            textures: textures.value
        },
        rotation: rotationChips,
        buttons: {
            loadPreset,
            loadFolder,
            fit,
            reset,
            wireframe,
            grid,
            axis
        },
        directoryInput,
        consoleLog,
        consoleToggle: toggleConsole,
        consoleClear: clearConsole,
        consoleCopy: copyConsole,
        loaderToggle: toggleLoader,
        consoleRoot,
        loaderRoot: loader,
        overlay,
        panels: [loader, viewCubeShell]
    };
};

const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');

const basename = (path: string) => normalizePath(path).split('/').pop() || normalizePath(path);

const createReaderFromBaseUrl = (baseUrl: string): ResourceReader => {
    const root = new URL(baseUrl, window.location.href);
    return ({
    readText: async (relativePath: string, encoding = 'utf-8') => {
        const response = await fetch(new URL(relativePath, root).toString());
        if (!response.ok) throw new Error(`Failed to fetch ${relativePath} (${response.status})`);
        if (encoding === 'latin1') return decodeLatinText(response);
        return response.text();
    },
    getUrl: (relativePath: string) => new URL(relativePath, root).toString()
    });
};

const createReaderFromFiles = (files: File[]): ResourceReader => {
    const byPath: FolderFileMap = new Map();
    const byBaseName: FolderFileMap = new Map();
    files.forEach((file) => {
        const path = normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
        byPath.set(path, file);
        byBaseName.set(basename(path), file);
    });

    const resolveFile = (relativePath: string) => {
        const clean = normalizePath(relativePath);
        return byPath.get(clean) || byBaseName.get(basename(clean)) || null;
    };

    const objectUrlCache = new Map<File, string>();
    return {
        readText: async (relativePath: string, encoding = 'utf-8') => {
            const file = resolveFile(relativePath);
            if (!file) throw new Error(`Missing file ${relativePath}`);
            if (encoding === 'latin1') {
                return new TextDecoder('latin1').decode(await file.arrayBuffer());
            }
            return file.text();
        },
        getUrl: (relativePath: string) => {
            const file = resolveFile(relativePath);
            if (!file) throw new Error(`Missing file ${relativePath}`);
            if (!objectUrlCache.has(file)) {
                objectUrlCache.set(file, URL.createObjectURL(file));
            }
            return objectUrlCache.get(file);
        },
        list: () => [...byPath.keys()]
    };
};

const parseMtl = (source: string) => {
    const materials = new Map<string, MaterialSeed>();
    let current: MaterialSeed | null = null;
    source.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [keyword, ...rest] = trimmed.split(/\s+/);
        const value = rest.join(' ');
        if (keyword === 'newmtl') {
            current = { name: value };
            materials.set(value, current);
            return;
        }
        if (!current) return;
        if (keyword === 'map_Kd' || keyword === 'map_Ka') {
            current.diffuse = basename(value);
        }
    });
    return materials;
};

const parseTbsceneMaterials = (source: string, knownMaterials: Iterable<string>) => {
    const result = new Map<string, MaterialTextures>();
    const names = [...knownMaterials];
    names.forEach((name, index) => {
        const start = source.indexOf(name);
        if (start < 0) return;
        let end = source.length;
        for (let i = index + 1; i < names.length; i += 1) {
            const nextIndex = source.indexOf(names[i], start + name.length);
            if (nextIndex > start) {
                end = nextIndex;
                break;
            }
        }
        const block = source.slice(start, end);
        const grab = (expr: RegExp) => expr.exec(block)?.[1];
        const fix = (value?: string) => value ? normalizePath(value.replace(/^High\//i, 'Low/')) : undefined;
        result.set(name, {
            normal: fix(grab(/Normal Map = @Tex file "([^"]+)"/)),
            ao: fix(grab(/Roughness Map = @Tex file "([^"]+)"/)),
            diffuse: fix(grab(/Albedo Map = @Tex file "([^"]+)"/)),
            metalness: fix(grab(/Metalness Map = @Tex file "([^"]+)"/))
        });
    });
    return result;
};

const parseClassifiedMaterials = (source: Record<string, FidelityMaterialEntry>) => {
    const result = new Map<string, MaterialTextures>();
    Object.entries(source).forEach(([name, entry]) => {
        result.set(name, {
            diffuse: entry.albedo ? normalizePath(entry.albedo) : undefined,
            normal: entry.normal ? normalizePath(entry.normal) : undefined,
            roughness: entry.roughnessOrGloss ? normalizePath(entry.roughnessOrGloss) : undefined,
            ao: entry.ao ? normalizePath(entry.ao) : undefined,
            metalness: entry.metalness ? normalizePath(entry.metalness) : undefined,
            invertGloss: entry.invertGloss
        });
    });
    return result;
};

const parseMviewSceneMaterials = (scene: MviewScene, assetPrefix: string) => {
    const result = new Map<string, MaterialTextures>();
    const prefix = assetPrefix.endsWith('/') ? assetPrefix : `${assetPrefix}/`;
    scene.materials?.forEach((material) => {
        result.set(material.name, {
            diffuse: material.albedoTex ? `${prefix}${material.albedoTex}` : undefined,
            normal: material.normalTex ? `${prefix}${material.normalTex}` : undefined,
            roughness: material.glossTex ? `${prefix}${material.glossTex}` : undefined,
            reflectivity: material.reflectivityTex ? `${prefix}${material.reflectivityTex}` : undefined,
            invertGloss: false
        });
    });
    return result;
};

const mergeMaterialHints = (...sources: Array<Map<string, MaterialTextures> | null>) => {
    const merged = new Map<string, MaterialTextures>();
    sources.forEach((source) => {
        if (!source) return;
        source.forEach((entry, name) => {
            merged.set(name, {
                ...(merged.get(name) ?? {}),
                ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined))
            });
        });
    });
    return merged;
};

const loadOptionalJson = async <T>(url?: string): Promise<T | null> => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json() as T;
    } catch {
        return null;
    }
};

const parseObj = (source: string, logger: DebugConsole): ModelBundle => {
    const positions: number[] = [];
    const texcoords: number[] = [];
    const materialOrder: string[] = [];
    const chunks = new Map<string, { positions: number[]; uvs: number[]; indices: number[]; lookup: Map<string, number>; faceCount: number }>();
    let currentMaterial = 'default';

    const ensureChunk = (name: string) => {
        if (!chunks.has(name)) {
            chunks.set(name, { positions: [], uvs: [], indices: [], lookup: new Map(), faceCount: 0 });
            materialOrder.push(name);
        }
        return chunks.get(name);
    };

    ensureChunk(currentMaterial);

    const lines = source.split(/\r?\n/);
    logger.log('info', `OBJ parse start: ${formatInt(lines.length)} lines`);

    const addVertex = (chunkName: string, vertexToken: string) => {
        const chunk = ensureChunk(chunkName);
        const existing = chunk.lookup.get(vertexToken);
        if (existing !== undefined) return existing;

        const [vIndexText, vtIndexText] = vertexToken.split('/');
        const vIndex = Number(vIndexText);
        const vtIndex = vtIndexText ? Number(vtIndexText) : 0;
        const basePosition = (vIndex - 1) * 3;
        chunk.positions.push(
            positions[basePosition],
            positions[basePosition + 1],
            positions[basePosition + 2]
        );

        if (vtIndex > 0) {
            const baseUv = (vtIndex - 1) * 2;
            chunk.uvs.push(texcoords[baseUv], 1 - texcoords[baseUv + 1]);
        } else {
            chunk.uvs.push(0, 0);
        }

        const index = chunk.positions.length / 3 - 1;
        chunk.lookup.set(vertexToken, index);
        return index;
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex].trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.split(/\s+/);
        const keyword = parts[0];

        if (keyword === 'v') {
            positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
        } else if (keyword === 'vt') {
            texcoords.push(Number(parts[1]), Number(parts[2]));
        } else if (keyword === 'usemtl') {
            currentMaterial = parts.slice(1).join(' ');
            ensureChunk(currentMaterial);
        } else if (keyword === 'f') {
            const tokens = parts.slice(1);
            if (tokens.length < 3) continue;
            const a = addVertex(currentMaterial, tokens[0]);
            for (let i = 1; i < tokens.length - 1; i += 1) {
                const b = addVertex(currentMaterial, tokens[i]);
                const c = addVertex(currentMaterial, tokens[i + 1]);
                const chunk = ensureChunk(currentMaterial);
                chunk.indices.push(a, b, c);
                chunk.faceCount += 1;
            }
        }
    }

    const modelBounds = new BoundingBox();
    const modelMin = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const modelMax = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    const geometryChunks: GeometryChunk[] = [];
    let totalVertices = 0;
    let totalFaces = 0;

    materialOrder.forEach((materialName) => {
        const chunk = chunks.get(materialName);
        if (!chunk || chunk.indices.length === 0) return;
        const normals = calculateNormals(chunk.positions, chunk.indices);
        const tangents = chunk.uvs.length ? calculateTangents(chunk.positions, normals, chunk.uvs, chunk.indices) : undefined;
        const vertexCount = chunk.positions.length / 3;
        const faceCount = chunk.faceCount;

        const bounds = new BoundingBox();
        bounds.compute(chunk.positions, vertexCount);
        modelMin.min(bounds.getMin());
        modelMax.max(bounds.getMax());

        geometryChunks.push({
            materialName,
            positions: new Float32Array(chunk.positions),
            normals: new Float32Array(normals),
            tangents: tangents ? new Float32Array(tangents) : undefined,
            uvs: chunk.uvs.length ? new Float32Array(chunk.uvs) : undefined,
            indices: vertexCount > 65535 ? new Uint32Array(chunk.indices) : new Uint16Array(chunk.indices),
            faceCount,
            vertexCount,
            bounds
        });
        totalVertices += vertexCount;
        totalFaces += faceCount;
    });

    modelBounds.setMinMax(modelMin, modelMax);
    logger.log('info', `OBJ parse done: ${formatInt(totalVertices)} vertices, ${formatInt(totalFaces)} triangles, ${formatInt(geometryChunks.length)} material chunks`);

    return {
        chunks: geometryChunks,
        bounds: modelBounds,
        vertexCount: totalVertices,
        faceCount: totalFaces,
        materialCount: geometryChunks.length
    };
};

const parseStl = (buffer: ArrayBuffer, logger: DebugConsole): ModelBundle => {
    const bytes = new Uint8Array(buffer);
    const dataView = new DataView(buffer);
    const triangleCount = dataView.getUint32(80, true);
    const isBinary = 84 + triangleCount * 50 === bytes.byteLength;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    if (isBinary) {
        for (let tri = 0; tri < triangleCount; tri += 1) {
            const offset = 84 + tri * 50;
            const nx = dataView.getFloat32(offset, true);
            const ny = dataView.getFloat32(offset + 4, true);
            const nz = dataView.getFloat32(offset + 8, true);
            for (let i = 0; i < 3; i += 1) {
                const vertexOffset = offset + 12 + i * 12;
                positions.push(
                    dataView.getFloat32(vertexOffset, true),
                    dataView.getFloat32(vertexOffset + 4, true),
                    dataView.getFloat32(vertexOffset + 8, true)
                );
                normals.push(nx, ny, nz);
                indices.push(indices.length);
            }
        }
    } else {
        const source = new TextDecoder().decode(buffer);
        const matches = [...source.matchAll(/facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)[\s\S]*?outer loop\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)[\s\S]*?endfacet/gi)];
        matches.forEach((match) => {
            const nx = Number(match[1]);
            const ny = Number(match[2]);
            const nz = Number(match[3]);
            for (let i = 0; i < 3; i += 1) {
                const base = 4 + i * 3;
                positions.push(Number(match[base]), Number(match[base + 1]), Number(match[base + 2]));
                normals.push(nx, ny, nz);
                indices.push(indices.length);
            }
        });
    }

    const bounds = new BoundingBox();
    bounds.compute(positions, positions.length / 3);
    logger.log('info', `STL parse done: ${formatInt(indices.length / 3)} triangles`);

    return {
        chunks: [{
            materialName: 'stl-default',
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
            faceCount: indices.length / 3,
            vertexCount: positions.length / 3,
            bounds
        }],
        bounds,
        vertexCount: positions.length / 3,
        faceCount: indices.length / 3,
        materialCount: 1
    };
};

class OpenMeshApp {
    private readonly ui = createUI();

    private readonly logger = new DebugConsole(this.ui.consoleRoot, this.ui.consoleLog, this.ui.consoleToggle);

    private app: PCApp | null = null;

    private cameraEntity: Entity | null = null;

    private gridEntity: Entity | null = null;

    private axisEntity: Entity | null = null;

    private viewCube: ViewCube;

    private controls: OrbitCameraController | null = null;

    private modelRoot: Entity | null = null;

    private readonly textureCache = new Map<string, TextureCacheEntry>();

    private readonly meshInstances: MeshInstance[] = [];

    private readonly materialStates: MaterialRuntimeState[] = [];

    private studioRoot: Entity | null = null;

    private currentBounds = new BoundingBox(new Vec3(0, 220, 0), new Vec3(180, 180, 180));

    private currentTextureCount = 0;

    private lodSwitchDistance = 2200;

    private lodHysteresis = 260;

    private materialLodMode: MaterialLodMode = 'locked-near';

    constructor() {
        this.viewCube = new ViewCube((axis) => this.controls?.align(axis));
        document.getElementById('openmesh-view-cube-shell')?.appendChild(this.viewCube.dom);
        this.ui.consoleClear.addEventListener('click', () => this.logger.clear());
        this.ui.consoleCopy.addEventListener('click', () => this.logger.copy());
        this.ui.consoleToggle.addEventListener('click', () => this.logger.toggle());
        this.bindUi();
        requestAnimationFrame(() => makePanelsDraggable(this.ui.overlay, this.ui.panels));
    }

    async boot() {
        this.logger.log('info', 'OpenMesh boot start');
        const device = await createGraphicsDevice(this.ui.canvas, {
            deviceTypes: ['webgl2'],
            antialias: true,
            depth: true,
            stencil: false,
            xrCompatible: false,
            powerPreference: 'high-performance'
        });

        this.app = new PCApp(this.ui.canvas, { graphicsDevice: device });
        this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.app.scene.clusteredLightingEnabled = false;
        this.app.scene.ambientLight = new Color(0.02, 0.02, 0.02);
        this.app.scene.ambientLuminance = 0;
        this.app.scene.exposure = 4.2;
        this.app.scene.physicalUnits = false;
        this.app.scene.skyboxIntensity = 3.0;
        (this.app.scene as any).ambientSource = AMBIENTSRC_ENVALATLAS;

        this.modelRoot = new Entity('openmesh-model-root');
        this.app.root.addChild(this.modelRoot);

        this.cameraEntity = new Entity('openmesh-camera');
        this.cameraEntity.addComponent('camera', {
            fov: CAMERA_FOV,
            nearClip: CAMERA_NEAR,
            farClip: CAMERA_FAR,
            projection: PROJECTION_PERSPECTIVE,
            clearColor: new Color(0, 0, 0, 0),
            toneMapping: TONEMAP_ACES2,
            layers: [this.app.scene.layers.getLayerByName('World').id]
        });
        this.app.root.addChild(this.cameraEntity);

        this.controls = new OrbitCameraController(this.cameraEntity, this.ui.canvas);

        this.installLights();
        this.gridEntity = this.createGridEntity();
        this.axisEntity = this.createAxisEntity();
        this.app.root.addChild(this.gridEntity);
        this.app.root.addChild(this.axisEntity);
        this.gridEntity.enabled = false;
        this.axisEntity.enabled = false;

        this.app.on('update', (dt: number) => {
            this.controls?.update(dt);
            this.updateMaterialLod();
            if (this.cameraEntity) {
                this.viewCube.update(this.cameraEntity.getWorldTransform());
            }
            if (this.modelRoot) {
                const eulers = this.modelRoot.getLocalEulerAngles();
                this.ui.rotation.x.textContent = `${eulers.x.toFixed(1)} deg`;
                this.ui.rotation.y.textContent = `${eulers.y.toFixed(1)} deg`;
                this.ui.rotation.z.textContent = `${eulers.z.toFixed(1)} deg`;
            }
        });

        const resize = () => {
            if (!this.app || !this.cameraEntity) return;
            const width = this.ui.canvas.clientWidth;
            const height = this.ui.canvas.clientHeight;
            this.app.resizeCanvas(width, height);
            this.cameraEntity.camera.aspectRatio = width / Math.max(height, 1);
        };
        new ResizeObserver(resize).observe(this.ui.app);
        resize();

        await this.installEnvironment();

        this.app.start();
        this.logger.log('info', 'PlayCanvas scene ready');
        this.logger.log('warn', 'Floor removed for stability: remaining shimmer came from the presentation floor layer, so OpenMesh now renders against the background only while keeping the stable directional lighting and full PBR materials.');
        
        await this.loadBronzePreset();
    }

    private bindUi() {
        this.ui.loaderToggle.addEventListener('click', () => {
            const active = !this.ui.loaderRoot.classList.contains('visible');
            this.ui.loaderRoot.classList.toggle('visible', active);
            this.ui.loaderRoot.classList.toggle('hidden', !active);
            this.ui.loaderToggle.classList.toggle('active', active);
        });
        this.ui.buttons.loadPreset.addEventListener('click', () => {
            void this.loadBronzePreset();
        });
        this.ui.buttons.loadFolder.addEventListener('click', () => {
            this.ui.directoryInput.click();
        });
        this.ui.buttons.fit.addEventListener('click', () => {
            this.controls?.setFocus(this.currentBounds);
        });
        this.ui.buttons.reset.addEventListener('click', () => {
            this.controls?.reset(this.currentBounds);
        });
        this.ui.buttons.wireframe.addEventListener('click', () => {
            const active = !this.ui.buttons.wireframe.classList.contains('active');
            this.ui.buttons.wireframe.classList.toggle('active', active);
            this.meshInstances.forEach((instance) => {
                instance.renderStyle = active ? RENDERSTYLE_WIREFRAME : RENDERSTYLE_SOLID;
            });
        });
        this.ui.buttons.grid.addEventListener('click', () => {
            const active = !this.ui.buttons.grid.classList.contains('active');
            this.ui.buttons.grid.classList.toggle('active', active);
            if (this.gridEntity) this.gridEntity.enabled = active;
        });
        this.ui.buttons.axis.addEventListener('click', () => {
            const active = !this.ui.buttons.axis.classList.contains('active');
            this.ui.buttons.axis.classList.toggle('active', active);
            if (this.axisEntity) this.axisEntity.enabled = active;
        });
        this.ui.directoryInput.addEventListener('change', () => {
            const files = Array.from(this.ui.directoryInput.files || []);
            if (!files.length) return;
            void this.loadFromReader(createReaderFromFiles(files), 'Local Folder');
            this.ui.directoryInput.value = '';
        });
    }

    private installLights() {
        if (!this.app) return;
        this.logger.log('info', 'Scheme 1 fidelity renderer: analytical lights disabled, pure IBL shading active');
    }

    private createGridEntity() {
        if (!this.app) throw new Error('App not initialized');

        const positions: number[] = [];
        const colors = new Uint8Array([]);
        const extent = 1600;
        const step = 80;
        for (let i = -extent; i <= extent; i += step) {
            positions.push(-extent, 0, i, extent, 0, i);
            positions.push(i, 0, -extent, i, 0, extent);
        }
        const colorData = new Uint8Array((positions.length / 3) * 4);
        for (let i = 0; i < colorData.length; i += 4) {
            colorData[i] = 100;
            colorData[i + 1] = 116;
            colorData[i + 2] = 137;
            colorData[i + 3] = 90;
        }
        const mesh = new Mesh(this.app.graphicsDevice);
        mesh.setPositions(positions);
        mesh.setColors32(colorData);
        mesh.update(PRIMITIVE_LINES, false);
        const material = new StandardMaterial();
        material.useLighting = false;
        material.opacity = 0.5;
        material.blendType = BLEND_NORMAL;
        material.depthWrite = false;
        material.update();
        const instance = new MeshInstance(mesh, material, null);
        instance.cull = false;
        const entity = new Entity('openmesh-grid');
        entity.addComponent('render', { meshInstances: [instance] });
        return entity;
    }

    private createAxisEntity() {
        if (!this.app) throw new Error('App not initialized');
        const positions = [
            0, 0, 0, 340, 0, 0,
            0, 0, 0, 0, 340, 0,
            0, 0, 0, 0, 0, 340
        ];
        const colors = new Uint8Array([
            240, 111, 90, 255, 240, 111, 90, 255,
            145, 219, 132, 255, 145, 219, 132, 255,
            120, 167, 255, 255, 120, 167, 255, 255
        ]);
        const mesh = new Mesh(this.app.graphicsDevice);
        mesh.setPositions(positions);
        mesh.setColors32(colors);
        mesh.update(PRIMITIVE_LINES, false);
        const material = new StandardMaterial();
        material.useLighting = false;
        material.update();
        const instance = new MeshInstance(mesh, material, null);
        instance.cull = false;
        const entity = new Entity('openmesh-axis');
        entity.addComponent('render', { meshInstances: [instance] });
        return entity;
    }

    private async installEnvironment() {
        if (!this.app) return;

        const image = await loadImageElement(WORKSPACE_ENV_URL);
        const texture = new Texture(this.app.graphicsDevice, {
            name: 'openmesh-env-source',
            projection: TEXTUREPROJECTION_EQUIRECT,
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        this.app.scene.envAtlas = EnvLighting.generateAtlas(texture, { size: 1024 });
        this.logger.log('info', 'Environment atlas installed for reflections');
    }

    private async loadBronzePreset() {
        this.setSpinner(true, 'Loading bronze chariot preset...');
        this.ui.status.textContent = 'Requesting bronze chariot preset...';
        const response = await fetch('/api/presets/bronze-chariot');
        if (!response.ok) {
            throw new Error(`Preset metadata unavailable (${response.status})`);
        }
        const preset = await response.json() as BronzePreset;
        this.logger.log('info', `Preset selected: ${preset.label}`);
        const baseRoot = preset.objUrl.slice(0, preset.objUrl.indexOf('/Low/'));
        await this.loadFromReader(createReaderFromBaseUrl(`${baseRoot}/`), preset.label, {
            ...preset,
            objUrl: 'Low/B.1.13119.obj',
            mtlUrl: 'Low/B.1.13119.mtl',
            tbsceneUrl: 'B.1.13119.tbscene',
            referenceImageUrl: '渲染图.png',
            classifiedMaterialsUrl: '/static/showcase2/bronze-chariot/classified-materials.json',
            fidelityManifestUrl: '/static/showcase2/bronze-chariot/manifest.json',
            mviewSceneUrl: `${baseRoot}/mview-extracted/scene.json`
        });
    }

    private setSpinner(active: boolean, label: string) {
        this.ui.spinner.classList.toggle('visible', active);
        this.ui.spinnerLabel.textContent = label;
    }

    private async loadTexture(url: string, srgb: boolean) {
        if (!this.app) throw new Error('App not initialized');
        const key = `${url}|near|${srgb ? 'srgb' : 'linear'}`;
        if (this.textureCache.has(key)) {
            return this.textureCache.get(key).texture;
        }
        const image = await loadImageElement(url, true);
        const texture = new Texture(this.app.graphicsDevice, {
            name: basename(url),
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        texture.srgb = srgb;
        texture.anisotropy = this.app.graphicsDevice.maxAnisotropy;
        this.textureCache.set(key, { texture, key });
        return texture;
    }

    private clearModel() {
        if (this.modelRoot) this.modelRoot.enabled = false;
        this.materialStates.length = 0;
        this.meshInstances.splice(0).forEach((instance) => {
            instance.mesh.destroy();
            instance.material.destroy();
        });
        this.modelRoot?.children.slice().forEach((child) => child.destroy());
        this.meshInstances.length = 0;
        this.currentTextureCount = 0;
    }

    private async loadFromReader(reader: ResourceReader, label: string, preset?: BronzePreset) {
        try {
            this.setSpinner(true, `Loading ${label}...`);
            this.ui.status.textContent = `Loading ${label}...`;
            this.logger.log('info', `Loading asset source: ${label}`);

            this.clearModel();

            const isStl = reader.list?.().some((entry) => entry.toLowerCase().endsWith('.stl')) || false;
            if (isStl && !preset) {
                const stlName = reader.list().find((entry) => entry.toLowerCase().endsWith('.stl'));
                if (!stlName) throw new Error('No STL file found in selected folder');
                const stlResponse = await fetch(reader.getUrl(stlName));
                const model = parseStl(await stlResponse.arrayBuffer(), this.logger);
                await this.mountModel(model, new Map(), reader, label, false);
                return;
            }

            const objName = preset?.objUrl || reader.list?.().find((entry) => entry.toLowerCase().endsWith('.obj')) || 'B.1.13119.obj';
            const mtlName = preset?.mtlUrl || reader.list?.().find((entry) => entry.toLowerCase().endsWith('.mtl')) || 'B.1.13119.mtl';
            const tbsceneName = preset?.tbsceneUrl || reader.list?.().find((entry) => entry.toLowerCase().endsWith('.tbscene')) || '';

            const [objSource, mtlSource, tbsceneSource] = await Promise.all([
                reader.readText(objName, 'latin1'),
                reader.readText(mtlName, 'latin1'),
                tbsceneName ? reader.readText(tbsceneName, 'latin1').catch(() => '') : Promise.resolve('')
            ]);

            const materialSeeds = parseMtl(mtlSource);
            const [classifiedSource, fidelityManifest, mviewScene] = await Promise.all([
                loadOptionalJson<Record<string, FidelityMaterialEntry>>(preset?.classifiedMaterialsUrl),
                loadOptionalJson<FidelityManifest>(preset?.fidelityManifestUrl),
                loadOptionalJson<MviewScene>(preset?.mviewSceneUrl)
            ]);
            const mviewAssetPrefix = preset?.mviewSceneUrl ? preset.mviewSceneUrl.replace(/\/scene\.json$/i, '') : '';
            const directMviewHints = mviewScene?.materials?.length ? parseMviewSceneMaterials(mviewScene, mviewAssetPrefix) : null;
            const classifiedHints = classifiedSource ? parseClassifiedMaterials(classifiedSource as Record<string, FidelityMaterialEntry>) : null;
            const tbsceneHints = tbsceneSource ? parseTbsceneMaterials(tbsceneSource, materialSeeds.keys()) : null;
            const materialHints = mergeMaterialHints(tbsceneHints, classifiedHints, directMviewHints);
            const materialProfile: MaterialProfile = {
                ...DEFAULT_MATERIAL_PROFILE,
                ...(fidelityManifest?.presentation?.materials ?? {})
            };
            const model = parseObj(objSource, this.logger);

            if (mviewScene?.mainCamera?.view?.fov && this.cameraEntity?.camera) {
                this.cameraEntity.camera.fov = mviewScene.mainCamera.view.fov;
            }
            if (mviewScene?.mainCamera?.post) {
                this.ui.canvas.style.filter = 'contrast(1.04) saturate(1.12)';
            }
            if (mviewScene?.sky?.backgroundColor && this.cameraEntity?.camera) {
                const [r, g, b, a = 1] = mviewScene.sky.backgroundColor;
                const brightness = mviewScene.sky.backgroundBrightness ?? 1;
                const finalColor = new Color(r * brightness, g * brightness, b * brightness, a);
                this.cameraEntity.camera.clearColor = finalColor;
                const cssColor = `rgb(${Math.round(finalColor.r * 255)} ${Math.round(finalColor.g * 255)} ${Math.round(finalColor.b * 255)})`;
                document.body.style.background = cssColor;
                this.ui.app.style.background = cssColor;
            }

            this.logger.log('info', mviewScene?.materials?.length
                ? `Mview fidelity pipeline active: ${materialHints.size} merged materials from scene.json + classified mview maps`
                : classifiedSource
                    ? `Mview fidelity fallback active: ${materialHints.size} classified materials loaded from extracted mview hints`
                    : `Material pipeline: ${materialSeeds.size} seeds from MTL, ${materialHints.size} enhanced entries from tbscene`);
            await this.mountModel(model, materialHints, reader, label, true, materialProfile, mviewScene);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.log('error', message);
            this.ui.status.textContent = `Load failed: ${message}`;
            throw error;
        } finally {
            this.setSpinner(false, 'Ready');
        }
    }

    private async mountModel(model: ModelBundle, materialHints: Map<string, MaterialTextures>, reader: ResourceReader, label: string, usePbr: boolean, materialProfile: MaterialProfile = DEFAULT_MATERIAL_PROFILE, mviewScene?: MviewScene | null) {
        if (!this.app || !this.modelRoot) return;

        const loadedTextureUrls = new Set<string>();
        this.setSpinner(true, `Binding ${model.materialCount} materials...`);

        for (const chunk of model.chunks) {
            const geometry = Mesh.fromGeometry(this.app.graphicsDevice, {
                positions: chunk.positions as any,
                normals: chunk.normals as any,
                tangents: chunk.tangents as any,
                uvs: chunk.uvs as any,
                indices: chunk.indices as any
            } as any);

            const material = new StandardMaterial();
            material.name = chunk.materialName;
            material.useMetalness = true;
            material.diffuse = new Color(1, 1, 1);
            material.metalness = materialProfile.metalness;
            material.gloss = materialProfile.gloss;
            material.bumpiness = materialProfile.normalStrength;
            material.cull = CULLFACE_BACK;
            material.occludeSpecular = 1;
            material.specular.set(0.18, 0.18, 0.18);
            material.emissive.set(0, 0, 0);

            const runtimeState: MaterialRuntimeState = {
                material,
                near: {
                    bumpiness: materialProfile.normalStrength,
                    gloss: materialProfile.gloss,
                    metalness: materialProfile.metalness,
                    aoIntensity: materialProfile.aoIntensity
                },
                far: {
                    bumpiness: materialProfile.normalStrength,
                    gloss: materialProfile.gloss,
                    metalness: materialProfile.metalness,
                    aoIntensity: materialProfile.aoIntensity
                },
                mode: 'near'
            };

            if (usePbr) {
                const textureSet = materialHints.get(chunk.materialName);
                if (textureSet?.diffuse) {
                    const url = reader.getUrl(textureSet.diffuse);
                    runtimeState.near.diffuseMap = await this.loadTexture(url, true);
                    runtimeState.far.diffuseMap = runtimeState.near.diffuseMap;
                    material.diffuseMap = runtimeState.near.diffuseMap;
                    loadedTextureUrls.add(url);
                }
                if (textureSet?.normal) {
                    const url = reader.getUrl(textureSet.normal);
                    runtimeState.near.normalMap = await this.loadTexture(url, false);
                    runtimeState.far.normalMap = runtimeState.near.normalMap;
                    material.normalMap = runtimeState.near.normalMap;
                    material.bumpiness = runtimeState.near.bumpiness;
                    loadedTextureUrls.add(url);
                }
                if (textureSet?.ao) {
                    const url = reader.getUrl(textureSet.ao);
                    runtimeState.near.aoMap = await this.loadTexture(url, false);
                    runtimeState.far.aoMap = runtimeState.near.aoMap;
                    material.aoMap = runtimeState.near.aoMap;
                    material.aoMapChannel = 'r';
                    material.aoIntensity = runtimeState.near.aoIntensity;
                    loadedTextureUrls.add(url);
                }
                if (textureSet?.roughness) {
                    const url = reader.getUrl(textureSet.roughness);
                    const glossTexture = await this.loadTexture(url, false);
                    runtimeState.near.glossMap = glossTexture;
                    runtimeState.far.glossMap = glossTexture;
                    material.glossMap = glossTexture;
                    material.glossMapChannel = 'r';
                    material.glossInvert = textureSet.invertGloss ?? false;
                    loadedTextureUrls.add(url);
                }
                if (textureSet?.metalness) {
                    const url = reader.getUrl(textureSet.metalness);
                    runtimeState.near.metalnessMap = await this.loadTexture(url, false);
                    runtimeState.far.metalnessMap = runtimeState.near.metalnessMap;
                    material.metalnessMap = runtimeState.near.metalnessMap;
                    material.metalnessMapChannel = 'r';
                    loadedTextureUrls.add(url);
                } else if (textureSet?.reflectivity) {
                    const url = reader.getUrl(textureSet.reflectivity);
                    runtimeState.near.metalnessMap = await this.loadTexture(url, false);
                    runtimeState.far.metalnessMap = runtimeState.near.metalnessMap;
                    material.specularMap = runtimeState.near.metalnessMap;
                    material.specularMapChannel = 'r';
                    loadedTextureUrls.add(url);
                }
            } else {
                material.diffuse = new Color(0.72, 0.58, 0.36);
                material.useMetalness = true;
                material.metalness = 0.1;
                material.gloss = 0.58;
                material.cull = CULLFACE_NONE;
                runtimeState.near.metalness = 0.1;
                runtimeState.near.gloss = 0.58;
                runtimeState.far.metalness = 0.06;
                runtimeState.far.gloss = 0.5;
            }

            material.update();
            this.materialStates.push(runtimeState);

            const entity = new Entity(`mesh-${chunk.materialName}`);
            const meshInstance = new MeshInstance(geometry, material, entity);
            entity.addComponent('render', {
                meshInstances: [meshInstance],
                castShadows: false,
                receiveShadows: false
            });
            this.modelRoot.addChild(entity);
            this.meshInstances.push(meshInstance);
        }

        const originalMin = model.bounds.getMin().clone();
        const originalMax = model.bounds.getMax().clone();
        const offset = new Vec3(
            -((originalMin.x + originalMax.x) * 0.5),
            -originalMin.y,
            -((originalMin.z + originalMax.z) * 0.5)
        );
        this.currentTextureCount = loadedTextureUrls.size;
        this.updateStats(model);

        this.lodSwitchDistance = Math.max(model.bounds.halfExtents.length() * 2.2, 1200);

        this.modelRoot.setLocalPosition(offset);
        this.currentBounds.setMinMax(originalMin.clone().add(offset), originalMax.clone().add(offset));
        this.fitStudioToBounds(this.currentBounds);
        if (this.gridEntity) {
            this.gridEntity.setLocalPosition(0, -Math.max(6, model.bounds.halfExtents.y * 0.02), 0);
        }
        this.controls?.reset(this.currentBounds);
        this.updateMaterialLod(true);
        this.modelRoot.enabled = true;
        this.ui.status.textContent = `${label} ready for capture`;
        this.logger.log('info', `${label} mounted: ${formatInt(model.vertexCount)} vertices, ${formatInt(model.faceCount)} triangles, ${formatInt(this.currentTextureCount)} texture slots`);
        this.logger.log('info', 'Stability fix active: texture LOD is locked to near mode, so wheel zoom no longer swaps materials while you zoom in or out.');
    }

    private updateStats(model: ModelBundle) {
        this.ui.stats.vertices.textContent = formatInt(model.vertexCount);
        this.ui.stats.triangles.textContent = formatInt(model.faceCount);
        this.ui.stats.materials.textContent = formatInt(model.materialCount);
        this.ui.stats.textures.textContent = formatInt(this.currentTextureCount);
    }

    private fitStudioToBounds(_bounds: BoundingBox) {}

    private updateMaterialLod(force = false) {
        if (!this.controls || !this.materialStates.length) return;
        let desiredMode: 'near' | 'far' = 'near';
        if (this.materialLodMode !== 'locked-near') {
            desiredMode = this.materialStates[0]?.mode ?? 'near';
            if (this.controls.distance > this.lodSwitchDistance + this.lodHysteresis) {
                desiredMode = 'far';
            } else if (this.controls.distance < this.lodSwitchDistance - this.lodHysteresis) {
                desiredMode = 'near';
            }
        }
        this.materialStates.forEach((state) => {
            if (!force && state.mode === desiredMode) return;
            state.mode = desiredMode;
            const profile = desiredMode === 'near' ? state.near : state.far;
            state.material.diffuseMap = profile.diffuseMap ?? null;
            state.material.normalMap = profile.normalMap ?? null;
            state.material.aoMap = profile.aoMap ?? null;
            state.material.glossMap = profile.glossMap ?? null;
            state.material.specularMap = null;
            state.material.metalnessMap = profile.metalnessMap ?? null;
            state.material.bumpiness = profile.bumpiness;
            state.material.gloss = profile.gloss;
            state.material.metalness = profile.metalness;
            state.material.aoIntensity = profile.aoIntensity;
            state.material.update();
        });
    }
}

const app = new OpenMeshApp();
void app.boot().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    document.querySelector<HTMLParagraphElement>('#openmesh-status')?.replaceChildren(`Boot failed: ${message}`);
    console.error(error);
});
