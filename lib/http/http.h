#pragma once

#include <string_view>
#include <span>
#include <ranges>
#include <concepts>
#include <Print.h>


struct HttpRequest {
    enum class ParseState {
        INVALID,
        EMPTY,
        METHOD,
        PATH,
        HEADERS
    };

    ParseState state;
    std::string_view method;
    std::string_view path;
    std::string_view headers;
    std::string_view body;
};

HttpRequest http_parse_request(const std::string_view&);

std::string_view http_get_header(std::string_view header, std::string_view headers);

std::size_t http_get_content_length(std::string_view headers);

inline auto http_parse_form_data(std::string_view payload) {
    return payload | std::views::split('&') | std::views::transform([](auto r) {
        std::size_t m=0;
        std::size_t n=0;
        for (auto c: r) {
            if (c == '=') {
                m = n;
            }
            ++n;
        }
        auto b = r.begin();
        return std::make_pair(std::string_view(&*b, m), std::string_view(&*b+m+1, n-m-1));
    });
}

std::string_view content_type_header(std::string_view path);

size_t http_write_response_header(Print& client, std::string_view code, std::span<std::string_view> headers);

size_t http_respond_not_found(Print& client);

size_t http_respond_redirect(Print& client, std::string_view location, std::string_view code="301 Moved Permanently");
