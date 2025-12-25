#include <array>
#include <charconv>
#include "utils.h"


std::string_view to_sv_tmp(int val) {
    static std::array<char, 8> buffer;
    auto result = std::to_chars(buffer.begin(), buffer.end(), val);
    return std::string_view(buffer.data(), result.ptr-buffer.data());
}
