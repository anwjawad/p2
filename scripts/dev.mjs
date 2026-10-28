// npm run dev: Tailwind watcher + local server running the real backend in a sandbox.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TW = path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
const opts = { stdio: 'inherit', cwd: ROOT };
const css = spawn(process.execPath, [TW, '-c', 'tailwind.config.js', '-i', 'web/css/app.css', '-o', 'web/css/styles.css', '--watch'], opts);
const srv = spawn(process.execPath, ['dev/server.mjs', ...process.argv.slice(2)], opts);
const stop = () => { css.kill(); srv.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
