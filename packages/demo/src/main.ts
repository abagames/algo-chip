/**
 * Main demo application entry point.
 *
 * This module implements a two-axis interactive music generation demo that allows
 * users to select music style coordinates on a 2D panel and generate chiptune music
 * in real-time. The demo features:
 * - Two-axis style panel (percussiveMelodic × calmEnergetic)
 * - Real-time channel activity indicators
 * - Interactive playback controls
 * - Web Audio synthesis with looping support
 */

import { ChipSynthesizer } from "./synth.js";
import { generateTimeline, generateSoundEffect } from "./lib/core.js";
import { SoundEffectController } from "./playback.js";
import type {
  ActiveTimeline,
  PlaybackEvent,
  CompositionOptions,
  PipelineResult,
  SEType
} from "./types.js";

// ============================================================================
// DOM Elements
// ============================================================================
const panel = document.getElementById("two-axis-panel") as HTMLDivElement;
const canvas = document.getElementById("two-axis-canvas") as HTMLCanvasElement;
const playPauseButton = document.getElementById("play-pause-button") as HTMLButtonElement;
const buttonText = document.getElementById("button-text") as HTMLSpanElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;
const srStatus = document.getElementById("sr-status") as HTMLDivElement;

// Channel indicator elements for visual feedback
const indicators = {
  square1: document.querySelector('[data-channel="square1"] .indicator-light') as HTMLDivElement,
  square2: document.querySelector('[data-channel="square2"] .indicator-light') as HTMLDivElement,
  triangle: document.querySelector('[data-channel="triangle"] .indicator-light') as HTMLDivElement,
  noise: document.querySelector('[data-channel="noise"] .indicator-light') as HTMLDivElement,
};

type IndicatorChannel = keyof typeof indicators;

const indicatorSEMap: Record<IndicatorChannel, SEType> = {
  square1: "jump",
  square2: "select",
  triangle: "laser",
  noise: "explosion",
};

// ============================================================================
// State Management
// ============================================================================

/**
 * Demo application state.
 *
 * Tracks the current two-axis position, generated composition, playback status,
 * and real-time channel activity for visual indicators.
 */
interface DemoState {
  currentPosition: { percussiveMelodic: number; calmEnergetic: number } | null;
  composition: PipelineResult | null;
  isPlaying: boolean;
  isGenerating: boolean;
  /** Current velocity values for each channel (0-127) used for indicator brightness */
  channelActivity: {
    square1: number;
    square2: number;
    triangle: number;
    noise: number;
  };
}

const state: DemoState = {
  currentPosition: null,
  composition: null,
  isPlaying: false,
  isGenerating: false,
  channelActivity: {
    square1: 0,
    square2: 0,
    triangle: 0,
    noise: 0,
  },
};

// Web Audio and synthesis state
let audioContext: AudioContext | null = null;
let synthesizer: ChipSynthesizer | null = null;
let seSynthesizer: ChipSynthesizer | null = null;
let soundEffectController: SoundEffectController | null = null;
let activeTimeline: ActiveTimeline | null = null;
let animationFrameId: number | null = null;
/** Map of active notes for tracking which notes are currently playing (channel-midi -> note data) */
let activeNotes = new Map<string, { channel: string; velocity: number; endTime: number }>();

// ============================================================================
// Canvas Management
// ============================================================================

/**
 * Initializes the two-axis panel canvas with proper DPI scaling.
 *
 * Sets canvas dimensions to match the panel container with device pixel ratio
 * adjustment for crisp rendering on high-DPI displays.
 */
function initCanvas(): void {
  const rect = panel.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
    drawPanel(ctx, rect.width, rect.height);
  }
}

/**
 * Draws the two-axis panel grid and current selection point.
 *
 * Renders a subtle grid, center crosshairs, and the current style position
 * with a glowing effect. The horizontal axis represents percussiveMelodic (-1 to +1)
 * and the vertical axis represents calmEnergetic (-1 at top to +1 at bottom).
 *
 * @param ctx Canvas 2D rendering context
 * @param width Canvas width in CSS pixels
 * @param height Canvas height in CSS pixels
 */
function drawPanel(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Clear the canvas for redrawing
  ctx.clearRect(0, 0, width, height);

  // Draw subtle grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  // Vertical lines
  for (let i = 1; i < 4; i++) {
    const x = (width / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw center crosshair
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  // Draw current selection point if exists
  if (state.currentPosition) {
    const x = ((state.currentPosition.percussiveMelodic + 1) / 2) * width;
    const y = ((1 - state.currentPosition.calmEnergetic) / 2) * height;

    // Glow effect
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 30);
    gradient.addColorStop(0, "rgba(90, 155, 255, 0.6)");
    gradient.addColorStop(1, "rgba(90, 155, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 30, y - 30, 60, 60);

    // Center point
    ctx.fillStyle = "#5a9bff";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============================================================================
// User Interaction Handlers
// ============================================================================

/**
 * Handles click and touch events on the two-axis panel.
 *
 * Converts mouse/touch coordinates to normalized two-axis style coordinates,
 * updates the visual selection point, and triggers composition generation.
 *
 * @param event Mouse or touch event from the panel
 */
async function handlePanelClick(event: MouseEvent | TouchEvent): Promise<void> {
  if (state.isGenerating) return;

  const rect = panel.getBoundingClientRect();
  let clientX: number;
  let clientY: number;

  if (event instanceof MouseEvent) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return;
    clientX = touch.clientX;
    clientY = touch.clientY;
  }

  // Convert to normalized coordinates
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;

  // Clamp to [-1, 1]
  const percussiveMelodic = Math.max(-1, Math.min(1, x));
  const calmEnergetic = Math.max(-1, Math.min(1, y));

  state.currentPosition = { percussiveMelodic, calmEnergetic };

  // Redraw panel with new position
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawPanel(ctx, rect.width, rect.height);
  }

  await generateAndPlay({ percussiveMelodic, calmEnergetic });
}

// ============================================================================
// Composition Generation and Playback
// ============================================================================

/**
 * Generates a new composition at the specified two-axis coordinates and starts playback.
 *
 * Stops any current playback, generates a 16-measure composition using the core pipeline,
 * and initializes Web Audio synthesis for real-time playback.
 *
 * @param position Two-axis style coordinates (percussiveMelodic and calmEnergetic)
 */
async function generateAndPlay(position: { percussiveMelodic: number; calmEnergetic: number }): Promise<void> {
  // Stop current playback to avoid overlaps
  stopPlayback();

  state.isGenerating = true;
  updateUI();
  updateStatus(`Generating music at (${position.percussiveMelodic.toFixed(1)}, ${position.calmEnergetic.toFixed(1)})...`);

  try {
    // Generate composition
    const options: CompositionOptions = {
      twoAxisStyle: position,
      lengthInMeasures: 16,
    };

    const result = await generateTimeline(options);
    state.composition = result;

    updateStatus(`Generated: ${result.meta.mood} at ${result.meta.bpm} BPM in ${result.meta.key}`);

    // Initialize audio if needed
    await ensureAudioContext();

    // Start playback
    await startPlayback(result.events);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateStatus(`Error: ${message}`);
    console.error("Generation failed:", error);
  } finally {
    state.isGenerating = false;
    updateUI();
  }
}

/**
 * Ensures the AudioContext and ChipSynthesizer are initialized and ready.
 *
 * Creates the AudioContext and synthesizer on first use, resumes suspended
 * contexts (required by browser autoplay policies), and loads AudioWorklet processors.
 */
async function ensureAudioContext(): Promise<void> {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (!synthesizer) {
    synthesizer = new ChipSynthesizer(audioContext);
    await synthesizer.init();
  }

  if (!seSynthesizer) {
    seSynthesizer = new ChipSynthesizer(audioContext);
    await seSynthesizer.init();
  }

  if (!soundEffectController && seSynthesizer && synthesizer) {
    soundEffectController = new SoundEffectController(
      audioContext,
      seSynthesizer,
      () => activeTimeline,
      synthesizer.masterGain
    );
  }
}

/**
 * Starts playback of the given event list.
 *
 * Schedules all events with the synthesizer, sets up looping, and starts
 * the animation loop for channel indicators. Adds a small lead time to
 * ensure smooth scheduling.
 *
 * @param events List of playback events to schedule
 */
async function startPlayback(events: PlaybackEvent[]): Promise<void> {
  if (!audioContext || !synthesizer) {
    return;
  }

  state.isPlaying = true;
  playPauseButton.disabled = false;
  updateUI();

  const ctx = audioContext;
  const startTime = ctx.currentTime + 0.2;

  // Clear active notes
  activeNotes.clear();

  if (state.composition) {
    activeTimeline = {
      startTime,
      loop: true,
      meta: state.composition.meta,
    };
  }

  // Start playback with event callback
  synthesizer.play(events, {
    startTime,
    loop: true,
    onEvent: handleSynthEvent
  }).catch((error) => {
    console.error("Playback error:", error);
    state.isPlaying = false;
    updateUI();
  });

  // Start animation loop for indicators
  startIndicatorAnimation();
}

/**
 * Stops current playback and resets all indicators.
 *
 * Halts the synthesizer, clears the animation loop, and resets channel
 * indicators to their inactive state.
 */
function stopPlayback(): void {
  if (synthesizer) {
    synthesizer.stop();
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  state.isPlaying = false;
  activeNotes.clear();
  activeTimeline = null;
  soundEffectController?.resetDucking();

  // Reset all indicators
  Object.values(indicators).forEach((indicator) => {
    indicator.classList.remove("active");
    indicator.style.opacity = "0.3";
    indicator.style.boxShadow = "none";
  });

  updateUI();
}

async function triggerIndicatorSoundEffect(channel: IndicatorChannel): Promise<void> {
  try {
    await ensureAudioContext();

    if (!soundEffectController || !state.composition) {
      return;
    }

    const seType = indicatorSEMap[channel];
    const result = await generateSoundEffect({ type: seType });

    const playPromise = soundEffectController.play(result, {
      duckingDb: -4,
      quantize: {
        quantizeTo: "beat",
        phase: "next",
        loopAware: true,
      },
    });

    updateStatus(`Scheduled ${seType} sound effect`);

    void playPromise.catch((playError) => {
      console.error("Indicator sound effect playback failed:", playError);
      updateStatus("Sound effect playback failed");
    });
  } catch (error) {
    console.error("Indicator sound effect trigger failed:", error);
    updateStatus("Sound effect trigger failed");
  }
}

function initIndicatorEasterEgg(): void {
  (Object.keys(indicatorSEMap) as IndicatorChannel[]).forEach((channel) => {
    const indicator = indicators[channel];
    if (!indicator) {
      return;
    }
    indicator.style.cursor = "pointer";
    indicator.title = "Hidden SE trigger";
    indicator.addEventListener("click", (event) => {
      event.stopPropagation();
      void triggerIndicatorSoundEffect(channel);
    });
  });
}

/**
 * Toggles between play and pause states.
 *
 * If playing, stops playback. If paused and a composition exists, resumes playback.
 */
function togglePlayback(): void {
  if (state.isPlaying) {
    stopPlayback();
    updateStatus("Playback paused");
  } else if (state.composition) {
    startPlayback(state.composition.events);
    updateStatus("Playback resumed");
  }
}

// ============================================================================
// Channel Activity Tracking
// ============================================================================

/**
 * Handles synthesizer playback events for channel activity tracking.
 *
 * Tracks noteOn and noteOff events to maintain a map of currently active notes,
 * which is used by the animation loop to update channel indicators in real-time.
 *
 * @param event Playback event from the synthesizer
 * @param when Scheduled time for the event
 */
function handleSynthEvent(event: PlaybackEvent, when: number): void {
  const channel = event.channel;
  const key = `${channel}-${event.data?.midi || 0}`;

  if (event.command === "noteOn") {
    const velocity = event.data?.velocity || 64;
    activeNotes.set(key, {
      channel,
      velocity: typeof velocity === "number" ? velocity : 64,
      endTime: when + 2.0 // Assume 2s max duration, will be updated on noteOff
    });
  } else if (event.command === "noteOff") {
    activeNotes.delete(key);
  }
}

/**
 * Starts the animation loop for channel activity indicators.
 *
 * Polls active notes on each animation frame and updates the visual indicators
 * based on current velocity values. Indicators brightness and glow scale with
 * note velocity (0-127).
 */
function startIndicatorAnimation(): void {
  const animate = () => {
    if (!audioContext || !state.isPlaying) {
      return;
    }

    const currentTime = audioContext.currentTime;
    const channelVelocities = { square1: 0, square2: 0, triangle: 0, noise: 0 };

    // Calculate current velocities from active notes
    activeNotes.forEach((note, key) => {
      if (currentTime <= note.endTime) {
        const ch = note.channel as keyof typeof channelVelocities;
        if (ch in channelVelocities) {
          channelVelocities[ch] = Math.max(channelVelocities[ch], note.velocity);
        }
      } else {
        // Clean up expired notes
        activeNotes.delete(key);
      }
    });

    // Update state
    state.channelActivity = channelVelocities;

    // Update visual indicators
    Object.entries(channelVelocities).forEach(([channel, velocity]) => {
      const indicator = indicators[channel as keyof typeof indicators];
      if (indicator) {
        const brightness = velocity / 127;
        const isActive = velocity > 0;

        if (isActive) {
          indicator.classList.add("active");
          indicator.style.opacity = String(0.5 + brightness * 0.5);
          indicator.style.boxShadow = `0 0 ${20 + brightness * 30}px currentColor`;
        } else {
          indicator.classList.remove("active");
          indicator.style.opacity = "0.3";
          indicator.style.boxShadow = "none";
        }
      }
    });

    animationFrameId = requestAnimationFrame(animate);
  };

  animate();
}

// ============================================================================
// UI Updates
// ============================================================================

/**
 * Updates UI elements based on current application state.
 *
 * Controls the play/pause button state, loading indicator, and ARIA labels
 * based on whether the app is generating, playing, or paused.
 */
function updateUI(): void {
  if (state.isGenerating) {
    playPauseButton.disabled = true;
    playPauseButton.classList.add("loading");
    buttonText.textContent = "";
  } else if (state.isPlaying) {
    playPauseButton.disabled = false;
    playPauseButton.classList.remove("loading");
    buttonText.textContent = "⏸ Pause";
    playPauseButton.setAttribute("aria-label", "Pause playback");
  } else if (state.composition) {
    playPauseButton.disabled = false;
    playPauseButton.classList.remove("loading");
    buttonText.textContent = "▶ Play";
    playPauseButton.setAttribute("aria-label", "Play playback");
  } else {
    playPauseButton.disabled = true;
    playPauseButton.classList.remove("loading");
    buttonText.textContent = "Play";
  }
}

/**
 * Updates status message for both visual display and screen readers.
 *
 * @param message Status message to display
 */
function updateStatus(message: string): void {
  statusMessage.textContent = message;
  srStatus.textContent = message;
}

// ============================================================================
// Event Listeners
// ============================================================================
panel.addEventListener("click", (e) => void handlePanelClick(e));
panel.addEventListener("touchstart", (e) => {
  e.preventDefault();
  void handlePanelClick(e);
});

playPauseButton.addEventListener("click", () => togglePlayback());

// Keyboard navigation support
panel.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mockEvent = new MouseEvent("click", {
      clientX: centerX,
      clientY: centerY,
    });

    void handlePanelClick(mockEvent);
  }
});

// Handle window resize to maintain proper canvas scaling
window.addEventListener("resize", () => {
  initCanvas();
});

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes all channel indicators to inactive state.
 *
 * Sets default opacity and removes any active styling to ensure
 * a consistent starting state.
 */
function initIndicators(): void {
  Object.values(indicators).forEach((indicator) => {
    indicator.classList.remove("active");
    indicator.style.opacity = "0.3";
    indicator.style.boxShadow = "none";
  });
}

// Run initialization on page load
initCanvas();
initIndicators();
initIndicatorEasterEgg();
updateUI();
