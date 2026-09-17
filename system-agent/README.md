# Edge AI Telemetry Daemon and Collector

This directory contains the telemetry agent for the Edge AI platform. It includes a highly efficient C++ daemon and a Python fallback collector. Both emit system metrics in a unified JSON format.

## 1. C++ Telemetry Daemon (Recommended)

The C++ daemon is optimized for `<1%` CPU usage by avoiding dynamic memory allocation in the hot path and leveraging fixed-size buffers.

### How to Compile

```bash
cd cpp-core
mkdir build
cd build
cmake ..
make
```

### How to Run

```bash
./telemetry_daemon
```

## 2. Python Fallback Collector

If the C++ daemon cannot be compiled for a target architecture, you can use the Python fallback collector.

### Requirements

```bash
pip install psutil
```

### How to Run

```bash
chmod +x collector.py
./collector.py
```

## 3. Output Format Description

Both collectors output exactly one single-line JSON object per second to `stdout`, terminated by a newline.

Example:
```json
{
  "cpuUsage": 34.5,
  "memoryUsage": 67.2,
  "memoryTotal": 16.0,
  "memoryUsed": 10.8,
  "diskUsage": 55.3,
  "networkIn": 2.5,
  "networkOut": 0.8,
  "uptime": 86400,
  "temperature": 65.0,
  "loadAverage": [1.23, 1.10, 0.95],
  "timestamp": 1694000000000,
  "processes": [
    {
      "pid": 1234,
      "name": "chrome",
      "cpu": 12.3,
      "memory": 4.5,
      "status": "running",
      "user": "user",
      "threads": 8
    }
  ]
}
```

## 4. Integration with Node.js Backend

The Node.js backend can integrate with this agent by spawning it as a child process and parsing its `stdout`.

```javascript
const { spawn } = require('child_process');
const readline = require('readline');

// Prefer C++ daemon, fallback to Python
const telemetryAgent = spawn('./cpp-core/build/telemetry_daemon');

const rl = readline.createInterface({
  input: telemetryAgent.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const metrics = JSON.parse(line);
    // Process the metrics (e.g., broadcast via WebSocket)
    console.log(metrics);
  } catch (err) {
    console.error('Failed to parse telemetry JSON:', err);
  }
});
```
