import { Observable } from "../tools/observable";
import { createTimer } from "../tools/timer";

export type FlushReason = "timer" | "size" | "page_exit" | "messages_limit";

export interface FlushEvent {
  reason: FlushReason;
}

export interface FlushController {
  flushObservable: Observable<FlushEvent>;
  notifyBeforeAddMessage: (bytesCount: number) => void;
  notifyAfterAddMessage: (bytesCountDelta?: number) => void;
}

export interface FlushControllerOptions {
  flushInterval: number;
  batchBytesLimit: number;
  messagesLimit?: number;
  appExitObservable?: Observable<void>;
}

export function createFlushController({
  flushInterval,
  batchBytesLimit,
  messagesLimit,
  appExitObservable,
}: FlushControllerOptions): FlushController {
  const flushObservable = new Observable<FlushEvent>();
  let bytesCount = 0;
  let messagesCount = 0;

  const appExitSubscription = appExitObservable?.subscribe(() => {
    flush("page_exit");
  });

  let timer = createTimer(() => flush("timer"), flushInterval);

  function resetTimer() {
    timer.clear();
    timer = createTimer(() => flush("timer"), flushInterval);
  }

  function flush(reason: FlushReason) {
    if (messagesCount === 0 && bytesCount === 0 && reason !== "page_exit") {
      return;
    }

    bytesCount = 0;
    messagesCount = 0;
    resetTimer();
    flushObservable.notify({ reason });
  }

  return {
    flushObservable: new Observable((observable) => {
      const subscription = flushObservable.subscribe((event) =>
        observable.notify(event),
      );
      return () => {
        subscription.unsubscribe();
        appExitSubscription?.unsubscribe();
        timer.clear();
      };
    }),
    notifyBeforeAddMessage: (bytes) => {
      if (bytesCount + bytes >= batchBytesLimit) {
        flush("size");
      }
    },
    notifyAfterAddMessage: (bytesCountDelta = 0) => {
      bytesCount += bytesCountDelta;
      messagesCount += 1;

      if (messagesLimit !== undefined && messagesCount >= messagesLimit) {
        flush("messages_limit");
      } else {
        resetTimer();
      }
    },
  };
}
