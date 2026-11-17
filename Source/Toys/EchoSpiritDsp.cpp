#include "EchoSpiritDsp.h"

void EchoSpiritDsp::prepare (const juce::dsp::ProcessSpec& spec)
{
    delayLine.prepare (spec);
    delayLine.setDelay ((float) (delayTimeMs * 0.001 * spec.sampleRate));

    feedbackFilter.setType (juce::dsp::StateVariableTPTFilterType::lowpass);
    feedbackFilter.setCutoffFrequency (2200.0f);
    feedbackFilter.prepare (spec);

    reset();
}

void EchoSpiritDsp::reset()
{
    delayLine.reset();
    feedbackFilter.reset();
}

void EchoSpiritDsp::process (juce::dsp::AudioBlock<float>& block)
{
    const auto numChannels = block.getNumChannels();
    const auto numSamples = block.getNumSamples();

    for (size_t sample = 0; sample < numSamples; ++sample)
    {
        for (size_t ch = 0; ch < numChannels; ++ch)
        {
            auto* data = block.getChannelPointer (ch);
            const float input = data[sample];

            const float delayed = delayLine.popSample ((int) ch);
            const float filteredFeedback = feedbackFilter.processSample ((int) ch, delayed * feedbackAmount);

            delayLine.pushSample ((int) ch, input + filteredFeedback);

            data[sample] = input + delayed * wetAmount;
        }
    }
}
