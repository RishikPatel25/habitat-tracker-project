import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { onRequest } from '../functions/runtime-config.json.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Pages runtime config exposes only configured public Supabase values and blocks service-role keys', async () => {
  const missing = await onRequest({ request: new Request('https://example.test/runtime-config.json'), env: {} });
  assert.deepEqual(await missing.json(), { configured: false });
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

  const publicKey = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
  const configured = await onRequest({
    request: new Request('https://example.test/runtime-config.json'),
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: publicKey, SERVICE_ROLE_KEY: 'must-not-be-read' },
  });
  assert.deepEqual(await configured.json(), { configured: true, supabaseUrl: 'https://project.supabase.co', anonKey: publicKey });

  for (const key of ['sb_secret_example', `x.${btoa('{"role":"service_role"}')}.x`]) {
    const rejected = await onRequest({
      request: new Request('https://example.test/runtime-config.json'),
      env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: key },
    });
    assert.deepEqual(await rejected.json(), { configured: false, reason: 'private-key-rejected' });
  }
});

test('Pages config endpoint rejects writes and handles HEAD without returning a body', async () => {
  const post = await onRequest({ request: new Request('https://example.test/runtime-config.json', { method: 'POST' }), env: {} });
  assert.equal(post.status, 405);
  const head = await onRequest({ request: new Request('https://example.test/runtime-config.json', { method: 'HEAD' }), env: {} });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('public landing SEO is indexable while the dashboard is explicitly non-indexable', async () => {
  const landing = await read('../index.html');
  const dashboard = await read('../tracker.html');
  assert.match(landing, /<title>Habit Tracker — Build a rhythm that feels like yours<\/title>/);
  assert.match(landing, /name="description"/);
  assert.match(landing, /rel="canonical" href="https:\/\/YOUR_PRODUCTION_DOMAIN\/"/);
  assert.match(landing, /property="og:image"/);
  assert.match(landing, /name="twitter:card"/);
  assert.match(landing, /name="robots" content="index,follow"/);
  assert.match(dashboard, /name="robots" content="noindex,nofollow,noarchive"/);

  const sitemap = await read('../sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/YOUR_PRODUCTION_DOMAIN\/<\/loc>/);
  assert.doesNotMatch(sitemap, /\/app|\/dashboard|\/signin|runtime-config/);
  assert.match(await read('../robots.txt'), /Disallow: \/runtime-config\.json/);
});

test('Pages bundle includes only site assets and excludes credentials, repositories, and local artifacts', async () => {
  await access(new URL('../dist/index.html', import.meta.url));
  await access(new URL('../dist/src/main.js', import.meta.url));
  await access(new URL('../dist/src/assets/landing-dashboard-01.png', import.meta.url));
  await access(new URL('../dist/_redirects', import.meta.url));
  await access(new URL('../dist/_headers', import.meta.url));
  await access(new URL('../dist/robots.txt', import.meta.url));
  await access(new URL('../dist/sitemap.xml', import.meta.url));
  for (const asset of ['landing-dashboard-01.png', 'landing-dashboard-02.png', 'landing-habits-detail.png', 'landing-dashboard-detail-fixed.png', 'landing-customize.png', 'landing-signin-preview.png', 'landing-showcase-video.mp4', 'hero-habit-video.mp4']) {
    await access(new URL(`../dist/src/assets/${asset}`, import.meta.url));
  }
  for (const path of [
    '../dist/.env.local',
    '../dist/habitat tracker project',
    '../dist/backups',
    '../dist/node_modules',
    '../dist/node_modules/workerd/bin/workerd',
    '../dist/.git',
    '../dist/.wrangler',
    '../dist/.cache',
    '../dist/server.js',
    '../dist/api/runtime-config.js',
    '../dist/src/assets/generate-ambient.ps1',
    '../dist/src/assets/login-background.mp4',
    '../dist/src/assets/login-ambient.gif',
    '../dist/src/assets/landing-dashboard-full.png',
    '../dist/src/assets/landing-dashboard-detail.png',
  ]) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }
});
