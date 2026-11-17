#include "CrumbleDspGold.h"

void CrumbleDspGold::prepare (const juce::dsp::ProcessSpec& spec)
{
    preEmphasis.state = juce::dsp::IIR::Coefficients<float>::makeHighShelf (
        spec.sampleRate, 3200.0f, 0.707f, 5.0f);
    preEmphasis.prepare (spec);

    outputGain.setGainDecibels (-6.5f);
    outputGain.prepare (spec);

    reset();
}

void CrumbleDspGold::reset()
{
    preEmphasis.reset();
    shaper.reset();
    outputGain.reset();
}

void CrumbleDspGold::process (juce::dsp::AudioBlock<float>& block)
{
    juce::dsp::ProcessContextReplacing<float> context (block);
    preEmphasis.process (context);
    shaper.process (context);
    outputGain.process (context);
}
