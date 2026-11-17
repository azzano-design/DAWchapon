import * as Juce from "@juce-framework/webview";

import { GachaponMachine } from "./scene/GachaponMachine.js";
import { ToyIcon } from "./scene/ToyIcon.js";
import { preloadKeshiModel } from "./scene/toyMesh.js";
import { getToy, TOYS, VARIANTS, pickVariant } from "./toyData.js";
import { playChime, playRumble, startRattle, stopRattle, unlockAudio } from "./sound.js";

// Force the standalone demo fallback below even if a real backend *is*
// detected (see canUsePlugin) — not needed for ordinary `npm run dev` work
// in a plain browser, since canUsePlugin already detects that case on its
// own; this is only for the rare case of wanting the demo fallback while
// actually running inside the plugin.
const FORCE_STANDALONE_DEMO = false;

// @juce-framework/webview defines a placeholder `window.__JUCE__` even
// outside a real plugin (see its check_native_interop.ts), so "is __JUCE__
// defined" alone can't tell a plain browser apart from the real thing. A
// real backend populates initialisationData.__juce__functions with every
// name registered via withNativeFunction() on the C++ side (see
// PluginEditor.cpp); the placeholder leaves that array empty. Checking for
// "requestSpin" there is what actually distinguishes the two.
//
// Getting this wrong doesn't throw — calling a native function that was
// never registered on this placeholder just emits a message nobody
// answers, so the promise it returns hangs forever rather than rejecting.
// That's what used to make the knob appear to get stuck mid-spin when
// testing in a plain browser: onSpinRequested would call the (nonexistent)
// real requestSpin() and just never hear back, instead of falling through
// to the standalone demo logic below.
const canUsePlugin =
  !FORCE_STANDALONE_DEMO &&
  typeof window.__JUCE__ !== "undefined" &&
  window.__JUCE__.initialisationData.__juce__functions.includes("requestSpin");

// Posts a message to whatever page has this app in an iframe — currently
// just the marketing landing page's hero demo, which listens for these to
// drive its own live Web Audio preview in step with the knob. A harmless
// no-op everywhere else: running standalone or inside the real plugin's
// WebBrowserComponent, window.parent === window, so this just posts to
// itself with nothing listening.
function notifyEmbedder(type, data = {}) {
  window.parent.postMessage({ source: "dawchapon-webui", type, ...data }, "*");
}

// Cycles deterministically through every toy+variant combo in order
// instead of the usual weighted random pick, for demoing the full set of
// pulls without waiting on rare-pull odds. Only affects the standalone
// demo fallback below (canUsePlugin above) — the real plugin backend has
// no way to receive this from the WebUI, so it keeps its own authoritative
// RNG regardless. Run `npm run dev -- --mode test` (or `npm run dev:test`)
// to turn it on; Vite surfaces that here as import.meta.env.MODE.
const TEST_MODE = import.meta.env.MODE === "test";

// Shows the lil-gui lighting panel for hand-tuning lights/exposure during
// visual work. Tied to TEST_MODE rather than always-on, so `npm run dev`
// stays a clean preview of the real UI and the panel only shows up for
// `npm run dev:test` (or `npm run dev -- --mode test`).
const SHOW_LIGHTING_GUI = TEST_MODE;

const statusFooter = document.querySelector("#status-footer");
const marqueeTrack = statusFooter.querySelector(".marquee-track");
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
// The toy active immediately before currentToyIndex — mirrors the real
// backend's previousToyIndex in PluginProcessor.cpp. -1 means no history
// yet (fresh load, or just after a reset).
let previousToyIndex = -1;
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

// The marquee's seamless loop (see @keyframes marquee-scroll in index.html)
// works by scrolling the track exactly -50% of its own width, then jumping
// back to 0 — which only looks continuous if the first half's content is
// already at least as wide as the footer, so the second half has fully
// caught up to cover the gap the moment the loop resets. A single hardcoded
// pair of copies (the old markup) is nowhere near wide enough on a large
// window with short status text, leaving a visible blank stretch each
// loop. So instead this builds however many identical copies are needed to
// clear the footer's current width, then duplicates that whole set once
// more for the second half — both halves end up equal-width automatically,
// since they're made of the same number of identical copies.
const MARQUEE_SPEED_PX_PER_SEC = 90;
const MARQUEE_MIN_DURATION_S = 6;

let currentMarqueeText = "";

function layoutMarqueeTrack() {
  marqueeTrack.replaceChildren();
  marqueeTrack.style.animationDuration = "";

  if (!currentMarqueeText) return;

  // The first copy is the one assistive tech should actually read;
  // appending it before measuring also lets its own rendered width stand
  // in for "one copy's width" — that depends on the font/letter-spacing,
  // not just character count, so it has to be measured, not estimated.
  const firstCopy = document.createElement("span");
  firstCopy.className = "marquee-text";
  firstCopy.textContent = currentMarqueeText;
  marqueeTrack.appendChild(firstCopy);
  const singleWidth = firstCopy.offsetWidth || 1;

  const footerWidth = statusFooter.clientWidth || window.innerWidth;
  const copiesPerHalf = Math.max(1, Math.ceil(footerWidth / singleWidth));

  // The first copy above already covers one slot; fill in the rest of
  // both halves (all purely decorative repeats) to match.
  for (let i = 1; i < copiesPerHalf * 2; i += 1) {
    const span = document.createElement("span");
    span.className = "marquee-text";
    span.textContent = currentMarqueeText;
    span.setAttribute("aria-hidden", "true");
    marqueeTrack.appendChild(span);
  }

  // Keeps the visual scroll speed constant regardless of how many copies
  // got added above — without this, a wide window (more copies, so a
  // wider half) would cover that greater distance in the same fixed
  // duration and the marquee would visibly speed up.
  const halfWidth = singleWidth * copiesPerHalf;
  const duration = Math.max(MARQUEE_MIN_DURATION_S, halfWidth / MARQUEE_SPEED_PX_PER_SEC);
  marqueeTrack.style.animationDuration = `${duration}s`;
}

function setMarqueeText(text) {
  currentMarqueeText = text;
  layoutMarqueeTrack();
}

// The footer can get wider at runtime too — the plugin editor window is
// user-resizable (see setResizable() in PluginEditor.cpp) — so the repeat
// count and duration above need to be able to change after the fact, not
// just once at startup.
window.addEventListener("resize", () => layoutMarqueeTrack());

function updateStatusFooter(toyIndex) {
  previousToyIndex = currentToyIndex;
  currentToyIndex = toyIndex;
  const toy = getToy(toyIndex);
  setMarqueeText(`Now playing: ${toy.name} — ${toy.effect}`);
  statusFooter.classList.add("visible");
}

const revealVariant = revealCard.querySelector(".reveal-variant");

function showRevealCard(toyIndex, variant = VARIANTS.ORIGINAL) {
  const toy = getToy(toyIndex);
  revealIcon.show(toyIndex, variant);
  revealName.textContent = toy.name;
  revealEffect.textContent = toy.effect;

  if (variant === VARIANTS.GOLD) {
    revealVariant.textContent = "GOLD VARIANT";
    revealVariant.className = "reveal-variant gold visible";
  } else if (variant === VARIANTS.SILVER) {
    revealVariant.textContent = "SILVER VARIANT";
    revealVariant.className = "reveal-variant silver visible";
  } else {
    revealVariant.textContent = "";
    revealVariant.className = "reveal-variant";
  }

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
  previousToyIndex = -1;

  if (canUsePlugin) {
    Juce.getNativeFunction("requestReset")();
  }
}

// Excludes both the currently active toy and whichever one was active
// immediately before it, so a short run never repeats a toy within a
// 2-pull window (e.g. A, B, A is no longer possible) — mirrors the real
// backend's requestSpin() exclusion in PluginProcessor.cpp.
function pickNextStandaloneToy() {
  if (TOYS.length <= 1) return 0;
  let next = currentToyIndex;
  while (next === currentToyIndex || next === previousToyIndex) {
    next = Math.floor(Math.random() * TOYS.length);
  }
  return next;
}

// Standalone (no-plugin-backend) demo fallback for a spin: toy choice
// always changes (see pickNextStandaloneToy), variant choice is
// independently weighted (see pickVariant/VARIANT_WEIGHTS in toyData.js),
// checked only after the toy exclusion above. The real backend makes this
// same combined choice itself, authoritatively — see the canUsePlugin
// branch in onSpinRequested below.
function pickNextStandaloneSpin() {
  return { toyIndex: pickNextStandaloneToy(), variant: pickVariant() };
}

// TEST_MODE fallback: walks every toy+variant combo in a fixed order
// (Robo-Pal/Original, Robo-Pal/Silver, Robo-Pal/Gold, Zyxar/Original, ...)
// rather than picking at random, so a demo can show off the full set of
// pulls — including the rare ones — without waiting on the odds.
const TEST_MODE_VARIANT_ORDER = Object.values(VARIANTS);
let testModeComboCursor = 0;

function pickNextTestModeSpin() {
  const toyIndex = Math.floor(testModeComboCursor / TEST_MODE_VARIANT_ORDER.length) % TOYS.length;
  const variant = TEST_MODE_VARIANT_ORDER[testModeComboCursor % TEST_MODE_VARIANT_ORDER.length];
  testModeComboCursor += 1;
  return { toyIndex, variant };
}

// Fire-and-forget: starts the (sizeable) toy model loading immediately,
// in parallel with everything below, so it's as ready as possible by the
// time a toy actually needs to be shown. Deliberately NOT awaited here —
// nothing about the machine itself, or any plugin event wiring (playback
// sync, host automation, reset), should ever be gated behind this load.
// GachaponMachine.showSidebarToy() and ToyIcon.show() each await it
// internally, right before they actually need the geometry.
preloadKeshiModel();

const machine = new GachaponMachine(document.getElementById("scene-container"), {
  onSpinRequested: () => {
    unlockAudio();
    hideRevealCard();
    spinInFlight = true;
    notifyEmbedder("spinRequested");

    if (canUsePlugin) {
      Juce.getNativeFunction("requestSpin")().then((result) => {
        machine.playSpinResult({ toyIndex: result.toyIndex, variant: result.variant });
      });
      return;
    }

    machine.playSpinResult(TEST_MODE ? pickNextTestModeSpin() : pickNextStandaloneSpin());
  },
  onRumble: () => playRumble(),
  onChime: () => playChime(),
  onRattleStart: () => startRattle(),
  onRattleStop: () => stopRattle(),
  onGlowChange: (active) => goldGlow.classList.toggle("active", active),
  onToyShown: (toyIndex, variant) => {
    // The toy is now visibly out of the capsule — this is the moment the
    // real effect should actually take over (with a crossfade on the C++
    // side), not any earlier.
    updateStatusFooter(toyIndex);
    notifyEmbedder("toyShown", { toyIndex, variant });
    if (canUsePlugin) {
      Juce.getNativeFunction("confirmReveal")();
    }
  },
  onReveal: (toyIndex, variant) => showRevealCard(toyIndex, variant),
}, {
  enableDebugGui: SHOW_LIGHTING_GUI,
});

resetButton.addEventListener("click", handleResetClick);

if (canUsePlugin) {
  Juce.getNativeFunction("getActiveToy")().then((result) => {
    // Blank until the user has actually won a toy — don't claim the
    // default toy is "now playing" on a fresh insert.
    if (result.hasRevealed) {
      updateStatusFooter(result.toyIndex);
      machine.showSidebarToy(result.toyIndex, result.variant);
    }
  });

  window.__JUCE__.backend.addEventListener("toySelected", (payload) => {
    updateStatusFooter(payload.toyIndex);

    // Only treat this as a genuine host-automation-driven change (and
    // update the sidebar display immediately) if it didn't come from our
    // own spin/reveal sequence — that path updates the sidebar itself,
    // via dismiss(), once the modal has actually closed.
    if (!spinInFlight) {
      machine.showSidebarToy(payload.toyIndex, payload.variant);
    }
  });

  window.__JUCE__.backend.addEventListener("playbackChanged", (payload) => {
    machine.setPlaybackInfo(payload);
    machine.setPluginActive(payload.pluginActive);
  });
} else {
  setMarqueeText(
    TEST_MODE
      ? "Standalone preview — test mode: cycling every toy+variant combo in order"
      : "Standalone preview — no plugin backend connected"
  );
  statusFooter.classList.add("visible");
}
