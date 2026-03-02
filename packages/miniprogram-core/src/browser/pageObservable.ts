import { Observable } from "@flashcatcloud/miniprogram-core";

export type PageLifecycle = "load" | "show" | "ready" | "hide" | "unload";

export interface PageEvent {
  route: string;
  lifecycle: PageLifecycle;
  time: number;
}

export interface UserActionEvent {
  route: string;
  type: string;
  time: number;
}

declare let Page: (options: Record<string, any>) => void;

export function initPageObservable() {
  const pageObservable = new Observable<PageEvent>();
  const actionObservable = new Observable<UserActionEvent>();
  const originalPage = Page;

  function wrapHook(
    options: Record<string, any>,
    hookName: string,
    lifecycle: PageLifecycle,
  ) {
    const original = options[hookName];
    options[hookName] = function (...args: any[]) {
      const route = this?.route || "";
      pageObservable.notify({ route, lifecycle, time: Date.now() });
      return original?.apply(this, args);
    };
  }

  function wrapActionHandlers(options: Record<string, any>) {
    Object.keys(options).forEach((key) => {
      const value = options[key];
      if (typeof value !== "function") {
        return;
      }
      options[key] = function (...args: any[]) {
        const event = args[0];
        if (event && typeof event.type === "string") {
          const route = this?.route || "";
          actionObservable.notify({
            route,
            type: event.type,
            time: Date.now(),
          });
        }
        return value.apply(this, args);
      };
    });
  }

  // eslint-disable-next-line no-global-assign
  Page = (options: Record<string, any>) => {
    wrapHook(options, "onLoad", "load");
    wrapHook(options, "onShow", "show");
    wrapHook(options, "onReady", "ready");
    wrapHook(options, "onHide", "hide");
    wrapHook(options, "onUnload", "unload");
    wrapActionHandlers(options);
    return originalPage(options);
  };

  return {
    pageObservable,
    actionObservable,
    stop: () => {
      // eslint-disable-next-line no-global-assign
      Page = originalPage;
    },
  };
}
