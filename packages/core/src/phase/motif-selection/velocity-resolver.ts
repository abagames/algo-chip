/**
 * Velocity resolution for different instrument roles
 */

import type { SectionDefinition, StyleIntent, StructurePlanResult } from "../../types.js";
import {
  VELOCITY_BASS_TEXTURE,
  VELOCITY_BASS_ACCENT
} from "../../constants/velocity-config.js";

export function resolveMelodyVelocity(
  section: StructurePlanResult["sections"][number],
  measureInSection: number,
  globalMeasureIndex: number,
  totalMeasures: number,
  styleIntent: StyleIntent
): number {
  const baseByTexture: Record<string, number> = {
    broken: 90,
    steady: 86,
    arpeggio: 92
  };
  let base = baseByTexture[section.texture] ?? 88;
  const downbeatBoost = measureInSection === 0 ? 6 : 0;
  const cadenceLift = section.measures - measureInSection <= 1 ? 4 : 0;
  if (styleIntent.textureFocus) {
    base -= 8;
  }
  if (styleIntent.gradualBuild) {
    // Global progressive build: velocity increases across entire track
    const globalProgress =
      totalMeasures > 1 ? globalMeasureIndex / Math.max(1, totalMeasures - 1) : 0;
    const clamped = Math.min(1, Math.max(0, globalProgress));
    const exponent = totalMeasures <= 16 ? 0.6 : totalMeasures <= 32 ? 0.75 : 0.9;
    const shaped = Math.pow(clamped, exponent);
    const maxBoost = totalMeasures <= 16 ? 14 : totalMeasures <= 32 ? 18 : 20;
    const buildAmount = Math.floor(shaped * maxBoost);
    base += buildAmount;
  }
  if (styleIntent.loopCentric) {
    base = Math.max(60, base - 2);
  }
  return Math.min(110, Math.max(58, base + downbeatBoost + cadenceLift));
}

export function resolveBassVelocity(
  section: StructurePlanResult["sections"][number],
  step: number
): number {
  const base =
    (VELOCITY_BASS_TEXTURE as Record<string, number>)[section.texture] ??
    VELOCITY_BASS_TEXTURE.default;
  if (step === 0) {
    return base + VELOCITY_BASS_ACCENT.DOWNBEAT_BOOST;
  }
  if (step % 4 === 0) {
    return base + VELOCITY_BASS_ACCENT.STRONG_BEAT_BOOST;
  }
  return base;
}

export function resolveAccompanimentVelocity(functionTag: string, beatInMeasure: number): number {
  const baseVelocity = 58;
  const accent = functionTag === "start" && beatInMeasure === 0 ? 6 : 0;
  return baseVelocity + accent;
}
