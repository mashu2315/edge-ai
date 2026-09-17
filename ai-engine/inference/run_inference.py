"""Edge AI Inference Engine — FastAPI service for anomaly detection.
Runs ONNX model with QNN (Snapdragon NPU) or CPU execution provider.
Full offline operation, no cloud calls.
"""
import sys
import time
import uuid
import os
from pathlib import Path
import numpy as np
import onnxruntime as ort
from contextlib import asynccontextmanager
from typing import List, Optional, Tuple, Dict, Any
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Allow imports from ai-engine root (npu/, cleanup/)
_AI_ENGINE_ROOT = Path(__file__).parent.parent
if str(_AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ENGINE_ROOT))

# --- Pydantic Models ---

class SystemMetrics(BaseModel):
    cpuUsage: float
    memoryUsage: float
    memoryTotal: float
    memoryUsed: float
    diskUsage: float
    networkIn: float
    networkOut: float
    uptime: float
    temperature: float
    loadAverage: List[float]  # [1min, 5min, 15min]
    timestamp: int

class LogEntry(BaseModel):
    id: str
    timestamp: int
    level: str  # INFO WARN ERROR DEBUG CRITICAL
    source: str
    message: str
    isAnomaly: Optional[bool] = False

class AnalyzeRequest(BaseModel):
    metrics: SystemMetrics
    recentLogs: List[LogEntry] = []
    metricsHistory: Optional[List[SystemMetrics]] = []  # last 10 readings

class AiInsight(BaseModel):
    id: str
    title: str
    description: str
    rootCause: str
    confidence: float
    severity: str  # low medium high critical
    category: str  # performance security hardware software network
    detectedAt: int
    affectedComponents: List[str]
    recommendedAction: str
    status: str  # active investigating resolved

# --- Global State ---
class AppState:
    session: Optional[ort.InferenceSession] = None
    provider: str = "RuleBasedFallback"
    model_loaded: bool = False
    model_path: str = ""
    inference_count: int = 0
    total_latency_ms: float = 0.0
    start_time: float = time.time()
    npu_fallback: bool = True      # True = CPU fallback, False = NPU active

state = AppState()
categories = ["performance", "security", "hardware", "software", "network"]

# --- ML / Inference Functions ---

def load_model():
    """Load ONNX model with QNN EP priority — INT8 → FP16 → base model."""
    try:
        from npu.qnn_config import PROVIDER_PRIORITY
        providers = PROVIDER_PRIORITY
    except Exception:
        providers = [
            ("QNNExecutionProvider", {"backend_type": "htp", "htp_performance_mode": "burst"}),
            "CPUExecutionProvider",
        ]

    # Model priority: INT8 (smallest/fastest) → FP16 → original FP32
    model_dir = Path(__file__).parent.parent / "models"
    paths_to_try = [
        model_dir / "anomaly_detector_int8.onnx",
        model_dir / "anomaly_detector_fp16.onnx",
        model_dir / "anomaly_detector.onnx",
    ]

    for model_path in paths_to_try:
        if not model_path.exists():
            continue
        try:
            print(f"[ai-engine] Loading model: {model_path.name}...")
            session = ort.InferenceSession(str(model_path), providers=providers)
            state.session = session
            state.model_path = str(model_path)
            state.model_loaded = True

            active_providers = session.get_providers()
            state.provider = active_providers[0] if active_providers else "Unknown"
            state.npu_fallback = (state.provider != "QNNExecutionProvider")

            status = "✅ NPU ACTIVE" if not state.npu_fallback else "⚠️  CPU FALLBACK"
            print(f"[ai-engine] {status} — Provider: {state.provider}  Model: {model_path.name}")

            if state.npu_fallback:
                print("[ai-engine] ⚠️ NPU NOT USED — FALLBACK DETECTED. "
                      "QNNExecutionProvider not loaded. Requires Snapdragon HTP hardware.")
            return
        except Exception as e:
            print(f"[ai-engine] Failed to load {model_path.name}: {e}")

    print("[ai-engine] No ONNX model found — rule-based fallback only.")
    state.provider = "RuleBasedFallback"
    state.model_loaded = False
    state.npu_fallback = True


def extract_features(metrics: SystemMetrics) -> List[float]:
    """Normalize input metrics to [0,1] range and extract feature vector."""
    load1 = metrics.loadAverage[0] if len(metrics.loadAverage) > 0 else 0
    load5 = metrics.loadAverage[1] if len(metrics.loadAverage) > 1 else 0
    
    features = [
        metrics.cpuUsage / 100.0,
        metrics.memoryUsage / 100.0,
        metrics.diskUsage / 100.0,
        min(metrics.networkIn / 1000.0, 1.0),   # rough normalization
        min(metrics.networkOut / 1000.0, 1.0),  # rough normalization
        metrics.temperature / 100.0,
        min(load1 / 8.0, 1.0),                  # normalize assuming 8 cores max load normally
        min(load5 / 8.0, 1.0)
    ]
    return features

def rule_based_insights(metrics: SystemMetrics, logs: List[LogEntry]) -> List[Tuple[str, str, str]]:
    """Augment ONNX output with deterministic rules.
    Returns list of (Title, category, severity).
    """
    issues = []
    if metrics.cpuUsage > 90:
        issues.append(('CPU is maxing out', 'performance', 'high'))
    if metrics.memoryUsage > 85:
        issues.append(('Running out of memory', 'software', 'medium'))
    if metrics.temperature > 85:
        issues.append(('Device is overheating', 'hardware', 'high'))
    if metrics.diskUsage > 90:
        issues.append(('Storage is almost full', 'software', 'critical'))
    
    # Check for anomaly logs
    anomaly_logs = [l for l in logs if l.isAnomaly or l.level in ('CRITICAL', 'ERROR')]
    if len(anomaly_logs) > 3:
        issues.append(('Too many error logs', 'software', 'high'))
    return issues

# --- FastAPI App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    load_model()
    yield
    # Shutdown
    pass

app = FastAPI(title="Edge AI Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": state.model_loaded,
        "provider": state.provider,
        "model_path": state.model_path,
        "inference_count": state.inference_count,
        "uptime_seconds": time.time() - state.start_time,
        "npu_active": not state.npu_fallback,
        "npu_fallback": state.npu_fallback,
    }

@app.get("/metrics")
def get_metrics():
    avg_latency = (state.total_latency_ms / state.inference_count) if state.inference_count > 0 else 0
    return {
        "inference_count": state.inference_count,
        "avg_latency_ms": avg_latency,
        "model_input_shape": "(1, 10, 8)",
        "provider": state.provider
    }

# ---------------------------------------------------------------------------
# NPU Verification Endpoints
# ---------------------------------------------------------------------------

@app.get("/npu/status")
def npu_status():
    """Run full NPU verification suite and return structured status."""
    try:
        from npu.npu_verifier import verify
        result = verify(session=state.session)
        return result
    except Exception as e:
        return {
            "provider": state.provider,
            "device": "CPU" if state.npu_fallback else "NPU",
            "fallback": state.npu_fallback,
            "fallback_reason": str(e) if state.npu_fallback else "",
            "warnings": [f"Verifier error: {e}"],
            "latency_ms": {},
            "checks_passed": [],
            "checks_failed": ["verifier_import"],
            "timestamp": int(time.time() * 1000),
        }

@app.post("/npu/benchmark")
def npu_benchmark():
    """Run a dedicated latency benchmark and return timing statistics."""
    try:
        from npu.npu_verifier import _benchmark, _find_model
        import onnxruntime as ort
        from npu.qnn_config import PROVIDER_PRIORITY, CPU_ONLY_PROVIDERS

        model_path = _find_model()
        if not model_path:
            return {"error": "No model available for benchmark"}

        results = {}

        # Active provider benchmark
        if state.session:
            results["active"] = _benchmark(state.session)
            results["active"]["provider"] = state.provider

        # CPU-only benchmark for comparison
        try:
            cpu_sess = ort.InferenceSession(str(model_path), providers=CPU_ONLY_PROVIDERS)
            results["cpu_only"] = _benchmark(cpu_sess)
            results["cpu_only"]["provider"] = "CPUExecutionProvider"
        except Exception as e:
            results["cpu_only"] = {"error": str(e)}

        if "active" in results and "cpu_only" in results:
            active_mean = results["active"].get("mean", 0)
            cpu_mean = results["cpu_only"].get("mean", 1)
            results["speedup_x"] = round(cpu_mean / active_mean, 2) if active_mean > 0 else None

        results["model"] = str(model_path.name) if model_path else "none"
        results["timestamp"] = int(time.time() * 1000)
        return results

    except Exception as e:
        return {"error": str(e), "timestamp": int(time.time() * 1000)}

@app.post("/npu/optimize")
def npu_optimize(background_tasks: BackgroundTasks):
    """Trigger the model optimization pipeline in the background."""
    def _run_pipeline():
        try:
            from npu.model_optimizer import run_optimization_pipeline
            result = run_optimization_pipeline()
            print(f"[optimizer] Pipeline complete. Best model: {result.get('best_model')}")
            # Reload the best model after optimization
            load_model()
        except Exception as e:
            print(f"[optimizer] Pipeline error: {e}")

    background_tasks.add_task(_run_pipeline)
    return {
        "status": "optimization_started",
        "message": "Model optimization pipeline running in background. Check /health for updated model.",
        "timestamp": int(time.time() * 1000),
    }

# ---------------------------------------------------------------------------
# Cleanup Endpoints
# ---------------------------------------------------------------------------

@app.post("/cleanup/analyze")
def cleanup_analyze():
    """Scan temp directories and return AI classification results."""
    try:
        from cleanup.file_classifier import scan_and_classify
        results = scan_and_classify()
        return results
    except Exception as e:
        return {"error": str(e), "scanned": 0, "safe_to_delete": [], "skip": []}

@app.post("/cleanup/execute")
def cleanup_execute(body: dict):
    """
    Generate a bash cleanup script from approved paths.
    Does NOT execute — returns the script for the Node.js backend to run safely.
    """
    try:
        from cleanup.script_generator import generate_cleanup_script
        approved_paths = body.get("approved_paths", [])
        plan_id = body.get("plan_id", str(uuid.uuid4()))
        dry_run = body.get("dry_run", False)

        if not approved_paths:
            return {"error": "No paths provided in approved_paths"}

        result = generate_cleanup_script(approved_paths, plan_id, dry_run=dry_run)
        return result
    except Exception as e:
        return {"error": str(e)}



def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=-1, keepdims=True)

@app.post("/analyze", response_model=AiInsight)
def analyze_system(request: AnalyzeRequest):
    start_time = time.time()
    
    anomaly_prob = 0.0
    category_idx = 0
    
    # 1. Prepare ML input
    if state.model_loaded and state.session:
        # Build sequence of length 10
        seq = []
        if request.metricsHistory:
            # Take up to last 9 + current
            history = request.metricsHistory[-(10-1):]
            for m in history:
                seq.append(extract_features(m))
        
        # Add current metric
        seq.append(extract_features(request.metrics))
        
        # Pad with zeros if shorter than 10
        while len(seq) < 10:
            seq.insert(0, [0.0] * 8)
            
        input_array = np.array([seq], dtype=np.float32)
        
        # 2. Run Inference
        try:
            outputs = state.session.run(None, {'input': input_array})
            anomaly_prob = float(outputs[0][0][0])
            category_logits = outputs[1][0]
            
            category_probs = softmax(category_logits)
            category_idx = int(np.argmax(category_probs))
        except Exception as e:
            print(f"Inference error: {e}")
            anomaly_prob = 0.0
    
    # 3. Rule-based checks
    rule_issues = rule_based_insights(request.metrics, request.recentLogs)
    
    # 4. Synthesize Results
    confidence = anomaly_prob
    severity = "low"
    category = categories[category_idx]
    title = "System Normal"
    description = "No significant anomalies detected."
    root_cause = "Normal operation"
    action = "No action required."
    affected_components = []
    
    # If ML model flags high anomaly
    if anomaly_prob > 0.7:
        severity = "high"
    elif anomaly_prob > 0.4:
        severity = "medium"
        
    # If rules flag issues, they might override or complement
    if rule_issues:
        top_issue = rule_issues[0] # taking highest priority (first found)
        title = top_issue[0]
        category = top_issue[1]
        
        # Override severity if rule is more critical
        if top_issue[2] == 'critical':
            severity = 'critical'
        elif top_issue[2] == 'high' and severity not in ['critical', 'high']:
            severity = 'high'
        elif top_issue[2] == 'medium' and severity == 'low':
            severity = 'medium'
            
        # Boost confidence based on rules
        confidence = max(anomaly_prob, 0.8 if top_issue[2] == 'high' else 0.6)
    elif anomaly_prob > 0.5:
        title = f"Unusual {category.capitalize()} Pattern"
    
    if severity != "low":
        if category == "performance":
            description = "The system is working unusually hard."
            root_cause = "Too many heavy programs running at once."
            action = "Close unnecessary background apps to free up CPU."
            affected_components = ["CPU", "Memory"]
        elif category == "software":
            description = "A program is consuming too much memory or throwing errors."
            root_cause = "App crashing or hoarding RAM."
            action = "Restart the affected service or clear some storage."
            affected_components = ["AppService"]
        elif category == "hardware":
            description = "The device is getting too hot."
            root_cause = "Overheating limits performance."
            action = "Give the device a break or check cooling."
            affected_components = ["CPU", "Thermal"]
        elif category == "network":
            description = "Unusual network activity detected."
            root_cause = "Spike in incoming or outgoing data."
            action = "Check for unexpected downloads or connections."
            affected_components = ["Network Interface"]
        elif category == "security":
            description = "Suspicious system access detected."
            root_cause = "Possible unauthorized login attempt."
            action = "Review recent login logs and block suspicious IPs."
            affected_components = ["System Security"]
            
    # Track stats
    latency_ms = (time.time() - start_time) * 1000
    state.inference_count += 1
    state.total_latency_ms += latency_ms
    
    return AiInsight(
        id=str(uuid.uuid4()),
        title=title,
        description=description,
        rootCause=root_cause,
        confidence=round(confidence * 100, 1),
        severity=severity,
        category=category,
        detectedAt=int(time.time() * 1000),
        affectedComponents=affected_components,
        recommendedAction=action,
        status="active" if severity != "low" else "resolved"
    )

if __name__ == "__main__":
    import uvicorn
    # Support running from either ai-engine/ or ai-engine/inference/
    cwd_name = os.path.basename(os.getcwd())
    if cwd_name == "inference":
        # python run_inference.py  (from ai-engine/inference/)
        uvicorn.run("run_inference:app", host="0.0.0.0", port=8000, reload=False)
    else:
        # python inference/run_inference.py  (from ai-engine/)
        uvicorn.run("inference.run_inference:app", host="0.0.0.0", port=8000, reload=False)
