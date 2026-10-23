import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(projectRoot, 'dist');
const staticFiles = ['index.html', 'tracker.html', 'favicon.svg', 'robots.txt', 'sitemap.xml', '_headers', '_redirects'];
const allowedSourceExtensions = new Set(['.js', '.css', '.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.woff', '.woff2']);
const publishedAssets = new Set([
  'hero-habit-video.mp4',
  'landing-customize.png',
  'landing-dashboard-01.png',
  'landing-dashboard-02.png',
  'landing-dashboard-detail-fixed.png',
  'landing-habits-detail.png',
  'landing-showcase-video.mp4',
  'landing-signin-preview.png',
]);

async function copySourceTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    const sourceRelativePath = relative(projectRoot, from).split(sep).join('/');
    if (entry.isDirectory()) await copySourceTree(from, to);
    else if (entry.isFile()
      && allowedSourceExtensions.has(extname(entry.name).toLowerCase())
      && (!sourceRelativePath.startsWith('src/assets/') || publishedAssets.has(entry.name))) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to);
    }
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const name of staticFiles) await cp(join(projectRoot, name), join(outputRoot, name));
await copySourceTree(join(projectRoot, 'src'), join(outputRoot, 'src'));
console.log(`Cloudflare Pages bundle written to ${relative(projectRoot, outputRoot)}.`);
