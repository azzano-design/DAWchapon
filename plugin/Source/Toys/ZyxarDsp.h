#pragma once

#include "ToyDspBase.h"

// Zyxar: an LFO-swept ring modulator (the wobbling "alien transmission"
// warble) blended with the dry signal, plus a three-oscillator detuned pad
// layer underneath for a shimmering alien-ambience bed. Each pad voice's
// pitch independently drifts on its own slow LFO (different, non-synced
// rates) so the beating between voices keeps slowly reshaping rather than
// settling into one fixed chorus, and a slow tremolo LFO makes the whole
// drone gently breathe in level too.
class ZyxarDsp : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::Oscillator<float> carrier { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> carrierLfo { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padOscA { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padOscB { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padOscC { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padDriftLfoA { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padDriftLfoB { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padDriftLfoC { [] (float x) { return std::sin (x); } };
    juce::dsp::Oscillator<float> padTremoloLfo { [] (float x) { return std::sin (x); } };
    juce::dsp::BallisticsFilter<float> envelopeFollower;

    static constexpr float carrierBaseHz = 170.0f;
    static constexpr float carrierSweepHz = 130.0f;
    static constexpr float carrierLfoRateHz = 0.35f;
    static constexpr float ringModAmount = 0.6f;

    static constexpr float padBaseFrequencyHz = 220.0f;
    static constexpr float padDetuneCents = 30.0f;
    static constexpr float padLayerAmount = 0.6f;
    static constexpr float padCenterLevel = 0.6f;

    static constexpr float padDriftRateHzA = 0.07f;
    static constexpr float padDriftRateHzB = 0.11f;
    static constexpr float padDriftRateHzC = 0.05f;
    static constexpr float padDriftDepthCents = 12.0f;

    static constexpr float padTremoloRateHz = 0.13f;
    static constexpr float padTremoloDepth = 0.15f;
};
