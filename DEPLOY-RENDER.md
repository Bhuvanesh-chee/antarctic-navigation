# Deploy to Render — clicks only

The code is in `https://github.com/Bhuvanesh-chee/antarctic-navigation` (branch `main`).
That repo already contains everything Render needs: `Dockerfile`, `backend/`,
`frontend/dist/`, `backend/requirements.txt`, `backend/entrypoint.sh`, the LFS-tracked
model + iceberg files, and `.gitattributes`. No Docker install is needed on your machine —
Render builds the image from the Dockerfile.

## Clicks (in order)

1. Sign up / log in at https://dashboard.render.com/ with GitHub.
2. Click **New +** → **Web Service**.
3. Authorize Render to access your GitHub account if prompted.
4. Under "Connect a repository", search and select:
   `Bhuvanesh-chee / antarctic-navigation`
5. Configure:
   - **Name:** `antarctic-navigation`
   - **Branch:** `main`
   - **Root Directory:** leave blank (repo root is the Dockerfile location)
   - **Runtime:** `Docker`
   - **Build Command:** leave blank
   - **Start Command:** leave blank
   - **Instance Type:** `Free`
   - **Environment Variables:** leave blank — do **not** add `PORT`. The Dockerfile
     `EXPOSE 7860` + `entrypoint.sh` `${PORT:-7860}` is all the port handling; Render's
     Docker runtime routes to the EXPOSEd port, so leave PORT unset.
6. Click **Create Web Service**.

## Where to read the public URL

After the build finishes, the dashboard page for the service shows the live URL at the top,
e.g.:
```
https://antarctic-navigation.onrender.com
```

The full URL pattern is:
```
https://antarctic-navigation.onrender.com
https://antarctic-navigation.onrender.com/health
```

## Verify (run after the deploy is live)

```bash
curl -i https://antarctic-navigation.onrender.com/health
curl -i https://antarctic-navigation.onrender.com/
```

Both should return HTTP 200. `/health` returns:
```json
{"status":"ok","service":"antarctic-navigation","version":"0.1.0"}
```
`/` serves the built React frontend.

If the service is asleep (free tier sleeps after 15 min idle), the first request takes
30–90s and then returns 200.

## Two most likely failures and one-line fixes

### Failure 1 — build log:
```
COPY failed: file not found: './frontend/dist/' doesn't exist in the build context
```
or similar `COPY frontend/dist/...` failure.

**Meaning:** `frontend/dist/` is not committed in the GitHub repo, so the Dockerfile
`COPY frontend/dist/ ./frontend/dist/` has nothing to copy.

**One-line fix:**
```bash
cd frontend && npm run build && git add frontend/dist/ && git commit -m "add frontend dist" && git push
```

### Failure 2 — service log (after build succeeds, at runtime):
```
Error: unable to open database file
sqlite3.OperationalError ... iceberg_catalog.db
```
or the app falls back to synthetic/demo data with no real icebergs.

**Meaning:** Render's GitHub checkout did not pull the Git LFS objects for
`backend/iceberg_catalog.db` and `backend/models/*.json` (the `.gitattributes` marks
them as LFS). The Docker build copied LFS pointer files, not the real binaries, so at
runtime the app sees a text pointer where it expects a SQLite DB / sklearn JSON model.

**One-line fix (pick one):**
- Easiest: remove LFS tracking for those files and commit the real binaries:
  ```bash
  git lfs uninstall 2>/dev/null; git lfs uninstall --local 2>/dev/null
  git lfs migrate export --include="backend/iceberg_catalog.db,backend/models/*.json" --above=100k 2>/dev/null
  # if that's not available, just commit the real files directly:
  git rm --cached backend/iceberg_catalog.db backend/models/iceberg_model.json backend/models/sea_ice_model.json
  git add backend/iceberg_catalog.db backend/models/iceberg_model.json backend/models/sea_ice_model.json
  git commit -m "commit real LFS files non-LFS" && git push
  ```
- Or: leave LFS in place and confirm Render's build environment pulls LFS (Render may do
  this automatically with the GitHub integration; if not, the non-LFS commit above is the
  reliable fix).

## No secrets, no env vars

The app calls no paid external APIs. Leaflet is keyless. The only external data is the
bundled USNIC iceberg CSVs (real data) — if those aren't present at runtime the endpoints
fall back to synthetic/demo data and still work. Nothing goes in Render's environment
variables. Leave PORT unset — the code already handles the port via `EXPOSE 7860` +
`${PORT:-7860}`.

## Free-tier note

Free tier sleeps after 15 minutes of no traffic. First request after sleep is a 30–90s
cold start, then 200. No uptime guarantee. Disk is ephemeral — `entrypoint.sh` re-seeds
the SQLite DB on every boot.
