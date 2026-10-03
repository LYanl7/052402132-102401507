import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createRuntime, setRuntime, closeRuntime } from '../src/server/runtime.ts';
import { invokeRoute } from './route-harness.ts';
import { posts } from '../src/modules/message/schema.ts';

test('Nearby returns BD-09 active posts by distance, filters radius/type and preserves legacy data', async () => {
  const runtime = createRuntime({ databasePath: ':memory:' });
  setRuntime(runtime);
  const call = (method: string, url: string, payload?: unknown, cookie?: string) =>
    invokeRoute({ method, url, payload, headers: cookie ? { cookie } : {} });
  try {
    const registered = await call('POST', '/api/users/register', {
      email: 'nearby@example.com',
      password: 'password123',
      name: '地图测试',
    });
    const cookie = registered.headers['set-cookie'].split(';')[0];
    const input = {
      type: 'lost',
      title: 'near',
      category: 'keys',
      location: '测试位置',
      occurredAt: new Date(Date.now() - 1000).toISOString(),
      description: '附近查询测试',
      lat: 31.23,
      lng: 121.47,
      status: 'active',
    };
    async function create(title: string, overrides: object = {}) {
      const response = await call('POST', '/api/posts', { ...input, title, ...overrides }, cookie);
      assert.equal(response.statusCode, 201);
      return response.json().post;
    }
    const near = await create('near');
    assert.equal(near.coordinateSystem, 'bd09');
    await create('farther', { lat: 31.237, type: 'found' });
    await create('outside', { lat: 31.3 });
    await create('draft', { status: 'draft' });
    await create('unlocated', { lat: null, lng: null });
    const legacy = await create('legacy', { coordinateSystem: 'legacy' });
    const completed = await create('completed');
    await call('POST', `/api/posts/${completed.id}/complete`, undefined, cookie);
    const deleted = await create('deleted');
    await call('DELETE', `/api/posts/${deleted.id}`, undefined, cookie);
    // Historic malformed rows must not acquire a fabricated distance from null longitude.
    const incomplete = await create('incomplete');
    runtime.db.orm.update(posts).set({ lng: null }).where(eq(posts.id, incomplete.id)).run();
    const url = '/api/posts/nearby?lat=31.23&lng=121.47';
    const result = (await call('GET', url + '&radius=1500')).json();
    assert.deepEqual(
      result.items.map((post: { title: string }) => post.title),
      ['near', 'farther'],
    );
    assert.equal(result.items[0].distance, 0);
    assert.ok(result.items[1].distance > 700 && result.items[1].distance < 850);
    assert.equal((await call('GET', url + '&radius=500')).json().total, 1);
    assert.deepEqual(
      (await call('GET', url + '&type=found')).json().items.map((p: { title: string }) => p.title),
      ['farther'],
    );
    assert.equal((await call('GET', '/api/posts/nearby?lat=0&lng=0')).json().total, 0);
    for (const query of [
      'lat=91&lng=0',
      'lat=0&lng=181',
      'lat=no&lng=0',
      'lat=0',
      'lat=0&lng=0&radius=49',
      'lat=0&lng=0&radius=50001',
    ])
      assert.equal((await call('GET', '/api/posts/nearby?' + query)).statusCode, 400);
    assert.equal((await call('GET', `/api/posts/${legacy.id}`)).json().post.lat, input.lat);
    const updated = await call(
      'PUT',
      `/api/posts/${legacy.id}`,
      { ...input, title: 'legacy reselected', coordinateSystem: 'bd09' },
      cookie,
    );
    assert.equal(updated.statusCode, 200);
    assert.equal((await call('GET', url + '&radius=500')).json().total, 2);
  } finally {
    closeRuntime();
  }
});
