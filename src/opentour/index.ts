import './opentour.scss';

import { WebPCodec } from '@playcanvas/splat-transform';
import { Color, Entity, Quat, StandardMaterial, Texture, Vec3, createGraphicsDevice } from 'playcanvas';

import { Events } from '../events';
import { MappedReadFileSystem } from '../io';
import { Scene } from '../scene';
import { getSceneConfig } from '../scene-config';
import { ShortcutManager } from '../shortcut-manager';
import { Shortcuts } from '../shortcuts';
import { ViewCube } from '../ui/view-cube';
import { ElementType } from '../element';
import { applyRightHandedAxisPreset } from './axis-presets';
import { mountStep3GimiDualViewPanel } from './step3-gimi-dualview-panel';
import { mountStep3DualViewPanel } from './step3-dualview-panel';
import { mountOpenTourWizardPanel } from './wizard-panel';
import type { CoordinateRotationPlan } from './OT_ModelLoader/algorithms/otml_projection_by_axis';

type ControlMode = 'orbit' | 'fly';
type LookDirection = 'left' | 'right' | 'up' | 'down';

type OTModelLoaderPanelController = {
    toggle: () => void;
};

type OTModelLoaderModule = {
    mountOTModelLoaderPanel: (options: {
        loadModelFile: (file: File) => Promise<void>;
        launcherButton?: HTMLButtonElement;
        applyRotateToCanonical?: (plan: CoordinateRotationPlan) => Promise<void> | void;
        resetModelToLoadedState?: () => Promise<void> | void;
        clearDbResiduals?: () => Promise<any>;
        previewFlyCamera?: (pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }, fovDeg: number) => Promise<void> | void;
        getLiveCameraPose?: () => { pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }; fovDeg: number } | null;
        getWorldSamplePoints?: () => Array<{ x: number; y: number; z: number; opacity: number }>;
    }) => OTModelLoaderPanelController;
};

type OTTourLoaderPanelController = {
    toggle: () => void;
};

type OTTourLoaderModule = {
    mountOTTourLoaderPanel: (options: {
        launcherButton?: HTMLButtonElement;
        getModelFilename: () => string | null;
        getWorldSamplePoints?: () => Array<{ x: number; y: number; z: number; opacity: number }>;
        getLiveCameraPose?: () => { pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }; fovDeg: number } | null;
        setLiveCameraPose?: (pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }, fovDeg: number) => Promise<void> | void;
        getCaptureCanvas?: () => HTMLCanvasElement | null;
        requestCaptureRender?: () => void;
        captureScreenshotPng?: () => Promise<string>;
        pickWorldPointAtScreen?: (x: number, y: number) => Promise<{ x: number; y: number; z: number } | null>;
        projectWorldToScreen?: (point: { x: number; y: number; z: number }) => { x: number; y: number; visible: boolean } | null;
        showEmbeddedMedia?: (spec: {
            mode: 'media-plane' | 'media-object';
            kind: 'image' | 'video';
            src: string;
            title?: string;
            caption?: string;
            anchorWorld: { x: number; y: number; z: number };
        } | null) => void;
        resolveAssetUrl?: (value: string) => string;
        apiBaseUrl?: string;
        onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
    }) => OTTourLoaderPanelController;
};

type OTCinematicWorkspacePanelController = {
    open: () => void;
    close: () => void;
    toggle: () => void;
    openCinematicWorkspace: () => Promise<void>;
    closeCinematicWorkspace: () => void;
};

type OTCinematicWorkspaceModule = {
    mountOTCinematicWorkspacePanel: (options: {
        launcherButton?: HTMLButtonElement;
        getModelFilename: () => string | null;
        getWorldSamplePoints?: () => Array<{ x: number; y: number; z: number; opacity: number }>;
        getLiveCameraPose?: () => { pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }; fovDeg: number } | null;
        setLiveCameraPose?: (pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }, fovDeg: number) => Promise<void> | void;
        getCaptureCanvas?: () => HTMLCanvasElement | null;
        requestCaptureRender?: () => void;
        captureScreenshotPng?: () => Promise<string>;
        pickWorldPointAtScreen?: (x: number, y: number) => Promise<{ x: number; y: number; z: number } | null>;
        projectWorldToScreen?: (point: { x: number; y: number; z: number }) => { x: number; y: number; visible: boolean } | null;
        showEmbeddedMedia?: (spec: {
            mode: 'media-plane' | 'media-object';
            kind: 'image' | 'video';
            src: string;
            title?: string;
            caption?: string;
            anchorWorld: { x: number; y: number; z: number };
        } | null) => void;
        resolveAssetUrl?: (value: string) => string;
        apiBaseUrl?: string;
        onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
    }) => OTCinematicWorkspacePanelController;
};

type OTTourPlayerPanelController = {
    toggle: () => void;
};

type OTTourPlayerModule = {
    mountOTTourPlayerPanel: (options: {
        launcherButton?: HTMLButtonElement;
        getModelFilename: () => string | null;
        getCaptureCanvas?: () => HTMLCanvasElement | null;
        requestCaptureRender?: () => void;
        getLiveCameraPose?: () => { pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }; fovDeg: number } | null;
        setLiveCameraPose?: (pose: { eye: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }, fovDeg: number) => Promise<void> | void;
        apiBaseUrl?: string;
        onModelLoaded?: (callback: (modelFilename: string | null) => void) => (() => void);
    }) => OTTourPlayerPanelController;
};

type OTTourDownloadPanelController = {
    toggle: () => void;
};

type OTTourDownloadModule = {
    mountOTTourDownloadPanel: (options: {
        launcherButton?: HTMLButtonElement;
        apiBaseUrl?: string;
    }) => OTTourDownloadPanelController;
};

type OTTourProducerPanelController = {
    toggle: () => void;
};

type OTTourProducerModule = {
    mountOTTourProducerPanel: (options: {
        launcherButton?: HTMLButtonElement;
        apiBaseUrl?: string;
        getModelFilename?: () => string | null;
    }) => OTTourProducerPanelController;
};

const ARROW_LOOK_SPEED = 90;

declare global {
    interface Window {
        opentour: {
            scene: Scene;
            events: Events;
        };
    }
}

const supportsModel = (filename: string) => {
    const lower = filename.toLowerCase();
    return ['.ply', '.splat', '.ksplat', '.spz', '.sog', '.json', '.lcc'].some(ext => lower.endsWith(ext));
};

const createToolIcon = (paths: string[], attrs: Record<string, string> = {}) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'opentour-tool-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    Object.entries(attrs).forEach(([key, value]) => svg.setAttribute(key, value));
    paths.forEach((d) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    });
    return svg;
};

const bootstrapUI = () => {
    const app = document.createElement('div');
    app.id = 'opentour-app';

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';

    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';

    const spinnerOverlay = document.createElement('div');
    spinnerOverlay.id = 'opentour-spinner-container';
    spinnerOverlay.classList.add('hidden');

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinnerOverlay.appendChild(spinner);

    const hud = document.createElement('div');
    hud.id = 'opentour-hud';

    const axisMount = document.createElement('div');
    axisMount.id = 'opentour-axis-mount';

    const toolbar = document.createElement('div');
    toolbar.id = 'opentour-toolbar';

    const loadToggle = document.createElement('button');
    loadToggle.id = 'opentour-load-toggle';
    loadToggle.className = 'opentour-tool active';
    loadToggle.type = 'button';
    loadToggle.setAttribute('aria-label', 'Model Loader');

    const loadIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    loadIcon.setAttribute('class', 'opentour-tool-icon');
    loadIcon.setAttribute('viewBox', '0 0 24 24');
    loadIcon.setAttribute('aria-hidden', 'true');

    const folderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    folderPath.setAttribute('d', 'M3 8a2 2 0 0 1 2-2h4l1.4 1.6H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');

    const flapPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    flapPath.setAttribute('d', 'M3 10h8.6a2 2 0 0 0 1.5-.7L14.6 8H19');

    const openPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    openPath.setAttribute('d', 'M10.2 12.2L8.6 13.8l1.6 1.6m3.6-3.2l1.6 1.6-1.6 1.6');

    loadIcon.append(folderPath, flapPath, openPath);
    loadToggle.appendChild(loadIcon);

    const modelLoaderButton = document.createElement('button');
    modelLoaderButton.className = 'opentour-tool';
    modelLoaderButton.type = 'button';
    modelLoaderButton.setAttribute('aria-label', 'Open OT Model Loader');
    modelLoaderButton.title = 'Model Loader';
    modelLoaderButton.appendChild(createToolIcon([
        'M3 8a2 2 0 0 1 2-2h4l1.4 1.6H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        'M3 10h8.6a2 2 0 0 0 1.5-.7L14.6 8H19',
        'M10.2 12.2L8.6 13.8l1.6 1.6m3.6-3.2l1.6 1.6-1.6 1.6'
    ]));

    const tourLoaderButton = document.createElement('button');
    tourLoaderButton.className = 'opentour-tool';
    tourLoaderButton.type = 'button';
    tourLoaderButton.setAttribute('aria-label', 'Open OT Tour Loader');
    tourLoaderButton.title = 'Tour Loader';
    tourLoaderButton.appendChild(createToolIcon([
        'M4 15l6-3 5 5 5-10-10 5-6-2z',
        'M10 12l5 5',
        'M15 17l1.5 3'
    ]));

    const tourPlayerButton = document.createElement('button');
    tourPlayerButton.className = 'opentour-tool';
    tourPlayerButton.type = 'button';
    tourPlayerButton.setAttribute('aria-label', 'Open OT Tour Player');
    tourPlayerButton.title = 'Tour Player';
    tourPlayerButton.appendChild(createToolIcon([
        'M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
        'M10 9l5 3-5 3z'
    ]));

    const cinematicWorkspaceButton = document.createElement('button');
    cinematicWorkspaceButton.className = 'opentour-tool';
    cinematicWorkspaceButton.type = 'button';
    cinematicWorkspaceButton.setAttribute('aria-label', 'Open OT Cinematic Workspace');
    cinematicWorkspaceButton.title = 'Complete TL setup first';
    cinematicWorkspaceButton.appendChild(createToolIcon([
        'M4 6h16v12H4z',
        'M7 9h4v6H7z',
        'M13 9h4v6h-4z',
        'M10 4v2',
        'M14 4v2',
        'M12 19v1',
        'M9 21h6'
    ]));

    const tourDownloadButton = document.createElement('button');
    tourDownloadButton.className = 'opentour-tool';
    tourDownloadButton.type = 'button';
    tourDownloadButton.setAttribute('aria-label', 'Open OT Tour Download');

    tourDownloadButton.title = 'Tour Download';
    tourDownloadButton.appendChild(createToolIcon([
        'M12 4v9',
        'M8 10l4 4 4-4',
        'M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2'
    ]));

    const tourProducerButton = document.createElement('button');
    tourProducerButton.className = 'opentour-tool';
    tourProducerButton.type = 'button';
    tourProducerButton.setAttribute('aria-label', 'Open OT Tour Producer');
    tourProducerButton.title = 'Tour Producer';
    tourProducerButton.appendChild(createToolIcon([
        'M3 7a2 2 0 0 1 2-2h11l5 5v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        'M10 10l5 3-5 3z',
        'M16 5v5h5'
    ]));

    const step3Button = document.createElement('button');
    step3Button.className = 'opentour-tool opentour-tool-text';
    step3Button.type = 'button';
    step3Button.textContent = '2D';
    step3Button.setAttribute('aria-label', 'Open Step3 dual view');
    step3Button.title = 'Step3 Dual View';

    const gridToggleButton = document.createElement('button');
    gridToggleButton.className = 'opentour-tool';
    gridToggleButton.type = 'button';
    gridToggleButton.setAttribute('aria-label', 'Toggle ground grid');
    gridToggleButton.title = 'Toggle Ground Grid';
    gridToggleButton.appendChild(createToolIcon([
        'M4 4h16v16H4z',
        'M4 10h16',
        'M4 16h16',
        'M10 4v16',
        'M16 4v16'
    ]));

    const panel = document.createElement('div');
    panel.id = 'opentour-load-panel';
    panel.classList.add('hidden');

    const panelTitle = document.createElement('div');
    panelTitle.className = 'panel-title';
    panelTitle.textContent = 'Load Model';

    const openButton = document.createElement('button');
    openButton.id = 'opentour-open-file';
    openButton.type = 'button';
    openButton.textContent = 'Open File';

    const fileInput = document.createElement('input');
    fileInput.id = 'opentour-file-input';
    fileInput.type = 'file';
    fileInput.accept = '.ply,.splat,.ksplat,.spz,.sog,.json,.lcc';
    fileInput.hidden = true;

    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'Supported: .ply .splat .ksplat .spz .sog .json .lcc';

    const status = document.createElement('div');
    status.id = 'opentour-status';
    status.textContent = 'OpenTour ready';

    toolbar.append(modelLoaderButton, tourLoaderButton, cinematicWorkspaceButton, tourPlayerButton, tourDownloadButton, tourProducerButton, step3Button, gridToggleButton);
    panel.append(panelTitle, openButton, fileInput, hint, status);
    hud.append(axisMount, toolbar, panel);
    canvasContainer.append(canvas, hud, spinnerOverlay);
    const embeddedMediaDomRoot = document.createElement('div');
    embeddedMediaDomRoot.id = 'opentour-embedded-media-dom-root';
    embeddedMediaDomRoot.style.position = 'absolute';
    embeddedMediaDomRoot.style.inset = '0';
    embeddedMediaDomRoot.style.pointerEvents = 'none';
    embeddedMediaDomRoot.style.zIndex = '14';
    canvasContainer.appendChild(embeddedMediaDomRoot);
    app.append(canvasContainer);
    document.body.appendChild(app);

    return {
        canvasContainer,
        canvas,
        spinnerOverlay,
        axisMount,
        toolbar,
        loadToggle,
        step3Button,
        modelLoaderButton,
        tourLoaderButton,
        cinematicWorkspaceButton,
        tourPlayerButton,
        tourDownloadButton,
        tourProducerButton,
        gridToggleButton,
        openButton,
        fileInput,
        panel,
        status
    };
};

const main = async () => {
    const ui = bootstrapUI();
    const events = new Events();
    let currentModelFilename: string | null = null;
    let otTourLoaderReady = false;
    let cinematicModelReady = false;

    const refreshCinematicAvailability = async () => {
        if (!currentModelFilename) {
            cinematicModelReady = false;
            syncTourLoaderButtonState();
            return;
        }
        try {
            const response = await fetch(`http://localhost:3031/api/ot-tour-loader/state?modelFilename=${encodeURIComponent(currentModelFilename)}`);
            const data = await response.json().catch(() => ({}));
            cinematicModelReady = Boolean(response.ok && data?.ok && Array.isArray(data?.pois) && data.pois.length > 0);
        } catch {
            cinematicModelReady = false;
        }
        syncTourLoaderButtonState();
    };

    const syncTourLoaderButtonState = () => {
        const enabled = Boolean(currentModelFilename);
        ui.tourLoaderButton.disabled = !enabled;
        ui.tourLoaderButton.title = enabled
            ? 'Open OT Tour Loader'
            : 'Load a model first to enable Tour Loader';
        ui.tourPlayerButton.disabled = !enabled;
        ui.tourPlayerButton.title = enabled
            ? 'Open OT Tour Player'
            : 'Load a model first to enable Tour Player';
        const cinematicEnabled = Boolean(currentModelFilename) && (cinematicModelReady || otTourLoaderReady);
        ui.cinematicWorkspaceButton.disabled = !cinematicEnabled;
        ui.cinematicWorkspaceButton.title = cinematicEnabled
            ? 'Open OT Cinematic Workspace'
            : (currentModelFilename ? 'Model needs POIs in database to enable Cinematic Workspace' : 'Load a model and finish TL setup first');
    };
    syncTourLoaderButtonState();

    let loaderToggleAt = 0;
    const toggleLoaderPanel = (event: Event) => {
        const now = performance.now();
        if (now - loaderToggleAt < 120) return;
        loaderToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        const wizardPanel = document.getElementById('otw-panel');
        if (wizardPanel) {
            wizardPanel.classList.toggle('hidden');
            return;
        }
        ui.panel.classList.toggle('hidden');
    };
    ui.loadToggle.addEventListener('pointerdown', toggleLoaderPanel);
    ui.loadToggle.addEventListener('click', toggleLoaderPanel);

    document.body.setAttribute('tabIndex', '-1');
    document.body.focus();

    WebPCodec.wasmUrl = new URL('static/lib/webp/webp.wasm', document.baseURI).toString();

    const graphicsDevice = await createGraphicsDevice(ui.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    const sceneConfig = getSceneConfig([
        {
            show: {
                grid: false,
                bound: false,
                cameraPoses: false,
                shBands: 3
            },
            camera: {
                overlay: false
            }
        }
    ]);

    const scene = new Scene(events, sceneConfig, ui.canvas, graphicsDevice);
    const embeddedMediaRoot = new Entity('embeddedHotspotMediaRoot');
    scene.contentRoot.addChild(embeddedMediaRoot);
    const embeddedMediaState: {
        root: Entity | null;
        videoEl: HTMLVideoElement | null;
        texture: Texture | null;
        update: ((dt: number) => void) | null;
        domCarrier: HTMLDivElement | null;
        specSignature: string | null;
        anchorWorld: Vec3;
        scale: number;
        orientation: { yaw: number; pitch: number; roll: number };
        depthOffset: number;
        billboard: boolean;
        selected: boolean;
        highlight: Entity | null;
    } = {
        root: null,
        videoEl: null,
        texture: null,
        update: null,
        domCarrier: null,
        specSignature: null,
        anchorWorld: new Vec3(),
        scale: 1,
        orientation: { yaw: 0, pitch: 0, roll: 0 },
        depthOffset: 0,
        billboard: true,
        selected: false,
        highlight: null
    };
    const clearEmbeddedMedia = () => {
        if (embeddedMediaState.update) {
            scene.app.off('update', embeddedMediaState.update);
            embeddedMediaState.update = null;
        }
        if (embeddedMediaState.videoEl) {
            embeddedMediaState.videoEl.pause();
            embeddedMediaState.videoEl.src = '';
            embeddedMediaState.videoEl.load();
            embeddedMediaState.videoEl = null;
        }
        if (embeddedMediaState.root) {
            embeddedMediaState.root.destroy();
            embeddedMediaState.root = null;
        }
        if (embeddedMediaState.texture) {
            embeddedMediaState.texture.destroy();
            embeddedMediaState.texture = null;
        }
        if (embeddedMediaState.domCarrier) {
            embeddedMediaState.domCarrier.remove();
            embeddedMediaState.domCarrier = null;
        }
        embeddedMediaState.specSignature = null;
        embeddedMediaState.anchorWorld.set(0, 0, 0);
        embeddedMediaState.scale = 1;
        embeddedMediaState.orientation = { yaw: 0, pitch: 0, roll: 0 };
        embeddedMediaState.depthOffset = 0;
        embeddedMediaState.billboard = true;
        embeddedMediaState.selected = false;
        embeddedMediaState.highlight = null;
        scene.forceRender = true;
    };
    const createMediaMaterial = () => {
        const material = new StandardMaterial();
        material.useLighting = false;
        material.emissive = new Color(1, 1, 1);
        material.diffuse = new Color(0, 0, 0);
        material.opacity = 1;
        material.cull = 0;
        material.update();
        return material;
    };
    const applyPlaceholderMaterial = (material: StandardMaterial) => {
        material.emissiveMap = null;
        material.diffuseMap = null;
        material.emissive = new Color(0.2, 0.38, 0.78);
        material.diffuse = new Color(0.04, 0.06, 0.1);
        material.opacity = 0.94;
        material.update();
    };
    const applyTextureSource = async (src: string, material: StandardMaterial, onReady?: (aspect: number) => void) => {
        if (!String(src || '').trim()) {
            applyPlaceholderMaterial(material);
            onReady?.(16 / 9);
            return;
        }
        if (/\.mp4(?:$|\?)/i.test(src)) {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.src = src;
            await video.play().catch(() => {});
            const texture = new Texture(scene.app.graphicsDevice, { mipmaps: false });
            texture.setSource(video);
            material.emissiveMap = texture;
            material.diffuseMap = texture;
            material.update();
            embeddedMediaState.videoEl = video;
            embeddedMediaState.texture = texture;
            embeddedMediaState.update = () => {
                if (!embeddedMediaState.videoEl || !embeddedMediaState.texture) return;
                embeddedMediaState.texture.setSource(embeddedMediaState.videoEl);
                scene.forceRender = true;
            };
            scene.app.on('update', embeddedMediaState.update);
            onReady?.((video.videoWidth || 16) / Math.max(1, video.videoHeight || 9));
            return;
        }
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = src;
        await new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
        });
        const texture = new Texture(scene.app.graphicsDevice, { mipmaps: false });
        texture.setSource(image);
        material.emissiveMap = texture;
        material.diffuseMap = texture;
        material.update();
        embeddedMediaState.texture = texture;
        onReady?.((image.naturalWidth || 16) / Math.max(1, image.naturalHeight || 9));
    };
    const faceEntityToCamera = (entity: Entity, world: Vec3) => {
        const cameraPos = scene.camera.mainCamera.getPosition();
        entity.setPosition(world);
        entity.lookAt(cameraPos);
        entity.rotateLocal(0, 180, 0);
    };
    const updateEmbeddedMediaRootTransform = () => {
        if (!embeddedMediaState.root) return;
        if (embeddedMediaState.billboard) {
            faceEntityToCamera(embeddedMediaState.root, embeddedMediaState.anchorWorld);
        } else {
            const quat = new Quat();
            quat.setFromEulerAngles(
                embeddedMediaState.orientation.pitch,
                embeddedMediaState.orientation.yaw,
                embeddedMediaState.orientation.roll
            );
            const offset = new Vec3(0, 0, 1);
            quat.transformVector(offset, offset);
            offset.mulScalar(embeddedMediaState.depthOffset || 0);
            const position = embeddedMediaState.anchorWorld.clone().add(offset);
            embeddedMediaState.root.setPosition(position);
            embeddedMediaState.root.setEulerAngles(
                embeddedMediaState.orientation.pitch,
                embeddedMediaState.orientation.yaw,
                embeddedMediaState.orientation.roll
            );
        }
        const scale = Math.max(0.05, embeddedMediaState.scale || 1);
        embeddedMediaState.root.setLocalScale(scale, scale, scale);
    };
    const mediaSizeFromAspect = (aspect: number, mode: 'media-plane' | 'media-object') => {
        const safeAspect = Math.max(0.05, aspect || 1);
        if (mode === 'media-object') {
            const maxHeight = 2.45;
            const maxWidth = 2.65;
            if (safeAspect >= 1) {
                const width = maxWidth;
                return { width, height: width / safeAspect };
            }
            const height = maxHeight;
            return { width: height * safeAspect, height };
        }
        const maxHeight = 2.05;
        const maxWidth = 2.75;
        if (safeAspect >= 1) {
            const width = maxWidth;
            return { width, height: width / safeAspect };
        }
        const height = maxHeight;
        return { width: height * safeAspect, height };
    };
    const mountDomMediaCarrier = (spec: {
        src: string;
        kind: 'image' | 'video';
        aspect: number;
        anchorWorld: { x: number; y: number; z: number };
    }) => {
        const host = document.getElementById('opentour-embedded-media-dom-root');
        if (!host) return;
        const wrap = document.createElement('div');
        wrap.style.position = 'absolute';
        wrap.style.left = '0';
        wrap.style.top = '0';
        wrap.style.transformOrigin = 'center center';
        wrap.style.pointerEvents = 'none';
        wrap.style.filter = 'drop-shadow(0 20px 36px rgba(0,0,0,0.35))';

        const frame = document.createElement('div');
        frame.style.border = '10px solid rgba(18,20,26,0.96)';
        frame.style.borderRadius = '16px';
        frame.style.background = '#05070b';
        frame.style.overflow = 'hidden';
        frame.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.08) inset';
        frame.style.transform = 'perspective(1200px) rotateY(-18deg) rotateX(3deg)';
        frame.style.transformOrigin = 'center center';

        const media = document.createElement(spec.kind === 'video' ? 'video' : 'img') as HTMLVideoElement | HTMLImageElement;
        media.style.display = 'block';
        media.style.width = '100%';
        media.style.height = '100%';
        media.style.objectFit = 'contain';
        if (spec.kind === 'video') {
            const video = media as HTMLVideoElement;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.src = spec.src;
            void video.play().catch(() => {});
        } else {
            (media as HTMLImageElement).src = spec.src;
        }
        frame.appendChild(media);
        wrap.appendChild(frame);
        host.appendChild(wrap);
        embeddedMediaState.domCarrier = wrap;

        const anchor = new Vec3(spec.anchorWorld.x, spec.anchorWorld.y, spec.anchorWorld.z);
        const update = () => {
            if (!embeddedMediaState.domCarrier) return;
            const projected = new Vec3();
            scene.camera.worldToScreen(anchor, projected);
            const container = document.getElementById('canvas-container');
            const widthPx = spec.aspect >= 1 ? 360 : 240;
            const heightPx = spec.aspect >= 1 ? widthPx / spec.aspect : 520;
            const finalWidth = spec.aspect >= 1 ? widthPx : heightPx * spec.aspect;
            const finalHeight = spec.aspect >= 1 ? heightPx : heightPx;
            frame.style.width = `${Math.round(finalWidth)}px`;
            frame.style.height = `${Math.round(finalHeight)}px`;
            if (!container || projected.z < -1 || projected.z > 1 || projected.x < 0 || projected.x > 1 || projected.y < 0 || projected.y > 1) {
                embeddedMediaState.domCarrier.style.display = 'block';
                embeddedMediaState.domCarrier.style.transform = `translate(${Math.round((host.clientWidth - finalWidth) * 0.52)}px, ${Math.round((host.clientHeight - finalHeight) * 0.32)}px)`;
            } else {
                embeddedMediaState.domCarrier.style.display = 'block';
                embeddedMediaState.domCarrier.style.transform = `translate(${Math.round(projected.x * container.clientWidth - finalWidth * 0.5)}px, ${Math.round(projected.y * container.clientHeight - finalHeight * 0.6)}px)`;
            }
        };
        update();
        const previousUpdate = embeddedMediaState.update;
        embeddedMediaState.update = (dt: number) => {
            previousUpdate?.(dt);
            update();
        };
        if (previousUpdate) scene.app.off('update', previousUpdate);
        scene.app.on('update', embeddedMediaState.update);
    };
    const showEmbeddedMedia = async (spec: {
        mode: 'media-plane' | 'media-object';
        kind: 'image' | 'video';
        src: string;
        title?: string;
        caption?: string;
        anchorWorld: { x: number; y: number; z: number };
        scale?: number;
        orientation?: { yaw: number; pitch: number; roll: number };
        depthOffset?: number;
        selected?: boolean;
        placeholder?: boolean;
        placeholderLabel?: string;
        billboard?: boolean;
    } | null) => {
        if (!spec) {
            clearEmbeddedMedia();
            return;
        }
        const signature = `${spec.mode}|${spec.kind}|${spec.src}`;
        if (embeddedMediaState.root && embeddedMediaState.specSignature === signature) {
            embeddedMediaState.anchorWorld.set(spec.anchorWorld.x, spec.anchorWorld.y, spec.anchorWorld.z);
            embeddedMediaState.scale = Math.max(0.05, Number(spec.scale) || 1);
            embeddedMediaState.orientation = {
                yaw: Number(spec.orientation?.yaw) || 0,
                pitch: Number(spec.orientation?.pitch) || 0,
                roll: Number(spec.orientation?.roll) || 0
            };
            embeddedMediaState.depthOffset = Number(spec.depthOffset) || 0;
            embeddedMediaState.billboard = spec.billboard !== false;
            embeddedMediaState.selected = Boolean(spec.selected);
            if (embeddedMediaState.highlight?.render?.material) {
                const mat = embeddedMediaState.highlight.render.material as StandardMaterial;
                mat.emissive = embeddedMediaState.selected ? new Color(0.95, 0.78, 0.26) : new Color(0.08, 0.1, 0.16);
                mat.opacity = embeddedMediaState.selected ? 0.16 : 0;
                mat.update();
            }
            if (embeddedMediaState.highlight) embeddedMediaState.highlight.enabled = embeddedMediaState.selected;
            updateEmbeddedMediaRootTransform();
            scene.forceRender = true;
            return;
        }
        clearEmbeddedMedia();
        const root = new Entity(spec.mode === 'media-object' ? 'embeddedMediaObject' : 'embeddedMediaPlane');
        embeddedMediaRoot.addChild(root);
        embeddedMediaState.root = root;
        embeddedMediaState.specSignature = signature;
        embeddedMediaState.anchorWorld.set(spec.anchorWorld.x, spec.anchorWorld.y, spec.anchorWorld.z);
        embeddedMediaState.scale = Math.max(0.05, Number(spec.scale) || 1);
        embeddedMediaState.orientation = {
            yaw: Number(spec.orientation?.yaw) || 0,
            pitch: Number(spec.orientation?.pitch) || 0,
            roll: Number(spec.orientation?.roll) || 0
        };
        embeddedMediaState.depthOffset = Number(spec.depthOffset) || 0;
        embeddedMediaState.billboard = spec.billboard !== false;
        embeddedMediaState.selected = Boolean(spec.selected);

        const screenEntity = new Entity('embeddedMediaScreen');
        screenEntity.addComponent('render', { type: 'box' });
        root.addChild(screenEntity);
        const material = createMediaMaterial();
        screenEntity.render.material = material;
        const highlight = new Entity('embeddedMediaHighlight');
        highlight.addComponent('render', { type: 'box' });
        root.addChild(highlight);
        const highlightMat = new StandardMaterial();
        highlightMat.useLighting = false;
        highlightMat.diffuse = new Color(0, 0, 0);
        highlightMat.emissive = embeddedMediaState.selected ? new Color(0.95, 0.78, 0.26) : new Color(0.08, 0.1, 0.16);
        highlightMat.opacity = embeddedMediaState.selected ? 0.16 : 0;
        highlightMat.blendType = 2;
        highlightMat.update();
        highlight.render.material = highlightMat;
        highlight.enabled = embeddedMediaState.selected;
        embeddedMediaState.highlight = highlight;
        screenEntity.setLocalPosition(0, 0, 0);

        await applyTextureSource(spec.src, material, (aspect) => {
            const { width, height } = mediaSizeFromAspect(aspect, spec.mode);
            screenEntity.setLocalScale(width, height, 0.01);
            highlight.setLocalScale(width + 0.08, height + 0.08, 0.004);
            highlight.setLocalPosition(0, 0, -0.01);
        });

        const update = () => {
            if (!embeddedMediaState.root) return;
            updateEmbeddedMediaRootTransform();
        };
        update();
        const previousUpdate = embeddedMediaState.update;
        embeddedMediaState.update = (dt: number) => {
            previousUpdate?.(dt);
            update();
        };
        if (previousUpdate) {
            scene.app.off('update', previousUpdate);
        }
        scene.app.on('update', embeddedMediaState.update);
        scene.forceRender = true;
    };
    const step3DualViewPanel = mountStep3DualViewPanel(events, scene, () => currentModelFilename);
    const step3GimiPanel = mountStep3GimiDualViewPanel(events, scene, () => currentModelFilename);
    let groundGridVisible = false;
    let gridToggleAt = 0;

    const setGlobalViewCubeVisible = (visible: boolean) => {
        document.querySelectorAll('#view-cube-container').forEach((element) => {
            if (!(element instanceof HTMLElement)) return;
            const insideOpenTourAxisMount = Boolean(element.closest('#opentour-axis-mount'));
            if (!insideOpenTourAxisMount) {
                element.classList.toggle('opentour-hidden', !visible);
            }
        });
    };

    const setGroundGridVisible = (visible: boolean) => {
        groundGridVisible = visible;
        if ((scene as any)?.grid) {
            (scene as any).grid.visible = visible;
        }
        ui.gridToggleButton.classList.toggle('active', visible);
        ui.axisMount.classList.toggle('hidden', !visible);
        setGlobalViewCubeVisible(visible);
        events.fire('grid.setVisible', visible);
    };

    const toggleGroundGridVisible = () => {
        setGroundGridVisible(!groundGridVisible);
    };

    let step3ToggleAt = 0;
    const toggleStep3Panel = (event: Event) => {
        const now = performance.now();
        if (now - step3ToggleAt < 120) return;
        step3ToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        void step3DualViewPanel.toggle();
    };
    ui.step3Button.addEventListener('pointerdown', toggleStep3Panel);
    ui.step3Button.addEventListener('click', toggleStep3Panel);

    const handleGridToggle = (event: Event) => {
        const now = performance.now();
        if (now - gridToggleAt < 120) return;
        gridToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        toggleGroundGridVisible();
    };
    ui.gridToggleButton.addEventListener('pointerdown', handleGridToggle);
    ui.gridToggleButton.addEventListener('click', handleGridToggle);

    let otModelLoaderModulePromise: Promise<OTModelLoaderModule> | null = null;
    let otModelLoaderPanel: OTModelLoaderPanelController | null = null;
    let otTourLoaderModulePromise: Promise<OTTourLoaderModule> | null = null;
    let otTourLoaderPanel: OTTourLoaderPanelController | null = null;
    let otCinematicWorkspaceModulePromise: Promise<OTCinematicWorkspaceModule> | null = null;
    let otCinematicWorkspacePanel: OTCinematicWorkspacePanelController | null = null;
    let otTourPlayerModulePromise: Promise<OTTourPlayerModule> | null = null;
    let otTourPlayerPanel: OTTourPlayerPanelController | null = null;
    let otTourDownloadModulePromise: Promise<OTTourDownloadModule> | null = null;
    let otTourDownloadPanel: OTTourDownloadPanelController | null = null;
    let otTourProducerModulePromise: Promise<OTTourProducerModule> | null = null;
    let otTourProducerPanel: OTTourProducerPanelController | null = null;
    let loadedRootTransform: { position: Vec3; rotation: Quat; scale: Vec3 } | null = null;

    const setButtonBusy = (button: HTMLButtonElement, busy: boolean) => {
        button.disabled = busy;
        if (busy) button.setAttribute('aria-busy', 'true');
        else button.removeAttribute('aria-busy');
    };

    const setMainToolbarVisible = (visible: boolean) => {
        ui.toolbar.classList.toggle('hidden', !visible);
        events.fire('opentour.toolbar.visible', visible);
    };

    const toggleMainToolbarVisible = () => {
        setMainToolbarVisible(ui.toolbar.classList.contains('hidden'));
    };

    const pushHostDebug = (scope: string, payload: unknown) => {
        const w = window as unknown as {
            __otStep3Debug?: {
                host?: unknown[];
            };
        };
        if (!w.__otStep3Debug) w.__otStep3Debug = {};
        if (!w.__otStep3Debug.host) w.__otStep3Debug.host = [];
        w.__otStep3Debug.host.push({
            ts: new Date().toISOString(),
            scope,
            ...payload as object
        });
        if (w.__otStep3Debug.host.length > 300) {
            w.__otStep3Debug.host.splice(0, w.__otStep3Debug.host.length - 300);
        }
    };

    const extractWorldSamplePoints = () => {
        const points: Array<{ x: number; y: number; z: number; opacity: number }> = [];
        const pushPoint = (x: number, y: number, z: number, opacity = 1) => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
            points.push({ x, y, z, opacity: Math.max(0, Math.min(1, opacity)) });
        };

        let splats: any[] = [];
        try {
            splats = scene?.getElementsByType?.(ElementType.splat) || [];
        } catch {
            splats = [];
        }

        splats.forEach((splat: any) => {
            const splatData = splat?.splatData;
            if (splatData && typeof splatData.getProp === 'function') {
                const px = splatData.getProp('x') || splatData.getProp('position_x') || splatData.getProp('means_0');
                const py = splatData.getProp('y') || splatData.getProp('position_y') || splatData.getProp('means_1');
                const pz = splatData.getProp('z') || splatData.getProp('position_z') || splatData.getProp('means_2');
                const opRaw = splatData.getProp('opacity') || splatData.getProp('alpha');
                const state = splatData.getProp('state');
                const world = splat?.worldTransform;
                const wp = new Vec3();

                if (px?.length && py?.length && pz?.length) {
                    const step = Math.max(1, Math.floor(px.length / 24000));
                    for (let i = 0; i < px.length; i += step) {
                        if (state && state[i] !== 0) continue;
                        let opacity = 1;
                        if (opRaw) {
                            const raw = Number(opRaw[i]);
                            opacity = 1 / (1 + Math.exp(-raw));
                        }
                        if (opacity < 0.1) continue;
                        wp.set(Number(px[i]), Number(py[i]), Number(pz[i]));
                        if (world?.transformPoint) world.transformPoint(wp, wp);
                        pushPoint(wp.x, wp.y, wp.z, opacity);
                    }
                }
            }
        });

        return points;
    };

    const loadOTModelLoaderModule = () => {
        if (!otModelLoaderModulePromise) {
            const moduleUrl = new URL('./modules/ot-model-loader.js', import.meta.url).toString();
            otModelLoaderModulePromise = import(moduleUrl) as Promise<OTModelLoaderModule>;
        }
        return otModelLoaderModulePromise;
    };

    const loadOTTourLoaderModule = () => {
        if (!otTourLoaderModulePromise) {
            const moduleUrl = new URL('./modules/ot-tour-loader.js', import.meta.url).toString();
            otTourLoaderModulePromise = import(moduleUrl) as Promise<OTTourLoaderModule>;
        }
        return otTourLoaderModulePromise;
    };

    const loadOTCinematicWorkspaceModule = () => {
        if (!otCinematicWorkspaceModulePromise) {
            const moduleUrl = new URL('./modules/ot-cinematic-workspace.js', import.meta.url).toString();
            otCinematicWorkspaceModulePromise = import(moduleUrl) as Promise<OTCinematicWorkspaceModule>;
        }
        return otCinematicWorkspaceModulePromise;
    };

    const loadOTTourPlayerModule = () => {
        if (!otTourPlayerModulePromise) {
            const moduleUrl = new URL('./modules/ot-tour-player.js', import.meta.url).toString();
            otTourPlayerModulePromise = import(moduleUrl) as Promise<OTTourPlayerModule>;
        }
        return otTourPlayerModulePromise;
    };

    const loadOTTourDownloadModule = () => {
        if (!otTourDownloadModulePromise) {
            const moduleUrl = new URL('./modules/ot-tour-download.js', import.meta.url).toString();
            otTourDownloadModulePromise = import(moduleUrl) as Promise<OTTourDownloadModule>;
        }
        return otTourDownloadModulePromise;
    };

    const loadOTTourProducerModule = () => {
        if (!otTourProducerModulePromise) {
            const moduleUrl = new URL('./modules/ot-tour-producer.js', import.meta.url).toString();
            otTourProducerModulePromise = import(moduleUrl) as Promise<OTTourProducerModule>;
        }
        return otTourProducerModulePromise;
    };

    let modelLoaderToggleAt = 0;
    const toggleOTModelLoader = async (event: Event) => {
        const now = performance.now();
        if (now - modelLoaderToggleAt < 120) return;
        modelLoaderToggleAt = now;

        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        if (ui.modelLoaderButton.disabled) return;

        if (!otModelLoaderPanel) {
            setButtonBusy(ui.modelLoaderButton, true);
            try {
                const otModelLoaderModule = await loadOTModelLoaderModule();
                otModelLoaderPanel = otModelLoaderModule.mountOTModelLoaderPanel({
                    loadModelFile: async (file: File) => {
                        await loadFile(file);
                    },
                    launcherButton: ui.modelLoaderButton,
                    applyRotateToCanonical: async (plan: CoordinateRotationPlan) => {
                        const root = scene.contentRoot;
                        if (!root) return;
                        const before = root.getLocalRotation().clone();
                        const baseRotation = loadedRootTransform?.rotation?.clone() ?? root.getLocalRotation().clone();
                        const delta = new Quat(plan.quaternion.x, plan.quaternion.y, plan.quaternion.z, plan.quaternion.w);
                        const finalRotation = new Quat();
                        finalRotation.mul2(baseRotation, delta);
                        root.setLocalRotation(finalRotation);
                        const after = root.getLocalRotation().clone();
                        pushHostDebug('applyRotateToCanonical', {
                            source: plan.sourceCoordinateId,
                            target: plan.targetCoordinateId,
                            beforeRotation: { x: before.x, y: before.y, z: before.z, w: before.w },
                            baseRotation: { x: baseRotation.x, y: baseRotation.y, z: baseRotation.z, w: baseRotation.w },
                            delta: { x: delta.x, y: delta.y, z: delta.z, w: delta.w },
                            finalRotation: { x: finalRotation.x, y: finalRotation.y, z: finalRotation.z, w: finalRotation.w },
                            afterRotation: { x: after.x, y: after.y, z: after.z, w: after.w }
                        });
                        ui.status.textContent = `Rotate applied: ${plan.sourceCoordinateId} -> ${plan.targetCoordinateId}`;
                    },
                    resetModelToLoadedState: async () => {
                        const root = scene.contentRoot;
                        if (!root || !loadedRootTransform) return;
                        root.setLocalPosition(loadedRootTransform.position.clone());
                        root.setLocalRotation(loadedRootTransform.rotation.clone());
                        root.setLocalScale(loadedRootTransform.scale.clone());
                        ui.status.textContent = 'Model transform reset to loaded baseline.';
                    },
                    clearDbResiduals: async () => {
                        const response = await fetch('/api/model/calibration/clear-all', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const result = await response.json();
                        ui.status.textContent = 'Database residuals cleared.';
                        return result;
                    },
                    previewFlyCamera: async (pose, fovDeg) => {
                        const eye = new Vec3(pose.eye.x, pose.eye.y, pose.eye.z);
                        const forward = new Vec3(pose.forward.x, pose.forward.y, pose.forward.z);
                        const forwardLen = forward.length();
                        if (forwardLen < 1e-6) return;
                        forward.mulScalar(1 / forwardLen);
                        const target = eye.clone().add(forward.mulScalar(2.6));
                        scene.camera.fov = Math.max(20, Math.min(120, fovDeg));
                        scene.camera.controlMode = 'fly';
                        scene.camera.setPose(eye, target, 0);
                        ui.status.textContent = `Fly preview eye=(${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)}) fov=${scene.camera.fov.toFixed(0)}`;
                    },
                    getLiveCameraPose: () => {
                        const eye = scene.camera.mainCamera.getPosition();
                        const forward = scene.camera.mainCamera.forward;
                        return {
                            pose: {
                                eye: { x: eye.x, y: eye.y, z: eye.z },
                                forward: { x: forward.x, y: forward.y, z: forward.z }
                            },
                            fovDeg: scene.camera.fov
                        };
                    },
                    getWorldSamplePoints: () => extractWorldSamplePoints()
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : `${error}`;
                ui.status.textContent = `OT_ModelLoader unavailable: ${message}`;
            } finally {
                setButtonBusy(ui.modelLoaderButton, false);
            }
        }

        otModelLoaderPanel?.toggle();
    };
    ui.modelLoaderButton.addEventListener('pointerdown', (event) => {
        void toggleOTModelLoader(event);
    });
    ui.modelLoaderButton.addEventListener('click', (event) => {
        void toggleOTModelLoader(event);
    });

    let tourLoaderToggleAt = 0;
    const ensureTourLoaderPanel = async () => {
        if (otTourLoaderPanel || !currentModelFilename) return;
        if (!otTourLoaderPanel) {
            setButtonBusy(ui.tourLoaderButton, true);
            try {
                const otTourLoaderModule = await loadOTTourLoaderModule();
                otTourLoaderPanel = otTourLoaderModule.mountOTTourLoaderPanel({
                    launcherButton: ui.tourLoaderButton,
                    getModelFilename: () => currentModelFilename,
                    getWorldSamplePoints: () => extractWorldSamplePoints(),
                    getLiveCameraPose: () => {
                        const eye = scene.camera.mainCamera.getLocalPosition();
                        const forward = scene.camera.mainCamera.forward;
                        return {
                            pose: {
                                eye: { x: eye.x, y: eye.y, z: eye.z },
                                forward: { x: forward.x, y: forward.y, z: forward.z }
                            },
                            fovDeg: scene.camera.fov
                        };
                    },
                    setLiveCameraPose: async (pose, fovDeg) => {
                        const eye = new Vec3(pose.eye.x, pose.eye.y, pose.eye.z);
                        const forward = new Vec3(pose.forward.x, pose.forward.y, pose.forward.z);
                        const target = eye.clone().add(forward.mulScalar(2.4));
                        scene.camera.fov = Math.max(20, Math.min(120, fovDeg));
                        scene.camera.controlMode = 'fly';
                        scene.camera.setPose(eye, target, 0);
                    },
                    getCaptureCanvas: () => ui.canvas,
                    requestCaptureRender: () => {
                        scene.forceRender = true;
                    },
                    captureScreenshotPng: async () => {
                        const canvas = scene.app?.graphicsDevice?.canvas as HTMLCanvasElement | undefined;
                        if (!canvas) return '';
                        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
                        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
                        const direct = canvas.toDataURL('image/png');

                        try {
                            const cam = scene.camera as unknown as {
                                mainTarget?: unknown;
                                workTarget?: {
                                    colorBuffer?: {
                                        read: (x: number, y: number, w: number, h: number, opts: { renderTarget: unknown; data: Uint8Array }) => Promise<void>;
                                    };
                                };
                            };
                            const dataProcessor = (scene as unknown as { dataProcessor?: { copyRt: (src: unknown, dst: unknown) => void } }).dataProcessor;
                            const mainTarget = cam.mainTarget;
                            const workTarget = cam.workTarget;
                            if (!mainTarget || !workTarget?.colorBuffer?.read || !dataProcessor?.copyRt) {
                                return direct;
                            }

                            const width = canvas.width;
                            const height = canvas.height;
                            const rgba = new Uint8Array(width * height * 4);
                            dataProcessor.copyRt(mainTarget, workTarget);
                            await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data: rgba });

                            const rowBytes = width * 4;
                            const temp = new Uint8Array(rowBytes);
                            for (let y = 0; y < height / 2; y += 1) {
                                const top = y * rowBytes;
                                const bottom = (height - y - 1) * rowBytes;
                                temp.set(rgba.subarray(top, top + rowBytes));
                                rgba.copyWithin(top, bottom, bottom + rowBytes);
                                rgba.set(temp, bottom);
                            }

                            const out = document.createElement('canvas');
                            out.width = width;
                            out.height = height;
                            const ctx = out.getContext('2d');
                            if (!ctx) return direct;
                            ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), width, height), 0, 0);
                            return out.toDataURL('image/png');
                        } catch {
                            return direct;
                        }
                    },
                    resolveAssetUrl: (value) => `http://localhost:3031/api/ot-tour-loader/local-file?path=${encodeURIComponent(value)}`,
                    apiBaseUrl: 'http://localhost:3031/api/ot-tour-loader',
                    onModelLoaded: (callback) => {
                        const handler = (name: string | null) => callback(name);
                        events.on('opentour.model.loaded', handler);
                        return () => {
                            events.off('opentour.model.loaded', handler);
                        };
                    }
                });
                otTourLoaderReady = true;
            } catch (error) {
                const message = error instanceof Error ? error.message : `${error}`;
                ui.status.textContent = `OT_TourLoader unavailable: ${message}`;
            } finally {
                setButtonBusy(ui.tourLoaderButton, false);
                syncTourLoaderButtonState();
            }
        }
    };

    const toggleOTTourLoader = async (event: Event) => {
        const now = performance.now();
        if (now - tourLoaderToggleAt < 120) return;
        tourLoaderToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        if (ui.tourLoaderButton.disabled) return;
        if (!currentModelFilename) {
            ui.status.textContent = 'Load a model before opening Tour Loader.';
            return;
        }

        await ensureTourLoaderPanel();

        otTourLoaderPanel?.toggle();
    };

    ui.tourLoaderButton.addEventListener('pointerdown', (event) => {
        void toggleOTTourLoader(event);
    });
    ui.tourLoaderButton.addEventListener('click', (event) => {
        void toggleOTTourLoader(event);
    });

    let cinematicWorkspaceToggleAt = 0;
    const ensureOTCinematicWorkspacePanel = async () => {
        if (otCinematicWorkspacePanel || !currentModelFilename) return;
        setButtonBusy(ui.cinematicWorkspaceButton, true);
        try {
            const otCinematicWorkspaceModule = await loadOTCinematicWorkspaceModule();
            otCinematicWorkspacePanel = otCinematicWorkspaceModule.mountOTCinematicWorkspacePanel({
                launcherButton: ui.cinematicWorkspaceButton,
                getModelFilename: () => currentModelFilename,
                getWorldSamplePoints: () => extractWorldSamplePoints(),
                getLiveCameraPose: () => {
                    const eye = scene.camera.mainCamera.getLocalPosition();
                    const forward = scene.camera.mainCamera.forward;
                    return {
                        pose: {
                            eye: { x: eye.x, y: eye.y, z: eye.z },
                            forward: { x: forward.x, y: forward.y, z: forward.z }
                        },
                        fovDeg: scene.camera.fov
                    };
                },
                setLiveCameraPose: async (pose, fovDeg) => {
                    const eye = new Vec3(pose.eye.x, pose.eye.y, pose.eye.z);
                    const forward = new Vec3(pose.forward.x, pose.forward.y, pose.forward.z);
                    const target = eye.clone().add(forward.mulScalar(2.4));
                    scene.camera.fov = Math.max(20, Math.min(120, fovDeg));
                    scene.camera.controlMode = 'fly';
                    scene.camera.setPose(eye, target, 0);
                },
                getCaptureCanvas: () => ui.canvas,
                requestCaptureRender: () => {
                    scene.forceRender = true;
                },
                captureScreenshotPng: async () => {
                    const canvas = scene.app?.graphicsDevice?.canvas as HTMLCanvasElement | undefined;
                    if (!canvas) return '';
                    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
                    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
                    const direct = canvas.toDataURL('image/png');
                    try {
                        const cam = scene.camera as unknown as {
                            mainTarget?: unknown;
                            workTarget?: {
                                colorBuffer?: {
                                    read: (x: number, y: number, w: number, h: number, opts: { renderTarget: unknown; data: Uint8Array }) => Promise<void>;
                                };
                            };
                        };
                        const dataProcessor = (scene as unknown as { dataProcessor?: { copyRt: (src: unknown, dst: unknown) => void } }).dataProcessor;
                        const mainTarget = cam.mainTarget;
                        const workTarget = cam.workTarget;
                        if (!mainTarget || !workTarget?.colorBuffer?.read || !dataProcessor?.copyRt) return direct;
                        const width = canvas.width;
                        const height = canvas.height;
                        const rgba = new Uint8Array(width * height * 4);
                        dataProcessor.copyRt(mainTarget, workTarget);
                        await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data: rgba });
                        const rowBytes = width * 4;
                        const temp = new Uint8Array(rowBytes);
                        for (let y = 0; y < height / 2; y += 1) {
                            const top = y * rowBytes;
                            const bottom = (height - y - 1) * rowBytes;
                            temp.set(rgba.subarray(top, top + rowBytes));
                            rgba.copyWithin(top, bottom, bottom + rowBytes);
                            rgba.set(temp, bottom);
                        }
                        const out = document.createElement('canvas');
                        out.width = width;
                        out.height = height;
                        const ctx = out.getContext('2d');
                        if (!ctx) return direct;
                        ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), width, height), 0, 0);
                        return out.toDataURL('image/png');
                    } catch {
                        return direct;
                    }
                },
                pickWorldPointAtScreen: async (x, y) => {
                    const hit = await scene.camera.intersect(x, y);
                    return hit ? { x: hit.position.x, y: hit.position.y, z: hit.position.z } : null;
                },
                projectWorldToScreen: (point) => {
                    const container = document.getElementById('canvas-container');
                    if (!container) return null;
                    const projected = new Vec3();
                    scene.camera.worldToScreen(new Vec3(point.x, point.y, point.z), projected);
                    return {
                        x: projected.x * container.clientWidth,
                        y: projected.y * container.clientHeight,
                        visible: projected.z >= -1 && projected.z <= 1 && projected.x >= 0 && projected.x <= 1 && projected.y >= 0 && projected.y <= 1
                    };
                },
                showEmbeddedMedia,
                resolveAssetUrl: (value) => `http://localhost:3032/api/ot-cinematic-workspace/local-file?path=${encodeURIComponent(value)}`,
                apiBaseUrl: 'http://localhost:3032/api/ot-cinematic-workspace',
                onModelLoaded: (callback) => {
                    const handler = (name: string | null) => callback(name);
                    events.on('opentour.model.loaded', handler);
                    return () => {
                        events.off('opentour.model.loaded', handler);
                    };
                }
            });
        } finally {
            setButtonBusy(ui.cinematicWorkspaceButton, false);
        }
    };
    const toggleOTCinematicWorkspace = async (event: Event) => {
        const now = performance.now();
        if (now - cinematicWorkspaceToggleAt < 120) return;
        cinematicWorkspaceToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        if (ui.cinematicWorkspaceButton.disabled) return;
        if (!currentModelFilename) {
            ui.status.textContent = 'Load a model before opening Cinematic Workspace.';
            return;
        }
        try {
            await ensureOTCinematicWorkspacePanel();
            otCinematicWorkspacePanel?.toggle();
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            ui.status.textContent = `OT_CinematicWorkspace unavailable: ${message}`;
        }
    };
    ui.cinematicWorkspaceButton.addEventListener('pointerdown', (event) => {
        void toggleOTCinematicWorkspace(event);
    });
    ui.cinematicWorkspaceButton.addEventListener('click', (event) => {
        void toggleOTCinematicWorkspace(event);
    });

    let tourPlayerToggleAt = 0;
    const toggleOTTourPlayer = async (event: Event) => {
        const now = performance.now();
        if (now - tourPlayerToggleAt < 120) return;
        tourPlayerToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        if (ui.tourPlayerButton.disabled) return;
        if (!currentModelFilename) {
            ui.status.textContent = 'Load a model before opening Tour Player.';
            return;
        }

        if (!otTourPlayerPanel) {
            setButtonBusy(ui.tourPlayerButton, true);
            try {
                const otTourPlayerModule = await loadOTTourPlayerModule();
                otTourPlayerPanel = otTourPlayerModule.mountOTTourPlayerPanel({
                    launcherButton: ui.tourPlayerButton,
                    getModelFilename: () => currentModelFilename,
                    getCaptureCanvas: () => ui.canvas,
                    requestCaptureRender: () => {
                        scene.forceRender = true;
                    },
                    getLiveCameraPose: () => {
                        const eye = scene.camera.mainCamera.getLocalPosition();
                        const forward = scene.camera.mainCamera.forward;
                        return {
                            pose: {
                                eye: { x: eye.x, y: eye.y, z: eye.z },
                                forward: { x: forward.x, y: forward.y, z: forward.z }
                            },
                            fovDeg: scene.camera.fov
                        };
                    },
                    setLiveCameraPose: async (pose, fovDeg) => {
                        const eye = new Vec3(pose.eye.x, pose.eye.y, pose.eye.z);
                        const forward = new Vec3(pose.forward.x, pose.forward.y, pose.forward.z);
                        const target = eye.clone().add(forward.mulScalar(2.4));
                        scene.camera.fov = Math.max(20, Math.min(120, fovDeg));
                        scene.camera.controlMode = 'fly';
                        scene.camera.setPose(eye, target, 0);
                    },
                    apiBaseUrl: 'http://localhost:3033/api/ot-tour-player',
                    onModelLoaded: (callback) => {
                        const handler = (name: string | null) => callback(name);
                        events.on('opentour.model.loaded', handler);
                        return () => {
                            events.off('opentour.model.loaded', handler);
                        };
                    }
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : `${error}`;
                ui.status.textContent = `OT_TourPlayer unavailable: ${message}`;
            } finally {
                setButtonBusy(ui.tourPlayerButton, false);
                syncTourLoaderButtonState();
            }
        }

        otTourPlayerPanel?.toggle();
    };

    ui.tourPlayerButton.addEventListener('pointerdown', (event) => {
        void toggleOTTourPlayer(event);
    });
    ui.tourPlayerButton.addEventListener('click', (event) => {
        void toggleOTTourPlayer(event);
    });

    let tourDownloadToggleAt = 0;
    const toggleOTTourDownload = async (event: Event) => {
        const now = performance.now();
        if (now - tourDownloadToggleAt < 120) return;
        tourDownloadToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();

        if (!otTourDownloadPanel) {
            setButtonBusy(ui.tourDownloadButton, true);
            try {
                const otTourDownloadModule = await loadOTTourDownloadModule();
                otTourDownloadPanel = otTourDownloadModule.mountOTTourDownloadPanel({
                    launcherButton: ui.tourDownloadButton,
                    apiBaseUrl: 'http://localhost:3033/api/ot-tour-download'
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : `${error}`;
                ui.status.textContent = `OT_TourDownload unavailable: ${message}`;
            } finally {
                setButtonBusy(ui.tourDownloadButton, false);
            }
        }

        otTourDownloadPanel?.toggle();
    };

    ui.tourDownloadButton.addEventListener('pointerdown', (event) => {
        void toggleOTTourDownload(event);
    });
    ui.tourDownloadButton.addEventListener('click', (event) => {
        void toggleOTTourDownload(event);
    });

    let tourProducerToggleAt = 0;
    const toggleOTTourProducer = async (event: Event) => {
        const now = performance.now();
        if (now - tourProducerToggleAt < 120) return;
        tourProducerToggleAt = now;
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();

        if (!otTourProducerPanel) {
            setButtonBusy(ui.tourProducerButton, true);
            try {
                const module = await loadOTTourProducerModule();
                otTourProducerPanel = module.mountOTTourProducerPanel({
                    launcherButton: ui.tourProducerButton,
                    apiBaseUrl: 'http://localhost:3035/api/ot-tour-producer',
                    getModelFilename: () => currentModelFilename
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : `${error}`;
                ui.status.textContent = `OT_TourProducer unavailable: ${message}`;
            } finally {
                setButtonBusy(ui.tourProducerButton, false);
            }
        }

        otTourProducerPanel?.toggle();
    };

    ui.tourProducerButton.addEventListener('pointerdown', (event) => {
        void toggleOTTourProducer(event);
    });
    ui.tourProducerButton.addEventListener('click', (event) => {
        void toggleOTTourProducer(event);
    });

    const viewCube = new ViewCube(events);
    ui.axisMount.appendChild(viewCube.dom);
    setMainToolbarVisible(true);
    events.on('opentour.toolbar.toggle', () => {
        toggleMainToolbarVisible();
    });
    events.on('opentour.toolbar.setVisible', (visible: boolean) => {
        setMainToolbarVisible(Boolean(visible));
    });
    events.on('grid.visible', (visible: boolean) => {
        groundGridVisible = Boolean(visible);
        ui.gridToggleButton.classList.toggle('active', groundGridVisible);
        ui.axisMount.classList.toggle('hidden', !groundGridVisible);
    });
    events.on('opentour.open.modelLoader', () => {
        void toggleOTModelLoader(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.open.tourLoader', () => {
        void toggleOTTourLoader(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.open.tourPlayer', () => {
        void toggleOTTourPlayer(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.open.tourDownload', () => {
        void toggleOTTourDownload(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.open.tourProducer', () => {
        void toggleOTTourProducer(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.open.step3', () => {
        void toggleStep3Panel(new MouseEvent('click', { cancelable: true }));
    });
    events.on('opentour.toggle.grid', () => {
        toggleGroundGridVisible();
    });
    setGroundGridVisible(false);
    events.on('opentour.axisMode.set', (payload: string | { mode?: string; applyToScene?: boolean }) => {
        const mode = typeof payload === 'string' ? payload : (payload?.mode ?? 'combo-1');
        const normalized = (mode === 'combo-1' || mode === 'combo-2' || mode === 'combo-3' || mode === 'combo-4')
            ? mode
            : 'combo-1';
        viewCube.setAxisMode(normalized);
    });
    events.on('opentour.axisPreset.apply', (presetId: string) => {
        applyRightHandedAxisPreset(scene.contentRoot, presetId);
    });
    events.fire('opentour.axisMode.set', { mode: 'combo-1', applyToScene: false });
    events.on('prerender', (cameraMatrix) => {
        viewCube.update(cameraMatrix);
    });

    let controlMode: ControlMode = 'orbit';
    let cameraOverlay = false;
    let viewBands = 3;
    let outlineSelection = false;
    let cameraBound = false;
    let showCameraPoses = false;
    const cameraMode = 'centers';

    const selectedClr = new Color(1, 1, 0, 1);
    const unselectedClr = new Color(0, 0, 1, 0.5);
    const lockedClr = new Color(0, 0, 0, 0.05);

    events.function('selection', () => null);
    events.function('selectedClr', () => selectedClr);
    events.function('unselectedClr', () => unselectedClr);
    events.function('lockedClr', () => lockedClr);
    events.function('camera.mode', () => cameraMode);
    events.function('camera.overlay', () => cameraOverlay);
    events.function('view.outlineSelection', () => outlineSelection);
    events.function('camera.bound', () => cameraBound);
    events.function('view.bands', () => viewBands);
    events.function('camera.controlMode', () => controlMode);
    events.function('camera.flySpeed', () => scene.camera.flySpeed);
    events.function('camera.showPoses', () => showCameraPoses);

    events.on('camera.setOverlay', (value: boolean) => {
        cameraOverlay = value;
        events.fire('camera.overlay', value);
    });

    events.on('view.setOutlineSelection', (value: boolean) => {
        outlineSelection = value;
        events.fire('view.outlineSelection', value);
    });

    events.on('camera.setBound', (value: boolean) => {
        cameraBound = value;
        events.fire('camera.bound', value);
    });

    events.on('camera.setShowPoses', (value: boolean) => {
        showCameraPoses = value;
        events.fire('camera.showPoses', value);
    });

    events.on('view.setBands', (value: number) => {
        viewBands = value;
        events.fire('view.bands', value);
    });

    events.on('camera.setControlMode', (mode: ControlMode) => {
        if (mode !== controlMode) {
            controlMode = mode;
            scene.camera.controlMode = mode;
            events.fire('camera.controlMode', mode);
        }
    });

    events.on('camera.setFlySpeed', (value: number) => {
        scene.camera.flySpeed = value;
        events.fire('camera.flySpeed', value);
    });

    events.on('camera.align', (axis: string) => {
        switch (axis) {
            case 'px': scene.camera.setAzimElev(90, 0); break;
            case 'py': scene.camera.setAzimElev(0, -90); break;
            case 'pz': scene.camera.setAzimElev(0, 0); break;
            case 'nx': scene.camera.setAzimElev(270, 0); break;
            case 'ny': scene.camera.setAzimElev(0, 90); break;
            case 'nz': scene.camera.setAzimElev(180, 0); break;
        }
        scene.camera.ortho = true;
    });

    events.on('camera.reset', () => {
        scene.camera.setAzimElev(-45, -10, 0);
        scene.camera.setDistance(1, 0);
    });

    let spinnerCount = 0;
    events.on('startSpinner', () => {
        spinnerCount++;
        ui.status.textContent = 'Loading model...';
        if (spinnerCount === 1) {
            ui.spinnerOverlay.classList.remove('hidden');
        }
    });

    events.on('stopSpinner', () => {
        spinnerCount = Math.max(0, spinnerCount - 1);
        ui.status.textContent = 'Model loaded';
        if (spinnerCount === 0) {
            ui.spinnerOverlay.classList.add('hidden');
        }
    });

    // Registers WASD/QE fly keys.
    // Also registers standard editor shortcuts, but UI-only shortcuts have no side effects here.
    new ShortcutManager(events);

    // Arrow keys should rotate the view (look), not move position.
    const lookState: Record<LookDirection, boolean> = {
        left: false,
        right: false,
        up: false,
        down: false
    };

    events.on('opentour.look.left', (down: boolean) => {
        lookState.left = down;
    });

    events.on('opentour.look.right', (down: boolean) => {
        lookState.right = down;
    });

    events.on('opentour.look.up', (down: boolean) => {
        lookState.up = down;
    });

    events.on('opentour.look.down', (down: boolean) => {
        lookState.down = down;
    });

    events.on('update', (deltaTime: number) => {
        const yawDelta = (Number(lookState.right) - Number(lookState.left)) * ARROW_LOOK_SPEED * deltaTime;
        const pitchDelta = (Number(lookState.up) - Number(lookState.down)) * ARROW_LOOK_SPEED * deltaTime;

        if (yawDelta !== 0 || pitchDelta !== 0) {
            scene.camera.setAzimElev(scene.camera.azim + yawDelta, scene.camera.elevation + pitchDelta, 0);
        }
    });

    const arrowShortcuts = new Shortcuts(events);
    arrowShortcuts.register({ event: 'opentour.look.up', keys: ['ArrowUp'], held: true, shift: 'optional', alt: 'optional' });
    arrowShortcuts.register({ event: 'opentour.look.down', keys: ['ArrowDown'], held: true, shift: 'optional', alt: 'optional' });
    arrowShortcuts.register({ event: 'opentour.look.left', keys: ['ArrowLeft'], held: true, shift: 'optional', alt: 'optional' });
    arrowShortcuts.register({ event: 'opentour.look.right', keys: ['ArrowRight'], held: true, shift: 'optional', alt: 'optional' });

    const focusBody = () => document.body.focus();
    ui.canvasContainer.addEventListener('pointerdown', focusBody);
    ui.canvasContainer.addEventListener('contextmenu', (event) => event.preventDefault());

    ui.openButton.addEventListener('click', () => {
        ui.fileInput.click();
    });

    const loadFile = async (file: File) => {
        if (!supportsModel(file.name)) {
            ui.status.textContent = `Unsupported file: ${file.name}`;
            return;
        }

        try {
            const fs = new MappedReadFileSystem();
            fs.addFile(file.name, file);

            const splat = await scene.assetLoader.load(file.name, fs);
            scene.clear();
            await scene.add(splat);
            scene.camera.focus();
            events.fire('camera.setControlMode', 'orbit');
            if (scene.contentRoot) {
                loadedRootTransform = {
                    position: scene.contentRoot.getLocalPosition().clone(),
                    rotation: scene.contentRoot.getLocalRotation().clone(),
                    scale: scene.contentRoot.getLocalScale().clone()
                };
                pushHostDebug('loadedRootTransform', {
                    model: file.name,
                    position: {
                        x: loadedRootTransform.position.x,
                        y: loadedRootTransform.position.y,
                        z: loadedRootTransform.position.z
                    },
                    rotation: {
                        x: loadedRootTransform.rotation.x,
                        y: loadedRootTransform.rotation.y,
                        z: loadedRootTransform.rotation.z,
                        w: loadedRootTransform.rotation.w
                    },
                    scale: {
                        x: loadedRootTransform.scale.x,
                        y: loadedRootTransform.scale.y,
                        z: loadedRootTransform.scale.z
                    }
                });
            } else {
                loadedRootTransform = null;
            }
            currentModelFilename = file.name;
            events.fire('opentour.model.loaded', file.name);
            syncTourLoaderButtonState();
            void refreshCinematicAvailability();
            ui.status.textContent = `Loaded: ${file.name}`;
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            loadedRootTransform = null;
            currentModelFilename = null;
            cinematicModelReady = false;
            events.fire('opentour.model.loaded', null);
            syncTourLoaderButtonState();
            ui.status.textContent = `Load failed: ${message}`;
        }
    };

    ui.fileInput.addEventListener('change', async () => {
        const file = ui.fileInput.files?.[0];
        if (file) {
            await loadFile(file);
            ui.fileInput.value = '';
        }
    });

    mountOpenTourWizardPanel(events, async (file: File) => {
        await loadFile(file);
    }, ui.loadToggle);

    scene.start();
    events.fire('camera.setControlMode', 'orbit');

    window.opentour = {
        scene,
        events
    };
};

main();
