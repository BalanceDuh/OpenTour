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
    createGraphicsDevice
} from 'playcanvas';

import { PCApp } from '../pc-app';

// Minimal types for loading logic
type BronzePreset = {
    objUrl: string;
    mtlUrl: string;
    tbsceneUrl: string;
};

// ... copy over load/parse utils from index.ts ...
const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
const basename = (path: string) => normalizePath(path).split('/').pop() || normalizePath(path);

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

const parseMtl = (source: string) => {
    const materials = new Map<string, { name: string, diffuse?: string }>();
    let current: { name: string, diffuse?: string } | null = null;
    source.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [keyword, ...rest] = trimmed.split(/\s+/);
        const value = rest.join(' ');
        if (keyword === 'newmtl') {
            current = { name: value };
            materials.set(value, current);
        } else if (current && (keyword === 'map_Kd' || keyword === 'map_Ka')) {
            current.diffuse = basename(value);
        }
    });
    return materials;
};

const parseTbsceneMaterials = (source: string, knownMaterials: Iterable<string>) => {
    const result = new Map<string, any>();
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
        return chunks.get(name);
    };

    ensureChunk(currentMaterial);
    const lines = source.split(/\r?\n/);

    const addVertex = (chunkName: string, vertexToken: string) => {
        const chunk = ensureChunk(chunkName);
        const existing = chunk.lookup.get(vertexToken);
        if (existing !== undefined) return existing;

        const [vIndexText, vtIndexText] = vertexToken.split('/');
        const vIndex = Number(vIndexText);
        const vtIndex = vtIndexText ? Number(vtIndexText) : 0;
        const basePosition = (vIndex - 1) * 3;
        chunk.positions.push(positions[basePosition], positions[basePosition + 1], positions[basePosition + 2]);

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

        if (keyword === 'v') positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
        else if (keyword === 'vt') texcoords.push(Number(parts[1]), Number(parts[2]));
        else if (keyword === 'usemtl') {
            currentMaterial = parts.slice(1).join(' ');
            ensureChunk(currentMaterial);
        } else if (keyword === 'f') {
            const tokens = parts.slice(1);
            if (tokens.length < 3) continue;
            const a = addVertex(currentMaterial, tokens[0]);
            for (let i = 1; i < tokens.length - 1; i += 1) {
                const b = addVertex(currentMaterial, tokens[i]);
                const c = addVertex(currentMaterial, tokens[i + 1]);
                ensureChunk(currentMaterial).indices.push(a, b, c);
            }
        }
    }

    const geometryChunks: any[] = [];
    const modelBounds = new BoundingBox();
    const modelMin = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const modelMax = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

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

class ShowcaseApp {
    private app: PCApp;
    private cameraEntity: Entity;
    private modelRoot: Entity;
    private canvas: HTMLCanvasElement;
    private loaderDiv: HTMLElement;
    private textureCache = new Map<string, Texture>();

    constructor() {
        this.canvas = document.getElementById('openmesh-showcase-canvas') as HTMLCanvasElement;
        this.loaderDiv = document.getElementById('openmesh-showcase-loading') as HTMLElement;
    }

    async boot() {
        const device = await createGraphicsDevice(this.canvas, {
            deviceTypes: ['webgl2'],
            antialias: true, // MSAA
            depth: true,
            stencil: false,
            xrCompatible: false,
            powerPreference: 'high-performance'
        });

        this.app = new PCApp(this.canvas, { graphicsDevice: device });
        
        // HIGHEST QUALITY SETTINGS
        this.app.graphicsDevice.maxPixelRatio = 2; // Locked to retina
        this.app.scene.clusteredLightingEnabled = false;
        
        // Pure IBL lighting setup
        this.app.scene.ambientLight = new Color(0.02, 0.02, 0.02); // Minimal ambient to let IBL do the work
        this.app.scene.ambientLuminance = 0;
        this.app.scene.exposure = 4.2; // Boost exposure for IBL to make it visible
        this.app.scene.physicalUnits = false;
        this.app.scene.skyboxIntensity = 3.0; // Boost HDRI lighting
        (this.app.scene as any).ambientSource = AMBIENTSRC_ENVALATLAS;

        this.modelRoot = new Entity('model-root');
        this.app.root.addChild(this.modelRoot);

        this.cameraEntity = new Entity('camera');
        this.cameraEntity.addComponent('camera', {
            fov: 24, // Telephoto for flatter, museum look
            nearClip: 0.1, // Larger near clip to eliminate Z-fighting
            farClip: 5000,
            projection: PROJECTION_PERSPECTIVE,
            clearColor: new Color(0.12, 0.14, 0.16),
            toneMapping: TONEMAP_ACES2,
            layers: [this.app.scene.layers.getLayerByName('World').id]
        });
        this.app.root.addChild(this.cameraEntity);

        // No directional lights, pure IBL
        
        const resize = () => {
            if (!this.app || !this.cameraEntity) return;
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            this.app.resizeCanvas(width, height);
            this.cameraEntity.camera.aspectRatio = width / Math.max(height, 1);
        };
        new ResizeObserver(resize).observe(document.body);
        resize();

        await this.installEnvironment();
        this.app.start();

        await this.loadBronzePreset();

        // Orbit logic
        this.setupOrbit();

        this.loaderDiv.style.opacity = '0';
        setTimeout(() => this.loaderDiv.remove(), 500);
    }

    private async installEnvironment() {
        const image = await loadImageElement('static/env/VertebraeHDRI_v1_512.png');
        const texture = new Texture(this.app.graphicsDevice, {
            name: 'env-source',
            projection: TEXTUREPROJECTION_EQUIRECT,
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(image);
        this.app.scene.envAtlas = EnvLighting.generateAtlas(texture, { size: 512 });
    }

    private async loadTexture(url: string, srgb: boolean) {
        if (this.textureCache.has(url)) return this.textureCache.get(url)!;
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
        texture.anisotropy = this.app.graphicsDevice.maxAnisotropy; // MAXIMUM ANISOTROPY
        this.textureCache.set(url, texture);
        return texture;
    }

    private async loadBronzePreset() {
        this.loaderDiv.textContent = 'Requesting bronze chariot preset...';
        const response = await fetch('/api/presets/bronze-chariot');
        const preset = await response.json() as BronzePreset;
        
        const baseRoot = new URL(`${preset.objUrl.slice(0, preset.objUrl.indexOf('/Low/'))}/`, window.location.href);
        const getUrl = (path: string) => new URL(path, baseRoot).toString();
        const readText = async (path: string) => decodeLatinText(await fetch(getUrl(path)));

        this.loaderDiv.textContent = 'Parsing OBJ geometry...';
        const objSource = await readText('Low/B.1.13119.obj');
        const mtlSource = await readText('Low/B.1.13119.mtl');
        const tbsceneSource = await readText('B.1.13119.tbscene');

        const materialSeeds = parseMtl(mtlSource);
        const materialHints = parseTbsceneMaterials(tbsceneSource, materialSeeds.keys());
        const model = parseObj(objSource);

        this.loaderDiv.textContent = 'Binding High Fidelity PBR Textures...';

        for (const chunk of model.chunks) {
            const geometry = Mesh.fromGeometry(this.app.graphicsDevice, {
                positions: chunk.positions,
                normals: chunk.normals,
                tangents: chunk.tangents,
                uvs: chunk.uvs,
                indices: chunk.indices
            } as any);

            const material = new StandardMaterial();
            material.name = chunk.materialName;
            
            // STRICT PBR BASELINE FOR BRONZE
            material.useMetalness = true;
            material.diffuse = new Color(0.2, 0.2, 0.2); // Base visibility
            material.metalness = 0.9;
            material.gloss = 0.55;
            material.bumpiness = 1.0;
            material.occludeSpecular = 1;
            material.specular = new Color(0.9, 0.95, 0.85); // Bronze tint for reflections

            const textureSet = materialHints.get(chunk.materialName);
            if (textureSet?.diffuse) {
                material.diffuseMap = await this.loadTexture(getUrl(textureSet.diffuse), true);
                material.specularMap = material.diffuseMap;
            }
            if (textureSet?.normal) {
                material.normalMap = await this.loadTexture(getUrl(textureSet.normal), false);
            }
            if (textureSet?.ao) {
                material.aoMap = await this.loadTexture(getUrl(textureSet.ao), false);
                material.aoMapChannel = 'r';
                material.aoIntensity = 0.4; // Soften AO so it doesn't crush blacks
                // Use AO map as roughness as per original exporter's likely intent
                material.glossMap = material.aoMap;
                material.glossMapChannel = 'r';
                material.glossInvert = true;
                material.gloss = 0.7; 
            }
            if (textureSet?.metalness) {
                material.metalnessMap = await this.loadTexture(getUrl(textureSet.metalness), false);
                material.metalnessMapChannel = 'r';
                material.metalness = 1.0;
            }

            material.update();

            const entity = new Entity(`mesh-${chunk.materialName}`);
            const meshInstance = new MeshInstance(geometry, material, entity);
            entity.addComponent('render', {
                meshInstances: [meshInstance],
                castShadows: false, // Turn off to eliminate flickering
                receiveShadows: false
            });
            this.modelRoot.addChild(entity);
        }

        const originalMin = model.bounds.getMin().clone();
        const originalMax = model.bounds.getMax().clone();
        const offset = new Vec3(
            -((originalMin.x + originalMax.x) * 0.5),
            -originalMin.y,
            -((originalMin.z + originalMax.z) * 0.5)
        );
        
        this.modelRoot.setLocalPosition(offset);
        
        // Frame camera perfectly for museum shot
        const radius = Math.max(model.bounds.halfExtents.length(), 1);
        const dist = (radius * 1.05) / Math.sin(24 * 0.5 * (Math.PI / 180));
        
        this.cameraEntity.setPosition(dist * 0.6, dist * 0.2, dist * 0.8);
        this.cameraEntity.lookAt(0, 0, 0);
    }

    private setupOrbit() {
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
        let yaw = 36;
        let pitch = -12;
        const radius = this.cameraEntity.getPosition().length();

        this.canvas.addEventListener('pointerdown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            this.canvas.setPointerCapture(e.pointerId);
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;

            yaw -= dx * 0.2;
            pitch = Math.max(-89, Math.min(89, pitch - dy * 0.2));

            const yRad = yaw * (Math.PI / 180);
            const pRad = pitch * (Math.PI / 180);

            const x = Math.sin(yRad) * Math.cos(pRad) * radius;
            const y = Math.sin(-pRad) * radius;
            const z = Math.cos(yRad) * Math.cos(pRad) * radius;

            this.cameraEntity.setPosition(x, y, z);
            this.cameraEntity.lookAt(0, 0, 0);
        });

        this.canvas.addEventListener('pointerup', (e) => {
            isDragging = false;
            this.canvas.releasePointerCapture(e.pointerId);
        });
    }
}

new ShowcaseApp().boot().catch(console.error);