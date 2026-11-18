#include "DistorTRONDsp.h"

void DistorTRONDsp::prepare (const juce::dsp::ProcessSpec& spec)
{
    preEmphasis.state = juce::dsp::IIR::Coefficients<float>::makeHighShelf (
        spec.sampleRate, 2000.0f, 0.707f, 2.5f);
    preEmphasis.prepare (spec);

    outputGain.setGainDecibels (-4.0f);
    outputGain.prepare (spec);

    reset();
}

void DistorTRONDsp::reset()
{
    preEmphasis.reset();
    shaper.reset();
    outputGain.reset();
}

void DistorTRONDsp::process (juce::dsp::AudioBlock<float>& block)
{
    juce::dsp::ProcessContextReplacing<float> context (block);
    preEmphasis.process (context);
    shaper.process (context);
    outputGain.process (context);
}
