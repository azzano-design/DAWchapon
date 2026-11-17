juce_add_console_app(DAWtchaponTests PRODUCT_NAME "DAWtchaponTests")

target_sources(DAWtchaponTests PRIVATE
    PluginBasicTests.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginProcessor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginEditor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/RoboPalDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/CrumbleDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/EchoSpiritDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/LoFiBotDsp.cpp)

target_include_directories(DAWtchaponTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/..)

target_compile_definitions(DAWtchaponTests PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    DAWTCHAPON_USE_DEV_SERVER=1
    JUCE_STANDALONE_APPLICATION=1)

target_link_libraries(DAWtchaponTests PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_dsp
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

add_test(NAME DAWtchaponTests COMMAND DAWtchaponTests)
