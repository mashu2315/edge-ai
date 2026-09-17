"""
file_classifier.py — AI-powered temp file classifier and scanner.

Pipeline:
  1. Scan target directories recursively
  2. Extract features per file (age, size, extension, type)
  3. Safety pre-filter (sockets, PIDs, < 24h files → never delete)
  4. RandomForest classifier predicts: junk | user-relevant | system-critical
  5. Returns structured classification results with confidence + reason

Safe directories scanned:
  /tmp, /var/tmp, ~/.cache, ~/.local/share/Trash
"""
from __future__ import annotations

import os
import stat
import time
import json
import logging
import hashlib
from pathlib import Path
from typing import Optional
import numpy as np

logger = logging.getLogger("file_classifier")

# ---------------------------------------------------------------------------
# Target paths
# ---------------------------------------------------------------------------
# Target paths
# ---------------------------------------------------------------------------
_SCAN_DIRS = [
    "/tmp",
    "/var/tmp",
    "/home/ashutosh-maurya/.cache",
    os.path.expanduser("~/.cache"),
    os.path.expanduser("~/.local/share/Trash"),
]

# ---------------------------------------------------------------------------
# Safety constants
# ---------------------------------------------------------------------------
MIN_AGE_HOURS = 1.0          # Delete temp files older than 1 hour (per user approval)
MAX_FILES_PER_SCAN = 2000    # Cap to prevent runaway scans

# File extensions that are safe to delete
JUNK_EXTENSIONS = {
    ".tmp", ".temp", ".bak", ".old", ".swp", ".swo",
    ".log", ".log~", ".pyc", ".pyo", "__pycache__", ".DS_Store",
    ".thumbnails", ".part", ".crdownload", ".cache", ".dump", ".tdb",
}

# Extensions that are almost always system-critical / user-relevant
KEEP_EXTENSIONS = {
    ".sock", ".pid", ".lock", ".db", ".sqlite", ".sqlite3",
    ".conf", ".cfg", ".key", ".pem", ".crt",
}

# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def _get_active_pids() -> set:
    """Return set of PIDs currently running on this host."""
    pids = set()
    try:
        for entry in os.scandir("/proc"):
            if entry.is_dir() and entry.name.isdigit():
                pids.add(int(entry.name))
    except Exception:
        pass
    return pids


def _is_active_pid_file(path: str, active_pids: set) -> bool:
    """Check if a .pid file refers to a running process."""
    try:
        with open(path) as f:
            pid = int(f.read().strip())
        return pid in active_pids
    except Exception:
        return False


def extract_features(file_path: str, stat_result, active_pids: set) -> dict:
    """Extract feature dict for a single file."""
    now = time.time()
    ext = Path(file_path).suffix.lower()
    name = Path(file_path).name.lower()

    age_hours = (now - stat_result.st_mtime) / 3600
    access_hours = (now - stat_result.st_atime) / 3600
    size_kb = stat_result.st_size / 1024
    is_socket = stat.S_ISSOCK(stat_result.st_mode)
    is_symlink = os.path.islink(file_path)
    is_pid_file = ext == ".pid" or name.endswith(".pid")
    is_empty = stat_result.st_size == 0
    is_hidden = name.startswith(".")
    is_lock_file = name.endswith(".lock") or name.endswith("-lock") or "-lock" in name or ".lock" in name
    is_system_protected = any(p in name for p in [".x11", ".x0-", ".x1-", "x0-lock", "x1-lock", "wayland", "pulse", "systemd", "dbus", "ice-unix", "font-unix"])
    is_keep_ext = ext in KEEP_EXTENSIONS or is_lock_file or is_system_protected
    is_temp_dir = file_path.startswith("/tmp") or file_path.startswith("/var/tmp")
    is_temp_pattern = any(p in name for p in ["tmp", "temp", "cache", "trash", "pyright", "mat-debug", "chromium", "chrome", "node-", "codeium"])
    is_junk_ext = (ext in JUNK_EXTENSIONS or is_temp_pattern or (is_temp_dir and ext not in {".sock", ".pid", ".json", ".conf"})) and not is_keep_ext

    return {
        "path": file_path,
        "name": name,
        "extension": ext,
        "size_kb": round(size_kb, 2),
        "age_hours": round(age_hours, 2),
        "access_hours": round(access_hours, 2),
        "is_socket": is_socket,
        "is_symlink": is_symlink,
        "is_pid_file": is_pid_file,
        "is_empty": is_empty,
        "is_hidden": is_hidden,
        "is_junk_ext": is_junk_ext,
        "is_keep_ext": is_keep_ext,
        "is_temp_dir": is_temp_dir,
        "is_temp_pattern": is_temp_pattern,
        "is_active_pid": is_pid_file and _is_active_pid_file(file_path, active_pids),
    }


# ---------------------------------------------------------------------------
# Safety pre-filter — NEVER auto-delete these
# ---------------------------------------------------------------------------

def is_hard_skip(features: dict) -> tuple[bool, str]:
    """
    Return (True, reason) if the file must be skipped unconditionally.
    """
    if features["is_socket"]:
        return True, "Active socket — never delete"
    if features["is_symlink"]:
        return True, "Symbolic link — skip to avoid chain deletion"
    if features["age_hours"] < MIN_AGE_HOURS:
        return True, f"File is < {MIN_AGE_HOURS}h old (too recent)"
    if features["is_active_pid"]:
        return True, "PID file points to a running process"
    if features["is_keep_ext"]:
        return True, f"Protected runtime or system lock file: {features['name']}"
    return False, ""


# ---------------------------------------------------------------------------
# Lightweight RandomForest Classifier
# (trained on rule-generated labels at import time — fully offline)
# ---------------------------------------------------------------------------

class TempFileClassifier:
    """
    Self-training classifier that generates its own training data from
    rule-based heuristics and fits a RandomForestClassifier.
    No external training data required — 100% offline.
    """

    LABELS = ["junk", "user-relevant", "system-critical"]

    def __init__(self):
        self._model = None
        self._fit()

    def _features_to_vector(self, f: dict) -> list:
        """Convert feature dict → numeric vector for sklearn."""
        return [
            min(f.get("age_hours", 0) / (24 * 30), 1.0),      # age (normalised to 30 days)
            min(f.get("access_hours", 0) / (24 * 30), 1.0),    # last access
            min(f.get("size_kb", 0) / 10240, 1.0),             # size (normalised to 10 MB)
            float(f.get("is_empty", False)),
            float(f.get("is_hidden", False)),
            float(f.get("is_junk_ext", False)),
            float(f.get("is_keep_ext", False)),
            float(f.get("is_pid_file", False)),
            float(f.get("is_socket", False)),
            float(f.get("is_symlink", False)),
        ]

    def _generate_training_data(self, n: int = 2000):
        """Generate synthetic training samples from rule logic."""
        rng = np.random.default_rng(42)
        X, y = [], []

        for _ in range(n):
            age = rng.exponential(scale=72)        # hours
            access = rng.exponential(scale=96)
            size = rng.exponential(scale=500)      # KB
            is_empty = rng.random() < 0.3
            is_hidden = rng.random() < 0.4
            is_junk = rng.random() < 0.4
            is_keep = rng.random() < 0.1
            is_pid = rng.random() < 0.05
            is_sock = rng.random() < 0.03
            is_sym = rng.random() < 0.05

            vec = [
                min(age / (24 * 30), 1.0),
                min(access / (24 * 30), 1.0),
                min(size / 10240, 1.0),
                float(is_empty),
                float(is_hidden),
                float(is_junk),
                float(is_keep),
                float(is_pid),
                float(is_sock),
                float(is_sym),
            ]
            X.append(vec)

            # Assign label based on rules
            if is_sock or is_pid:
                label = 2   # system-critical
            elif is_keep:
                label = 2
            elif is_junk and age >= MIN_AGE_HOURS:
                label = 0   # junk
            elif is_empty and age >= MIN_AGE_HOURS:
                label = 0
            elif age > 24 and access > 24 and not is_keep:
                label = 0
            else:
                label = 1   # user-relevant

            y.append(label)

        return np.array(X, dtype=np.float32), np.array(y)

    def _fit(self):
        try:
            from sklearn.ensemble import RandomForestClassifier
            X, y = self._generate_training_data(1000)
            self._model = RandomForestClassifier(
                n_estimators=20,
                max_depth=6,
                random_state=42,
                n_jobs=1,
            )
            self._model.fit(X, y)
            logger.info("✅ TempFileClassifier trained successfully (1000 synthetic samples)")
        except ImportError:
            logger.warning("scikit-learn not available — using rule-only classifier")
        except Exception as e:
            logger.error(f"Classifier training failed: {e}")

    def predict(self, features: dict) -> dict:
        """
        Returns:
          {"label": "junk"|"user-relevant"|"system-critical",
           "safe_to_delete": bool, "confidence": float, "reason": str}
        """
        # Hard safety pre-filter
        skip, skip_reason = is_hard_skip(features)
        if skip:
            return {
                "label": "system-critical",
                "safe_to_delete": False,
                "confidence": 1.0,
                "reason": skip_reason,
            }

        rule_label, rule_conf = self._rule_classify(features)

        # Fast path: obvious junk (temp extensions or temp patterns in /tmp) needs no heavy ML
        if rule_label == "junk" and rule_conf >= 0.85:
            label = rule_label
            confidence = rule_conf
        elif self._model is not None:
            try:
                vec = np.array([self._features_to_vector(features)], dtype=np.float32)
                proba = self._model.predict_proba(vec)[0]
                label_idx = int(np.argmax(proba))
                ml_confidence = float(np.max(proba))
                label = self.LABELS[label_idx]
                confidence = ml_confidence
            except Exception as e:
                logger.warning(f"ML predict failed: {e} — using rule fallback")
                label, confidence = rule_label, rule_conf
        else:
            label, confidence = rule_label, rule_conf

        safe = label == "junk" and confidence >= 0.6
        reason = self._build_reason(features, label, confidence)

        return {
            "label": label,
            "safe_to_delete": safe,
            "confidence": round(confidence, 3),
            "reason": reason,
        }

    def _rule_classify(self, f: dict) -> tuple[str, float]:
        """Pure rule-based fallback classification."""
        if f.get("is_junk_ext") and f["age_hours"] >= MIN_AGE_HOURS:
            return "junk", 0.95
        if f.get("is_temp_pattern") and f["age_hours"] >= MIN_AGE_HOURS:
            return "junk", 0.92
        if f.get("is_temp_dir") and f["age_hours"] >= MIN_AGE_HOURS and not f.get("is_keep_ext"):
            return "junk", 0.88
        if f["is_empty"] and f["age_hours"] >= MIN_AGE_HOURS:
            return "junk", 0.85
        if f["age_hours"] > 24 and f["access_hours"] > 24 and not f.get("is_keep_ext"):
            return "junk", 0.80
        return "user-relevant", 0.60

    def _build_reason(self, f: dict, label: str, confidence: float) -> str:
        parts = []
        if f.get("is_temp_pattern"):
            parts.append("temp process artifact")
        elif f.get("is_junk_ext"):
            parts.append(f"scratch pattern ({f.get('extension') or 'temp'})")
        if f["is_empty"]:
            parts.append("empty file")
        if f["age_hours"] >= MIN_AGE_HOURS:
            parts.append(f"age {f['age_hours']:.1f}h")
        if f["access_hours"] > 24 * 7:
            parts.append(f"idle {f['access_hours']:.0f}h")
        if not parts:
            parts.append("heuristics match")
        return f"{label.capitalize()}: {', '.join(parts)} (confidence {confidence:.0%})"


# ---------------------------------------------------------------------------
# Singleton Classifier & Scanner
# ---------------------------------------------------------------------------

_SHARED_CLASSIFIER: Optional[TempFileClassifier] = None

def get_classifier() -> TempFileClassifier:
    """Return singleton classifier instance to avoid re-training on every scan."""
    global _SHARED_CLASSIFIER
    if _SHARED_CLASSIFIER is None:
        _SHARED_CLASSIFIER = TempFileClassifier()
    return _SHARED_CLASSIFIER


def scan_and_classify(
    scan_dirs: Optional[list] = None,
    max_files: int = MAX_FILES_PER_SCAN,
) -> dict:
    """
    Scan temp directories, classify each file, return summary + file list.
    Prunes heavy application directories and limits descent depth for sub-second responses.
    """
    if scan_dirs is None:
        scan_dirs = _SCAN_DIRS

    classifier = get_classifier()
    active_pids = _get_active_pids()

    results = {
        "scanned": 0,
        "safe_to_delete": [],
        "skip": [],
        "total_reclaimable_mb": 0.0,
        "scan_dirs": scan_dirs,
        "timestamp": int(time.time() * 1000),
        "errors": [],
    }

    # Directories that should never be descended into (deep app caches or revision control)
    skip_dir_names = {
        "google-chrome", "chromium", "mozilla", "firefox",
        "mesa_shader_cache", "nvidia", "fontconfig", "dconf",
        "systemd", "pulse", "pip", "yarn", "npm", "git",
        "node_modules", ".git", ".cache", "docker"
    }

    seen_roots = set()
    file_count = 0

    for scan_dir in scan_dirs:
        expanded = os.path.expanduser(scan_dir)
        if not os.path.exists(expanded):
            continue

        resolved_root = os.path.realpath(expanded)
        if resolved_root in seen_roots:
            continue
        seen_roots.add(resolved_root)

        try:
            depth_limit = 2
            for root, dirs, files in os.walk(expanded, followlinks=False):
                # Calculate depth relative to scan dir root
                try:
                    rel_parts = Path(root).relative_to(Path(expanded)).parts
                    depth = len(rel_parts)
                except Exception:
                    depth = 0

                if depth >= depth_limit:
                    dirs.clear()
                else:
                    # Prune hidden dirs and deep application caches
                    dirs[:] = [
                        d for d in dirs
                        if d.lower() not in skip_dir_names
                        and not d.startswith(".")
                    ]

                for fname in files:
                    if file_count >= max_files:
                        break
                    fpath = os.path.join(root, fname)
                    try:
                        st = os.lstat(fpath)   # lstat so we don't follow symlinks
                    except (PermissionError, FileNotFoundError):
                        continue

                    features = extract_features(fpath, st, active_pids)
                    prediction = classifier.predict(features)

                    entry = {
                        "path": fpath,
                        "size_kb": features["size_kb"],
                        "age_hours": features["age_hours"],
                        "extension": features["extension"],
                        "label": prediction["label"],
                        "safe_to_delete": prediction["safe_to_delete"],
                        "confidence": prediction["confidence"],
                        "reason": prediction["reason"],
                    }

                    if prediction["safe_to_delete"]:
                        results["safe_to_delete"].append(entry)
                        results["total_reclaimable_mb"] += features["size_kb"] / 1024
                    else:
                        results["skip"].append(entry)

                    results["scanned"] += 1
                    file_count += 1
        except PermissionError as e:
            results["errors"].append(f"Permission denied: {expanded}: {e}")
        except Exception as e:
            results["errors"].append(f"Scan error in {expanded}: {e}")

    results["total_reclaimable_mb"] = round(results["total_reclaimable_mb"], 2)
    logger.info(
        f"Scan complete: {results['scanned']} files scanned, "
        f"{len(results['safe_to_delete'])} safe to delete "
        f"({results['total_reclaimable_mb']} MB reclaimable)"
    )
    return results


if __name__ == "__main__":
    result = scan_and_classify()
    print(json.dumps({
        "scanned": result["scanned"],
        "safe_to_delete_count": len(result["safe_to_delete"]),
        "total_reclaimable_mb": result["total_reclaimable_mb"],
        "sample": result["safe_to_delete"][:3],
    }, indent=2))

