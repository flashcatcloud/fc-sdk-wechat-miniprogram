import { ONE_MINUTE, ONE_SECOND } from "../tools/utils/timeUtils";
import { ONE_MEBI_BYTE, ONE_KIBI_BYTE } from "../tools/utils/byteUtils";
import type { Payload } from "./batch";

export const MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE;
export const MAX_ONGOING_REQUESTS = 32;
export const MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEBI_BYTE;
export const MAX_BACKOFF_TIME = ONE_MINUTE;
export const INITIAL_BACKOFF_TIME = ONE_SECOND;
export const MAX_RETRY_COUNT = 3;

const enum TransportStatus {
  UP,
  FAILURE_DETECTED,
  DOWN,
}

const enum RetryReason {
  AFTER_SUCCESS,
  AFTER_RESUME,
}

export interface RetryState {
  transportStatus: TransportStatus;
  currentBackoffTime: number;
  bandwidthMonitor: ReturnType<typeof newBandwidthMonitor>;
  queuedPayloads: ReturnType<typeof newPayloadQueue>;
}

export interface HttpResponse {
  status: number;
}

type SendStrategy = (
  payload: Payload,
  onResponse: (r: HttpResponse) => void
) => void;

export function sendWithRetryStrategy(
  payload: Payload,
  state: RetryState,
  sendStrategy: SendStrategy,
  onRetryExhausted: (payload: Payload) => void
) {
  if (
    state.transportStatus === TransportStatus.UP &&
    state.queuedPayloads.size() === 0 &&
    state.bandwidthMonitor.canHandle(payload)
  ) {
    send(payload, state, sendStrategy, onRetryExhausted, {
      onSuccess: () =>
        retryQueuedPayloads(
          RetryReason.AFTER_SUCCESS,
          state,
          sendStrategy,
          onRetryExhausted
        ),
      onFailure: () => {
        state.queuedPayloads.enqueue(payload);
        scheduleRetry(state, sendStrategy, onRetryExhausted);
      },
    });
  } else {
    state.queuedPayloads.enqueue(payload);
  }
}

function scheduleRetry(
  state: RetryState,
  sendStrategy: SendStrategy,
  onRetryExhausted: (payload: Payload) => void
) {
  if (state.transportStatus !== TransportStatus.DOWN) {
    return;
  }
  setTimeout(() => {
    const payload = state.queuedPayloads.first();
    if (!payload) {
      return;
    }
    send(payload, state, sendStrategy, onRetryExhausted, {
      onSuccess: () => {
        state.queuedPayloads.dequeue();
        state.currentBackoffTime = INITIAL_BACKOFF_TIME;
        retryQueuedPayloads(
          RetryReason.AFTER_RESUME,
          state,
          sendStrategy,
          onRetryExhausted
        );
      },
      onFailure: () => {
        state.currentBackoffTime = Math.min(
          MAX_BACKOFF_TIME,
          state.currentBackoffTime * 2
        );
        scheduleRetry(state, sendStrategy, onRetryExhausted);
      },
    });
  }, state.currentBackoffTime);
}

function send(
  payload: Payload,
  state: RetryState,
  sendStrategy: SendStrategy,
  onRetryExhausted: (payload: Payload) => void,
  { onSuccess, onFailure }: { onSuccess: () => void; onFailure: () => void }
) {
  state.bandwidthMonitor.add(payload);
  sendStrategy(payload, (response) => {
    state.bandwidthMonitor.remove(payload);
    if (!shouldRetryRequest(response)) {
      state.transportStatus = TransportStatus.UP;
      onSuccess();
    } else {
      // do not consider transport down if another ongoing request could succeed
      state.transportStatus =
        state.bandwidthMonitor.ongoingRequestCount > 0
          ? TransportStatus.FAILURE_DETECTED
          : TransportStatus.DOWN;

      payload.retry = {
        count: payload.retry ? payload.retry.count + 1 : 1,
        lastFailureStatus: response.status,
      };

      if (payload.retry.count > MAX_RETRY_COUNT) {
        // Retry exhausted, move to persistence
        onRetryExhausted(payload);
        onSuccess(); // Consider it "done" for the queue
      } else {
        onFailure();
      }
    }
  });
}

function retryQueuedPayloads(
  reason: RetryReason,
  state: RetryState,
  sendStrategy: SendStrategy,
  onRetryExhausted: (payload: Payload) => void
) {
  const previousQueue = state.queuedPayloads;
  state.queuedPayloads = newPayloadQueue();
  while (previousQueue.size() > 0) {
    sendWithRetryStrategy(
      previousQueue.dequeue()!,
      state,
      sendStrategy,
      onRetryExhausted
    );
  }
}

function shouldRetryRequest(response: HttpResponse) {
  return (
    response.status === 0 || // Network error
    response.status === 408 || // Timeout
    response.status === 429 || // Too many requests
    (response.status >= 500 && response.status < 600) // Server error
  );
}

export function newRetryState(): RetryState {
  return {
    transportStatus: TransportStatus.UP,
    currentBackoffTime: INITIAL_BACKOFF_TIME,
    bandwidthMonitor: newBandwidthMonitor(),
    queuedPayloads: newPayloadQueue(),
  };
}

function newPayloadQueue() {
  const queue: Payload[] = [];
  return {
    bytesCount: 0,
    enqueue(payload: Payload) {
      if (this.isFull()) {
        return;
      }
      queue.push(payload);
      this.bytesCount += payload.bytesCount;
    },
    first() {
      return queue[0];
    },
    dequeue() {
      const payload = queue.shift();
      if (payload) {
        this.bytesCount -= payload.bytesCount;
      }
      return payload;
    },
    size() {
      return queue.length;
    },
    isFull() {
      return this.bytesCount >= MAX_QUEUE_BYTES_COUNT;
    },
  };
}

function newBandwidthMonitor() {
  return {
    ongoingRequestCount: 0,
    ongoingByteCount: 0,
    canHandle(payload: Payload) {
      return (
        this.ongoingRequestCount === 0 ||
        (this.ongoingByteCount + payload.bytesCount <= MAX_ONGOING_BYTES_COUNT &&
          this.ongoingRequestCount < MAX_ONGOING_REQUESTS)
      );
    },
    add(payload: Payload) {
      this.ongoingRequestCount += 1;
      this.ongoingByteCount += payload.bytesCount;
    },
    remove(payload: Payload) {
      this.ongoingByteCount -= payload.bytesCount;
      this.ongoingRequestCount -= 1;
    },
  };
}
