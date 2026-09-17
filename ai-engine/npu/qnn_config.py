"""
qnn_config.py — Centralized QNN Execution Provider configuration.

Priority order:
  1. QNNExecutionProvider (Snapdragon Hexagon HTP backend)
  2. CPUExecutionProvider  (transparent fallback — emits warning)
"""
from __future__ import annotations
import os

# ---------------------------------------------------------------------------
# QNN EP options — tuned for Snapdragon HTP (Hexagon Tensor Processor)
# ---------------------------------------------------------------------------
QNN_PROVIDER_OPTIONS: dict = {
    # Use the Hexagon Tensor Processor backend
    "backend_type": "htp",
    # Burst mode: maximum NPU clock for lowest latency
    "htp_performance_mode": "burst",
    # Disable profiling by default; set env var to enable
    "profiling_level": os.environ.get("QNN_PROFILING", "off"),
    # Graph optimisation level (0=none, 1=basic, 2=extended, 3=all)
    "optimization_level": "3",
    # Enable HTP graph serialisation so compiled graphs are cached
    "enable_htp_fp16_precision": "1",
    # Context priority for multi-session setups
    "context_priority": "high",
}

# Full provider list passed to ort.InferenceSession
PROVIDER_PRIORITY: list = [
    ("QNNExecutionProvider", QNN_PROVIDER_OPTIONS),
    "CPUExecutionProvider",
]

# Provider list used for CPU-only benchmark comparisons
CPU_ONLY_PROVIDERS: list = ["CPUExecutionProvider"]

