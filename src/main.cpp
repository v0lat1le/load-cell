#include <string_view>
#include <charconv>
#include <span>

#include <WiFiClient.h>
#include <WiFiServer.h>
#include <HX711.h>
#include <EEPROM.h>
#include <Updater.h>

#include "utils.h"
#include "wifi.h"
#include "http.h"


using namespace std::literals;


struct Settings {
    std::uint16_t magic = 0xb00b;
    std::uint16_t version = 2;
    std::uint32_t checksum = 0;
    WiFiSettings wifi;
};
Settings settings;

WiFiServer server(80);
std::array<WiFiClient, 8> requests;
std::array<WiFiClient, 8> load_clients;
WiFiClient update;

HX711 load_cell;
std::array<int16_t, 8> buffer;
std::size_t buffer_filled = 0;

ADC_MODE(ADC_VCC);

template<size_t Size>
bool settings_set(std::array<char, Size>& setting, std::string_view value) {
    if (value.length()+1 >= Size) {
        return false;
    }
    value.copy(setting.data(), value.length());
    setting[value.length()] = '\0';
    return true;
}

bool save_settings(const Settings& settings) {
    if (memcmp(EEPROM.getConstDataPtr(), &settings, sizeof(Settings)) == 0) {
        return false;
    }
    memcpy(EEPROM.getDataPtr(), &settings, sizeof(Settings));
    return EEPROM.commit();
}

void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("Serial OK");

    Serial.printf("Voltage: %1.2f\r\n", ESP.getVcc()/1000.f);
    
    EEPROM.begin(sizeof(settings));
    Serial.println("EEPROM OK");

    settings = *reinterpret_cast<const Settings*>(EEPROM.getConstDataPtr());
    if (settings.magic == Settings{}.magic && settings.version == Settings{}.version) {
        Serial.println("Settings OK");
    } else {
        settings = Settings{};
        settings.wifi.power = 24;  // x 0.25dB
        settings_set(settings.wifi.ap_ssid, "load-cell"sv);
        Serial.println("Settings RST");
    }

    server.begin();
    Serial.println("Server OK");
    
    load_cell.begin(5, 4, 32);
    load_cell.power_up();
    Serial.println("Load Cell OK");
    
    auto wifi_start = millis();
    if (wifi_start_station(settings.wifi) || wifi_start_access_point(settings.wifi)) {
        Serial.print("WiFi OK - ");
        Serial.print(millis() - wifi_start);
        Serial.println(" ms");
    } else {
        Serial.println("WiFi FAIL");
    }

    save_settings(settings);
}

void cycle_client(WiFiClient& client, std::span<WiFiClient> clients) {
    for (auto& slot: clients) {
        if (slot.status() == CLOSED) {
            std::swap(slot, client);
            break;
        }  // TODO: no slots available (use find_first?)
    }
}

void handle_new_connections() {
    WiFiClient client = server.accept();
    if (!client) {
        return;
    }
    Serial.println("Client connected!");
    cycle_client(client, requests);
}

size_t consume_available(Stream& client) {
    auto consumed = size_t{};
    while (client.peekAvailable()) {
        consumed += client.peekAvailable();
        client.peekConsume(client.peekAvailable());
    }
    return consumed;
}

void beginUpdate(WiFiClient& client, std::size_t size) {
    if (Update.isRunning()) {
        std::string_view headers[] = {"Content-Length: 0\r\n"sv};
        http_write_response_header(client, "503 Service Unavailable"sv, headers);    
        client.flush();
        return;
    }
    Update.begin(size, U_FLASH);
    std::swap(client, update);
}

void endUpdate() {
    auto success = Update.end();

    if (!success) {
        std::string_view headers[] = {"Content-Length: 0\r\n"sv};
        http_write_response_header(update, "503 Internal Server Error"sv, headers);
    } else {
        http_write_response_header(update, "204 No Content"sv, {});
    }        
    update.flush();
    cycle_client(update, requests);

    if (!success) {
        Serial.println(Update.getErrorString());
        return;
    }
    ESP.restart();
}

void handle_root(WiFiClient& client, HttpRequest&) {
    consume_available(client);
    http_respond_redirect(client, "/index.html"sv);
    client.flush();
}

void serve_load_data(WiFiClient &client, HttpRequest&) {
    consume_available(client);
    std::string_view headers[] = {"Content-Type: application/octet-stream\r\n"sv,
                                  "Access-Control-Allow-Origin: *\r\n"sv,
                                  "Connection: close\r\n"sv};
    http_write_response_header(client, "200 OK"sv, headers);
    client.setNoDelay(true);
    client.flush();
    cycle_client(client, load_clients);
}

void serve_settings(WiFiClient& client, HttpRequest&) {
    consume_available(client);
    auto len = strlen(settings.wifi.st_ssid.data()) + strlen(settings.wifi.st_pass.data()) + strlen(settings.wifi.ap_ssid.data()) + strlen(settings.wifi.ap_pass.data()) + 2 + 38 + 5 + 4;
    std::string_view headers[] = {"Content-Type: application/x-www-form-urlencoded\r\n"sv,
                                  "Content-Length: "sv, to_sv_tmp(len), "\r\n"sv};
    http_write_response_header(client, "200 OK"sv, headers);
    client.flush();
    stream_write_sv(client, "st_ssid"sv);
    client.write('=');
    client.write(settings.wifi.st_ssid.data());
    client.write('&');
    stream_write_sv(client, "st_pass"sv);
    client.write('=');
    client.write(settings.wifi.st_pass.data());
    client.write('&');
    stream_write_sv(client, "ap_ssid"sv);
    client.write('=');
    client.write(settings.wifi.ap_ssid.data());
    client.write('&');
    stream_write_sv(client, "ap_pass"sv);
    client.write('=');
    client.write(settings.wifi.ap_pass.data());
    client.write('&');
    stream_write_sv(client, "wifi_power"sv);
    client.write('=');
    stream_write_sv(client, to_sv_tmp(settings.wifi.power));
    client.flush();
}

void handle_settings(WiFiClient& client, HttpRequest& request) {
    if (request.body.empty()) {
        client.peekConsume(client.peekAvailable());
        request.body = {client.peekBuffer(), client.peekAvailable()};
    }
    for(const auto& [key, value]: http_parse_form_data(request.body)) {
        if (key == "st_ssid"sv) {
            settings_set(settings.wifi.st_ssid, value);
        } else if (key == "st_pass"sv) {
            settings_set(settings.wifi.st_pass, value);
        } else if (key == "ap_ssid"sv) {
            settings_set(settings.wifi.ap_ssid, value);
        } else if (key == "ap_pass"sv) {
            settings_set(settings.wifi.ap_pass, value);
        } else if (key == "wifi_power"sv) {
            std::from_chars(value.begin(), value.end(), settings.wifi.power);
        }
    }
    bool updated = save_settings(settings);
    consume_available(client);
    http_write_response_header(client, updated ? "204 No Content"sv : "304 Not Modified"sv, {});
    client.flush();
}

void serve_system_info(WiFiClient& client, HttpRequest&) {
    consume_available(client);
    auto len = 10+3+8+3+2+1;
    std::string_view headers[] = {"Content-Type: application/x-www-form-urlencoded\r\n"sv,
                                  "Content-Length: "sv, to_sv_tmp(len), "\r\n"sv};
    http_write_response_header(client, "200 OK"sv, headers);
    client.flush();
    stream_write_sv(client, "fw_version"sv);
    client.write('=');
    stream_write_sv(client, "0.9"sv);
    client.write('&');
    stream_write_sv(client, "chip_vcc"sv);
    client.write('=');
    stream_write_sv(client, to_sv_tmp(ESP.getVcc()/10));
    client.flush();
}

void handle_firmware(WiFiClient& client, HttpRequest& request) {
    client.peekConsume(request.body.data()-client.peekBuffer());
    beginUpdate(client, http_get_content_length(request.headers));
}

void serve_static(WiFiClient& client, HttpRequest& request, std::string_view content) {
    std::string_view headers[] = {"Cache-Control: max-age=86400\r\n"sv,
                                  content_type_header(request.path),
                                  "Content-Length: "sv, to_sv_tmp(content.length()), "\r\n"sv,
                                  "Content-Encoding: gzip\r\n"sv};
    consume_available(client);
    http_write_response_header(client, "200 OK"sv, headers);
    client.flush();
    stream_write_sv(client, content);
    client.flush();
}

struct router_slot {
    std::string_view path;
    std::string_view method;
    void (*handler)(WiFiClient& client, HttpRequest& request);
};
const auto routes = std::to_array<const router_slot>({
    {"/"sv, "GET"sv, handle_root},
    {"/load.bin"sv, "GET"sv, serve_load_data},
    {"/settings"sv, "GET"sv, serve_settings},
    {"/settings"sv, "POST"sv, handle_settings},
    {"/system"sv, "GET"sv, serve_system_info},
    {"/system/firmware"sv, "POST"sv, handle_firmware},
#include "static_routes.h"
});

void handle_requests() {
    for (auto& client: requests) {
        if (client.status() == CLOSED || client.peekAvailable() == 0) {
            continue;
        }
        auto request = http_parse_request({client.peekBuffer(), client.peekAvailable()});
        if (request.state != HttpRequest::ParseState::HEADERS) {
            client.abort();
            continue;
        }
        bool bad_method = false;
        bool full_match = false;
        for (const auto& route: routes) {
            if (request.path != route.path) {
                continue;
            }
            if (request.method != route.method) {
                bad_method = true;
                continue;
            }
            route.handler(client, request);
            full_match = true;
            break;
        }
        if (full_match) {
            continue;
        }
        if (bad_method) {
            consume_available(client);
            std::string_view headers[] = {"Content-Length: 0\r\n"sv};
            http_write_response_header(client, "405 Method Not Allowed"sv, headers);
            client.flush();
        } else {
            http_respond_not_found(client);
            client.flush();
        }
    }
}

void handle_update() {
    if (update.status() == CLOSED) {
        return;
    }
    Update.write(update);
    if (Update.hasError() || Update.isFinished()) {
        endUpdate();
    }
}

void collect_data() {
    if (load_cell.is_ready() && buffer_filled < buffer.size()) {
        buffer[buffer_filled++] = load_cell.read() >> 8;  // low bits are noise
    }
}

void send_data() {
    if (buffer_filled <= 0) {
        return;
    }
    for (auto& client: load_clients) {
        if (client.status() == CLOSED) {
            continue;
        }
        client.write(reinterpret_cast<const uint8_t*>(buffer.data()), buffer_filled*sizeof(decltype(buffer)::value_type));
        client.flush();
    }
    buffer_filled = 0;
}

void loop() {
    handle_new_connections();
    handle_requests();
    handle_update();
    collect_data();
    send_data();
}
