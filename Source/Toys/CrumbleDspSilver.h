#pragma once

#include "ToyDspBase.h"

// Crumble, Silver variant: brighter pre-emphasis into a harder waveshaper
// curve, for noticeably crunchier grit than the original.
class CrumbleDspSilver : public ToyDspBase
{
public:
    void prepare (const juce::dsp::ProcessSpec& spec) override;
    void process (juce::dsp::AudioBlock<float>& block) override;
    void reset() override;

private:
    // juce::dsp::IIR::Filter is single-channel; ProcessorDuplicator gives
    // each channel its own independent filter state.
    juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> preEmphasis;
    juce::dsp::WaveShaper<float> shaper { [] (float x) { return std::tanh (4.5f * x); } };
    juce::dsp::Gain<float> outputGain;
};
