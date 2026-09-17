#include "../include/mem.h"
#include <cstdio>
#include <cstring>
#include <cstdint>

bool readMemInfo(double& totalGB, double& usedGB, double& usagePercent) {
    FILE* f = fopen("/proc/meminfo", "r");
    if (!f) return false;
    char line[256];
    uint64_t memTotal = 0, memFree = 0, memAvailable = 0, buffers = 0, cached = 0;
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "MemTotal:", 9) == 0) sscanf(line, "MemTotal: %lu kB", &memTotal);
        else if (strncmp(line, "MemFree:", 8) == 0) sscanf(line, "MemFree: %lu kB", &memFree);
        else if (strncmp(line, "MemAvailable:", 13) == 0) sscanf(line, "MemAvailable: %lu kB", &memAvailable);
        else if (strncmp(line, "Buffers:", 8) == 0) sscanf(line, "Buffers: %lu kB", &buffers);
        else if (strncmp(line, "Cached:", 7) == 0) sscanf(line, "Cached: %lu kB", &cached);
    }
    fclose(f);
    
    if (memTotal == 0) return false;
    
    uint64_t used = 0;
    if (memAvailable > 0) {
        used = memTotal - memAvailable;
    } else {
        used = memTotal - memFree - buffers - cached;
    }
    
    totalGB = memTotal / 1024.0 / 1024.0;
    usedGB = used / 1024.0 / 1024.0;
    usagePercent = (used * 100.0) / memTotal;
    return true;
}

