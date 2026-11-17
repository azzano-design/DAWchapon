#pragma once

#include "ToyDspBase.h"

// Zyxar, Silver variant: a brighter, faster-wobbling alien transmission —
// higher carrier sweep rate and a higher-pitched pad bed, whose voices
// drift and breathe a little quicker than the original too.
class ZyxarDspSilver : public ToyDspBase
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

    static constexpr float carrierBaseHz = 220.0f;
    static constexpr float carrierSweepHz = 160.0f;
    static constexpr float carrierLfoRateHz = 0.5f;
    static constexpr float ringModAmount = 0.7f;

    static constexpr float padBaseFrequencyHz = 277.0f;
    static constexpr float padDetuneCents = 30.0f;
    static constexpr float padLayerAmount = 0.7f;
    static constexpr float padCenterLevel = 0.6f;

    static constexpr float padDriftRateHzA = 0.09f;
    static constexpr float padDriftRateHzB = 0.14f;
    static constexpr float padDriftRateHzC = 0.07f;
    static constexpr float padDriftDepthCents = 16.0f;

    static constexpr float padTremoloRateHz = 0.18f;
    static constexpr float padTremoloDepth = 0.18f;
};
