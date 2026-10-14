import { recordedTestFile } from './test-records.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Smoke test the built game without development state or injected progress.
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts', { recursive: true });
try {
  const level = Number(process.argv[2] ?? 1);
  const url = process.env.GAME_URL ?? 'http://127.0.0.1:5174/';
  let storageState;
  if (level > 1) {
    // Reuse progress actually earned by the keyboard test; no invented scores.
    storageState = JSON.parse(readFileSync(recordedTestFile('earned-progress.json'),'utf8'));
    storageState.origins.forEach(origin => { origin.origin = new URL(url).origin; });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState });
  const page = await context.newPage();
  const errors = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  await page.goto(url);
  if (await page.locator('#game-debug').count()) throw new Error('Development output leaked into the production game');
  if (level === 1) await page.getByRole('button', { name: '开始开餐 →', exact: true }).click();
  else {
    await page.getByRole('button', { name: '选择关卡', exact: true }).click();
    await page.locator(`.level-card[data-level="${level}"]`).click();
  }
  await page.getByRole('button', { name: '准备好了，开餐！' }).click();
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
  const frames = await page.evaluate(() => new Promise(resolve => {
    const intervals = []; let previous = performance.now();
    function sample(now) { intervals.push(now - previous); previous = now; if (intervals.length < 300) requestAnimationFrame(sample); else resolve(intervals.slice(1)); }
    requestAnimationFrame(sample);
  }));
  await page.keyboard.press('Escape');
  const pausedTime = await page.locator('#timer').textContent();
  await page.waitForTimeout(1100);
  if (await page.locator('#timer').textContent() !== pausedTime) throw new Error('Production pause did not freeze the timer');
  await page.getByRole('button', { name: '继续开餐', exact: true }).click();
  const music = await page.evaluate(async () => {
    const manifest = await (await fetch('/audio/manifest.json')).json(), context = new AudioContext(), tracks = {};
    for (const [id, track] of Object.entries(manifest.tracks)) {
      const samples = {};
      for (const file of [track.file, track.fallback]) {
        const response = await fetch(`/audio/${file}`); if (!response.ok) throw new Error(`Missing audio ${file}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (Math.abs(decoded.duration - track.seconds) > .15) throw new Error(`Bad duration ${file}`);
        const channel = decoded.getChannelData(0);
        if (!channel.some(value => Math.abs(value) > .001)) throw new Error(`Silent audio ${file}`);
        samples[file] = Number(decoded.duration.toFixed(3));
      }
      tracks[id] = samples;
    }
    await context.close(); return tracks;
  });
  const playingSuffix = level === 1 ? '' : `-level${level}`;
  await page.screenshot({ path: `artifacts/production${playingSuffix}-playing.png` });
  await page.keyboard.press('Escape');
  const suffix = level === 1 ? '' : `-level${level}`;
  await page.screenshot({ path: `artifacts/production${suffix}.png` });
  if (errors.length || failedRequests.length) throw new Error(JSON.stringify({ errors, failedRequests }));
  const sorted = [...frames].sort((a,b) => a-b), mean = frames.reduce((a,b) => a+b,0)/frames.length;
  mkdirSync('artifacts', { recursive: true });
  const report = { level, productionDebugAbsent: true, pauseVerified: true, music, frames: { count: frames.length, averageMs: Number(mean.toFixed(2)), averageFPS: Number((1000/mean).toFixed(1)), p95Ms: Number(sorted[Math.floor(sorted.length*.95)].toFixed(2)) }, errors, failedRequests };
  writeFileSync(`artifacts/production${suffix}-check.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
