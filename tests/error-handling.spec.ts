import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('Session mutations update the UI even when a subsequent session lookup would fail', async ({
  page,
}) => {
  const email = `session-${randomUUID()}@example.com`;
  const password = 'testpassword123';
  const registered = await page.request.post('/api/users/register', {
    data: { email, password, name: '会话测试' },
  });
  expect(registered.status()).toBe(201);
  await page.request.post('/api/users/logout');
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/users/me')),
    page.goto('/login'),
  ]);
  await page.route('**/api/users/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 503, json: { error: { message: '会话查询暂不可用' } } });
    } else {
      await route.continue();
    }
  });

  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '会话测试', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('昵称').fill('更新后的昵称');
  await page.getByRole('button', { name: '保存个人信息' }).click();
  await expect(page.getByRole('status')).toHaveText('个人信息已更新');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('heading', { name: '更新后的昵称', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: '我的', exact: true }).click();
  await expect(page.getByRole('link', { name: '登录 / 注册' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '更新后的昵称', exact: true })).toHaveCount(0);
});

test('Post statistics distinguish loading, failure and a successful zero count', async ({
  page,
}) => {
  const registered = await page.request.post('/api/users/register', {
    data: {
      email: `stats-${randomUUID()}@example.com`,
      password: 'testpassword123',
      name: '统计测试',
    },
  });
  expect(registered.status()).toBe(201);
  const created = await page.request.post('/api/posts', {
    data: {
      type: 'lost',
      title: '统计测试钥匙',
      category: 'keys',
      location: '图书馆',
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      description: '蓝色挂件',
    },
  });
  expect(created.status()).toBe(201);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route('**/api/interactions/stats', async (route) => {
    if (fail) {
      await pending;
      await route.fulfill({ status: 503, json: { error: { message: '统计请求失败' } } });
    } else {
      await route.continue();
    }
  });
  await page.goto('/my-posts');
  await expect(page.getByText('统计加载中…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '进行中 …', exact: true })).toBeVisible();
  release();
  await expect(page.getByText('统计暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '统计测试钥匙' })).toBeVisible();
  await expect(page.getByRole('button', { name: '进行中 —', exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('button', { name: '进行中 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '已完成 0', exact: true })).toBeVisible();
});
