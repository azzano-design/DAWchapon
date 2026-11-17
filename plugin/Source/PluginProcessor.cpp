#include "PluginProcessor.h"

#include <cmath>

#include "PluginEditor.h"
#include "Toys/ToyRegistry.h"

DAWchaponAudioProcessor::DAWchaponAudioProcessor()
    : AudioProcessor (BusesProperties()
                           .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                           .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "PARAMETERS", createParameterLayout())
{
    bypassParameter = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));
    lastRenderCallMs = juce::Time::getMillisecondCounterHiRes();
}

juce::AudioProcessorValueTreeState::ParameterLayout DAWchaponAudioProcessor::createParameterLayout()
{
    return {
        std::make_unique<juce::AudioParameterChoice> (
            juce::ParameterID { "activeToyIndex", 1 },
            "Active Toy",
            ToyRegistry::getComboNames(),
            0),
        std::make_unique<juce::AudioParameterBool> (
            juce::ParameterID { "bypass", 1 },
            "Bypass",
            false)
    };
}

void DAWchaponAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
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

bool DAWchaponAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto mainOut = layouts.getMainOutputChannelSet();

    if (mainOut != juce::AudioChannelSet::mono() && mainOut != juce::AudioChannelSet::stereo())
        return false;

    return layouts.getMainInputChannelSet() == mainOut;
}

void DAWchaponAudioProcessor::updateActiveToyIfParameterChanged()
{
    const auto newIndex = getActiveToyIndex();

    if (newIndex == cachedToyIndex)
        return;

    cachedToyIndex = newIndex;

    auto newToy = ToyRegistry::createForCombo (newIndex);
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

void DAWchaponAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    lastRenderCallMs = juce::Time::getMillisecondCounterHiRes();
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

void DAWchaponAudioProcessor::processBlockBypassed (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    lastRenderCallMs = juce::Time::getMillisecondCounterHiRes();
    bypassedViaProcessCall = true;

    // Some hosts call this instead of processBlock() while bypassed
    // (rather than not calling either) — if so, this keeps the playhead
    // snapshot fresh through bypass too.
    updateHostPlaybackInfo();
    performResetIfRequested();
    AudioProcessor::processBlockBypassed (buffer, midiMessages);
}

void DAWchaponAudioProcessor::performResetIfRequested()
{
    if (! resetRequested.exchange (false))
        return;

    activeToy = nullptr;
    incomingToy = nullptr;
    cachedToyIndex = -1;
    crossfadeSamplesRemaining = 0;
    hasEverRevealedToy = false;
    pendingSpinIndex = -1;
    previousToyIndex = -1;

    if (auto* param = apvts.getParameter ("activeToyIndex"))
        param->setValueNotifyingHost (param->convertTo0to1 (0.0f));
}

void DAWchaponAudioProcessor::updateHostPlaybackInfo()
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

int DAWchaponAudioProcessor::getActiveToyIndex() const
{
    if (auto* param = apvts.getRawParameterValue ("activeToyIndex"))
        return (int) param->load();

    return 0;
}

int DAWchaponAudioProcessor::requestSpin()
{
    const auto currentCombo = getActiveToyIndex();
    const auto currentToyIndex = ToyRegistry::toyIndexOfCombo (currentCombo);
    const auto numToys = (int) ToyRegistry::getToys().size();

    // Excludes both the currently active toy and whichever one was active
    // immediately before it (see previousToyIndex), falling back to
    // excluding only the current toy if that leaves nothing to pick from
    // — only reachable with fewer than 3 toys registered, which isn't the
    // case here, but keeps this from looping forever if that ever changes.
    auto excludesPrevious = true;
    {
        auto anyAvailable = false;
        for (int i = 0; i < numToys; ++i)
        {
            if (i != currentToyIndex && i != previousToyIndex)
            {
                anyAvailable = true;
                break;
            }
        }
        excludesPrevious = anyAvailable;
    }

    auto newToyIndex = currentToyIndex;
    if (numToys > 1)
    {
        do
        {
            newToyIndex = rng.nextInt (numToys);
        } while (newToyIndex == currentToyIndex
                 || (excludesPrevious && newToyIndex == previousToyIndex));
    }

    // Picked independently of the toy exclusion above, weighted by rarity
    // (see ToyRegistry::variantWeights, Gold rarest) — the toy already
    // being guaranteed to differ from the active one is enough on its own
    // to guarantee the combo does too.
    const auto variant = ToyRegistry::pickVariant (rng);
    const auto newCombo = ToyRegistry::comboIndex (newToyIndex, variant);

    // Deliberately not applied yet — see confirmPendingSpin().
    pendingSpinIndex = newCombo;

    return newCombo;
}

void DAWchaponAudioProcessor::requestReset()
{
    resetRequested = true;
}

#if DAWCHAPON_TEST_MODE
void DAWchaponAudioProcessor::setActiveComboForTesting (int combo)
{
    hasEverRevealedToy = true;
    pendingSpinIndex = -1;

    if (auto* param = apvts.getParameter ("activeToyIndex"))
        param->setValueNotifyingHost (param->convertTo0to1 ((float) combo));
}
#endif

void DAWchaponAudioProcessor::confirmPendingSpin()
{
    if (pendingSpinIndex < 0)
        return;

    // The toy that's about to stop being active becomes "previous" for the
    // next requestSpin() call's exclusion — read before the parameter
    // changes underneath it.
    previousToyIndex = ToyRegistry::toyIndexOfCombo (getActiveToyIndex());

    if (auto* param = apvts.getParameter ("activeToyIndex"))
        param->setValueNotifyingHost (param->convertTo0to1 ((float) pendingSpinIndex));

    hasEverRevealedToy = true;
    pendingSpinIndex = -1;
}

juce::AudioProcessorEditor* DAWchaponAudioProcessor::createEditor()
{
    return new DAWchaponAudioProcessorEditor (*this);
}

void DAWchaponAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    apvts.state.setProperty ("hasRevealedToy", hasEverRevealedToy, nullptr);

    auto state = apvts.copyState();

    if (std::unique_ptr<juce::XmlElement> xml (state.createXml()); xml != nullptr)
        copyXmlToBinary (*xml, destData);
}

void DAWchaponAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
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
    return new DAWchaponAudioProcessor();
}
