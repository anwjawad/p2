// Local development server.
//  - Serves the frontend from web/ (or dist/ with --dist)
//  - Runs the REAL backend/Code.gs through dev/gas-sandbox.mjs at /api/main
//  - Small stand-ins for the external HVC / Equipment / Port Cath scripts
//  - Simulated network latency (LATENCY_MS, default 400) to mimic Apps Script
//
//   npm run dev                      -> http://localhost:5173
//   APP_ACCESS_CODE=1234 npm run dev -> backend requires an access code
//   LEGACY=1 node dev/server.mjs     -> rewrites hardcoded Google URLs (for measuring the original code)
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend, FakeSpreadsheet } from './gas-sandbox.mjs';
import { seedSheets, HVC_SEED, PORTCATH_SEED } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
// STATIC_DIR=<folder> serves another checkout (used to measure the original version).
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : path.join(ROOT, args.has('--dist') ? 'dist' : 'web');
const PORT = Number(process.env.PORT || 5173);
const LATENCY = Number(process.env.LATENCY_MS ?? 400);
const LEGACY = process.env.LEGACY === '1';
const DATA_DIR = path.join(ROOT, 'dev', '.data');
const DB_FILE = path.join(DATA_DIR, 'sheets.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PERSIST = !args.has('--fresh');

fs.mkdirSync(DATA_DIR, { recursive: true });
const initial = PERSIST && fs.existsSync(DB_FILE)
  ? FakeSpreadsheet.fromJSON(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')))
  : new FakeSpreadsheet(seedSheets());
const properties = {};
if (process.env.APP_ACCESS_CODE) properties.APP_ACCESS_CODE = process.env.APP_ACCESS_CODE;
let backend = createBackend({ sheets: initial, properties, uploadDir: UPLOAD_DIR });
const persist = () => { if (PERSIST) fs.writeFileSync(DB_FILE, JSON.stringify(backend.spreadsheet.toJSON())); };

let hvc = [...HVC_SEED];
let portcath = { portcath: [...PORTCATH_SEED], 'portcath-session-config': [], 'portcath-history': [] };

// Test helper: restore the fictional seed data (dev server only, never deployed).
function resetData() {
  backend = createBackend({ sheets: new FakeSpreadsheet(seedSheets()), properties, uploadDir: UPLOAD_DIR });
  hvc = [...HVC_SEED];
  portcath = { portcath: [...PORTCATH_SEED], 'portcath-session-config': [], 'portcath-history': [] };
  persist();
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readBody = req => new Promise(res => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => res(b)); });
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function handleApi(req, res, url) {
  await sleep(LATENCY);
  const name = url.pathname.split('/')[2];
  const raw = req.method === 'POST' ? await readBody(req) : '';

  if (name === 'main') {
    const params = Object.fromEntries(url.searchParams);
    const out = req.method === 'POST' ? backend.post(raw) : backend.get(params);
    persist();
    return send(res, 200, out);
  }
  if (name === 'hvc') {
    if (req.method === 'GET') return send(res, 200, { patients: hvc });
    const p = JSON.parse(raw || '{}');
    if (p.action === 'register' && p.data) hvc.push(p.data);
    return send(res, 200, { status: 'success' });
  }
  if (name === 'pe') return send(res, 200, { status: 'success' });
  if (name === 'portcath') {
    if (req.method === 'GET') {
      return send(res, 200, { status: 'ok', portcath: portcath.portcath, portcathSessionConfig: portcath['portcath-session-config'], portcathHistory: portcath['portcath-history'] });
    }
    const p = JSON.parse(raw || '{}');
    const list = portcath[p.type] || (portcath[p.type] = []);
    if (p.action === 'createRecord') list.push(p.record);
    if (p.action === 'updateRecord') { const i = list.findIndex(r => r.id === p.record.id); if (i > -1) list[i] = p.record; }
    if (p.action === 'deleteRecord') { const i = list.findIndex(r => r.id === p.id); if (i > -1) list.splice(i, 1); }
    return send(res, 200, { status: 'ok' });
  }
  return send(res, 404, { error: 'Unknown API' });
}

const LEGACY_MAP = [
  [/https:\/\/script\.google\.com\/macros\/s\/AKfycbxJ0bG4[^"]+/g, '/api/main'],
  [/https:\/\/script\.google\.com\/macros\/s\/AKfycbzKCvka[^"]+/g, '/api/hvc'],
  [/https:\/\/script\.google\.com\/macros\/s\/AKfycbwjwZcO[^"]+/g, '/api/pe'],
  [/https:\/\/script\.google\.com\/macros\/s\/AKfycbyxuzwe[^"]+/g, '/api/portcath'],
];

const DEV_CONFIG = `window.APP_CONFIG = {
  API_URL: '/api/main',
  HVC_API_URL: '/api/hvc',
  PE_API_URL: '/api/pe',
  PORTCATH_API_URL: '/api/portcath',
  PORTCATH_API_KEY: 'dev-key',
  ENV: 'development'
};\n`;

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel.startsWith('/dev-uploads/')) {
    const f = path.join(UPLOAD_DIR, path.basename(rel));
    return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), 'image/png') : send(res, 404, 'Not found', 'text/plain');
  }
  // Dev builds always talk to the local sandbox, never to production Google URLs.
  if (!LEGACY && rel === '/js/config.js') return send(res, 200, DEV_CONFIG, MIME['.js']);
  const file = path.join(STATIC_DIR, rel);
  if (!file.startsWith(STATIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'Not found', 'text/plain');
  }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (LEGACY && ext === '.js') {
    let s = body.toString('utf8');
    LEGACY_MAP.forEach(([re, to]) => { s = s.replace(re, to); });
    body = s;
  }
  // Compress text like a real static host (Cloudflare/GitHub Pages) so measurements are realistic.
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (/\.(html|js|css|json|svg|webmanifest|txt)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  res.writeHead(200, headers);
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (url.pathname === '/__dev/reset' && req.method === 'POST') { resetData(); return send(res, 200, { ok: true }); }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: String(e) });
  }
}).listen(PORT, () => {
  console.log(`Palliative Rounds dev server: http://localhost:${PORT}  (static: ${path.relative(ROOT, STATIC_DIR)}, latency ${LATENCY}ms${LEGACY ? ', LEGACY rewrite' : ''}${properties.APP_ACCESS_CODE ? ', access code ON' : ''})`);
});
