#include "../include/net.h"
#include <cstdio>
#include <cstring>
#include <ctime>

bool readNetStats(NetStats& out) {
    FILE* f = fopen("/proc/net/dev", "r");
    if (!f) return false;
    char line[256];
    out.rxBytes = 0;
    out.txBytes = 0;
    
    if (!fgets(line, sizeof(line), f)) { fclose(f); return false; }
    if (!fgets(line, sizeof(line), f)) { fclose(f); return false; }
    
    while (fgets(line, sizeof(line), f)) {
        char iface[32];
        uint64_t rx_bytes, tx_bytes;
        char* colon = strchr(line, ':');
        if (!colon) continue;
        *colon = ' ';
        if (sscanf(line, "%31s %lu %*u %*u %*u %*u %*u %*u %*u %lu", iface, &rx_bytes, &tx_bytes) == 3) {
            if (strcmp(iface, "lo") != 0) {
                out.rxBytes += rx_bytes;
                out.txBytes += tx_bytes;
            }
        }
    }
    fclose(f);
    
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    out.tsMs = (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
    
    return true;
}

