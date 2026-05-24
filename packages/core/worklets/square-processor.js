const MAX_AMPLITUDE = 0.9;
// NES 2A03 base clock (1.789773 MHz)
const CHIP_BASE_CLOCK = 1_789_773;

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

    // Hardware sweep unit (NES APU sweep, fires at ~120 Hz = frame counter / 2)
    this.sweepEnabled = false;
    this.sweepNegate = false;
    this.sweepShift = 0;   // 0-7: bits to shift the timer period
    this.sweepPeriod = 0;  // 0-7: half-frames between sweep ticks
    this.sweepSamplesPerHalfFrame = Math.round(sampleRate / 120);
    this.sweepCounter = this.sweepSamplesPerHalfFrame;
    this.sweepTimerPeriod = 0; // NES 11-bit timer period
    this.sweepMuted = false;

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
        this.currentFrequency = this.baseFrequency;
        this.amplitude = Math.min(MAX_AMPLITUDE, Math.max(0, event.amplitude ?? MAX_AMPLITUDE));
        if (typeof event.duty === "number") {
          this.duty = Math.min(0.99, Math.max(0.01, event.duty));
        }
        // Convert frequency to NES timer period for sweep unit
        if (this.baseFrequency > 0) {
          this.sweepTimerPeriod = Math.max(8,
            Math.round(CHIP_BASE_CLOCK / (16 * this.baseFrequency) - 1));
        }
        this.sweepMuted = false;
        if (event.slide && typeof event.slide.durationSamples === "number") {
          this.slideCurve = "linear"; // noteOn slides are always linear (for BGM compatibility)
          const slideFrame =
            typeof event.sampleFrame === "number" ? event.sampleFrame : currentFrame;
          this.slide = {
            startFrame: slideFrame,
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
        this.sweepEnabled = false;
        this.sweepMuted = false;
        break;
      case "setSweep":
        // Activate NES-style hardware pitch sweep on this channel.
        // negate=false → period grows (pitch falls); negate=true → period shrinks (pitch rises).
        // Mutes when target period exits [8, 0x7FF].
        this.sweepEnabled = event.enabled !== false;
        this.sweepNegate = event.negate === true;
        this.sweepShift = Math.max(0, Math.min(7,
          typeof event.shift === "number" ? event.shift : 0));
        this.sweepPeriod = Math.max(0, Math.min(7,
          typeof event.period === "number" ? event.period : 0));
        this.sweepCounter = (this.sweepPeriod + 1) * this.sweepSamplesPerHalfFrame;
        // Optional: override current frequency for the sweep start
        if (typeof event.frequency === "number" && event.frequency > 0) {
          this.sweepTimerPeriod = Math.max(8,
            Math.round(CHIP_BASE_CLOCK / (16 * event.frequency) - 1));
          this.baseFrequency = event.frequency;
        }
        this.sweepMuted = false;
        this.slide = null; // sweep takes priority over slide
        break;
      case "setParam":
        if (event.param === "duty" && typeof event.value === "number") {
          this.duty = Math.min(0.99, Math.max(0.01, event.value));
        }
        // Handle pitchBend for SE pitch sweeps; sweep unit takes priority when enabled
        if (event.param === "pitchBend" && typeof event.value === "number" && !this.sweepEnabled) {
          const targetFrequency = event.value;
          const rampDuration = event.rampDuration ?? 0;
          const durationSamples = Math.max(1, Math.round(rampDuration * sampleRate));
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
        }
        break;
      case "stop":
        this.amplitude = 0;
        this.slide = null;
        this.sweepEnabled = false;
        break;
      case "clear":
        this.eventQueue = [];
        this.amplitude = 0;
        this.slide = null;
        this.phase = 0;
        this.sweepEnabled = false;
        this.sweepMuted = false;
        this.sweepTimerPeriod = 0;
        break;
      default:
        break;
    }
  }

  computeFrequency(currentFrame) {
    // When sweep is active it manages baseFrequency directly; bypass slide interpolation.
    if (this.sweepEnabled) {
      return this.baseFrequency;
    }
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
      // Cubic curve for stronger acceleration (slower start, faster end)
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
        this.applyEvent(this.eventQueue.shift(), absoluteFrame);
      }

      // Hardware sweep tick: fires at sweepPeriod+1 half-frames (≈120 Hz per half-frame).
      // Each tick shifts the 11-bit timer period, changing frequency multiplicatively.
      if (this.sweepEnabled) {
        this.sweepCounter--;
        if (this.sweepCounter <= 0) {
          this.sweepCounter = (this.sweepPeriod + 1) * this.sweepSamplesPerHalfFrame;
          if (this.sweepShift > 0) {
            const delta = this.sweepTimerPeriod >> this.sweepShift;
            const targetPeriod = this.sweepNegate
              ? this.sweepTimerPeriod - delta
              : this.sweepTimerPeriod + delta;
            // Mute when period is out of valid range [8, 0x7FF]
            if (targetPeriod > 0x7FF || this.sweepTimerPeriod < 8) {
              this.sweepMuted = true;
            } else {
              this.sweepTimerPeriod = targetPeriod;
              this.baseFrequency = CHIP_BASE_CLOCK / (16 * (this.sweepTimerPeriod + 1));
              this.sweepMuted = false;
            }
          }
        }
      }

      const freq = this.computeFrequency(absoluteFrame);
      const effectiveAmplitude = this.sweepMuted ? 0 : this.amplitude;

      if (effectiveAmplitude > 0 && freq > 0) {
        const phaseIncrement = freq / sampleRate;
        this.phase += phaseIncrement;
        if (this.phase >= 1) {
          this.phase -= Math.floor(this.phase);
        }
        output[i] = this.phase < this.duty ? effectiveAmplitude : -effectiveAmplitude;
      } else {
        output[i] = 0;
      }
    }

    this.sampleFrame += output.length;
    return true;
  }
}

registerProcessor("square-processor", SquareProcessor);
