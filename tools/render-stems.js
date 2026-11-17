// Build tool (not shipped — see README note in this folder): offline-renders
// assets/dawchapon-test.mp3 through each toy's DSP chain using an
// OfflineAudioContext, so the pre-rendered stems the live page switches
// between (see js/main.js) are generated from the exact same effect graphs
// that were designed/tuned live in the browser — not a separate reimplementation
// that could drift from them. Driven by run-render-stems.mjs via Playwright.
//
// TOY_BUILDERS below is the same logic that used to live in js/audio-engine.js
// (now retired from the shipped page — see main.js for why) — kept here only
// because this tool still needs it.

const TOY_BUILDERS = [
  // 0 Robo-Pal — ring-modulated, bit-crushed, bandpass-filtered telephone
  // voice. Pure ring mod (no dry blend) + heavy crush + narrow bandpass.
  (ctx, workletNode) => {
    workletNode.parameters.get("carrierHz").value = 55;
    workletNode.parameters.get("carrierSweepHz").value = 0;
    workletNode.parameters.get("carrierLfoHz").value = 0;
    workletNode.parameters.get("ringModAmount").value = 1;
    workletNode.parameters.get("bitDepth").value = 8;
    workletNode.parameters.get("sampleHoldHz").value = 8000;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1200;
    bandpass.Q.value = 1.1;

    workletNode.connect(bandpass);
    return { input: workletNode, output: bandpass };
  },

  // 1 Zyxar — LFO-swept ring-mod warble plus a detuned two-oscillator pad
  // layered underneath for a shimmering alien-ambience bed.
  (ctx, workletNode) => {
    workletNode.parameters.get("carrierHz").value = 170;
    workletNode.parameters.get("carrierSweepHz").value = 130;
    workletNode.parameters.get("carrierLfoHz").value = 0.35;
    workletNode.parameters.get("ringModAmount").value = 0.6;
    workletNode.parameters.get("bitDepth").value = 16;
    workletNode.parameters.get("sampleHoldHz").value = 44100;

    const mixBus = ctx.createGain();
    mixBus.gain.value = 1;
    workletNode.connect(mixBus);

    const padGain = ctx.createGain();
    padGain.gain.value = 0.35;
    const padOscA = ctx.createOscillator();
    padOscA.frequency.value = 220 * Math.pow(2, 30 / 1200);
    const padOscB = ctx.createOscillator();
    padOscB.frequency.value = 220 * Math.pow(2, -30 / 1200);
    padOscA.connect(padGain);
    padOscB.connect(padGain);
    padGain.connect(mixBus);
    padOscA.start(0);
    padOscB.start(0);

    return { input: workletNode, output: mixBus };
  },

  // 2 Crumble — bright pre-emphasis driven into a tanh waveshaper for warm,
  // crunchy saturation. No ring-mod/crush needed, so the worklet is
  // bypassed entirely for this one.
  (ctx) => {
    const preEmphasis = ctx.createBiquadFilter();
    preEmphasis.type = "highshelf";
    preEmphasis.frequency.value = 2000;
    preEmphasis.gain.value = 2.5;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(3 * x);
    }
    shaper.curve = curve;

    const outputTrim = ctx.createGain();
    outputTrim.gain.value = Math.pow(10, -4 / 20);

    preEmphasis.connect(shaper).connect(outputTrim);
    return { input: preEmphasis, output: outputTrim, bypassWorklet: true };
  },

  // 3 Echo Spirit — filtered feedback delay: repeats that darken as they
  // fade. The dry signal is summed back in inside the chain itself (as the
  // real DSP does).
  (ctx) => {
    const inputGain = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.18;

    const feedbackFilter = ctx.createBiquadFilter();
    feedbackFilter.type = "lowpass";
    feedbackFilter.frequency.value = 2200;

    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.45;

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.4;

    const mixOut = ctx.createGain();

    inputGain.connect(delay);
    delay.connect(feedbackFilter);
    feedbackFilter.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(mixOut);
    inputGain.connect(mixOut);

    return { input: inputGain, output: mixOut, bypassWorklet: true };
  },

  // 4 Lo-Fi Bot — heavy sample-rate decimation + deep bit reduction, for a
  // flat, crunchy "old sampler" character. No ring mod, just crush.
  (ctx, workletNode) => {
    workletNode.parameters.get("carrierHz").value = 0;
    workletNode.parameters.get("carrierSweepHz").value = 0;
    workletNode.parameters.get("carrierLfoHz").value = 0;
    workletNode.parameters.get("ringModAmount").value = 0;
    workletNode.parameters.get("bitDepth").value = 5;
    workletNode.parameters.get("sampleHoldHz").value = 4000;

    const antiAlias = ctx.createBiquadFilter();
    antiAlias.type = "lowpass";
    antiAlias.frequency.value = 3500;

    workletNode.connect(antiAlias);
    return { input: workletNode, output: antiAlias };
  },
];

let cachedDryBuffer = null;

async function getDryBuffer() {
  if (cachedDryBuffer) return cachedDryBuffer;
  const response = await fetch("../assets/dawchapon-test.mp3");
  const arrayBuffer = await response.arrayBuffer();
  // Decoded with a throwaway realtime context — AudioBuffer itself isn't
  // tied to whichever context decoded it, so this can be reused across
  // every OfflineAudioContext render below without re-fetching/decoding.
  const probeCtx = new (window.AudioContext || window.webkitAudioContext)();
  cachedDryBuffer = await probeCtx.decodeAudioData(arrayBuffer);
  await probeCtx.close();
  return cachedDryBuffer;
}

async function renderToy(toyIndex) {
  const dryBuffer = await getDryBuffer();
  const offlineCtx = new OfflineAudioContext(dryBuffer.numberOfChannels, dryBuffer.length, dryBuffer.sampleRate);
  await offlineCtx.audioWorklet.addModule("./toy-worklet.js");

  const source = offlineCtx.createBufferSource();
  source.buffer = dryBuffer;

  const build = TOY_BUILDERS[toyIndex];
  const workletNode = new AudioWorkletNode(offlineCtx, "toy-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const result = build(offlineCtx, workletNode);

  if (result.bypassWorklet) {
    source.connect(result.input);
  } else {
    source.connect(workletNode);
  }
  result.output.connect(offlineCtx.destination);

  source.start(0);

  return offlineCtx.startRendering();
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Exposed for run-render-stems.mjs to call via page.evaluate().
window.renderStemToBase64Wav = async function (toyIndex) {
  const rendered = await renderToy(toyIndex);
  return arrayBufferToBase64(audioBufferToWav(rendered));
};
