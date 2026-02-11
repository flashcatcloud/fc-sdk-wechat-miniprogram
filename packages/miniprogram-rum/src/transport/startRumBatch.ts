import {
  createBatch,
  createFlushController,
  createIdentityEncoder,
} from "@flashcatcloud/miniprogram-core";
import type { LifeCycle } from "../domain/lifeCycle";
import { LifeCycleEventType } from "../domain/lifeCycle";
import type { RumConfiguration } from "../domain/configuration/configuration";
import type { PlatformAdapter } from "@flashcatcloud/miniprogram-platform";
import { createHttpRequest } from "@flashcatcloud/miniprogram-platform";

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  adapter: PlatformAdapter
) {
  const encoder = createIdentityEncoder();
  const request = createHttpRequest(
    adapter,
    configuration.endpointBuilder,
    configuration.debug
  );
  const flushController = createFlushController(
    configuration.flushInterval,
    64 * 1024
  );

  const batch = createBatch({
    encoder,
    request,
    flushController,
    messageBytesLimit: 256 * 1024,
  });

  const subscription = lifeCycle.subscribe(
    LifeCycleEventType.RUM_EVENT_COLLECTED,
    (event) => {
      if (configuration.debug) {
        console.log("[FlashCat RUM] 📊 收集到事件", {
          type: (event as any).type,
          date: (event as any).date,
          事件: event,
        });
      }
      batch.add(event as unknown as Record<string, unknown>);
    }
  );

  if (configuration.debug) {
    console.log("[FlashCat RUM] 🚀 批量上报已启动", {
      上报间隔: `${configuration.flushInterval}ms`,
      最大消息大小: "256KB",
    });
  }

  return {
    stop: () => {
      subscription.unsubscribe();
      batch.stop();
    },
  };
}
