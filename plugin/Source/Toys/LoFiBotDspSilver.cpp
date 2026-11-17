#include "LoFiBotDspSilver.h"

#include <cmath>

void LoFiBotDspSilver::prepare (const juce::dsp::ProcessSpec& spec)
{
    sampleRate = spec.sampleRate;

    antiAliasFilter.setType (juce::dsp::StateVariableTPTFilterType::lowpass);
    antiAliasFilter.setCutoffFrequency (3000.0f);
    antiAliasFilter.prepare (spec);

    holdValues.assign (spec.numChannels, 0.0f);

    reset();
}

void LoFiBotDspSilver::reset()
{
    antiAliasFilter.reset();
    std::fill (holdValues.begin(), holdValues.end(), 0.0f);
    phaseAccumulator = 0.0f;
}

void LoFiBotDspSilver::process (juce::dsp::AudioBlock<float>& block)
{
    const auto numChannels = block.getNumChannels();
    const auto numSamples = block.getNumSamples();
    const float samplesPerHold = (float) (sampleRate / (double) decimatedRateHz);
    const float quantSteps = (float) (1 << bitDepth);

    for (size_t sample = 0; sample < numSamples; ++sample)
    {
        phaseAccumulator += 1.0f;
        bool takeNewHold = false;
        if (phaseAccumulator >= samplesPerHold)
        {
            phaseAccumulator -= samplesPerHold;
            takeNewHold = true;
        }

        for (size_t ch = 0; ch < numChannels; ++ch)
        {
            auto* data = block.getChannelPointer (ch);

            if (takeNewHold)
                holdValues[ch] = data[sample];

            data[sample] = std::round (holdValues[ch] * quantSteps) / quantSteps;
        }
    }

    antiAliasFilter.process (juce::dsp::ProcessContextReplacing<float> (block));
}
