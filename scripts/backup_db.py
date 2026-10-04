"""Create a consistent SQLite backup under backend/data/backups without resetting data."""

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import BACKEND_ROOT, Settings
from sqlalchemy.engine import make_url


def main():
    url = make_url(Settings().database_url)
    if url.database in (None, "", ":memory:"):
        raise SystemExit("A file-backed SQLite database is required for backup")
    source = Path(url.database)
    if not source.is_absolute():
        source = BACKEND_ROOT / source
    source = source.resolve()
    if not source.is_relative_to(BACKEND_ROOT) or not source.is_file():
        raise SystemExit(
            "Database must exist inside backend/; start the application first"
        )
    folder = BACKEND_ROOT / "data" / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = folder / f"ramukaka-{stamp}.sqlite3"
    # Use SQLite's snapshot API rather than copying a live file or its journal.
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(destination) as backup:
            original.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup failed its integrity check")
    print(f"Verified backup: {destination.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
