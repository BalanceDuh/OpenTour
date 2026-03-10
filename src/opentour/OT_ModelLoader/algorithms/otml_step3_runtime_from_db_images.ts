type Step3ViewRange = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};

type Step3DbRaster = {
    width: number;
    height: number;
    image: Uint8ClampedArray;
    range: Step3ViewRange;
};

type Step3DbRuntime = {
    projectionMode: 'top-x-negz__front-x-y';
    map: Step3DbRaster;
    front: Step3DbRaster;
};

type CalibrationLike = {
    viewRange?: {
        top?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number };
        front?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number };
    } | null;
    verticalMapImage?: string | null;
    frontViewImage?: string | null;
    imageMime?: string | null;
};

const toFinite = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const parseRange = (input: CalibrationLike['viewRange'], key: 'top' | 'front'): Step3ViewRange | null => {
    const source = input?.[key];
    if (!source) return null;
    const xMin = toFinite(source.xMin, NaN);
    const xMax = toFinite(source.xMax, NaN);
    const yMin = toFinite(source.yMin, NaN);
    const yMax = toFinite(source.yMax, NaN);
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return null;
    const nxMin = Math.min(xMin, xMax);
    const nxMax = Math.max(xMin, xMax);
    const nyMin = Math.min(yMin, yMax);
    const nyMax = Math.max(yMin, yMax);
    if (Math.abs(nxMax - nxMin) < 1e-6 || Math.abs(nyMax - nyMin) < 1e-6) return null;
    return { xMin: nxMin, xMax: nxMax, yMin: nyMin, yMax: nyMax };
};

const base64ToBytes = (raw: string) => {
    const clean = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const loadImageData = async (base64: string, mime: string) => {
    const bytes = base64ToBytes(base64);
    const blob = new Blob([bytes], { type: mime || 'image/png' });

    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            throw new Error('Cannot get 2D context for calibration image.');
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return { width: image.width, height: image.height, pixels: image.data };
    }

    const dataUrl = `data:${mime || 'image/png'};base64,${base64.startsWith('data:') ? base64.slice(base64.indexOf(',') + 1) : base64}`;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error('Failed to decode calibration image.'));
        node.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context for calibration image.');
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: image.width, height: image.height, pixels: image.data };
};

const buildStep3RuntimeFromDbCalibration = async (calibration: CalibrationLike): Promise<Step3DbRuntime | null> => {
    const topRange = parseRange(calibration.viewRange, 'top');
    const frontRange = parseRange(calibration.viewRange, 'front');
    if (!topRange || !frontRange) return null;
    if (!calibration.verticalMapImage || !calibration.frontViewImage) return null;

    const mime = String(calibration.imageMime || 'image/png');
    const [mapImage, frontImage] = await Promise.all([
        loadImageData(calibration.verticalMapImage, mime),
        loadImageData(calibration.frontViewImage, mime)
    ]);

    return {
        projectionMode: 'top-x-negz__front-x-y',
        map: {
            width: mapImage.width,
            height: mapImage.height,
            image: new Uint8ClampedArray(mapImage.pixels),
            range: topRange
        },
        front: {
            width: frontImage.width,
            height: frontImage.height,
            image: new Uint8ClampedArray(frontImage.pixels),
            range: frontRange
        }
    };
};

export {
    buildStep3RuntimeFromDbCalibration,
    type CalibrationLike,
    type Step3DbRuntime,
    type Step3ViewRange
};
