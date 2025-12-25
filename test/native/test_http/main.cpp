#include <vector>
#include <unity.h>
#include "http.h"


using namespace std::literals;


void setUp(void) {
}

void tearDown(void) {
}

void http_parse_form_data_happy() {
    auto r = http_parse_form_data("abc=123&xyz=789");
    auto b = r.begin();
    TEST_ASSERT_TRUE(*b++ == std::make_pair("abc"sv, "123"sv));
    TEST_ASSERT_TRUE(*b++ == std::make_pair("xyz"sv, "789"sv));
    TEST_ASSERT_TRUE(b == r.end());
}

int main() {
    UNITY_BEGIN();

    RUN_TEST(http_parse_form_data_happy);

    UNITY_END();
}
