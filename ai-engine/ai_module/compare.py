import sys
import json
import os

def generate_report(before_json, after_json, final_json):
    print("[INFO] Generating Comparison Report...")
    
    try:
        with open(before_json, 'r') as f:
            before = json.load(f)
        with open(after_json, 'r') as f:
            after = json.load(f)
    except Exception as e:
        print(f"[ERROR] Could not load JSON reports: {e}")
        sys.exit(1)
        
    latency_improvement = before["latency_ms"] - after["latency_ms"]
    latency_pct = (latency_improvement / before["latency_ms"]) * 100 if before["latency_ms"] > 0 else 0
    
    report = {
        "original_model": {
            "execution_provider": before.get("execution_provider", "CPU"),
            "latency_ms": before.get("latency_ms", 0),
            "is_npu_compatible": before.get("is_npu_compatible", False)
        },
        "optimized_model": {
            "execution_provider": after.get("execution_provider", "QNN"),
            "latency_ms": after.get("latency_ms", 0),
            "is_npu_compatible": after.get("is_npu_compatible", True),
            "quantization": "INT8"
        },
        "metrics": {
            "latency_reduction_pct": round(latency_pct, 2),
            "power_savings_w": round(before.get("power_draw_w", 0) - after.get("power_draw_w", 0), 2)
        },
        "recommendation": "Optimization successful. Deploy INT8 model to Snapdragon NPU." if latency_improvement > 0 else "Optimization did not improve latency. Re-evaluate model architecture."
    }
    
    with open(final_json, 'w') as f:
        json.dump(report, f, indent=4)
        
    print(f"[INFO] Final Report Generated: {final_json}")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python compare.py <before.json> <after.json> <final_report.json>")
        sys.exit(1)
    generate_report(sys.argv[1], sys.argv[2], sys.argv[3])

