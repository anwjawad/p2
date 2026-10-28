// Repeatable local Lighthouse measurement (lab data, not field data).
//   node scripts/perf.mjs <url> <label> [runs=3]
// Writes .lighthouse/<label>-<formFactor>-<n>.json and prints the median of each metric.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url = 'http://localhost:5173/', label = 'run', runsArg = '3'] = process.argv.slice(2);
const runs = Number(runsArg);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = '.lighthouse';
fs.mkdirSync(outDir, { recursive: true });
const lhBin = path.join('node_modules', 'lighthouse', 'cli', 'index.js');

const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = {};

for (const ff of ['mobile', 'desktop']) {
  const rows = [];
  for (let i = 1; i <= runs; i++) {
    const out = path.join(outDir, `${label}-${ff}-${i}.json`);
    const argv = [lhBin, url, '--only-categories=performance,accessibility,best-practices', '--output=json',
      `--output-path=${out}`, '--quiet', '--chrome-flags=--headless=new --no-sandbox --disable-gpu --window-size=1280,900 --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows'];
    if (ff === 'desktop') argv.push('--preset=desktop');
    // Headless Chrome on Windows intermittently reports NO_FCP; retry a few times.
    let ok = false;
    for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
      try { execFileSync(process.execPath, argv, { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'pipe' }); ok = true; }
      catch { console.warn(`retry ${ff} run ${i} (attempt ${attempt} failed)`); }
    }
    if (!ok) { console.warn(`skipping ${ff} run ${i}`); continue; }
    const r = JSON.parse(fs.readFileSync(out, 'utf8'));
    const a = r.audits;
    const reqs = a['network-requests'].details?.items || [];
    rows.push({
      perf: r.categories.performance.score * 100,
      a11y: r.categories.accessibility.score * 100,
      bp: r.categories['best-practices'].score * 100,
      fcp: a['first-contentful-paint'].numericValue,
      lcp: a['largest-contentful-paint'].numericValue,
      tbt: a['total-blocking-time'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      si: a['speed-index'].numericValue,
      kb: a['total-byte-weight'].numericValue / 1024,
      jsKb: reqs.filter(x => x.resourceType === 'Script').reduce((s, x) => s + x.transferSize, 0) / 1024,
      requests: reqs.length,
    });
  }
  const m = {};
  Object.keys(rows[0]).forEach(k => { m[k] = median(rows.map(r => r[k])); });
  summary[ff] = {
    performance: Math.round(m.perf), accessibility: Math.round(m.a11y), bestPractices: Math.round(m.bp),
    FCP_ms: Math.round(m.fcp), LCP_ms: Math.round(m.lcp), TBT_ms: Math.round(m.tbt), CLS: +m.cls.toFixed(3),
    SpeedIndex_ms: Math.round(m.si), transfer_KB: Math.round(m.kb), script_KB: Math.round(m.jsKb), requests: m.requests,
  };
}
fs.writeFileSync(path.join(outDir, `${label}-summary.json`), JSON.stringify(summary, null, 2));
console.log(label, JSON.stringify(summary, null, 2));
