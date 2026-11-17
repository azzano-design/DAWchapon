#pragma once

#include <array>
#include <functional>
#include <memory>

#include "CrumbleDsp.h"
#include "CrumbleDspGold.h"
#include "CrumbleDspSilver.h"
#include "EchoSpiritDsp.h"
#include "EchoSpiritDspGold.h"
#include "EchoSpiritDspSilver.h"
#include "LoFiBotDsp.h"
#include "LoFiBotDspGold.h"
#include "LoFiBotDspSilver.h"
#include "RoboPalDsp.h"
#include "RoboPalDspGold.h"
#include "RoboPalDspSilver.h"
#include "ToyDspBase.h"
#include "ZyxarDsp.h"
#include "ZyxarDspGold.h"
#include "ZyxarDspSilver.h"

namespace ToyRegistry
{
    constexpr int numToys = 5;

    // Each toy comes in three pulls: the original, plus rarer Silver and
    // Gold versions. Order here is also the rarity order, lowest first.
    enum class Variant
    {
        Original = 0,
        Silver = 1,
        Gold = 2
    };

    constexpr int numVariants = 3;
    constexpr int numCombos = numToys * numVariants;

    // Pull-rate weights across variants, independent of which toy is
    // picked — Gold is the rarest, Silver uncommon, Original the usual
    // pull. Only the relative sizes matter; they don't need to sum to 100.
    constexpr float variantWeights[numVariants] = { 85.0f, 12.0f, 3.0f };

    struct ToyInfo
    {
        int index;
        const char* name;
        std::function<std::unique_ptr<ToyDspBase>()> createOriginal;
        std::function<std::unique_ptr<ToyDspBase>()> createSilver;
        std::function<std::unique_ptr<ToyDspBase>()> createGold;
    };

    inline const std::array<ToyInfo, numToys>& getToys()
    {
        static const std::array<ToyInfo, numToys> toys {
            ToyInfo { 0, "Robo-Pal",
                [] { return std::make_unique<RoboPalDsp>(); },
                [] { return std::make_unique<RoboPalDspSilver>(); },
                [] { return std::make_unique<RoboPalDspGold>(); } },
            ToyInfo { 1, "Zyxar",
                [] { return std::make_unique<ZyxarDsp>(); },
                [] { return std::make_unique<ZyxarDspSilver>(); },
                [] { return std::make_unique<ZyxarDspGold>(); } },
            ToyInfo { 2, "Crumble",
                [] { return std::make_unique<CrumbleDsp>(); },
                [] { return std::make_unique<CrumbleDspSilver>(); },
                [] { return std::make_unique<CrumbleDspGold>(); } },
            ToyInfo { 3, "Echo Spirit",
                [] { return std::make_unique<EchoSpiritDsp>(); },
                [] { return std::make_unique<EchoSpiritDspSilver>(); },
                [] { return std::make_unique<EchoSpiritDspGold>(); } },
            ToyInfo { 4, "Lo-Fi Bot",
                [] { return std::make_unique<LoFiBotDsp>(); },
                [] { return std::make_unique<LoFiBotDspSilver>(); },
                [] { return std::make_unique<LoFiBotDspGold>(); } },
        };
        return toys;
    }

    inline juce::StringArray getToyNames()
    {
        juce::StringArray names;
        for (auto& toy : getToys())
            names.add (toy.name);
        return names;
    }

    // A combo is "which toy, which variant" flattened into one index
    // (0..numCombos-1) — this is what's actually stored in the
    // "activeToyIndex" APVTS parameter, since AudioParameterChoice needs a
    // single flat range.
    inline int comboIndex (int toyIndex, Variant variant)
    {
        return toyIndex * numVariants + (int) variant;
    }

    inline int toyIndexOfCombo (int combo)
    {
        return combo / numVariants;
    }

    inline Variant variantOfCombo (int combo)
    {
        return (Variant) (combo % numVariants);
    }

    // Lowercase identifier sent to the WebView/JS side, which keys its own
    // VARIANTS constants off the same strings.
    inline const char* variantId (Variant variant)
    {
        switch (variant)
        {
            case Variant::Silver:   return "silver";
            case Variant::Gold:     return "gold";
            case Variant::Original: return "original";
        }
        return "original";
    }

    inline const char* variantNameSuffix (Variant variant)
    {
        switch (variant)
        {
            case Variant::Silver:   return " (Silver)";
            case Variant::Gold:     return " (Gold)";
            case Variant::Original: return "";
        }
        return "";
    }

    inline juce::StringArray getComboNames()
    {
        juce::StringArray names;
        for (auto& toy : getToys())
            for (int v = 0; v < numVariants; ++v)
                names.add (juce::String (toy.name) + variantNameSuffix ((Variant) v));
        return names;
    }

    inline std::unique_ptr<ToyDspBase> createForCombo (int combo)
    {
        const auto& toy = getToys()[(size_t) toyIndexOfCombo (combo)];

        switch (variantOfCombo (combo))
        {
            case Variant::Silver:   return toy.createSilver();
            case Variant::Gold:     return toy.createGold();
            case Variant::Original: return toy.createOriginal();
        }
        return toy.createOriginal();
    }

    // Weighted-random variant pick (see variantWeights above) — independent
    // of which toy ends up chosen alongside it.
    inline Variant pickVariant (juce::Random& rng)
    {
        float total = 0.0f;
        for (float weight : variantWeights)
            total += weight;

        const auto roll = rng.nextFloat() * total;
        float cumulative = 0.0f;
        for (int v = 0; v < numVariants; ++v)
        {
            cumulative += variantWeights[v];
            if (roll < cumulative)
                return (Variant) v;
        }

        return Variant::Original;
    }
}
