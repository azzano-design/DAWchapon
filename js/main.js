// Vendored (see js/vendor/) rather than imported across folders, so this
// page doesn't depend on files outside this folder — see ToyIcon.js's own
// header comment for the full reasoning.
import { GachaponMachine } from "./vendor/GachaponMachine.js";
import { ToyIcon } from "./vendor/ToyIcon.js";
import { preloadKeshiModel } from "./vendor/toyMesh.js";
import { playChime, playRumble, startRattle, stopRattle, unlockAudio } from "./vendor/sound.js";
import { TOYS, VARIANTS, pickVariant } from "./toyData.js";

// Mirrors plugin/WebUI/src/toyData.js (names/colors/taglines) plus longer copy for
// the comparison grid, written from the real per-toy DSP comments in
// plugin/Source/Toys/*Dsp.cpp.
const TOY_COPY = [
  {
    name: "Robo-Pal",
    color: "#8a94a6",
    tagline: "Turns your sound robotic",
    description:
      "Ring modulation, heavy bit-crush, and a narrow resonant bandpass filter combine for a classic telephone/robot-voice character — crunchy and unmistakably artificial.",
  },
  {
    name: "Zyxar",
    color: "#6ee7c7",
    tagline: "Blends in an alien synth layer",
    description:
      "A slow LFO sweeps a ring-modulated warble into a wobbling “alien transmission” tone, layered over a wide-detuned two-oscillator pad for a shimmering ambient bed underneath.",
  },
  {
    name: "Crumble",
    color: "#d97757",
    tagline: "Crunchy distortion grit",
    description:
      "Bright high-shelf pre-emphasis drives straight into a tanh waveshaper for warm, saturated overdrive — crunchy without losing the low end.",
  },
  {
    name: "Echo Spirit",
    color: "#c3b6f2",
    tagline: "Haunting filtered echoes",
    description:
      "A filtered-feedback slap delay whose repeats darken as they fade — each echo a little duller than the last, like it's trailing off into another room.",
  },
  {
    name: "Lo-Fi Bot",
    color: "#f2d06e",
    tagline: "Heavy lo-fi bitcrush",
    description:
      "Heavy sample-rate decimation and deep bit reduction for a flat, crunchy “old sampler” character — distinct from Robo-Pal's more resonant, formant-y voice.",
  },
];

const RARES = [
  { label: "Original", odds: "85% of pulls", variant: VARIANTS.ORIGINAL, description: "The standard ring-modulated, bit-crushed robot voice." },
  { label: "Silver", odds: "12% of pulls", variant: VARIANTS.SILVER, description: "Brighter and tighter — a higher carrier pitch and a narrower, more resonant filter." },
  { label: "Gold", odds: "3% of pulls", variant: VARIANTS.GOLD, description: "Deep and growly — the lowest carrier pitch and the heaviest crush of the three. The rarest finish." },
];
const ROBO_PAL_INDEX = 0;

// --- Pre-rendered stems (see tools/README.md) — switching tracks preserves
// the playhead and play/pause state instead of processing audio live, so
// there's no AudioContext/AudioWorklet involved for the music at all. ---
const DRY_TRACK_PATH = "assets/dawchapon-test.mp3";
const STEM_PATHS = [
  "assets/stems/robopal.mp3",
  "assets/stems/zyxar.mp3",
  "assets/stems/crumble.mp3",
  "assets/stems/echospirit.mp3",
  "assets/stems/lofibot.mp3",
];

const audio = document.getElementById("demo-audio");
let currentTrackPath = DRY_TRACK_PATH;

function swapTrack(path) {
  if (path === currentTrackPath) return;
  currentTrackPath = path;

  const wasPlaying = !audio.paused;
  const time = audio.currentTime;

  const resume = () => {
    audio.currentTime = time;
    // Deliberately doesn't start playback on its own — if the track wasn't
    // already playing (including if the user explicitly paused it),
    // turning the knob shouldn't start it; it should just be ready with
    // the right stem queued up for whenever they do hit play themselves.
    if (wasPlaying) audio.play().catch(() => {});
    audio.removeEventListener("loadedmetadata", resume);
  };
  audio.addEventListener("loadedmetadata", resume);

  audio.src = path;
};

const heroSection = document.querySelector(".hero");
const tryNowButton = document.getElementById("try-now");
const heroLock = document.getElementById("hero-lock");
const goldGlow = document.getElementById("gold-glow");

const playButton = document.getElementById("player-play");
const progressBar = document.getElementById("player-progress");
const progressFill = document.getElementById("player-progress-fill");
const currentTimeEl = document.getElementById("player-current-time");
const durationEl = document.getElementById("player-duration");
const nowPlayingLabel = document.getElementById("player-now-playing");

const toyGrid = document.getElementById("toy-grid");
const rareGrid = document.getElementById("rare-grid");

let activeToyIndex = null;
let activeVariant = null;
let pluginIsOn = false;

// Mirrors plugin/WebUI/src/main.js's pickNextStandaloneToy/pickNextStandaloneSpin:
// excludes both the currently active toy and whichever was active right
// before it, so a short run never repeats a toy within a 2-pull window.
let currentPickToy = 0;
let previousPickToy = -1;

function pickNextToy() {
  if (TOYS.length <= 1) return 0;
  let next = currentPickToy;
  while (next === currentPickToy || next === previousPickToy) {
    next = Math.floor(Math.random() * TOYS.length);
  }
  return next;
}

function pickNextSpin() {
  return { toyIndex: pickNextToy(), variant: pickVariant() };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function variantSuffix(variant) {
  if (variant === VARIANTS.GOLD) return " (Gold)";
  if (variant === VARIANTS.SILVER) return " (Silver)";
  return "";
}

function updateNowPlayingLabel() {
  nowPlayingLabel.textContent =
    pluginIsOn && activeToyIndex !== null
      ? `Now playing through: ${TOY_COPY[activeToyIndex].name}${variantSuffix(activeVariant)}`
      : "Now playing: unprocessed";
}

function highlightActiveCard() {
  [...toyGrid.children].forEach((card, index) => {
    card.classList.toggle("is-active", pluginIsOn && index === activeToyIndex);
  });
}

function renderToyGrid() {
  toyGrid.innerHTML = "";
  TOY_COPY.forEach((toy, index) => {
    const card = document.createElement("div");
    card.className = "toy-card";
    card.style.setProperty("--toy-color", toy.color);
    card.innerHTML = `
      <div class="toy-card-icon"></div>
      <span class="toy-card-name">${toy.name}</span>
      <span class="toy-card-tagline">${toy.tagline}</span>
      <p class="toy-card-description">${toy.description}</p>
    `;
    toyGrid.appendChild(card);

    // spin: false — these are a reference grid, not a product shot; a
    // static icon reads more clearly at a glance than a slowly rotating
    // one, and distinguishes them from the hero's own toy, which does spin.
    const icon = new ToyIcon(card.querySelector(".toy-card-icon"), { spin: false });
    icon.show(index, VARIANTS.ORIGINAL);
  });
  highlightActiveCard();
}

function renderRareGrid() {
  rareGrid.innerHTML = "";
  RARES.forEach((rare) => {
    const card = document.createElement("div");
    card.className = "rare-card" + (rare.variant === VARIANTS.GOLD ? " rare-card--gold" : "");
    card.innerHTML = `
      <div class="rare-card-icon"></div>
      <h3>${rare.label}</h3>
      <span class="rare-odds">${rare.odds}</span>
      <p>${rare.description}</p>
    `;
    rareGrid.appendChild(card);

    const icon = new ToyIcon(card.querySelector(".rare-card-icon"));
    icon.show(ROBO_PAL_INDEX, rare.variant);
  });
}

// --- The real gachapon machine, inlined (see js/vendor/GachaponMachine.js)
// — no iframe, no postMessage. Turning the knob drives everything below
// directly through these callbacks. ---
preloadKeshiModel();

const machine = new GachaponMachine(
  document.getElementById("scene-container"),
  {
    onSpinRequested: () => {
      unlockAudio();
      machine.playSpinResult(pickNextSpin());
    },
    onRumble: () => playRumble(),
    onChime: () => playChime(),
    onRattleStart: () => startRattle(),
    onRattleStop: () => stopRattle(),
    onGlowChange: (active) => goldGlow.classList.toggle("active", active),
    onToyShown: (toyIndex, variant) => {
      // The moment the real plugin's effect would actually take over — see
      // the matching comment in plugin/WebUI/src/main.js. This is what the audio
      // demo below is synced to, not onReveal.
      previousPickToy = currentPickToy;
      currentPickToy = toyIndex;

      activeToyIndex = toyIndex;
      activeVariant = variant;
      pluginIsOn = true;

      swapTrack(STEM_PATHS[toyIndex]);
      highlightActiveCard();
      updateNowPlayingLabel();
    },
    onReveal: () => {
      // No popup reveal card on the landing page (the "now playing" label
      // and highlighted grid card already say what was pulled) — dismiss
      // immediately rather than waiting on a multi-second card's own
      // timing, so the toy appears beside the machine right away and the
      // knob is ready for another turn without an artificial delay.
      machine.dismiss();
    },
  },
  { enableDebugGui: false }
);

tryNowButton.addEventListener("click", () => {
  heroSection.classList.add("is-revealed");
  heroLock.classList.add("hidden");
});

playButton.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", () => playButton.classList.add("is-playing"));
audio.addEventListener("pause", () => playButton.classList.remove("is-playing"));

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  progressFill.style.width = `${pct}%`;
});

progressBar.addEventListener("click", (event) => {
  const rect = progressBar.getBoundingClientRect();
  const pct = (event.clientX - rect.left) / rect.width;
  if (audio.duration) audio.currentTime = pct * audio.duration;
});

// Gentle Apple-style fade/slide-up as each section enters the viewport.
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    }
  },
  { threshold: 0.15 }
);
document.querySelectorAll("[data-reveal]").forEach((el) => revealObserver.observe(el));

renderToyGrid();
renderRareGrid();
updateNowPlayingLabel();
