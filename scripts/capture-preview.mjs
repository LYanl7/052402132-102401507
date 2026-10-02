import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const email = process.env.PREVIEW_EMAIL;
const password = process.env.PREVIEW_PASSWORD;
if (!email || !password) throw new Error('请设置 PREVIEW_EMAIL 和 PREVIEW_PASSWORD 为已注册账号');
const directory = resolve('docs/screenshots');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/me');
  for (const [path, name] of [
    ['/', 'home'],
    ['/publish', 'publish'],
    ['/me', 'profile'],
    ['/messages', 'messages'],
    ['/nearby', 'nearby'],
    ['/my-posts', 'my-posts'],
  ]) {
    await page.goto('http://localhost:3000' + path);
    await page.locator('.empty').filter({ hasText: '正在加载' }).waitFor({ state: 'hidden' });
    await page.screenshot({
      path: resolve(directory, name + '.png'),
      fullPage: path === '/publish',
    });
  }
  await page.goto('http://localhost:3000/');
  await page.locator('.empty').filter({ hasText: '正在加载' }).waitFor({ state: 'hidden' });
  const firstPost = page.locator('.post-card').first();
  let query = '';
  if (await firstPost.count()) {
    query = await firstPost.locator('h2').innerText();
    await firstPost.click();
    await page.getByRole('heading', { name: '物品信息' }).waitFor();
    await page.screenshot({ path: resolve(directory, 'detail.png') });
  } else {
    console.log('首页暂无信息，跳过详情截图');
  }
  await page.goto('http://localhost:3000/search');
  await page.getByLabel('搜索关键词').fill(query);
  if (query) {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/posts?') &&
          new URL(response.url()).searchParams.get('q') === query,
      ),
      page.getByRole('button', { name: '搜索', exact: true }).click(),
    ]);
  }
  await page.locator('.empty').filter({ hasText: '正在加载' }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: resolve(directory, 'search.png') });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('已生成本机生产页面截图：' + directory);
} finally {
  await browser.close();
}
