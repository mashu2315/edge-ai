#include "../include/utils.h"
#include <cstdio>
#include <sys/statvfs.h>
#include <chrono>

bool readLoadAvg(double& l1, double& l5, double& l15) {
    FILE* f = fopen("/proc/loadavg", "r");
    if (!f) return false;
    bool ok = (fscanf(f, "%lf %lf %lf", &l1, &l5, &l15) == 3);
    fclose(f);
    return ok;
}

bool readDiskUsage(const char* path, double& usagePercent) {
    struct statvfs stat;
    if (statvfs(path, &stat) != 0) return false;
    uint64_t total = stat.f_blocks * stat.f_frsize;
    uint64_t free = stat.f_bfree * stat.f_frsize;
    if (total == 0) return false;
    uint64_t used = total - free;
    usagePercent = (used * 100.0) / total;
    return true;
}

double readTemperature() {
    FILE* f = fopen("/sys/class/thermal/thermal_zone0/temp", "r");
    if (!f) return 0.0;
    long temp = 0;
    bool ok = (fscanf(f, "%ld", &temp) == 1);
    fclose(f);
    if (!ok) return 0.0;
    return temp / 1000.0;
}

uint64_t uptimeSeconds() {
    FILE* f = fopen("/proc/uptime", "r");
    if (!f) return 0;
    double uptime = 0.0;
    bool ok = (fscanf(f, "%lf", &uptime) == 1);
    fclose(f);
    if (!ok) return 0;
    return (uint64_t)uptime;
}

uint64_t getCurrentTimestamp() {
    return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

