#pragma once

#include <optional>

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class DAWtchaponAudioProcessorEditor : public juce::AudioProcessorEditor,
                                        private juce::Timer
{
public:
    explicit DAWtchaponAudioProcessorEditor (DAWtchaponAudioProcessor&);
    ~DAWtchaponAudioProcessorEditor() override;

    void resized() override;

private:
    juce::WebBrowserComponent::Options makeWebViewOptions();
    std::optional<juce::WebBrowserComponent::Resource> provideResource (const juce::String& url);
    static juce::var makeToySelectedPayload (int toyIndex);

    void timerCallback() override;

    DAWtchaponAudioProcessor& audioProcessor;
    juce::WebBrowserComponent webView;
    int lastKnownToyIndex = -1;
    bool lastKnownPlaying = false;
    bool lastKnownActive = true;
    double lastKnownBeatPosition = 0.0;
    double lastKnownBpm = 0.0;

    // Separate from the "last emitted" values above — updated every
    // single tick regardless of whether anything was emitted, purely to
    // detect whether the beat position is genuinely advancing right now.
    double previousTickBeatPosition = 0.0;
    bool hasPreviousTickBeatPosition = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DAWtchaponAudioProcessorEditor)
};
