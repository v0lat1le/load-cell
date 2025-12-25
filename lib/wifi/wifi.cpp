#include <ESP8266WiFi.h>
#include "wifi.h"


namespace {
    bool wifi_wait_connect(uint32_t duration) {
        const auto timeout = millis() + duration;
        while ((WiFi.status() != WL_CONNECTED) && (millis()<timeout)) {
            delay(10);
        }
        return (WiFi.status() == WL_CONNECTED);
    }

    int wifi_slow_connect(const WiFiSettings& settings) {
        WiFi.begin(settings.st_ssid.data(), settings.st_pass.data());
        return wifi_wait_connect(30000);
    }

    int wifi_fast_connect(const WiFiSettings& settings) {
        WiFi.begin(settings.st_ssid.data(), settings.st_pass.data(), settings.st_channel, settings.st_bssid.data());
        return wifi_wait_connect(5000);
    }

}

bool wifi_start_access_point(WiFiSettings& settings) {
    if (strnlen(settings.ap_ssid.data(), settings.ap_ssid.size()) == 0) {
        return false;
    }
    WiFi.setOutputPower(settings.power*0.25f);
    return WiFi.softAPConfig(IPAddress({192, 168, 1, 254}), IPAddress(), IPAddress({255, 255, 255, 0}))
        && WiFi.softAP(settings.ap_ssid.data(), settings.ap_pass.data());
}

bool wifi_start_station(WiFiSettings& settings) {
    if (!settings.st_ssid[0]) {
        return false;
    }
    WiFi.setOutputPower(settings.power*0.25f);
    
    if (wifi_fast_connect(settings)) {
        return true;
    }
    if (wifi_slow_connect(settings)) {
        memcpy(settings.st_bssid.data(), WiFi.BSSID(), 6);
        settings.st_channel = WiFi.channel();
        return true;
    }
    return false;
}
