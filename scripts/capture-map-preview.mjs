import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MAP_PREVIEW_PORT ?? 3002);
const baseURL = `http://127.0.0.1:${port}`;
const directory = resolve(root, 'docs/screenshots');
const previewRoot = resolve(root, 'data/map-ui-preview');
const dataDir = resolve(previewRoot, randomUUID());
mkdirSync(directory, { recursive: true });
mkdirSync(dataDir, { recursive: true });
// Use an empty database; the temporary login is discarded after capture.
const service = spawn(process.execPath, [resolve(root, 'apps/web/dist-server/server.js')], {
  cwd: resolve(root, 'apps/web'),
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: dataDir,
    FRONTEND_ORIGIN: baseURL,
    COOKIE_SECURE: 'false',
    LOG_LEVEL: 'info',
  },
});
let output = '';
let started = false;
service.stdout.on('data', (data) => {
  output = (output + data).slice(-3000);
  if (output.includes('"event":"server.started"')) started = true;
});
service.stderr.on('data', (data) => {
  output = (output + data).slice(-3000);
});
const stopped = new Promise((resolve) => service.once('exit', resolve));
let browser;
const report = {
  capturedAt: new Date().toISOString(),
  realBaiduSDK: true,
  isolatedPreviewData: true,
  demoPostsCreated: false,
  dialogs: [],
  browserErrors: [],
  screenshots: [],
  liveChecks: {},
};
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (service.exitCode !== null) throw new Error('预览服务未能启动：' + output);
    try {
      const response = await fetch(baseURL + '/api/health', { signal: AbortSignal.timeout(1500) });
      if (response.ok && started) break;
    } catch {
      /* wait for the local service */
    }
    if (Date.now() > deadline) throw new Error('预览服务启动超时：' + output);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('dialog', async (dialog) => {
    report.dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on('pageerror', (error) => {
    report.browserErrors.push(error.message);
  });
  const registration = await context.request.post(baseURL + '/api/users/register', {
    data: {
      email: `map-preview-${randomUUID()}@example.com`,
      password: randomUUID(),
      name: '界面检查账号',
    },
  });
  if (registration.status() !== 201) throw new Error('预览账号创建失败');
  async function waitForMap() {
    await page.waitForFunction(
      () =>
        document.querySelector('script[src*="api.map.baidu.com/api"]') ||
        document.querySelector('.map-state[role="alert"]'),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.map-state[role="alert"]') || !document.querySelector('.map-state'),
      { timeout: 35000 },
    );
    await page.evaluate(() => document.fonts.ready);
  }
  async function capture(name, fullPage = false) {
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (layout.scrollWidth > layout.width) throw new Error(`${name} 存在横向溢出`);
    const emptyMessageVisible = await page.evaluate(() => {
      const message = document.querySelector('.nearby-panel .empty p');
      const navigation = document.querySelector('.bottom-nav');
      return (
        !message ||
        !navigation ||
        message.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top
      );
    });
    if (!emptyMessageVisible) throw new Error(`${name} 的空结果提示被底部导航遮挡`);
    const states = await page.locator('.map-state').allTextContents();
    report.screenshots.push({
      file: name + '.png',
      viewport: page.viewportSize(),
      mapState: states,
      visibleMarkers: await page.locator('.map-post-pin').count(),
      layout,
    });
    await page.screenshot({ path: resolve(directory, name + '.png'), fullPage });
  }
  await page.goto(baseURL + '/nearby');
  await waitForMap();
  await page.getByText('当前范围暂无信息，试试扩大范围或移动地图').waitFor();
  await capture('nearby');
  if (await page.locator('.map-post-pin').count()) throw new Error('空数据库出现地图标记');
  report.liveChecks.emptyNearby = true;
  await page.getByRole('button', { name: '寻物', exact: true }).click();
  await page.getByText('当前范围暂无信息，试试扩大范围或移动地图').waitFor();
  await capture('nearby-lost');
  await page.getByRole('button', { name: '招领', exact: true }).click();
  await page.getByText('当前范围暂无信息，试试扩大范围或移动地图').waitFor();
  await capture('nearby-found');
  await page.getByRole('button', { name: '招领', exact: true }).click();
  await page.getByText('当前范围暂无信息，试试扩大范围或移动地图').waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  await capture('nearby-320');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture('nearby-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL + '/publish');
  await page.getByRole('textbox', { name: '物品名称', exact: true }).waitFor();
  for (const label of ['物品名称', '地点']) {
    if (await page.getByRole('textbox', { name: label, exact: true }).inputValue())
      throw new Error('发布表单不应预填物品信息');
  }
  report.liveChecks.emptyPublishForm = true;
  await page.locator('summary').filter({ hasText: '地图位置' }).click();
  await waitForMap();
  await capture('publish-location', true);
  await page
    .locator('.coordinate-fields')
    .screenshot({ path: resolve(directory, 'publish-location-panel.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  await capture('publish-location-320', true);
  if (!(await page.locator('.map-state').count())) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.baidu-map-canvas').click({ position: { x: 150, y: 100 } });
    await page.waitForFunction(
      () => Number(document.querySelector('[aria-label="地图纬度"]').value) > 0,
    );
    report.liveChecks.mapPick = {
      lat: Number(await page.getByRole('spinbutton', { name: '地图纬度' }).inputValue()),
      lng: Number(await page.getByRole('spinbutton', { name: '地图经度' }).inputValue()),
    };
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 26.0575, longitude: 119.1968 });
    await page.goto(baseURL + '/nearby');
    await waitForMap();
    const located = page.waitForResponse(
      (response) =>
        response.url().includes('/api/posts/nearby?') &&
        new URL(response.url()).searchParams.get('lat') !== '26.0575',
    );
    await page.getByRole('button', { name: '获取当前位置' }).click();
    const response = await located;
    await page.getByText('当前位置周边', { exact: false }).waitFor();
    const parameters = new URL(response.url()).searchParams;
    report.liveChecks.gpsConversion = {
      browserGPSSimulated: true,
      realBaiduConversion: true,
      input: { lat: 26.0575, lng: 119.1968 },
      output: { lat: Number(parameters.get('lat')), lng: Number(parameters.get('lng')) },
    };
  }
  for (const [path, name] of [
    ['/', 'home'],
    ['/publish', 'publish'],
    ['/search', 'search'],
    ['/messages', 'messages'],
    ['/my-posts', 'my-posts'],
  ]) {
    await page.goto(baseURL + path);
    await page.locator('.empty').filter({ hasText: '正在加载' }).waitFor({ state: 'hidden' });
    await capture(name, path === '/publish');
  }
  writeFileSync(
    resolve(directory, 'map-preview-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      directory,
      mapAvailable: report.screenshots[0].mapState.length === 0,
      dialogs: [...new Set(report.dialogs)],
      screenshots: report.screenshots.map((item) => item.file),
    }),
  );
} catch (error) {
  report.failure = error.message;
  writeFileSync(
    resolve(directory, 'map-preview-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  throw error;
} finally {
  await browser?.close();
  service.kill('SIGTERM');
  await stopped;
  const withinPreview = relative(previewRoot, dataDir);
  if (!withinPreview || withinPreview.startsWith('..') || isAbsolute(withinPreview))
    throw new Error('预览数据清理路径超出范围');
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
