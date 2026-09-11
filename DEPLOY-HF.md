# Deploy this Space to Hugging Face (free Docker Basic CPU)

## Prerequisites

- A Hugging Face account: https://huggingface.co
- `git` on your machine
- `huggingface_hub` Python package (optional, for `huggingface-cli`):
  ```bash
  pip install -U huggingface_hub
  ```
- A **Hugging Face token** with `write` scope:
  ```bash
  huggingface-cli login
  ```
  (Or use the token in git remote auth: `https://<token>@huggingface.co/spaces/<username>/<spacename>.git`)

## 1. Create the Space on the HF dashboard

1. Go to https://huggingface.co/spaces/new
2. Choose **Docker** as the SDK.
3. Pick **Basic (CPU)** hardware (free tier).
4. Set a unique Space name, e.g. `antarctic-navigation`.
5. Visibility: Public or Private as you prefer.
6. Click **Create Space**. You'll get a git repo URL like:
   ```
   https://huggingface.co/spaces/<your-username>/antarctic-navigation
   ```

## 2. Clone + push the code

```bash
# From the project root (this folder):
cd /c/Users/cheed/antarctic-navigation

# Clone the empty Space repo (replace with your Space URL)
git clone https://huggingface.co/spaces/<your-username>/antarctic-navigation
cd antarctic-navigation

# Copy in the Space-ready files from this project
# (the files are already in the repo root here: Dockerfile, README.md, DEPLOY-HF.md,
#  backend/, frontend/dist/)
cp -r ../antarctic-navigation-backup/* .   # if you kept a backup, otherwise the files
                                            # are already here — just commit what's present.

# Or, if this IS the repo root already:
git add Dockerfile README.md DEPLOY-HF.md backend/ frontend/dist/
git commit -m "Initial Antarctic Navigation Space (Docker Basic CPU)"

# Push to the Space
git push origin main
```

If your Space uses a branch other than `main`, push to that branch:
```bash
git push origin master   # or whatever branch the Space was created with
```

## 3. Watch the build

- The Space dashboard shows the build log. A Docker Basic build typically takes **1–3 min**
  (pip install of sklearn/numpy/pandas is the heaviest part).
- First boot also runs `entrypoint.sh`, which seeds `iceberg_catalog.db` if it's missing.

## 4. Open the Space

- URL: `https://<your-username>-antarctic-navigation.hf.space`
- API docs: `https://<your-username>-antarctic-navigation.hf.space/docs`
- Frontend: served at `/` (StaticFiles, html=True).
- API base in the frontend: relative `/api` — works with no CORS config because the UI and API
  share the same origin.

## Free-tier limits (read this before sharing the link)

| Limitation | Detail |
|---|---|
| **Idle sleep** | Space sleeps after ~48 hours of no traffic; wake-up cold start is **30–90s**. |
| **Ephemeral disk** | Disk is wiped on restart/sleep. `entrypoint.sh` re-seeds `iceberg_catalog.db` on every boot. If USNIC CSVs aren't present at boot, endpoints fall back to synthetic/demo icebergs (still fully functional). |
| **No uptime guarantee** | Free CPU Basic Space — do not use for production or time-critical workloads. |
| **CPU-only** | No GPU on Basic tier. Inference is lightweight scikit-learn, so this is fine for the prototype. |
| **Prototype labelling** | Every API response carries `data_source: "synthetic/demo"` where applicable. Not certified for real navigation. |

## Updating the Space later

```bash
cd /c/Users/cheed/antarctic-navigation
# make changes, then:
git add -A
git commit -m "update:"
git push origin main
```

The Space rebuilds automatically on push.

## Secrets / env vars

This prototype uses **no external API keys** (Leaflet is keyless; no paid data calls).
If you later add a paid data source, add the secret in the Space Settings → Variables panel —
**never hardcode keys in the repo**.
