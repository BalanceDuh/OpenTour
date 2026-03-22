import {
    ADDRESS_CLAMP_TO_EDGE,
    AMBIENTSRC_ENVALATLAS,
    BoundingBox,
    Color,
    Entity,
    EnvLighting,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    PROJECTION_PERSPECTIVE,
    TEXTUREPROJECTION_EQUIRECT,
    TONEMAP_ACES2,
    Texture,
    Vec3,
    createGraphicsDevice,
    math
} from 'playcanvas';

import { PCApp } from '../pc-app';

type Manifest = {
    title: string;
    subtitle: string;
    stats: {
        vertexCount: number;
        triangleCount: number;
        materialCount: number;
        bounds: {
            min: [number, number, number];
            max: [number, number, number];
        };
    };
    presentation: {
        camera: {
            fov: number;
            orbitYaw: number;
            orbitPitch: number;
            fitMultiplier: number;
            minZoomMultiplier: number;
            maxZoomMultiplier: number;
        };
        lighting: {
            exposure: number;
            ambient: [number, number, number];
            envIntensity: number;
            key: { color: [number, number, number]; intensity: number; euler: [number, number, number] };
            fill: { color: [number, number, number]; intensity: number; euler: [number, number, number] };
            rim: { color: [number, number, number]; intensity: number; euler: [number, number, number] };
        };
    };
    assets: {
        glb: string;
        env: string;
        reference: string;
    };
};

const manifestUrl = '/static/glb-loader/bronze-chariot/manifest.json';

const loadImageElement = (url: string, crossOrigin = false) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
});

class StableOrbit {
    target = new Vec3(0, 0, 0);
    yaw = 0;
    pitch = 0;
    radius = 10;
    desiredYaw = 0;
    desiredPitch = 0;
    desiredRadius = 10;
    minRadius = 1;
    maxRadius = 20;
    dragging = false;
    lastX = 0;
    lastY = 0;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Entity) {
        canvas.addEventListener('pointerdown', (event) => {
            this.dragging = true;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', (event) => {
            if (!this.dragging) return;
            const dx = event.clientX - this.lastX;
            const dy = event.clientY - this.lastY;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
            this.desiredYaw -= dx * 0.18;
            this.desiredPitch = math.clamp(this.desiredPitch - dy * 0.14, -55, 55);
        });
        const stop = (event: PointerEvent) => {
            if (!this.dragging) return;
            this.dragging = false;
            this.canvas.releasePointerCapture(event.pointerId);
        };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const next = this.desiredRadius * Math.exp(event.deltaY * 0.0012);
            this.desiredRadius = math.clamp(next, this.minRadius, this.maxRadius);
        }, { passive: false });
    }

    frame(bounds: BoundingBox, preset: Manifest['presentation']['camera']) {
        this.target.copy(bounds.center);
        const radius = Math.max(bounds.halfExtents.length(), 1);
        const fit = (radius * preset.fitMultiplier) / Math.sin(preset.fov * 0.5 * math.DEG_TO_RAD);
        this.radius = fit;
        this.desiredRadius = fit;
        this.minRadius = fit * preset.minZoomMultiplier;
        this.maxRadius = fit * preset.maxZoomMultiplier;
        this.yaw = preset.orbitYaw;
        this.desiredYaw = preset.orbitYaw;
        this.pitch = preset.orbitPitch;
        this.desiredPitch = preset.orbitPitch;
        this.update(1);
    }

    update(dt: number) {
        const t = Math.min(1, dt * 7.5);
        this.yaw = math.lerp(this.yaw, this.desiredYaw, t);
        this.pitch = math.lerp(this.pitch, this.desiredPitch, t);
        this.radius = math.lerp(this.radius, this.desiredRadius, t);
        const yaw = this.yaw * math.DEG_TO_RAD;
        const pitch = this.pitch * math.DEG_TO_RAD;
        const x = Math.sin(yaw) * Math.cos(pitch) * this.radius;
        const y = Math.sin(-pitch) * this.radius;
        const z = Math.cos(yaw) * Math.cos(pitch) * this.radius;
        this.camera.setPosition(this.target.x + x, this.target.y + y, this.target.z + z);
        this.camera.lookAt(this.target);
    }
}

class GlbLoaderApp {
    private readonly canvas = document.getElementById('glb-loader-canvas') as HTMLCanvasElement;
    private readonly loader = document.getElementById('glb-loader-loader') as HTMLDivElement;
    private readonly loaderText = document.getElementById('glb-loader-loader-text') as HTMLParagraphElement;
    private readonly titleText = document.getElementById('glb-loader-title-text') as HTMLHeadingElement;
    private readonly subtitleText = document.getElementById('glb-loader-subtitle-text') as HTMLParagraphElement;
    private readonly debugLog = document.getElementById('glb-loader-debug-log') as HTMLDivElement;
    private readonly debugStatus = document.getElementById('glb-loader-debug-status') as HTMLSpanElement;

    private app!: PCApp;
    private cameraEntity!: Entity;
    private modelRoot!: Entity;
    private orbit!: StableOrbit;

    private clearLog() {
        this.debugLog.textContent = '';
    }

    async boot() {
        this.log('info', 'GLB Loader boot start');
        this.setLoading('Loading GLB manifest...');
        const manifest = await fetch(manifestUrl).then((res) => res.json()) as Manifest;
        this.log('info', `Manifest loaded: ${manifest.title}`);
        this.titleText.textContent = 'GLB Loader';
        this.subtitleText.textContent = manifest.subtitle;

        this.setLoading('Booting PlayCanvas...');
        const device = await createGraphicsDevice(this.canvas, {
            deviceTypes: ['webgl2'], antialias: true, depth: true, stencil: false, xrCompatible: false, powerPreference: 'high-performance'
        });

        this.app = new PCApp(this.canvas, { graphicsDevice: device });
        this.log('info', 'PlayCanvas app initialized');
        this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.app.scene.clusteredLightingEnabled = false;
        this.app.scene.ambientLight = new Color(...manifest.presentation.lighting.ambient);
        this.app.scene.ambientLuminance = 1800;
        this.app.scene.exposure = 2.4;
        this.app.scene.physicalUnits = false;
        this.app.scene.skyboxIntensity = 1.1;
        (this.app.scene as any).ambientSource = AMBIENTSRC_ENVALATLAS;

        this.modelRoot = new Entity('glb-loader-model-root');
        this.app.root.addChild(this.modelRoot);

        this.cameraEntity = new Entity('glb-loader-camera');
        this.cameraEntity.addComponent('camera', {
            fov: manifest.presentation.camera.fov,
            nearClip: 0.3,
            farClip: 3000,
            projection: PROJECTION_PERSPECTIVE,
            clearColor: new Color(0.06, 0.08, 0.1),
            toneMapping: TONEMAP_ACES2,
            layers: [this.app.scene.layers.getLayerByName('World').id]
        });
        this.app.root.addChild(this.cameraEntity);

        this.addDirectional('key', { ...manifest.presentation.lighting.key, intensity: 6.5 });
        this.addDirectional('fill', { ...manifest.presentation.lighting.fill, intensity: 2.6 });
        this.addDirectional('rim', { ...manifest.presentation.lighting.rim, intensity: 1.4 });
        this.log('info', 'Directional lights added');

        const resize = () => {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            this.app.resizeCanvas(width, height);
            this.cameraEntity.camera.aspectRatio = width / Math.max(height, 1);
        };
        new ResizeObserver(resize).observe(document.body);
        resize();

        this.setLoading('Preparing environment reflections...');
        await this.installEnvironment(manifest.assets.env);
        this.log('info', `Environment ready: ${manifest.assets.env}`);

        this.clearLog();
        this.setLoading('Loading GLB container...');
        const entity = await this.loadContainer(manifest.assets.glb);
        this.modelRoot.addChild(entity);
        this.app.start();

        const bounds = this.computeEntityBounds(entity) || this.boundsFromManifest(manifest);
        const offset = this.centerEntityOnFloor(entity, bounds);
        const framedBounds = this.computeEntityBounds(entity) || this.offsetBounds(bounds, offset);
        this.applyVisibilityTweaks(entity);

        this.log('info', `Loaded ${manifest.assets.glb}`);
        this.log('info', `Render stats: ${manifest.stats.vertexCount} verts, ${manifest.stats.triangleCount} tris, ${manifest.stats.materialCount} materials`);
        this.log('info', `Model offset applied: ${offset.toString()}`);

        this.orbit = new StableOrbit(this.canvas, this.cameraEntity);
        this.orbit.frame(framedBounds, { ...manifest.presentation.camera, fitMultiplier: 0.74, orbitYaw: 20, orbitPitch: -7 });
        this.app.on('update', (dt: number) => this.orbit.update(dt));
        this.loader.classList.add('hidden');
        this.clearLog();
        this.log('info', `Loaded ${manifest.assets.glb}`);
        this.log('info', `Render stats: ${manifest.stats.vertexCount} verts, ${manifest.stats.triangleCount} tris, ${manifest.stats.materialCount} materials`);
        this.log('info', `Model offset applied: ${offset.toString()}`);
        this.log('info', `Camera framed at ${this.cameraEntity.getPosition().toString()}`);
        this.setLoading('GLB ready');
        this.log('info', 'Loader hidden; viewer interactive');
    }

    private boundsFromManifest(manifest: Manifest) {
        const bounds = new BoundingBox(new Vec3(), new Vec3());
        bounds.setMinMax(new Vec3(...manifest.stats.bounds.min), new Vec3(...manifest.stats.bounds.max));
        this.log('warn', 'Using manifest bounds fallback');
        return bounds;
    }

    private offsetBounds(bounds: BoundingBox, offset: Vec3) {
        const shifted = new BoundingBox(new Vec3(), new Vec3());
        shifted.setMinMax(bounds.getMin().clone().add(offset), bounds.getMax().clone().add(offset));
        return shifted;
    }

    private centerEntityOnFloor(entity: Entity, bounds: BoundingBox) {
        const min = bounds.getMin().clone();
        const max = bounds.getMax().clone();
        const offset = new Vec3(-((min.x + max.x) * 0.5), -min.y, -((min.z + max.z) * 0.5));
        entity.setLocalPosition(offset);
        return offset;
    }

    private computeEntityBounds(entity: Entity) {
        const renders = entity.findComponents('render') as unknown as Array<{ meshInstances: Array<{ aabb: BoundingBox | null }> }>;
        const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
        let count = 0;
        for (const render of renders) {
            for (const meshInstance of render.meshInstances) {
                const aabb = meshInstance.aabb;
                if (!aabb) continue;
                min.min(aabb.getMin());
                max.max(aabb.getMax());
                count += 1;
            }
        }
        if (!count || !Number.isFinite(min.x) || !Number.isFinite(max.x)) return null;
        const bounds = new BoundingBox(new Vec3(), new Vec3());
        bounds.setMinMax(min, max);
        this.log('info', `Live mesh instances: ${count}`);
        return bounds;
    }

    private applyVisibilityTweaks(entity: Entity) {
        const renders = entity.findComponents('render') as unknown as Array<{ meshInstances: Array<{ material: any }> }>;
        let count = 0;
        for (const render of renders) {
            for (const meshInstance of render.meshInstances) {
                const material = meshInstance.material as any;
                if (!material) continue;
                material.cull = 0;
                if (material.diffuse && material.diffuse.r === 0 && material.diffuse.g === 0 && material.diffuse.b === 0) {
                    material.diffuse.set(0.84, 0.86, 0.82);
                }
                if (material.emissive) {
                    material.emissive.set(0.05, 0.055, 0.05);
                }
                if (typeof material.update === 'function') material.update();
                count += 1;
            }
        }
        this.log('info', `Visibility tweaks applied to ${count} materials`);
    }

    private setLoading(message: string) {
        this.loaderText.textContent = message;
        this.debugStatus.textContent = message;
        this.log('info', message);
    }

    private log(level: 'info' | 'warn' | 'error', message: string) {
        const line = document.createElement('div');
        line.className = `glb-loader-log-line glb-loader-log-${level}`;
        const time = document.createElement('span');
        time.className = 'glb-loader-log-time';
        time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        line.appendChild(time);
        line.append(message);
        this.debugLog.appendChild(line);
        this.debugLog.scrollTop = this.debugLog.scrollHeight;
    }

    private addDirectional(name: string, preset: Manifest['presentation']['lighting']['key']) {
        const entity = new Entity(`glb-loader-${name}`);
        entity.addComponent('light', { type: 'directional', color: new Color(...preset.color), intensity: preset.intensity, castShadows: false });
        entity.setLocalEulerAngles(...preset.euler);
        this.app.root.addChild(entity);
    }

    private async installEnvironment(url: string) {
        const image = await loadImageElement(url, true);
        const texture = new Texture(this.app.graphicsDevice, {
            name: 'glb-loader-env', projection: TEXTUREPROJECTION_EQUIRECT, mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        this.app.scene.envAtlas = EnvLighting.generateAtlas(texture, { size: 512 });
        this.log('info', `Env atlas generated from ${url}`);
    }

    private async loadContainer(url: string): Promise<Entity> {
        return new Promise((resolve, reject) => {
            this.app.assets.loadFromUrl(url, 'container', (error, asset) => {
                if (error || !asset?.resource) {
                    reject(error || new Error(`Container load failed: ${url}`));
                    return;
                }
                const resource = asset.resource as { instantiateRenderEntity: (options?: object) => Entity };
                const entity = resource.instantiateRenderEntity({ castShadows: false, receiveShadows: false });
                resolve(entity);
            });
        });
    }
}

new GlbLoaderApp().boot().catch((error) => {
    console.error(error);
    const loader = document.getElementById('glb-loader-loader-text');
    const status = document.getElementById('glb-loader-debug-status');
    const log = document.getElementById('glb-loader-debug-log');
    const message = error instanceof Error ? error.message : String(error);
    if (loader) loader.textContent = message;
    if (status) status.textContent = message;
    if (log) {
        const line = document.createElement('div');
        line.className = 'glb-loader-log-line glb-loader-log-error';
        line.textContent = `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${message}`;
        log.appendChild(line);
    }
});
