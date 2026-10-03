import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('Mobile product flow: publish, search, favorites, history, two-user live chat, edit and complete', async ({
  page,
  browser,
}) => {
  const suffix = randomUUID().slice(0, 8),
    ownerEmail = `owner-${suffix}@example.com`,
    finderEmail = `finder-${suffix}@example.com`,
    password = 'testpassword123',
    title = `银色钥匙串 ${suffix}`;
  const errors: string[] = [];
  const ownerPushes: string[] = [],
    finderPushes: string[] = [];
  function observePushes(target: Page, messages: string[]) {
    target.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== '/ws') return;
      expect(new URL(socket.url()).host).toBe('127.0.0.1:3001');
      socket.on('framereceived', ({ payload }) => {
        const event = JSON.parse(payload.toString());
        if (event.type === 'message') messages.push(event.message.content);
      });
    });
  }
  observePushes(page, ownerPushes);
  page.on('pageerror', (error) => errors.push(error.message));
  async function register(target: Page, email: string, name: string) {
    await target.goto('/login');
    await target.getByRole('button', { name: '还没有账号？注册' }).click();
    await target.getByRole('textbox', { name: '昵称' }).fill(name);
    await target.getByRole('textbox', { name: '邮箱' }).fill(email);
    await target.getByRole('textbox', { name: '密码' }).fill(password);
    await target.getByRole('button', { name: '注册并登录' }).click();
    await expect(target).toHaveURL(/\/me$/);
    await expect(target.getByRole('heading', { name })).toBeVisible();
  }
  await register(page, ownerEmail, '林同学');
  await page.getByRole('link', { name: '发布', exact: true }).click();
  await page.getByRole('textbox', { name: '物品名称', exact: true }).fill(title);
  await page.getByRole('combobox', { name: '物品类别' }).selectOption('keys');
  await page.getByRole('combobox', { name: '地点', exact: true }).fill('图书馆 · 2楼');
  await page.getByRole('textbox', { name: '发生时间' }).fill('2026-09-27T14:20');
  await page
    .getByRole('textbox', { name: '详细描述' })
    .fill('银色钥匙串，有蓝色挂件，约三把钥匙。');
  await page.getByRole('button', { name: '发布信息', exact: true }).click();
  await expect(page).toHaveURL(/\/my-posts$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('link', { name: '搜物品、地点或关键词' }).click();
  await page.getByRole('textbox', { name: '搜索关键词' }).fill(suffix);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByText('找到 1 条相关信息')).toBeVisible();
  await page.getByRole('heading', { name: title }).click();
  await expect(page.getByRole('heading', { name: '物品信息' })).toBeVisible();
  const postUrl = page.url();
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('button', { name: '已收藏' })).toBeVisible();
  await page.goto('/me/favorites');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.goto('/me/history');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.goto('/nearby');
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  await page.goto('/messages');
  await expect(page.getByText('实时消息已连接')).toBeVisible();
  const finderContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:3001',
    viewport: { width: 390, height: 844 },
  });
  const finder = await finderContext.newPage();
  observePushes(finder, finderPushes);
  finder.on('pageerror', (e) => errors.push(e.message));
  try {
    await register(finder, finderEmail, '陈同学');
    await finder.goto(postUrl);
    await finder.getByRole('button', { name: '联系发布者' }).click();
    await finder.getByRole('textbox', { name: '联系内容' }).fill('你好，我捡到带蓝色挂件的钥匙。');
    await finder.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(finder).toHaveURL(/\/messages\/.+/);
    await expect(finder.getByText('你好，我捡到带蓝色挂件的钥匙。', { exact: true })).toBeVisible();
    await expect(page.getByText('你好，我捡到带蓝色挂件的钥匙。', { exact: true })).toBeVisible();
    await expect.poll(() => ownerPushes.includes('你好，我捡到带蓝色挂件的钥匙。')).toBe(true);
    await page.getByRole('link').filter({ hasText: '陈同学' }).click();
    await page
      .getByRole('textbox', { name: '发送消息', exact: true })
      .fill('谢谢！可以在图书馆服务台核对。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(finder.getByText('谢谢！可以在图书馆服务台核对。', { exact: true })).toBeVisible();
    await expect.poll(() => finderPushes.includes('谢谢！可以在图书馆服务台核对。')).toBe(true);
    await finder.reload();
    await expect(finder.getByText('谢谢！可以在图书馆服务台核对。', { exact: true })).toBeVisible();
    await page.goto('/my-posts');
    await page.getByRole('link', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '物品名称' })).toHaveValue(title);
    await page
      .getByRole('textbox', { name: '详细描述' })
      .fill('银色钥匙串，有蓝色挂件，已约定到服务台核对。');
    await page.getByRole('button', { name: '保存并发布' }).click();
    await page.getByRole('button', { name: '标记找回' }).click();
    await page.getByRole('button', { name: '确认完成', exact: true }).click();
    await page.getByRole('button', { name: /已完成/ }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.goto('/me/recovered');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await finder.goto(postUrl);
    await expect(finder.getByRole('button', { name: '信息已完成' })).toBeDisabled();
    await page.goto('/settings');
    await page.getByRole('button', { name: '退出登录' }).click();
    await page.goto('/publish');
    await expect(page.getByRole('link', { name: '登录 / 注册' })).toBeVisible();
  } finally {
    await finderContext.close();
  }
  expect(errors).toEqual([]);
});

test('Drafts and photo upload survive reload; validation and mobile layout', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const register = await page.request.post('/api/users/register', {
    data: { email: `draft-${suffix}@example.com`, password: 'testpassword123', name: '草稿同学' },
  });
  expect(register.status()).toBe(201);
  await page.goto('/publish');
  await page.getByRole('button', { name: '发布信息', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '请填写' })).toBeVisible();
  await page.getByRole('textbox', { name: '物品名称' }).fill('待完成的耳机招领');
  await page.getByRole('button', { name: '招领  我捡到东西' }).click();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('添加照片', { exact: true })
    .setInputFiles({ name: 'earbuds.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: '上传的物品照片' })).toBeVisible();
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page).toHaveURL(/\/my-posts/);
  await page.getByRole('button', { name: /草稿/ }).click();
  await expect(page.getByRole('heading', { name: '待完成的耳机招领' })).toBeVisible();
  await page.getByRole('link', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('img', { name: '上传的物品照片' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '物品名称' })).toHaveValue('待完成的耳机招领');
  await page.reload();
  await expect(page.getByRole('img', { name: '上传的物品照片' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('Prototype pages render at mobile and desktop widths without horizontal overflow', async ({
  page,
}) => {
  for (const path of ['/', '/search', '/nearby']) {
    await page.goto(path);
    await expect(page.getByRole('status').filter({ hasText: '正在加载' })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveCSS('max-width', '390px');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
