import * as Juce from "@juce-framework/webview";

import { GachaponMachine } from "./scene/GachaponMachine.js";
import { ToyIcon } from "./scene/ToyIcon.js";
import { getToy, TOYS } from "./toyData.js";
import { playChime, playRumble, startRattle, stopRattle, unlockAudio } from "./sound.js";

// Set this to true temporarily when doing pure visual/animation work with
// `npm run dev` in a plain browser (no plugin attached) — it forces the
// standalone demo fallback below instead of trying to call into a real
// backend.
//
// Note: @juce-framework/webview defines a placeholder `window.__JUCE__`
// even outside a real plugin, so "is __JUCE__ defined" alone can't tell a
// plain browser apart from the real thing — hence this explicit flag
// rather than relying only on that check.
const FORCE_STANDALONE_DEMO = false;
const canUsePlugin = !FORCE_STANDALONE_DEMO && typeof window.__JUCE__ !== "undefined";

const statusFooter = document.querySelector("#status-footer");
const marqueeTexts = statusFooter.querySelectorAll(".marquee-text");
const goldGlow = document.querySelector("#gold-glow");
const revealCard = document.querySelector("#reveal-card");
const revealIcon = new ToyIcon(revealCard.querySelector(".reveal-icon"));
const revealName = revealCard.querySelector(".reveal-name");
const revealEffect = revealCard.querySelector(".reveal-effect");
const resetButton = document.querySelector("#reset-button");

const REVEAL_VISIBLE_MS = 3000;
// Matches #reveal-card's own CSS transition duration — the sidebar toy
// only starts fading in once the modal has actually finished fading out,
// not at the same instant it starts to.
const REVEAL_FADE_OUT_MS = 350;

let currentToyIndex = 0;
let revealHideTimer = null;
let sidebarFadeInTimer = null;

// True from the moment a spin is requested until the modal has closed and
// the sidebar toy has started its own fade-in. confirmReveal() (called
// from onToyShown, below) changes the backend's activeToyIndex parameter,
// which the editor's polling timer echoes back as a "toySelected" event —
// the same event used for genuine host-automation changes. Without this
// guard, that echo makes the sidebar toy show up as soon as the capsule
// opens (and again later via dismiss()), instead of only once, after the
// modal closes.
let spinInFlight = false;

function setMarqueeText(text) {
  marqueeTexts.forEach((el) => {
    el.textContent = text;
  });
}

function updateStatusFooter(toyIndex) {
  currentToyIndex = toyIndex;
  const toy = getToy(toyIndex);
  setMarqueeText(`Now playing: ${toy.name} — ${toy.effect}`);
  statusFooter.classList.add("visible");
}

function showRevealCard(toyIndex) {
  const toy = getToy(toyIndex);
  revealIcon.show(toyIndex);
  revealName.textContent = toy.name;
  revealEffect.textContent = toy.effect;
  revealCard.classList.add("visible");

  clearTimeout(revealHideTimer);
  clearTimeout(sidebarFadeInTimer);
  revealHideTimer = setTimeout(() => {
    revealCard.classList.remove("visible");
    revealIcon.clear();

    // Wait for the modal's own fade-out to actually finish before
    // starting the sidebar toy's fade-in, rather than running them at
    // the same time.
    sidebarFadeInTimer = setTimeout(() => {
      spinInFlight = false;
      machine.dismiss();
    }, REVEAL_FADE_OUT_MS);
  }, REVEAL_VISIBLE_MS);
}

function hideRevealCard() {
  clearTimeout(revealHideTimer);
  clearTimeout(sidebarFadeInTimer);
  revealCard.classList.remove("visible");
  revealIcon.clear();
}

function handleResetClick() {
  // Ignore clicks mid-spin/reveal — this is a demo-convenience button, not
  // part of the gachapon gesture itself, so it shouldn't fight the spin
  // animation's own state.
  if (machine.state !== "idle") return;

  hideRevealCard();
  machine.hideSidebarToy();
  setMarqueeText("");
  statusFooter.classList.remove("visible");
  currentToyIndex = 0;

  if (canUsePlugin) {
    Juce.getNativeFunction("requestReset")();
  }
}

function pickNextStandaloneToy() {
  if (TOYS.length <= 1) return 0;
  let next = currentToyIndex;
  while (next === currentToyIndex) {
    next = Math.floor(Math.random() * TOYS.length);
  }
  return next;
}

const machine = new GachaponMachine(document.getElementById("scene-container"), {
  onSpinRequested: () => {
    unlockAudio();
    hideRevealCard();
    spinInFlight = true;

    if (canUsePlugin) {
      Juce.getNativeFunction("requestSpin")().then((result) => {
        machine.playSpinResult(result.toyIndex);
      });
      return;
    }

    machine.playSpinResult(pickNextStandaloneToy());
  },
  onRumble: () => playRumble(),
  onChime: () => playChime(),
  onRattleStart: () => startRattle(),
  onRattleStop: () => stopRattle(),
  onGlowChange: (active) => goldGlow.classList.toggle("active", active),
  onToyShown: (toyIndex) => {
    // The toy is now visibly out of the capsule — this is the moment the
    // real effect should actually take over (with a crossfade on the C++
    // side), not any earlier.
    updateStatusFooter(toyIndex);
    if (canUsePlugin) {
      Juce.getNativeFunction("confirmReveal")();
    }
  },
  onReveal: (toyIndex) => showRevealCard(toyIndex),
});

resetButton.addEventListener("click", handleResetClick);

if (canUsePlugin) {
  Juce.getNativeFunction("getActiveToy")().then((result) => {
    // Blank until the user has actually won a toy — don't claim the
    // default toy is "now playing" on a fresh insert.
    if (result.hasRevealed) {
      updateStatusFooter(result.toyIndex);
      machine.showSidebarToy(result.toyIndex);
    }
  });

  window.__JUCE__.backend.addEventListener("toySelected", (payload) => {
    updateStatusFooter(payload.toyIndex);

    // Only treat this as a genuine host-automation-driven change (and
    // update the sidebar display immediately) if it didn't come from our
    // own spin/reveal sequence — that path updates the sidebar itself,
    // via dismiss(), once the modal has actually closed.
    if (!spinInFlight) {
      machine.showSidebarToy(payload.toyIndex);
    }
  });

  window.__JUCE__.backend.addEventListener("playbackChanged", (payload) => {
    machine.setPlaybackInfo(payload);
    machine.setPluginActive(payload.pluginActive);
  });
} else {
  setMarqueeText("Standalone preview — no plugin backend connected");
  statusFooter.classList.add("visible");
}
