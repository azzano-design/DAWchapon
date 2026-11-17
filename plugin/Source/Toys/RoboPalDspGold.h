#pragma once

#include <vector>

#include "ToyDspBase.h"

// Robo-Pal, Gold variant: a deeper, growlier telephone-robot voice — lower
// carrier, narrower/more resonant bandpass, heavier bit-crush.
class RoboPalDspGold : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::Oscillator<float> carrier { [] (float x) { return std::sin (x); } };
    juce::dsp::StateVariableTPTFilter<float> bandpass;

    double sampleRate = 44100.0;
    static constexpr int bitDepth = 5;
    static constexpr float sampleHoldRateHz = 5000.0f;

    std::vector<float> holdValues;
    float phaseAccumulator = 0.0f;
};
