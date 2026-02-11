import { Observable } from "../tools/observable";
import { createTimer } from "../tools/timer";

export type FlushReason = "timer" | "size" | "page_exit";

export interface FlushEvent {
  reason: FlushReason;
}

export interface FlushController {
  flushObservable: Observable<FlushEvent>;
  notifyBeforeAddMessage: (bytesCount: number) => void;
  notifyAfterAddMessage: (bytesCountDelta?: number) => void;
}

export function createFlushController(
  flushInterval: number,
  batchBytesLimit: number
): FlushController {
  const flushObservable = new Observable<FlushEvent>();
  let bytesCount = 0;
  let timer = createTimer(
    () => flushObservable.notify({ reason: "timer" }),
    flushInterval
  );

  function resetTimer() {
    timer.clear();
    timer = createTimer(
      () => flushObservable.notify({ reason: "timer" }),
      flushInterval
    );
  }

  return {
    flushObservable,
    notifyBeforeAddMessage: (bytes) => {
      bytesCount += bytes;
      if (bytesCount >= batchBytesLimit) {
        flushObservable.notify({ reason: "size" });
      }
    },
    notifyAfterAddMessage: (bytesCountDelta = 0) => {
      bytesCount += bytesCountDelta;
      resetTimer();
    },
  };
}
