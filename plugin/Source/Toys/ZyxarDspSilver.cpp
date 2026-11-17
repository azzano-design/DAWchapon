#include "ZyxarDspSilver.h"

#include <cmath>

void ZyxarDspSilver::prepare (const juce::dsp::ProcessSpec& spec)
{
    carrier.prepare (spec);

    carrierLfo.setFrequency (carrierLfoRateHz);
    carrierLfo.prepare (spec);

    padOscA.setFrequency (padBaseFrequencyHz * std::pow (2.0f, padDetuneCents / 1200.0f));
    padOscB.setFrequency (padBaseFrequencyHz * std::pow (2.0f, -padDetuneCents / 1200.0f));
    padOscC.setFrequency (padBaseFrequencyHz);
    padOscA.prepare (spec);
    padOscB.prepare (spec);
    padOscC.prepare (spec);

    padDriftLfoA.setFrequency (padDriftRateHzA);
    padDriftLfoB.setFrequency (padDriftRateHzB);
    padDriftLfoC.setFrequency (padDriftRateHzC);
    padDriftLfoA.prepare (spec);
    padDriftLfoB.prepare (spec);
    padDriftLfoC.prepare (spec);

    padTremoloLfo.setFrequency (padTremoloRateHz);
    padTremoloLfo.prepare (spec);

    envelopeFollower.setAttackTime (8.0f);
    envelopeFollower.setReleaseTime (200.0f);
    envelopeFollower.prepare (spec);

    reset();
}

void ZyxarDspSilver::reset()
{
    carrier.reset();
    carrierLfo.reset();
    padOscA.reset();
    padOscB.reset();
    padOscC.reset();
    padDriftLfoA.reset();
    padDriftLfoB.reset();
    padDriftLfoC.reset();
    padTremoloLfo.reset();
    envelopeFollower.reset();
}

void ZyxarDspSilver::process (juce::dsp::AudioBlock<float>& block)
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

        // Each pad voice's detune independently drifts on its own slow,
        // non-synced LFO, so the beating between voices keeps slowly
        // reshaping instead of settling into one fixed, static chorus.
        const float driftA = padDriftLfoA.processSample (0.0f);
        const float driftB = padDriftLfoB.processSample (0.0f);
        const float driftC = padDriftLfoC.processSample (0.0f);

        padOscA.setFrequency (padBaseFrequencyHz * std::pow (2.0f, (padDetuneCents + padDriftDepthCents * driftA) / 1200.0f), true);
        padOscB.setFrequency (padBaseFrequencyHz * std::pow (2.0f, (-padDetuneCents + padDriftDepthCents * driftB) / 1200.0f), true);
        padOscC.setFrequency (padBaseFrequencyHz * std::pow (2.0f, (padDriftDepthCents * driftC) / 1200.0f), true);

        const float padA = padOscA.processSample (0.0f);
        const float padB = padOscB.processSample (0.0f);
        const float padC = padOscC.processSample (0.0f);

        // Slow tremolo on top of the input-driven envelope, so the drone
        // gently breathes in level even under sustained/constant input.
        const float tremolo = 1.0f + padTremoloDepth * padTremoloLfo.processSample (0.0f);

        // 0.3 floor so the pad stays audible even on quiet input, rather
        // than being almost entirely envelope-gated to silence.
        const float pad = (padA + padB + padCenterLevel * padC) / (2.0f + padCenterLevel)
            * (0.3f + 0.7f * envelope) * padLayerAmount * tremolo;

        for (size_t ch = 0; ch < numChannels; ++ch)
        {
            auto* data = block.getChannelPointer (ch);
            const float dry = data[sample];
            const float ringModulated = dry * carrierSample;
            data[sample] = dry * (1.0f - ringModAmount) + ringModulated * ringModAmount + pad;
        }
    }
}
