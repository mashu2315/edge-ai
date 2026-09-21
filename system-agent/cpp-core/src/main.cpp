#include "../include/cpu.h"
#include "../include/mem.h"
#include "../include/net.h"
#include "../include/process.h"
#include "../include/utils.h"

#include <cstdio>
#include <atomic>
#include <csignal>
#include <ctime>
#include <string>
#include <cstdlib>

std::atomic<bool> g_running{true};

void sigHandler(int) { g_running.store(false); }

void buildJson(char* out, size_t maxOut, double cpu, double memUsed, double memTotal, double memPct, 
               double disk, double netIn, double netOut, uint64_t uptime, double temp, 
               double l1, double l5, double l15, const char* procs) {
    snprintf(out, maxOut,
        "{\n"
        "  \"cpuUsage\": %.1f,\n"
        "  \"memoryUsage\": %.1f,\n"
        "  \"memoryTotal\": %.2f,\n"
        "  \"memoryUsed\": %.2f,\n"
        "  \"diskUsage\": %.1f,\n"
        "  \"networkIn\": %.2f,\n"
        "  \"networkOut\": %.2f,\n"
        "  \"uptime\": %llu,\n"
        "  \"temperature\": %.1f,\n"
        "  \"loadAverage\": [%.2f, %.2f, %.2f],\n"
        "  \"timestamp\": %llu,\n"
        "  \"processes\": %s\n"
        "}\n",
        cpu, memPct, memTotal, memUsed, disk, netIn, netOut, (unsigned long long)uptime, temp,
        l1, l5, l15, (unsigned long long)getCurrentTimestamp(), procs);
}

int main(int argc, char* argv[]) {
    if (argc > 1 && std::string(argv[1]) == "run") {
        if (argc >= 4 && std::string(argv[2]) == "--model") {
            std::string modelPath = argv[3];
            std::string cmd = "./scripts/run_pipeline.sh " + modelPath;
            printf("Running pipeline for %s...\n", modelPath.c_str());
            return system(cmd.c_str());
        } else {
            printf("Usage: %s run --model <path>\n", argv[0]);
            return 1;
        }
    }

    signal(SIGTERM, sigHandler);
    signal(SIGINT, sigHandler);
    
    CpuTimes cpuTimes;
    NetStats netStats;
    CpuTimes g_prevCpu{};
    bool g_firstCpu = true;
    NetStats g_prevNet{};
    bool g_firstNet = true;
    
    initProcessTracker();

    while (g_running.load()) {
        double cpuUsage = 0.0;
        if (readCpuTimes(cpuTimes)) {
            if (!g_firstCpu) {
                cpuUsage = calcCpuUsage(g_prevCpu, cpuTimes);
            }
            g_prevCpu = cpuTimes;
            g_firstCpu = false;
        }
        
        double memTotal = 0, memUsed = 0, memPct = 0;
        readMemInfo(memTotal, memUsed, memPct);
        
        double l1 = 0, l5 = 0, l15 = 0;
        readLoadAvg(l1, l5, l15);
        
        double diskUsage = 0;
        readDiskUsage("/", diskUsage);
        
        double temp = readTemperature();
        
        double netIn = 0.0, netOut = 0.0;
        if (readNetStats(netStats)) {
            if (!g_firstNet) {
                double dt = (netStats.tsMs - g_prevNet.tsMs) / 1000.0;
                if (dt > 0) {
                    netIn = (netStats.rxBytes - g_prevNet.rxBytes) / 1024.0 / 1024.0 / dt;
                    netOut = (netStats.txBytes - g_prevNet.txBytes) / 1024.0 / 1024.0 / dt;
                }
            }
            g_prevNet = netStats;
            g_firstNet = false;
        }
        
        uint64_t uptime = uptimeSeconds();
        
        char procsBuf[8192];
        size_t procsLen = 0;
        readProcesses(procsBuf, procsLen, sizeof(procsBuf), uptime);
        
        char jsonBuf[16384];
        buildJson(jsonBuf, sizeof(jsonBuf), cpuUsage, memUsed, memTotal, memPct, diskUsage, netIn, netOut, uptime, temp, l1, l5, l15, procsBuf);
        
        printf("%s", jsonBuf);
        fflush(stdout);
        
        struct timespec ts;
        ts.tv_sec = 1;
        ts.tv_nsec = 0;
        nanosleep(&ts, nullptr);
    }
    
    return 0;
}

