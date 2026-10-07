import { PAGE, RULE_SPACING } from "../document/rows";
import type { DocumentStore } from "../document/store";
import { replayRow } from "../rendering/replay";
import { drawAnswer } from "../rendering/results";
import type { RowFeedback } from "./Notebook";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  window.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportPagePng(
  document: DocumentStore,
  title: string,
  feedback: Record<string, RowFeedback>,
) {
  const epoch = document.getEpoch();
  const rows = document.getRows();
  const accepted = rows.map((row) => {
    const result = feedback[row.rowId]?.result;
    return result?.epoch === epoch && result.rowRevision === row.rowRevision
      ? result
      : undefined;
  });
  await window.document.fonts.ready;
  const canvas = window.document.createElement("canvas");
  canvas.width = PAGE.width + 64;
  canvas.height = PAGE.height + 170;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is unavailable in this browser.");
  context.fillStyle = "#fffef8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#30352f";
  context.font = "italic 40px Georgia, serif";
  context.fillText(title || "Untitled page", 68, 63, PAGE.width - 100);
  context.font = '400 16px "Inter", sans-serif';
  context.fillStyle = "#646b61";
  context.fillText("CalcInk · Math notebook", 68, 94);
  context.save();
  context.translate(32, 120);
  context.strokeStyle = "#dceef8";
  context.lineWidth = 1;
  for (let y = RULE_SPACING; y <= PAGE.height; y += RULE_SPACING) {
    context.beginPath();
    context.moveTo(48, y);
    context.lineTo(PAGE.width - 24, y);
    context.stroke();
  }
  context.strokeStyle = "#f3b9a8";
  context.beginPath();
  context.moveTo(32, 0);
  context.lineTo(32, PAGE.height);
  context.stroke();
  rows.forEach((row, index) => {
    replayRow(context, row.rowId, row.operations);
    const result = accepted[index];
    if (result) drawAnswer(context, result);
  });
  context.restore();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not export this page.")),
      "image/png",
    ),
  );
  const filename = (title || "calcink-page")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 64);
  downloadBlob(blob, `${filename}.png`);
}
