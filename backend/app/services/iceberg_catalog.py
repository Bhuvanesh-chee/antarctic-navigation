# -*- coding: utf-8 -*-
"""Real Antarctic iceberg catalog from US National Ice Center weekly bulletins.

Source: 111 CSV snapshots (AntarcticIcebergs_YYYYMMDD.csv) covering
2019-08-16 to 2022-08-12, one snapshot per week, ~41 icebergs each.

This module:
- Loads all CSVs into a SQLite catalog on first use (or when refreshed).
- Exposes functions to query the latest snapshot, iceberg trajectories,
  and the most recent known position for any iceberg ID.
- Is clearly labelled as REAL HISTORICAL DATA (not live/satellite).

Corrections applied:
- File AntarcticIcebergs_20190830.csv has a trailing-comma artifact on one
  row (9 fields instead of 7). We strip trailing empty fields on load.
- 26 rows across the dataset have unparseable dates (malformed Last Update);
  we skip those rows.
"""

from __future__ import annotations

import glob
import math
import os
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = os.path.join(
    os.path.expanduser("~"),
    "AppData", "Local", "Temp", "realdata",
)

# Also try the extracted path directly if the above doesn't exist
if not os.path.isdir(DATA_DIR):
    alt = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                       "tmp", "realdata")
    if os.path.isdir(os.path.dirname(alt)):
        DATA_DIR = os.path.dirname(alt)
    else:
        DATA_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
        # The zip was extracted to /tmp/realdata; fall back to searching.

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "iceberg_catalog.db")

# Expected schema (from the CSVs):
# Iceberg, Length (NM), Width (NM), Latitude, Longitude, Remarks, Last Update
EXPECTED_COLS = ["Iceberg", "Length (NM)", "Width (NM)",
                 "Latitude", "Longitude", "Remarks", "Last Update"]


def _find_data_dir() -> str:
    """Find the directory containing AntarcticIcebergs_*.csv files."""
    candidates = [
        os.path.join(os.path.expanduser("~"), "AppData", "Local", "Temp", "realdata"),
        os.path.join(os.path.expanduser("~"), "Downloads", "realdata"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "tmp", "realdata"),
        "/tmp/realdata",
        "C:/Users/cheed/AppData/Local/Temp/realdata",
    ]
    for c in candidates:
        if os.path.isdir(c) and glob.glob(os.path.join(c, "AntarcticIcebergs_*.csv")):
            return c
    # Last resort: search user home
    import subprocess
    try:
        result = subprocess.run(["find", os.path.expanduser("~"),
                                "-name", "AntarcticIcebergs_20190816.csv",
                                "-printf", "%h\n", "-quit"],
                               capture_output=True, text=True, timeout=10)
        d = result.stdout.strip()
        if d:
            return d
    except Exception:
        pass
    raise FileNotFoundError(
        "Could not find AntarcticIcebergs_*.csv data directory. "
        "Expected ~AppData/Local/Temp/realdata/ or ~Downloads/realdata/."
    )


def _ensure_catalog() -> sqlite3.Connection:
    """Create/refresh the SQLite iceberg catalog from CSV snapshots."""
    data_dir = _find_data_dir()
    csv_files = sorted(glob.glob(os.path.join(data_dir, "AntarcticIcebergs_*.csv")))
    if not csv_files:
        raise FileNotFoundError(f"No AntarcticIcebergs_*.csv files in {data_dir}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS iceberg_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            iceberg_id TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            length_nm REAL,
            width_nm REAL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            remarks TEXT,
            last_update TEXT,
            obs_date TEXT,
            source_file TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_iceberg_id ON iceberg_snapshots(iceberg_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshot_date ON iceberg_snapshots(snapshot_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_obs_date ON iceberg_snapshots(obs_date)")

    # Clear and reload to keep catalog fresh
    conn.execute("DELETE FROM iceberg_snapshots")

    loaded = 0
    skipped = 0
    for fpath in csv_files:
        fname = os.path.basename(fpath)
        snap_date_str = fname.replace("AntarcticIcebergs_", "").replace(".csv", "")
        try:
            snap_dt = datetime.strptime(snap_date_str, "%Y%m%d")
        except ValueError:
            skipped += 1
            continue

        with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
            header_line = fh.readline().strip()
            headers = [h.strip() for h in header_line.split(",")]
            if len(headers) != 7:
                # Try to fix: take first 7
                headers = headers[:7]

            for line in fh:
                line = line.strip()
                if not line:
                    continue
                fields = line.split(",")
                # Correction 1: strip trailing empty fields (fixes 20190830.csv artifact)
                while fields and fields[-1].strip() == "":
                    fields.pop()
                if len(fields) != 7:
                    skipped += 1
                    continue
                row = dict(zip(headers, fields))

                iceberg_id = row.get("Iceberg", "").strip()
                if not iceberg_id:
                    skipped += 1
                    continue

                try:
                    length_nm = float(row.get("Length (NM)", 0) or 0)
                    width_nm = float(row.get("Width (NM)", 0) or 0)
                    lat = float(row.get("Latitude", 0) or 0)
                    lon = float(row.get("Longitude", 0) or 0)
                    remarks = row.get("Remarks", "").strip()
                    last_update_raw = row.get("Last Update", "").strip()
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                # Correction 2: skip rows with unparseable dates (26 bad rows across dataset)
                try:
                    obs_dt = datetime.strptime(last_update_raw, "%m/%d/%Y")
                    obs_str = obs_dt.strftime("%Y-%m-%d")
                except ValueError:
                    skipped += 1
                    continue

                # Coordinate sanity
                if not (-90 <= lat <= -50):
                    skipped += 1
                    continue
                if not (-180 <= lon <= 180):
                    skipped += 1
                    continue

                conn.execute(
                    """INSERT INTO iceberg_snapshots
                    (iceberg_id, snapshot_date, length_nm, width_nm,
                     latitude, longitude, remarks, last_update, obs_date, source_file)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (iceberg_id, snap_date_str,
                     length_nm, width_nm, lat, lon,
                     remarks, last_update_raw, obs_str, fname),
                )
                loaded += 1

    conn.commit()
    return conn, loaded, skipped, len(csv_files)


def get_catalog() -> Tuple[sqlite3.Connection, int, int, int]:
    """Return (connection, loaded_rows, skipped_rows, snapshot_count).
    Rebuilds the catalog if the DB is missing or if CSV files are newer.
    """
    db_exists = os.path.exists(DB_PATH)
    data_dir = _find_data_dir()
    csv_files = sorted(glob.glob(os.path.join(data_dir, "AntarcticIcebergs_*.csv")))
    if not csv_files:
        raise FileNotFoundError("No iceberg CSV files found")

    db_mtime = os.path.getmtime(DB_PATH) if db_exists else 0
    newest_csv = max(os.path.getmtime(f) for f in csv_files)

    if db_exists and db_mtime >= newest_csv:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.execute("SELECT COUNT(*) FROM iceberg_snapshots")
        loaded = cur.fetchone()[0]
        cur = conn.execute("SELECT COUNT(DISTINCT snapshot_date) FROM iceberg_snapshots")
        snap_count = cur.fetchone()[0]
        return conn, loaded, 0, snap_count

    return _ensure_catalog()


def latest_snapshot(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Return all icebergs from the most recent snapshot."""
    cur = conn.execute(
        """SELECT * FROM iceberg_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM iceberg_snapshots)
        ORDER BY iceberg_id"""
    )
    return [dict(r) for r in cur.fetchall()]


def iceberg_positions(conn: sqlite3.Connection, snapshot_date: str = None) -> List[Dict[str, Any]]:
    """Return iceberg positions for a given snapshot date (or latest)."""
    if snapshot_date is None:
        snapshot_date = conn.execute(
            "SELECT MAX(snapshot_date) FROM iceberg_snapshots"
        ).fetchone()[0]
    cur = conn.execute(
        """SELECT * FROM iceberg_snapshots
        WHERE snapshot_date = ?
        ORDER BY iceberg_id""",
        (snapshot_date,),
    )
    return [dict(r) for r in cur.fetchall()]


def iceberg_trajectory(
    conn: sqlite3.Connection, iceberg_id: str,
    days_back: int = None, since: str = None,
) -> List[Dict[str, Any]]:
    """Return historical positions for one iceberg, newest first."""
    if since:
        cur = conn.execute(
            """SELECT * FROM iceberg_snapshots
            WHERE iceberg_id = ? AND obs_date >= ?
            ORDER BY obs_date DESC""",
            (iceberg_id, since),
        )
    elif days_back is not None:
        since_dt = datetime.now() - timedelta(days=days_back)
        since_str = since_dt.strftime("%Y-%m-%d")
        cur = conn.execute(
            """SELECT * FROM iceberg_snapshots
            WHERE iceberg_id = ? AND obs_date >= ?
            ORDER BY obs_date DESC""",
            (iceberg_id, since_str),
        )
    else:
        cur = conn.execute(
            """SELECT * FROM iceberg_snapshots
            WHERE iceberg_id = ?
            ORDER BY obs_date DESC""",
            (iceberg_id,),
        )
    return [dict(r) for r in cur.fetchall()]


def iceberg_latest_position(
    conn: sqlite3.Connection, iceberg_id: str,
) -> Optional[Dict[str, Any]]:
    """Return the most recent known position for one iceberg."""
    cur = conn.execute(
        """SELECT * FROM iceberg_snapshots
        WHERE iceberg_id = ?
        ORDER BY obs_date DESC
        LIMIT 1""",
        (iceberg_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def list_icebergs(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Return distinct iceberg IDs with their latest position and first/last observation dates."""
    cur = conn.execute(
        """SELECT iceberg_id,
                MIN(obs_date) AS first_seen,
                MAX(obs_date) AS last_seen,
                COUNT(DISTINCT snapshot_date) AS snapshots
         FROM iceberg_snapshots
         GROUP BY iceberg_id
         ORDER BY snapshots DESC"""
    )
    return [dict(r) for r in cur.fetchall()]


def estimate_drift(
    iceberg_id: str, conn: sqlite3.Connection,
    hours: float = 24.0,
) -> Tuple[float, float, float, float]:
    """Estimate where an iceberg will be after `hours` based on its recent track.

    Uses the last 2-4 observations to compute average drift velocity
    (degrees per hour), then projects forward. Returns (new_lat, new_lon,
    speed_ms_estimate, direction_deg_estimate).
    """
    traj = iceberg_trajectory(conn, iceberg_id, days_back=365)
    if len(traj) < 2:
        latest = iceberg_latest_position(conn, iceberg_id)
        if not latest:
            return 0.0, 0.0, 0.0, 0.0
        return latest["latitude"], latest["longitude"], 0.0, 0.0

    # traj is newest-first; take the last 2-4 for velocity estimate
    recent = traj[:4] if len(traj) >= 4 else traj[:]
    # Sort ascending by date to compute per-step velocities
    recent_sorted = sorted(recent, key=lambda r: r["obs_date"])
    if len(recent_sorted) < 2:
        return recent_sorted[-1]["latitude"], recent_sorted[-1]["longitude"], 0.0, 0.0

    # Compute velocity per step, then average
    dlat_sum, dlon_sum, hours_sum = 0.0, 0.0, 0.0
    for i in range(1, len(recent_sorted)):
        p_prev = recent_sorted[i - 1]
        p_curr = recent_sorted[i]
        dlat = p_curr["latitude"] - p_prev["latitude"]
        dlon = p_curr["longitude"] - p_prev["longitude"]
        dt = (datetime.strptime(p_curr["obs_date"], "%Y-%m-%d") -
              datetime.strptime(p_prev["obs_date"], "%Y-%m-%d")).total_seconds() / 3600.0
        if dt > 0:
            dlat_sum += dlat
            dlon_sum += dlon
            hours_sum += dt

    if hours_sum <= 0:
        latest = iceberg_latest_position(conn, iceberg_id)
        return latest["latitude"], latest["longitude"], 0.0, 0.0

    dlat_per_hr = dlat_sum / hours_sum
    dlon_per_hr = dlon_sum / hours_sum
    last = recent_sorted[-1]

    new_lat = last["latitude"] + dlat_per_hr * hours
    new_lon = (last["longitude"] + dlon_per_hr * hours + 180.0) % 360.0 - 180.0

    # Speed: degrees/hr * 60 NM/deg * 1852 m/NM / 3600 s/hr = m/s
    speed_deg_per_hr = math.hypot(dlat_per_hr, dlon_per_hr)
    speed_ms = speed_deg_per_hr * 60.0 * 1852.0 / 3600.0

    # Direction from averaged displacement
    if speed_deg_per_hr > 1e-6:
        bearing = math.degrees(math.atan2(dlon_sum, dlat_sum))
    else:
        bearing = 0.0
    bearing = (bearing + 360.0) % 360.0

    return new_lat, new_lon, speed_ms, bearing


def closest_icebergs(
    conn: sqlite3.Connection,
    lat: float, lon: float,
    max_distance_nm: float = 200.0,
    max_results: int = 20,
) -> List[Dict[str, Any]]:
    """Return icebergs within max_distance_nm of (lat, lon), sorted by distance."""
    R_NM = 3440.065

    def haversin_nm(lat1, lon1, lat2, lon2):
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = (math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2)
        return 2 * R_NM * math.asin(math.sqrt(a))

    all_positions = iceberg_positions(conn)
    result = []
    for p in all_positions:
        d = haversin_nm(lat, lon, p["latitude"], p["longitude"])
        if d <= max_distance_nm:
            result.append({**p, "distance_nm": round(d, 1)})
    result.sort(key=lambda r: r["distance_nm"])
    return result[:max_results]


def size_label(length_nm: float, width_nm: float) -> str:
    """Map Length×Width (NM) to iceberg size class (USNIC-style approximation)."""
    area = length_nm * width_nm
    if area < 50:
        return "Small"
    if area < 500:
        return "Medium"
    if area < 2000:
        return "Large"
    return "Very Large"


def notes() -> Dict[str, Any]:
    """Return metadata about the real iceberg dataset."""
    conn, loaded, skipped, snaps = get_catalog()
    try:
        n_icebergs = conn.execute(
            "SELECT COUNT(DISTINCT iceberg_id) FROM iceberg_snapshots"
        ).fetchone()[0]
        date_range = conn.execute(
            "SELECT MIN(obs_date), MAX(obs_date) FROM iceberg_snapshots"
        ).fetchone()
        return {
            "source": "US National Ice Center / NOAA Antarctic Iceberg Bulletins (historical)",
            "files": snaps,
            "rows_loaded": loaded,
            "rows_skipped": skipped,
            "unique_icebergs": n_icebergs,
            "date_range": {
                "first": date_range[0],
                "last": date_range[1],
            },
            "corrections": [
                "Stripped trailing empty fields (AntarcticIcebergs_20190830.csv artifact)",
                "Skipped 26 rows with unparseable Last Update dates",
            ],
            "data_type": "REAL HISTORICAL DATA — not live/satellite",
            "db_path": DB_PATH,
        }
    finally:
        conn.close()
