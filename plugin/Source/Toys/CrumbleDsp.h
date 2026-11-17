#pragma once

#include "ToyDspBase.h"

// Crumble: high-shelf pre-emphasis into a tanh waveshaper, for crunchy
// distortion grit.
class CrumbleDsp : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    // juce::dsp::IIR::Filter is single-channel; ProcessorDuplicator gives
    // each channel its own independent filter state.
    juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> preEmphasis;
    juce::dsp::WaveShaper<float> shaper { [] (float x) { return std::tanh (3.0f * x); } };
    juce::dsp::Gain<float> outputGain;
};
