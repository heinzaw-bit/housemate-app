import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// Production HTML starts with the signed-out/session-restoration shell. Deferred
// workspaces load after authentication/navigation and are excluded from this metric.
for (const page of ['index', 'money', 'house', 'notifications', 'profile']) {
  const html = await readFile(new URL(`../.next/server/app/${page}.html`, import.meta.url), 'utf8');
  const assets = [...new Set([...html.matchAll(/<script[^>]*src="([^"?]+\.js)/g)]
    .map((match) => match[1]).filter((src) => src.startsWith('/_next/')))];
  let bytes = 0; let gzip = 0;
  for (const src of assets) {
    const file = await readFile(new URL(`../.next/${src.slice('/_next/'.length)}`, import.meta.url));
    bytes += file.length; gzip += gzipSync(file).length;
  }
  console.log(JSON.stringify({ page: page === 'index' ? '/' : `/${page}`, scripts: assets.length, bytes, gzipBytes: gzip }));
}
