import { chromium } from 'playwright';

const APP_URL = process.env.OPENTOUR_APP_URL || 'http://localhost:3001/';
const MODEL_PATH = process.env.OPENTOUR_MODEL_PATH || '/Users/duheng/Development/OpenCode/OpenTour/Resource/3dgs_compressed.ply';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

        const tlButton = page.locator('button[aria-label="Open OT Tour Loader"]');
        const loadToggle = page.locator('#opentour-load-toggle');
        const fileInput = page.locator('#opentour-file-input');
        const tlDisabledBefore = await tlButton.isDisabled();
        if (!tlDisabledBefore) throw new Error('TL button should be disabled before model load');

        await loadToggle.click();
        await fileInput.setInputFiles(MODEL_PATH);
        await page.waitForFunction(() => {
            const el = document.querySelector('#opentour-status');
            const txt = el?.textContent || '';
            return txt.includes('Loaded: 3dgs_compressed.ply');
        }, undefined, { timeout: 240000 });

        const tlDisabledAfter = await tlButton.isDisabled();
        if (tlDisabledAfter) throw new Error('TL button should be enabled after model load');

        await loadToggle.click();
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Open OT Tour Loader"]');
            if (btn instanceof HTMLButtonElement) btn.click();
        });
        await page.waitForSelector('#ot-tour-loader-panel:not(.hidden)', { timeout: 180000 });

        const mapStats = await page.evaluate(() => {
            const panel = document.querySelector('#ot-tour-loader-panel');
            const top = panel?.querySelector('canvas[data-map="top"]');
            const front = panel?.querySelector('canvas[data-map="front"]');
            const sample = (canvas) => {
                if (!(canvas instanceof HTMLCanvasElement)) return { found: false, nonBg: 0, total: 0 };
                const ctx = canvas.getContext('2d');
                if (!ctx) return { found: false, nonBg: 0, total: 0 };
                const { width, height } = canvas;
                const data = ctx.getImageData(0, 0, width, height).data;
                let nonBg = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i + 0];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];
                    if (a > 0 && !(r === 11 && g === 13 && b === 18)) nonBg += 1;
                }
                return { found: true, nonBg, total: width * height };
            };
            return {
                top: sample(top),
                front: sample(front),
                status: (panel?.querySelector('[data-role="status"]')?.textContent || '').trim()
            };
        });

        if (!mapStats.top.found || !mapStats.front.found) {
            throw new Error('Top/Front canvases not found after opening TL');
        }
        if (mapStats.top.nonBg < 100 || mapStats.front.nonBg < 100) {
            throw new Error(`Map not rendered from model points (top=${mapStats.top.nonBg}, front=${mapStats.front.nonBg})`);
        }

        await page.waitForFunction(() => {
            const panel = document.querySelector('#ot-tour-loader-panel');
            const txt = (panel?.querySelector('[data-role="status"]')?.textContent || '').trim();
            return txt.includes('Loaded') || txt.includes('No saved POIs') || txt.includes('Map ready; failed');
        }, undefined, { timeout: 60000 });

        const poiCount = await page.evaluate(() => {
            const select = document.querySelector('#ot-tour-loader-panel [data-role="poi-select"]');
            if (!(select instanceof HTMLSelectElement)) return 0;
            return select.options.length;
        });

        if (poiCount < 1) {
            const canvas = page.locator('#ot-tour-loader-panel canvas[data-map="top"]');
            await canvas.click({ position: { x: 60, y: 60 } });
            await canvas.click({ position: { x: 140, y: 100 } });
        }

        await page.locator('#ot-tour-loader-panel [data-act="run-record"]').click();
        try {
            await page.waitForFunction(() => {
                const panel = document.querySelector('#ot-tour-loader-panel');
                const txt = (panel?.querySelector('[data-role="status"]')?.textContent || '').trim();
                return txt.includes('Recording') || txt.includes('Run and Record complete');
            }, undefined, { timeout: 30000 });
        } catch {
            const diag = await page.evaluate(() => {
                const panel = document.querySelector('#ot-tour-loader-panel');
                const runBtn = panel?.querySelector('[data-act="run-record"]');
                const txt = (panel?.querySelector('[data-role="status"]')?.textContent || '').trim();
                const options = panel?.querySelectorAll('[data-role="poi-select"] option') || [];
                return {
                    status: txt,
                    poiCount: options.length,
                    runDisabled: runBtn instanceof HTMLButtonElement ? runBtn.disabled : true
                };
            });
            throw new Error(`Run-and-record did not start: ${JSON.stringify(diag)}`);
        }
        await page.waitForFunction(() => {
            const panel = document.querySelector('#ot-tour-loader-panel');
            const txt = (panel?.querySelector('[data-role="status"]')?.textContent || '').trim();
            return txt.includes('Run and Record complete');
        }, undefined, { timeout: 300000 });

        await sleep(1200);
        const imageCheck = await page.evaluate(() => {
            const panel = document.querySelector('#ot-tour-loader-panel');
            const options = panel?.querySelectorAll('[data-role="poi-select"] option') || [];
            const imgs = panel?.querySelectorAll('.otl-thumb') || [];
            const details = Array.from(imgs).map((img) => {
                const src = img.getAttribute('src') || '';
                return {
                    alt: img.getAttribute('alt') || '',
                    srcLen: src.length,
                    isDataPng: src.startsWith('data:image/png'),
                    naturalWidth: (img instanceof HTMLImageElement) ? img.naturalWidth : 0
                };
            });
            return {
                poiCount: options.length,
                imgCount: imgs.length,
                details
            };
        });

        const allVisible = imageCheck.details.length > 0
            && imageCheck.details.every((d) => d.isDataPng && d.srcLen > 100 && d.naturalWidth > 0);
        if (!allVisible || imageCheck.poiCount !== imageCheck.imgCount) {
            throw new Error(`Not all POI screenshots are visible: ${JSON.stringify(imageCheck)}`);
        }

        const result = {
            ok: true,
            tlDisabledBefore,
            tlDisabledAfter,
            mapStats,
            imageCheck,
            model: '3dgs_compressed.ply'
        };
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
};

run().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
