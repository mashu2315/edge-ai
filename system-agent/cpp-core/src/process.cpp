#include "../include/process.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dirent.h>
#include <unistd.h>
#include <pwd.h>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <cstdint>

struct ProcessInfo {
    int pid;
    char name[64];
    double cpu;
    double memory;
    char status[16];
    char user[32];
    int threads;
    uint64_t timeTotal;
};

// Store previous timeTotal per PID to calculate real CPU%
std::unordered_map<int, uint64_t> g_prevProcTime;

void initProcessTracker() {
    g_prevProcTime.clear();
}

void readProcesses(char* buf, size_t& len, size_t maxLen, double systemUptime) {
    DIR* dir = opendir("/proc");
    if (!dir) { len = 0; return; }
    struct dirent* ent;
    std::vector<ProcessInfo> procs;
    procs.reserve(512);
    
    long hertz = sysconf(_SC_CLK_TCK);
    long page_size = sysconf(_SC_PAGESIZE);
    
    // Get total system memory for percentage calculation
    uint64_t memTotalBytes = 1; // prevent div by zero
    FILE* f_mem = fopen("/proc/meminfo", "r");
    if (f_mem) {
        char line[256];
        while (fgets(line, sizeof(line), f_mem)) {
            uint64_t mt;
            if (sscanf(line, "MemTotal: %lu kB", &mt) == 1) {
                memTotalBytes = mt * 1024;
                break;
            }
        }
        fclose(f_mem);
    }
    
    std::unordered_map<int, uint64_t> currProcTime;

    while ((ent = readdir(dir)) != nullptr) {
        if (ent->d_type != DT_DIR) continue;
        int pid = atoi(ent->d_name);
        if (pid <= 0) continue;
        
        ProcessInfo pi{};
        pi.pid = pid;
        
        char path[256];
        snprintf(path, sizeof(path), "/proc/%d/stat", pid);
        FILE* f = fopen(path, "r");
        if (!f) continue;
        
        char statBuf[1024];
        if (!fgets(statBuf, sizeof(statBuf), f)) { fclose(f); continue; }
        fclose(f);
        
        char comm[256] = {0};
        char state = 'S';
        int ppid, pgrp, session, tty_nr, tpgid;
        unsigned int flags;
        unsigned long minflt, cminflt, majflt, cmajflt, utime = 0, stime = 0;
        long cutime, cstime, priority, nice, num_threads = 0, itrealvalue;
        unsigned long long starttime;
        unsigned long vsize = 0;
        long rss = 0;
        
        sscanf(statBuf, "%d (%255[^)]) %c", &pid, comm, &state);
        snprintf(pi.name, sizeof(pi.name), "%s", comm);
        
        char* s = strrchr(statBuf, ')');
        if (s && *(s+1) == ' ') {
            sscanf(s+2, "%c %d %d %d %d %d %u %lu %lu %lu %lu %lu %lu %ld %ld %ld %ld %ld %ld %llu %lu %ld",
                   &state, &ppid, &pgrp, &session, &tty_nr, &tpgid, &flags, &minflt, &cminflt, &majflt, &cmajflt,
                   &utime, &stime, &cutime, &cstime, &priority, &nice, &num_threads, &itrealvalue, &starttime,
                   &vsize, &rss);
        }
        
        pi.threads = num_threads;
        pi.timeTotal = utime + stime;
        currProcTime[pid] = pi.timeTotal;

        // Memory percentage
        uint64_t rssBytes = rss * page_size;
        pi.memory = (double)rssBytes / memTotalBytes * 100.0;
        
        // CPU% calculation
        // Calculate the difference in ticks since the last time we read this process
        pi.cpu = 0.0;
        if (g_prevProcTime.find(pid) != g_prevProcTime.end()) {
            uint64_t prev = g_prevProcTime[pid];
            uint64_t diff = pi.timeTotal - prev;
            // CPU usage over 1 second (our loop delay)
            // Usage % = (diff / HZ) / 1_second * 100
            pi.cpu = (double)diff / hertz * 100.0;
        }
        
        switch (state) {
            case 'R': strcpy(pi.status, "RUNNING"); break;
            case 'S': 
            case 'D': strcpy(pi.status, "SLEEPING"); break;
            case 'T': strcpy(pi.status, "STOPPED"); break;
            case 'Z': strcpy(pi.status, "ZOMBIE"); break;
            default: strcpy(pi.status, "SLEEPING"); break;
        }
        
        snprintf(path, sizeof(path), "/proc/%d/status", pid);
        f = fopen(path, "r");
        int uid = -1;
        if (f) {
            char line[256];
            while (fgets(line, sizeof(line), f)) {
                if (strncmp(line, "Uid:", 4) == 0) {
                    sscanf(line, "Uid:\t%d", &uid);
                    break;
                }
            }
            fclose(f);
        }
        
        strcpy(pi.user, "unknown");
        if (uid >= 0) {
            struct passwd pwd;
            struct passwd *result;
            char pwbuf[1024];
            if (getpwuid_r(uid, &pwd, pwbuf, sizeof(pwbuf), &result) == 0 && result != nullptr) {
                strncpy(pi.user, pwd.pw_name, sizeof(pi.user)-1);
            } else {
                snprintf(pi.user, sizeof(pi.user), "%d", uid);
            }
        }
        
        procs.push_back(pi);
    }
    closedir(dir);
    
    // Sort processes by current CPU% descending, then memory descending
    std::sort(procs.begin(), procs.end(), [](const ProcessInfo& a, const ProcessInfo& b) {
        if (a.cpu != b.cpu) return a.cpu > b.cpu;
        return a.memory > b.memory;
    });
    
    // Convert memory to percentage (assume ~16GB or something similar to the host's actual memory if we wanted, 
    // but the original code passed pi.memory. Let's fix that memory is actually % instead of GB, or leave it as it was if frontend handles it).
    // The previous code did: pi.memory = (rss * page_size) / 1024.0 / 1024.0 / 1024.0;
    
    size_t count = std::min(procs.size(), (size_t)20);
    len = 0;
    len += snprintf(buf + len, maxLen - len, "[\n");
    for (size_t i = 0; i < count; i++) {
        const auto& p = procs[i];
        len += snprintf(buf + len, maxLen - len,
            "    {\"pid\": %d, \"name\": \"%s\", \"cpu\": %.1f, \"memory\": %.2f, \"status\": \"%s\", \"user\": \"%s\", \"threads\": %d}%s\n",
            p.pid, p.name, p.cpu, p.memory, p.status, p.user, p.threads, (i == count - 1) ? "" : ",");
    }
    len += snprintf(buf + len, maxLen - len, "  ]");
    
    // Update tracking
    g_prevProcTime = currProcTime;
}
