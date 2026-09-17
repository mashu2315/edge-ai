"""
script_generator.py — Bash cleanup script generator.

Takes a list of approved file paths and generates a safe bash script that:
  - Sets strict error handling (set -euo pipefail)
  - Creates a manifest backup before deletion
  - Skips sockets, symlinks, and files not in the original scan dirs
  - Reports space reclaimed
"""
from __future__ import annotations

import os
import stat
import time
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("script_generator")

_LOG_DIR = Path(os.environ.get("CLEANUP_LOG_DIR", "/tmp/edge-ai-cleanup-logs"))
_ALLOWED_SCAN_DIRS = [
    "/tmp",
    "/var/tmp",
    os.path.expanduser("~/.cache"),
    "/home/appuser/.cache",
    "/home/node/.cache",
    "/home/ashutosh-maurya/.cache",
    os.path.expanduser("~/.local/share/Trash"),
]


def _is_path_safe(fpath: str) -> tuple[bool, str]:
    """Verify the path is under one of our allowed scan dirs."""
    fpath_resolved = os.path.realpath(fpath)
    for allowed in _ALLOWED_SCAN_DIRS:
        allowed_resolved = os.path.realpath(os.path.expanduser(allowed))
        if fpath_resolved.startswith(allowed_resolved):
            return True, ""
    return False, f"Path escapes allowed scan dirs: {fpath}"


def generate_cleanup_script(
    approved_paths: list[str],
    plan_id: str,
    dry_run: bool = False,
) -> dict:
    """
    Generate a bash cleanup script from an approved list of paths.

    Args:
        approved_paths: List of absolute file paths approved for deletion.
        plan_id: Unique ID to tag this cleanup plan.
        dry_run: If True, generate an echo-only dry-run script.

    Returns:
        {
          "script": "<bash script content>",
          "manifest_path": "<path where manifest will be saved>",
          "valid_paths": [...],
          "rejected_paths": [...],  # paths that failed safety checks
          "plan_id": "...",
        }
    """
    manifest_path = str(_LOG_DIR / f"cleanup_{plan_id}_manifest.json")
    valid_paths = []
    rejected_paths = []

    # Safety-filter approved paths
    for fpath in approved_paths:
        # Must be absolute
        if not os.path.isabs(fpath):
            rejected_paths.append({"path": fpath, "reason": "Not an absolute path"})
            continue
        # Must be within allowed scan dirs
        safe, reason = _is_path_safe(fpath)
        if not safe:
            rejected_paths.append({"path": fpath, "reason": reason})
            continue
        # Must not be a socket or symlink at execution time
        try:
            st = os.lstat(fpath)
            if stat.S_ISSOCK(st.st_mode):
                rejected_paths.append({"path": fpath, "reason": "Socket file — skipped"})
                continue
            if stat.S_ISLNK(st.st_mode):
                rejected_paths.append({"path": fpath, "reason": "Symlink — skipped"})
                continue
        except FileNotFoundError:
            # File may have been deleted since scan — that's OK, rm -f handles it
            pass
        except PermissionError:
            rejected_paths.append({"path": fpath, "reason": "Permission denied"})
            continue

        valid_paths.append(fpath)

    # Build bash script
    timestamp = int(time.time())
    action = "echo [DRY-RUN] Would delete" if dry_run else "rm -f"
    lines = [
        "#!/bin/bash",
        "# ============================================================",
        f"# Edge AI Intelligent Temp Cleanup  —  Plan ID: {plan_id}",
        f"# Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(timestamp))}",
        f"# Files to delete: {len(valid_paths)}",
        f"# Mode: {'DRY-RUN (no files deleted)' if dry_run else 'LIVE DELETION'}",
        "# ============================================================",
        "",
        "set -euo pipefail",
        "",
        "# Counters",
        "DELETED=0",
        "FAILED=0",
        "SAVED_KB=0",
        "",
        "# Create log directory",
        f'mkdir -p "{_LOG_DIR}"',
        "",
        "# Save manifest before deletion (backup list)",
        f'MANIFEST="{manifest_path}"',
        f"cat > \"$MANIFEST\" << 'MANIFEST_EOF'",
        json.dumps({
            "plan_id": plan_id,
            "timestamp": timestamp,
            "files": valid_paths,
            "dry_run": dry_run,
        }, indent=2),
        "MANIFEST_EOF",
        f'echo "[INFO] Manifest saved to $MANIFEST"',
        "",
        "echo '[INFO] Starting cleanup...'",
        "",
    ]

    for fpath in valid_paths:
        escaped = fpath.replace('"', '\\"')
        lines += [
            f'if [ -e "{escaped}" ]; then',
            f'  FILE_KB=$(du -sk "{escaped}" 2>/dev/null | cut -f1 || echo 0)',
            f'  {action} "{escaped}" && \\',
            f'    DELETED=$((DELETED + 1)) && \\',
            f'    SAVED_KB=$((SAVED_KB + FILE_KB)) && \\',
            f'    echo "[DELETED] {escaped}" || \\',
            f'    ( FAILED=$((FAILED + 1)) && echo "[FAILED]  {escaped}" )',
            f'else',
            f'  echo "[SKIP]    {escaped} (not found)"',
            f'fi',
            '',
        ]

    lines += [
        'echo "============================================================"',
        'echo "[DONE] Cleanup complete"',
        'echo "  Deleted : $DELETED files"',
        'echo "  Failed  : $FAILED files"',
        'SAVED_MB=$(awk "BEGIN {printf \\"%.2f\\", $SAVED_KB/1024}")',
        'echo "  Freed   : ${SAVED_MB} MB"',
        'echo "  Manifest: $MANIFEST"',
        'echo "============================================================"',
    ]

    script = "\n".join(lines) + "\n"

    return {
        "script": script,
        "manifest_path": manifest_path,
        "valid_paths": valid_paths,
        "rejected_paths": rejected_paths,
        "plan_id": plan_id,
        "dry_run": dry_run,
        "file_count": len(valid_paths),
    }

