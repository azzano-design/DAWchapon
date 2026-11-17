#include "PluginEditor.h"

#include <cmath>
#include <cstring>

#include "Toys/ToyRegistry.h"

#if ! DAWCHAPON_USE_DEV_SERVER
 #include <BinaryData.h>
#endif

namespace
{
    const juce::Identifier requestSpinFunctionId { "requestSpin" };
    const juce::Identifier confirmRevealFunctionId { "confirmReveal" };
    const juce::Identifier requestResetFunctionId { "requestReset" };
    const juce::Identifier getActiveToyFunctionId { "getActiveToy" };
    const juce::Identifier toySelectedEventId { "toySelected" };
    const juce::Identifier playbackChangedEventId { "playbackChanged" };

#if ! DAWCHAPON_USE_DEV_SERVER
    juce::String mimeTypeForFilename (const juce::String& filename)
    {
        if (filename.endsWithIgnoreCase (".html")) return "text/html";
        if (filename.endsWithIgnoreCase (".js"))   return "text/javascript";
        if (filename.endsWithIgnoreCase (".css"))  return "text/css";
        if (filename.endsWithIgnoreCase (".json")) return "application/json";
        if (filename.endsWithIgnoreCase (".svg"))  return "image/svg+xml";
        if (filename.endsWithIgnoreCase (".png"))  return "image/png";
        if (filename.endsWithIgnoreCase (".jpg") || filename.endsWithIgnoreCase (".jpeg"))
            return "image/jpeg";
        if (filename.endsWithIgnoreCase (".glb"))  return "model/gltf-binary";
        if (filename.endsWithIgnoreCase (".woff2")) return "font/woff2";

        return "application/octet-stream";
    }
#endif
}

DAWchaponAudioProcessorEditor::DAWchaponAudioProcessorEditor (DAWchaponAudioProcessor& p)
    : AudioProcessorEditor (&p),
      audioProcessor (p),
      webView (makeWebViewOptions())
{
    addAndMakeVisible (webView);
    setResizable (true, true);
    setSize (680, 760);

#if DAWCHAPON_USE_DEV_SERVER
    webView.goToURL ("http://localhost:5173");
#else
    webView.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
#endif

    lastKnownToyIndex = audioProcessor.getActiveToyIndex();
    startTimerHz (10);

#if DAWCHAPON_TEST_MODE
    addAndMakeVisible (testModePrevButton);
    addAndMakeVisible (testModeNextButton);
    addAndMakeVisible (testModeLabel);
    testModeLabel.setJustificationType (juce::Justification::centred);
    testModeLabel.setColour (juce::Label::backgroundColourId, juce::Colours::black);
    testModeLabel.setColour (juce::Label::textColourId, juce::Colours::white);

    testModeComboIndex = audioProcessor.getActiveToyIndex();
    audioProcessor.setActiveComboForTesting (testModeComboIndex);
    updateTestModeLabel();

    testModePrevButton.onClick = [this]
    {
        testModeComboIndex = (testModeComboIndex - 1 + ToyRegistry::numCombos) % ToyRegistry::numCombos;
        audioProcessor.setActiveComboForTesting (testModeComboIndex);
        updateTestModeLabel();
    };
    testModeNextButton.onClick = [this]
    {
        testModeComboIndex = (testModeComboIndex + 1) % ToyRegistry::numCombos;
        audioProcessor.setActiveComboForTesting (testModeComboIndex);
        updateTestModeLabel();
    };
#endif
}

DAWchaponAudioProcessorEditor::~DAWchaponAudioProcessorEditor()
{
    stopTimer();
}

void DAWchaponAudioProcessorEditor::resized()
{
#if DAWCHAPON_TEST_MODE
    auto bounds = getLocalBounds();
    auto controlBar = bounds.removeFromTop (36);
    testModePrevButton.setBounds (controlBar.removeFromLeft (80).reduced (4));
    testModeNextButton.setBounds (controlBar.removeFromRight (80).reduced (4));
    testModeLabel.setBounds (controlBar);
    webView.setBounds (bounds);
#else
    webView.setBounds (getLocalBounds());
#endif
}

#if DAWCHAPON_TEST_MODE
void DAWchaponAudioProcessorEditor::updateTestModeLabel()
{
    const auto toyIndex = ToyRegistry::toyIndexOfCombo (testModeComboIndex);
    const auto variant = ToyRegistry::variantOfCombo (testModeComboIndex);

    testModeLabel.setText (
        "TEST MODE  " + juce::String (testModeComboIndex + 1) + "/" + juce::String (ToyRegistry::numCombos)
            + ":  " + juce::String (ToyRegistry::getToys()[(size_t) toyIndex].name)
            + ToyRegistry::variantNameSuffix (variant),
        juce::dontSendNotification);
}
#endif

// `combo` is the flattened toy+variant index the processor actually
// stores (see ToyRegistry::comboIndex) — decoded here into the separate
// toyIndex/variant fields the WebView side works with.
juce::var DAWchaponAudioProcessorEditor::makeToySelectedPayload (int combo)
{
    const auto toyIndex = ToyRegistry::toyIndexOfCombo (combo);
    const auto variant = ToyRegistry::variantOfCombo (combo);

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("toyIndex", toyIndex);
    obj->setProperty ("toyName", juce::String (ToyRegistry::getToys()[(size_t) toyIndex].name));
    obj->setProperty ("variant", juce::String (ToyRegistry::variantId (variant)));
    return juce::var (obj);
}

juce::WebBrowserComponent::Options DAWchaponAudioProcessorEditor::makeWebViewOptions()
{
    using Options = juce::WebBrowserComponent::Options;

    auto options = Options()
                        .withNativeIntegrationEnabled (true)
                        .withNativeFunction (requestSpinFunctionId,
                            [this] (const juce::Array<juce::var>&,
                                    juce::WebBrowserComponent::NativeFunctionCompletion completion)
                            {
                                const auto newIndex = audioProcessor.requestSpin();
                                completion (makeToySelectedPayload (newIndex));
                            })
                        .withNativeFunction (confirmRevealFunctionId,
                            [this] (const juce::Array<juce::var>&,
                                    juce::WebBrowserComponent::NativeFunctionCompletion completion)
                            {
                                audioProcessor.confirmPendingSpin();
                                completion (juce::var());
                            })
                        .withNativeFunction (requestResetFunctionId,
                            [this] (const juce::Array<juce::var>&,
                                    juce::WebBrowserComponent::NativeFunctionCompletion completion)
                            {
                                audioProcessor.requestReset();
                                completion (juce::var());
                            })
                        .withNativeFunction (getActiveToyFunctionId,
                            [this] (const juce::Array<juce::var>&,
                                    juce::WebBrowserComponent::NativeFunctionCompletion completion)
                            {
                                auto payload = makeToySelectedPayload (audioProcessor.getActiveToyIndex());
                                if (auto* obj = payload.getDynamicObject())
                                    obj->setProperty ("hasRevealed", audioProcessor.hasRevealedToy());
                                completion (payload);
                            });

#if ! DAWCHAPON_USE_DEV_SERVER
    options = options.withResourceProvider (
        [this] (const juce::String& url) { return provideResource (url); });
#endif

    return options;
}

std::optional<juce::WebBrowserComponent::Resource> DAWchaponAudioProcessorEditor::provideResource (
    [[maybe_unused]] const juce::String& url)
{
#if DAWCHAPON_USE_DEV_SERVER
    return std::nullopt;
#else
    auto path = url;
    if (path.isEmpty() || path == "/")
        path = "/index.html";

    // juce_add_binary_data indexes resources by original filename only (no
    // directory component), so a request like "/assets/index-xyz.js" is
    // looked up by "index-xyz.js" alone.
    const auto filename = path.fromLastOccurrenceOf ("/", false, false);

    for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
    {
        const auto* resourceName = BinaryData::namedResourceList[i];
        const auto* originalFilename = BinaryData::getNamedResourceOriginalFilename (resourceName);

        if (originalFilename == nullptr || filename != juce::String (originalFilename))
            continue;

        int dataSize = 0;
        const auto* data = BinaryData::getNamedResource (resourceName, dataSize);

        if (data == nullptr)
            return std::nullopt;

        juce::WebBrowserComponent::Resource resource;
        resource.data.resize ((size_t) dataSize);
        std::memcpy (resource.data.data(), data, (size_t) dataSize);
        resource.mimeType = mimeTypeForFilename (filename);
        return resource;
    }

    return std::nullopt;
#endif
}

void DAWchaponAudioProcessorEditor::timerCallback()
{
    const auto current = audioProcessor.getActiveToyIndex();

    if (current != lastKnownToyIndex)
    {
        lastKnownToyIndex = current;
        webView.emitEventIfBrowserIsVisible (toySelectedEventId, makeToySelectedPayload (current));
    }

    // Fed from processBlock/processBlockBypassed (see
    // updateHostPlaybackInfo) rather than queried from here directly —
    // AudioPlayHead isn't reliably valid off the audio thread for every
    // host/format (some AU hosts don't populate it at all if queried
    // from elsewhere).
    const auto reportedPlaying = audioProcessor.isHostPlaying();
    const auto bpm = audioProcessor.getHostBpm();
    const auto beatPosition = audioProcessor.getHostBeatPosition();

    constexpr auto epsilon = 1.0e-6;

    // Checked every tick, independent of whether we end up emitting —
    // some hosts stop calling either process method at all once the
    // transport actually stops (same as they do for bypass), which
    // freezes our cached reading indefinitely at whatever "isPlaying"
    // last said — "true" if it had been playing. The host's own flag
    // can't be trusted alone here; requiring the position to actually be
    // moving since the last tick is what catches a genuine stop.
    const auto positionIsAdvancing = hasPreviousTickBeatPosition
        && std::abs (beatPosition - previousTickBeatPosition) > epsilon;
    previousTickBeatPosition = beatPosition;
    hasPreviousTickBeatPosition = true;

    const auto playingNow = reportedPlaying && positionIsAdvancing;

    // Only emit when something has actually changed, so a frozen reading
    // (nothing advancing) doesn't keep resetting the GUI's local
    // extrapolation clock back to "now" every tick — that's what caused
    // the flicker previously, rather than a smooth decay.
    const auto positionChanged = std::abs (beatPosition - lastKnownBeatPosition) > epsilon;
    const auto bpmChanged = std::abs (bpm - lastKnownBpm) > epsilon;

    // Which of processBlock/processBlockBypassed was most recently
    // called — i.e. the host's own bypass/power button. Drives the GUI's
    // separate dim-when-off ambient lighting (independent of isPlaying).
    //
    // Also false whenever isRenderStalled() — some hosts' own bypass
    // control (confirmed with GarageBand's per-plugin power button)
    // neither sets our bypass parameter via the AU property nor calls
    // processBlockBypassed() at all, so isPluginActive() alone never
    // notices; it just stops calling any process method whatsoever,
    // exactly like it does on a genuine transport stop. This is a
    // deliberately coarser signal than isPluginActive() alone — it'll
    // also dim while genuinely paused on such a host, not just bypassed,
    // but that's the only way to catch this case at all here.
    const auto pluginActiveNow = audioProcessor.isPluginActive() && ! audioProcessor.isRenderStalled();

    if (playingNow != lastKnownPlaying || positionChanged || bpmChanged || pluginActiveNow != lastKnownActive)
    {
        lastKnownPlaying = playingNow;
        lastKnownBeatPosition = beatPosition;
        lastKnownBpm = bpm;
        lastKnownActive = pluginActiveNow;

        auto* obj = new juce::DynamicObject();
        obj->setProperty ("isPlaying", playingNow);
        obj->setProperty ("bpm", bpm);
        obj->setProperty ("beatPosition", beatPosition);
        obj->setProperty ("pluginActive", pluginActiveNow);
        webView.emitEventIfBrowserIsVisible (playbackChangedEventId, juce::var (obj));
    }
}
