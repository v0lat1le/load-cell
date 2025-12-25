#pragma once

#include <array>


struct WiFiSettings {
    
    std::array<char, 32> ap_ssid = {};
    std::array<char, 32> ap_pass = {};

    std::array<char, 32> st_ssid = {};
    std::array<char, 32> st_pass = {};

    std::array<unsigned char, 6> st_bssid = {};
    uint8_t st_channel = 0;
    uint8_t power = 0;
};

bool wifi_start_access_point(WiFiSettings& settings);
bool wifi_start_station(WiFiSettings& settings);
