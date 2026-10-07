import type { NotebookCollection } from "./notebooks";

export type SaveState = {
  kind: "loading" | "saving" | "saved" | "session" | "error";
  message: string;
  retryable?: boolean;
};
const DATABASE = "calcink-notebooks";

export function connectNotebookStorage(
  collection: NotebookCollection,
  onState: (state: SaveState) => void,
  allowSave: () => boolean = () => true,
) {
  let disposed = false;
  let db: IDBDatabase | undefined;
  let ready = false;
  let writing = false;
  let dirty = false;
  let releaseWriter: (() => void) | undefined;
  let writer = false;
  let opening = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  onState({ kind: "loading", message: "Opening your notebook…" });
  async function save() {
    if (disposed || !db || !ready || writing || !dirty) return;
    if (!allowSave()) {
      dirty = false;
      onState({
        kind: "session",
        message: "Capture ink stays in this session",
      });
      return;
    }
    dirty = false;
    writing = true;
    onState({ kind: "saving", message: "Saving…" });
    try {
      const value = collection.serialize();
      await new Promise<void>((resolve, reject) => {
        const transaction = db?.transaction("notebooks", "readwrite");
        if (!transaction) return reject(new Error("Storage unavailable"));
        transaction.objectStore("notebooks").put(value, "current");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
      if (!disposed && !dirty)
        onState({ kind: "saved", message: "Saved on this device" });
    } catch {
      dirty = true;
      if (!disposed)
        onState({
          kind: "error",
          message: "Could not save. Export a backup to keep your work.",
          retryable: true,
        });
    } finally {
      writing = false;
    }
  }
  let revision = 0;
  const unsubscribe = collection.subscribe((event) => {
    if (!ready || event?.phase === "begin" || event?.phase === "cancel") return;
    if (!allowSave()) {
      dirty = false;
      clearTimeout(timer);
      onState({
        kind: "session",
        message: "Capture ink stays in this session",
      });
      return;
    }
    dirty = true;
    revision++;
    onState({ kind: "saving", message: "Saving…" });
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 500);
  });
  async function flush() {
    const before = revision;
    await save();
    if (revision !== before && dirty && !disposed) void flush();
  }
  async function open() {
    if (opening || disposed) return;
    opening = true;
    try {
      // Only one tab can write the shared notebook. Other tabs can export their session.
      writer = false;
      if (navigator.locks) {
        await new Promise<void>((resolve, reject) => {
          const controller = new AbortController();
          // Queue briefly so React's development remount can release its opening lease.
          const timeout = setTimeout(() => controller.abort(), 500);
          void navigator.locks
            .request(
              "calcink-notebook-writer",
              { signal: controller.signal },
              async (lock) => {
                clearTimeout(timeout);
                writer = !!lock && !disposed;
                resolve();
                if (writer)
                  await new Promise<void>((release) => {
                    releaseWriter = release;
                  });
              },
            )
            .catch((error: unknown) => {
              clearTimeout(timeout);
              if (error instanceof DOMException && error.name === "AbortError")
                resolve();
              else reject(error);
            });
        });
      }
      if (disposed) {
        releaseWriter?.();
        return;
      }
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("notebooks");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("Storage blocked by another tab"));
      });
      if (disposed) {
        opened.close();
        return;
      }
      db = opened;
      db.onversionchange = () => {
        ready = false;
        db?.close();
        if (!disposed)
          onState({
            kind: "error",
            message:
              "Notebook storage changed in another tab. Export a backup before reloading.",
          });
      };
      const saved = await new Promise<unknown>((resolve, reject) => {
        const request = opened
          .transaction("notebooks")
          .objectStore("notebooks")
          .get("current");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (disposed) return;
      if (saved !== undefined) collection.restore(saved);
      ready = writer;
      onState(
        writer
          ? { kind: "saved", message: "Saved on this device" }
          : {
              kind: "session",
              message:
                "Session only · another tab owns saving, or storage locking is unavailable",
            },
      );
    } catch {
      releaseWriter?.();
      releaseWriter = undefined;
      db?.close();
      if (!disposed)
        onState({
          kind: "error",
          message:
            "Notebook storage could not open. This session will not overwrite saved work; export a backup.",
        });
    } finally {
      opening = false;
    }
  }
  const hidden = () => {
    if (window.document.visibilityState === "hidden") void flush();
  };
  window.document.addEventListener("visibilitychange", hidden);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (ready && (dirty || writing)) {
      event.preventDefault();
      event.returnValue = "";
      void flush();
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  void open();
  return {
    retry() {
      if (ready) {
        dirty = true;
        void flush();
      } else {
        db?.close();
        releaseWriter?.();
        releaseWriter = undefined;
        void open();
      }
    },
    dispose() {
      unsubscribe();
      clearTimeout(timer);
      window.document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("beforeunload", beforeUnload);
      // Start an outstanding transaction before closing; IndexedDB completes it.
      void flush();
      disposed = true;
      db?.close();
      releaseWriter?.();
    },
  };
}
