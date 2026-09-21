#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <model.pt>"
  exit 1
fi

MODEL_PATH=$1
BASE_DIR=$(dirname "$0")/..
AI_MODULE="$BASE_DIR/ai-engine/ai_module"
OUTPUT_DIR="$BASE_DIR/output"

mkdir -p "$OUTPUT_DIR"

ONNX_MODEL="$OUTPUT_DIR/model.onnx"
QUANT_MODEL="$OUTPUT_DIR/model_quantized.onnx"
BEFORE_JSON="$OUTPUT_DIR/before.json"
AFTER_JSON="$OUTPUT_DIR/after.json"
FINAL_JSON="$OUTPUT_DIR/final_report.json"

echo "============================================="
echo " Snapdragon NPU Auto Optimization Pipeline"
echo "============================================="

echo "[1/5] Converting Model to ONNX..."
python3 "$AI_MODULE/convert_to_onnx.py" "$MODEL_PATH" "$ONNX_MODEL"

echo "[2/5] Checking NPU Compatibility (Original)..."
python3 "$AI_MODULE/check_npu.py" "$ONNX_MODEL" "$BEFORE_JSON"

echo "[3/5] Quantizing Model (INT8)..."
python3 "$AI_MODULE/quantize.py" "$ONNX_MODEL" "$QUANT_MODEL"

echo "[4/5] Checking NPU Compatibility (Quantized)..."
python3 "$AI_MODULE/check_npu.py" "$QUANT_MODEL" "$AFTER_JSON"

echo "[5/5] Generating Final Report..."
python3 "$AI_MODULE/compare.py" "$BEFORE_JSON" "$AFTER_JSON" "$FINAL_JSON"

echo "============================================="
echo " Pipeline Complete!"
echo " Report saved to: $FINAL_JSON"
echo "============================================="

