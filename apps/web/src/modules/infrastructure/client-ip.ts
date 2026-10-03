import { isIP } from 'node:net';

function normalizeIp(value: string): string | undefined {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) return;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  // Dual-stack sockets may expose IPv4 peers as IPv4-mapped IPv6 addresses.
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
  if (!mapped) return address;
  const high = parseInt(mapped[1], 16),
    low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

// Exact proxy IPs only. An empty list keeps direct deployments independent of
// client-supplied forwarding headers; invalid configuration fails at startup.
export function createClientIpResolver(trustedProxies = '') {
  const trusted = new Set(
    trustedProxies
      .split(',')
      .filter((value) => value.trim())
      .map((value) => {
        const address = normalizeIp(value.trim());
        if (!address) throw new Error('TRUSTED_PROXIES must contain comma-separated IP addresses');
        return address;
      }),
  );
  return (remoteAddress: string | undefined, forwardedFor: string | string[] | undefined) => {
    const peer = remoteAddress && normalizeIp(remoteAddress);
    if (!peer) return 'local';
    if (!trusted.has(peer) || typeof forwardedFor !== 'string') return peer;
    const chain = forwardedFor.split(',').map((value) => normalizeIp(value.trim()));
    if (chain.some((address) => !address)) return peer;
    // Walk from our socket through trusted proxies, stopping at the first
    // untrusted hop. A forged leftmost X-Forwarded-For value cannot win.
    let address = peer;
    for (let i = chain.length - 1; i >= 0 && trusted.has(address); i--) {
      address = chain[i]!;
    }
    return address;
  };
}
