import { Vec3 } from 'playcanvas';

import { ElementType } from '../element';
import type { Events } from '../events';
import type { Scene } from '../scene';
import {
    buildStep3OwnRuntime,
    overlayUvToCanvas,
    projectStep3CameraOverlay,
    type Step3CameraPose,
    type Step3OwnRuntime,
    type Step3SamplePoint
} from './Step3CameraPosition_Own_GPT';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const pushStep3Debug = (scope: string, payload: unknown) => {
    const w = window as unknown as {
        __otStep3Debug?: {
            step3Panel?: unknown[];
        };
    };
    if (!w.__otStep3Debug) w.__otStep3Debug = {};
    if (!w.__otStep3Debug.step3Panel) w.__otStep3Debug.step3Panel = [];
    w.__otStep3Debug.step3Panel.push({
        ts: new Date().toISOString(),
        scope,
        ...payload as object
    });
    if (w.__otStep3Debug.step3Panel.length > 300) {
        w.__otStep3Debug.step3Panel.splice(0, w.__otStep3Debug.step3Panel.length - 300);
    }
};

const planeLabels = () => {
    return {
        map: '[X, -Z]',
        front: '[X, Y] (Y-up)'
    };
};

class Step3DualViewPanel {
    private readonly scene: Scene;

    private readonly getCurrentModelFilename: () => string | null;

    private readonly root: HTMLDivElement;

    private readonly statusEl: HTMLDivElement;

    private readonly mapCanvas: HTMLCanvasElement;

    private readonly frontCanvas: HTMLCanvasElement;

    private readonly mapTitleEl: HTMLDivElement;

    private readonly frontTitleEl: HTMLDivElement;

    private dragActive = false;

    private dragPointerId = -1;

    private dragStartX = 0;

    private dragStartY = 0;

    private dragBaseLeft = 0;

    private dragBaseTop = 0;

    private didManualDrag = false;

    private runtime: Step3OwnRuntime | null = null;

    private mapImageData: ImageData | null = null;

    private frontImageData: ImageData | null = null;

    private rebuildSeq = 0;

    constructor(events: Events, scene: Scene, getCurrentModelFilename: () => string | null) {
        this.scene = scene;
        this.getCurrentModelFilename = getCurrentModelFilename;

        this.root = document.createElement('div');
        this.root.id = 'opentour-step3-panel';
        this.root.classList.add('hidden');
        this.root.innerHTML = `
            <div class="opentour-step3-head">
                <div class="opentour-step3-title">Step3 Dual View</div>
                <button type="button" class="opentour-step3-close" data-act="close" aria-label="Close Step3 Dual View" title="Close">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                </button>
            </div>
            <div class="opentour-step3-status">Ready</div>
            <div class="opentour-step3-body">
                <div class="opentour-step3-card">
                    <div class="opentour-step3-card-title" data-role="map-title">Top（俯视图）平面: --</div>
                    <canvas width="560" height="320"></canvas>
                </div>
                <div class="opentour-step3-card">
                    <div class="opentour-step3-card-title" data-role="front-title">Front（正视图）平面: --</div>
                    <canvas width="560" height="320"></canvas>
                </div>
            </div>
        `;

        document.body.appendChild(this.root);
        this.statusEl = this.root.querySelector('.opentour-step3-status') as HTMLDivElement;
        this.mapCanvas = this.root.querySelectorAll('canvas')[0] as HTMLCanvasElement;
        this.frontCanvas = this.root.querySelectorAll('canvas')[1] as HTMLCanvasElement;
        this.mapTitleEl = this.root.querySelector('[data-role="map-title"]') as HTMLDivElement;
        this.frontTitleEl = this.root.querySelector('[data-role="front-title"]') as HTMLDivElement;

        const head = this.root.querySelector('.opentour-step3-head') as HTMLDivElement;
        const closeBtn = this.root.querySelector('[data-act="close"]') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => this.hide());
        head.addEventListener('pointerdown', (event) => this.startDrag(event));
        head.addEventListener('pointermove', (event) => this.moveDrag(event));
        head.addEventListener('pointerup', (event) => this.endDrag(event));
        head.addEventListener('pointercancel', (event) => this.endDrag(event));

        this.applyDefaultPosition();

        events.on('prerender', () => {
            this.renderFrame();
        });

        events.on('opentour.model.loaded', async () => {
            if (this.root.classList.contains('hidden')) return;
            await this.rebuildFromCurrentModel();
        });
    }

    async toggle() {
        if (this.root.classList.contains('hidden')) {
            await this.open();
            return;
        }
        this.hide();
    }

    private async open() {
        this.root.classList.remove('hidden');
        if (!this.didManualDrag) this.applyDefaultPosition();
        await this.rebuildFromCurrentModel();
    }

    private hide() {
        this.root.classList.add('hidden');
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
    }

    private summarizePoints(points: Step3SamplePoint[]) {
        let xMin = Number.POSITIVE_INFINITY;
        let xMax = Number.NEGATIVE_INFINITY;
        let yMin = Number.POSITIVE_INFINITY;
        let yMax = Number.NEGATIVE_INFINITY;
        let zMin = Number.POSITIVE_INFINITY;
        let zMax = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            if (p.x < xMin) xMin = p.x;
            if (p.x > xMax) xMax = p.x;
            if (p.y < yMin) yMin = p.y;
            if (p.y > yMax) yMax = p.y;
            if (p.z < zMin) zMin = p.z;
            if (p.z > zMax) zMax = p.z;
        }
        return { xMin, xMax, yMin, yMax, zMin, zMax };
    }

    private async rebuildFromCurrentModel() {
        const seq = ++this.rebuildSeq;
        this.setStatus('Building Top[X,-Z] and Front[X,Y] from current scene...');

        const modelFilename = this.getCurrentModelFilename();
        if (!modelFilename) {
            this.runtime = null;
            this.mapImageData = null;
            this.frontImageData = null;
            this.clearCanvases();
            this.setStatus('No model loaded. Load a model first.');
            return;
        }

        const points = this.extractScenePoints();
        const root = this.scene?.contentRoot;
        const rootRotation = root?.getLocalRotation?.();
        const rootScale = root?.getLocalScale?.();
        pushStep3Debug('rebuild-begin', {
            modelFilename,
            points: points.length,
            stats: this.summarizePoints(points),
            rootRotation: rootRotation ? { x: rootRotation.x, y: rootRotation.y, z: rootRotation.z, w: rootRotation.w } : null,
            rootScale: rootScale ? { x: rootScale.x, y: rootScale.y, z: rootScale.z } : null,
            sampleFirst5: points.slice(0, 5)
        });
        if (points.length < 120) {
            this.runtime = null;
            this.mapImageData = null;
            this.frontImageData = null;
            this.clearCanvases();
            this.setStatus('Point cloud samples are insufficient.');
            return;
        }

        if (seq !== this.rebuildSeq) return;

        try {
            this.runtime = buildStep3OwnRuntime({
                sampledPoints: points,
                mapWidth: this.mapCanvas.width,
                mapHeight: this.mapCanvas.height,
                frontWidth: this.frontCanvas.width,
                frontHeight: this.frontCanvas.height
            });
        } catch (error) {
            this.runtime = null;
            this.mapImageData = null;
            this.frontImageData = null;
            this.clearCanvases();
            this.mapTitleEl.textContent = 'Top（俯视图）平面: --';
            this.frontTitleEl.textContent = 'Front（正视图）平面: --';
            this.setStatus(error instanceof Error ? error.message : 'Failed to build runtime');
            return;
        }

        this.mapImageData = new ImageData(new Uint8ClampedArray(this.runtime.map.image), this.runtime.map.width, this.runtime.map.height);
        this.frontImageData = new ImageData(new Uint8ClampedArray(this.runtime.front.image), this.runtime.front.width, this.runtime.front.height);
        const labels = planeLabels();
        this.mapTitleEl.textContent = `Top（俯视图）平面: ${labels.map}`;
        this.frontTitleEl.textContent = `Front（正视图）平面: ${labels.front}`;
        this.setStatus('Projection fixed: Top[X,-Z], Front[X,Y]');
        pushStep3Debug('rebuild-done', {
            points: points.length,
            mapRange: this.runtime.map.range,
            frontRange: this.runtime.front.range
        });
        this.renderFrame();
    }

    private applyDefaultPosition() {
        const width = this.root.offsetWidth || 980;
        const left = Math.max(8, window.innerWidth - width - 16);
        const top = 112;
        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
    }

    private startDrag(event: PointerEvent) {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;
        this.dragActive = true;
        this.dragPointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragBaseLeft = this.root.offsetLeft;
        this.dragBaseTop = this.root.offsetTop;
        const head = event.currentTarget as HTMLElement;
        head.setPointerCapture(event.pointerId);
    }

    private moveDrag(event: PointerEvent) {
        if (!this.dragActive || event.pointerId !== this.dragPointerId) return;
        const deltaX = event.clientX - this.dragStartX;
        const deltaY = event.clientY - this.dragStartY;
        const nextLeft = clamp(this.dragBaseLeft + deltaX, 6, Math.max(6, window.innerWidth - this.root.offsetWidth - 6));
        const nextTop = clamp(this.dragBaseTop + deltaY, 6, Math.max(6, window.innerHeight - this.root.offsetHeight - 6));
        this.root.style.left = `${nextLeft}px`;
        this.root.style.top = `${nextTop}px`;
        this.didManualDrag = true;
    }

    private endDrag(event: PointerEvent) {
        if (event.pointerId !== this.dragPointerId) return;
        this.dragActive = false;
        const head = event.currentTarget as HTMLElement;
        if (head.hasPointerCapture(event.pointerId)) {
            head.releasePointerCapture(event.pointerId);
        }
        this.dragPointerId = -1;
    }

    private clearCanvases() {
        const mapCtx = this.mapCanvas.getContext('2d');
        const frontCtx = this.frontCanvas.getContext('2d');
        if (mapCtx) mapCtx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);
        if (frontCtx) frontCtx.clearRect(0, 0, this.frontCanvas.width, this.frontCanvas.height);
    }

    private extractScenePoints() {
        const points: Step3SamplePoint[] = [];
        const pushPoint = (x: number, y: number, z: number, opacity = 1) => {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
            points.push({ x, y, z, opacity: clamp(opacity, 0, 1) });
        };

        let splats: any[] = [];
        try {
            splats = this.scene?.getElementsByType?.(ElementType.splat) || [];
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

            const entity = splat?.entity;
            if (entity?.getPosition) {
                const p = entity.getPosition();
                pushPoint(p.x, p.y, p.z, 0.4);
            }
        });

        return points;
    }

    private getCameraPoseWorld(): Step3CameraPose | null {
        const camera = this.scene?.camera;
        const eye = camera?.position;
        const forward = camera?.forward;
        if (!eye || !forward) return null;

        const worldEye = new Vec3(eye.x, eye.y, eye.z);
        const worldForward = new Vec3(forward.x, forward.y, forward.z);
        if (worldForward.lengthSq() < 1e-8) return null;
        worldForward.normalize();

        return {
            eye: { x: worldEye.x, y: worldEye.y, z: worldEye.z },
            forward: { x: worldForward.x, y: worldForward.y, z: worldForward.z }
        };
    }

    private drawOverlay(view: 'map' | 'front', canvas: HTMLCanvasElement) {
        if (!this.runtime) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pose = this.getCameraPoseWorld();
        const overlay = projectStep3CameraOverlay({
            runtime: this.runtime,
            cameraPose: pose,
            view,
            directionLengthMeters: 1.5
        });
        if (!overlay.valid || !overlay.pointVisible) return;

        const point = overlayUvToCanvas(overlay.point, canvas.width, canvas.height);
        const tip = overlayUvToCanvas(overlay.directionToRaw, canvas.width, canvas.height);

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();

        if (overlay.directionVisible) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();

            const angle = Math.atan2(tip.y - point.y, tip.x - point.x);
            const head = 10;
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(tip.x - Math.cos(angle - Math.PI / 7) * head, tip.y - Math.sin(angle - Math.PI / 7) * head);
            ctx.lineTo(tip.x - Math.cos(angle + Math.PI / 7) * head, tip.y - Math.sin(angle + Math.PI / 7) * head);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    private renderFrame() {
        if (this.root.classList.contains('hidden')) return;
        if (!this.runtime || !this.mapImageData || !this.frontImageData) return;

        const mapCtx = this.mapCanvas.getContext('2d');
        const frontCtx = this.frontCanvas.getContext('2d');
        if (!mapCtx || !frontCtx) return;

        mapCtx.putImageData(this.mapImageData, 0, 0);
        frontCtx.putImageData(this.frontImageData, 0, 0);
        this.drawOverlay('map', this.mapCanvas);
        this.drawOverlay('front', this.frontCanvas);
    }
}

const mountStep3DualViewPanel = (events: Events, scene: Scene, getCurrentModelFilename: () => string | null) => {
    return new Step3DualViewPanel(events, scene, getCurrentModelFilename);
};

export {
    mountStep3DualViewPanel
};
