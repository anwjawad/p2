// Production build: web/ -> dist/
//  1. Compile + purge Tailwind and the design system into css/styles.css (minified)
//  2. Copy static files (build-only sources are skipped)
//  3. Fingerprint local CSS/JS references in index.html (?v=<hash>) and version the service worker
//  4. Write security headers for static hosts that read a _headers file
//
//   node scripts/build.mjs             -> dist/
//   node scripts/build.mjs --css-only  -> web/css/styles.css (for the dev server)
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const DIST = path.join(ROOT, 'dist');
const TW = path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js');

function buildCss(outFile, minify) {
  execFileSync(process.execPath, [TW, '-c', path.join(ROOT, 'tailwind.config.js'), '-i', path.join(WEB, 'css', 'app.css'),
    '-o', outFile, ...(minify ? ['--minify'] : [])], { stdio: 'inherit', cwd: ROOT });
}

if (process.argv.includes('--css-only')) {
  buildCss(path.join(WEB, 'css', 'styles.css'), false);
  process.exit(0);
}

fs.rmSync(DIST, { recursive: true, force: true });
const SKIP = new Set(['css/app.css', 'css/tokens.css', 'css/styles.css']);
(function copy(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(WEB, abs).split(path.sep).join('/');
    if (SKIP.has(rel)) continue;
    const dest = path.join(DIST, rel);
    if (entry.isDirectory()) { fs.mkdirSync(dest, { recursive: true }); copy(abs); }
    else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(abs, dest); }
  }
})(WEB);

buildCss(path.join(DIST, 'css', 'styles.css'), true);

// Minify JS. These are classic scripts sharing globals (and inline onclick handlers call
// them by name), so esbuild keeps top-level names and only shortens local identifiers.
for (const file of fs.readdirSync(path.join(DIST, 'js'))) {
  if (!file.endsWith('.js') || file === 'config.js') continue;
  const abs = path.join(DIST, 'js', file);
  const { code } = transformSync(fs.readFileSync(abs, 'utf8'), { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' });
  fs.writeFileSync(abs, code);
}

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, file))).digest('hex').slice(0, 10);
// Lazy-loaded files referenced from JS (loadLocalAsset('js/x.js')) get the same fingerprint.
for (const file of fs.readdirSync(path.join(DIST, 'js'))) {
  const abs = path.join(DIST, 'js', file);
  const src = fs.readFileSync(abs, 'utf8');
  const out = src.replace(/(["'])((?:css|js)\/cath-studio\.(?:css|js))\1/g, (m, q, f) => `${q}${f}?v=${hash(f)}${q}`);
  if (out !== src) fs.writeFileSync(abs, out);
}
let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
// config.js is left unversioned on purpose: it is the one file edited per deployment.
html = html.replace(/(href|src)="((?:css|js)\/[\w.-]+\.(?:css|js))"/g,
  (m, attr, file) => (file === 'js/config.js' ? m : `${attr}="${file}?v=${hash(file)}"`));
fs.writeFileSync(path.join(DIST, 'index.html'), html);

const version = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
const swPath = path.join(DIST, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__BUILD_VERSION__', version));

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');
const headers = [
  '/*',
  `  Content-Security-Policy: ${csp}`,
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '  X-Frame-Options: DENY',
  '',
  '/index.html',
  '  Cache-Control: no-cache',
  '/sw.js',
  '  Cache-Control: no-cache',
  '/js/config.js',
  '  Cache-Control: no-cache',
  '',
].join('\n');
fs.writeFileSync(path.join(DIST, '_headers'), headers);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`dist/ ready: ${(size(DIST) / 1024).toFixed(0)} KB total, styles.css ${(fs.statSync(path.join(DIST, 'css', 'styles.css')).size / 1024).toFixed(1)} KB, version ${version}`);
