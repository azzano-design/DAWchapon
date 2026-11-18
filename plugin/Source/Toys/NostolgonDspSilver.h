#pragma once

#include <vector>

#include "ToyDspBase.h"

// Nostolgon, Silver variant: heavier decimation and bit reduction than the
// original, for a crunchier "cheaper sampler" character.
class NostolgonDspSilver : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::StateVariableTPTFilter<float> antiAliasFilter;

    double sampleRate = 44100.0;
    static constexpr int bitDepth = 4;
    static constexpr float decimatedRateHz = 3000.0f;

    std::vector<float> holdValues;
    float phaseAccumulator = 0.0f;
};
