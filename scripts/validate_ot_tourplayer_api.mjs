import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const API_BASE = process.env.OT_TOUR_PLAYER_API_BASE || 'http://localhost:3032/api/ot-tour-player';
const CSV_PATH = process.env.OPENTOUR_TOUR_CSV || '/Users/duheng/Development/OpenCode/OpenTour/Resource/ot-tour-loader-2026-02-25T00-03-41-880Z.csv';
const MODEL_FILENAME = process.env.OPENTOUR_MODEL_FILENAME || '3dgs_compressed.ply';
const REPORT_PATH = process.env.OPENTOUR_TP_API_REPORT || './data/ot_tourplayer_api_validation.json';

const expect = (cond, message) => {
    if (!cond) throw new Error(message);
};

const jsonFetch = async (url, init) => {
    const response = await fetch(url, init);
    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { raw: text };
    }
    return { status: response.status, ok: response.ok, body, raw: text };
};

const csvTaskCount = (csvText) => {
    const lines = String(csvText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return Math.max(0, lines.length - 1);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const captureSseEvents = async (sessionId) => {
    const controller = new AbortController();
    const out = {
        connected: false,
        queueUpdated: false,
        chunks: []
    };

    const readerPromise = (async () => {
        const response = await fetch(`${API_BASE}/events?session_id=${encodeURIComponent(sessionId)}`, {
            signal: controller.signal,
            headers: { Accept: 'text/event-stream' }
        });
        expect(response.ok, `SSE connect failed with HTTP ${response.status}`);
        expect(response.body, 'SSE body missing');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            out.chunks.push(chunk);
            if (chunk.includes('event: connected')) out.connected = true;
            if (chunk.includes('event: queue.updated')) out.queueUpdated = true;
            if (out.connected && out.queueUpdated) break;
        }
    })();

    await wait(150);
    await jsonFetch(`${API_BASE}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            user_command: 'SSE ping check',
            user_name: 'api-test'
        })
    });

    await Promise.race([readerPromise, wait(4000)]);
    controller.abort();
    return out;
};

const run = async () => {
    const csvText = readFileSync(CSV_PATH, 'utf8');
    const expectedTasks = csvTaskCount(csvText);
    const sessionId = `sess_api_${randomUUID().slice(0, 8)}`;

    const report = {
        apiBase: API_BASE,
        csvPath: CSV_PATH,
        sessionId,
        expectedTasks,
        checks: {}
    };

    const health = await jsonFetch(`${API_BASE}/health`);
    expect(health.ok, 'health endpoint failed');
    report.checks.health = health;

    const script = await jsonFetch(`${API_BASE}/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            model_filename: MODEL_FILENAME,
            csv_text: csvText
        })
    });
    expect(script.ok, `script endpoint failed: ${script.raw}`);
    expect(script.body?.total_tasks === expectedTasks, `task count mismatch: expected ${expectedTasks}, got ${script.body?.total_tasks}`);
    report.checks.script = script;

    const queueAfterScript = await jsonFetch(`${API_BASE}/queue?session_id=${encodeURIComponent(sessionId)}`);
    expect(queueAfterScript.ok, 'queue endpoint failed after script load');
    expect(queueAfterScript.body?.snapshot?.scriptQueue?.length === expectedTasks, 'scriptQueue length mismatch right after import');
    report.checks.queueAfterScript = queueAfterScript;

    const sse = await captureSseEvents(sessionId);
    expect(sse.connected, 'SSE did not receive connected event');
    expect(sse.queueUpdated, 'SSE did not receive queue.updated event');
    report.checks.sse = {
        connected: sse.connected,
        queueUpdated: sse.queueUpdated,
        sample: sse.chunks.join('').slice(0, 1200)
    };

    const dispatchLog = [];
    let pendingStatus = undefined;
    let interruptInjected = false;
    let sawInterruptTask = false;

    for (let i = 0; i < expectedTasks + 8; i += 1) {
        const next = await jsonFetch(`${API_BASE}/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, status: pendingStatus })
        });
        expect(next.ok, `next endpoint failed at step ${i + 1}`);

        const task = next.body?.task;
        if (!task) {
            pendingStatus = undefined;
            break;
        }

        dispatchLog.push({
            task_id: task.task_id,
            type: task.type,
            poi_id: task.poi_id,
            interrupt_flag: Boolean(task.interrupt_flag)
        });
        if (task.interrupt_flag) sawInterruptTask = true;
        pendingStatus = 'COMPLETED';

        if (!interruptInjected && dispatchLog.length >= 2) {
            const interrupt = await jsonFetch(`${API_BASE}/interrupt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    user_command: '请先去厨房',
                    user_name: 'api-test'
                })
            });
            expect(interrupt.ok, `interrupt endpoint failed: ${interrupt.raw}`);
            interruptInjected = true;
            report.checks.interruptResponse = interrupt;
        }
    }

    expect(dispatchLog.length >= expectedTasks, `insufficient dispatched tasks: ${dispatchLog.length}`);
    expect(interruptInjected, 'interrupt was not injected');
    expect(sawInterruptTask, 'no interrupt task was dispatched');
    report.checks.dispatchLog = dispatchLog;

    const finalQueue = await jsonFetch(`${API_BASE}/queue?session_id=${encodeURIComponent(sessionId)}`);
    expect(finalQueue.ok, 'queue endpoint failed at final check');
    expect(finalQueue.body?.snapshot?.runningTask === null, 'runningTask should be null at the end');
    expect((finalQueue.body?.snapshot?.scriptQueue?.length || 0) === 0, 'scriptQueue should be empty at the end');
    expect((finalQueue.body?.snapshot?.priorityQueue?.length || 0) === 0, 'priorityQueue should be empty at the end');
    report.checks.finalQueue = finalQueue;

    const badScript = await jsonFetch(`${API_BASE}/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: `${sessionId}_bad` })
    });
    expect(badScript.status === 400, `expected 400 for bad script request, got ${badScript.status}`);

    const badInterrupt = await jsonFetch(`${API_BASE}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });
    expect(badInterrupt.status === 400, `expected 400 for bad interrupt request, got ${badInterrupt.status}`);

    const badNext = await jsonFetch(`${API_BASE}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
    });
    expect(badNext.status === 400, `expected 400 for bad next request, got ${badNext.status}`);

    report.checks.validationErrors = {
        badScript,
        badInterrupt,
        badNext
    };

    report.ok = true;
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
    const message = error?.stack || String(error);
    console.error(message);
    process.exitCode = 1;
});
