const TRI_TABLE = (() => {
  const values = new Float32Array(32);
  for (let i = 0; i < 32; i++) {
    const step = i < 16 ? 15 - i : i - 16;
    values[i] = (step / 15) * 2 - 1;
  }
  return values;
})();

class TriangleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleFrame = 0;
    this.eventQueue = [];
    this.amplitude = 0;
    this.baseFrequency = 0;
    this.pitchOverride = 0;
    this.phase = 0;
    this.slide = null;
    this.slideCurve = "linear";
    this.port.onmessage = (event) => this.enqueueEvent(event.data);
  }

  enqueueEvent(event) {
    if (event == null) {
      return;
    }
    // Immediate commands bypass the queue
    if (event.type === "clear") {
      this.applyEvent(event, this.sampleFrame);
      return;
    }
    if (typeof event.sampleFrame !== "number") {
      return;
    }
    this.eventQueue.push(event);
    this.eventQueue.sort((a, b) => a.sampleFrame - b.sampleFrame);
  }

  applyEvent(event, currentFrame = this.sampleFrame) {
    switch (event.type) {
      case "noteOn":
        this.baseFrequency = event.frequency || 0;
        this.amplitude = Math.max(0, Math.min(1, event.amplitude ?? 0.8));
        this.pitchOverride = 0;
        this.slide = null;
        break;
      case "noteOff":
        this.amplitude = 0;
        this.slide = null;
        break;
      case "setParam":
        if (event.param === "gain" && typeof event.value === "number") {
          this.amplitude = Math.max(0, Math.min(1, event.value));
        } else if (event.param === "pitchBend" && typeof event.value === "number") {
          // Support both immediate pitch override (legacy) and smooth sweep (SE)
          if (event.rampDuration && event.rampDuration > 0) {
            // Smooth pitch sweep for SE
            const targetFrequency = event.value;
            const durationSamples = Math.max(1, Math.round(event.rampDuration * sampleRate));
            this.slideCurve = event.curve ?? "linear";
            const frame =
              typeof event.sampleFrame === "number" ? event.sampleFrame : currentFrame;
            const currentFrequency = this.computeFrequency(frame);
            this.baseFrequency = currentFrequency;
            this.slide = {
              startFrame: frame,
              startFrequency: currentFrequency,
              targetFrequency: targetFrequency,
              durationSamples: durationSamples
            };
            this.pitchOverride = 0;
          } else {
            // Immediate pitch override (BGM compatibility)
            this.pitchOverride = Math.max(0, event.value);
            this.slide = null;
          }
        }
        break;
      case "stop":
        this.amplitude = 0;
        break;
      case "clear":
        this.eventQueue = [];
        this.amplitude = 0;
        this.phase = 0;
        this.pitchOverride = 0;
        this.slide = null;
        break;
      default:
        break;
    }
  }

  computeFrequency(currentFrame) {
    // Priority: slide > pitchOverride > baseFrequency
    if (this.slide) {
      const elapsed = currentFrame - this.slide.startFrame;
      if (elapsed >= this.slide.durationSamples) {
        this.baseFrequency = this.slide.targetFrequency;
        this.slide = null;
        return this.baseFrequency;
      }
      const ratio = elapsed / this.slide.durationSamples;

      // Apply curve (linear or exponential)
      let curvedRatio = ratio;
      if (this.slideCurve === "exponential") {
        curvedRatio = ratio * ratio * ratio;
      }

      return this.slide.startFrequency + (this.slide.targetFrequency - this.slide.startFrequency) * curvedRatio;
    }

    if (this.pitchOverride > 0) {
      return this.pitchOverride;
    }

    return this.baseFrequency;
  }

  process(_, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }

    for (let i = 0; i < output.length; i++) {
      const absoluteFrame = this.sampleFrame + i;
      while (this.eventQueue.length && this.eventQueue[0].sampleFrame <= absoluteFrame) {
        this.applyEvent(this.eventQueue.shift(), absoluteFrame);
      }

      const frequency = this.computeFrequency(absoluteFrame);
      if (this.amplitude > 0 && frequency > 0) {
        const phaseIncrement = (frequency * 32) / sampleRate;
        this.phase = (this.phase + phaseIncrement) % 32;
        const index = this.phase | 0;
        output[i] = TRI_TABLE[index] * this.amplitude;
      } else {
        output[i] = 0;
      }
    }

    this.sampleFrame += output.length;
    return true;
  }
}

registerProcessor("triangle-processor", TriangleProcessor);
