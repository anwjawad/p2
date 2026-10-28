# Palliative Rounds

A daily ward-rounds board for the palliative care team. It shows patients by ward, with symptoms and ECOG, labs (values and images), medications, plans, handover notes, past rounds, analytics, AI summaries, and links to Home Visits, Equipment and the Port Cath list.

- **Frontend:** static HTML/CSS/vanilla JS in `web/`, with Tailwind compiled at build time and a token-based design system (light and dark).
- **Backend:** Google Apps Script (`backend/Code.gs`) on a Google Sheet, with Google Drive for images.

## Run locally

Needs Node.js 20+ (tested with 22) and Google Chrome (for the browser tests).

```bash
npm ci
```
```bash
npm run dev
```

Open http://localhost:5173. The dev server runs the **real** `backend/Code.gs` inside a sandbox that imitates Google Sheets and Drive, with fictional patients (`dev/seed.mjs`). It never contacts the production backend. Data persists in `dev/.data/` (delete that folder to reset).

| Command | What it does |
|---|---|
| `APP_ACCESS_CODE=demo npm run dev` | Same, with the sign-in screen enabled |
| `npm test` | Backend tests (real `Code.gs`, 19 tests) |
| `npm run test:e2e` | Browser tests in Chrome (23 tests; `npm run test:e2e:dist` runs them on the minified build; includes axe WCAG 2.2 AA checks and phone layout) |
| `npm run lint` | ESLint for real bugs (undefined names, duplicates) |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Serve `dist/` with the sandbox backend |
| `npm run perf -- http://localhost:5175/ label` | Lighthouse, median of 3, mobile + desktop |

## Deploy

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: Apps Script backend (unchanged host) plus a free static host for the frontend, an access code, and backups.

## Project layout

```
backend/Code.gs          Apps Script backend (paste into the Sheet's Apps Script project)
backend/HVC_Backend.gs   Home-visit script (separate deployment, unchanged)
web/                     Frontend source
  index.html             Shell + dialogs
  js/config.js           Backend URLs (the only file to edit per deployment)
  js/core.js             API transport, access code, toasts, dialogs, modal manager, settings
  js/ui.js               Shell, routing, wards, search, census, bulk actions
  js/patient-renderer.js Ward board cards
  js/main.js             Patient data, saving, labs, symptoms, plans, import, AI, history, integrations
  js/notes.js            Team notes
  css/app.css            Design system source  ·  css/tokens.css (generated colour ramps)
dev/                     Local server + Apps Script sandbox + fictional seed data
tests/                   backend (node:test) and e2e (Playwright) tests
scripts/                 build, dev, Lighthouse, screenshots, token generator
docs/                    Deployment guide, change report, screenshots
```

## Roll back to the previous version

- **Code:** the original project is tagged `baseline-original`.
  - Look at it with `git checkout baseline-original`.
  - Go back to it permanently with `git checkout master`. `master` was never changed; all work is on the `redesign` branch.
  - A full zip of the untouched original is at `Desktop/p1-main-backup-original-2026-10-28.zip`.
- **Backend:** in the Apps Script editor, **Deploy → Manage deployments → Edit → Version**, then choose the previous version number and **Deploy**. The URL does not change.
  - The new backend is compatible with the old frontend as long as `APP_ACCESS_CODE` is not set.
- **Frontend:** in Cloudflare Pages → the project → **Deployments**, choose an earlier deployment → **Rollback**.
