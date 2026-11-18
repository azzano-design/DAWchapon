#include "DistorTRONDspGold.h"

void DistorTRONDspGold::prepare (const juce::dsp::ProcessSpec& spec)
{
    preEmphasis.state = juce::dsp::IIR::Coefficients<float>::makeHighShelf (
        spec.sampleRate, 3200.0f, 0.707f, 5.0f);
    preEmphasis.prepare (spec);

    outputGain.setGainDecibels (-6.5f);
    outputGain.prepare (spec);

    reset();
}

void DistorTRONDspGold::reset()
{
    preEmphasis.reset();
    shaper.reset();
    outputGain.reset();
}

void DistorTRONDspGold::process (juce::dsp::AudioBlock<float>& block)
{
    juce::dsp::ProcessContextReplacing<float> context (block);
    preEmphasis.process (context);
    shaper.process (context);
    outputGain.process (context);
}
