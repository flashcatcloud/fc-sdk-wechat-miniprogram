import type { Observable } from "@flashcatcloud/miniprogram-core";
import type { PageEvent } from "@flashcatcloud/miniprogram-platform";
import { generateUUID } from "@flashcatcloud/miniprogram-core";
import { LifeCycleEventType } from "../lifeCycle";
import type { LifeCycle } from "../lifeCycle";
import type { PageHistoryEntry } from "../contexts/pageHistory";
import { PageContextManager } from "../contexts/pageContextManager";
import { EventCountsTracker } from "../contexts/eventCountsTracker";
import type { RawRumViewEvent } from "../../rawRumEvent.types";
import type { RumConfiguration } from "../configuration/configuration";

export interface PageCollection {
  stop: () => void;
  getCurrentPage: () => PageHistoryEntry | undefined;
  startManualPage: (name: string) => void;
}

// 周期性更新间隔，与 browser-sdk 保持一致
const PAGE_UPDATE_INTERVAL = 3000; // 3秒

export function startPageCollection(
  lifeCycle: LifeCycle,
  pageObservable: Observable<PageEvent>,
  configuration: RumConfiguration,
) {
  let currentPage: PageHistoryEntry | undefined;
  const pageContextManager = new PageContextManager();
  const eventCountsTracker = new EventCountsTracker(lifeCycle);

  /**
   * 构建当前页面的 page 事件数据
   */
  function buildPageEventData(
    page: PageHistoryEntry,
    overrides: Partial<RawRumViewEvent["view"]> = {},
  ): RawRumViewEvent["view"] {
    const counts = eventCountsTracker.getCounts();
    return {
      id: page.id,
      url: page.name,
      name: page.name,
      referrer: page.referrer,
      loading_type: page.loadingType,
      is_active: true,
      action: { count: counts.actionCount },
      error: { count: counts.errorCount },
      resource: { count: counts.resourceCount },
      ...overrides,
    };
  }

  function buildDdData(page: PageHistoryEntry): RawRumViewEvent["_dd"] {
    return {
      document_version: page.documentVersion,
      format_version: 2,
      page_states: page.pageStates,
      configuration: {
        session_sample_rate: configuration.sessionSampleRate,
        session_replay_sample_rate: 0,
        start_session_replay_recording_manually: false,
      },
    };
  }

  // 周期性更新函数
  function schedulePageUpdate(page: PageHistoryEntry) {
    const intervalId = setInterval(() => {
      if (!page) return;

      const now = Date.now();
      const time_spent = now - page.startTime;
      page.documentVersion = (page.documentVersion || 0) + 1;

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: now,
        type: "view",
        _dd: buildDdData(page),
        view: buildPageEventData(page, { time_spent }),
      });
    }, PAGE_UPDATE_INTERVAL);

    return intervalId;
  }

  // 停止周期性更新
  function stopPageUpdate(page: PageHistoryEntry | undefined) {
    if (page?.updateIntervalId) {
      clearInterval(page.updateIntervalId);
      page.updateIntervalId = undefined;
    }
  }

  function addPageState(page: PageHistoryEntry, state: string, time: number) {
    if (!page.pageStates) {
      page.pageStates = [];
    }
    page.pageStates.push({
      state,
      start: time - page.startTime,
    });
  }

  const subscription = pageObservable.subscribe((event) => {
    // load：创建新页面，记录 loadTime
    if (event.lifecycle === "load") {
      // 清理之前的定时器（如果存在）
      stopPageUpdate(currentPage);

      // 重置计数器（新页面从 0 开始统计）
      eventCountsTracker.reset();

      const referrer = pageContextManager.getReferrer();
      const loadingType = pageContextManager.getLoadingType();

      currentPage = {
        id: generateUUID(),
        name: event.route || "unknown",
        startTime: event.time,
        loadTime: event.time,
        referrer,
        loadingType,
        documentVersion: 0,
      };

      const loadPage = currentPage;
      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event);
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(loadPage),
        view: buildPageEventData(loadPage),
      });

      // 开始周期性更新
      currentPage.updateIntervalId = schedulePageUpdate(loadPage);
    }

    // ready：计算并上报 loading_time
    if (event.lifecycle === "ready" && currentPage && currentPage.loadTime) {
      const loading_time = event.time - currentPage.loadTime;
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1;

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(currentPage),
        view: buildPageEventData(currentPage, { loading_time }),
      });
    }

    // 首次 show（无 currentPage）：创建新页面
    if (event.lifecycle === "show" && !currentPage) {
      stopPageUpdate(currentPage);

      // 重置计数器
      eventCountsTracker.reset();

      const referrer = pageContextManager.getReferrer();
      const loadingType = pageContextManager.getLoadingType();

      currentPage = {
        id: generateUUID(),
        name: event.route || "unknown",
        startTime: event.time,
        referrer,
        loadingType,
        documentVersion: 0,
      };

      const showPage = currentPage;
      lifeCycle.notify(LifeCycleEventType.PAGE_EVENT, event);
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(showPage),
        view: buildPageEventData(showPage),
      });

      currentPage.updateIntervalId = schedulePageUpdate(showPage);
    }

    // 从后台恢复（hide 后的 show）：恢复定时器
    if (
      event.lifecycle === "show" &&
      currentPage &&
      !currentPage.updateIntervalId
    ) {
      addPageState(currentPage, 'active', event.time);
      const time_spent = event.time - currentPage.startTime;
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1;

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(currentPage),
        view: buildPageEventData(currentPage, { time_spent }),
      });

      // 恢复周期性更新
      currentPage.updateIntervalId = schedulePageUpdate(currentPage);
    }

    // hide：暂停更新，但保留页面状态
    if (event.lifecycle === "hide" && currentPage) {
      stopPageUpdate(currentPage);
      addPageState(currentPage, 'hidden', event.time);

      const time_spent = event.time - currentPage.startTime;
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1;

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(currentPage),
        view: buildPageEventData(currentPage, { time_spent, is_active: false }),
      });
    }

    // unload：停止更新并发送最终事件
    if (event.lifecycle === "unload" && currentPage) {
      stopPageUpdate(currentPage);
      addPageState(currentPage, 'terminated', event.time);

      const time_spent = event.time - currentPage.startTime;
      currentPage.documentVersion = (currentPage.documentVersion || 0) + 1;

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: event.time,
        type: "view",
        _dd: buildDdData(currentPage),
        view: buildPageEventData(currentPage, { time_spent, is_active: false }),
      });

      currentPage = undefined;
    }
  });

  return {
    stop: () => {
      stopPageUpdate(currentPage);
      eventCountsTracker.stop();
      subscription.unsubscribe();
    },
    getCurrentPage: () => currentPage,
    startManualPage: (name: string) => {
      stopPageUpdate(currentPage);

      // 重置计数器
      eventCountsTracker.reset();

      const time = Date.now();
      const referrer = pageContextManager.getReferrer();
      const loadingType = pageContextManager.getLoadingType();

      currentPage = {
        id: generateUUID(),
        name,
        startTime: time,
        referrer,
        loadingType,
        documentVersion: 0,
      };

      const manualPage = currentPage;
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        date: time,
        type: "view",
        _dd: buildDdData(manualPage),
        view: buildPageEventData(manualPage),
      });

      currentPage.updateIntervalId = schedulePageUpdate(manualPage);
    },
  };
}
