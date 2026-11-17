#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "Toys/ToyDspBase.h"

class DAWtchaponAudioProcessor : public juce::AudioProcessor
{
public:
    DAWtchaponAudioProcessor();
    ~DAWtchaponAudioProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlockBypassed (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    // Declaring our own bypass parameter (rather than leaving this at the
    // base-class default of nullptr) is what makes bypass detection
    // actually reliable: both the VST3 and AU wrappers only ever call
    // processBlockBypassed() when this returns nullptr. Once we provide
    // our own, they instead always call processBlock() and set *this*
    // parameter's value directly from the host's property-set call for
    // the bypass button — which happens immediately and independently of
    // whether the host ever calls the audio-rendering callback again
    // (GarageBand stops calling it at all while bypassed, same as it
    // does on a genuine transport stop). That makes the parameter's
    // value the only reliable bypass signal for isPluginActive() below.
    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParameter; }

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "DAWtchapon"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.5; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // Called from the editor's "requestSpin" native-function handler.
    // Authoritatively picks a new toy (never the currently active one) and
    // returns its index, but does NOT apply it to the audio engine yet —
    // the DSP swap only happens once confirmPendingSpin() is called (see
    // below), so audio keeps matching the old toy until the new one is
    // actually revealed in the GUI. The RNG lives here, not in the WebView,
    // so a spin can't be predicted or replayed from JS.
    int requestSpin();

    // Called from the editor's "confirmReveal" native-function handler, at
    // the moment the WebView actually reveals the toy chosen by the last
    // requestSpin() call. Applies that toy to the "activeToyIndex"
    // parameter, which processBlock picks up and crossfades into.
    void confirmPendingSpin();

    // The toy index currently live in the audio engine (mirrors the
    // "activeToyIndex" APVTS parameter) — stays the *old* toy until
    // confirmPendingSpin() is called, even if a spin has been requested.
    int getActiveToyIndex() const;

    // Called from the editor's "requestReset" native-function handler
    // (a small GUI reset button). Only sets a flag here — the actual
    // reset (dropping activeToy/incomingToy etc.) happens on the audio
    // thread, at the top of processBlock/processBlockBypassed, since
    // those objects must never be touched from the message thread while
    // the audio thread might be using them.
    void requestReset();

    // True once a toy has ever actually been revealed (confirmPendingSpin
    // called at least once), persisted across save/reload. Until then,
    // processBlock passes audio through untouched and the GUI shows a
    // blank "now playing" bar, rather than silently applying the default
    // toy before the user has won anything.
    bool hasRevealedToy() const { return hasEverRevealedToy; }

    // Host transport/tempo snapshot, refreshed every processBlock call —
    // read by the editor's polling timer to drive the GUI's beat-synced
    // pulsing light. AudioPlayHead is only reliably valid from the audio
    // thread (some hosts, including AU ones, don't populate it at all if
    // queried from elsewhere), so this has to be captured here rather
    // than queried directly from the editor.
    bool isHostPlaying() const { return hostIsPlaying.load(); }
    double getHostBpm() const { return hostBpm.load(); }
    double getHostBeatPosition() const { return hostBeatPosition.load(); }

    // False while the host's bypass/power button is engaged. Checks our
    // own bypass parameter first (see getBypassParameter() above) since
    // that's updated directly from the host's property-set call and so
    // stays reliable even if the host stops calling processBlock/
    // processBlockBypassed entirely while bypassed; bypassedViaProcessCall
    // is just a defensive fallback for a host that doesn't honour
    // getBypassParameter() and calls processBlockBypassed() directly.
    // Drives the GUI's dim-when-off ambient lighting.
    bool isPluginActive() const
    {
        if (bypassParameter != nullptr && bypassParameter->get())
            return false;

        return ! bypassedViaProcessCall.load();
    }

    juce::AudioProcessorValueTreeState apvts;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateActiveToyIfParameterChanged();
    void updateHostPlaybackInfo();
    void performResetIfRequested();

    std::unique_ptr<ToyDspBase> activeToy;
    std::unique_ptr<ToyDspBase> incomingToy;
    int cachedToyIndex = -1;
    int pendingSpinIndex = -1;

    static constexpr float crossfadeDurationSeconds = 1.0f;
    int crossfadeTotalSamples = 0;
    int crossfadeSamplesRemaining = 0;
    juce::AudioBuffer<float> crossfadeScratchBuffer;

    juce::dsp::ProcessSpec processSpec {};

    juce::Random rng;

    bool hasEverRevealedToy = false;

    std::atomic<bool> hostIsPlaying { false };
    std::atomic<double> hostBpm { 120.0 };
    std::atomic<double> hostBeatPosition { 0.0 };
    std::atomic<bool> bypassedViaProcessCall { false };
    std::atomic<bool> resetRequested { false };

    // Owned by apvts — see createParameterLayout() and getBypassParameter().
    juce::AudioParameterBool* bypassParameter = nullptr;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DAWtchaponAudioProcessor)
};
