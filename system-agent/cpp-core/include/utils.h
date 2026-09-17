#pragma once
#include <cstdint>

bool readLoadAvg(double& l1, double& l5, double& l15);
bool readDiskUsage(const char* path, double& usagePercent);
double readTemperature();
uint64_t uptimeSeconds();
uint64_t getCurrentTimestamp();

