#pragma once

#include <string_view>
#include <Print.h>


inline auto stream_write_sv(Print& print, std::string_view data) {
    return print.write(data.data(), data.length());
}

std::string_view to_sv_tmp(int val);
