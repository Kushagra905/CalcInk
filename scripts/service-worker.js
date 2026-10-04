// offline-build.mjs prepends the immutable build/model manifest.
const manifest = self.CALCINK_OFFLINE_MANIFEST;
const scope = new URL(self.registration.scope);
const prefix = `calcink:${encodeURIComponent(scope.pathname)}:`;
const cacheName = `${prefix}${manifest.version}`;
const url = (path) => new URL(path, scope).href;
const marker = url(".calcink-offline-ready");
const assets = new Map(manifest.assets.map((file) => [url(file.path), file]));
let preparation;

async function notify(state) {
  const message = {
    type: "OFFLINE_STATE",
    version: manifest.version,
    modelId: manifest.modelId,
    ...state,
  };
  for (const client of await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  }))
    if (client.url.startsWith(scope.href)) client.postMessage(message);
}
async function valid(response, file) {
  if (!response?.ok) return false;
  const data = await response.clone().arrayBuffer();
  if (data.byteLength !== file.bytes) return false;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return (
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("") === file.sha256
  );
}
async function cacheFiles(files, progress) {
  const cache = await caches.open(cacheName);
  let complete = 0;
  for (const file of files) {
    const key = url(file.path);
    const previous = await cache.match(key);
    if (!(await valid(previous, file))) {
      if (previous) await cache.delete(key);
      const response = await fetch(key, {
        cache: "reload",
        signal: AbortSignal.timeout(120_000),
      });
      if (!(await valid(response, file)))
        throw new Error(`ASSET_VERIFICATION_FAILED: ${file.path}`);
      await cache.put(key, response);
    }
    complete++;
    if (progress)
      await notify({
        kind: "preparing",
        progress: complete / files.length,
        message: `Verifying offline files (${complete}/${files.length})`,
      });
  }
}
function prepare() {
  if (preparation) return preparation;
  preparation = (async () => {
    const cache = await caches.open(cacheName);
    await cache.delete(marker);
    await notify({
      kind: "preparing",
      progress: 0,
      message: "Preparing offline files",
    });
    await cacheFiles(manifest.assets, true);
    await cache.put(marker, new Response(manifest.version));
    await notify({ kind: "cached" });
  })()
    .catch(async (error) => {
      await notify({
        kind: "error",
        message:
          error?.name === "QuotaExceededError"
            ? "Storage is full. Free browser storage and retry offline preparation."
            : "Offline files could not be verified. Reconnect and retry offline preparation.",
      });
    })
    .finally(() => {
      preparation = undefined;
    });
  return preparation;
}
self.addEventListener("install", (event) => {
  event.waitUntil(cacheFiles(manifest.shell, false));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      for (const name of await caches.keys())
        if (name.startsWith(prefix) && name !== cacheName)
          await caches.delete(name);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (!event.source?.url?.startsWith(scope.href)) return;
  if (event.data?.type === "PREPARE") {
    if (
      event.data.version !== manifest.version ||
      event.data.modelId !== manifest.modelId
    ) {
      event.source.postMessage({
        type: "OFFLINE_STATE",
        version: event.data.version,
        modelId: event.data.modelId,
        kind: "error",
        message: "An application update is needed before offline preparation.",
      });
    } else event.waitUntil(prepare());
  }
  if (event.data?.type === "ACTIVATE_UPDATE") {
    event.waitUntil(
      (async () => {
        const others = (
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          })
        ).filter(
          (client) =>
            client.id !== event.source.id && client.url.startsWith(scope.href),
        );
        if (others.length) {
          event.source.postMessage({ type: "UPDATE_BLOCKED" });
          return;
        }
        await self.skipWaiting();
      })(),
    );
  }
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin !== scope.origin ||
    !requestUrl.pathname.startsWith(scope.pathname)
  )
    return;
  if (
    requestUrl.pathname === new URL("offline-manifest.json", scope).pathname
  ) {
    event.respondWith(
      new Response(JSON.stringify(manifest), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    return;
  }
  const key =
    event.request.mode === "navigate" && requestUrl.pathname === scope.pathname
      ? url("index.html")
      : `${requestUrl.origin}${requestUrl.pathname}`;
  if (!assets.has(key)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(key);
      if (cached) return cached;
      if (await cache.match(marker)) {
        await cache.delete(marker);
        await notify({
          kind: "error",
          message:
            "An offline file is missing. Reconnect and retry offline preparation.",
        });
      }
      try {
        return await fetch(event.request);
      } catch {
        return new Response("Required offline file is unavailable", {
          status: 503,
        });
      }
    })(),
  );
});
