import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createClientIpResolver } from '../src/server/modules/infrastructure/client-ip.ts';
import { endpoint } from '../src/server/modules/infrastructure/http.ts';
import { createRuntime, setRuntime, closeRuntime } from '../src/server/runtime.ts';

test('Direct and untrusted connections cannot select their IP via forwarding headers', () => {
  const direct = createClientIpResolver();
  assert.equal(direct('192.0.2.1', '198.51.100.2'), '192.0.2.1');
  const proxied = createClientIpResolver('127.0.0.1,::1');
  assert.equal(proxied('192.0.2.1', '198.51.100.2, 127.0.0.1'), '192.0.2.1');
  assert.equal(proxied(undefined, '198.51.100.2'), 'local');
});

test('Trusted proxy chains stop before client-controlled leftmost values', () => {
  const ip = createClientIpResolver('127.0.0.1, 2001:db8::1');
  assert.equal(ip('127.0.0.1', '198.51.100.2'), '198.51.100.2');
  assert.equal(ip('127.0.0.1', '203.0.113.99, 198.51.100.2'), '198.51.100.2');
  assert.equal(ip('127.0.0.1', '203.0.113.99, 198.51.100.2, 2001:db8::1'), '198.51.100.2');
  assert.equal(ip('127.0.0.1', '198.51.100.2, 192.0.2.10'), '192.0.2.10');
});

test('Equivalent IPv4 and IPv6 representations share an identity', () => {
  const ip = createClientIpResolver('::ffff:127.0.0.1, 2001:0DB8:0:0:0:0:0:1');
  assert.equal(ip('::ffff:7f00:1', '::ffff:198.51.100.2'), '198.51.100.2');
  assert.equal(ip('127.0.0.1', '::ffff:c633:6402'), '198.51.100.2');
  assert.equal(ip('2001:db8::1', '2001:0DB8:0:0:0:0:0:2'), '2001:db8::2');
  assert.equal(createClientIpResolver()('::ffff:192.0.2.1', undefined), '192.0.2.1');
});

test('Invalid trust configuration fails early and malformed forwarding headers fall back', () => {
  for (const config of ['*', 'localhost', '127.0.0.0/8', '127.0.0.1,not-an-ip']) {
    assert.throws(() => createClientIpResolver(config), /TRUSTED_PROXIES/);
  }
  const ip = createClientIpResolver('127.0.0.1');
  for (const header of [
    undefined,
    '',
    'unknown',
    '198.51.100.2,',
    '198.51.100.2:1234',
    '198.51.100.2, garbage',
    ['198.51.100.2', '203.0.113.1'],
  ]) {
    assert.equal(ip('127.0.0.1', header), '127.0.0.1');
  }
});

test('HTTP limits isolate clients behind a proxy and ignore spoofed internal IP headers', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'mayoimon-proxy-test-'));
  setRuntime(createRuntime({ dataDir: temp, databasePath: ':memory:' }));
  const ip = createClientIpResolver('127.0.0.1');
  const general = endpoint(() => ({ ok: true }));
  const restricted = endpoint(() => ({ ok: true }), { rate: 2 });
  const server = createServer((req, res) => {
    req.headers['x-mayoimon-client-ip'] = ip(
      req.socket.remoteAddress,
      req.headers['x-forwarded-for'],
    );
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    const handler = req.url === '/restricted' ? restricted : general;
    void handler(new Request('http://localhost' + req.url, { headers }))
      .then((response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end();
      })
      .catch(() => {
        res.writeHead(500).end();
      });
  });
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as { port: number };
    const request = (path: string, client: string, forgedIp = '203.0.113.99') =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        headers: {
          'x-forwarded-for': client,
          'x-mayoimon-client-ip': forgedIp,
        },
      });
    for (let i = 0; i < 300; i++) {
      assert.equal((await request('/general', '198.51.100.1')).status, 200);
    }
    const limited = await request('/general', '198.51.100.1', '203.0.113.100');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await request('/general', '198.51.100.2')).status, 200);
    assert.equal((await request('/general', '::ffff:198.51.100.1')).status, 429);

    assert.equal((await request('/restricted', '198.51.100.3')).status, 200);
    assert.equal((await request('/restricted', '198.51.100.3')).status, 200);
    assert.equal((await request('/restricted', '198.51.100.3')).status, 429);
    assert.equal((await request('/restricted', '198.51.100.4')).status, 200);
    assert.equal((await request('/restricted', '203.0.113.99, 198.51.100.3')).status, 429);
  } finally {
    await new Promise<void>((done, reject) => {
      server.close((error) => (error ? reject(error) : done()));
      server.closeAllConnections();
    });
    closeRuntime();
    const target = resolve(temp);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep));
    assert.ok(target.split(sep).at(-1)!.startsWith('mayoimon-proxy-test-'));
    rmSync(target, { recursive: true, force: true });
  }
});
