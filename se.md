English | [日本語](./se_ja.md)

## **Sound Effect (SE) Automatic Generation System**

### **1. Design Philosophy**

Sound Effects (SE) are short audio elements corresponding to specific game events such as "jump", "coin collection", and "explosion". This system follows a **motif-based architecture** with the following characteristics:

- **Template-Based Generation**: Select from 43 template variations defined in `packages/core/motifs/se-templates.json` based on SEType
- **Seed-Driven RNG**: Regenerate identical SE with same seed value. Achieve natural variation through parameter randomization
- **BGM Integration**: Share `Event[]` type for seamless integration with BGM pipeline
- **4-Channel Chiptune Sound Source**: Authentic chiptune sound using square1/square2/triangle/noise channels

---

### **2. Architecture**

#### **A. Module Structure**

```
packages/core/
├── motifs/
│   └── se-templates.json           # SE template definitions (43 templates)
└── src/
    ├── se/
    │   ├── seGenerator.ts          # SEGenerator class
    │   ├── seTypes.ts              # Type definitions (SEType, SETemplate, etc.)
    │   └── seTemplates.ts          # Template loader
    └── types.ts                    # Event, Channel types (shared with BGM)
```

#### **B. Relationship with BGM Pipeline**

The SE generator is **completely independent** from the BGM Phase1-5 pipeline:

- **BGM**: `generateComposition(options)` → `PipelineResult` (5-phase processing)
- **SE**: `seGenerator.generateSE(options)` → `SEGenerationResult` (single processing)
- **Common**: Both output in `Event[]` format, processed by same Web Audio playback system

This design allows BGM and SE to be generated/played in parallel, with SE dynamically insertable at arbitrary timing.

> **API reference**: Detailed option lists (e.g., SE quantization hooks, template fields) live in the generated TypeDoc output (`docs/api/`). Use `npm run docs:api` to refresh it after code changes, and keep conceptual rationale here in `se.md`.

---

### **3. TypeScript Type Definitions and API**

#### **A. Primary Types**

```typescript
/** SE Categories */
export type SEType =
  | "jump"      // Jump sound
  | "coin"      // Coin collection sound
  | "explosion" // Explosion sound
  | "hit"       // Damage taken sound
  | "powerup"   // Power-up sound
  | "select"    // Menu/item selection sound
  | "laser"     // Shot/laser firing sound
  | "click"     // Click sound
  | "synth"     // Synthesizer tone
  | "tone";     // Square wave/triangle wave tone

/** Pitch Range Specification */
export interface PitchRange {
  min: number; // MIDI note number
  max: number;
}

/** SE Template Definition */
export interface SETemplate {
  id: string;                    // "SE_JUMP_01"
  type: SEType;                  // "jump"
  description: string;           // "Light ascending jump sound"
  tags?: SETemplateTag[];        // ["bright", "short", "retro"]
  weight?: number;               // Relative selection weight (default: 1)
  channels: Channel[];           // ["square1"]
  durationRange: [number, number]; // [0.10, 0.15] (seconds)

  // Per-channel parameter settings
  channelParams: {
    [ch in Channel]?: {
      pitchStart?: PitchRange;
      pitchEnd?: PitchRange;
      dutyCycle?: number[];      // Random selection from [0.25, 0.5]
      dutyCycleRange?: { min: number; max: number }; // Continuous sampling range
      noiseMode?: "short" | "long"; // noise channel only
      envelope?: "percussive" | "sustained" | "pluck" | "snap" | "fade";
      velocityRange?: [number, number];
      releaseRange?: [number, number];
      startOffsetRange?: [number, number]; // Layer timing offset in seconds
    };
  };

  // Note sequence definition (arpeggios, etc.)
  noteSequence?: {
    intervals: number[];         // [0, 4, 7] = root, major3rd, perfect5th
    noteDurations: number[];     // [0.05, 0.05] (seconds)
  };

  // Pitch sweep settings
  pitchSweep?: {
    enabled: boolean;
    curveType?: "linear" | "exponential";
    curveOptions?: Array<"linear" | "exponential">;
    curveWeights?: Record<string, number>; // Relative weight per curve option
    durationRange?: [number, number];
  };

  // NES APU hardware sweep unit (square channels only)
  hardwareSweep?: {
    enabled: boolean;
    period: number;   // 0–7: APU sweep divider reload value (tick rate)
    shift: number;    // 0–7: timer period shift count per tick
    negate: boolean;  // false = pitch falls, true = pitch rises
  };
}

/** SE Generation Options */
export interface SEGenerationOptions {
  type: SEType;
  seed?: number;                 // Random if unspecified
  templateId?: string;           // Force specific template selection
  startTime?: number;            // Event time offset (default: 0.0)
  baseFrequency?: number;        // Optional pitch retargeting in Hz
  quantizeToChord?: string;      // Snap pitched notes to chord tones, e.g. "C" or "Am"
  variantIntent?: SETemplateTag; // Prefer templates tagged with this flavor
  velocityScale?: number;        // Scale generated velocities for mix context
}

/** SE Generation Result */
export interface SEGenerationResult {
  events: Event[];               // Compatible with existing Event type
  meta: {
    type: SEType;
    templateId: string;
    seed: number;
    duration: number;            // Actual SE length (seconds)
    channels: Channel[];         // Channels used
    replayOptions: SEGenerationOptions; // Options to regenerate same SE
  };
}
```

---

### **4. SE Template JSON Definition**

Sample from `packages/core/motifs/se-templates.json`:

```json
{
  "templates": [
    {
      "id": "SE_JUMP_01",
      "type": "jump",
      "description": "Light ascending jump sound (square wave sweep)",
      "channels": ["square1"],
      "durationRange": [0.12, 0.25],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 50, "max": 62 },
          "pitchEnd": { "min": 72, "max": 84 },
          "dutyCycle": [0.25, 0.5]
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "exponential"
      }
    },
    {
      "id": "SE_COIN_01",
      "type": "coin",
      "description": "Sparkling coin collection sound (2-note arpeggio)",
      "channels": ["square1"],
      "durationRange": [0.18, 0.24],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "dutyCycle": [0.5]
        }
      },
      "noteSequence": {
        "intervals": [0, 4],
        "noteDurations": [0.04, 0.16]
      }
    },
    {
      "id": "SE_EXPLOSION_01",
      "type": "explosion",
      "description": "Impactful explosion sound (noise + triangle bass sweep)",
      "channels": ["noise", "triangle"],
      "durationRange": [0.80, 1.20],
      "channelParams": {
        "noise": {
          "noiseMode": "long",
          "envelope": "percussive"
        },
        "triangle": {
          "pitchStart": { "min": 36, "max": 43 },
          "pitchEnd": { "min": 24, "max": 31 }
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "linear"
      }
    },
    {
      "id": "SE_HIT_01",
      "type": "hit",
      "description": "Damage taken sound (short descending arpeggio)",
      "channels": ["square1"],
      "durationRange": [0.08, 0.12],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 72 },
          "dutyCycle": [0.125],
          "envelope": "percussive"
        }
      },
      "noteSequence": {
        "intervals": [0, -2, -5],
        "noteDurations": [0.03, 0.03, 0.03]
      }
    },
    {
      "id": "SE_POWERUP_01",
      "type": "powerup",
      "description": "Power-up sound (4-note ascending arpeggio)",
      "channels": ["square1"],
      "durationRange": [0.50, 0.70],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 67 },
          "dutyCycle": [0.5]
        }
      },
      "noteSequence": {
        "intervals": [0, 4, 7, 12],
        "noteDurations": [0.12, 0.12, 0.12, 0.20]
      }
    },
    {
      "id": "SE_LASER_01",
      "type": "laser",
      "description": "Laser firing sound (fast descending sweep)",
      "channels": ["square1"],
      "durationRange": [0.10, 0.15],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "pitchEnd": { "min": 48, "max": 60 },
          "dutyCycle": [0.125, 0.25]
        }
      },
      "pitchSweep": {
        "enabled": true,
        "curveType": "exponential"
      }
    },
    {
      "id": "SE_SELECT_01",
      "type": "select",
      "description": "Menu selection sound (short tone)",
      "channels": ["square1"],
      "durationRange": [0.05, 0.08],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 72, "max": 84 },
          "dutyCycle": [0.25]
        }
      }
    },
    {
      "id": "SE_CLICK_01",
      "type": "click",
      "description": "Click sound (very short, high-pitched)",
      "channels": ["square1"],
      "durationRange": [0.02, 0.03],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 84, "max": 96 },
          "dutyCycle": [0.125],
          "envelope": "percussive"
        }
      }
    },
    {
      "id": "SE_SYNTH_01",
      "type": "synth",
      "description": "Synth tone (square wave)",
      "channels": ["square1"],
      "durationRange": [0.15, 0.30],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 48, "max": 72 },
          "dutyCycle": [0.125, 0.25, 0.5]
        }
      }
    },
    {
      "id": "SE_TONE_01",
      "type": "tone",
      "description": "Basic tone (square wave, mid-range)",
      "channels": ["square1"],
      "durationRange": [0.10, 0.20],
      "channelParams": {
        "square1": {
          "pitchStart": { "min": 60, "max": 72 },
          "dutyCycle": [0.5]
        }
      }
    }
  ]
}
```

**Design Notes**:
- `intervals` are relative pitches in semitones (0 = base note)
- `pitchStart.min/max` are MIDI note numbers (60 = C4)
- `durationRange` sampled by seed-driven RNG
- Each template assigned `id` for future statistical analysis and verification
- Optional `tags` and `weight` support flavor-based selection and relative frequency control
- **Implementation Status**: All 10 types, total 43 templates implemented

#### **D. Usage Example**

```typescript
import { SEGenerator } from "algo-chip";

const generator = new SEGenerator();

// Basic usage
const jumpSE = generator.generateSE({ type: "jump" });
console.log(jumpSE.events);  // Get Event[]
console.log(jumpSE.meta.duration);  // Actual length (seconds)

// Seed specification for reproducibility
const coinSE1 = generator.generateSE({ type: "coin", seed: 12345 });
const coinSE2 = generator.generateSE({ type: "coin", seed: 12345 });
// coinSE1.events === coinSE2.events (completely identical)

// Force specific template selection
const explosionSE = generator.generateSE({
  type: "explosion",
  templateId: "SE_EXPLOSION_02",
  startTime: 2.5  // Start from 2.5 seconds
});

// Use in combination with BGM
import { generateComposition } from "algo-chip";

const bgm = await generateComposition({ seed: 999 });
const jump = generator.generateSE({ type: "jump", startTime: 3.0 });

// Merge both events for playback
const allEvents = [...bgm.events, ...jump.events].sort((a, b) => a.time - b.time);
```

---

### **5. SE Type Characteristics**

This system supports 10 SE types, with 43 total template variations across all types:

| SEType | Description | Channels | Main Features |
|--------|-------------|----------|---------------|
| **jump** | Jump sound | square1/square2 | Rising pitch sweep (0.12-0.30s) |
| **coin** | Coin collection sound | square1 | 2-3 note ascending arpeggio (0.18-0.24s) |
| **explosion** | Explosion sound | noise + triangle | Noise + descending bass sweep (0.80-1.20s) |
| **hit** | Damage taken sound | square1 | Short descending arpeggio (0.08-0.12s) |
| **powerup** | Power-up sound | square1 | 4-note ascending arpeggio (0.50-0.70s) |
| **laser** | Laser firing sound | square1/square2 | Fast descending sweep (0.10-0.20s) |
| **select** | Menu selection sound | square1 | Short tone (0.05-0.10s) |
| **click** | Click sound | square1 | Very short, high-pitched (0.02-0.04s) |
| **synth** | Synth tone | square1/square2/triangle | Sustained tone (0.15-0.40s) |
| **tone** | Basic tone | square1/triangle | Simple tone (0.10-0.30s) |

---

### **6. Major Generation Parameters**

The SE generator dynamically samples the following parameters from templates:

- **Pitch Sweep**: Interpolate start pitch to end pitch with linear/exponential curve
- **Chord Quantization**: Optionally snap pitched SEs to nearest chord tones with `quantizeToChord`
- **Duty Cycle**: Square wave shape (12.5%, 25%, 50%)
- **Note Sequence**: Arpeggio pattern intervals and note lengths
- **Noise Mode**: short (high-frequency) / long (low-frequency) selection
- **Duration**: Random sampling within template-defined range
- **Velocity**: Volume range specification
- **Velocity Scale**: Caller-side loudness scaling while preserving template shape
- **Envelope**: `percussive`, `sustained`, `pluck`, `snap`, and `fade` shapes mapped to existing event decay/release data
- **Start Offset**: Per-channel timing offsets for layered effects
- **Template Tags / Weights**: Prefer variants with `variantIntent` and bias template frequency with `weight`

All parameters selected by deterministic RNG based on `seed`, ensuring complete reproducibility.

**Current quality budgets**:

| SEType | Max duration | Max velocity |
|--------|--------------|--------------|
| **jump** | 0.42s | 124 |
| **coin** | 0.32s | 124 |
| **explosion** | 1.25s | 124 |
| **hit** | 0.22s | 126 |
| **powerup** | 0.48s | 124 |
| **select** | 0.14s | 122 |
| **laser** | 0.36s | 122 |
| **click** | 0.05s | 122 |
| **synth** | 0.42s | 122 |
| **tone** | 0.38s | 122 |

### **6.1 Template Authoring Rules**

- Keep `durationRange` within the family budget above; if a family needs a longer tail, update the budget and tests together.
- Keep `velocityRange` within the family max velocity. Use `velocityScale` for runtime mix context instead of duplicating louder/quieter templates.
- Use `noteSequence` for discrete pickups, UI confirms, and fanfare-like sounds; use `pitchSweep` for jumps, lasers, charge cues, and impacts.
- Use `quantizeToChord` only when an SE should sit harmonically inside a BGM cue. Leave noise-heavy, UI, and alert sounds unquantized when recognizability matters more than harmony.
- Use `snap` for tiny clicks/noise ticks, `pluck` for short tonal pickups, `fade` for soft sustained tones, and `percussive` for noise impacts.
- Use `startOffsetRange` only for layered templates and keep offsets under 0.05s so trigger timing remains responsive.
- Prefer `tags` for caller-facing flavor selection and reserve `templateId` for debugging, snapshots, and deliberate art direction.

---

### **7. Web Audio Integration**

BGM and SE share the same `Event[]` format and can be rendered by the same synthesizer implementation. For simultaneous playback, use separate synthesizer instances because `play()` stops playback already scheduled on that instance.

**Shared Components**:
- `AlgoChipSynthesizer`: Event scheduler and Web Audio renderer
- Channel classes (`SquareChannel`, `TriangleChannel`, `NoiseChannel`)
- Audio Worklet processors

**Integration Pattern**:
1. **Independent Playback**: Use separate `AlgoChipSynthesizer` instances for BGM and SE. `createAudioSession()` configures this arrangement automatically and adds quantization and ducking.

The current demo uses `createAudioSession()` from `packages/util`, enabling parallel BGM and SE playback without stopping the active loop.

---

### **8. Summary**

This SE automatic generation system has the following characteristics:

**Design Features**:
- High-quality SE generation via motif-based template approach
- Complete reproducibility through seed-driven RNG
- Output in same `Event[]` format as BGM pipeline

**Implementation Features**:
- 10 SE types, total 43 templates
- Diverse acoustic techniques including pitch sweeps, arpeggios, noise synthesis
- Type safety through TypeScript type system

**Integration Features**:
- Parallel BGM and SE generation/playback capability
- Seamless Web Audio integration
- Easy game engine integration

This system enables automatic generation of authentic retro game-style chiptune SE, balancing reproducibility and variation.
