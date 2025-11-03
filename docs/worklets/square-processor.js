const MAX_AMPLITUDE = 0.9;

class SquareProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleFrame = 0;
    this.eventQueue = [];
    this.amplitude = 0;
    this.duty = 0.5;
    this.phase = 0;
    this.baseFrequency = 0;
    this.currentFrequency = 0;
    this.slide = null;
    this.slideCurve = "linear"; // "linear" or "exponential"
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
      case "noteOn":
        this.baseFrequency = event.frequency || 0;
        this.currentFrequency = this.baseFrequency;
        this.amplitude = Math.min(MAX_AMPLITUDE, Math.max(0, event.amplitude ?? MAX_AMPLITUDE));
        if (typeof event.duty === "number") {
          this.duty = Math.min(0.99, Math.max(0.01, event.duty));
        }
        if (event.slide && typeof event.slide.durationSamples === "number") {
          this.slideCurve = "linear"; // noteOn slides are always linear (for BGM compatibility)
          this.slide = {
            startFrame: event.sampleFrame,
            startFrequency: this.baseFrequency,
            targetFrequency: event.slide.targetFrequency ?? this.baseFrequency,
            durationSamples: Math.max(1, event.slide.durationSamples)
          };
        } else {
          this.slide = null;
        }
        break;
      case "noteOff":
        this.amplitude = 0;
        this.slide = null;
        break;
      case "setParam":
        if (event.param === "duty" && typeof event.value === "number") {
          this.duty = Math.min(0.99, Math.max(0.01, event.value));
        }
        // Handle pitchBend for SE pitch sweeps
        if (event.param === "pitchBend" && typeof event.value === "number") {
          const targetFrequency = event.value;
          const rampDuration = event.rampDuration ?? 0;
          const durationSamples = Math.max(1, Math.round(rampDuration * sampleRate));
          this.slideCurve = event.curve ?? "linear";
          this.slide = {
            startFrame: event.sampleFrame,
            startFrequency: this.baseFrequency,
            targetFrequency: targetFrequency,
            durationSamples: durationSamples
          };
        }
        break;
      case "stop":
        this.amplitude = 0;
        this.slide = null;
        break;
      case "clear":
        this.eventQueue = [];
        this.amplitude = 0;
        this.slide = null;
        this.phase = 0;
        break;
      default:
        break;
    }
  }

  computeFrequency(currentFrame) {
    if (!this.slide) {
      return this.baseFrequency;
    }
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
      // Exponential curve for more natural pitch sweeps (like chiptune hardware)
      // Use cubic curve for stronger acceleration (slower start, faster end)
      curvedRatio = ratio * ratio * ratio;
    }

    return this.slide.startFrequency + (this.slide.targetFrequency - this.slide.startFrequency) * curvedRatio;
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

      const freq = this.computeFrequency(absoluteFrame);
      if (this.amplitude > 0 && freq > 0) {
        const phaseIncrement = freq / sampleRate;
        this.phase += phaseIncrement;
        if (this.phase >= 1) {
          this.phase -= Math.floor(this.phase);
        }
        const sample = this.phase < this.duty ? this.amplitude : -this.amplitude;
        output[i] = sample;
      } else {
        output[i] = 0;
      }
    }

    this.sampleFrame += output.length;
    return true;
  }
}

registerProcessor("square-processor", SquareProcessor);
