import type { CameraState, CaptureItem, ViewId } from './cinematic-lite-types';
import { animateViewerToStateForCl, buildPresetCameraStateForCl, normalizeCameraStateForCl, readCameraState, readMviewState, sweepViewerForCl, type ViewPresetLike } from './camera-control';

declare const marmoset: any;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const raf = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

const VIEW_PRESETS: Array<ViewPresetLike & { view: ViewId }> = [
    { view: 'front', label: '前视', yawDeltaDeg: 0, pitchDeg: -4, note: '正前方整体视图，优先看马与车的整体关系。' },
    { view: 'right', label: '右视', yawDeltaDeg: 90, pitchDeg: -2, note: '右侧整体视图，适合观察车身侧面与比例。' },
    { view: 'back', label: '后视', yawDeltaDeg: 180, pitchDeg: -2, note: '后方视图，适合观察车厢、底厢与后部结构。' },
    { view: 'left', label: '左视', yawDeltaDeg: -90, pitchDeg: -2, note: '左侧整体视图，适合看马匹姿态与车轮。' },
    { view: 'top', label: '俯视', yawDeltaDeg: 8, pitchDeg: -64, note: '上方俯视，适合看车棚顶面与整体布局。' },
    { view: 'bottom', label: '仰视', yawDeltaDeg: 10, pitchDeg: 24, note: '轻微仰视，适合强调轮、底厢和体积关系。' }
];

export class CinematicLiteViewer {
    private viewer: any = null;

    private baseRotation: [number, number] = [0, 0];

    private baseRadius = 1;

    private baseFov = 40;

    private basePivot: [number, number, number] = [0, 0, 0];

    private bounds = { min: [-1, -1, -1], max: [1, 1, 1] as [number, number, number] };

    private pauseNativePlayback() {
        const animator = this.viewer?.scene?.sceneAnimator;
        try {
            animator?.pause?.(true);
            animator?.setAnimationProgress?.(0, true);
            animator?.resetPlayback?.();
            animator?.pause?.(true);
            if (animator && 'showPlayControls' in animator) animator.showPlayControls = false;
            if (animator && 'playAnimations' in animator) animator.playAnimations = false;
            if (animator && 'drawAnimated' in animator) animator.drawAnimated = false;
            if (animator && 'autoPlayAnims' in animator) animator.autoPlayAnims = false;
        } catch {}
    }

    async load(assetUrl: string) {
        if (typeof marmoset === 'undefined' || !marmoset?.embed) {
            throw new Error('Marmoset viewer script failed to load');
        }
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Marmoset viewer load timeout')), 120000);
            marmoset.noUserInterface = true;
            this.viewer = marmoset.embed(assetUrl, {
                autoStart: false,
                fullFrame: true,
                bare: true,
                width: window.innerWidth,
                height: window.innerHeight
            });
            this.viewer.onLoad = () => {
                window.clearTimeout(timer);
                const view = this.getView();
                if (!view) return reject(new Error('Marmoset view unavailable'));
                const baseState = readMviewState(view);
                this.baseRotation = [...baseState.rotation];
                this.baseRadius = baseState.radius;
                this.baseFov = baseState.fov;
                this.basePivot = [...baseState.pivot];
                this.bounds = this.estimateBounds();
                this.pauseNativePlayback();
                resolve();
            };
            this.viewer.loadScene?.();
        });
        await wait(1200);
        this.pauseNativePlayback();
    }

    private getView() {
        return this.viewer?.scene?.view || null;
    }

    getViewPreset(viewId: ViewId) {
        return VIEW_PRESETS.find((item) => item.view === viewId) || VIEW_PRESETS[0];
    }

    getCanvas(): HTMLCanvasElement | null {
        return this.viewer?.domRoot?.querySelector?.('canvas') || document.querySelector('canvas');
    }

    getModelContext() {
        const center = [
            (this.bounds.min[0] + this.bounds.max[0]) / 2,
            (this.bounds.min[1] + this.bounds.max[1]) / 2,
            (this.bounds.min[2] + this.bounds.max[2]) / 2
        ];
        const span = Math.max(this.bounds.max[0] - this.bounds.min[0], this.bounds.max[1] - this.bounds.min[1], this.bounds.max[2] - this.bounds.min[2]);
        return {
            center,
            bounds: this.bounds,
            recommendedRadius: Math.max(this.baseRadius, span * 1.3),
            baseCamera: this.getCurrentCameraState()
        };
    }

    async settle() {
        this.wake();
        await raf();
        this.wake();
        await raf();
        this.wake();
        await wait(180);
    }

    private wake() {
        this.viewer?.wake?.();
        this.viewer?.reDrawScene?.();
    }

    private async ensureFreshFrame() {
        this.wake();
        await raf();
        this.wake();
        await raf();
        this.wake();
        await wait(120);
    }

    getCurrentCameraState(): CameraState {
        return readCameraState(this.getView());
    }

    async moveToView(viewId: ViewId, durationMs = 1200) {
        const preset = this.getViewPreset(viewId);
        const target = buildPresetCameraStateForCl({
            pivot: [...this.basePivot],
            rotation: [...this.baseRotation],
            radius: this.baseRadius,
            fov: this.baseFov
        }, preset);
        await this.moveToCameraState(target, durationMs);
    }

    async moveToCameraState(target: CameraState, durationMs = 1200) {
        const view = this.getView();
        if (!view) throw new Error('Marmoset view unavailable');
        const resolvedTarget = normalizeCameraStateForCl(target, readMviewState(view));
        await animateViewerToStateForCl(this.viewer, resolvedTarget.mview, { durationMs });
        await this.settle();
    }

    async sweepAround(target: CameraState & { sweepYawDeg?: number; sweepPitchDeg?: number }, durationMs: number, onFrame?: () => void) {
        await sweepViewerForCl(this.viewer, target, durationMs, { onFrame });
    }

    async captureViews(status?: (message: string) => void): Promise<CaptureItem[]> {
        const canvas = this.getCanvas();
        if (!canvas) throw new Error('Viewer canvas not found');
        const captures: CaptureItem[] = [];
        for (const preset of VIEW_PRESETS) {
            status?.(`正在抓取${preset.label}`);
            await this.moveToView(preset.view, 900);
            await this.ensureFreshFrame();
            const dataUrl = await this.captureCanvasPng(canvas, 960);
            captures.push({ view: preset.view, note: preset.note, source: 'auto', imageDataUrl: dataUrl, camera: this.getCurrentCameraState() });
        }
        return captures;
    }

    async captureCurrentView(viewId: ViewId): Promise<CaptureItem> {
        const canvas = this.getCanvas();
        if (!canvas) throw new Error('Viewer canvas not found');
        const preset = this.getViewPreset(viewId);
        await this.ensureFreshFrame();
        const dataUrl = await this.captureCanvasPng(canvas, 960);
        return { view: preset.view, note: preset.note, source: 'manual', imageDataUrl: dataUrl, camera: this.getCurrentCameraState() };
    }

    private estimateBounds() {
        const r = Math.max(this.baseRadius, 1);
        return {
            min: [this.basePivot[0] - r, this.basePivot[1] - r, this.basePivot[2] - r],
            max: [this.basePivot[0] + r, this.basePivot[1] + r, this.basePivot[2] + r]
        } as { min: [number, number, number]; max: [number, number, number] };
    }

    private drawResized(source: CanvasImageSource, width: number, height: number, targetWidth: number) {
        const ratio = Math.min(1, targetWidth / width);
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(width * ratio));
        out.height = Math.max(1, Math.round(height * ratio));
        const ctx = out.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(source, 0, 0, out.width, out.height);
        return out;
    }

    private isLikelyBlack(dataUrl: string) {
        return new Promise<boolean>((resolve) => {
            const image = new Image();
            image.onload = () => {
                const probe = document.createElement('canvas');
                probe.width = 32;
                probe.height = 32;
                const ctx = probe.getContext('2d');
                if (!ctx) return resolve(false);
                ctx.drawImage(image, 0, 0, 32, 32);
                const pixels = ctx.getImageData(0, 0, 32, 32).data;
                let bright = 0;
                for (let i = 0; i < pixels.length; i += 4) bright += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                resolve((bright / (pixels.length / 4)) < 8);
            };
            image.onerror = () => resolve(false);
            image.src = dataUrl;
        });
    }

    private async captureCanvasPng(source: HTMLCanvasElement, targetWidth: number) {
        this.wake();
        await raf();
        const directCanvas = this.drawResized(source, source.width, source.height, targetWidth);
        if (directCanvas) {
            const directUrl = directCanvas.toDataURL('image/png');
            if (!(await this.isLikelyBlack(directUrl))) return directUrl;
        }
        if (!source.captureStream) return directCanvas ? directCanvas.toDataURL('image/png') : source.toDataURL('image/png');
        const stream = source.captureStream(1);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        await raf();
        await raf();
        const videoCanvas = this.drawResized(video, video.videoWidth || source.width, video.videoHeight || source.height, targetWidth);
        stream.getTracks().forEach((track) => track.stop());
        return videoCanvas ? videoCanvas.toDataURL('image/png') : source.toDataURL('image/png');
    }
}
