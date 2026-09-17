#pragma once
#include <cstdint>

struct CpuTimes { uint64_t user, nice, system, idle, iowait, irq, softirq, steal; };

bool readCpuTimes(CpuTimes& out);
double calcCpuUsage(const CpuTimes& prev, const CpuTimes& cur);

