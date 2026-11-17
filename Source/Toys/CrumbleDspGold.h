#pragma once

#include "ToyDspBase.h"

// Crumble, Gold variant: aggressive high-end pre-emphasis into a heavily
// driven waveshaper, for the crunchiest, most saturated grit of the three.
class CrumbleDspGold : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    // juce::dsp::IIR::Filter is single-channel; ProcessorDuplicator gives
    // each channel its own independent filter state.
    juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> preEmphasis;
    juce::dsp::WaveShaper<float> shaper { [] (float x) { return std::tanh (6.5f * x); } };
    juce::dsp::Gain<float> outputGain;
};
