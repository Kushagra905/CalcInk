import type { AdapterProgress, ModelManifest } from "./protocol";

export function assetUrl(baseUrl: string, path: string): string {
  if (
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes(":") ||
    path.includes("\\")
  ) {
    throw new Error("INVALID_ASSET_PATH");
  }
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith("/")) throw new Error("INVALID_BASE_URL");
  return new URL(path, base).href;
}

export async function verifyLocalAssets(
  manifest: ModelManifest,
  baseUrl: string,
  report?: (progress: AdapterProgress) => void,
): Promise<void> {
  if (!manifest.files.length) throw new Error("EMPTY_MODEL_MANIFEST");
  let complete = 0;
  for (const file of manifest.files) {
    report?.({
      stage: "verifying",
      fraction: complete / manifest.files.length,
      detail: file.path,
    });
    const response = await fetch(assetUrl(baseUrl, file.path));
    if (!response.ok) throw new Error(`ASSET_MISSING: ${file.path}`);
    const data = await response.arrayBuffer();
    if (data.byteLength !== file.bytes)
      throw new Error(`ASSET_SIZE_MISMATCH: ${file.path}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== file.sha256)
      throw new Error(`ASSET_HASH_MISMATCH: ${file.path}`);
    complete++;
  }
}
