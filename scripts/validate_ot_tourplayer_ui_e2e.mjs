import { basename } from 'node:path';

import { chromium } from 'playwright';

const APP_URL = process.env.OPENTOUR_APP_URL || 'http://localhost:3001/';
const MODEL_PATH = process.env.OPENTOUR_MODEL_PATH || '/Users/duheng/Development/OpenCode/OpenTour/Resource/3dgs_compressed.ply';
const CSV_PATH = process.env.OPENTOUR_TOUR_CSV || '/Users/duheng/Development/OpenCode/OpenTour/Resource/ot-tour-loader-2026-02-25T00-03-41-880Z.csv';
const CSV_IMPORTED_SCREENSHOT_PATH = process.env.OPENTOUR_TP_E2E_CSV_SCREENSHOT || './data/ot_tourplayer_e2e_csv_imported.png';
const TTS_DEBUG_SCREENSHOT_PATH = process.env.OPENTOUR_TP_E2E_TTS_SCREENSHOT || './data/ot_tourplayer_e2e_tts_debug.png';
const SCREENSHOT_PATH = process.env.OPENTOUR_TP_E2E_SCREENSHOT || './data/ot_tourplayer_e2e_ui.png';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

        const ttsStubbed = await page.evaluate(() => {
            const synth = window.speechSynthesis;
            if (!synth || typeof synth.speak !== 'function') return false;
            const patchedKey = '__ot_tts_stubbed__';
            if ((window)[patchedKey]) return true;
            const originalSpeak = synth.speak.bind(synth);
            synth.speak = (utterance) => {
                try {
                    originalSpeak(utterance);
                } catch {
                    // no-op
                }
                window.setTimeout(() => {
                    if (typeof utterance.onend === 'function') {
                        utterance.onend(new Event('end'));
                    }
                }, 30);
            };
            (window)[patchedKey] = true;
            return true;
        });

        const modelLoaderButton = page.locator('button[aria-label="Open OT Model Loader"]');
        const tourPlayerButton = page.locator('button[aria-label="Open OT Tour Player"]');
        const status = page.locator('#opentour-status');

        if (await tourPlayerButton.isEnabled()) {
            throw new Error('Tour Player button should be disabled before loading model.');
        }

        await modelLoaderButton.dispatchEvent('pointerdown', { button: 0 });
        await page.waitForSelector('#ot-model-loader-panel:not(.hidden)', { timeout: 30000 });

        await page.locator('#ot-model-loader-panel input[type="file"]').first().setInputFiles(MODEL_PATH);

        const modelFilename = basename(MODEL_PATH);
        await page.waitForFunction((name) => {
            const text = document.querySelector('#opentour-status')?.textContent || '';
            return text.includes(`Loaded: ${name}`);
        }, modelFilename, { timeout: 240000 });

        if (!(await tourPlayerButton.isEnabled())) {
            throw new Error('Tour Player button is not enabled after model load.');
        }

        await tourPlayerButton.dispatchEvent('pointerdown', { button: 0 });
        await page.waitForSelector('#ot-tour-player-panel:not(.hidden)', { timeout: 60000 });

        await page.locator('#ot-tour-player-panel [data-role="csv-input"]').setInputFiles(CSV_PATH);
        await page.waitForFunction(() => {
            const sid = document.querySelector('#ot-tour-player-panel [data-role="session-id"]')?.textContent || '';
            return sid.trim() && sid.trim() !== '-';
        }, undefined, { timeout: 120000 });

        const loadedStatus = (await page.locator('#ot-tour-player-panel [data-role="status"]').innerText()).trim();
        if (!loadedStatus.includes('CSV imported')) {
            throw new Error(`CSV import status unexpected: ${loadedStatus}`);
        }

        const scriptQueueText = await page.locator('#ot-tour-player-panel [data-role="script-list"]').innerText();
        if (!scriptQueueText.includes('大厅')) {
            throw new Error(`Expected poi_name in script queue, got: ${scriptQueueText.slice(0, 200)}`);
        }

        await page.screenshot({ path: CSV_IMPORTED_SCREENSHOT_PATH, fullPage: true });

        await page.locator('#ot-tour-player-panel [data-act="play"]').click();
        await page.waitForFunction(() => {
            const text = document.querySelector('#ot-tour-player-panel [data-role="status"]')?.textContent || '';
            return text.includes('Playback started.') || text.includes('Running');
        }, undefined, { timeout: 40000 });

        const userCommand = '先去厨房，再继续主线讲解';
        await page.locator('#ot-tour-player-panel [data-role="danmaku"]').fill(userCommand);
        await page.keyboard.press('Enter');

        await page.waitForFunction((command) => {
            const transcript = document.querySelector('#ot-tour-player-panel [data-role="transcript-list"]');
            return (transcript?.textContent || '').includes(command);
        }, userCommand, { timeout: 40000 });

        await page.waitForFunction(() => {
            const transcript = document.querySelector('#ot-tour-player-panel [data-role="transcript-list"]');
            const text = transcript?.textContent || '';
            return text.includes('找到了「厨房」，现在去「厨房」。');
        }, undefined, { timeout: 60000 });

        await page.waitForFunction(() => {
            const transcript = document.querySelector('#ot-tour-player-panel [data-role="transcript-list"]');
            return (transcript?.textContent || '').includes('[TTS]');
        }, undefined, { timeout: 60000 });

        await page.screenshot({ path: TTS_DEBUG_SCREENSHOT_PATH, fullPage: true });

        let maxPriorityCount = 0;
        for (let i = 0; i < 30; i += 1) {
            const countText = await page.locator('#ot-tour-player-panel [data-role="priority-count"]').innerText();
            const count = Number.parseInt(countText, 10);
            if (Number.isFinite(count)) {
                maxPriorityCount = Math.max(maxPriorityCount, count);
            }
            await sleep(120);
        }

        await page.waitForFunction(() => {
            const text = document.querySelector('#ot-tour-player-panel [data-role="status"]')?.textContent || '';
            return text.includes('Playback finished.');
        }, undefined, { timeout: 300000 });

        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

        const finalState = await page.evaluate(() => {
            const sessionId = (document.querySelector('#ot-tour-player-panel [data-role="session-id"]')?.textContent || '').trim();
            const statusText = (document.querySelector('#ot-tour-player-panel [data-role="status"]')?.textContent || '').trim();
            const scriptCount = (document.querySelector('#ot-tour-player-panel [data-role="script-count"]')?.textContent || '').trim();
            const priorityCount = (document.querySelector('#ot-tour-player-panel [data-role="priority-count"]')?.textContent || '').trim();
            const transcript = (document.querySelector('#ot-tour-player-panel [data-role="transcript-list"]')?.textContent || '').trim();
            return { sessionId, statusText, scriptCount, priorityCount, transcriptLength: transcript.length };
        });

        const result = {
            ok: true,
            appUrl: APP_URL,
            modelPath: MODEL_PATH,
            csvPath: CSV_PATH,
            ttsStubbed,
            csvImportedScreenshotPath: CSV_IMPORTED_SCREENSHOT_PATH,
            ttsDebugScreenshotPath: TTS_DEBUG_SCREENSHOT_PATH,
            screenshotPath: SCREENSHOT_PATH,
            maxPriorityCount,
            finalState
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
