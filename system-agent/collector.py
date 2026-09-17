#!/usr/bin/env python3
"""Python telemetry collector — fallback when C++ daemon is not compiled.
Outputs one JSON line per second to stdout.
"""
import json
import time
import sys
import os
import signal
import psutil
from datetime import datetime

running = True

def sig_handler(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, sig_handler)
signal.signal(signal.SIGINT, sig_handler)

prev_net = None
prev_net_time = 0

def get_net_speed():
    global prev_net, prev_net_time
    try:
        net = psutil.net_io_counters()
        now = time.time()
        if prev_net is None:
            prev_net = net
            prev_net_time = now
            return 0.0, 0.0
        
        dt = now - prev_net_time
        if dt <= 0:
            return 0.0, 0.0
            
        rx_mb = (net.bytes_recv - prev_net.bytes_recv) / (1024 * 1024 * dt)
        tx_mb = (net.bytes_sent - prev_net.bytes_sent) / (1024 * 1024 * dt)
        
        prev_net = net
        prev_net_time = now
        return rx_mb, tx_mb
    except:
        return 0.0, 0.0

def get_temp():
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return 0.0
        for name in ['coretemp', 'cpu_thermal']:
            if name in temps and len(temps[name]) > 0:
                return temps[name][0].current
        # fallback
        return list(temps.values())[0][0].current
    except:
        return 0.0

def main():
    global running
    
    # Initialize CPU diff
    psutil.cpu_percent(interval=None)
    
    while running:
        start_t = time.time()
        
        data = {}
        try:
            data['cpuUsage'] = psutil.cpu_percent(interval=None)
        except:
            data['cpuUsage'] = 0.0
            
        try:
            mem = psutil.virtual_memory()
            data['memoryTotal'] = mem.total / (1024**3)
            data['memoryUsed'] = (mem.total - mem.available) / (1024**3)
            data['memoryUsage'] = mem.percent
        except:
            data['memoryTotal'] = 0.0
            data['memoryUsed'] = 0.0
            data['memoryUsage'] = 0.0
            
        try:
            disk = psutil.disk_usage('/')
            data['diskUsage'] = disk.percent
        except:
            data['diskUsage'] = 0.0
            
        rx, tx = get_net_speed()
        data['networkIn'] = rx
        data['networkOut'] = tx
        
        try:
            data['uptime'] = int(time.time() - psutil.boot_time())
        except:
            data['uptime'] = 0
            
        data['temperature'] = get_temp()
        
        try:
            data['loadAverage'] = list(os.getloadavg())
        except:
            data['loadAverage'] = [0.0, 0.0, 0.0]
            
        data['timestamp'] = int(time.time() * 1000)
        
        try:
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status', 'username', 'num_threads']):
                try:
                    info = p.info
                    status = info['status']
                    mapped_status = 'sleeping'
                    if status in ['running', 'sleeping', 'stopped', 'zombie']:
                        mapped_status = status
                    
                    mem_gb = 0.0
                    if info['memory_percent'] is not None and 'memoryTotal' in data:
                        mem_gb = (info['memory_percent'] / 100.0) * data['memoryTotal']
                        
                    procs.append({
                        'pid': info['pid'],
                        'name': info['name'] or '',
                        'cpu': info['cpu_percent'] or 0.0,
                        'memory': mem_gb,
                        'status': mapped_status,
                        'user': info['username'] or '',
                        'threads': info['num_threads'] or 0
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
            
            procs.sort(key=lambda x: x['cpu'], reverse=True)
            data['processes'] = procs[:20]
        except:
            data['processes'] = []
            
        print(json.dumps(data))
        sys.stdout.flush()
        
        elapsed = time.time() - start_t
        sleep_time = max(0, 1.0 - elapsed)
        time.sleep(sleep_time)

if __name__ == '__main__':
    main()
