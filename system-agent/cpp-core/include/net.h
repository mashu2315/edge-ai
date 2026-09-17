#pragma once
#include <cstdint>
struct NetStats { uint64_t rxBytes, txBytes; uint64_t tsMs; };
bool readNetStats(NetStats& out);

