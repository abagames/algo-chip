class NoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleFrame = 0;
    this.eventQueue = [];
    this.register = 1;
    this.mode = "short";
    this.periodCounter = 1;
    this.periodSamples = 1;
    this.amplitude = 0;
    this.envelope = 0;
    this.envelopeStep = 0;
    this.currentSample = 1;
    this.filterState = 0;
    this.filterAlpha = 1;
    this.releaseSamples = Math.round(0.02 * sampleRate);
    this.port.onmessage = (event) => this.enqueueEvent(event.data);
  }

  enqueueEvent(event) {
    if (event == null) {
      return;
    }
    // Immediate commands bypass the queue
    if (event.type === "clear") {
      this.applyEvent(event);
      return;
    }
    if (typeof event.sampleFrame !== "number") {
      return;
    }
    this.eventQueue.push(event);
    this.eventQueue.sort((a, b) => a.sampleFrame - b.sampleFrame);
  }

  applyEvent(event) {
    switch (event.type) {
      case "noteOn": {
        this.mode = event.mode === "long" ? "long" : "short";
        this.amplitude = Math.max(0, Math.min(1, event.amplitude ?? 0.5));
        const decaySamples = Math.max(1, event.decaySamples ?? Math.round(0.1 * sampleRate));
        this.periodSamples = Math.max(1, event.periodSamples ?? 1);
        this.periodCounter = 0;
        this.envelope = this.amplitude;
        this.envelopeStep = this.amplitude / decaySamples;
        this.releaseSamples = Math.max(1, event.releaseSamples ?? Math.round(0.02 * sampleRate));
        const cutoffHz = Math.max(100, Math.min(sampleRate / 2, event.cutoffHz ?? 6000));
        this.filterAlpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
        break;
      }
      case "noteOff": {
        const releaseSamples = Math.max(1, event.releaseSamples ?? this.releaseSamples);
        if (this.envelope > 0) {
          this.envelopeStep = this.envelope / releaseSamples;
        }
        break;
      }
      case "setParam":
        if (event.param === "mode") {
          this.mode = event.value === "long" ? "long" : "short";
        }
        break;
      case "stop":
        this.envelope = 0;
        break;
      case "clear":
        this.eventQueue = [];
        this.envelope = 0;
        this.register = 1;
        this.filterState = 0;
        break;
      default:
        break;
    }
  }

  stepRegister() {
    const feedbackBit = this.mode === "short" ? 6 : 1;
    const bit0 = this.register & 1;
    const bit1 = (this.register >> feedbackBit) & 1;
    const feedback = bit0 ^ bit1;
    this.register = (this.register >> 1) | (feedback << 14);
    return bit0 ? 1 : -1;
  }

  process(_, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }

    for (let i = 0; i < output.length; i++) {
      const absoluteFrame = this.sampleFrame + i;
      while (this.eventQueue.length && this.eventQueue[0].sampleFrame <= absoluteFrame) {
        this.applyEvent(this.eventQueue.shift());
      }

      if (this.periodCounter <= 0) {
        this.currentSample = this.stepRegister();
        this.periodCounter += this.periodSamples;
      }
      this.periodCounter--;

      const raw = this.currentSample ?? 1;
      let env = this.envelope;
      if (env > 0) {
        env = Math.max(0, env - this.envelopeStep);
        this.envelope = env;
      }
      const sample = raw * env;
      this.filterState += this.filterAlpha * (sample - this.filterState);
      output[i] = this.filterState;
    }

    this.sampleFrame += output.length;
    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
