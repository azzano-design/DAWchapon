#pragma once

#include "ToyDspBase.h"

// Echo Spirit, Silver variant: longer, darker repeats with more feedback
// than the original, for a heavier haunting character.
class EchoSpiritDspSilver : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::DelayLine<float> delayLine { 96000 };
    juce::dsp::StateVariableTPTFilter<float> feedbackFilter;

    static constexpr float delayTimeMs = 240.0f;
    static constexpr float feedbackAmount = 0.55f;
    static constexpr float wetAmount = 0.45f;
};
