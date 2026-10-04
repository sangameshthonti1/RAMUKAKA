"""Print source structure, excluding generated dependencies and local state."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {
    ".git",
    ".venv",
    ".bootstrap",
    ".python",
    ".python-bin",
    ".uv-cache",
    ".pip-cache",
    "node_modules",
    ".npm-cache",
    ".browsers",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "coverage",
    "artifacts",
    "pytest-tmp",
    "playwright-report",
    "test-results",
}


def walk(directory, prefix=""):
    entries = sorted(
        (
            p
            for p in directory.iterdir()
            if p.name not in EXCLUDE
            and not p.name.endswith(
                (".db", ".db-wal", ".db-shm", ".pyc", ".tsbuildinfo")
            )
        ),
        key=lambda p: (not p.is_dir(), p.name),
    )
    for index, entry in enumerate(entries):
        last = index == len(entries) - 1
        print(
            prefix
            + ("└── " if last else "├── ")
            + entry.name
            + ("/" if entry.is_dir() else "")
        )
        if entry.is_dir() and not entry.is_symlink():
            walk(entry, prefix + ("    " if last else "│   "))


if __name__ == "__main__":
    print(ROOT.name + "/")
    walk(ROOT)
