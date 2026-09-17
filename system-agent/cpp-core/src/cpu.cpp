#include "../include/cpu.h"
#include <cstdio>

bool readCpuTimes(CpuTimes& out) {
    FILE* f = fopen("/proc/stat", "r");
    if (!f) return false;
    char line[256];
    if (fgets(line, sizeof(line), f)) {
        if (sscanf(line, "cpu  %lu %lu %lu %lu %lu %lu %lu %lu",
                   &out.user, &out.nice, &out.system, &out.idle,
                   &out.iowait, &out.irq, &out.softirq, &out.steal) < 8) {
            fclose(f);
            return false;
        }
    }
    fclose(f);
    return true;
}

double calcCpuUsage(const CpuTimes& prev, const CpuTimes& cur) {
    uint64_t prevIdle = prev.idle + prev.iowait;
    uint64_t curIdle = cur.idle + cur.iowait;

    uint64_t prevNonIdle = prev.user + prev.nice + prev.system + prev.irq + prev.softirq + prev.steal;
    uint64_t curNonIdle = cur.user + cur.nice + cur.system + cur.irq + cur.softirq + cur.steal;

    uint64_t prevTotal = prevIdle + prevNonIdle;
    uint64_t curTotal = curIdle + curNonIdle;

    uint64_t totald = curTotal - prevTotal;
    uint64_t idled = curIdle - prevIdle;

    if (totald == 0) return 0.0;
    return (100.0 * (totald - idled)) / totald;
}

