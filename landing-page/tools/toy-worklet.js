// A small AudioWorkletProcessor implementing the two DSP primitives native
// Web Audio nodes can't do on their own: ring modulation (multiplying the
// input by an internally-generated carrier, optionally swept by a slow LFO)
// and sample/bit crushing (sample-and-hold decimation + quantization).
// Everything else each toy needs (bandpass/highshelf/lowpass filtering,
// waveshaping, delay+feedback) is a native BiquadFilterNode/WaveShaperNode/
// DelayNode instead — see audio-engine.js for how the two are combined.
//
// This is a simplified, browser-side approximation of the real plugin's C++
// DSP (see Source/Toys/*.cpp) for demo purposes, not a byte-for-byte port.
class ToyProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "carrierHz", defaultValue: 0, minValue: 0, maxValue: 2000 },
      { name: "carrierSweepHz", defaultValue: 0, minValue: 0, maxValue: 2000 },
      { name: "carrierLfoHz", defaultValue: 0, minValue: 0, maxValue: 10 },
      { name: "ringModAmount", defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: "bitDepth", defaultValue: 16, minValue: 1, maxValue: 16 },
      { name: "sampleHoldHz", defaultValue: 44100, minValue: 1, maxValue: 44100 },
    ];
  }

  constructor() {
    super();
    this._carrierPhase = 0;
    this._lfoPhase = 0;
    this._holdValueL = 0;
    this._holdValueR = 0;
    this._phaseAccumulator = 0;
  }

  // Reads index `i` of an AudioParam array that may have been given as
  // either a single (k-rate) value or a full a-rate array, depending on
  // whether anything ever calls .linearRampToValueAtTime etc. on it.
  static sampleParam(param, i) {
    return param.length > 1 ? param[i] : param[0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const sampleRate = globalThis.sampleRate;
    const numChannels = output.length;

    for (let i = 0; i < output[0].length; i++) {
      const carrierHz = ToyProcessor.sampleParam(parameters.carrierHz, i);
      const carrierSweepHz = ToyProcessor.sampleParam(parameters.carrierSweepHz, i);
      const carrierLfoHz = ToyProcessor.sampleParam(parameters.carrierLfoHz, i);
      const ringModAmount = ToyProcessor.sampleParam(parameters.ringModAmount, i);
      const bitDepth = ToyProcessor.sampleParam(parameters.bitDepth, i);
      const sampleHoldHz = ToyProcessor.sampleParam(parameters.sampleHoldHz, i);

      // --- Ring modulation, optionally LFO-swept (Zyxar's wobble; a
      // static carrier when carrierLfoHz/carrierSweepHz are 0, as in
      // Robo-Pal) ---
      let carrierSample = 0;
      if (ringModAmount > 0) {
        this._lfoPhase += (2 * Math.PI * carrierLfoHz) / sampleRate;
        if (this._lfoPhase > 2 * Math.PI) this._lfoPhase -= 2 * Math.PI;
        const lfo = carrierLfoHz > 0 ? Math.sin(this._lfoPhase) : 0;
        const instantaneousHz = carrierHz + carrierSweepHz * lfo;

        this._carrierPhase += (2 * Math.PI * instantaneousHz) / sampleRate;
        if (this._carrierPhase > 2 * Math.PI) this._carrierPhase -= 2 * Math.PI;
        carrierSample = Math.sin(this._carrierPhase);
      }

      // --- Sample-and-hold decimation + bit quantization (Robo-Pal /
      // Lo-Fi Bot's crunchy crush) ---
      const samplesPerHold = sampleRate / Math.max(1, sampleHoldHz);
      this._phaseAccumulator += 1;
      const takeNewHold = this._phaseAccumulator >= samplesPerHold;
      if (takeNewHold) this._phaseAccumulator -= samplesPerHold;

      const quantSteps = Math.pow(2, bitDepth);

      for (let ch = 0; ch < numChannels; ch++) {
        const inCh = input[Math.min(ch, input.length - 1)];
        const dry = inCh ? inCh[i] : 0;

        let wet = dry;
        if (ringModAmount > 0) wet = dry * (1 - ringModAmount) + dry * carrierSample * ringModAmount;

        if (bitDepth < 16) {
          if (ch === 0) {
            if (takeNewHold) this._holdValueL = wet;
            wet = Math.round(this._holdValueL * quantSteps) / quantSteps;
          } else {
            if (takeNewHold) this._holdValueR = wet;
            wet = Math.round(this._holdValueR * quantSteps) / quantSteps;
          }
        }

        output[ch][i] = wet;
      }
    }

    return true;
  }
}

registerProcessor("toy-processor", ToyProcessor);
