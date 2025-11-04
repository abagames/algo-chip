# Agent Quick Reference

This doc is a quick start card for contributors working inside the `algo-chip`
repository. It keeps the essentials on one page and points to the
authoritative specs for the full story.

## Primary References

- `README.md` / `README_ja.md`: onboarding, install, packaging overview.
- `score.md` / `score_ja.md`: full five-phase pipeline, style system, motif
  architecture, verification workflow.
- `se.md` / `se_ja.md`: sound-effect catalogue, template schema, integration.
- `USAGE.md`: API examples, session helper usage, WebAudio wiring.
- `docs/api/`: TypeDoc output for public exports.

## Daily Workflow Cheatsheet

1. Install dependencies: `npm install`.
2. Core feature work: edit under `packages/core/src/` → `npm run build:core` →
   `npm test`.
3. Demo tweaks: edit `packages/demo/src/` → `npm run dev` (hot reload) →
   `npm run build:demo` when validating production assets.
4. Before committing: `npm test` → `npm run build:pages` → audition demo loop.
5. Publishing (manual): run `npm run build:pages`, verify `docs/`, then commit
   generated artifacts.

## Architecture Snapshot

- **Five-phase pipeline** (`score.md §3`): Structure Planning → Motif Selection
  → Event Realization → Techniques Postprocess → Timeline Finalization. Treat
  each phase as an isolated module; cross-phase data flows through typed
  results.
- **Two-axis style system** (`score.md §2`): clamp inputs to [-1, 1], resolve to
  mood/tempo, then derive style intent. Override entry points stay minimal:
  `CompositionOptions.overrides = { tempo?, intent?, randomizeUnsetIntent? }`.
- **Voice arrangement** (`score.md §3.1`): presets define channel mapping and
  probabilities. Keep descriptions in sync with `voice-arrangement-selector.ts`.
- **SE engine** (`se.md`): ten template families with deterministic sampling.
  Extend via new templates + tests rather than runtime conditionals.

## Testing & Verification Essentials

- Minimum regression guard: `npm test` targets all specs beneath
  `packages/core/src/test/`.
- When touching motifs, also regenerate a demo seed sweep to spot subjective
  issues; document notable outliers.
- Maintain coverage for the named suites: `pipeline`, `two-axis-*`,
  `se-generator`, `noise-collision`, `gradual-build`, `chord-variety`,
  `electronica`.
- Condensed verification highlights (see `score.md Appendix` for detail):
  - Seed diversity: inspect motif ID spread and technique mix across 3–5 seeds.
  - Timeline integrity: ensure noteOn/noteOff pairs, loop tail, and noise voice
    guard remain clean.
  - Dynamics arc: confirm section velocity profiles match intent (A≈mf,
    B≈f, Outro≈mp).
  - Transition coverage: drum fills and duty/gain sweeps trigger at section
    edges.
  - Motif duration sanity: rhythm/melody motifs sum to complete measures.

## Pull Request / Commit Checklist

- Imperative commit subject (e.g. `Adjust motif cache fallback`).
- Summarise behaviour changes, affected seeds, and manual listening notes when
  relevant.
- Record validation commands (tests, builds) in PR description.
- Attach demo artefacts only after running `npm run build:pages`.

## Update Protocol for Specs

- Touch `score.md` when pipeline contracts, phase outputs, style intent
  resolution, or verification workflow changes.
- Touch `se.md` when introducing SE types, templates, parameter schema updates,
  or SE/BGM integration changes.
- Keep English / Japanese pairs in sync.

## Active Focus Areas

- Keep implementation aligned with `score.md` / `se.md`; treat them as the
  source of truth when resolving disagreements.
- Expand motif catalog with well-tagged variations; prefer variation links over
  copy & paste.
- Maintain demo parity with core library updates (`packages/demo/src/lib` and
  `docs/` outputs).
- Strengthen test coverage alongside fixes—add targeted specs whenever a bug or
  regression is addressed.
