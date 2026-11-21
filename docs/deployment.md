# Deployment and updates

Hosted application (after the first successful deployment): **https://batraamul.github.io/Drone_Design/**

## 1. One-time GitHub setup

1. Repository: `batraamul/Drone_Design` (source of truth).
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions".** (Required once; the workflow cannot enable Pages with the default token.)
3. Recommended: **Settings → Branches** → add a protection rule (or ruleset) for `main` requiring the "Test and build" check to pass before merging.

## 2. Pipeline (`.github/workflows/ci-deploy.yml`)

On every push and pull request:

1. `npm ci`
2. `npm run check` — structural gate (files, JSON, syntax, imports, CSP, precache list, manifest, version consistency, module registry, workflow)
3. `npm run test:unit` — unit, engineering, integration and regression tests (Node test runner)
4. `npm run build` — assembles `_site/` and stamps the service-worker build ID and `version.json`
5. `npx playwright install --with-deps chromium` and `npm run test:e2e` — browser tests against `_site/` served under `/Drone_Design/`
6. On failure, the Playwright report is uploaded as an artifact.

Only a push to `main` that passes everything uploads `_site/` and runs the **deploy** job (`actions/deploy-pages`). The job summary shows the deployed URL.

## 3. Branching and releases

- `main` is always deployable.
- Substantial modules are built on feature branches (`build/02-configuration`, …) and merged by pull request after CI passes.
- Each release updates `package.json`, `js/version.js`, `service-worker.js` (`VERSION`), `version.json` and `CHANGELOG.md` together (the structural check enforces this).

## 4. How users receive updates

**Installed or hosted app (service worker):**

1. A deployment changes `service-worker.js` (new `BUILD_ID`).
2. The browser checks for updates on load, every 30 minutes and when the tab becomes visible; the new version downloads in the background into a new versioned cache.
3. The app shows **"Update available — Reload to update"**. The open page keeps running the old version until then, so it never mixes files from two releases.
4. On "Reload to update", pending project edits are saved, the new worker activates, old caches are deleted, and the page reloads once.
5. **IndexedDB is never touched by updates; projects are preserved.** Settings → Application and updates shows the running version and deployed commit, and has "Check for updates".

**Local copies** (a clone or downloaded folder) do not update themselves:

```bash
git pull                      # or download a fresh copy of the repository
python3 -m http.server 8080   # or: npm run serve
# open http://localhost:8080/ and reload
```

ES modules and the service worker require an `http(s)` origin; opening `index.html` directly from disk (`file://`) is not supported (the start-up screen explains this). Projects are stored per origin: data saved at `http://localhost:8080` is separate from the hosted site. Use **Export full backup / Restore from backup** to move projects between them.

## 5. Rollback

- Revert the faulty commit on `main` (`git revert <sha>` and push) — the pipeline redeploys the previous state, and clients receive it through the normal update flow.
- Or re-run the workflow for an earlier commit (Actions → workflow run → "Re-run jobs").

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| App seems stuck on an old version | Settings → "Check for updates" → "Install update and reload"; as a last resort open with `?nosw` or clear the site's service worker in browser developer tools (projects stay unless site *data* is cleared) |
| "Local storage unavailable" | Private/incognito modes and some embedded browsers block IndexedDB; use a normal window |
| "Close other AEROLAB X tabs" | A database upgrade is waiting for an older tab to close |
| Pages deploy job fails with a permissions error | Check Settings → Pages → Source is "GitHub Actions" |
