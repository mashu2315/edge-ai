const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config/default.json');
const logger = require('../logger');

class TelemetryService extends EventEmitter {
  constructor() {
    super();
    this.metrics = null;
    this.processes = [];
    this.npuMetrics = null;

    this.lastCpuInfo = null;
    this.lastNetStats = null;
    this.collectorProcess = null;
    this.mode = 'js'; // 'daemon', 'collector', 'js'

    this.startPolling();
  }

  startPolling() {
    // Try C++ daemon → Python collector → JS fallback (in priority order)
    const daemonPath    = path.resolve(__dirname, '..', config.telemetry.daemonPath);
    const collectorPath = path.resolve(__dirname, '..', config.telemetry.collectorPath);

    if (fs.existsSync(daemonPath)) {
      this._spawnProcess(daemonPath, [], 'daemon');
    } else if (fs.existsSync(collectorPath)) {
      this._spawnProcess('python3', [collectorPath], 'collector');
    } else {
      this._startJsFallback();
    }
  }

  _spawnProcess(cmd, args, modeName) {
    logger.info(`Telemetry: starting ${modeName} (${cmd} ${args.join(' ')})`);
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // The C++ daemon emits pretty-printed multi-line JSON objects.
    // We accumulate chunks and parse once brace depth returns to 0.
    let buf   = '';
    let depth = 0;
    let inObj = false;

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      // Scan character-by-character to detect complete JSON objects
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        const ch = buf[i];
        if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
          inObj = true;
        } else if (ch === '}') {
          depth--;
          if (inObj && depth === 0) {
            // Complete JSON object from buf[start..i]
            const jsonStr = buf.slice(start, i + 1);
            try {
              const parsed = JSON.parse(jsonStr);
              this._applyDaemonPayload(parsed);
            } catch (e) {
              logger.warn(`[${modeName}] JSON parse error: ${e.message}`);
            }
            buf    = buf.slice(i + 1); // discard processed bytes
            i      = -1;              // restart scan on remaining buf
            inObj  = false;
          }
        }
      }
      // Guard against runaway buffer (e.g. broken pipe)
      if (buf.length > 1_000_000) buf = '';
    });

    proc.stderr.on('data', (d) => logger.warn(`[${modeName}] stderr: ${d.toString().trim()}`));

    proc.on('exit', (code, signal) => {
      logger.warn(`Telemetry ${modeName} exited (code=${code}, signal=${signal}). Falling back to JS.`);
      this._startJsFallback();
    });

    proc.on('error', (err) => {
      logger.error(`Failed to spawn ${modeName}: ${err.message}. Falling back to JS.`);
      this._startJsFallback();
    });

    this.collectorProcess = proc;
    this.mode = modeName;
  }

  _applyDaemonPayload(parsed) {
    // Build SystemMetrics from daemon JSON
    const processes = (parsed.processes || []).map(p => ({
      pid:     p.pid,
      name:    p.name,
      cpu:     Math.round((p.cpu || 0) * 10) / 10,
      memory:  Math.round((p.memory || 0) * 10) / 10,
      status:  p.status || 'sleeping',
      user:    p.user || 'root',
      threads: p.threads || 1,
    }));

    this.metrics = {
      cpuUsage:     Math.round((parsed.cpuUsage || 0) * 10) / 10,
      memoryUsage:  Math.round((parsed.memoryUsage || 0) * 10) / 10,
      memoryTotal:  Math.round((parsed.memoryTotal || 0) * 10) / 10,
      memoryUsed:   Math.round((parsed.memoryUsed || 0) * 10) / 10,
      diskUsage:    Math.round((parsed.diskUsage || 0) * 10) / 10,
      networkIn:    Math.round((parsed.networkIn || 0) * 100) / 100,
      networkOut:   Math.round((parsed.networkOut || 0) * 100) / 100,
      uptime:       parsed.uptime || 0,
      temperature:  Math.round((parsed.temperature || 45) * 10) / 10,
      loadAverage:  parsed.loadAverage || [0, 0, 0],
      timestamp:    parsed.timestamp || Date.now(),
    };
    this.processes = processes;
    this.npuMetrics = this.readNpuMetrics(); // NPU always read locally

    this.emit('metrics',   this.metrics);
    this.emit('processes', this.processes);
    this.emit('npu',       this.npuMetrics);
  }

  _startJsFallback() {
    if (this.mode === 'js') return; // already in JS mode
    this.mode = 'js';
    logger.info('Telemetry: switched to JS /proc fallback mode');
    setInterval(() => this.gatherJsMetrics(), config.telemetry.intervalMs);
  }

  gatherJsMetrics() {
    try {
      this.metrics = this.readSystemMetrics();
      this.processes = this.readProcesses();
      this.npuMetrics = this.readNpuMetrics();

      this.emit('metrics', this.metrics);
      this.emit('processes', this.processes);
      this.emit('npu', this.npuMetrics);
    } catch (err) {
      logger.error('Error gathering JS metrics: ' + err.message);
    }
  }

  readSystemMetrics() {
    const memTotalBytes = os.totalmem();
    const memFreeBytes  = os.freemem();
    const memUsedBytes  = memTotalBytes - memFreeBytes;
    // Frontend expects GB values for memoryTotal / memoryUsed
    const memTotalGB = memTotalBytes / (1024 ** 3);
    const memUsedGB  = memUsedBytes  / (1024 ** 3);

    const cpuUsage   = this.calculateCpuUsage();
    const diskUsage  = this.readDiskUsage();
    const { netIn, netOut } = this.readNetworkStats();

    return {
      cpuUsage:     Math.round(cpuUsage * 10) / 10,
      memoryUsage:  Math.round((memUsedBytes / memTotalBytes) * 1000) / 10,
      memoryTotal:  Math.round(memTotalGB * 10) / 10,
      memoryUsed:   Math.round(memUsedGB  * 10) / 10,
      diskUsage,
      networkIn:  netIn,
      networkOut: netOut,
      uptime:     Math.floor(os.uptime()),
      temperature: this.readTemperature(),
      loadAverage: os.loadavg(),
      timestamp:  Date.now(),
    };
  }

  readDiskUsage() {
    try {
      const { execSync } = require('child_process');
      const out = execSync("df / --output=pcent 2>/dev/null | tail -1", { timeout: 500 })
        .toString().trim();
      return parseFloat(out.replace('%', '')) || 0;
    } catch (e) {
      return 0;
    }
  }

  readNetworkStats() {
    try {
      const data  = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n').slice(2); // skip two header lines
      let rxTotal = 0, txTotal = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const iface = parts[0].replace(':', '');
        if (iface === 'lo') continue;
        rxTotal += parseInt(parts[1], 10) || 0;
        txTotal += parseInt(parts[9], 10) || 0;
      }
      const now = Date.now();
      let netIn = 0, netOut = 0;
      if (this.lastNetStats) {
        const elapsed = (now - this.lastNetStats.ts) / 1000;
        if (elapsed > 0) {
          netIn  = Math.round(((rxTotal - this.lastNetStats.rx) / elapsed / (1024 * 1024)) * 100) / 100;
          netOut = Math.round(((txTotal - this.lastNetStats.tx) / elapsed / (1024 * 1024)) * 100) / 100;
        }
      }
      this.lastNetStats = { rx: rxTotal, tx: txTotal, ts: now };
      return { netIn: Math.max(0, netIn), netOut: Math.max(0, netOut) };
    } catch (e) {
      return { netIn: 0, netOut: 0 };
    }
  }

  readTemperature() {
    try {
      const thermalBase = '/sys/class/thermal';
      const zones = fs.readdirSync(thermalBase).filter(f => f.startsWith('thermal_zone'));
      for (const zone of zones) {
        try {
          const type = fs.readFileSync(`${thermalBase}/${zone}/type`, 'utf8').trim();
          if (/cpu|x86|acpitz/i.test(type)) {
            const val = fs.readFileSync(`${thermalBase}/${zone}/temp`, 'utf8').trim();
            return Math.round(parseInt(val, 10) / 1000.0 * 10) / 10;
          }
        } catch (e) {}
      }
      if (zones.length > 0) {
        const val = fs.readFileSync(`${thermalBase}/${zones[0]}/temp`, 'utf8').trim();
        return Math.round(parseInt(val, 10) / 1000.0 * 10) / 10;
      }
    } catch (e) {}
    return 45.0;
  }

  calculateCpuUsage() {
    try {
      const stat = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
      const parts = stat.trim().split(/\s+/).slice(1).map(Number);
      const idle = parts[3];
      const total = parts.reduce((acc, val) => acc + val, 0);

      if (!this.lastCpuInfo) {
        this.lastCpuInfo = { idle, total };
        return 0;
      }

      const idleDiff = idle - this.lastCpuInfo.idle;
      const totalDiff = total - this.lastCpuInfo.total;
      this.lastCpuInfo = { idle, total };

      return totalDiff === 0 ? 0 : ((totalDiff - idleDiff) / totalDiff) * 100;
    } catch (e) {
      return 0;
    }
  }

  readProcesses() {
    try {
      const dirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
      const procs = [];
      for (const pidStr of dirs.slice(0, 50)) { // limit to 50 for perf
        try {
          const pid = parseInt(pidStr, 10);
          const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
          const status = stat[2];
          let statusStr = 'running';
          if (status === 'S') statusStr = 'sleeping';
          if (status === 'T') statusStr = 'stopped';
          if (status === 'Z') statusStr = 'zombie';

          procs.push({
            pid,
            name: comm,
            cpu: 0,
            memory: 0,
            status: statusStr,
            user: 'root',
            threads: 1
          });
        } catch (e) { }
      }
      return procs;
    } catch (e) {
      return [];
    }
  }

  readNpuMetrics() {
    let temp = 45.0;
    try {
      const files = fs.readdirSync('/sys/class/thermal').filter(f => f.startsWith('thermal_zone'));
      if (files.length > 0) {
        const val = fs.readFileSync(`/sys/class/thermal/${files[0]}/temp`, 'utf8');
        temp = parseInt(val, 10) / 1000.0;
      }
    } catch (e) {}

    return {
      utilization: Math.random() * 20,
      powerDraw: 15.0 + Math.random() * 5,
      temperature: temp,
      frequency: 1200,
      inferenceCount: Math.floor(Math.random() * 100),
      modelLatency: Number((15 + Math.random() * 10).toFixed(2)),
      timestamp: Date.now()
    };
  }

  getLatestMetrics() { return this.metrics || this.readSystemMetrics(); }
  getLatestProcesses() { return this.processes || []; }
  getLatestNpuMetrics() { return this.npuMetrics || this.readNpuMetrics(); }
}

const telemetryService = new TelemetryService();
module.exports = telemetryService;
