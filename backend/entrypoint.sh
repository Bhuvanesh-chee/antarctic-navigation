#!/bin/bash
# entrypoint.sh — Hugging Face Space entrypoint
# Ephemeral disk: seeds SQLite DB + iceberg catalog on every boot if missing.
set -e

APP_DIR="/home/user/app"
DB_PATH="$APP_DIR/iceberg_catalog.db"

echo "[entrypoint] Starting Antarctic Navigation Space…"

# Create + seed the SQLite catalog if it doesn't exist yet
if [ ! -f "$DB_PATH" ]; then
  echo "[entrypoint] Seeding iceberg_catalog.db from bundled USNIC CSVs…"
  cd "$APP_DIR"
  PYTHONPATH="$APP_DIR" python -c "
import logging, sys
logging.basicConfig(level=logging.INFO)
log = logging.getLogger('seed')
sys.path.insert(0, '$APP_DIR')
from app.services.iceberg_catalog import load_csv_data as _load
# CSVs live under the workspace root (HF_HOME) which HF mounts alongside the Space;
# if not present, seed remains synthetic (the endpoint still works, just no real icebergs).
try:
    _load()
    log.info('Seeded iceberg_catalog.db from USNIC CSVs')
except Exception as e:
    log.warning('CSV seed unavailable (%s) — endpoints will use synthetic/demo icebergs', e)
"
  echo "[entrypoint] Seed step complete."
else
  echo "[entrypoint] iceberg_catalog.db already present, skipping seed."
fi

# Start the app
cd "$APP_DIR"
export PYTHONPATH="$APP_DIR"
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
