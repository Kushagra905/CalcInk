export type IconName =
  | "pen"
  | "eraser"
  | "pixel"
  | "undo"
  | "redo"
  | "clear"
  | "pages"
  | "focus"
  | "plus"
  | "download"
  | "move"
  | "more";
const paths: Record<IconName, string> = {
  pen: "m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5M4 16l4 4",
  eraser: "m15 3 6 6-12 12H5l-3-3L15 3Zm-7 7 6 6M9 21h13",
  pixel: "M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h6v6h-6v-6Z",
  undo: "M9 5 3 11l6 6M3 11h12a6 6 0 0 1 0 12",
  redo: "m15 5 6 6-6 6M21 11H9a6 6 0 0 0 0 12",
  clear: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  pages: "M4 3h16v18H4V3Zm5 0v18M12 8h5m-5 4h5m-5 4h3",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  move: "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
