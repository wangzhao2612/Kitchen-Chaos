import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const url = 'http://127.0.0.1:5174/';
async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    const html = await response.text();
    return html.includes('Kitchen Chaos') ? 'game' : 'occupied';
  } catch { return 'offline'; }
}

const existing = await probe();
if (existing === 'occupied') throw new Error('5174 端口已被其他服务使用，请先释放该端口。');
if (existing === 'game') {
  console.log(`游戏已经运行：${url}`);
} else {
  const output = openSync(resolve(root, '.kitchen-chaos-preview.log'), 'a');
  const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
    cwd: root, detached: true, windowsHide: true, stdio: ['ignore', output, output],
  });
  closeSync(output);
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.unref();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (await probe() === 'game') { ready = true; break; }
  }
  if (!ready) throw new Error('游戏服务启动失败，请检查 .kitchen-chaos-preview.log。');
  console.log(`游戏已在后台启动（PID ${server.pid}）：${url}`);
  console.log('可以关闭此启动命令；服务会继续运行。重启电脑后请重新执行 npm run play。');
}
