let audioCtx = null;

function getContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Browsers only allow starting audio from inside a user-gesture handler.
// Call this synchronously from the pointer event that starts a spin, before
// any async/animation-frame work happens.
export function unlockAudio() {
  getContext();
}

// A short filtered-noise thump for the capsule landing in the dispenser.
export function playRumble() {
  const ctx = getContext();
  const now = ctx.currentTime;
  const duration = 0.35;

  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(260, now);
  filter.frequency.exponentialRampToValueAtTime(70, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.6, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration);
}

let reverbImpulse = null;

// A short synthesized impulse response (exponentially-decaying noise) so a
// ConvolverNode can add room tone without needing an external audio asset.
function getReverbImpulse(ctx) {
  if (reverbImpulse) return reverbImpulse;

  const duration = 1.1;
  const decay = 3.2;
  const length = Math.floor(ctx.sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  reverbImpulse = impulse;
  return impulse;
}

let rattleHandle = null;

// A looping plasticky "capsules shifting around" rattle, started while the
// bin capsules are bouncing and stopped when they settle. The texture is
// baked once into a looping buffer (several short random-noise clicks at
// random offsets) rather than driven by a live oscillator, so it loops
// cleanly and cheaply.
export function startRattle() {
  if (rattleHandle) return;
  const ctx = getContext();

  const duration = 0.6;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  const numClicks = 14;
  for (let c = 0; c < numClicks; c += 1) {
    const clickStart = Math.floor(Math.random() * bufferSize * 0.9);
    const clickLength = Math.floor(ctx.sampleRate * (0.008 + Math.random() * 0.018));
    for (let i = 0; i < clickLength && clickStart + i < bufferSize; i += 1) {
      const decay = 1 - i / clickLength;
      data[clickStart + i] += (Math.random() * 2 - 1) * decay * decay;
    }
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.08);

  // A little room tone over the dry clicks takes the edge off — straight
  // bandpassed clicks alone read as harsh/grating.
  const convolver = ctx.createConvolver();
  convolver.buffer = getReverbImpulse(ctx);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.75;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.4;

  noise.connect(filter);
  filter.connect(dryGain);
  filter.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(gain);
  wetGain.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  rattleHandle = { noise, gain };
}

export function stopRattle() {
  if (!rattleHandle) return;
  const ctx = getContext();
  const { noise, gain } = rattleHandle;
  const now = ctx.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  noise.stop(now + 0.15);
  rattleHandle = null;
}

// A bright little chime for the gold-glow reveal moment.
export function playChime() {
  const ctx = getContext();
  const now = ctx.currentTime;
  const freqs = [880, 1318.5, 1760];

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    const gain = ctx.createGain();
    const start = now + i * 0.06;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.5);
  });
}
