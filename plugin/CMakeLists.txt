cmake_minimum_required(VERSION 3.22)

project(DAWchapon VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Strip the local checkout's absolute path (e.g. /Users/<you>/...) out of
# debug info and __FILE__ so built binaries are identical and shareable
# no matter which machine/user produced them.
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    add_compile_options(
        -ffile-prefix-map=${CMAKE_SOURCE_DIR}/=./
        -ffile-prefix-map=${CMAKE_BINARY_DIR}/=./build/)
endif()

option(DAWCHAPON_USE_DEV_SERVER "Point the plugin's WebView at the local Vite dev server instead of embedded assets" ON)
option(DAWCHAPON_TEST_MODE "Build with a developer overlay (Prev/Next buttons) for cycling through every toy+variant combo, bypassing the gacha pull flow" OFF)

include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 9.0.5
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(DAWchapon
    COMPANY_NAME "Brendan Azzano"
    BUNDLE_ID "com.azzano-design.dawchapon"
    PLUGIN_MANUFACTURER_CODE Bazz
    PLUGIN_CODE Dwt1
    FORMATS VST3 AU
    PRODUCT_NAME "DAWchapon"
    NEEDS_WEB_BROWSER TRUE
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    AU_MAIN_TYPE kAudioUnitType_Effect
    COPY_PLUGIN_AFTER_BUILD TRUE)

target_sources(DAWchapon PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/Toys/RoboPalDsp.cpp
    Source/Toys/RoboPalDspSilver.cpp
    Source/Toys/RoboPalDspGold.cpp
    Source/Toys/ZyxarDsp.cpp
    Source/Toys/ZyxarDspSilver.cpp
    Source/Toys/ZyxarDspGold.cpp
    Source/Toys/CrumbleDsp.cpp
    Source/Toys/CrumbleDspSilver.cpp
    Source/Toys/CrumbleDspGold.cpp
    Source/Toys/EchoSpiritDsp.cpp
    Source/Toys/EchoSpiritDspSilver.cpp
    Source/Toys/EchoSpiritDspGold.cpp
    Source/Toys/LoFiBotDsp.cpp
    Source/Toys/LoFiBotDspSilver.cpp
    Source/Toys/LoFiBotDspGold.cpp)

target_compile_definitions(DAWchapon PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    # We're VST3-only and have never shipped a VST2 build, so there's no
    # parameter-automation compatibility to preserve between the two.
    JUCE_VST3_CAN_REPLACE_VST2=0
    DAWCHAPON_USE_DEV_SERVER=$<BOOL:${DAWCHAPON_USE_DEV_SERVER}>
    DAWCHAPON_TEST_MODE=$<BOOL:${DAWCHAPON_TEST_MODE}>)

target_link_libraries(DAWchapon PRIVATE
    juce::juce_audio_utils
    juce::juce_dsp
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

if(NOT DAWCHAPON_USE_DEV_SERVER)
    # Embed the WebUI production build (run `npm install && npm run build`
    # in WebUI/ first) so a release build is a fully self-contained VST3.
    file(GLOB_RECURSE DAWCHAPON_WEB_ASSETS CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/WebUI/dist/*")
    if(DAWCHAPON_WEB_ASSETS)
        juce_add_binary_data(DAWchaponWebAssets SOURCES ${DAWCHAPON_WEB_ASSETS})
        target_link_libraries(DAWchapon PRIVATE DAWchaponWebAssets)
    else()
        message(WARNING "WebUI/dist is empty - run `npm install && npm run build` in WebUI/ before building with DAWCHAPON_USE_DEV_SERVER=OFF.")
    endif()
endif()

enable_testing()
add_subdirectory(Tests)
