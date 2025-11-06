# Algo Chip API Reference

This reference is generated from the TypeScript source with [TypeDoc](https://typedoc.org/).
It complements the high-level production specifications in `score.md` (BGM pipeline)
and `se.md` (sound effect system). Use this documentation when you need exact
function signatures, parameter details, and integration notes.

## Coverage

- `@algo-chip/core` public exports (pipeline orchestration, SE generation, utility types)
- Demo playback helpers, including `SoundEffectController`, session lifecycle
  controls (`pauseBgm`, `resumeBgm`, etc.), and `createVisibilityController`
  for tab-aware pause/resume orchestration

## Regenerating the Docs

```bash
npm run docs:api
```

The command writes static HTML to `docs/api/`. Publishing workflows can copy that
directory along with other site assets (see `npm run build:pages`).

For conceptual guidance, continue to maintain design intent, motivation, and
workflow descriptions inside `score.md` and `se.md`, linking into the generated
API reference where appropriate.
