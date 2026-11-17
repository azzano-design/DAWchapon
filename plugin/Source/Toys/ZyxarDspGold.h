#pragma once

#include "ToyDspBase.h"

// Zyxar, Gold variant: a deeper, more ominous alien transmission — lower
// carrier with a wider sweep, slower eerie wobble, and a lower, wider pad
// bed whose voices drift more slowly and deeply than the other two
// variants, for an unstable, glacially-shifting drone.
class ZyxarDspGold : public ToyDspBase
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

    static constexpr float carrierBaseHz = 140.0f;
    static constexpr float carrierSweepHz = 200.0f;
    static constexpr float carrierLfoRateHz = 0.22f;
    static constexpr float ringModAmount = 0.75f;

    static constexpr float padBaseFrequencyHz = 165.0f;
    static constexpr float padLayerAmount = 0.8f;
    static constexpr float padDetuneCents = 50.0f;
    static constexpr float padCenterLevel = 0.6f;

    static constexpr float padDriftRateHzA = 0.045f;
    static constexpr float padDriftRateHzB = 0.07f;
    static constexpr float padDriftRateHzC = 0.03f;
    static constexpr float padDriftDepthCents = 22.0f;

    static constexpr float padTremoloRateHz = 0.08f;
    static constexpr float padTremoloDepth = 0.25f;
};
