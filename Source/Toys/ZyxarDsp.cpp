#include "ZyxarDsp.h"

#include <cmath>

void ZyxarDsp::prepare (const juce::dsp::ProcessSpec& spec)
{
    carrier.prepare (spec);

    carrierLfo.setFrequency (carrierLfoRateHz);
    carrierLfo.prepare (spec);

    padOscA.setFrequency (padBaseFrequencyHz * std::pow (2.0f, 30.0f / 1200.0f));
    padOscB.setFrequency (padBaseFrequencyHz * std::pow (2.0f, -30.0f / 1200.0f));
    padOscA.prepare (spec);
    padOscB.prepare (spec);

    envelopeFollower.setAttackTime (8.0f);
    envelopeFollower.setReleaseTime (200.0f);
    envelopeFollower.prepare (spec);

    reset();
}

void ZyxarDsp::reset()
{
    carrier.reset();
    carrierLfo.reset();
    padOscA.reset();
    padOscB.reset();
    envelopeFollower.reset();
}

void ZyxarDsp::process (juce::dsp::AudioBlock<float>& block)
{
    const auto numChannels = block.getNumChannels();
    const auto numSamples = block.getNumSamples();

    for (size_t sample = 0; sample < numSamples; ++sample)
    {
        // Sweep the ring-mod carrier's pitch with a slow LFO for a
        // wobbling "alien transmission" warble, rather than a static
        // robotic tone.
        const float lfo = carrierLfo.processSample (0.0f);
        carrier.setFrequency (carrierBaseHz + carrierSweepHz * lfo, true);
        const float carrierSample = carrier.processSample (0.0f);

        float inputSum = 0.0f;
        for (size_t ch = 0; ch < numChannels; ++ch)
            inputSum += std::abs (block.getChannelPointer (ch)[sample]);
        inputSum /= (float) juce::jmax ((size_t) 1, numChannels);
        const float envelope = envelopeFollower.processSample (0, inputSum);

        const float padA = padOscA.processSample (0.0f);
        const float padB = padOscB.processSample (0.0f);
        // 0.3 floor so the pad stays audible even on quiet input, rather
        // than being almost entirely envelope-gated to silence.
        const float pad = 0.5f * (padA + padB) * (0.3f + 0.7f * envelope) * padLayerAmount;

        for (size_t ch = 0; ch < numChannels; ++ch)
        {
            auto* data = block.getChannelPointer (ch);
            const float dry = data[sample];
            const float ringModulated = dry * carrierSample;
            data[sample] = dry * (1.0f - ringModAmount) + ringModulated * ringModAmount + pad;
        }
    }
}
