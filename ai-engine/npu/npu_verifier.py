"""
npu_verifier.py — NPU Usage Verification System.

Performs 5 verification checks:
  1. Execution provider check — confirms QNNExecutionProvider is active
  2. Profiling check         — node-level execution device attribution
  3. Latency benchmark       — 10 iterations, mean + p95 latency
  4. CPU vs QNN comparison   — quantifies speedup
  5. Fallback detection      — emits warning if CPU is the active device

Returns structured NpuStatus JSON:
{
  "provider": "QNNExecutionProvider" | "CPUExecutionProvider",
  "device": "NPU" | "CPU",
  "latency_ms": { "mean": ..., "p50": ..., "p95": ..., "min": ..., "max": ... },
  "cpu_latency_ms": { ... },
  "speedup_x": ...,
  "power_proxy": { "temp_c": ..., "zone": ... },
  "fallback": true | false,
  "fallback_reason": "...",
  "warnings": [...],
  "checks_passed": [...],
  "checks_failed": [...],
}
"""
from __future__ import annotations

import os
import time
import json
import glob
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import onnxruntime as ort

from .qnn_config import PROVIDER_PRIORITY, CPU_ONLY_PROVIDERS

logger = logging.getLogger("npu_verifier")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_MODELS_DIR = Path(__file__).parent.parent / "models"

# Priority order for model selection
_MODEL_CANDIDATES = [
    _MODELS_DIR / "anomaly_detector_int8.onnx",
    _MODELS_DIR / "anomaly_detector_fp16.onnx",
    _MODELS_DIR / "anomaly_detector.onnx",
]

BENCHMARK_ITERATIONS = 20
WARMUP_ITERATIONS = 3


# ===========================================================================
# Helpers
# ===========================================================================

def _find_model() -> Optional[Path]:
    for p in _MODEL_CANDIDATES:
        if p.exists():
            return p
    return None


def _make_input() -> dict:
    """Create synthetic input matching model shape (1, 10, 8)."""
    return {"input": np.random.rand(1, 10, 8).astype(np.float32)}


def _benchmark(session: ort.InferenceSession, iterations: int = BENCHMARK_ITERATIONS) -> dict:
    """Run inference benchmark and return latency statistics in ms."""
    # Warm up
    for _ in range(WARMUP_ITERATIONS):
        session.run(None, _make_input())

    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        session.run(None, _make_input())
        latencies.append((time.perf_counter() - t0) * 1000)

    latencies_arr = np.array(latencies)
    return {
        "mean": round(float(np.mean(latencies_arr)), 3),
        "min": round(float(np.min(latencies_arr)), 3),
        "max": round(float(np.max(latencies_arr)), 3),
        "p50": round(float(np.percentile(latencies_arr, 50)), 3),
        "p95": round(float(np.percentile(latencies_arr, 95)), 3),
        "iterations": iterations,
    }


def _read_thermal() -> dict:
    """Read thermal zone temperature as a power proxy."""
    zones = sorted(glob.glob("/sys/class/thermal/thermal_zone*/temp"))
    best = {"temp_c": None, "zone": None}
    for zone_path in zones:
        try:
            with open(zone_path) as f:
                temp_c = int(f.read().strip()) / 1000
            zone_name = zone_path.split("/")[-2]
            best = {"temp_c": round(temp_c, 1), "zone": zone_name}
            break  # use first readable zone
        except Exception:
            continue
    return best


# ===========================================================================
# Main verification
# ===========================================================================

def verify(session: Optional[ort.InferenceSession] = None) -> dict:
    """
    Run the full NPU verification suite.
    Pass an existing session, or leave None to create a fresh one.
    """
    status = {
        "provider": "Unknown",
        "device": "Unknown",
        "model_path": None,
        "latency_ms": {},
        "cpu_latency_ms": {},
        "speedup_x": None,
        "power_proxy": {},
        "fallback": True,
        "fallback_reason": "",
        "warnings": [],
        "checks_passed": [],
        "checks_failed": [],
        "timestamp": int(time.time() * 1000),
    }

    model_path = _find_model()
    if not model_path:
        msg = "No ONNX model found — cannot perform NPU verification"
        status["warnings"].append(msg)
        status["fallback_reason"] = msg
        logger.warning(msg)
        return status

    status["model_path"] = str(model_path)

    # ------------------------------------------------------------------
    # CHECK 1: Create session with QNN provider priority
    # ------------------------------------------------------------------
    active_session = session
    if active_session is None:
        try:
            active_session = ort.InferenceSession(str(model_path), providers=PROVIDER_PRIORITY)
        except Exception as e:
            logger.warning(f"QNN session creation failed: {e} — falling back to CPU")
            try:
                active_session = ort.InferenceSession(str(model_path), providers=CPU_ONLY_PROVIDERS)
            except Exception as e2:
                status["fallback_reason"] = f"Session creation failed: {e2}"
                status["checks_failed"].append("session_creation")
                return status

    active_providers = active_session.get_providers()
    first_provider = active_providers[0] if active_providers else "Unknown"
    status["provider"] = first_provider

    if first_provider == "QNNExecutionProvider":
        status["device"] = "NPU"
        status["fallback"] = False
        status["checks_passed"].append("provider_check")
        logger.info("✅ CHECK 1 PASSED: QNNExecutionProvider is active (NPU in use)")
    else:
        status["device"] = "CPU"
        status["fallback"] = True
        status["fallback_reason"] = (
            f"Active provider is {first_provider!r} — QNN not loaded. "
            "This host may not have a Snapdragon HTP (requires Snapdragon SoC with DSP)."
        )
        status["checks_failed"].append("provider_check")
        status["warnings"].append(
            f"⚠️ NPU NOT USED — FALLBACK DETECTED. Provider: {first_provider}"
        )
        logger.warning(f"⚠️ CHECK 1 FAILED: {status['fallback_reason']}")

    # ------------------------------------------------------------------
    # CHECK 2: Node-level profiling (only if QNN is available)
    # ------------------------------------------------------------------
    if not status["fallback"]:
        try:
            # Enable profiling on a temporary session
            sess_opts = ort.SessionOptions()
            sess_opts.enable_profiling = True
            prof_sess = ort.InferenceSession(
                str(model_path), sess_options=sess_opts, providers=PROVIDER_PRIORITY
            )
            prof_sess.run(None, _make_input())
            prof_file = prof_sess.end_profiling()

            with open(prof_file) as f:
                events = json.load(f)

            npu_nodes = [e for e in events if "QNN" in str(e.get("args", {}).get("provider", ""))]
            total_nodes = len([e for e in events if e.get("cat") == "Node"])

            status["profiling"] = {
                "npu_nodes": len(npu_nodes),
                "total_nodes": total_nodes,
                "npu_coverage_pct": round(len(npu_nodes) / max(total_nodes, 1) * 100, 1),
            }
            status["checks_passed"].append("profiling_check")
            logger.info(
                f"✅ CHECK 2 PASSED: {len(npu_nodes)}/{total_nodes} nodes running on NPU "
                f"({status['profiling']['npu_coverage_pct']}%)"
            )

            # Clean up profiling file
            try:
                os.remove(prof_file)
            except Exception:
                pass

        except Exception as e:
            status["warnings"].append(f"Profiling check skipped: {e}")
            logger.warning(f"CHECK 2 SKIPPED: profiling error: {e}")
    else:
        status["warnings"].append("Profiling check skipped — QNN not active")

    # ------------------------------------------------------------------
    # CHECK 3: Latency benchmark (QNN/CPU session)
    # ------------------------------------------------------------------
    try:
        logger.info(f"Running latency benchmark ({BENCHMARK_ITERATIONS} iterations)...")
        latency = _benchmark(active_session)
        status["latency_ms"] = latency
        status["checks_passed"].append("latency_benchmark")
        logger.info(
            f"✅ CHECK 3 PASSED: mean={latency['mean']}ms  p95={latency['p95']}ms  "
            f"min={latency['min']}ms  max={latency['max']}ms"
        )
    except Exception as e:
        status["checks_failed"].append("latency_benchmark")
        status["warnings"].append(f"Latency benchmark failed: {e}")
        logger.warning(f"CHECK 3 FAILED: {e}")

    # ------------------------------------------------------------------
    # CHECK 4: CPU-only latency comparison
    # ------------------------------------------------------------------
    try:
        cpu_sess = ort.InferenceSession(str(model_path), providers=CPU_ONLY_PROVIDERS)
        cpu_latency = _benchmark(cpu_sess)
        status["cpu_latency_ms"] = cpu_latency

        if status["latency_ms"].get("mean") and cpu_latency.get("mean"):
            speedup = round(cpu_latency["mean"] / status["latency_ms"]["mean"], 2)
            status["speedup_x"] = speedup
            if not status["fallback"] and speedup > 1.0:
                logger.info(f"✅ CHECK 4 PASSED: NPU {speedup}x faster than CPU")
                status["checks_passed"].append("latency_comparison")
            elif status["fallback"]:
                logger.info(f"ℹ️  CHECK 4: CPU-only mode, speedup N/A (both sessions use CPU)")
                status["checks_passed"].append("latency_comparison")
            else:
                status["warnings"].append(
                    f"NPU not faster than CPU (speedup={speedup}x) — check HTP config"
                )
                status["checks_failed"].append("latency_comparison")
    except Exception as e:
        status["warnings"].append(f"CPU comparison failed: {e}")
        logger.warning(f"CHECK 4 SKIPPED: {e}")

    # ------------------------------------------------------------------
    # CHECK 5: Power / thermal proxy
    # ------------------------------------------------------------------
    thermal = _read_thermal()
    status["power_proxy"] = thermal
    if thermal["temp_c"] is not None:
        status["checks_passed"].append("thermal_read")
        logger.info(f"✅ CHECK 5 PASSED: {thermal['zone']} = {thermal['temp_c']}°C")
    else:
        status["warnings"].append("Thermal zone not readable (non-Snapdragon host?)")
        logger.warning("CHECK 5 SKIPPED: no readable thermal zone")

    # ------------------------------------------------------------------
    # Final summary
    # ------------------------------------------------------------------
    total_checks = len(status["checks_passed"]) + len(status["checks_failed"])
    passed = len(status["checks_passed"])
    logger.info(f"\n{'='*50}")
    logger.info(f"  NPU Verification: {passed}/{total_checks} checks passed")
    logger.info(f"  Device: {status['device']}  Provider: {status['provider']}")
    if status["fallback"]:
        logger.warning(f"  ⚠️ NPU NOT USED — FALLBACK DETECTED")
        logger.warning(f"  Reason: {status['fallback_reason']}")
    else:
        logger.info(f"  ✅ NPU CONFIRMED ACTIVE")
    logger.info(f"{'='*50}\n")

    return status


if __name__ == "__main__":
    result = verify()
    print(json.dumps(result, indent=2))

