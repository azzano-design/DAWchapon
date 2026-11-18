#pragma once

#include "ToyDspBase.h"

// Howler: a filtered-feedback slap delay, for haunting repeats that
// darken as they fade.
class HowlerDsp : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::DelayLine<float> delayLine { 96000 };
    juce::dsp::StateVariableTPTFilter<float> feedbackFilter;

    static constexpr float delayTimeMs = 180.0f;
    static constexpr float feedbackAmount = 0.45f;
    static constexpr float wetAmount = 0.4f;
};
