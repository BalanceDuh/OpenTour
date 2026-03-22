export type HtmlAudioCreateOptions = {
    src: string;
    preload?: 'none' | 'metadata' | 'auto';
    playbackRate?: number;
    volume?: number;
    muted?: boolean;
    crossOrigin?: string | null;
};

export const createHtmlAudio = ({ src, preload = 'auto', playbackRate = 1, volume, muted, crossOrigin }: HtmlAudioCreateOptions) => {
    const audio = new Audio();
    audio.preload = preload;
    audio.playbackRate = playbackRate;
    if (typeof volume === 'number' && Number.isFinite(volume)) audio.volume = Math.max(0, Math.min(1, volume));
    if (typeof muted === 'boolean') audio.muted = muted;
    if (crossOrigin) audio.crossOrigin = crossOrigin;
    audio.src = src;
    return audio;
};

export const waitForHtmlAudioMetadata = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
    if (audio.readyState >= 1) {
        resolve();
        return;
    }
    const finish = () => {
        audio.removeEventListener('loadedmetadata', finish);
        audio.removeEventListener('error', finish);
        resolve();
    };
    audio.addEventListener('loadedmetadata', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
});

export const playHtmlAudio = async (audio: HTMLAudioElement) => {
    await audio.play();
    return audio;
};

export const pauseHtmlAudio = (audio: HTMLAudioElement | null | undefined) => {
    if (!audio) return;
    audio.pause();
};

export const stopHtmlAudio = (audio: HTMLAudioElement | null | undefined, options?: { resetSrc?: boolean; }) => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    if (options?.resetSrc) {
        audio.src = '';
        audio.load();
    }
};
