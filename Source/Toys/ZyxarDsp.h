#pragma once

#include "ToyDspBase.h"

// Zyxar: an LFO-swept ring modulator (the wobbling "alien transmission"
// warble) blended with the dry signal, plus a wide-detuned two-oscillator
// pad layer underneath for a shimmering alien-ambience bed.
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
    juce::dsp::BallisticsFilter<float> envelopeFollower;

    static constexpr float carrierBaseHz = 170.0f;
    static constexpr float carrierSweepHz = 130.0f;
    static constexpr float carrierLfoRateHz = 0.35f;
    static constexpr float ringModAmount = 0.6f;

    static constexpr float padBaseFrequencyHz = 220.0f;
    static constexpr float padLayerAmount = 0.6f;
};
