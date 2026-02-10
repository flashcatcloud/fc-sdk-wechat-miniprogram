import type { Encoder } from "../tools/encoder";
import { jsonStringify } from "../tools/serialisation/jsonStringify";
import type { FlushController, FlushEvent } from "./flushController";

export interface Payload {
  data: string;
  bytesCount: number;
  encoding?: string;
}

export interface HttpRequest {
  send: (payload: Payload) => void;
  sendOnExit: (payload: Payload) => void;
}

export interface Batch {
  add: (message: Record<string, unknown>) => void;
  stop: () => void;
}

export function createBatch({
  encoder,
  request,
  flushController,
  messageBytesLimit,
}: {
  encoder: Encoder;
  request: HttpRequest;
  flushController: FlushController;
  messageBytesLimit: number;
}): Batch {
  const flushSubscription = flushController.flushObservable.subscribe((event) =>
    flush(event)
  );

  function add(message: Record<string, unknown>) {
    const serializedMessage = jsonStringify(message);
    if (!serializedMessage) {
      return;
    }
    if (serializedMessage.length >= messageBytesLimit) {
      return;
    }
    flushController.notifyBeforeAddMessage(serializedMessage.length);
    encoder.write(
      encoder.isEmpty ? serializedMessage : `\n${serializedMessage}`
    );
    flushController.notifyAfterAddMessage();
  }

  function flush(event: FlushEvent) {
    encoder.finish((encoderResult) => {
      const payload: Payload = {
        data: encoderResult.output,
        bytesCount: encoderResult.outputBytesCount,
      };
      if (!payload.data) {
        return;
      }
      if (event.reason === "page_exit") {
        request.sendOnExit(payload);
      } else {
        request.send(payload);
      }
    });
  }

  return {
    add,
    stop: flushSubscription.unsubscribe,
  };
}
