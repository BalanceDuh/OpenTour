import { chromium } from 'playwright';

const MODEL_PATH = process.env.OPENTOUR_MODEL_PATH || '/Users/duheng/Development/OpenCode/OpenTour/Resource/3dgs_compressed.ply';
const URL = process.env.OPENTOUR_APP_URL || 'http://127.0.0.1:3001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.click('#opentour-load-toggle');
    await page.waitForSelector('#otw-panel:not(.hidden)', { timeout: 5000 });

    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('[data-act="load"]');
    const chooser = await chooserPromise;
    await chooser.setFiles(MODEL_PATH);

    // Wait for parsing/probing and load completion
    await page.waitForFunction(() => {
        const btn = document.querySelector('[data-act="open-step2"]');
        return !!btn && !(btn).hasAttribute('disabled');
    }, { timeout: 30000 });

    await page.click('[data-act="open-step2"]');
    await page.waitForSelector('#otw-modal.visible', { timeout: 10000 });
    await page.click('[data-combo-id="combo-1"]');

    const hasAutoBtn = await page.locator('[data-modal="auto"]').count();
    const hasRefreshBtn = await page.locator('[data-modal="refresh"]').count();
    const zoomBtnCount = await page.locator('.otw-zoom-btn').count();
    console.log(JSON.stringify({ hasAutoBtn, hasRefreshBtn, zoomBtnCount }, null, 2));

    await page.click('.otw-combo-refresh');
    await sleep(2000);

    await page.click('[data-debug="toggle"]');
    await page.click('[data-modal="gen-top3"]');
    await sleep(1000);
    await page.click('[data-modal="confirm-apply"]');
    await sleep(1000);

    const debugText = await page.locator('[data-debug="body"]').innerText();
    console.log('--- DEBUG START ---');
    console.log(debugText);
    console.log('--- DEBUG END ---');

    const hasPoints = /sampledPoints"\s*:\s*[1-9]/.test(debugText) || /parsedPoints"\s*:\s*[1-9]/.test(debugText);
    const hasAccepted = /"accepted"\s*:\s*[1-9]/.test(debugText);
    console.log(JSON.stringify({ hasPoints, hasAccepted }, null, 2));

    await browser.close();
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
