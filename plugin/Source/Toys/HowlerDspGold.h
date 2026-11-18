#pragma once

#include "ToyDspBase.h"

// Howler, Gold variant: long, dense, deeply darkened repeats — the
// most haunting of the three.
class HowlerDspGold : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::DelayLine<float> delayLine { 96000 };
    juce::dsp::StateVariableTPTFilter<float> feedbackFilter;

    static constexpr float delayTimeMs = 320.0f;
    static constexpr float feedbackAmount = 0.65f;
    static constexpr float wetAmount = 0.5f;
};
