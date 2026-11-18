juce_add_console_app(DAWchaponTests PRODUCT_NAME "DAWchaponTests")

target_sources(DAWchaponTests PRIVATE
    PluginBasicTests.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginProcessor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/PluginEditor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/BroBotDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/BroBotDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/BroBotDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/ZyxarDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/DistorTRONDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/DistorTRONDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/DistorTRONDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/HowlerDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/HowlerDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/HowlerDspGold.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/NostolgonDsp.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/NostolgonDspSilver.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../Source/Toys/NostolgonDspGold.cpp)

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
