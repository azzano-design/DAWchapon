#pragma once

#include <vector>

#include "ToyDspBase.h"

// Lo-Fi Bot: heavy sample-rate decimation + deep bit reduction, for a flat,
// crunchy "old sampler" character distinct from Robo-Pal's formant-y voice.
class LoFiBotDsp : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    juce::dsp::StateVariableTPTFilter<float> antiAliasFilter;

    double sampleRate = 44100.0;
    static constexpr int bitDepth = 5;
    static constexpr float decimatedRateHz = 4000.0f;

    std::vector<float> holdValues;
    float phaseAccumulator = 0.0f;
};
