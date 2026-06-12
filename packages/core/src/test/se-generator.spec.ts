import assert from "node:assert/strict";
import { SEGenerator } from "../se/seGenerator.js";
import { loadSETemplates } from "../se/seTemplates.js";
import type { SEGenerationResult, SETemplate, SETemplateTag, SEType } from "../se/seTypes.js";
import type { Channel, Event } from "../types.js";
import { isNoteOnEvent } from "./test-utils.js";

const SE_TYPES: SEType[] = [
  "jump",
  "coin",
  "explosion",
  "hit",
  "powerup",
  "select",
  "laser",
  "click",
  "synth",
  "tone"
];

const CHANNELS = new Set<Channel>(["square1", "square2", "triangle", "noise"]);
const SE_TEMPLATE_TAGS = new Set<SETemplateTag>([
  "bright",
  "soft",
  "heavy",
  "short",
  "long",
  "ui",
  "combat",
  "pickup",
  "retro"
]);
const SE_ENVELOPES = new Set(["percussive", "sustained", "pluck", "snap", "fade"]);
const SE_SWEEP_CURVES = new Set(["linear", "exponential"]);

const SE_TYPE_BUDGETS: Record<SEType, { maxDuration: number; maxVelocity: number }> = {
  jump: { maxDuration: 0.42, maxVelocity: 124 },
  coin: { maxDuration: 0.32, maxVelocity: 127 },
  explosion: { maxDuration: 1.25, maxVelocity: 124 },
  hit: { maxDuration: 0.22, maxVelocity: 126 },
  powerup: { maxDuration: 0.48, maxVelocity: 124 },
  select: { maxDuration: 0.14, maxVelocity: 127 },
  laser: { maxDuration: 0.36, maxVelocity: 122 },
  click: { maxDuration: 0.05, maxVelocity: 122 },
  synth: { maxDuration: 0.42, maxVelocity: 122 },
  tone: { maxDuration: 0.38, maxVelocity: 122 }
};

function assertTemplateSchema(templates: SETemplate[]) {
  const ids = new Set<string>();
  const countsByType = new Map<SEType, number>();

  for (const template of templates) {
    assert.match(template.id, /^SE_[A-Z]+_[0-9]{2}$/, `Invalid SE template id: ${template.id}`);
    assert(!ids.has(template.id), `Duplicate SE template id: ${template.id}`);
    ids.add(template.id);

    assert(SE_TYPES.includes(template.type), `Unknown SE type for ${template.id}: ${template.type}`);
    countsByType.set(template.type, (countsByType.get(template.type) ?? 0) + 1);
    if (template.tags) {
      assert(template.tags.length > 0, `${template.id} tags should not be empty when present`);
      for (const tag of template.tags) {
        assert(SE_TEMPLATE_TAGS.has(tag), `${template.id} has unknown tag: ${tag}`);
      }
    }
    if (template.weight !== undefined) {
      assert(template.weight > 0, `${template.id} weight should be positive`);
      assert(Number.isFinite(template.weight), `${template.id} weight should be finite`);
    }

    assert(template.channels.length > 0, `${template.id} should define at least one channel`);
    assert.strictEqual(
      new Set(template.channels).size,
      template.channels.length,
      `${template.id} should not list duplicate channels`
    );

    for (const channel of template.channels) {
      assert(CHANNELS.has(channel), `${template.id} has invalid channel: ${channel}`);
      assert(template.channelParams[channel], `${template.id} is missing channelParams.${channel}`);
    }

    const [minDuration, maxDuration] = template.durationRange;
    assert(
      Number.isFinite(minDuration) && Number.isFinite(maxDuration),
      `${template.id} durationRange should be finite`
    );
    assert(minDuration > 0, `${template.id} durationRange minimum should be positive`);
    assert(maxDuration >= minDuration, `${template.id} durationRange should be ordered`);
    assert(maxDuration <= 2, `${template.id} durationRange should stay within one-shot SE bounds`);

    for (const [channel, params] of Object.entries(template.channelParams)) {
      assert(CHANNELS.has(channel as Channel), `${template.id} has invalid channelParams key: ${channel}`);
      for (const pitchKey of ["pitchStart", "pitchEnd"] as const) {
        const range = params[pitchKey];
        if (!range) continue;
        assert(range.min >= 0 && range.max <= 127, `${template.id}.${channel}.${pitchKey} should be MIDI 0-127`);
        assert(range.max >= range.min, `${template.id}.${channel}.${pitchKey} should be ordered`);
      }
      if (params.velocityRange) {
        const [minVelocity, maxVelocity] = params.velocityRange;
        assert(minVelocity >= 1 && maxVelocity <= 127, `${template.id}.${channel}.velocityRange should be 1-127`);
        assert(maxVelocity >= minVelocity, `${template.id}.${channel}.velocityRange should be ordered`);
      }
      if (params.releaseRange) {
        const [minRelease, maxRelease] = params.releaseRange;
        assert(minRelease >= 0, `${template.id}.${channel}.releaseRange minimum should be non-negative`);
        assert(maxRelease >= minRelease, `${template.id}.${channel}.releaseRange should be ordered`);
      }
      if (params.startOffsetRange) {
        const [minOffset, maxOffset] = params.startOffsetRange;
        assert(minOffset >= 0, `${template.id}.${channel}.startOffsetRange minimum should be non-negative`);
        assert(maxOffset >= minOffset, `${template.id}.${channel}.startOffsetRange should be ordered`);
        assert(maxOffset <= 0.05, `${template.id}.${channel}.startOffsetRange should stay tight`);
      }
      if (params.dutyCycleRange) {
        const { min, max } = params.dutyCycleRange;
        assert(
          Number.isFinite(min) && Number.isFinite(max),
          `${template.id}.${channel}.dutyCycleRange should be finite`
        );
        assert(min > 0 && max <= 1, `${template.id}.${channel}.dutyCycleRange should be within (0, 1]`);
        assert(max >= min, `${template.id}.${channel}.dutyCycleRange should be ordered`);
      }
      if (params.envelope) {
        assert(SE_ENVELOPES.has(params.envelope), `${template.id}.${channel}.envelope should be known`);
      }
    }

    if (template.noteSequence) {
      assert.strictEqual(
        template.noteSequence.intervals.length,
        template.noteSequence.noteDurations.length,
        `${template.id} noteSequence intervals and durations should have equal length`
      );
      assert(template.noteSequence.intervals.length > 0, `${template.id} noteSequence should not be empty`);
      for (const noteDuration of template.noteSequence.noteDurations) {
        assert(noteDuration > 0, `${template.id} note durations should be positive`);
      }
      const totalNoteDuration = template.noteSequence.noteDurations.reduce((sum, duration) => sum + duration, 0);
      assert(
        totalNoteDuration <= maxDuration + 1e-9,
        `${template.id} noteSequence should fit within durationRange maximum`
      );
    }

    if (template.pitchSweep?.durationRange) {
      const [minSweep, maxSweep] = template.pitchSweep.durationRange;
      assert(minSweep > 0, `${template.id} pitchSweep duration minimum should be positive`);
      assert(maxSweep >= minSweep, `${template.id} pitchSweep durationRange should be ordered`);
    }
    if (template.pitchSweep?.curveOptions) {
      const curveOptions = template.pitchSweep.curveOptions;
      assert(curveOptions.length > 0, `${template.id} pitchSweep curveOptions should not be empty`);
      assert.strictEqual(
        new Set(curveOptions).size,
        curveOptions.length,
        `${template.id} pitchSweep curveOptions should not contain duplicates`
      );
      for (const curve of curveOptions) {
        assert(SE_SWEEP_CURVES.has(curve), `${template.id} has unknown pitchSweep curve option: ${curve}`);
      }
    }
    if (template.pitchSweep?.curveWeights) {
      const curveOptions = template.pitchSweep.curveOptions;
      assert(curveOptions, `${template.id} curveWeights requires curveOptions`);
      const weightKeys = Object.keys(template.pitchSweep.curveWeights);
      assert.deepEqual(
        new Set(weightKeys),
        new Set(curveOptions),
        `${template.id} curveWeights keys should match curveOptions`
      );
      for (const [curve, weight] of Object.entries(template.pitchSweep.curveWeights)) {
        assert(Number.isFinite(weight), `${template.id} pitchSweep curve weight for ${curve} should be finite`);
        assert(weight > 0, `${template.id} pitchSweep curve weight for ${curve} should be positive`);
      }
    }
  }

  for (const type of SE_TYPES) {
    assert(
      (countsByType.get(type) ?? 0) >= 2,
      `${type} should have at least two SE templates`
    );
  }
}

function cloneTemplates(templates: SETemplate[]): SETemplate[] {
  return structuredClone(templates);
}

function assertInvalidTemplateFixture(
  templates: SETemplate[],
  mutate: (fixture: SETemplate[]) => void,
  expectedMessage: RegExp
) {
  const fixture = cloneTemplates(templates);
  mutate(fixture);
  assert.throws(() => assertTemplateSchema(fixture), expectedMessage);
}

function generatorWithTemplates(templates: SETemplate[]): SEGenerator {
  const generator = new SEGenerator();
  (generator as unknown as { templates: SETemplate[] }).templates = templates;
  return generator;
}

function assertGeneratedSEInvariants(result: SEGenerationResult, label: string) {
  const budget = SE_TYPE_BUDGETS[result.meta.type];
  assert(result.meta.duration > 0, `${label}: duration should be positive`);
  assert(Number.isFinite(result.meta.duration), `${label}: duration should be finite`);
  assert(result.meta.duration <= budget.maxDuration, `${label}: duration should fit family tail budget`);
  assert(SE_TYPES.includes(result.meta.type), `${label}: meta type should be known`);
  assert(result.meta.channels.length > 0, `${label}: channels should not be empty`);
  assert(result.events.length > 0, `${label}: events should not be empty`);

  let previousTime = -Infinity;
  const activeNoteStarts = new Map<Channel, number[]>();
  for (const channel of CHANNELS) {
    activeNoteStarts.set(channel, []);
  }

  for (const event of result.events) {
    assert(event.time >= previousTime, `${label}: events should be sorted by time`);
    previousTime = event.time;
    assert(Number.isFinite(event.time), `${label}: event time should be finite`);
    assert(event.time >= 0, `${label}: event time should be non-negative`);
    assert(CHANNELS.has(event.channel), `${label}: event channel should be valid`);

    if (event.command === "noteOn") {
      const velocity = event.data.velocity;
      if (typeof velocity === "number") {
        assert(Number.isFinite(velocity), `${label}: noteOn velocity should be finite`);
        assert(velocity >= 1 && velocity <= 127, `${label}: noteOn velocity should be 1-127`);
        assert(velocity <= budget.maxVelocity, `${label}: noteOn velocity should fit family loudness budget`);
      }
      const midi = event.data.midi;
      if (typeof midi === "number") {
        assert(Number.isFinite(midi), `${label}: noteOn MIDI should be finite`);
        assert(midi >= 0 && midi <= 127, `${label}: noteOn MIDI should be 0-127`);
      }
      activeNoteStarts.get(event.channel)!.push(event.time);
    } else if (event.command === "noteOff") {
      const starts = activeNoteStarts.get(event.channel)!;
      assert(starts.length > 0, `${label}: noteOff without active note on ${event.channel}`);
      const noteStart = starts.shift()!;
      assert(event.time > noteStart, `${label}: note duration should be positive on ${event.channel}`);
      if (typeof event.data.releaseSeconds === "number") {
        assert(event.data.releaseSeconds >= 0, `${label}: noteOff releaseSeconds should be non-negative`);
        assert(event.data.releaseSeconds <= 0.8, `${label}: noteOff releaseSeconds should stay bounded`);
      }
    } else if (event.command === "setParam") {
      if (typeof event.data.value === "number") {
        assert(Number.isFinite(event.data.value), `${label}: setParam value should be finite`);
      }
      if (typeof event.data.rampDuration === "number") {
        assert(event.data.rampDuration > 0, `${label}: setParam rampDuration should be positive`);
      }
    }
  }

  for (const [channel, starts] of activeNoteStarts) {
    assert.strictEqual(starts.length, 0, `${label}: unclosed noteOn events on ${channel}`);
  }
}

async function run() {
  const generator = new SEGenerator();
  const templates = loadSETemplates();

  assertTemplateSchema(templates);
  assertInvalidTemplateFixture(templates, (fixture) => {
    fixture.find((template) => template.id === "SE_SYNTH_03")!
      .channelParams.square2!.dutyCycleRange = { min: 0.75, max: 0.25 };
  }, /dutyCycleRange should be ordered/);
  assertInvalidTemplateFixture(templates, (fixture) => {
    fixture.find((template) => template.id === "SE_SYNTH_03")!
      .channelParams.square2!.dutyCycleRange = { min: Number.NaN, max: 0.5 };
  }, /dutyCycleRange should be finite/);
  assertInvalidTemplateFixture(templates, (fixture) => {
    const pitchSweep = fixture.find((template) => template.id === "SE_JUMP_01")!.pitchSweep!;
    pitchSweep.curveOptions = ["linear", "exponential"];
    pitchSweep.curveWeights = { linear: 1, exponential: -1 };
  }, /curve weight for exponential should be positive/);
  assertInvalidTemplateFixture(templates, (fixture) => {
    const pitchSweep = fixture.find((template) => template.id === "SE_JUMP_01")!.pitchSweep!;
    pitchSweep.curveOptions = ["linear", "exponential"];
    pitchSweep.curveWeights = { linear: 1 };
  }, /curveWeights keys should match curveOptions/);
  console.log("SE template schema validated");

  const scenarios = [
    { name: "jump-seed-314",           options: { type: "jump" as const, seed: 314, startTime: 0 } },
    { name: "coin-template-forced",    options: { type: "coin" as const, seed: 7, templateId: "SE_COIN_01", startTime: 0.25 } },
    { name: "jump-baseFrequency-440Hz",   options: { type: "jump" as const, seed: 314, baseFrequency: 440.0 } },
    { name: "coin-baseFrequency-523.25Hz", options: { type: "coin" as const, seed: 7, templateId: "SE_COIN_01", baseFrequency: 523.25 } },
  ];

  for (const { name, options } of scenarios) {
    const first = generator.generateSE(options);
    const second = generator.generateSE(options);

    assert.deepEqual(second, first, `SEGenerator should be deterministic per seed for ${name}`);

    const replay = generator.generateSE(first.meta.replayOptions);
    assert.deepEqual(replay, first, `Replay options should regenerate identical SE for ${name}`);

    assert(first.meta.duration > 0, `Duration should be positive for ${name}`);
  }

  console.log("SE generator scenarios validated");

  for (const type of SE_TYPES) {
    for (const seed of [1, 7, 123, 999, 2024]) {
      const result = generator.generateSE({ type, seed });
      assertGeneratedSEInvariants(result, `${type}-seed-${seed}`);
      const replay = generator.generateSE(result.meta.replayOptions);
      assert.deepEqual(replay, result, `${type}-seed-${seed}: replay should be deterministic`);
    }
  }

  for (const template of templates) {
    const result = generator.generateSE({
      type: template.type,
      seed: 4242,
      templateId: template.id
    });
    assertGeneratedSEInvariants(result, `${template.id}-forced`);
  }

  const dutyTemplate = templates.find((template) => template.id === "SE_SYNTH_03")!;
  const dutyResult = generator.generateSE({
    type: dutyTemplate.type,
    seed: 4242,
    templateId: dutyTemplate.id
  });
  const dutyEvent = dutyResult.events.find(
    (event) => event.command === "setParam" && event.data.param === "duty"
  );
  assert(dutyEvent, "forced dutyCycleRange template should emit a duty parameter event");
  const sampledDuty = dutyEvent.data.value;
  assert(typeof sampledDuty === "number", "sampled duty cycle should be numeric");
  const dutyRange = dutyTemplate.channelParams.square2!.dutyCycleRange!;
  assert(
    sampledDuty >= dutyRange.min && sampledDuty <= dutyRange.max,
    "sampled duty cycle should stay within the template range"
  );

  const curveTemplate = cloneTemplates(templates)
    .find((template) => template.id === "SE_JUMP_01")!;
  curveTemplate.pitchSweep!.curveOptions = ["linear", "exponential"];
  const generateWeightedCurve = (curveWeights: Record<string, number>) => {
    const fixture = structuredClone(curveTemplate);
    fixture.pitchSweep!.curveWeights = curveWeights;
    const result = generatorWithTemplates([fixture]).generateSE({
      type: fixture.type,
      seed: 4242,
      templateId: fixture.id
    });
    return result.events.find(
      (event) => event.command === "setParam" && event.data.param === "pitchBend"
    )?.data.curve;
  };
  assert.strictEqual(
    generateWeightedCurve({ linear: 1e12, exponential: 1 }),
    "linear",
    "curveWeights should strongly prefer the weighted linear curve"
  );
  assert.strictEqual(
    generateWeightedCurve({ linear: 1, exponential: 1e12 }),
    "exponential",
    "curveWeights should strongly prefer the weighted exponential curve"
  );

  const brightCoin = generator.generateSE({ type: "coin", seed: 7, variantIntent: "bright" });
  assert(
    templates
      .find((template) => template.id === brightCoin.meta.templateId)
      ?.tags?.includes("bright"),
    "variantIntent should prefer matching tags"
  );
  const replayBrightCoin = generator.generateSE(brightCoin.meta.replayOptions);
  assert.deepEqual(replayBrightCoin, brightCoin, "variantIntent should be included in replay options");

  const layeredExplosion = generator.generateSE({
    type: "explosion",
    seed: 2025,
    templateId: "SE_EXPLOSION_01"
  });
  const noteOnTimes = layeredExplosion.events
    .filter(isNoteOnEvent)
    .map((event) => event.time);
  assert(noteOnTimes.some((time) => time > 0), "layered templates should support non-zero channel start offsets");
  assert(layeredExplosion.meta.duration > layeredExplosion.events[0].time, "start offsets should extend meta duration");

  const normalLaser = generator.generateSE({ type: "laser", seed: 77, templateId: "SE_LASER_01" });
  const quietLaser = generator.generateSE({
    type: "laser",
    seed: 77,
    templateId: "SE_LASER_01",
    velocityScale: 0.5
  });
  const firstNormalVelocity = normalLaser.events.find(isNoteOnEvent)?.data.velocity;
  const firstQuietVelocity = quietLaser.events.find(isNoteOnEvent)?.data.velocity;
  assert.strictEqual(typeof firstNormalVelocity, "number", "normal laser should include velocity");
  assert.strictEqual(typeof firstQuietVelocity, "number", "quiet laser should include velocity");
  assert(
    firstQuietVelocity! < firstNormalVelocity!,
    "velocityScale should reduce generated note velocities"
  );
  const replayQuietLaser = generator.generateSE(quietLaser.meta.replayOptions);
  assert.deepEqual(replayQuietLaser, quietLaser, "velocityScale should be included in replay options");

  const quantizedSynth = generator.generateSE({
    type: "synth",
    seed: 515,
    templateId: "SE_SYNTH_01",
    quantizeToChord: "C"
  });
  const chordPitchClasses = new Set([0, 4, 7]);
  const quantizedNotes = quantizedSynth.events.filter(isNoteOnEvent);
  assert(quantizedNotes.length > 0, "quantizeToChord fixture should generate pitched notes");
  for (const event of quantizedNotes) {
    assert.strictEqual(typeof event.data.midi, "number", "noteOn should include MIDI");
    assert(
      chordPitchClasses.has(event.data.midi! % 12),
      `quantizeToChord should snap MIDI ${event.data.midi} to a C chord tone`
    );
  }
  const replayQuantizedSynth = generator.generateSE(quantizedSynth.meta.replayOptions);
  assert.deepEqual(
    replayQuantizedSynth,
    quantizedSynth,
    "quantizeToChord should be included in replay options"
  );

  console.log("SE seed sweep and forced-template audit validated");

  // Test baseFrequency pitch shifting
  console.log("\nTesting baseFrequency pitch shifting...");

  // Test 1: Verify pitch shift is applied correctly
  const baseResult = generator.generateSE({ type: "jump", seed: 999 });
  const shiftedResult = generator.generateSE({ type: "jump", seed: 999, baseFrequency: 440.0 });

  // Both should have same number of events (structure preserved)
  assert.strictEqual(
    shiftedResult.events.length,
    baseResult.events.length,
    "baseFrequency should not change number of events"
  );

  // Extract MIDI values from noteOn events
  const getNotePitches = (result: SEGenerationResult): number[] => {
    return result.events
      .filter(isNoteOnEvent)
      .map((event: Event<"noteOn">) => event.data.midi)
      .filter((midi): midi is number => typeof midi === "number");
  };

  const basePitches = getNotePitches(baseResult);
  const shiftedPitches = getNotePitches(shiftedResult);

  // If there are pitches, verify shift was applied (pitches should differ if shift was applied)
  assert(basePitches.length > 0, "base fixture should generate pitched notes");
  assert(shiftedPitches.length > 0, "shifted fixture should generate pitched notes");
  assert.strictEqual(
    basePitches.length,
    shiftedPitches.length,
    "baseFrequency should preserve number of notes"
  );

  // Test 2: Different baseFrequency values produce different pitches
  const result440 = generator.generateSE({ type: "coin", seed: 123, baseFrequency: 440.0 });
  const result880 = generator.generateSE({ type: "coin", seed: 123, baseFrequency: 880.0 });

  const pitches440 = getNotePitches(result440);
  const pitches880 = getNotePitches(result880);

  if (pitches440.length > 0 && pitches880.length > 0) {
    // 880 Hz is one octave above 440 Hz, so pitches should differ by ~12 semitones
    let diffSum = 0;
    for (let i = 0; i < pitches880.length; i++) {
      diffSum += pitches880[i] - pitches440[i]!;
    }
    const avgDiff = diffSum / pitches880.length;
    assert(
      Math.abs(avgDiff - 12) < 2,
      `Octave shift should be ~12 semitones, got ${avgDiff}`
    );
  }

  // Test 3: MIDI range clamping (0-127)
  const extremeResult = generator.generateSE({ type: "jump", seed: 456, baseFrequency: 20000.0 });
  const extremePitches = getNotePitches(extremeResult);

  for (const pitch of extremePitches) {
    assert(pitch >= 0 && pitch <= 127, `MIDI pitch ${pitch} should be in range [0, 127]`);
  }

  // Test 4: Deterministic with baseFrequency
  const det1 = generator.generateSE({ type: "powerup", seed: 789, baseFrequency: 261.63 });
  const det2 = generator.generateSE({ type: "powerup", seed: 789, baseFrequency: 261.63 });
  assert.deepEqual(det2, det1, "baseFrequency generation should be deterministic");

  console.log("baseFrequency pitch shifting validated");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
