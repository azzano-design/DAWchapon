#pragma once

#include <array>
#include <functional>
#include <memory>

#include "CrumbleDsp.h"
#include "EchoSpiritDsp.h"
#include "LoFiBotDsp.h"
#include "RoboPalDsp.h"
#include "ToyDspBase.h"
#include "ZyxarDsp.h"

namespace ToyRegistry
{
    constexpr int numToys = 5;

    struct ToyInfo
    {
        int index;
        const char* name;
        std::function<std::unique_ptr<ToyDspBase>()> create;
    };

    inline const std::array<ToyInfo, numToys>& getToys()
    {
        static const std::array<ToyInfo, numToys> toys {
            ToyInfo { 0, "Robo-Pal",    [] { return std::make_unique<RoboPalDsp>(); } },
            ToyInfo { 1, "Zyxar",       [] { return std::make_unique<ZyxarDsp>(); } },
            ToyInfo { 2, "Crumble",     [] { return std::make_unique<CrumbleDsp>(); } },
            ToyInfo { 3, "Echo Spirit", [] { return std::make_unique<EchoSpiritDsp>(); } },
            ToyInfo { 4, "Lo-Fi Bot",   [] { return std::make_unique<LoFiBotDsp>(); } },
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
}
