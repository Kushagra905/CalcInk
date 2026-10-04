import { selectedModelId } from "../recognition/candidates";

export type OfflineState =
  | { kind: "unavailable" }
  | { kind: "preparing"; progress: number; message: string }
  | { kind: "cached" }
  | { kind: "error"; message: string };

export function connectOffline(
  onState: (state: OfflineState) => void,
  onUpdate: () => void,
  canReload: () => boolean,
) {
  let disposed = false;
  let connecting = false;
  let registration: ServiceWorkerRegistration | undefined;
  let updateRequested = false;
  const cleanups: (() => void)[] = [];
  const version = document.querySelector<HTMLMetaElement>(
    'meta[name="calcink-build"]',
  )?.content;
  const base = new URL(import.meta.env.BASE_URL, window.location.href);

  function prepare() {
    if (disposed || !registration?.active) return;
    onState({
      kind: "preparing",
      progress: 0,
      message: "Verifying offline files",
    });
    registration.active.postMessage({
      type: "PREPARE",
      version,
      modelId: selectedModelId,
    });
  }
  function message(event: MessageEvent) {
    if (
      disposed ||
      !registration ||
      (event.source !== registration.active &&
        event.source !== registration.waiting)
    )
      return;
    if (event.data?.type === "UPDATE_BLOCKED") {
      updateRequested = false;
      onState({
        kind: "error",
        message: "Close other CalcInk tabs before applying this update.",
      });
      return;
    }
    const state = event.data;
    if (
      state?.type !== "OFFLINE_STATE" ||
      state.version !== version ||
      state.modelId !== selectedModelId
    )
      return;
    if (state.kind === "cached") onState({ kind: "cached" });
    else if (state.kind === "error" && typeof state.message === "string")
      onState({ kind: "error", message: state.message });
    else if (state.kind === "preparing" && Number.isFinite(state.progress))
      onState({
        kind: "preparing",
        progress: Math.max(0, Math.min(1, state.progress)),
        message: state.message,
      });
  }
  function controllerChange() {
    if (disposed) return;
    if (updateRequested) {
      if (canReload()) window.location.reload();
      else {
        updateRequested = false;
        onUpdate();
        onState({
          kind: "error",
          message:
            "Update activated. Finish or clear your ink before reloading.",
        });
      }
    } else prepare();
  }
  function watch(worker: ServiceWorker) {
    const changed = () => {
      if (!disposed && worker.state === "installed" && registration?.waiting)
        onUpdate();
    };
    worker.addEventListener("statechange", changed);
    cleanups.push(() => worker.removeEventListener("statechange", changed));
  }
  async function start() {
    if (connecting || disposed) return;
    if (
      !version ||
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      onState({ kind: "unavailable" });
      return;
    }
    connecting = true;
    onState({
      kind: "preparing",
      progress: 0,
      message: "Preparing offline support",
    });
    try {
      registration = await navigator.serviceWorker.register(
        new URL("service-worker.js", base),
        { scope: base.pathname, updateViaCache: "none" },
      );
      if (disposed) return;
      const updateFound = () => {
        if (registration?.installing) watch(registration.installing);
      };
      registration.addEventListener("updatefound", updateFound);
      cleanups.push(() =>
        registration?.removeEventListener("updatefound", updateFound),
      );
      if (registration.waiting) onUpdate();
      if (registration.installing) watch(registration.installing);
      if (!registration.active) {
        const worker = registration.installing;
        if (!worker) throw new Error("NO_SERVICE_WORKER");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => finish(new Error("INSTALL_TIMEOUT")),
            90_000,
          );
          function finish(error?: Error) {
            clearTimeout(timer);
            worker?.removeEventListener("statechange", changed);
            if (error) reject(error);
            else resolve();
          }
          function changed() {
            if (worker?.state === "activated") finish();
            if (worker?.state === "redundant")
              finish(new Error("INSTALL_FAILED"));
          }
          worker.addEventListener("statechange", changed);
          cleanups.push(() => finish(new Error("DISPOSED")));
          changed();
        });
      }
      prepare();
    } catch {
      if (!disposed)
        onState({
          kind: "error",
          message:
            "Offline support could not start. Reconnect and retry offline preparation.",
        });
    } finally {
      connecting = false;
    }
  }
  function online() {
    if (registration?.active) prepare();
    else void start();
    void registration?.update().catch(() => {});
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", message);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChange,
    );
  }
  window.addEventListener("online", online);
  void start();
  return {
    retry() {
      if (registration?.active) prepare();
      else void start();
    },
    update() {
      if (!canReload()) return;
      if (registration?.waiting) {
        updateRequested = true;
        registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
      } else window.location.reload();
    },
    dispose() {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      navigator.serviceWorker?.removeEventListener("message", message);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerChange,
      );
      window.removeEventListener("online", online);
    },
  };
}
