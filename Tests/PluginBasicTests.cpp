#include <cmath>
#include <set>

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include "../Source/PluginProcessor.h"
#include "../Source/Toys/ToyRegistry.h"

class ToyRegistryTests : public juce::UnitTest
{
public:
    ToyRegistryTests() : juce::UnitTest ("ToyRegistry", "DAWtchapon") {}

    void runTest() override
    {
        beginTest ("has five distinct toys");
        {
            const auto& toys = ToyRegistry::getToys();
            expectEquals ((int) toys.size(), ToyRegistry::numToys);

            std::set<juce::String> names;
            for (auto& toy : toys)
                names.insert (toy.name);
            expectEquals ((int) names.size(), ToyRegistry::numToys);
        }

        beginTest ("each toy's DSP runs cleanly on a test signal without NaN/Inf");
        {
            constexpr double sampleRate = 44100.0;
            constexpr int blockSize = 512;

            juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32) blockSize, 2 };

            for (auto& toyInfo : ToyRegistry::getToys())
            {
                auto dsp = toyInfo.create();
                dsp->prepare (spec);

                juce::AudioBuffer<float> buffer (2, blockSize);
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getWritePointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        data[i] = (float) std::sin (2.0 * juce::MathConstants<double>::pi * 440.0 * i / sampleRate);
                }

                juce::dsp::AudioBlock<float> block (buffer);
                dsp->process (block);

                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getReadPointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        expect (std::isfinite (data[i]), "Toy '" + juce::String (toyInfo.name) + "' produced a non-finite sample");
                }
            }
        }
    }
};

static ToyRegistryTests toyRegistryTests;

class ProcessorStateTests : public juce::UnitTest
{
public:
    ProcessorStateTests() : juce::UnitTest ("ProcessorState", "DAWtchapon") {}

    void runTest() override
    {
        beginTest ("activeToyIndex round-trips through state save/restore");
        {
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            processor.requestSpin();
            processor.confirmPendingSpin();
            const auto expectedIndex = processor.getActiveToyIndex();

            juce::MemoryBlock state;
            processor.getStateInformation (state);

            DAWtchaponAudioProcessor restored;
            restored.prepareToPlay (44100.0, 512);
            restored.setStateInformation (state.getData(), (int) state.getSize());

            expectEquals (restored.getActiveToyIndex(), expectedIndex);
        }

        beginTest ("spin never re-selects the currently active toy, once confirmed");
        {
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            for (int i = 0; i < 50; ++i)
            {
                const auto before = processor.getActiveToyIndex();
                const auto after = processor.requestSpin();
                expect (after != before, "Spin re-selected the same toy index");

                processor.confirmPendingSpin();
                expectEquals (processor.getActiveToyIndex(), after);
            }
        }

        beginTest ("requestSpin doesn't change the active toy until confirmPendingSpin is called");
        {
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            const auto before = processor.getActiveToyIndex();
            const auto chosen = processor.requestSpin();
            expect (chosen != before, "Spin re-selected the same toy index");
            expectEquals (processor.getActiveToyIndex(), before,
                "activeToyIndex changed before confirmPendingSpin() was called");

            processor.confirmPendingSpin();
            expectEquals (processor.getActiveToyIndex(), chosen,
                "activeToyIndex didn't change after confirmPendingSpin()");
        }

        beginTest ("crossfade after confirmPendingSpin runs cleanly and completes");
        {
            constexpr double sampleRate = 44100.0;
            constexpr int blockSize = 512;

            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (sampleRate, blockSize);

            const auto chosen = processor.requestSpin();
            processor.confirmPendingSpin();

            juce::MidiBuffer midi;
            // Enough blocks to cover the 1-second crossfade plus a margin.
            const int blocksNeeded = (int) std::ceil (sampleRate / (double) blockSize) + 5;

            for (int b = 0; b < blocksNeeded; ++b)
            {
                juce::AudioBuffer<float> buffer (2, blockSize);
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getWritePointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        data[i] = (float) std::sin (2.0 * juce::MathConstants<double>::pi * 220.0 * i / sampleRate);
                }

                processor.processBlock (buffer, midi);

                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getReadPointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        expect (std::isfinite (data[i]), "Non-finite sample during crossfade");
                }
            }

            expectEquals (processor.getActiveToyIndex(), chosen);
        }

        beginTest ("hasRevealedToy starts false and persists across save/restore once set");
        {
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            expect (! processor.hasRevealedToy(), "hasRevealedToy should start false on a fresh instance");

            processor.requestSpin();
            processor.confirmPendingSpin();
            expect (processor.hasRevealedToy(), "hasRevealedToy should be true after confirmPendingSpin()");

            juce::MemoryBlock state;
            processor.getStateInformation (state);

            DAWtchaponAudioProcessor restored;
            restored.prepareToPlay (44100.0, 512);
            expect (! restored.hasRevealedToy(), "a fresh instance shouldn't already have hasRevealedToy true");

            restored.setStateInformation (state.getData(), (int) state.getSize());
            expect (restored.hasRevealedToy(), "hasRevealedToy should persist across state restore");
        }

        beginTest ("processBlock passes audio through untouched until the first toy is ever revealed");
        {
            constexpr double sampleRate = 44100.0;
            constexpr int blockSize = 512;

            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (sampleRate, blockSize);

            expect (! processor.hasRevealedToy(), "a fresh instance shouldn't have revealed a toy yet");

            juce::MidiBuffer midi;

            {
                juce::AudioBuffer<float> buffer (2, blockSize);
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getWritePointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        data[i] = 0.5f;
                }

                processor.processBlock (buffer, midi);

                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getReadPointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        expectEquals (data[i], 0.5f,
                            "processBlock should pass audio through untouched before any toy has been revealed");
                }
            }

            processor.requestSpin();
            processor.confirmPendingSpin();

            // Keep checking for a while (not just one block) — some toys
            // (e.g. Echo Spirit's ~180ms delay line) need more than one
            // block before their effect on a constant input is visible.
            bool changedSomewhere = false;
            const int blocksToCheck = (int) std::ceil (sampleRate / (double) blockSize) + 5;

            for (int b = 0; b < blocksToCheck && ! changedSomewhere; ++b)
            {
                juce::AudioBuffer<float> buffer (2, blockSize);
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getWritePointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        data[i] = 0.5f;
                }

                processor.processBlock (buffer, midi);

                for (int ch = 0; ch < buffer.getNumChannels() && ! changedSomewhere; ++ch)
                {
                    auto* data = buffer.getReadPointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                    {
                        if (data[i] != 0.5f)
                        {
                            changedSomewhere = true;
                            break;
                        }
                    }
                }
            }

            expect (changedSomewhere, "processBlock should apply the toy's DSP once one has been revealed");
        }

        beginTest ("isPluginActive reflects whichever process method was last called");
        {
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            expect (processor.isPluginActive(), "should start active (not bypassed)");

            juce::AudioBuffer<float> buffer (2, 512);
            juce::MidiBuffer midi;

            processor.processBlockBypassed (buffer, midi);
            expect (! processor.isPluginActive(), "should report inactive after processBlockBypassed()");

            processor.processBlock (buffer, midi);
            expect (processor.isPluginActive(), "should report active again after processBlock()");
        }

        beginTest ("isPluginActive reflects the bypass parameter directly, with no process call at all");
        {
            // This is the scenario that matters in practice: some hosts
            // (confirmed with GarageBand) stop calling processBlock() *and*
            // processBlockBypassed() entirely while bypassed, the same way
            // they do on a genuine transport stop. The bypass parameter
            // (see getBypassParameter()) is set directly from the host's
            // property-set call for its bypass button, independent of
            // whether any rendering happens afterward — so isPluginActive()
            // must reflect it immediately, with no processBlock() call
            // in between.
            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (44100.0, 512);

            expect (processor.isPluginActive(), "should start active");

            auto* bypassParam = processor.apvts.getParameter ("bypass");
            bypassParam->setValueNotifyingHost (1.0f);
            expect (! processor.isPluginActive(), "should be inactive the instant the bypass parameter is set, with no process call");

            bypassParam->setValueNotifyingHost (0.0f);
            expect (processor.isPluginActive(), "should be active again once the bypass parameter is cleared");
        }

        beginTest ("processBlock passes audio through untouched while the bypass parameter is set");
        {
            constexpr double sampleRate = 44100.0;
            constexpr int blockSize = 512;

            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (sampleRate, blockSize);

            processor.requestSpin();
            processor.confirmPendingSpin();

            juce::MidiBuffer midi;
            juce::AudioBuffer<float> buffer (2, blockSize);

            auto* bypassParam = processor.apvts.getParameter ("bypass");
            bypassParam->setValueNotifyingHost (1.0f);

            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* data = buffer.getWritePointer (ch);
                for (int i = 0; i < blockSize; ++i)
                    data[i] = 0.5f;
            }

            processor.processBlock (buffer, midi);

            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* data = buffer.getReadPointer (ch);
                for (int i = 0; i < blockSize; ++i)
                    expectEquals (data[i], 0.5f, "processBlock should pass audio through untouched while bypassed, even with a toy active");
            }
        }

        beginTest ("requestReset returns to a fresh, dry-passthrough state");
        {
            constexpr double sampleRate = 44100.0;
            constexpr int blockSize = 512;

            DAWtchaponAudioProcessor processor;
            processor.prepareToPlay (sampleRate, blockSize);

            processor.requestSpin();
            processor.confirmPendingSpin();
            expect (processor.hasRevealedToy(), "should have revealed a toy before testing reset");

            juce::MidiBuffer midi;
            juce::AudioBuffer<float> buffer (2, blockSize);

            // Give the newly-revealed toy's DSP a few blocks to actually
            // engage (matches the flakiness fix in the earlier test) —
            // irrelevant to what's being tested here, just avoids
            // depending on which toy happened to be picked.
            for (int b = 0; b < 10; ++b)
            {
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                {
                    auto* data = buffer.getWritePointer (ch);
                    for (int i = 0; i < blockSize; ++i)
                        data[i] = 0.5f;
                }
                processor.processBlock (buffer, midi);
            }

            processor.requestReset();

            // The reset is only applied inside processBlock, not
            // immediately — requestReset() just flags it (it has to
            // happen on the audio thread, since it touches objects the
            // audio thread also touches).
            expect (processor.hasRevealedToy(), "hasRevealedToy should still be true until a block is processed");

            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* data = buffer.getWritePointer (ch);
                for (int i = 0; i < blockSize; ++i)
                    data[i] = 0.5f;
            }
            processor.processBlock (buffer, midi);

            expect (! processor.hasRevealedToy(), "hasRevealedToy should be false once the reset is applied");
            expectEquals (processor.getActiveToyIndex(), 0, "activeToyIndex should reset to the default");

            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* data = buffer.getReadPointer (ch);
                for (int i = 0; i < blockSize; ++i)
                    expectEquals (data[i], 0.5f, "processBlock should pass audio through untouched again after reset");
            }
        }
    }
};

static ProcessorStateTests processorStateTests;

int main (int, char**)
{
    juce::UnitTestRunner runner;
    runner.runAllTests();

    for (int i = 0; i < runner.getNumResults(); ++i)
        if (runner.getResult (i)->failures > 0)
            return 1;

    return 0;
}
