# Backlog

## Sound Effect Variation and Quality

### P0: Quality guardrails

- [x] Add an SE audit test that generates every `SEType` across a fixed seed sweep
      and validates structural invariants: sorted event time, noteOn/noteOff balance,
      non-negative duration, finite MIDI/frequency values, velocity range 1-127, and
      no accidental zero-length notes.
- [x] Add template schema validation for `packages/core/motifs/se-templates.json`.
      Check that each `SEType` has at least two templates, IDs are unique, duration
      ranges are sane, `noteSequence.intervals` and `noteDurations` lengths match,
      pitch ranges are ordered, and referenced channels have channel parameters.
- [x] Add deterministic snapshot coverage for representative seeds per SE type.
      Keep snapshots focused on event shape and metadata so template tuning can still
      change musical values intentionally.
- [x] Define loudness and tail budgets per SE family. Short UI sounds should stay
      crisp, explosions may have longer tails, and sustained `synth` / `tone` sounds
      should avoid masking BGM in the demo.

### P1: Template variety

- [x] Expand each existing SE type from 2 templates to 4 templates before adding new
      public `SEType` values. Prioritize `coin`, `hit`, `laser`, and `explosion`
      because repeated gameplay triggers make same-family variation most audible.
- [x] Add per-family flavor targets:
  - `jump`: tiny hop, heavy jump, spring jump, low-gravity jump.
  - `coin`: single sparkle, fast triad, delayed sparkle, lower-pitch pickup.
  - `explosion`: short pop, bass-heavy blast, noisy crumble, compact impact.
  - `hit`: sharp tick, low thud, noise bite, descending square chirp.
  - `powerup`: fast rise, fanfare arpeggio, two-channel shimmer, soft confirm.
  - `laser`: short zap, long beam, upward charge shot, noisy blaster.
  - `select` / `click`: confirm, cancel, disabled, cursor-move variants.
  - `synth` / `tone`: square, triangle, pulse-width, short sustained variants.
- [x] Add template selection weights so safer/default templates appear more often
      while rare character templates still appear in seed-driven generation.
- [x] Support optional `tags` on `SETemplate` such as `bright`, `soft`, `heavy`,
      `ui`, `combat`, `pickup`, and `retro`. This allows demos and game integrations
      to choose variants without hard-coding template IDs.

### P1: Sound design controls

- [x] Add `variantIntent` or equivalent options for high-level selection, e.g.
      `soft`, `bright`, `heavy`, `short`, `long`, while preserving deterministic
      replay through `meta.replayOptions`.
- [x] Add optional pitch quantization helpers for SEs that should match the generated
      BGM key. Keep this opt-in because UI sounds and noise-heavy effects should not
      be forced into harmonic constraints.
- [x] Add per-channel start offsets for layered templates. Small offsets can make
      explosion and hit effects feel less flat without introducing new synthesis
      primitives.
- [x] Add envelope shape options beyond `percussive` and `sustained`, such as
      `pluck`, `snap`, and `fade`, if they map cleanly to current WebAudio event
      data.
- [x] Add an optional gain or velocity scaling option at generation time so callers
      can reuse the same template for foreground, background, and UI contexts.

### P3: Documentation and localization

- [x] Update `se.md` and `se_ja.md` whenever template fields, new `SEType` values,
      selection behavior, or verification workflow changes.
- [x] Document template authoring rules: pitch range bounds, duration ranges by
      family, recommended velocity ranges, channel usage, and when to prefer
      `noteSequence` vs `pitchSweep`.
- [x] Keep README / USAGE examples aligned with any new generation options and make
      sure TypeDoc is refreshed when public types change.
