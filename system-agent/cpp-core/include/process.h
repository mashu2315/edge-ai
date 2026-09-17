#pragma once
#include <cstddef>
void readProcesses(char* buf, size_t& len, size_t maxLen, double systemUptime);
void initProcessTracker();
