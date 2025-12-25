#include <charconv>
#include "utils.h"
#include "http.h"


using namespace std::literals;


HttpRequest http_parse_request(const std::string_view& payload) {
    auto result = HttpRequest{ HttpRequest::ParseState::EMPTY, {}, {}, {}, {} };
    const auto method_end = payload.find(' ');
    if (method_end == payload.npos) {
        result.method = payload;
        if (payload.size() >= 8) {
            result.state = HttpRequest::ParseState::INVALID;
        }
        return result;
    }
    result.method = payload.substr(0, method_end);
    result.state = HttpRequest::ParseState::METHOD;
    const auto path_end = payload.find(' ', method_end+1);
    if (path_end == payload.npos) {
        result.path =  payload.substr(method_end+1);
        return result;
    }
    result.path = payload.substr(method_end+1, path_end-method_end-1);
    result.state = HttpRequest::ParseState::PATH;
    const auto line_end = payload.find("\r\n"sv, path_end+1);
    if (line_end == payload.npos) {
        return result;
    }
    const auto headers_end = payload.find("\r\n\r\n"sv, line_end);
    if (headers_end == payload.npos) {
        result.headers = payload.substr(line_end+2);
        return result;
    }
    result.headers = payload.substr(line_end+2, headers_end-line_end);
    result.state = HttpRequest::ParseState::HEADERS;

    result.body = payload.substr(headers_end+4);

    return result;
}

std::string_view http_get_header(std::string_view header, std::string_view headers) {
    auto header_start = headers.find(header);
    if (header_start == headers.npos) {
        return {};
    }
    header_start += header.length();
    header_start += headers.at(header_start) == ' ' ? 1 : 0;
    auto header_end = headers.find("\r\n"sv, header_start);
    if (header_end == headers.npos) {
        return {};
    }
    return headers.substr(header_start, header_end-header_start);
}

std::size_t http_get_content_length(std::string_view headers) {
    auto content_length = std::size_t{};
    auto content_length_value = http_get_header("Content-Length:", headers);
    std::from_chars(content_length_value.begin(), content_length_value.end(), content_length);
    return content_length;
}

size_t http_write_response_header(Print& client, std::string_view code, std::span<std::string_view> headers) {
    auto written = size_t{};
    written += stream_write_sv(client, "HTTP/1.1 "sv);
    written += stream_write_sv(client, code);
    written += stream_write_sv(client, "\r\n"sv);
    for (const auto& header: headers) {
        written += stream_write_sv(client, header);
    }
    written += stream_write_sv(client, "\r\n"sv);
    return written;
}

std::string_view content_type_header(std::string_view path) {
    if (path.ends_with(".html"sv)) {
        return "Content-Type: text/html\r\n"sv;
    }
    if (path.ends_with(".css"sv)) {
        return "Content-Type: text/css\r\n"sv;
    }
    if (path.ends_with(".js"sv)) {
        return "Content-Type: text/javascript\r\n"sv;
    }
    return ""sv;
}

size_t http_respond_not_found(Print& client) {
    std::string_view headers[] = {"Content-Length: 0\r\n"sv};
    return http_write_response_header(client, "404 Not Found"sv, headers);
}

size_t http_respond_redirect(Print& client, std::string_view location, std::string_view code) {
    std::string_view headers[] = {"Location: "sv, location, "\r\n"sv,
                                  "Content-Length: 0\r\n"sv};
    return http_write_response_header(client, code, headers);
}
