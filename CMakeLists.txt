cmake_minimum_required(VERSION 3.22)

project(DAWtchapon VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(DAWTCHAPON_USE_DEV_SERVER "Point the plugin's WebView at the local Vite dev server instead of embedded assets" ON)

include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 9.0.5
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(DAWtchapon
    COMPANY_NAME "Brendan Azzano"
    BUNDLE_ID "com.brendanazzano.dawtchapon"
    PLUGIN_MANUFACTURER_CODE Bazz
    PLUGIN_CODE Dwt1
    FORMATS VST3 AU
    PRODUCT_NAME "DAWtchapon"
    NEEDS_WEB_BROWSER TRUE
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    AU_MAIN_TYPE kAudioUnitType_Effect
    COPY_PLUGIN_AFTER_BUILD TRUE)

target_sources(DAWtchapon PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/Toys/RoboPalDsp.cpp
    Source/Toys/ZyxarDsp.cpp
    Source/Toys/CrumbleDsp.cpp
    Source/Toys/EchoSpiritDsp.cpp
    Source/Toys/LoFiBotDsp.cpp)

target_compile_definitions(DAWtchapon PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    # We're VST3-only and have never shipped a VST2 build, so there's no
    # parameter-automation compatibility to preserve between the two.
    JUCE_VST3_CAN_REPLACE_VST2=0
    DAWTCHAPON_USE_DEV_SERVER=$<BOOL:${DAWTCHAPON_USE_DEV_SERVER}>)

target_link_libraries(DAWtchapon PRIVATE
    juce::juce_audio_utils
    juce::juce_dsp
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

if(NOT DAWTCHAPON_USE_DEV_SERVER)
    # Embed the WebUI production build (run `npm install && npm run build`
    # in WebUI/ first) so a release build is a fully self-contained VST3.
    file(GLOB_RECURSE DAWTCHAPON_WEB_ASSETS CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/WebUI/dist/*")
    if(DAWTCHAPON_WEB_ASSETS)
        juce_add_binary_data(DAWtchaponWebAssets SOURCES ${DAWTCHAPON_WEB_ASSETS})
        target_link_libraries(DAWtchapon PRIVATE DAWtchaponWebAssets)
    else()
        message(WARNING "WebUI/dist is empty - run `npm install && npm run build` in WebUI/ before building with DAWTCHAPON_USE_DEV_SERVER=OFF.")
    endif()
endif()

enable_testing()
add_subdirectory(Tests)
