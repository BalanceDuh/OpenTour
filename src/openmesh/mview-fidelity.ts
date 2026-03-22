import {
    ADDRESS_CLAMP_TO_EDGE,
    AMBIENTSRC_ENVALATLAS,
    BoundingBox,
    Color,
    Entity,
    EnvLighting,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    Mesh,
    MeshInstance,
    PROJECTION_PERSPECTIVE,
    StandardMaterial,
    Texture,
    TONEMAP_ACES2,
    TEXTUREPROJECTION_EQUIRECT,
    Vec3,
    calculateNormals,
    calculateTangents,
    createGraphicsDevice,
    math
} from 'playcanvas';

import { PCApp } from '../pc-app';

type MaterialTextures = {
    diffuse?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
    metalness?: string;
};

type ClassifiedMaterialEntry = {
    albedo?: string;
    normal?: string;
    roughnessOrGloss?: string;
    ao?: string;
    metalness?: string;
};

type MviewScene = {
    mainCamera?: {
        view?: {
            angles?: [number, number];
            orbitRadius?: number;
            pivot?: [number, number, number];
            fov?: number;
        };
        post?: {
            sharpen?: number;
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
};

const RESOURCE_BASE = '/workspace-resource/B.1.13119%20%E4%B8%9C%E6%B1%89%E9%93%9C%E8%BD%A6%E9%A9%AC%202';
const SCENE_URL = `${RESOURCE_BASE}/mview-extracted/scene.json`;
const OBJ_URL = `${RESOURCE_BASE}/Low/B.1.13119.obj`;
const CLASSIFIED_URL = '/static/showcase2/bronze-chariot/classified-materials.json';
const ENV_URL = '/static/env/VertebraeHDRI_v1_512.png';

const statusEl = document.getElementById('status') as HTMLDivElement;
const canvas = document.getElementById('viewer') as HTMLCanvasElement;

const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
const loadImageElement = (url: string, crossOrigin = false) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
});

const loadJson = async <T>(url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return await response.json() as T;
};

const parseObj = (source: string) => {
    const positions: number[] = [];
    const texcoords: number[] = [];
    const materialOrder: string[] = [];
    const chunks = new Map<string, { positions: number[]; uvs: number[]; indices: number[]; lookup: Map<string, number> }>();
    let currentMaterial = 'default';

    const ensureChunk = (name: string) => {
        if (!chunks.has(name)) {
            chunks.set(name, { positions: [], uvs: [], indices: [], lookup: new Map() });
            materialOrder.push(name);
        }
        return chunks.get(name)!;
    };

    const addVertex = (chunkName: string, token: string) => {
        const chunk = ensureChunk(chunkName);
        const existing = chunk.lookup.get(token);
        if (existing !== undefined) return existing;
        const [vText, vtText] = token.split('/');
        const vIndex = Number(vText);
        const vtIndex = vtText ? Number(vtText) : 0;
        const basePos = (vIndex - 1) * 3;
        chunk.positions.push(positions[basePos], positions[basePos + 1], positions[basePos + 2]);
        if (vtIndex > 0) {
            const baseUv = (vtIndex - 1) * 2;
            chunk.uvs.push(texcoords[baseUv], 1 - texcoords[baseUv + 1]);
        } else {
            chunk.uvs.push(0, 0);
        }
        const index = chunk.positions.length / 3 - 1;
        chunk.lookup.set(token, index);
        return index;
    };

    ensureChunk(currentMaterial);
    source.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const parts = trimmed.split(/\s+/);
        const keyword = parts[0];
        if (keyword === 'v') positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
        else if (keyword === 'vt') texcoords.push(Number(parts[1]), Number(parts[2]));
        else if (keyword === 'usemtl') currentMaterial = parts.slice(1).join(' ');
        else if (keyword === 'f') {
            const tokens = parts.slice(1);
            if (tokens.length < 3) return;
            const a = addVertex(currentMaterial, tokens[0]);
            for (let i = 1; i < tokens.length - 1; i += 1) {
                const b = addVertex(currentMaterial, tokens[i]);
                const c = addVertex(currentMaterial, tokens[i + 1]);
                ensureChunk(currentMaterial).indices.push(a, b, c);
            }
        }
    });

    const modelBounds = new BoundingBox();
    const modelMin = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const modelMax = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    const geometryChunks: GeometryChunk[] = [];

    materialOrder.forEach((materialName) => {
        const chunk = chunks.get(materialName);
        if (!chunk || chunk.indices.length === 0) return;
        const normals = calculateNormals(chunk.positions, chunk.indices);
        const tangents = chunk.uvs.length ? calculateTangents(chunk.positions, normals, chunk.uvs, chunk.indices) : undefined;
        const vertexCount = chunk.positions.length / 3;
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
            indices: vertexCount > 65535 ? new Uint32Array(chunk.indices) : new Uint16Array(chunk.indices)
        });
    });

    modelBounds.setMinMax(modelMin, modelMax);
    return { chunks: geometryChunks, bounds: modelBounds };
};

class OrbitController {
    target = new Vec3();
    yaw = 0;
    pitch = 0;
    radius = 10;
    desiredYaw = 0;
    desiredPitch = 0;
    desiredRadius = 10;
    minRadius = 4;
    maxRadius = 60;
    dragging = false;
    lastX = 0;
    lastY = 0;

    constructor(private readonly dom: HTMLCanvasElement, private readonly camera: Entity) {
        dom.addEventListener('pointerdown', (event) => {
            this.dragging = true;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
            dom.setPointerCapture(event.pointerId);
        });
        dom.addEventListener('pointermove', (event) => {
            if (!this.dragging) return;
            const dx = event.clientX - this.lastX;
            const dy = event.clientY - this.lastY;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
            this.desiredYaw -= dx * 0.18;
            this.desiredPitch = math.clamp(this.desiredPitch - dy * 0.14, -55, 55);
        });
        const release = (event: PointerEvent) => {
            if (!this.dragging) return;
            this.dragging = false;
            dom.releasePointerCapture(event.pointerId);
        };
        dom.addEventListener('pointerup', release);
        dom.addEventListener('pointercancel', release);
        dom.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.desiredRadius = math.clamp(this.desiredRadius * Math.exp(event.deltaY * 0.0012), this.minRadius, this.maxRadius);
        }, { passive: false });
    }

    frame(bounds: BoundingBox, cameraView?: MviewScene['mainCamera']['view']) {
        this.target.copy(bounds.center);
        this.pitch = this.desiredPitch = cameraView?.angles?.[0] ?? -14;
        this.yaw = this.desiredYaw = cameraView?.angles?.[1] ?? 305;
        const fitRadius = Math.max(bounds.halfExtents.length() * 2.35, 520);
        this.minRadius = Math.max(fitRadius * 0.18, 40);
        this.maxRadius = Math.max(fitRadius * 4.5, fitRadius + 1200);
        this.radius = this.desiredRadius = fitRadius;
        this.update(1);
    }

    update(dt: number) {
        const lerp = Math.min(1, dt * 7.5);
        this.yaw = math.lerp(this.yaw, this.desiredYaw, lerp);
        this.pitch = math.lerp(this.pitch, this.desiredPitch, lerp);
        this.radius = math.lerp(this.radius, this.desiredRadius, lerp);
        const yaw = this.yaw * math.DEG_TO_RAD;
        const pitch = this.pitch * math.DEG_TO_RAD;
        const x = Math.sin(yaw) * Math.cos(pitch) * this.radius;
        const y = Math.sin(-pitch) * this.radius;
        const z = Math.cos(yaw) * Math.cos(pitch) * this.radius;
        this.camera.setPosition(this.target.x + x, this.target.y + y, this.target.z + z);
        this.camera.lookAt(this.target);
    }
}

class MviewFidelityApp {
    app!: PCApp;
    cameraEntity!: Entity;
    modelRoot!: Entity;
    orbit!: OrbitController;
    textureCache = new Map<string, Texture>();

    async boot() {
        statusEl.textContent = 'Loading extracted Mview scene...';
        const [scene, classified, objSource] = await Promise.all([
            loadJson<MviewScene>(SCENE_URL),
            loadJson<Record<string, ClassifiedMaterialEntry>>(CLASSIFIED_URL),
            fetch(OBJ_URL).then((res) => res.text())
        ]);

        const model = parseObj(objSource);
        const device = await createGraphicsDevice(canvas, {
            deviceTypes: ['webgl2'],
            antialias: true,
            depth: true,
            stencil: false,
            xrCompatible: false,
            powerPreference: 'high-performance'
        });
        this.app = new PCApp(canvas, { graphicsDevice: device });
        this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 3);
        this.app.scene.clusteredLightingEnabled = false;
        this.app.scene.ambientLight = new Color(0.02, 0.02, 0.02);
        this.app.scene.ambientLuminance = 0;
        this.app.scene.exposure = 3.6;
        this.app.scene.physicalUnits = false;
        this.app.scene.skyboxIntensity = 2.4;
        (this.app.scene as any).ambientSource = AMBIENTSRC_ENVALATLAS;

        this.modelRoot = new Entity('model-root');
        this.app.root.addChild(this.modelRoot);
        this.cameraEntity = new Entity('camera');
        this.cameraEntity.addComponent('camera', {
            fov: scene.mainCamera?.view?.fov ?? 45,
            nearClip: 0.1,
            farClip: 5000,
            projection: PROJECTION_PERSPECTIVE,
            clearColor: new Color(0.48, 0.48, 0.48),
            toneMapping: TONEMAP_ACES2,
            layers: [this.app.scene.layers.getLayerByName('World').id]
        });
        this.app.root.addChild(this.cameraEntity);

        if (scene.sky?.backgroundColor) {
            const [r, g, b] = scene.sky.backgroundColor;
            const brightness = scene.sky.backgroundBrightness ?? 1;
            const bg = new Color(r * brightness, g * brightness, b * brightness);
            this.cameraEntity.camera.clearColor = bg;
            document.body.style.background = `rgb(${Math.round(bg.r * 255)} ${Math.round(bg.g * 255)} ${Math.round(bg.b * 255)})`;
        }
        if ((scene.mainCamera?.post?.sharpen ?? 0) > 0.5) {
            canvas.style.filter = 'contrast(1.04) saturate(1.1)';
        }

        await this.installEnvironment();
        await this.mountModel(model, scene, classified);

        this.orbit = new OrbitController(canvas, this.cameraEntity);
        this.orbit.frame(this.computeBounds(), scene.mainCamera?.view);

        const resize = () => {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            this.app.resizeCanvas(width, height);
            this.cameraEntity.camera.aspectRatio = width / Math.max(height, 1);
        };
        new ResizeObserver(resize).observe(document.body);
        resize();

        this.app.on('update', (dt: number) => this.orbit.update(dt));
        this.app.start();
        statusEl.textContent = 'Mview fidelity viewer ready.';
    }

    private async installEnvironment() {
        statusEl.textContent = 'Installing IBL environment...';
        const image = await loadImageElement(ENV_URL, true);
        const texture = new Texture(this.app.graphicsDevice, {
            name: 'mview-fidelity-env',
            projection: TEXTUREPROJECTION_EQUIRECT,
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        this.app.scene.envAtlas = EnvLighting.generateAtlas(texture, { size: 1024 });
    }

    private async loadTexture(url: string, srgb: boolean) {
        if (this.textureCache.has(url)) return this.textureCache.get(url)!;
        const image = await loadImageElement(url, true);
        const texture = new Texture(this.app.graphicsDevice, {
            name: normalizePath(url).split('/').pop() || 'tex',
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        texture.srgb = srgb;
        texture.anisotropy = this.app.graphicsDevice.maxAnisotropy;
        this.textureCache.set(url, texture);
        return texture;
    }

    private async mountModel(model: ReturnType<typeof parseObj>, scene: MviewScene, classified: Record<string, ClassifiedMaterialEntry>) {
        statusEl.textContent = 'Binding extracted Mview materials...';
        const sceneMaterials = new Map(scene.materials?.map((entry) => [entry.name, entry]) ?? []);
        for (const chunk of model.chunks) {
            const geometry = Mesh.fromGeometry(this.app.graphicsDevice, {
                positions: chunk.positions as any,
                normals: chunk.normals as any,
                tangents: chunk.tangents as any,
                uvs: chunk.uvs as any,
                indices: chunk.indices as any
            } as any);

            const sceneMaterial = sceneMaterials.get(chunk.materialName);
            const classifiedMaterial = classified[chunk.materialName];
            const textures: MaterialTextures = {
                diffuse: sceneMaterial?.albedoTex ? `${RESOURCE_BASE}/mview-extracted/${sceneMaterial.albedoTex}` : classifiedMaterial?.albedo ? `${RESOURCE_BASE}/${normalizePath(classifiedMaterial.albedo)}` : undefined,
                normal: sceneMaterial?.normalTex ? `${RESOURCE_BASE}/mview-extracted/${sceneMaterial.normalTex}` : classifiedMaterial?.normal ? `${RESOURCE_BASE}/${normalizePath(classifiedMaterial.normal)}` : undefined,
                roughness: sceneMaterial?.glossTex ? `${RESOURCE_BASE}/mview-extracted/${sceneMaterial.glossTex}` : classifiedMaterial?.roughnessOrGloss ? `${RESOURCE_BASE}/${normalizePath(classifiedMaterial.roughnessOrGloss)}` : undefined,
                ao: classifiedMaterial?.ao ? `${RESOURCE_BASE}/${normalizePath(classifiedMaterial.ao)}` : undefined,
                metalness: classifiedMaterial?.metalness ? `${RESOURCE_BASE}/${normalizePath(classifiedMaterial.metalness)}` : undefined
            };

            const material = new StandardMaterial();
            material.name = chunk.materialName;
            material.useMetalness = true;
            material.diffuse = new Color(1, 1, 1);
            material.metalness = 0.18;
            material.gloss = 0.58;
            material.bumpiness = 0.62;
            material.occludeSpecular = 1;

            if (textures.diffuse) material.diffuseMap = await this.loadTexture(textures.diffuse, true);
            if (textures.normal) material.normalMap = await this.loadTexture(textures.normal, false);
            if (textures.roughness) {
                material.glossMap = await this.loadTexture(textures.roughness, false);
                material.glossMapChannel = 'r';
                material.glossInvert = false;
            }
            if (textures.ao) {
                material.aoMap = await this.loadTexture(textures.ao, false);
                material.aoMapChannel = 'r';
                material.aoIntensity = 0.26;
            }
            if (textures.metalness) {
                material.metalnessMap = await this.loadTexture(textures.metalness, false);
                material.metalnessMapChannel = 'r';
            }

            material.update();

            const entity = new Entity(`mesh-${chunk.materialName}`);
            const meshInstance = new MeshInstance(geometry, material, entity);
            entity.addComponent('render', {
                meshInstances: [meshInstance],
                castShadows: false,
                receiveShadows: false
            });
            this.modelRoot.addChild(entity);
        }

        const min = model.bounds.getMin().clone();
        const max = model.bounds.getMax().clone();
        const offset = new Vec3(-((min.x + max.x) * 0.5), -min.y, -((min.z + max.z) * 0.5));
        this.modelRoot.setLocalPosition(offset);
    }

    private computeBounds() {
        const combined = new BoundingBox();
        const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
        this.modelRoot.children.forEach((child) => {
            const render = (child as Entity).render;
            render?.meshInstances.forEach((instance: MeshInstance) => {
                min.min(instance.aabb.getMin());
                max.max(instance.aabb.getMax());
            });
        });
        combined.setMinMax(min, max);
        return combined;
    }
}

void new MviewFidelityApp().boot().catch((error) => {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
});
