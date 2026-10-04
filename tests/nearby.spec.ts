import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockBaiduMap } from './helpers/baidu-map';

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3001' });
  try {
    const response = await context.request.post('/api/users/register', {
      data: {
        email: `map-${randomUUID()}@example.com`,
        password: 'password123',
        name: '地图测试',
      },
    });
    expect(response.status()).toBe(201);
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ page, context }) => {
  await context.addCookies(cookies);
  await mockBaiduMap(page);
});

test('Nearby filters/map links, converted GPS and moving to another area use real post queries', async ({
  page,
  context,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const base = {
    category: 'keys',
    location: '测试校区',
    occurredAt: new Date(Date.now() - 1000).toISOString(),
    description: '空间查询测试',
    status: 'active',
  };
  const created: string[] = [];
  async function post(title: string, type: 'lost' | 'found', lat: number, lng: number) {
    const response = await page.request.post('/api/posts', {
      data: { ...base, title, type, lat, lng },
    });
    expect(response.status()).toBe(201);
    const { post } = await response.json();
    created.push(post.id);
    return post;
  }
  try {
    const near = await post(`附近钥匙 ${suffix}`, 'lost', 26.0575, 119.1968);
    await post(`附近钱包 ${suffix}`, 'found', 26.0585, 119.1968);
    const far = await post(`较远雨伞 ${suffix}`, 'lost', 26.0765, 119.1968);
    await page.goto('/nearby');
    await expect(page.locator('.map-state')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: near.title })).toBeVisible();
    await expect(
      page.locator('.baidu-map-canvas').getByRole('link', { name: near.title }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: far.title })).toHaveCount(0);
    await page.getByRole('combobox', { name: '附近范围' }).selectOption('3000');
    await expect(page.getByRole('heading', { name: far.title })).toBeVisible();
    await page.getByRole('button', { name: '招领', exact: true }).click();
    await expect(page.getByRole('heading', { name: `附近钱包 ${suffix}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: near.title })).toHaveCount(0);
    await expect(page.locator('.map-post-pin.lost')).toHaveCount(0);
    await page.getByRole('button', { name: '招领', exact: true }).click();
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 26.0515, longitude: 119.1908 });
    await page.getByRole('button', { name: '获取当前位置' }).click();
    // Same center does not need a new query; the converted position is shown on the map.
    await expect(page.getByText('当前位置周边', { exact: false })).toBeVisible();
    await expect(page.locator('.map-position-dot')).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { __testConversion: unknown }).__testConversion,
      ),
    ).toEqual({ from: 1, to: 5 });
    await page.evaluate(() => {
      const map = (
        window as unknown as {
          __testMap: { center: { lat: number; lng: number }; emit: (event: string) => void };
        }
      ).__testMap;
      map.center = { lat: 26.0765, lng: 119.1968 };
      map.emit('dragend');
    });
    await page.getByRole('button', { name: '搜索此区域' }).click();
    await page.getByRole('combobox', { name: '附近范围' }).selectOption('500');
    await expect(page.getByRole('heading', { name: far.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: near.title })).toHaveCount(0);
    await page.locator('.baidu-map-canvas').getByRole('link', { name: far.title }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${far.id}$`));
    await expect(page.getByRole('heading', { name: '物品信息' })).toBeVisible();
  } finally {
    for (const id of created) await page.request.delete('/api/posts/' + id);
  }
});

test('Publishing a map position persists it and shows the post on Nearby', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const title = `地图选点 ${suffix}`;
  await page.goto('/publish');
  await page.getByRole('textbox', { name: '物品名称', exact: true }).fill(title);
  await page.getByRole('textbox', { name: '发生时间' }).fill('2026-09-27T14:20');
  await page.getByRole('textbox', { name: '详细描述' }).fill('地图发布测试');
  await page.locator('summary').filter({ hasText: '地图位置' }).click();
  await expect(page.locator('.map-state')).toHaveCount(0);
  await page.locator('.baidu-map-canvas').click({ position: { x: 120, y: 100 } });
  await expect
    .poll(async () => Number(await page.getByRole('spinbutton', { name: '地图纬度' }).inputValue()))
    .toBeCloseTo(26.0585, 6);
  await expect(page.getByRole('textbox', { name: '地点', exact: true })).toHaveValue(
    '测试城市测试学校图书馆',
  );
  await page.getByRole('textbox', { name: '地点所在城市' }).fill('测试城市');
  await page.getByRole('textbox', { name: '搜索地图地点' }).fill('不存在的地点');
  await page.locator('.location-search').getByRole('button', { name: '搜索' }).click();
  await expect(page.locator('.location-picker .form-error')).toContainText('未找到这个地点');
  await page.getByRole('textbox', { name: '搜索地图地点' }).fill('图书馆');
  await page.locator('.location-search').getByRole('button', { name: '搜索' }).click();
  await expect(page.locator('.location-picker .form-error')).toHaveCount(0);
  await page.getByRole('button', { name: '发布信息', exact: true }).click();
  await expect(page).toHaveURL(/\/my-posts$/);
  const response = await page.request.get(`/api/posts?q=${suffix}`);
  const saved = (await response.json()).items[0];
  expect(saved.coordinateSystem).toBe('bd09');
  expect(saved.lat).toBe(26.0585);
  expect(saved.lng).toBe(119.1978);
  await page.goto('/nearby');
  await expect(page.locator('.baidu-map-canvas').getByRole('link', { name: title })).toBeVisible();
  await page.request.delete('/api/posts/' + saved.id);
});

test('Map load errors can retry and denied/failed location preserves the current query', async ({
  page,
}) => {
  await page.unroute('https://api.map.baidu.com/api?*');
  await page.route('https://api.map.baidu.com/api?*', (route) => route.abort());
  await page.goto('/nearby');
  await expect(page.locator('.map-state[role="alert"]')).toContainText('地图加载失败');
  await page.unroute('https://api.map.baidu.com/api?*');
  await mockBaiduMap(page);
  await page.getByRole('button', { name: '重新加载地图' }).click();
  await expect(page.locator('.map-state')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) =>
          failure({ code: 1 }),
      },
    });
  });
  await page.getByRole('button', { name: '获取当前位置' }).click();
  await expect(page.locator('.toast')).toContainText('定位权限未开启');
  await expect(page.getByText('默认浏览位置周边', { exact: false })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __testConversionFailure: boolean }).__testConversionFailure = true;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (position: object) => void) =>
          success({ coords: { latitude: 26, longitude: 119 } }),
      },
    });
  });
  await page.getByRole('button', { name: '获取当前位置' }).click();
  await expect(page.locator('.toast')).toContainText('定位转换失败');
  await expect(page.getByText('默认浏览位置周边', { exact: false })).toBeVisible();
});
