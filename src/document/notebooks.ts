import { PAGE } from "./rows";
import { createDocumentStore, type DocumentStore } from "./store";
import type { DocumentEditEvent, RowSnapshot } from "./types";

export const MAX_PAGES = 12;
export interface SavedNotebook {
  format: "calcink-notebook";
  version: 1;
  geometry: typeof PAGE;
  activePageId: string;
  pages: { id: string; title: string; rows: readonly RowSnapshot[] }[];
}

export function createNotebookCollection() {
  let pages: { id: string; title: string; store: DocumentStore }[] = [
    {
      id: crypto.randomUUID(),
      title: "Untitled page",
      store: createDocumentStore(),
    },
  ];
  let activeId: string = pages[0].id;
  let epoch = 0;
  const listeners = new Set<(event?: DocumentEditEvent) => void>();
  const documentListeners = new Set<(event: DocumentEditEvent) => void>();
  const active = () => {
    const page = pages.find((page) => page.id === activeId);
    if (!page) throw new Error("Missing notebook page");
    return page;
  };
  function publish(event?: DocumentEditEvent) {
    if (event) for (const listener of documentListeners) listener(event);
    for (const listener of listeners) listener(event);
  }
  function observe() {
    let localEpoch = active().store.getEpoch();
    return active().store.subscribe((event) => {
      // A global epoch makes replies from another page permanently obsolete.
      if (event.epoch !== localEpoch) {
        localEpoch = event.epoch;
        epoch++;
      }
      publish({ ...event, epoch });
    });
  }
  let unsubscribe = observe();
  function changedPage() {
    epoch++;
    unsubscribe = observe();
    publish({
      phase: "commit",
      reason: "clear",
      epoch,
      rows: active().store.getRows(),
    });
  }
  const document: DocumentStore = {
    getEpoch: () => epoch,
    getRow: (id) => active().store.getRow(id),
    getRows: () => active().store.getRows(),
    getCapacityState: () => active().store.getCapacityState(),
    getHistoryState: () => active().store.getHistoryState(),
    subscribe(listener) {
      documentListeners.add(listener);
      return () => {
        documentListeners.delete(listener);
      };
    },
    begin: (id, reason) => active().store.begin(id, reason),
    commit: (operations) => active().store.commit(operations),
    commitRows: (updates) => active().store.commitRows(updates),
    cancel: () => active().store.cancel(),
    clear: () => active().store.clear(),
    undo: () => active().store.undo(),
    redo: () => active().store.redo(),
    reset: (id) => active().store.reset(id),
  };
  return {
    document,
    getInfo: () => ({
      activePageId: activeId,
      pages: pages.map(({ id, title }) => ({ id, title })),
    }),
    hasInk: () => pages.some((page) => page.store.getHistoryState().canClear),
    subscribe(listener: (event?: DocumentEditEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    activate(id: string) {
      if (id === activeId) return;
      if (!pages.some((page) => page.id === id))
        throw new RangeError("Unknown page");
      document.cancel();
      unsubscribe();
      activeId = id;
      changedPage();
    },
    addPage() {
      if (pages.length >= MAX_PAGES)
        throw new RangeError("Notebook page limit reached");
      document.cancel();
      unsubscribe();
      const page = {
        id: crypto.randomUUID(),
        title: "Untitled page",
        store: createDocumentStore(),
      };
      pages = [...pages, page];
      activeId = page.id;
      changedPage();
    },
    rename(title: string) {
      active().title = title.slice(0, 64);
      publish();
    },
    serialize(): SavedNotebook {
      return {
        format: "calcink-notebook",
        version: 1,
        geometry: PAGE,
        activePageId: activeId,
        pages: pages.map(({ id, title, store }) => ({
          id,
          title,
          rows: store.getRows(),
        })),
      };
    },
    restore(input: unknown) {
      if (!input || typeof input !== "object")
        throw new Error("Invalid notebook");
      const data = input as SavedNotebook;
      if (
        data.format !== "calcink-notebook" ||
        data.version !== 1 ||
        data.geometry?.width !== PAGE.width ||
        data.geometry?.height !== PAGE.height ||
        !Array.isArray(data.pages) ||
        !data.pages.length ||
        data.pages.length > MAX_PAGES
      )
        throw new Error("Unsupported notebook");
      const ids = new Set<string>();
      const restored = data.pages.map((page) => {
        if (
          !page ||
          typeof page.id !== "string" ||
          !page.id ||
          ids.has(page.id) ||
          typeof page.title !== "string" ||
          page.title.length > 64 ||
          !Array.isArray(page.rows)
        )
          throw new Error("Invalid notebook page");
        ids.add(page.id);
        return {
          id: page.id,
          title: page.title,
          store: createDocumentStore(page.rows),
        };
      });
      if (!ids.has(data.activePageId)) throw new Error("Missing active page");
      document.cancel();
      unsubscribe();
      pages = restored;
      activeId = data.activePageId;
      changedPage();
    },
  };
}
export type NotebookCollection = ReturnType<typeof createNotebookCollection>;
