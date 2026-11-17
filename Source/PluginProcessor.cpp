#include "PluginProcessor.h"

#include <cmath>

#include "PluginEditor.h"
#include "Toys/ToyRegistry.h"

DAWtchaponAudioProcessor::DAWtchaponAudioProcessor()
    : AudioProcessor (BusesProperties()
                           .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                           .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "PARAMETERS", createParameterLayout())
{
    bypassParameter = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));
}

juce::AudioProcessorValueTreeState::ParameterLayout DAWtchaponAudioProcessor::createParameterLayout()
{
    return {
        std::make_unique<juce::AudioParameterChoice> (
            juce::ParameterID { "activeToyIndex", 1 },
            "Active Toy",
            ToyRegistry::getToyNames(),
            0),
        std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "bypass", 1 },
            "Bypass",
            false)
    };
}

void DAWtchaponAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    processSpec.sampleRate = sampleRate;
    processSpec.maximumBlockSize = (juce::uint32) samplesPerBlock;
    processSpec.numChannels = (juce::uint32) juce::jmax (getTotalNumOutputChannels(), 1);

    crossfadeScratchBuffer.setSize ((int) processSpec.numChannels, (int) processSpec.maximumBlockSize);
    crossfadeSamplesRemaining = 0;
    incomingToy = nullptr;

    cachedToyIndex = -1;
    if (hasEverRevealedToy)
        updateActiveToyIfParameterChanged();
}

bool DAWtchaponAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto mainOut = layouts.getMainOutputChannelSet();

    if (mainOut != juce::AudioChannelSet::mono() && mainOut != juce::AudioChannelSet::stereo())
        return false;

    return layouts.getMainInputChannelSet() == mainOut;
}

void DAWtchaponAudioProcessor::updateActiveToyIfParameterChanged()
{
    const auto newIndex = getActiveToyIndex();

    if (newIndex == cachedToyIndex)
        return;

    cachedToyIndex = newIndex;

    auto newToy = ToyRegistry::getToys()[(size_t) newIndex].create();
    newToy->prepare (processSpec);

    if (activeToy == nullptr)
    {
        // Nothing to fade from yet (first block ever, or just after a
        // sample-rate change) — adopt it immediately.
        activeToy = std::move (newToy);
        incomingToy = nullptr;
        crossfadeSamplesRemaining = 0;
        return;
    }

    incomingToy = std::move (newToy);
    crossfadeTotalSamples = juce::jmax (1, (int) std::round (crossfadeDurationSeconds * processSpec.sampleRate));
    crossfadeSamplesRemaining = crossfadeTotalSamples;
}

void DAWtchaponAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    bypassedViaProcessCall = false;
    updateHostPlaybackInfo();
    performResetIfRequested();

    if (bypassParameter != nullptr && bypassParameter->get())
    {
        // Our own bypass parameter (see getBypassParameter()) means the
        // host calls processBlock() even while bypassed, rather than
        // processBlockBypassed() — so passing audio through untouched on
        // its behalf is now our job, not the base class's.
        return;
    }

    if (! hasEverRevealedToy)
    {
        // No toy has ever been won yet — pass audio through untouched
        // rather than silently applying the default toy's effect before
        // the user has spun at all.
        return;
    }

    updateActiveToyIfParameterChanged();

    const auto numSamples = buffer.getNumSamples();
    juce::dsp::AudioBlock<float> block (buffer);

    if (incomingToy != nullptr && crossfadeSamplesRemaining > 0)
    {
        // Process the outgoing toy into a scratch copy of the dry input,
        // and the incoming toy into the live buffer, then linearly blend
        // between them sample-by-sample over crossfadeDurationSeconds.
        crossfadeScratchBuffer.setSize (buffer.getNumChannels(), numSamples, false, false, true);
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            crossfadeScratchBuffer.copyFrom (ch, 0, buffer, ch, 0, numSamples);

        juce::dsp::AudioBlock<float> outgoingBlock (crossfadeScratchBuffer);
        activeToy->process (outgoingBlock);

        incomingToy->process (block);

        const auto samplesRemainingAtBlockStart = crossfadeSamplesRemaining;
        for (int sample = 0; sample < numSamples; ++sample)
        {
            const auto samplesRemainingHere = samplesRemainingAtBlockStart - sample;
            const auto incomingAmount = 1.0f - (float) samplesRemainingHere / (float) crossfadeTotalSamples;

            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* out = buffer.getWritePointer (ch);
                const auto* outgoing = crossfadeScratchBuffer.getReadPointer (ch);
                out[sample] = outgoing[sample] * (1.0f - incomingAmount) + out[sample] * incomingAmount;
            }
        }

        crossfadeSamplesRemaining = juce::jmax (0, crossfadeSamplesRemaining - numSamples);

        if (crossfadeSamplesRemaining == 0)
        {
            activeToy = std::move (incomingToy);
            incomingToy = nullptr;
        }
    }
    else if (activeToy != nullptr)
    {
        activeToy->process (block);
    }
}

void DAWtchaponAudioProcessor::processBlockBypassed (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    bypassedViaProcessCall = true;

    // Some hosts call this instead of processBlock() while bypassed
    // (rather than not calling either) — if so, this keeps the playhead
    // snapshot fresh through bypass too.
    updateHostPlaybackInfo();
    performResetIfRequested();
    AudioProcessor::processBlockBypassed (buffer, midiMessages);
}

void DAWtchaponAudioProcessor::performResetIfRequested()
{
    if (! resetRequested.exchange (false))
        return;

    activeToy = nullptr;
    incomingToy = nullptr;
    cachedToyIndex = -1;
    crossfadeSamplesRemaining = 0;
    hasEverRevealedToy = false;
    pendingSpinIndex = -1;

    if (auto* param = apvts.getParameter ("activeToyIndex"))
        param->setValueNotifyingHost (param->convertTo0to1 (0.0f));
}

void DAWtchaponAudioProcessor::updateHostPlaybackInfo()
{
    if (auto* playHead = getPlayHead())
    {
        if (const auto position = playHead->getPosition())
        {
            hostIsPlaying = position->getIsPlaying();

            if (const auto bpm = position->getBpm())
                hostBpm = *bpm;

            if (const auto ppq = position->getPpqPosition())
                hostBeatPosition = *ppq;

            return;
        }
    }

    hostIsPlaying = false;
}

int DAWtchaponAudioProcessor::getActiveToyIndex() const
{
    if (auto* param = apvts.getRawParameterValue ("activeToyIndex"))
        return (int) param->load();

    return 0;
}

int DAWtchaponAudioProcessor::requestSpin()
{
    const auto currentIndex = getActiveToyIndex();
    const auto numToys = (int) ToyRegistry::getToys().size();

    auto newIndex = currentIndex;
    if (numToys > 1)
    {
        // Uniformly pick one of the *other* toys, so a spin always changes
        // something.
        const auto offset = 1 + rng.nextInt (numToys - 1);
        newIndex = (currentIndex + offset) % numToys;
    }

    // Deliberately not applied yet — see confirmPendingSpin().
    pendingSpinIndex = newIndex;

    return newIndex;
}

void DAWtchaponAudioProcessor::requestReset()
{
    resetRequested = true;
}

void DAWtchaponAudioProcessor::confirmPendingSpin()
{
    if (pendingSpinIndex < 0)
        return;

    if (auto* param = apvts.getParameter ("activeToyIndex"))
        param->setValueNotifyingHost (param->convertTo0to1 ((float) pendingSpinIndex));

    hasEverRevealedToy = true;
    pendingSpinIndex = -1;
}

juce::AudioProcessorEditor* DAWtchaponAudioProcessor::createEditor()
{
    return new DAWtchaponAudioProcessorEditor (*this);
}

void DAWtchaponAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    apvts.state.setProperty ("hasRevealedToy", hasEverRevealedToy, nullptr);

    auto state = apvts.copyState();

    if (std::unique_ptr<juce::XmlElement> xml (state.createXml()); xml != nullptr)
        copyXmlToBinary (*xml, destData);
}

void DAWtchaponAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (std::unique_ptr<juce::XmlElement> xml (getXmlFromBinary (data, sizeInBytes)); xml != nullptr)
        apvts.replaceState (juce::ValueTree::fromXml (*xml));

    hasEverRevealedToy = (bool) apvts.state.getProperty ("hasRevealedToy", false);

    cachedToyIndex = -1;
    if (hasEverRevealedToy)
        updateActiveToyIfParameterChanged();
}

// This creates new instances of the plugin.
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new DAWtchaponAudioProcessor();
}
