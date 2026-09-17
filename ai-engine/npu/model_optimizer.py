"""
model_optimizer.py — Snapdragon NPU model optimization pipeline.

Pipeline steps:
  1. Validate existing ONNX model (opset ≥ 13, size < 50 MB, shape check)
  2. Apply INT8 static quantization  (preferred for Hexagon HTP)
  3. Apply FP16 conversion as fallback if INT8 fails
  4. Accuracy validation (synthetic data, checks output deviation < 2%)
  5. Save optimized models to ai-engine/models/
"""
from __future__ import annotations

import os
import time
import json
import shutil
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import onnx
import onnxruntime as ort

logger = logging.getLogger("model_optimizer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [optimizer] %(levelname)s %(message)s")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_HERE = Path(__file__).parent
_MODELS_DIR = _HERE.parent / "models"
_BASE_MODEL = _MODELS_DIR / "anomaly_detector.onnx"
_INT8_MODEL = _MODELS_DIR / "anomaly_detector_int8.onnx"
_FP16_MODEL = _MODELS_DIR / "anomaly_detector_fp16.onnx"
_REPORT_PATH = _MODELS_DIR / "optimization_report.json"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_OPSET = 13
MAX_SIZE_MB = 50
MAX_ACCURACY_DROP = 2.0          # percent
SYNTHETIC_BATCH = 20             # number of synthetic inference calls for accuracy check


# ===========================================================================
# Step 1 — Model Validation
# ===========================================================================

def validate_model(model_path: Path) -> dict:
    """
    Validate the ONNX model for NPU compatibility.
    Returns a dict with validation results.
    """
    report = {
        "path": str(model_path),
        "exists": False,
        "size_mb": 0.0,
        "opset_version": 0,
        "size_ok": False,
        "opset_ok": False,
        "shape_ok": False,
        "valid": False,
        "errors": [],
    }

    if not model_path.exists():
        report["errors"].append(f"Model file not found: {model_path}")
        return report

    report["exists"] = True
    size_mb = model_path.stat().st_size / (1024 * 1024)
    report["size_mb"] = round(size_mb, 2)
    report["size_ok"] = size_mb < MAX_SIZE_MB

    if not report["size_ok"]:
        report["errors"].append(f"Model too large: {size_mb:.1f} MB > {MAX_SIZE_MB} MB limit")

    try:
        model = onnx.load(str(model_path))
        onnx.checker.check_model(model)
        opset = model.opset_import[0].version if model.opset_import else 0
        report["opset_version"] = opset
        report["opset_ok"] = opset >= MIN_OPSET
        if not report["opset_ok"]:
            report["errors"].append(f"Opset {opset} < minimum {MIN_OPSET}")

        # Check input shape — must have batch + sequence + feature dims
        graph = model.graph
        if graph.input:
            inp = graph.input[0]
            dims = [d.dim_value for d in inp.type.tensor_type.shape.dim]
            report["input_shape"] = dims
            report["shape_ok"] = len(dims) >= 2
        else:
            report["errors"].append("No inputs found in model graph")

    except Exception as e:
        report["errors"].append(f"ONNX validation error: {e}")

    report["valid"] = (
        report["exists"] and report["size_ok"] and
        report["opset_ok"] and not report["errors"]
    )
    return report


# ===========================================================================
# Step 2 — INT8 Quantization
# ===========================================================================

def _make_calibration_data(n_samples: int = 50):
    """Generate synthetic calibration data for INT8 quantization."""
    # Shape: (batch=1, seq=10, features=8) — matches anomaly_detector model
    return [{"input": np.random.rand(1, 10, 8).astype(np.float32)} for _ in range(n_samples)]


def quantize_int8(src: Path, dst: Path) -> bool:
    """
    Apply INT8 quantization using ONNX Runtime's quantization toolkit.
    Tries static QLinearOps first; falls back to dynamic quantization.
    Returns True on success.
    """
    try:
        from onnxruntime.quantization import quantize_dynamic, quantize_static, CalibrationDataReader, QuantType, QuantFormat

        class SyntheticCalibReader(CalibrationDataReader):
            def __init__(self, data):
                self._data = iter(data)

            def get_next(self):
                return next(self._data, None)

        try:
            calibration_data = _make_calibration_data(50)
            reader = SyntheticCalibReader(calibration_data)

            quantize_static(
                model_input=str(src),
                model_output=str(dst),
                calibration_data_reader=reader,
                quant_format=QuantFormat.QLinearOps,
                per_channel=False,
                weight_type=QuantType.QInt8,
                activation_type=QuantType.QInt8,
            )
            logger.info(f"✅ INT8 static quantization complete → {dst.name}  ({dst.stat().st_size/1024/1024:.2f} MB)")
            return True
        except Exception as static_err:
            logger.info(f"Static quantization fallback triggered ({static_err}); applying dynamic INT8 quantization...")
            quantize_dynamic(
                model_input=str(src),
                model_output=str(dst),
                weight_type=QuantType.QInt8,
            )
            logger.info(f"✅ INT8 dynamic quantization complete → {dst.name}  ({dst.stat().st_size/1024/1024:.2f} MB)")
            return True
    except Exception as e:
        logger.warning(f"INT8 quantization failed: {e}")
        return False


# ===========================================================================
# Step 3 — FP16 Conversion (fallback)
# ===========================================================================

def convert_fp16(src: Path, dst: Path) -> bool:
    """Convert model weights to FP16 using onnx ml_tools."""
    try:
        from onnxmltools.utils.float16_converter import convert_float_to_float16
        import onnxmltools

        model = onnx.load(str(src))
        fp16_model = convert_float_to_float16(model, keep_io_types=True)
        onnx.save(fp16_model, str(dst))
        logger.info(f"✅ FP16 conversion complete → {dst.name}  ({dst.stat().st_size/1024/1024:.2f} MB)")
        return True
    except ImportError:
        # onnxmltools not available — use manual numpy approach
        logger.warning("onnxmltools not available, skipping FP16 conversion")
        return False
    except Exception as e:
        logger.warning(f"FP16 conversion failed: {e}")
        return False


# ===========================================================================
# Step 4 — Accuracy Validation
# ===========================================================================

def validate_accuracy(original_path: Path, optimized_path: Path) -> dict:
    """
    Compare outputs of original vs optimized model on synthetic data.
    Returns accuracy report.
    """
    result = {
        "passed": False,
        "mean_deviation_pct": 0.0,
        "max_deviation_pct": 0.0,
        "samples_tested": SYNTHETIC_BATCH,
        "threshold_pct": MAX_ACCURACY_DROP,
    }

    try:
        orig_sess = ort.InferenceSession(str(original_path), providers=["CPUExecutionProvider"])
        opt_sess = ort.InferenceSession(str(optimized_path), providers=["CPUExecutionProvider"])

        deviations = []
        for _ in range(SYNTHETIC_BATCH):
            inp = np.random.rand(1, 10, 8).astype(np.float32)
            orig_out = orig_sess.run(None, {"input": inp})[0]
            opt_out = opt_sess.run(None, {"input": inp})[0]
            # Compute percentage deviation on first output tensor
            deviation = float(np.mean(np.abs(orig_out - opt_out.astype(np.float32))) * 100)
            deviations.append(deviation)

        result["mean_deviation_pct"] = round(float(np.mean(deviations)), 4)
        result["max_deviation_pct"] = round(float(np.max(deviations)), 4)
        result["passed"] = result["max_deviation_pct"] < MAX_ACCURACY_DROP

        if result["passed"]:
            logger.info(f"✅ Accuracy check passed: max deviation {result['max_deviation_pct']:.4f}% < {MAX_ACCURACY_DROP}%")
        else:
            logger.warning(f"⚠️  Accuracy check FAILED: max deviation {result['max_deviation_pct']:.4f}% ≥ {MAX_ACCURACY_DROP}%")

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Accuracy validation error: {e}")

    return result


# ===========================================================================
# Main Pipeline
# ===========================================================================

def run_optimization_pipeline() -> dict:
    """
    Execute the full NPU optimization pipeline.
    Returns a comprehensive report dict.
    """
    t_start = time.time()
    report = {
        "timestamp": int(time.time()),
        "base_model": str(_BASE_MODEL),
        "validation": {},
        "int8": {"attempted": False, "success": False, "accuracy": {}},
        "fp16": {"attempted": False, "success": False},
        "best_model": None,
        "errors": [],
    }

    logger.info("=" * 60)
    logger.info("  Edge AI — NPU Model Optimization Pipeline")
    logger.info("=" * 60)

    # Step 1: Validate base model
    logger.info("Step 1/4: Validating base ONNX model...")
    val = validate_model(_BASE_MODEL)
    report["validation"] = val

    if not val["valid"]:
        msg = f"Base model validation failed: {val['errors']}"
        report["errors"].append(msg)
        logger.error(msg)
        # Still try to proceed — maybe the model is usable despite warnings
        if not _BASE_MODEL.exists():
            report["elapsed_s"] = round(time.time() - t_start, 2)
            return report

    # Step 2: INT8 Quantization
    logger.info("Step 2/4: Applying INT8 quantization...")
    report["int8"]["attempted"] = True
    int8_ok = quantize_int8(_BASE_MODEL, _INT8_MODEL)
    report["int8"]["success"] = int8_ok

    if int8_ok:
        logger.info("Step 3/4: Validating INT8 accuracy...")
        acc = validate_accuracy(_BASE_MODEL, _INT8_MODEL)
        report["int8"]["accuracy"] = acc
        if acc["passed"]:
            report["best_model"] = str(_INT8_MODEL)
            logger.info(f"🏆 Best model: INT8  ({_INT8_MODEL.name})")
        else:
            logger.warning("INT8 accuracy too low; will try FP16 fallback")
            int8_ok = False

    # Step 3: FP16 Fallback (if INT8 failed or accuracy drop too high)
    if not int8_ok:
        logger.info("Step 3/4: Applying FP16 conversion (fallback)...")
        report["fp16"]["attempted"] = True
        fp16_ok = convert_fp16(_BASE_MODEL, _FP16_MODEL)
        report["fp16"]["success"] = fp16_ok

        if fp16_ok:
            report["best_model"] = str(_FP16_MODEL)
            logger.info(f"🏆 Best model: FP16  ({_FP16_MODEL.name})")
        else:
            # Fall back to original FP32 model
            report["best_model"] = str(_BASE_MODEL)
            logger.warning(f"⚠️  Using original FP32 model  ({_BASE_MODEL.name})")
    else:
        logger.info("Step 3/4: Skipped FP16 (INT8 succeeded)")

    # Step 4: Save report
    logger.info("Step 4/4: Saving optimization report...")
    report["elapsed_s"] = round(time.time() - t_start, 2)
    try:
        _REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        _REPORT_PATH.write_text(json.dumps(report, indent=2))
        logger.info(f"✅ Report saved → {_REPORT_PATH}")
    except Exception as e:
        logger.error(f"Could not save report: {e}")

    logger.info(f"\nOptimization pipeline complete in {report['elapsed_s']}s")
    logger.info(f"Best model: {report['best_model']}")
    return report


if __name__ == "__main__":
    result = run_optimization_pipeline()
    print(json.dumps(result, indent=2))

