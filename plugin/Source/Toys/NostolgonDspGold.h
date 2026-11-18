#pragma once

#include <vector>

#include "ToyDspBase.h"

// Nostolgon, Gold variant: the most extreme decimation and bit reduction —
// a crumbling, ancient-sampler character distinct from the other two.
class NostolgonDspGold : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::StateVariableTPTFilter<float> antiAliasFilter;

    double sampleRate = 44100.0;
    static constexpr int bitDepth = 3;
    static constexpr float decimatedRateHz = 2000.0f;

    std::vector<float> holdValues;
    float phaseAccumulator = 0.0f;
};
