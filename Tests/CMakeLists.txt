juce_add_console_app(DAWchaponTests PRODUCT_NAME "DAWchaponTests")

target_sources(DAWchaponTests PRIVATE
    PluginBasicTests.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginProcessor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginEditor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/RoboPalDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/RoboPalDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/RoboPalDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/CrumbleDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/CrumbleDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/CrumbleDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/EchoSpiritDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/EchoSpiritDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/EchoSpiritDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/LoFiBotDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/LoFiBotDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/LoFiBotDspGold.cpp)

target_include_directories(DAWchaponTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/..)

target_compile_definitions(DAWchaponTests PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    DAWCHAPON_USE_DEV_SERVER=1
    JUCE_STANDALONE_APPLICATION=1)

target_link_libraries(DAWchaponTests PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_dsp
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

add_test(NAME DAWchaponTests COMMAND DAWchaponTests)
