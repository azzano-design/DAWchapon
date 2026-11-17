#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "Toys/ToyDspBase.h"

class DAWchaponAudioProcessor : public juce::AudioProcessor
{
public:
    DAWchaponAudioProcessor();
    ~DAWchaponAudioProcessor() override = default;

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

    const juce::String getName() const override { return "DAWchapon"; }
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
    // Authoritatively picks a new toy+variant combo and returns its
    // flattened combo index (see ToyRegistry::comboIndex), but does NOT
    // apply it to the audio engine yet — the DSP swap only happens once
    // confirmPendingSpin() is called (see below), so audio keeps matching
    // the old toy until the new one is actually revealed in the GUI. The
    // RNG lives here, not in the WebView, so a spin can't be predicted or
    // replayed from JS.
    //
    // The toy half of the pick excludes both the currently active toy and
    // whichever one was active immediately before it (previousToyIndex),
    // so a short run never repeats a toy within a 2-pull window — e.g.
    // Robo-Pal, Zyxar, Robo-Pal can no longer happen, only Robo-Pal, Zyxar,
    // (one of the other three). Variant is then picked independently and
    // weighted by rarity (see ToyRegistry::pickVariant), with no exclusion
    // of its own — the toy exclusion alone is enough to guarantee the new
    // combo differs from the active one.
    int requestSpin();

    // Called from the editor's "confirmReveal" native-function handler, at
    // the moment the WebView actually reveals the combo chosen by the last
    // requestSpin() call. Applies that combo to the "activeToyIndex"
    // parameter, which processBlock picks up and crossfades into.
    void confirmPendingSpin();

    // The toy+variant combo index currently live in the audio engine
    // (mirrors the "activeToyIndex" APVTS parameter, which despite its
    // name stores a flattened ToyRegistry combo, not just a toy index) —
    // stays the *old* combo until confirmPendingSpin() is called, even if
    // a spin has been requested. Decode with ToyRegistry::toyIndexOfCombo
    // / variantOfCombo.
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

#if DAWCHAPON_TEST_MODE
    // Developer-only (see the DAWCHAPON_TEST_MODE CMake option): jumps
    // straight to an arbitrary ToyRegistry combo index for auditioning
    // every toy+variant sound in turn, bypassing both the normal
    // weighted-random pull/reveal flow and the "nothing processes until a
    // toy's been won" gate.
    void setActiveComboForTesting (int combo);
#endif

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

    // True once neither processBlock() nor processBlockBypassed() has run
    // for a little while. Belt-and-suspenders fallback for a host whose
    // own generic bypass control turns out not to go through either of
    // isPluginActive()'s two signals at all (observed with GarageBand's
    // per-plugin power button: it stops calling either process method
    // entirely, the same as it does on a genuine transport stop — see
    // updateHostPlaybackInfo() below and the editor's timerCallback — but
    // in this case *also* never sets our "bypass" parameter via the
    // property JUCE's AU wrapper otherwise forwards it through, so
    // bypassParameter and bypassedViaProcessCall both just stay stale
    // forever and isPluginActive() alone never notices). The editor's
    // polling timer keeps running on the message thread regardless of
    // audio-thread activity, so it can check this independently.
    //
    // Deliberately not folded into isPluginActive() itself: that one
    // means "the host told us to bypass", which some callers may still
    // want distinct from "we just haven't heard from the host in a
    // while" (which also covers an ordinary transport pause, not only
    // bypass).
    bool isRenderStalled() const
    {
        return (juce::Time::getMillisecondCounterHiRes() - lastRenderCallMs.load()) > renderStallThresholdMs;
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

    // The toy (not combo — variant doesn't factor into this exclusion) that
    // was active immediately before the current one, so requestSpin() can
    // exclude it alongside the current toy itself. -1 means no history yet
    // (fresh instance, or just after a reset). Set in confirmPendingSpin();
    // cleared in performResetIfRequested() alongside the other spin state.
    int previousToyIndex = -1;

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

    // See isRenderStalled(). Comfortably above a typical block interval
    // (even a large 2048-sample block is ~46ms at 44.1kHz) so ordinary
    // scheduling jitter between blocks never trips it.
    static constexpr double renderStallThresholdMs = 300.0;
    std::atomic<double> lastRenderCallMs { 0.0 };

    // Owned by apvts — see createParameterLayout() and getBypassParameter().
    juce::AudioParameterBool* bypassParameter = nullptr;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DAWchaponAudioProcessor)
};
