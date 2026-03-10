from __future__ import annotations

import sqlite3
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    data_dir = repo_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "opentour.db"
    schema_path = Path(__file__).resolve().parent / "opentour-db-schema.sql"

    schema = schema_path.read_text(encoding="utf-8")

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.executescript(schema)
        conn.commit()

    print(f"OpenTour SQLite initialized: {db_path}")


if __name__ == "__main__":
    main()
