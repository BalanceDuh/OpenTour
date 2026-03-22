import type { PlanResult, SegmentPlan } from './cinematic-lite-types';
import { normalizeCameraStateForCl } from './camera-control';
import { CinematicLiteViewer } from './cinematic-lite-viewer';
import { createHtmlAudio, pauseHtmlAudio, playHtmlAudio, stopHtmlAudio, waitForHtmlAudioMetadata } from '../shared/audio/html-audio';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type PlayerState = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';

export class CinematicLitePlayer {
    private readonly viewer: CinematicLiteViewer;

    private readonly onStatus: (message: string) => void;

    private readonly onSegment: (segment: SegmentPlan | null) => void;

    private readonly onState?: (state: PlayerState) => void;

    private readonly onTime?: (seconds: number) => void;

    private readonly onQueueChange?: (snapshot: { mainQueue: SegmentPlan[]; priorityQueue: SegmentPlan[]; current: SegmentPlan | null; }) => void;

    private readonly resolveAudioUrl?: (segment: SegmentPlan) => Promise<string | null>;

    private playbackRate = 1;

    private normalizeSegment(segment: SegmentPlan): SegmentPlan {
        return {
            ...segment,
            camera: {
                ...normalizeCameraStateForCl(segment.camera),
                sweepYawDeg: Number(segment.camera?.sweepYawDeg || 0),
                sweepPitchDeg: Number(segment.camera?.sweepPitchDeg || 0)
            }
        };
    }

    private paused = false;

    private stopped = true;

    private loopRunning = false;

    private currentAudio: HTMLAudioElement | null = null;

    private mainQueue: SegmentPlan[] = [];

    private priorityQueue: SegmentPlan[] = [];

    private replaySegment: SegmentPlan | null = null;

    private currentSegment: SegmentPlan | null = null;

    private currentSource: 'main' | 'priority' | null = null;

    private interruptToken = 0;

    private elapsedMs = 0;

    private timerId = 0;

    private timerStartedAt = 0;

    constructor(viewer: CinematicLiteViewer, onStatus: (message: string) => void, onSegment: (segment: SegmentPlan | null) => void, hooks?: {
        onState?: (state: PlayerState) => void;
        onTime?: (seconds: number) => void;
        onQueueChange?: (snapshot: { mainQueue: SegmentPlan[]; priorityQueue: SegmentPlan[]; current: SegmentPlan | null; }) => void;
        resolveAudioUrl?: (segment: SegmentPlan) => Promise<string | null>;
    }) {
        this.viewer = viewer;
        this.onStatus = onStatus;
        this.onSegment = onSegment;
        this.onState = hooks?.onState;
        this.onTime = hooks?.onTime;
        this.onQueueChange = hooks?.onQueueChange;
        this.resolveAudioUrl = hooks?.resolveAudioUrl;
    }

    setPlaybackRate(rate: number) {
        this.playbackRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
        if (this.currentAudio) this.currentAudio.playbackRate = this.playbackRate;
    }

    setMainQueue(segments: SegmentPlan[]) {
        this.mainQueue = Array.isArray(segments) ? segments.map((segment) => this.normalizeSegment(segment)) : [];
        this.replaySegment = null;
        this.notifyQueueChange();
    }

    getCurrentSegment() {
        return this.currentSegment;
    }

    getQueueSnapshot() {
        return {
            mainQueue: this.mainQueue.slice(),
            priorityQueue: this.priorityQueue.slice(),
            current: this.currentSegment
        };
    }

    enqueuePriority(segments: SegmentPlan[]) {
        const list = Array.isArray(segments) ? segments.map((segment) => this.normalizeSegment(segment)) : [];
        if (list.length < 1) return;
        this.priorityQueue.push(...list);
        if (this.currentSource === 'main' && this.currentSegment) {
            this.replaySegment = this.normalizeSegment(this.currentSegment);
            this.interruptCurrentPlayback();
        }
        this.notifyQueueChange();
        if (!this.loopRunning && !this.stopped) void this.playLoop();
    }

    async play(result?: PlanResult) {
        if (result?.plan?.segments) this.setMainQueue(result.plan.segments);
        if (this.loopRunning && this.paused) {
            this.resume();
            return;
        }
        this.stopped = false;
        this.paused = false;
        this.setState('playing');
        if (!this.loopRunning) {
            this.elapsedMs = 0;
            this.onTime?.(0);
            await this.playLoop();
        }
    }

    stop(options?: { silent?: boolean; }) {
        this.stopped = true;
        this.paused = false;
        this.interruptCurrentPlayback();
        this.stopTimer();
        this.elapsedMs = 0;
        this.onTime?.(0);
        this.currentSegment = null;
        this.currentSource = null;
        this.onSegment(null);
        if (!options?.silent) this.onStatus('播放已停止');
        this.setState('stopped');
        this.notifyQueueChange();
    }

    pause() {
        if (this.paused) return;
        this.paused = true;
        if (this.currentAudio && !this.currentAudio.paused) this.currentAudio.pause();
        this.commitElapsed();
        this.stopTimer();
        this.setState('paused');
        this.onStatus('播放已暂停');
    }

    interruptForVoice() {
        if (this.currentSource === 'main' && this.currentSegment) {
            this.replaySegment = this.normalizeSegment(this.currentSegment);
        }
        this.paused = true;
        this.interruptCurrentPlayback();
        this.currentSegment = null;
        this.currentSource = null;
        this.onSegment(null);
        this.notifyQueueChange();
        this.setState('paused');
        this.onStatus('语音输入打断当前播放');
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        if (this.currentAudio?.paused) {
            void playHtmlAudio(this.currentAudio).catch((error) => {
                this.onStatus(`TTS 播放恢复失败：${error instanceof Error ? error.message : String(error)}`);
            });
        }
        this.startTimer();
        this.setState('playing');
        this.onStatus('播放继续');
    }

    private setState(state: PlayerState) {
        this.onState?.(state);
    }

    private notifyQueueChange() {
        this.onQueueChange?.(this.getQueueSnapshot());
    }

    private stopTimer() {
        if (this.timerId) window.clearInterval(this.timerId);
        this.timerId = 0;
        this.timerStartedAt = 0;
    }

    private startTimer() {
        this.stopTimer();
        this.timerStartedAt = performance.now();
        this.timerId = window.setInterval(() => {
            if (this.paused || this.stopped) return;
            const seconds = this.elapsedMs / 1000 + Math.max(0, performance.now() - this.timerStartedAt) / 1000;
            this.onTime?.(seconds);
        }, 200);
    }

    private commitElapsed() {
        if (this.timerStartedAt) {
            this.elapsedMs += Math.max(0, performance.now() - this.timerStartedAt);
            this.timerStartedAt = 0;
        }
        this.onTime?.(this.elapsedMs / 1000);
    }

    private interruptCurrentPlayback() {
        this.interruptToken += 1;
        stopHtmlAudio(this.currentAudio);
        this.currentAudio = null;
    }

    private estimateSpeechMs(text: string) {
        const count = (String(text || '').match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;
        const punctuation = (String(text || '').match(/[，。；：！？,.!?]/g) || []).length;
        return Math.max(1600, (count * 210) + (punctuation * 150));
    }

    private async waitWhilePaused(token: number) {
        while (this.paused && !this.stopped && token === this.interruptToken) {
            await wait(80);
        }
    }

    private nextSegment() {
        if (this.priorityQueue.length > 0) {
            this.currentSource = 'priority';
            return this.priorityQueue.shift() || null;
        }
        if (this.replaySegment) {
            this.currentSource = 'main';
            const segment = this.replaySegment;
            this.replaySegment = null;
            return segment;
        }
        if (this.mainQueue.length > 0) {
            this.currentSource = 'main';
            return this.mainQueue.shift() || null;
        }
        this.currentSource = null;
        return null;
    }

    private async playLoop() {
        this.loopRunning = true;
        this.startTimer();
        try {
            while (!this.stopped) {
                if (this.paused) {
                    await this.waitWhilePaused(this.interruptToken);
                    if (this.stopped) break;
                }
                const segment = this.nextSegment();
                this.notifyQueueChange();
                if (!segment) break;
                const token = ++this.interruptToken;
                this.currentSegment = segment;
                this.onSegment(segment);
                this.setState('playing');
                this.onStatus(`移动至 ${segment.focusPart}`);
                await this.viewer.moveToCameraState(segment.camera, (segment.moveBeforeSec * 1000) / this.playbackRate);
                if (this.stopped || token !== this.interruptToken) continue;
                await this.waitWhilePaused(token);
                if (this.stopped || token !== this.interruptToken) continue;
                this.onStatus(`正在讲解：${segment.text}`);

                let audioDurationMs = this.estimateSpeechMs(segment.text) / this.playbackRate;
                if (!segment.audioUrl && this.resolveAudioUrl) {
                    try {
                        const resolvedAudioUrl = await this.resolveAudioUrl(segment);
                        if (resolvedAudioUrl) segment.audioUrl = resolvedAudioUrl;
                    } catch (error) {
                        this.onStatus(`TTS 生成失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                if (segment.audioUrl) {
                    const audio = createHtmlAudio({
                        src: segment.audioUrl,
                        preload: 'auto',
                        playbackRate: this.playbackRate
                    });
                    this.currentAudio = audio;
                    await waitForHtmlAudioMetadata(audio);
                    if (Number.isFinite(audio.duration) && audio.duration > 0) {
                        audioDurationMs = (audio.duration * 1000) / this.playbackRate;
                    }
                    try {
                        await playHtmlAudio(audio);
                    } catch (error) {
                        this.onStatus(`TTS 播放失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }

                await this.viewer.sweepAround(segment.camera, audioDurationMs, async () => {
                    if (this.stopped || token !== this.interruptToken) return;
                    if (this.paused) await this.waitWhilePaused(token);
                });

                if (token !== this.interruptToken) continue;
                if (this.currentAudio) {
                    stopHtmlAudio(this.currentAudio);
                    this.currentAudio = null;
                }
                this.currentSegment = null;
                this.onSegment(null);
                this.notifyQueueChange();
            }
        } finally {
            this.commitElapsed();
            this.stopTimer();
            const completed = !this.stopped && this.mainQueue.length < 1 && this.priorityQueue.length < 1 && !this.replaySegment;
            this.loopRunning = false;
            this.currentAudio = null;
            this.currentSegment = null;
            this.currentSource = null;
            this.onSegment(null);
            this.notifyQueueChange();
            if (completed) {
                this.onStatus('整段讲解已播放完毕');
                this.setState('completed');
            }
        }
    }
}
