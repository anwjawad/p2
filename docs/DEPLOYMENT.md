# Free deployment guide

_Last checked against the official documentation on 28 October 2026._

Palliative Rounds has two parts:

| Part | What it is | Where it runs (free) |
|---|---|---|
| Backend + database + file storage | `backend/Code.gs` on Google Apps Script, data in a Google Sheet, lab images in Google Drive | **Google Apps Script web app** (the existing one) |
| Frontend | Static files built into `dist/` | **Cloudflare Pages** (recommended) or GitHub Pages |

No server, database or storage has to move. The backend keeps running where it runs today. Only the static frontend needs a public host, so the whole app is usable from any device through one HTTPS link.

---

## 1. Why this combination

**Backend stays on Apps Script.** It is free with a normal Google account, it never sleeps (no cold-start "wake-up" like free container hosts), and the data stays in the Google Sheet the team already uses. The limits that matter for this app ([Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)) are:

| Limit (consumer Google account) | Value | Relevance |
|---|---|---|
| Script runtime | 6 min per execution | Every request takes seconds |
| Simultaneous executions | 30 per user | Plenty for a ward team; the script also uses a lock |
| URL Fetch calls | 20,000 per day | Only used by AI features |
| Triggers total runtime | 90 min per day | The nightly backup takes seconds |

There is no card requirement and no trial: it is a permanent free service of a Google account. The usual Apps Script response time is about 1–3 s per request. The new UI hides most of it: saves happen in the background, and an indicator shows the save state.

**Frontend on Cloudflare Pages.** On the Free plan:

- [requests to static assets are free and unlimited](https://developers.cloudflare.com/workers/platform/pricing/)
- [500 builds a month and 20,000 files per site](https://developers.cloudflare.com/pages/platform/limits/) (this app has 25 files)
- it works from a **private** repository, or with no repository at all (direct upload)
- it honours the `_headers` file the build writes ([headers docs](https://developers.cloudflare.com/pages/configuration/headers/)), so the security headers (CSP, `nosniff`, `frame-ancestors`) are applied

**Card requirement:** Cloudflare's own documentation describes Free accounts without requiring a payment method ([changelog](https://developers.cloudflare.com/changelog/post/2026-08-04-free-dashboard-button/)). I could not find an official page that states "no card needed" in so many words, so confirm at sign-up. Third-party summaries disagree on this point.

**GitHub Pages: possible, but second choice.** It is free with a 1 GB site size and a 100 GB/month soft bandwidth limit ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). On GitHub Free, however, Pages works only from **public** repositories ([GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)), so the source code would be public. No secrets or patient data are in the repository, but a clinical tool is better kept private. GitHub Pages also ignores `_headers`, so the security headers would not be applied.

**Not recommended:** free container hosts (Render, Railway, Koyeb and similar). The backend is already free and always on, and a free container would add sleeping, wake-up delay and data-persistence problems for no gain.

---

## 2. Protect the data first (required before going public)

The frontend becomes public, and so does the Apps Script URL inside it. **Anyone with that URL could read and change every patient unless an access code is set.** The original app had no protection at all.

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Replace the content of `Code.gs` with `backend/Code.gs` from this project → **Save**.
3. **Project Settings (gear) → Script Properties → Add script property**:
   - `APP_ACCESS_CODE` = a long random code shared only with the team (for example 4–5 random words). Changing it later signs everyone out.
   - `GEMINI_API_KEY` = a **new** key from Google AI Studio. The old key was committed in `Code.js.txt` and must be revoked.
4. **Deploy → Manage deployments → (pencil) Edit → Version: New version → Deploy.**
   Editing the existing deployment keeps the **same URL** ([deployments docs](https://developers.google.com/apps-script/concepts/deployments)), so `web/js/config.js` needs no change.
   - *Execute as:* **Me**. The script reads the sheet with the owner's permission.
   - *Who has access:* **Anyone**. This is required because the browser calls the API anonymously; the access code is what protects the data.
5. Optional but recommended: in the editor choose `installDailyBackup` → **Run** once (authorise when asked). From then on a copy of the whole spreadsheet is made every night at 02:00 into Drive folder `Palliative_Backups`, keeping 30 copies.

Check it worked:

```bash
curl -sL -X POST -H "Content-Type: text/plain" -d "{\"action\":\"verify_access\"}" "<your Apps Script URL>"
```

The answer must be `{"error":"UNAUTHORIZED",...}`. The same request with `"token":"<your code>"` returns `{"status":"success","protected":true}`. In the app, **Settings → Check connection** reports "Access code protection is on".

> The backend is backwards compatible: until `APP_ACCESS_CODE` is set, it behaves exactly like before, so the old frontend keeps working during the switch.

---

## 3. Publish the frontend on Cloudflare Pages

### Option A: one command from this computer (no Git hosting needed)

```bash
npm ci
```
```bash
npm run build
```
```bash
npx wrangler pages deploy dist --project-name=palliative-rounds
```

The first run opens a browser to log in to Cloudflare and creates the project. The site is then live at `https://palliative-rounds.pages.dev` (the name may get a suffix if it is taken). Repeat the last two commands for every update.

You can also drag the `dist` folder into the Cloudflare dashboard (**Workers & Pages → Create → Drag and drop your files**). Note that a project created by direct upload [cannot later be switched to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/).

### Option B: automatic deploys from a private GitHub repository

1. Push this repository to a **private** GitHub repository.
2. In Cloudflare: **My Profile → API Tokens → Create Token**, with permission *Account → Cloudflare Pages → Edit*. Copy your *Account ID* from the dashboard.
3. In GitHub: **Settings → Secrets and variables → Actions**, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Run `.github/workflows/deploy-cloudflare.yml` from **Actions → Deploy to Cloudflare Pages → Run workflow** (or add a `push:` trigger to it): tests, build, deploy. `ci.yml` runs lint, unit and browser tests on every push.

### Option C: GitHub Pages (public repository only)

This is the setup used for `anwjawad/p2`. Settings → Pages → Source: **GitHub Actions**. Every push to `main` runs `.github/workflows/deploy-pages.yml` (backend tests, build, upload of `dist/`). The site is at `https://<user>.github.io/<repo>/`. GitHub Pages ignores the `_headers` file, so the extra security headers (CSP etc.) apply only on Cloudflare. Read the warning in section 1 first: the code is public, so the data must be protected by `APP_ACCESS_CODE`.

---

## 4. Settings reference

| Setting | Where | Secret? |
|---|---|---|
| `API_URL`, `HVC_API_URL`, `PE_API_URL`, `PORTCATH_API_URL` | `web/js/config.js` | No (public URLs) |
| `PORTCATH_API_KEY` | `web/js/config.js` | Visible to every user; it only gates the external Port Cath script |
| `APP_ACCESS_CODE` | Apps Script → Script Properties | **Yes** |
| `GEMINI_API_KEY` | Apps Script → Script Properties | **Yes** |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets (option B only) | **Yes** |

`.env.example` lists the same settings. Nothing secret is stored in the repository or the frontend.

**HTTPS, CORS, cookies**

- Cloudflare Pages and Apps Script are both HTTPS-only.
- The app sends `POST` requests with `Content-Type: text/plain`. That is a "simple" cross-origin request, so no CORS pre-flight is needed, and Apps Script answers cross-origin web-app requests.
- No cookies are used. The access code is stored in `sessionStorage` (cleared when the browser closes), or in `localStorage` if the user ticks "Keep me signed in on this device". It is sent only in request bodies, never in a URL.

**Caching**

- The service worker caches only the app's own static files. API calls and all patient data always go to the network and are never cached on the device.
- `index.html`, `sw.js` and `config.js` are served with `no-cache`, so a new deploy shows up on the next load.

**Health check**

- `POST {"action":"verify_access"}` to the Apps Script URL (see the `curl` command above).
- In the app: **Settings → Check connection**.

---

## 5. Backup and restore

| What | How |
|---|---|
| Automatic nightly copy | `installDailyBackup()` (section 2), 30 dated copies in Drive `Palliative_Backups` |
| Point-in-time history | Google Sheets **File → Version history → See version history**, then restore any version |
| Manual copy before risky actions | **File → Make a copy** |
| Removed patients | They are never deleted. "Remove" sets `ward = TRASH`, and the row stays in the `Patients` sheet. To restore, change the `ward` cell back to a ward name |
| Daily "Start a new day" | Copies every patient to `History_Log` before clearing the board (see *Past rounds*) |

**Restore from a nightly copy:**

1. Open the backup file.
2. Right-click the sheet tab you need, e.g. `Patients`, then **Copy to → Existing spreadsheet** → choose the live sheet.
3. In the live sheet, delete or rename the damaged tab and rename the copy to exactly `Patients`.

Header names in row 1 must stay unchanged.

---

## 6. Going live checklist

- [ ] New `GEMINI_API_KEY` created; the old key from `Code.js.txt` **revoked** in Google AI Studio
- [ ] `backend/Code.gs` pasted, `APP_ACCESS_CODE` set, deployment edited to a **new version** (same URL)
- [ ] `curl` check returns `UNAUTHORIZED` without the code
- [ ] `installDailyBackup` run once
- [ ] `npm run build` and deploy (option A or B)
- [ ] Open the public link on a phone, enter the code, open a patient, edit, and reload to confirm the edit stayed
- [ ] Share the link and the code with the team separately, not in the same message
