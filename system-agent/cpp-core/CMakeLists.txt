cmake_minimum_required(VERSION 3.16)
project(telemetry_daemon CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_compile_options(-O2 -Wall -Wextra)
add_executable(telemetry_daemon 
    src/main.cpp
    src/cpu.cpp
    src/mem.cpp
    src/net.cpp
    src/process.cpp
    src/utils.cpp
)
target_link_libraries(telemetry_daemon PRIVATE pthread)
install(TARGETS telemetry_daemon RUNTIME DESTINATION bin)
