# Palliative Rounds v2: redesign report

_28 October 2026 · branch `redesign` · original kept as tag `baseline-original` (and on `master`)_

## 1. What the app is, and what changed

A ward-rounds board for a palliative care team. Clinicians use it at the bedside on phones and at the nursing station on desktops. The core loop is: scan the ward → open a patient → update symptoms, labs, medications and plan → hand over.

**Unchanged:** the Apps Script backend, its API actions, the Google Sheet layout, Drive storage, and every feature. Changes to the backend are small, compatible additions (section 4).

### Design and UX

| Area | Before | After |
|---|---|---|
| Visual system | Tailwind run in the browser, plus about 490 lines of `!important` overrides. Seven "design worlds" and four accent colours, none finished. Dark mode only half-styled | One token system (OKLCH ramps, `web/css/tokens.css`) drives every colour class, so all screens get the same palette and a complete dark mode. Compiled and purged at build time |
| Typography | Figtree + Source Sans + JetBrains Mono, no Arabic face | IBM Plex Sans + **IBM Plex Sans Arabic** (designed as a pair), tabular numbers for rooms and labs, sentence case |
| Ward board | Uniform cards, room hidden in a badge, 8 small round icons | **Bed-tag cards**: large room number, a 5-step **ECOG acuity bar**, lab chips marked high/low, symptom chips, plan lines, labelled actions. Sorted by room |
| Census | "Total: …" was stuck (never updated) | "4 patients · 1 flagged · 2 with ECOG 3–4 · 4 with abnormal labs" per ward or search |
| Navigation | Sidebar with 8 equal buttons | Wards (with counts) · Workspace (Board, Notes, Past rounds, Analytics, Port cath) · Tools. Phones: top bar, **one-tap ward chips**, bottom bar with *New patient* |
| Patient sheet | Header inputs overflowed off-screen on phones; labs and symptoms were two big buttons | Room tag + name + file no. + age. Four tiles with live summaries ("3 out of range", "ECOG 3, 2 active", "2 items", History). Active plan inline. Full-screen on phones |
| Dialogs | 17 modals, each with its own close logic; no Escape, no focus handling | One dialog layer for all: Escape closes, focus moves in and is trapped, then returns, background scroll locks. Phones get bottom sheets |
| Feedback | `alert()` / `confirm()` / `prompt()` (≈60 calls) | Non-blocking toasts; accessible confirm dialogs that name the consequence; **Undo** after move/remove; typed confirmation (`NEW DAY`) for the daily archive |
| States | No loading, empty or error states | Skeletons, empty states with a next action, error state with *Try again*, offline banner, sign-in screen with "session ended" handling, save indicator (Saving… / All changes saved / Not saved — retry) |
| Search | Name/code/diagnosis, case-sensitive for Arabic forms | Also room, doctor and ward; ignores Arabic diacritics and alef/ya/ta-marbuta variants; `/` focuses search, `Esc` clears |
| Settings | Design worlds, accents, light/dark, debug button | Appearance (System/Light/Dark), density, motion, end-of-day archive with an honest description, connection check, sign out |
| Accessibility | Clickable `div` cards, unlabeled icon buttons, 32 px targets, low-contrast greys | Real buttons with names, landmarks, skip link, visible focus, `dir="auto"` on every text field, AA contrast, 40 px touch targets on phones, reduced-motion support. **axe: 0 serious/critical issues** on board and sheet |

## 2. Problems found and fixed

Each fix is covered by an automated test, named in the "Verified by" column.

| # | Priority | Problem | Cause | Fix | Verified by |
|---|---|---|---|---|---|
| 1 | Critical | Live Gemini API key committed in `Code.js.txt` | Hard-coded secret | Removed (and kept out of git history); key read from Script Properties. **Revoke the old key** | Code review |
| 2 | Critical | Anyone with the backend URL could read and change every patient | No authentication | Optional access code (`APP_ACCESS_CODE`), checked on the server for every read and write, constant-time compare. Sign-in screen; code never in URLs | `api.test` (3 tests), `e2e access code` |
| 3 | High | Notes were lost: each save overwrote older notes | Notes were saved but never loaded | Backend returns notes (`get_all`); empty/invalid payload rejected | `api.test` notes, `e2e notes survive` |
| 4 | High | Clearing a field (e.g. diagnosis) never saved | `value \|\| oldValue` | Empty values are saved; only name is required | `e2e clearing a field` |
| 5 | High | New patients were saved without ward/room | First save sent only changed fields | New patients send all fields on first save; no save until a name exists; unnamed drafts discarded | `e2e new patient` (2 tests) |
| 6 | High | Edits lost when opening another patient within 1.5 s | Debounced save ran against the next patient | Pending save is flushed when the sheet closes | `e2e closing the sheet` |
| 7 | High | Symptoms/labs lost if the page closed within 1.5 s of *Save* | Explicit Save was debounced | Saves immediately; leave-page warning while anything is unsaved | `e2e symptoms` |
| 8 | High | "Start new day" said it resets daily fields; it actually empties the board | Wrong copy on a destructive action | Accurate dialog, typed confirmation, success summary | `e2e new day` |
| 9 | Medium | Flag/star did nothing for many patients | Sheets returns numeric ids as numbers; UI compared strings | Ids normalised to strings | `e2e flag` (sandbox reproduces Sheets coercion) |
| 10 | Medium | After history index loaded, the board showed every ward's patients | Re-render used `appData.patients` | All re-renders go through `refreshBoard()` | `e2e board loads` |
| 11 | Medium | Deleted patients reappeared as a "TRASH" ward | Soft delete not filtered | Filtered from board and wards; Undo after removal | `e2e bulk move/remove` |
| 12 | Medium | Pasted medications processed N times after N openings | `addEventListener` on every open | Single handler | Code review |
| 13 | Medium | Past rounds view could write to live patients (star, pharmacy edits) | Only `triggerSave` was blocked | All writes blocked centrally while viewing an archive; banner replaces the body offset hack | `e2e past rounds` |
| 14 | Medium | Patient sheet overflowed horizontally on phones | Fixed widths | Responsive sheet | `e2e phone` (scrollWidth check) |
| 15 | Medium | Duplicate functions; "Quick add standard sections" reset custom wards | Two definitions, the later one destructive | Single non-destructive version | Lint (`no-redeclare`) |
| 16 | Medium | HTML injection via ward names, note titles, symptom notes | Unescaped `innerHTML` | Escaped / `textContent` | Code review |
| 17 | Low | "Corrected calcium" button showed "coming soon" though the calculator existed | Placeholder | Wired to the calculator | Manual |
| 18 | Low | Garbled text (`âš ï¸`) in messages | Double-encoded UTF-8 | Re-decoded | Manual |
| 19 | Low | Lab image links (`uc?export=view`) no longer embed reliably | Google Drive change | Thumbnail endpoint by file id | Manual |
| 20 | Low | Patient names sent to Gemini; server stack traces in API errors | — | Name removed from prompts; stack traces removed from responses | `api.test` |

## 3. Tests

| Suite | Count | Result |
|---|---|---|
| Backend: real `backend/Code.gs` in a Sheets/Drive sandbox (`npm test`) | 19 | **19 passed** |
| Browser: Chrome, sources (`npm run test:e2e`) | 23 | **23 passed** |
| Browser: minified production build (`npm run test:e2e:dist`) | 23 | **23 passed** |
| Lint (`npm run lint`) | — | 0 errors |

The browser tests cover:

- **Main paths:** loading, ward switching, search (including Arabic), edit/clear/save, injection-safe symptom notes, new patient, flag, bulk move + Undo, remove, notes, symptoms → acuity bar, past rounds (read-only), daily archive, appearance, the Port Cath lazy module, and all 9 main dialogs (open, focus, Escape).
- **Failure paths:** offline banner and failed-save reporting.
- **Quality:** axe WCAG 2.2 AA on board and sheet; phone layout (no horizontal overflow, 40 px targets, drawer).
- **Security:** the access code, which never appears in URLs and is required again in a new tab.

**Not tested here:**

- The live Google backend and real data (deliberately: everything ran on fictional data).
- Real iOS Safari and Android devices (Chrome device emulation only).
- Gemini output quality.
- The external HVC / Equipment / Port Cath scripts (simulated).

## 4. Backend changes (all compatible)

- New actions: `get_all` (patients + metadata + notes, used instead of GET so the code is not in a URL) and `verify_access`.
- Optional `APP_ACCESS_CODE`. When it is not set, the API behaves exactly as before.
- `doGet` also returns `notes`. `save_notes` validates its input.
- AI prompts no longer include the patient name. Errors no longer include stack traces.
- Opt-in `installDailyBackup()`: nightly copy of the spreadsheet to Drive, keeping 30.
- No data migration, and no change to sheet columns.

## 5. Performance

Lighthouse lab data, median of 3 runs, same machine. Both versions were served by the same local server with gzip and 400 ms simulated backend latency. These are local lab numbers, not field data from real users.

| Metric | Mobile before | Mobile after | Desktop before | Desktop after |
|---|---|---|---|---|
| Performance score | 54 | **86** | 97 | **100** |
| First Contentful Paint | 5323 ms | **2808 ms** | 974 ms | **482 ms** |
| Largest Contentful Paint | 9692 ms | **2959 ms** | 1104 ms | **497 ms** |
| Total Blocking Time | 334 ms | **0 ms** | 45 ms | **0 ms** |
| Cumulative Layout Shift | 0 | **0.061** | 0.001 | **0.003** |
| Speed Index | 6070 ms | **3484 ms** | 974 ms | **501 ms** |
| Transferred | 1569 KB | **395 KB** | 1569 KB | **395 KB** |
| of which JavaScript | 465 KB | **53 KB** | 465 KB | **53 KB** |
| Requests | 26 | **23** | 26 | **23** |
| Accessibility score | 81 | **99** | 81 | **99** |

Core Web Vitals thresholds ("good"): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms (TBT is the lab proxy). Raw Lighthouse JSON files: `.lighthouse/before-gzip-*.json`, `.lighthouse/after-gzip-*.json` (not committed). Re-run with `npm run perf`.

Where the gains come from:

- Tailwind is compiled at build time instead of a ≈300 KB runtime compiler.
- XLSX (≈900 KB), PapaParse and Chart.js load only when importing or opening Analytics.
- The Port Cath module (≈110 KB) loads only when its view opens.
- JS is minified with esbuild.
- Icon fonts load without blocking rendering.
- The app icon went from 416 KB to 14 KB.
- Static files are cached by a service worker. Patient data is never cached.

## 6. Known limits and open risks

- **Apps Script latency** (≈1–3 s per request) remains. The UI saves in the background and shows status, but first load still waits for the sheet.
- **Shared access code**, not individual accounts. There is no per-user audit trail. Per-user Google sign-in would require "Who has access: Anyone with a Google account" and changes to how the frontend calls the API.
- **Lab images in Drive are "anyone with the link"** (needed for display, unchanged from before). Anyone holding an image link can view it.
- **External scripts** (Home visits, Equipment, Port Cath) are separate deployments not in this repository. They are **not** protected by the new access code, and `PORTCATH_API_KEY` is visible in the frontend.
- **Last write wins** per field when two people edit the same patient at the same moment (as before; the lock prevents corrupted rows).
- **Daily archive empties the board.** The original backend comment says this is intended ("User Requirement"). The UI now says so plainly. Confirm this is the behaviour you want.
- **Legacy dialogs** (import, AI hub, home visit, equipment, discharge plan, labs, plan, note editor) use the new tokens, dialog layer and states, but their inner layouts were not rebuilt by hand.
- **Font Awesome** (≈150 KB font from cdnjs) is still loaded for icons. It is cached by the browser after the first visit.
- **Mobile LCP is 3.0 s** in the throttled lab test, just above the 2.5 s "good" threshold (it was 9.7 s). Most of the remainder is the first data request to the backend. Field numbers will depend on the network and Apps Script; there is no field (real-user) data yet.

## 7. Skills and tools used

- **redesign-existing-projects**: audit-then-improve workflow; kept the existing stack (vanilla JS + Tailwind).
- **frontend-design**: design direction (bed-tag cards, palette and type choices, rejecting templated defaults).
- **Playwright + axe-core**: browser and accessibility tests.
- **Lighthouse**: performance.
- **ESLint**: lint.
- **esbuild**: minification.
- **Claude browser pane**: visual review.
- **Official documentation** (Google Apps Script, Cloudflare, GitHub): hosting decision, see `docs/DEPLOYMENT.md`.
