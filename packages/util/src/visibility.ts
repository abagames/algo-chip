/**
 * Visibility-change helper that pauses and resumes the demo audio session.
 *
 * Listens for `document.visibilitychange` and coordinates pause/resume
 * operations against the provided `AudioSession`. Call the returned disposer
 * to remove the listener when the session is torn down.
 */

import type { AudioSession } from "./types.js";

export interface VisibilityControllerOptions {
  /** Override document instance (useful for testing) */
  documentRef?: Document;
  /** Decide whether the controller should pause when the tab hides */
  shouldPause?: () => boolean;
  /** Cancel pending SE jobs when pausing (default: true) */
  cancelScheduledSe?: boolean;
  /** Suspend AudioContext while hidden (default: true) */
  suspendAudioContext?: boolean;
  /** Resume AudioContext before attempting playback resume (default: true) */
  resumeAudioContext?: boolean;
  /** Callback invoked after pausing with captured offset (if any) */
  onPause?: (info: { offsetSeconds: number | null }) => void;
  /** Callback invoked after visibility returns */
  onResume?: (info: { offsetSeconds: number | null; resumed: boolean }) => void;
}

/**
 * Creates a visibility-change controller for the provided session.
 *
 * The controller listens to `document.visibilitychange` and automatically
 * pauses/resumes the session according to the configured options.
 *
 * @returns A disposer function. Call it to remove the visibility listener and
 * stop automatic pause/resume handling (e.g. during teardown).
 */
export function createVisibilityController(
  session: AudioSession,
  options: VisibilityControllerOptions = {}
): () => void {
  const doc = options.documentRef ?? document;
  const cancelSe = options.cancelScheduledSe ?? true;
  const suspendCtx = options.suspendAudioContext ?? true;
  const resumeCtx = options.resumeAudioContext ?? true;

  let resumePending = false;
  let storedOffset: number | null = null;

  const handleVisibilityChange = (): void => {
    if (doc.hidden) {
      const shouldPause = options.shouldPause ? options.shouldPause() : true;
      if (!shouldPause) {
        if (suspendCtx) {
          try {
            session.suspendAudioContext();
          } catch (error) {
            console.warn("AudioContext suspend failed:", error);
          }
        }
        return;
      }

      const hasActiveTimeline = session.getActiveTimeline() !== null;
      if (!hasActiveTimeline) {
        storedOffset = null;
        resumePending = false;

        if (cancelSe) {
          session.cancelScheduledSe();
        }

        if (suspendCtx) {
          try {
            session.suspendAudioContext();
          } catch (error) {
            console.warn("AudioContext suspend failed:", error);
          }
        }
        return;
      }

      storedOffset = session.pauseBgm();
      resumePending = true;

      if (cancelSe) {
        session.cancelScheduledSe();
      }

      options.onPause?.({ offsetSeconds: storedOffset });

      if (suspendCtx) {
        try {
          session.suspendAudioContext();
        } catch (error) {
          console.warn("AudioContext suspend failed:", error);
        }
      }
      return;
    }

    const offset = storedOffset;
    storedOffset = null;

    if (!resumePending) {
      if (resumeCtx) {
        try {
          session.resumeAudioContext();
        } catch (error) {
          console.warn("AudioContext resume failed:", error);
        }
      }
      options.onResume?.({ offsetSeconds: offset, resumed: false });
      return;
    }

    resumePending = false;

    void (async () => {
      try {
        if (resumeCtx) {
          await session.resumeAudioContext();
        }
        await session.resumeBgm({ offsetSeconds: offset ?? undefined });
        options.onResume?.({ offsetSeconds: offset, resumed: true });
      } catch (error) {
        console.error("Visibility resume failed:", error);
        options.onResume?.({ offsetSeconds: offset, resumed: false });
      }
    })();
  };

  doc.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    doc.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
