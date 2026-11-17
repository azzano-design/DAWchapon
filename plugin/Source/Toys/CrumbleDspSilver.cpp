#include "CrumbleDspSilver.h"

void CrumbleDspSilver::prepare (const juce::dsp::ProcessSpec& spec)
{
    preEmphasis.state = juce::dsp::IIR::Coefficients<float>::makeHighShelf (
        spec.sampleRate, 2500.0f, 0.707f, 3.5f);
    preEmphasis.prepare (spec);

    outputGain.setGainDecibels (-5.0f);
    outputGain.prepare (spec);

    reset();
}

void CrumbleDspSilver::reset()
{
    preEmphasis.reset();
    shaper.reset();
    outputGain.reset();
}

void CrumbleDspSilver::process (juce::dsp::AudioBlock<float>& block)
{
    juce::dsp::ProcessContextReplacing<float> context (block);
    preEmphasis.process (context);
    shaper.process (context);
    outputGain.process (context);
}
