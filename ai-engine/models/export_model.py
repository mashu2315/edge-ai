"""Export and quantize the anomaly detector model.

Usage:
  python export_model.py [--quantize] [--output models/]
"""

import argparse
import os
import torch
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType

# Import the model from the current directory (when run in models/ directory)
# or parent if run from root
try:
    from anomaly_model import create_dummy_model
except ImportError:
    from models.anomaly_model import create_dummy_model

def export_model(output_dir, apply_quantization):
    # Ensure output dir exists
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Create model
    model = create_dummy_model()
    
    # 2. Export to ONNX
    onnx_path = os.path.join(output_dir, "anomaly_detector.onnx")
    
    # Dummy input: batch_size=1, seq_len=10, features=8
    dummy_input = torch.randn(1, 10, 8)
    
    torch.onnx.export(
        model, 
        dummy_input, 
        onnx_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['anomaly_prob', 'category_logits'],
        dynamic_axes={
            'input': {0: 'batch_size'},
            'anomaly_prob': {0: 'batch_size'},
            'category_logits': {0: 'batch_size'}
        },
        dynamo=False
    )
    print(f"Exported ONNX model to {onnx_path}")
    
    # 3. Verify ONNX model
    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    print("ONNX model verified successfully.")
    
    # 4. Print model info
    input_names = [i.name for i in onnx_model.graph.input]
    output_names = [o.name for o in onnx_model.graph.output]
    size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f"Model Info: Inputs: {input_names}, Outputs: {output_names}, Size: {size_mb:.2f} MB")
    
    # 5. Quantize if requested
    if apply_quantization:
        quant_path = os.path.join(output_dir, "anomaly_detector_quantized.onnx")
        quantize_dynamic(
            model_input=onnx_path,
            model_output=quant_path,
            weight_type=QuantType.QUInt8
        )
        print(f"Exported Quantized ONNX model to {quant_path}")
        q_size_mb = os.path.getsize(quant_path) / (1024 * 1024)
        print(f"Quantized Model Size: {q_size_mb:.2f} MB")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export and quantize anomaly model.")
    parser.add_argument("--quantize", action="store_true", help="Apply INT8 dynamic quantization")
    # Default output is always the models/ directory where this script lives
    _default_out = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument("--output", type=str, default=_default_out, help="Output directory")

    args = parser.parse_args()

    export_model(args.output, args.quantize)
