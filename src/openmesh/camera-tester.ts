import type { CameraState } from './cinematic-lite-types';
import { animateViewerToState, animateViewerToStateDegrees, applyMviewState, diffMviewStates, formatCameraStateForDebug, readCameraState, wakeViewer } from './camera-control';
import { deleteCameraTesterSnapshot, listCameraTesterSnapshots, resetCameraTesterSnapshots, saveCameraTesterSnapshot, type CameraTesterSnapshot } from './camera-tester-api';

declare const marmoset: any;

const BUILTIN_MODEL = {
    id: 'bronze-chariot',
    label: 'B.1.13119.mview',
    assetUrl: '/workspace-resource/B.1.13119%20%E4%B8%9C%E6%B1%89%E9%93%9C%E8%BD%A6%E9%A9%AC%202/B.1.13119.mview',
    filePath: 'Resource/B.1.13119 东汉铜车马 2/B.1.13119.mview'
};

type LocalModelSelection = { name: string; objectUrl: string; file: File; };

const escapeHtml = (value: string) => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

class CameraTesterApp {
    private viewer: any = null;
    private localModel: LocalModelSelection | null = null;
    private loadedModelId: string | null = null;
    private modelFilename = BUILTIN_MODEL.filePath;
    private snapshots: CameraTesterSnapshot[] = [];
    private selectedSnapshotId: string | null = null;
    private debugLines: string[] = [];

    private readonly statusEl = document.getElementById('camera-tester-status') as HTMLDivElement;
    private readonly modelLabelEl = document.getElementById('camera-tester-model-label') as HTMLSpanElement;
    private readonly currentPre = document.getElementById('camera-tester-current-pre') as HTMLPreElement;
    private readonly selectedPre = document.getElementById('camera-tester-selected-pre') as HTMLPreElement;
    private readonly snapshotsEl = document.getElementById('camera-tester-snapshots') as HTMLDivElement;
    private readonly debugLogEl = document.getElementById('camera-tester-debug-log') as HTMLDivElement;
    private readonly debugRootEl = document.getElementById('camera-tester-debug-root') as HTMLDivElement;
    private readonly modelInput = document.getElementById('camera-tester-model-input') as HTMLInputElement;
    private readonly nameInput = document.getElementById('camera-tester-name') as HTMLInputElement;
    private readonly noteInput = document.getElementById('camera-tester-note') as HTMLTextAreaElement;

    async boot() {
        this.bindEvents();
        this.renderCurrentState();
        this.renderSnapshots();
        this.modelLabelEl.textContent = `当前模型：${this.modelFilename}`;
        (window as any).cameraTesterApp = this;
    }

    private bindEvents() {
        (document.getElementById('camera-tester-load-builtin') as HTMLButtonElement).addEventListener('click', () => { void this.loadBuiltinModel(); });
        (document.getElementById('camera-tester-upload-btn') as HTMLButtonElement).addEventListener('click', () => this.modelInput.click());
        this.modelInput.addEventListener('change', () => {
            const file = this.modelInput.files?.[0] || null;
            if (file) this.setLocalModel(file);
        });
        (document.getElementById('camera-tester-read-current') as HTMLButtonElement).addEventListener('click', () => this.renderCurrentState(true));
        (document.getElementById('camera-tester-refresh') as HTMLButtonElement).addEventListener('click', () => { void this.refreshSnapshots(); });
        (document.getElementById('camera-tester-capture') as HTMLButtonElement).addEventListener('click', () => { void this.captureCurrentState(); });
        (document.getElementById('camera-tester-jump-rad') as HTMLButtonElement).addEventListener('click', () => { void this.jumpToSelectedSnapshot('rad'); });
        (document.getElementById('camera-tester-jump-deg') as HTMLButtonElement).addEventListener('click', () => { void this.jumpToSelectedSnapshot('deg'); });
        (document.getElementById('camera-tester-delete') as HTMLButtonElement).addEventListener('click', () => { void this.deleteSelectedSnapshot(); });
        (document.getElementById('camera-tester-reset') as HTMLButtonElement).addEventListener('click', () => { void this.resetSnapshots(); });
        (document.getElementById('camera-tester-debug-clear') as HTMLButtonElement).addEventListener('click', () => { this.debugLines = []; this.renderDebug(); });
        (document.getElementById('camera-tester-debug-copy') as HTMLButtonElement).addEventListener('click', async () => navigator.clipboard.writeText(this.debugLines.join('\n')));
        (document.getElementById('camera-tester-debug-toggle') as HTMLButtonElement).addEventListener('click', (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            const collapsed = this.debugRootEl.classList.toggle('collapsed');
            button.textContent = collapsed ? '展开' : '隐藏';
        });
    }

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
            if (animator && 'lockPlayback' in animator) animator.lockPlayback = true;
        } catch {}

        try {
            const scene = this.viewer?.scene;
            if (scene?.sky && 'rotationRate' in scene.sky) scene.sky.rotationRate = 0;
            if (scene?.lights && 'rotationRate' in scene.lights) scene.lights.rotationRate = 0;
            if (scene?.lights && 'rotation' in scene.lights && !Number.isFinite(Number(scene.lights.rotation))) scene.lights.rotation = 0;
        } catch {}
    }

    private appendLog(source: string, message: string) {
        const line = `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} [${source}] ${message}`;
        this.debugLines.push(line);
        if (this.debugLines.length > 320) this.debugLines.splice(0, this.debugLines.length - 320);
        this.renderDebug();
    }

    private renderDebug() {
        this.debugLogEl.innerHTML = this.debugLines.map((item) => {
            const split = item.split('] ');
            return `<div class="debug-line"><span class="tag">${escapeHtml(split[0] ? `${split[0]}]` : '')}</span>${escapeHtml(split.slice(1).join('] '))}</div>`;
        }).join('');
        this.debugLogEl.scrollTop = this.debugLogEl.scrollHeight;
    }

    private setStatus(message: string, source = 'workflow') {
        this.statusEl.textContent = message;
        this.appendLog(source, message);
    }

    private activeModelSource() {
        if (this.localModel) return { id: `local:${this.localModel.name}:${this.localModel.file.size}:${this.localModel.file.lastModified}`, label: this.localModel.name, assetUrl: this.localModel.objectUrl, filePath: this.localModel.file.name };
        return BUILTIN_MODEL;
    }

    private ensureViewerLoaded() {
        if (!this.viewer?.scene?.view) throw new Error('请先加载模型');
    }

    private setLocalModel(file: File) {
        if (this.localModel?.objectUrl) URL.revokeObjectURL(this.localModel.objectUrl);
        this.localModel = { name: file.name, objectUrl: URL.createObjectURL(file), file };
        void this.loadSelectedModel();
    }

    private async loadBuiltinModel() {
        this.localModel = null;
        await this.loadSelectedModel();
    }

    private async loadSelectedModel() {
        const selected = this.activeModelSource();
        if (this.loadedModelId === selected.id) return;
        this.setStatus(`正在加载模型：${selected.label}`, 'viewer');
        await this.loadViewer(selected.assetUrl);
        this.loadedModelId = selected.id;
        this.modelFilename = selected.filePath;
        this.modelLabelEl.textContent = `当前模型：${selected.filePath}`;
        this.renderCurrentState();
        await this.refreshSnapshots();
        this.setStatus(`Viewer 已加载：${selected.label}`, 'viewer');
    }

    private async loadViewer(assetUrl: string) {
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
                this.pauseNativePlayback();
                resolve();
            };
            this.viewer.loadScene?.();
        });
        this.pauseNativePlayback();
        wakeViewer(this.viewer);
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        this.pauseNativePlayback();
        wakeViewer(this.viewer);
    }

    private getCurrentCameraState(): CameraState {
        this.ensureViewerLoaded();
        return readCameraState(this.viewer.scene.view);
    }

    private renderCurrentState(log = false) {
        if (!this.viewer?.scene?.view) {
            this.currentPre.textContent = '{}';
            return;
        }
        const current = this.getCurrentCameraState();
        this.currentPre.textContent = JSON.stringify(formatCameraStateForDebug(current), null, 2);
        if (log) this.appendLog('camera-tester', `current ${JSON.stringify(formatCameraStateForDebug(current))}`);
    }

    private selectSnapshot(snapshotId: string | null) {
        this.selectedSnapshotId = snapshotId;
        const snapshot = this.snapshots.find((item) => item.snapshotId === snapshotId) || null;
        this.selectedPre.textContent = snapshot ? JSON.stringify(formatCameraStateForDebug(snapshot.camera), null, 2) : '{}';
        this.renderSnapshots();
    }

    private renderSnapshots() {
        this.snapshotsEl.innerHTML = this.snapshots.map((snapshot) => `
            <div class="snapshot ${snapshot.snapshotId === this.selectedSnapshotId ? 'active' : ''}" data-snapshot-id="${escapeHtml(String(snapshot.snapshotId || ''))}">
                <div class="snapshot-head">
                    <div>
                        <div class="snapshot-name">${escapeHtml(snapshot.name)}</div>
                        <div class="snapshot-meta">${escapeHtml(snapshot.updatedAt || snapshot.createdAt || '')}</div>
                    </div>
                    <button data-select-snapshot="${escapeHtml(String(snapshot.snapshotId || ''))}" class="primary">选中</button>
                </div>
                <div class="snapshot-code">pivot=${escapeHtml(JSON.stringify(snapshot.camera.mview.pivot.map((value) => Number(value.toFixed(3)))))} rotation=${escapeHtml(JSON.stringify(snapshot.camera.mview.rotation.map((value) => Number(value.toFixed(3)))))} radius=${snapshot.camera.mview.radius.toFixed(3)} fov=${snapshot.camera.mview.fov.toFixed(3)}</div>
            </div>
        `).join('');
        this.snapshotsEl.querySelectorAll<HTMLButtonElement>('[data-select-snapshot]').forEach((button) => {
            button.addEventListener('click', () => this.selectSnapshot(button.dataset.selectSnapshot || null));
        });
    }

    private async refreshSnapshots() {
        if (!this.loadedModelId) return;
        const result = await listCameraTesterSnapshots(this.modelFilename);
        this.snapshots = result.snapshots || [];
        if (!this.snapshots.find((item) => item.snapshotId === this.selectedSnapshotId)) this.selectedSnapshotId = this.snapshots[0]?.snapshotId || null;
        this.selectSnapshot(this.selectedSnapshotId);
        this.renderSnapshots();
        this.setStatus(`已刷新 ${this.snapshots.length} 条测试快照`, 'camera-tester');
    }

    private buildSnapshotName() {
        const manual = this.nameInput.value.trim();
        if (manual) return manual;
        return `Snapshot ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    }

    private async captureCurrentState() {
        try {
            const camera = this.getCurrentCameraState();
            const snapshot: CameraTesterSnapshot = {
                name: this.buildSnapshotName(),
                note: this.noteInput.value.trim(),
                source: 'manual',
                camera
            };
            this.appendLog('camera-tester', `capture-request ${JSON.stringify(formatCameraStateForDebug(camera))}`);
            const result = await saveCameraTesterSnapshot({ modelFilename: this.modelFilename, snapshot });
            this.snapshots = result.snapshots || [];
            this.selectSnapshot(result.snapshot?.snapshotId || this.snapshots[0]?.snapshotId || null);
            this.renderCurrentState();
            this.setStatus(`已保存测试快照：${snapshot.name}`, 'camera-tester');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'camera-tester');
        }
    }

    private async deleteSelectedSnapshot() {
        try {
            if (!this.selectedSnapshotId) throw new Error('请先选中一个快照');
            const result = await deleteCameraTesterSnapshot(this.selectedSnapshotId, this.modelFilename);
            this.snapshots = result.snapshots || [];
            this.selectSnapshot(this.snapshots[0]?.snapshotId || null);
            this.setStatus('已删除选中的测试快照', 'camera-tester');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'camera-tester');
        }
    }

    private async resetSnapshots() {
        try {
            const result = await resetCameraTesterSnapshots(this.modelFilename);
            this.snapshots = result.snapshots || [];
            this.selectSnapshot(null);
            this.renderSnapshots();
            this.setStatus(`已清空当前模型测试数据：${result.deleted || 0} 条`, 'camera-tester');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'camera-tester');
        }
    }

    private async jumpToSelectedSnapshot(mode: 'rad' | 'deg') {
        try {
            this.ensureViewerLoaded();
            const snapshot = this.snapshots.find((item) => item.snapshotId === this.selectedSnapshotId);
            if (!snapshot) throw new Error('请先选中一个快照');
            const start = this.getCurrentCameraState();
            const target = snapshot.camera;
            const modeLabel = mode === 'rad' ? 'rad-jump' : 'deg-jump';
            this.appendLog('camera-tester', `${modeLabel}-start ${JSON.stringify(formatCameraStateForDebug(start))}`);
            this.appendLog('camera-tester', `${modeLabel}-target ${JSON.stringify(formatCameraStateForDebug(target))}`);
            const sampleMarks = new Set([0, 25, 50, 75, 100]);
            let lastMark = -1;
            const runner = mode === 'rad' ? animateViewerToState : animateViewerToStateDegrees;
            await runner(this.viewer, target.mview, {
                durationMs: 1400,
                onStep: ({ easedT, state }) => {
                    const mark = Math.round(easedT * 100);
                    if (![...sampleMarks].some((candidate) => Math.abs(candidate - mark) <= 2) || mark === lastMark) return;
                    lastMark = [...sampleMarks].sort((a, b) => Math.abs(a - mark) - Math.abs(b - mark))[0];
                    sampleMarks.delete(lastMark);
                    this.appendLog('camera-tester', `${modeLabel}-step t=${(easedT).toFixed(3)} ${JSON.stringify(formatCameraStateForDebug({ ...readCameraState(this.viewer.scene.view), mview: state }))}`);
                }
            });
            await new Promise((resolve) => window.setTimeout(resolve, 320));
            const end = this.getCurrentCameraState();
            this.appendLog('camera-tester', `${modeLabel}-final ${JSON.stringify(formatCameraStateForDebug(end))}`);
            this.appendLog('camera-tester', `${modeLabel}-diff ${JSON.stringify(diffMviewStates(end.mview, target.mview))}`);
            this.renderCurrentState();
            this.setStatus(`已通过${mode === 'rad' ? '弧度' : '角度归一化'}模式跳转到测试快照：${snapshot.name}`, 'camera-tester');
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error), 'camera-tester');
        }
    }

    getCurrentStateForTest() {
        return this.getCurrentCameraState();
    }

    setStateForTest(state: CameraState) {
        this.ensureViewerLoaded();
        applyMviewState(this.viewer.scene.view, state.mview, true);
        wakeViewer(this.viewer);
        this.renderCurrentState();
    }
}

const app = new CameraTesterApp();
void app.boot();
