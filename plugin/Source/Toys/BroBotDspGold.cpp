#include "BroBotDspGold.h"

#include <cmath>

void BroBotDspGold::prepare (const juce::dsp::ProcessSpec& spec)
{
    sampleRate = spec.sampleRate;

    carrier.setFrequency (40.0f);
    carrier.prepare (spec);

    bandpass.setType (juce::dsp::StateVariableTPTFilterType::bandpass);
    bandpass.setCutoffFrequency (900.0f);
    bandpass.setResonance (2.0f);
    bandpass.prepare (spec);

    holdValues.assign (spec.numChannels, 0.0f);

    reset();
}

void BroBotDspGold::reset()
{
    carrier.reset();
    bandpass.reset();
    std::fill (holdValues.begin(), holdValues.end(), 0.0f);
    phaseAccumulator = 0.0f;
}

void BroBotDspGold::process (juce::dsp::AudioBlock<float>& block)
{
    const auto numChannels = block.getNumChannels();
    const auto numSamples = block.getNumSamples();
    const float samplesPerHold = (float) (sampleRate / (double) sampleHoldRateHz);
    const float quantSteps = (float) (1 << bitDepth);

    for (size_t sample = 0; sample < numSamples; ++sample)
    {
        const float carrierSample = carrier.processSample (0.0f);

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
            const float ringModulated = data[sample] * carrierSample;

            if (takeNewHold)
                holdValues[ch] = ringModulated;

            data[sample] = std::round (holdValues[ch] * quantSteps) / quantSteps;
        }
    }

    bandpass.process (juce::dsp::ProcessContextReplacing<float> (block));
}
