import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as waitImmediate } from "node:timers/promises";

import type { AudioSession } from "../../../demo/src/lib/types.js";
import { createVisibilityController } from "../../../demo/src/lib/visibility.js";

class FakeVisibilityDocument {
  hidden = false;
  private listeners = new Set<() => void>();
  private listenerMap = new Map<unknown, () => void>();

  addEventListener(event: string, listener: unknown): void {
    if (event !== "visibilitychange") {
      return;
    }
    const handler =
      typeof listener === "function"
        ? () => (listener as EventListener)({ type: "visibilitychange" } as Event)
        : () =>
            (
              (listener as EventListenerObject | { handleEvent(): void })
                .handleEvent as (evt: Event) => void
            )({ type: "visibilitychange" } as Event);
    this.listenerMap.set(listener, handler);
    this.listeners.add(handler);
  }

  removeEventListener(event: string, listener: unknown): void {
    if (event !== "visibilitychange") {
      return;
    }
    const handler = this.listenerMap.get(listener);
    if (!handler) {
      return;
    }
    this.listeners.delete(handler);
    this.listenerMap.delete(listener);
  }

  trigger(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

describe("createVisibilityController", () => {
  it("pauses, suspends, resumes, and rehydrates playback state", async () => {
    const sessionState = {
      pauseCalls: 0,
      resumeBgmCalls: 0,
      resumeCtxCalls: 0,
      suspendCtxCalls: 0,
      cancelCalls: 0,
      lastResumeOffset: undefined as number | undefined
    };

    const session = {
      pauseBgm: () => {
        sessionState.pauseCalls += 1;
        return 1.5;
      },
      resumeBgm: async ({ offsetSeconds }: { offsetSeconds?: number } = {}) => {
        sessionState.resumeBgmCalls += 1;
        sessionState.lastResumeOffset = offsetSeconds;
      },
      cancelScheduledSe: () => {
        sessionState.cancelCalls += 1;
      },
      // Unused interface members
      generateBgm: async () => {
        throw new Error("not implemented");
      },
      generateSe: () => {
        throw new Error("not implemented");
      },
      playBgm: async () => {
        throw new Error("not implemented");
      },
      playSe: async () => {
        throw new Error("not implemented");
      },
      stopBgm: () => {},
      stopAllAudio: () => {},
      setBgmVolume: () => {},
      configureSeDefaults: () => {},
      triggerSe: async () => {},
      getActiveTimeline: () => ({ startTime: 0, loop: true, meta: {} }),
      getAudioContext: () => null,
      resumeAudioContext: async () => {
        sessionState.resumeCtxCalls += 1;
      },
      suspendAudioContext: async () => {
        sessionState.suspendCtxCalls += 1;
      },
      close: async () => {}
    } as unknown as AudioSession;

    const fakeDoc = new FakeVisibilityDocument();
    const pauseOffsets: Array<number | null> = [];
    const resumeEvents: Array<{ offsetSeconds: number | null; resumed: boolean }> = [];

    const detach = createVisibilityController(session, {
      documentRef: fakeDoc as unknown as Document,
      onPause: ({ offsetSeconds }) => {
        pauseOffsets.push(offsetSeconds);
      },
      onResume: (info) => {
        resumeEvents.push(info);
      }
    });

    fakeDoc.trigger(true);
    assert.strictEqual(sessionState.pauseCalls, 1);
    assert.strictEqual(sessionState.cancelCalls, 1);
    assert.strictEqual(sessionState.suspendCtxCalls, 1);
    assert.deepStrictEqual(pauseOffsets, [1.5]);

    fakeDoc.trigger(false);
    await waitImmediate();

    assert.strictEqual(sessionState.resumeCtxCalls, 1);
    assert.strictEqual(sessionState.resumeBgmCalls, 1);
    assert.strictEqual(sessionState.lastResumeOffset, 1.5);
    assert.deepStrictEqual(resumeEvents, [
      { offsetSeconds: 1.5, resumed: true }
    ]);

    detach();
    fakeDoc.trigger(true);
    assert.strictEqual(sessionState.pauseCalls, 1);
  });

  it("honours visibility options when pausing is disabled", async () => {
    const sessionState = {
      pauseCalls: 0,
      resumeBgmCalls: 0,
      resumeCtxCalls: 0,
      suspendCtxCalls: 0,
      cancelCalls: 0
    };

    const session = {
      pauseBgm: () => {
        sessionState.pauseCalls += 1;
        return null;
      },
      resumeBgm: async () => {
        sessionState.resumeBgmCalls += 1;
      },
      cancelScheduledSe: () => {
        sessionState.cancelCalls += 1;
      },
      suspendAudioContext: async () => {
        sessionState.suspendCtxCalls += 1;
      },
      resumeAudioContext: async () => {
        sessionState.resumeCtxCalls += 1;
      },
      // Unused members
      generateBgm: async () => {
        throw new Error("not implemented");
      },
      generateSe: () => {
        throw new Error("not implemented");
      },
      playBgm: async () => {
        throw new Error("not implemented");
      },
      playSe: async () => {
        throw new Error("not implemented");
      },
      stopBgm: () => {},
      stopAllAudio: () => {},
      setBgmVolume: () => {},
      configureSeDefaults: () => {},
      triggerSe: async () => {},
      getActiveTimeline: () => null,
      getAudioContext: () => null,
      close: async () => {}
    } as unknown as AudioSession;

    const fakeDoc = new FakeVisibilityDocument();
    const resumeEvents: Array<{ offsetSeconds: number | null; resumed: boolean }> = [];

    const detach = createVisibilityController(session, {
      documentRef: fakeDoc as unknown as Document,
      shouldPause: () => false,
      cancelScheduledSe: false,
      suspendAudioContext: false,
      resumeAudioContext: false,
      onResume: (info) => {
        resumeEvents.push(info);
      }
    });

    fakeDoc.trigger(true);
    assert.strictEqual(sessionState.pauseCalls, 0);
    assert.strictEqual(sessionState.cancelCalls, 0);
    assert.strictEqual(sessionState.suspendCtxCalls, 0);

    fakeDoc.trigger(false);
    await waitImmediate();

    assert.strictEqual(sessionState.resumeCtxCalls, 0);
    assert.strictEqual(sessionState.resumeBgmCalls, 0);
    assert.deepStrictEqual(resumeEvents, [
      { offsetSeconds: null, resumed: false }
    ]);

    detach();
  });

  it("skips pause/resume when no active timeline exists", async () => {
    const sessionState = {
      pauseCalls: 0,
      resumeBgmCalls: 0,
      resumeCtxCalls: 0,
      suspendCtxCalls: 0,
      cancelCalls: 0
    };

    const session = {
      pauseBgm: () => {
        sessionState.pauseCalls += 1;
        return null;
      },
      resumeBgm: async () => {
        sessionState.resumeBgmCalls += 1;
      },
      cancelScheduledSe: () => {
        sessionState.cancelCalls += 1;
      },
      suspendAudioContext: async () => {
        sessionState.suspendCtxCalls += 1;
      },
      resumeAudioContext: async () => {
        sessionState.resumeCtxCalls += 1;
      },
      getActiveTimeline: () => null,
      // Unused members
      generateBgm: async () => {
        throw new Error("not implemented");
      },
      generateSe: () => {
        throw new Error("not implemented");
      },
      playBgm: async () => {
        throw new Error("not implemented");
      },
      playSe: async () => {
        throw new Error("not implemented");
      },
      stopBgm: () => {},
      stopAllAudio: () => {},
      setBgmVolume: () => {},
      configureSeDefaults: () => {},
      triggerSe: async () => {},
      getAudioContext: () => null,
      close: async () => {}
    } as unknown as AudioSession;

    const fakeDoc = new FakeVisibilityDocument();

    const detach = createVisibilityController(session, {
      documentRef: fakeDoc as unknown as Document
    });

    fakeDoc.trigger(true);
    assert.strictEqual(sessionState.pauseCalls, 0);
    assert.strictEqual(sessionState.cancelCalls, 1);
    assert.strictEqual(sessionState.suspendCtxCalls, 1);

    fakeDoc.trigger(false);
    await waitImmediate();

    assert.strictEqual(sessionState.resumeCtxCalls, 1);
    assert.strictEqual(sessionState.resumeBgmCalls, 0);

    detach();
  });
});
