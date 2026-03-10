import { Mat4, Vec3 } from 'playcanvas';

import { ElementType } from '../element';
import type { Events } from '../events';
import type { Scene } from '../scene';
import {
    STEP3_GIMI_DEFAULT_PRESET,
    buildStep3GimiRuntime,
    overlayUvToCanvas,
    projectStep3GimiCamera,
    type Step3GimiCameraPose,
    type Step3GimiCoordinateInput,
    type Step3GimiRuntime,
    type Step3GimiSamplePoint
} from './Step3CameraPosition_Gimi';

type CoordinateResponse = {
    ok: boolean;
    found?: boolean;
    modelFilename?: string;
    coordinate?: {
        coordinateSystem?: string;
        upAxis?: string;
        upDirection?: string;
        axisPresetId?: string;
    };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const formatCoordinateTag = (coordinate: Step3GimiCoordinateInput, runtimePresetId: string) => {
    const axisPreset = String(coordinate.axisPresetId || runtimePresetId || STEP3_GIMI_DEFAULT_PRESET).trim();
    const compact = axisPreset.length ? axisPreset : STEP3_GIMI_DEFAULT_PRESET;
    return compact.toUpperCase().replace(/-/g, '-');
};

class Step3GimiDualViewPanel {
    private readonly scene: Scene;

    private readonly getCurrentModelFilename: () => string | null;

    private readonly root: HTMLDivElement;

    private readonly statusEl: HTMLDivElement;

    private readonly topCanvas: HTMLCanvasElement;

    private readonly frontCanvas: HTMLCanvasElement;

    private readonly topTitleEl: HTMLDivElement;

    private readonly frontTitleEl: HTMLDivElement;

    private readonly coordEl: HTMLDivElement;

    private dragActive = false;

    private dragPointerId = -1;

    private dragStartX = 0;

    private dragStartY = 0;

    private dragBaseLeft = 0;

    private dragBaseTop = 0;

    private didManualDrag = false;

    private runtime: Step3GimiRuntime | null = null;

    private topImageData: ImageData | null = null;

    private frontImageData: ImageData | null = null;

    constructor(events: Events, scene: Scene, getCurrentModelFilename: () => string | null) {
        this.scene = scene;
        this.getCurrentModelFilename = getCurrentModelFilename;

        this.root = document.createElement('div');
        this.root.id = 'opentour-step3-gimi-panel';
        this.root.classList.add('hidden');
        this.root.innerHTML = `
            <div class="opentour-step3-gimi-head">
                <div class="opentour-step3-gimi-title">Fly Camera Position</div>
                <button type="button" class="opentour-step3-gimi-close" data-act="close" aria-label="Close Fly Camera Position" title="Close">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                </button>
            </div>
            <div class="opentour-step3-gimi-meta" data-role="coord">Coordinate: --</div>
            <div class="opentour-step3-gimi-status">Ready</div>
            <div class="opentour-step3-gimi-body">
                <div class="opentour-step3-gimi-card">
                    <div class="opentour-step3-gimi-card-title" data-role="top-title">Top / Plan</div>
                    <canvas width="560" height="320"></canvas>
                </div>
                <div class="opentour-step3-gimi-card">
                    <div class="opentour-step3-gimi-card-title" data-role="front-title">Front</div>
                    <canvas width="560" height="320"></canvas>
                </div>
            </div>
        `;

        document.body.appendChild(this.root);
        this.statusEl = this.root.querySelector('.opentour-step3-gimi-status') as HTMLDivElement;
        this.coordEl = this.root.querySelector('[data-role="coord"]') as HTMLDivElement;
        this.topCanvas = this.root.querySelectorAll('canvas')[0] as HTMLCanvasElement;
        this.frontCanvas = this.root.querySelectorAll('canvas')[1] as HTMLCanvasElement;
        this.topTitleEl = this.root.querySelector('[data-role="top-title"]') as HTMLDivElement;
        this.frontTitleEl = this.root.querySelector('[data-role="front-title"]') as HTMLDivElement;

        const head = this.root.querySelector('.opentour-step3-gimi-head') as HTMLDivElement;
        const closeBtn = this.root.querySelector('[data-act="close"]') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => this.hide());
        head.addEventListener('pointerdown', (event) => this.startDrag(event));
        head.addEventListener('pointermove', (event) => this.moveDrag(event));
        head.addEventListener('pointerup', (event) => this.endDrag(event));
        head.addEventListener('pointercancel', (event) => this.endDrag(event));

        this.applyDefaultPosition();
        events.on('prerender', () => this.renderFrame());
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
        this.setStatus('Loading coordinate system and generating plan/front views...');

        const modelFilename = this.getCurrentModelFilename();
        if (!modelFilename) {
            this.setStatus('No model loaded. Load a model first.');
            return;
        }

        const coordinate = await this.fetchCoordinate(modelFilename);
        const points = this.extractScenePoints();
        if (points.length < 120) {
            this.runtime = null;
            this.topImageData = null;
            this.frontImageData = null;
            this.clearCanvases();
            this.setStatus('Point cloud samples are insufficient.');
            return;
        }

        this.runtime = buildStep3GimiRuntime({
            coordinate,
            sampledPoints: points,
            topWidth: this.topCanvas.width,
            topHeight: this.topCanvas.height,
            frontWidth: this.frontCanvas.width,
            frontHeight: this.frontCanvas.height
        });

        this.topImageData = new ImageData(new Uint8ClampedArray(this.runtime.top.image), this.runtime.top.width, this.runtime.top.height);
        this.frontImageData = new ImageData(new Uint8ClampedArray(this.runtime.front.image), this.runtime.front.width, this.runtime.front.height);

        const coordinateTag = formatCoordinateTag(coordinate, this.runtime.coordinatePresetId);
        this.coordEl.textContent = `Coordinate: ${coordinateTag}`;
        this.topTitleEl.textContent = 'Top / Plan';
        this.frontTitleEl.textContent = 'Front';
        this.setStatus(`Runtime preset: ${this.runtime.coordinatePresetId}`);
        this.renderFrame();
    }

    private hide() {
        this.root.classList.add('hidden');
    }

    private setStatus(text: string) {
        this.statusEl.textContent = text;
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
        const topCtx = this.topCanvas.getContext('2d');
        const frontCtx = this.frontCanvas.getContext('2d');
        if (topCtx) topCtx.clearRect(0, 0, this.topCanvas.width, this.topCanvas.height);
        if (frontCtx) frontCtx.clearRect(0, 0, this.frontCanvas.width, this.frontCanvas.height);
    }

    private async fetchCoordinate(modelFilename: string): Promise<Step3GimiCoordinateInput> {
        try {
            const response = await fetch(`/api/model/coordinate?modelFilename=${encodeURIComponent(modelFilename)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json() as CoordinateResponse;
            return {
                axisPresetId: String(data?.coordinate?.axisPresetId || '').trim().toLowerCase() || undefined,
                coordinateSystem: String(data?.coordinate?.coordinateSystem || '').trim() || undefined,
                upAxis: String(data?.coordinate?.upAxis || '').trim() || undefined,
                upDirection: String(data?.coordinate?.upDirection || '').trim() || undefined
            };
        } catch {
            return {
                axisPresetId: STEP3_GIMI_DEFAULT_PRESET
            };
        }
    }

    private extractScenePoints() {
        const points: Step3GimiSamplePoint[] = [];
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

    private getCameraPoseModelLocal(): Step3GimiCameraPose | null {
        const camera = this.scene?.camera;
        const eye = camera?.position;
        const forward = camera?.forward;
        if (!eye || !forward) return null;

        const worldEye = new Vec3(eye.x, eye.y, eye.z);
        const worldForward = new Vec3(forward.x, forward.y, forward.z);
        if (worldForward.lengthSq() < 1e-8) return null;
        worldForward.normalize();

        const worldTip = worldEye.clone().add(worldForward);
        const modelEye = worldEye.clone();
        const modelTip = worldTip.clone();

        const rootWorld = this.scene?.contentRoot?.getWorldTransform?.();
        if (rootWorld) {
            const invRoot = new Mat4();
            invRoot.invert(rootWorld);
            invRoot.transformPoint(worldEye, modelEye);
            invRoot.transformPoint(worldTip, modelTip);
        }

        const modelForward = modelTip.sub(modelEye.clone());
        if (modelForward.lengthSq() < 1e-8) return null;
        modelForward.normalize();

        return {
            eye: { x: modelEye.x, y: modelEye.y, z: modelEye.z },
            forward: { x: modelForward.x, y: modelForward.y, z: modelForward.z }
        };
    }

    private drawOverlay(view: 'top' | 'front', canvas: HTMLCanvasElement) {
        if (!this.runtime) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pose = this.getCameraPoseModelLocal();
        const overlay = projectStep3GimiCamera({
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
        if (!this.runtime || !this.topImageData || !this.frontImageData) return;

        const topCtx = this.topCanvas.getContext('2d');
        const frontCtx = this.frontCanvas.getContext('2d');
        if (!topCtx || !frontCtx) return;

        topCtx.putImageData(this.topImageData, 0, 0);
        frontCtx.putImageData(this.frontImageData, 0, 0);
        this.drawOverlay('top', this.topCanvas);
        this.drawOverlay('front', this.frontCanvas);
    }
}

const mountStep3GimiDualViewPanel = (events: Events, scene: Scene, getCurrentModelFilename: () => string | null) => {
    return new Step3GimiDualViewPanel(events, scene, getCurrentModelFilename);
};

export {
    mountStep3GimiDualViewPanel
};
