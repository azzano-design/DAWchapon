#pragma once

#include <vector>

#include "ToyDspBase.h"

// Robo-Pal, Silver variant: a brighter, tighter telephone-robot voice —
// higher carrier, narrower bandpass, slightly heavier bit-crush.
class RoboPalDspSilver : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::Oscillator<float> carrier { [] (float x) { return std::sin (x); } };
    juce::dsp::StateVariableTPTFilter<float> bandpass;

    double sampleRate = 44100.0;
    static constexpr int bitDepth = 6;
    static constexpr float sampleHoldRateHz = 6500.0f;

    std::vector<float> holdValues;
    float phaseAccumulator = 0.0f;
};
