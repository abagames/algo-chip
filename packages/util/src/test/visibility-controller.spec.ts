import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as waitImmediate } from "node:timers/promises";

import type { AudioSession } from "../types.js";
import { createVisibilityController } from "../visibility.js";

function createAudioSessionFixture(
  overrides: Partial<AudioSession> = {}
): AudioSession {
  return {
    generateBgm: async () => {
      throw new Error("not implemented");
    },
    playBgm: async () => {
      throw new Error("not implemented");
    },
    stopBgm: () => {},
    stopAllAudio: () => {},
    pauseBgm: () => null,
    resumeBgm: async () => {},
    setBgmVolume: () => {},
    configureSeDefaults: () => {},
    generateSe: () => {
      throw new Error("not implemented");
    },
    playSe: async () => {
      throw new Error("not implemented");
    },
    triggerSe: async () => {},
    cancelScheduledSe: () => {},
    getActiveTimeline: () => null,
    getAudioContext: () => null,
    resumeAudioContext: () => {},
    suspendAudioContext: () => {},
    close: async () => {},
    ...overrides
  } satisfies AudioSession;
}

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

    const session = createAudioSessionFixture({
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
      getActiveTimeline: () => ({ startTime: 0, loop: true, meta: {} }),
      resumeAudioContext: () => {
        sessionState.resumeCtxCalls += 1;
      },
      suspendAudioContext: () => {
        sessionState.suspendCtxCalls += 1;
      }
    });

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

    const session = createAudioSessionFixture({
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
      suspendAudioContext: () => {
        sessionState.suspendCtxCalls += 1;
      },
      resumeAudioContext: () => {
        sessionState.resumeCtxCalls += 1;
      }
    });

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

    const session = createAudioSessionFixture({
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
      suspendAudioContext: () => {
        sessionState.suspendCtxCalls += 1;
      },
      resumeAudioContext: () => {
        sessionState.resumeCtxCalls += 1;
      },
      getActiveTimeline: () => null
    });

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

  it("reports a failed resume without losing the captured offset", async () => {
    const expectedError = new Error("resume failed");
    const resumeEvents: Array<{
      offsetSeconds: number | null;
      resumed: boolean;
    }> = [];
    const loggedErrors: unknown[][] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args);
    };

    try {
      const session = createAudioSessionFixture({
        pauseBgm: () => 2.25,
        resumeBgm: async () => {
          throw expectedError;
        },
        getActiveTimeline: () => ({ startTime: 0, loop: true, meta: {} })
      });
      const fakeDoc = new FakeVisibilityDocument();
      const detach = createVisibilityController(session, {
        documentRef: fakeDoc as unknown as Document,
        onResume: (info) => {
          resumeEvents.push(info);
        }
      });

      fakeDoc.trigger(true);
      fakeDoc.trigger(false);
      await waitImmediate();

      assert.deepStrictEqual(resumeEvents, [
        { offsetSeconds: 2.25, resumed: false }
      ]);
      assert.deepStrictEqual(loggedErrors, [
        ["Visibility resume failed:", expectedError]
      ]);

      detach();
    } finally {
      console.error = originalConsoleError;
    }
  });
});
