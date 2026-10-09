import { useEffect, useId, useRef, useState } from "react";

const swatches = [
  ["Graphite", "#30352f"],
  ["Blue", "#2155cd"],
  ["Green", "#35634d"],
  ["Red", "#c2343d"],
  ["Purple", "#7952b3"],
  ["Orange", "#d9792b"],
  ["Yellow", "#f2c94c"],
  ["Pink", "#d7639b"],
  ["Teal", "#238a90"],
  ["Brown", "#996240"],
  ["Grey", "#879087"],
  ["White", "#ffffff"],
];

function toHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const h =
    delta === 0
      ? 0
      : max === r
        ? ((g - b) / delta + 6) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  return { h: h * 60, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}
function toHex(h: number, s: number, v: number) {
  const saturation = s / 100,
    value = v / 100;
  return `#${[5, 3, 1]
    .map((n) => {
      const k = (n + h / 60) % 6;
      const channel =
        value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1));
      return Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export function ColourPicker({
  color,
  disabled,
  onChange,
}: {
  color: string;
  disabled: boolean;
  onChange(color: string): void;
}) {
  const picker = useRef<HTMLDetailsElement>(null);
  const id = useId();
  const [draft, setDraft] = useState(color);
  const [hsv, setHsv] = useState(() => toHsv(color));
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    setDraft(color);
    setHsv((current) => {
      const next = toHsv(color);
      return {
        ...next,
        h: next.s === 0 ? current.h : next.h,
        s: next.v === 0 ? current.s : next.s,
      };
    });
  }, [color]);
  useEffect(() => {
    function close(event: Event) {
      if (
        event.type === "resize" ||
        (event instanceof KeyboardEvent && event.key === "Escape") ||
        (event.type === "pointerdown" &&
          event.target instanceof Node &&
          !picker.current?.contains(event.target))
      ) {
        if (picker.current?.open) {
          picker.current.open = false;
          if (event instanceof KeyboardEvent)
            picker.current.querySelector("summary")?.focus();
        }
      }
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
    };
  }, []);
  function choose(value: string) {
    onChange(value);
    setDraft(value);
    setHsv(toHsv(value));
  }
  return (
    <details
      ref={picker}
      className="colour-selector"
      onToggle={(event) => {
        if (disabled) {
          event.currentTarget.open = false;
          return;
        }
        if (!event.currentTarget.open) return;
        const box = event.currentTarget
          .querySelector("summary")
          ?.getBoundingClientRect();
        const panel = event.currentTarget
          .querySelector(".colour-panel")
          ?.getBoundingClientRect();
        if (box)
          setPosition({
            left: Math.max(
              12,
              Math.min(innerWidth - (panel?.width ?? 300) - 12, box.left),
            ),
            top: Math.max(
              12,
              Math.min(
                innerHeight - (panel?.height ?? 480) - 12,
                box.bottom + 8,
              ),
            ),
          });
      }}
    >
      <summary aria-label="Choose pen colour" aria-disabled={disabled}>
        <span className="colour-chip" style={{ background: color }} />
        <span>Colour</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <fieldset
        className="colour-panel"
        style={position}
        aria-label="Pen colours"
      >
        <div className="colour-panel-heading">
          <strong>Make your mark</strong>
          <span style={{ background: color }} className="colour-preview" />
        </div>
        <div className="colour-swatches">
          {swatches.map(([name, value]) => (
            <button
              type="button"
              key={name}
              className="colour-swatch"
              aria-label={name}
              aria-pressed={color.toLowerCase() === value}
              style={{ background: value }}
              onClick={() => {
                choose(value);
                if (picker.current) {
                  picker.current.open = false;
                  picker.current.querySelector("summary")?.focus();
                }
              }}
            >
              {color.toLowerCase() === value ? (
                <span aria-hidden="true">✓</span>
              ) : null}
            </button>
          ))}
        </div>
        <label htmlFor={id}>Custom colour</label>
        <input
          id={id}
          aria-label="Pen colour"
          value={draft}
          spellCheck={false}
          maxLength={7}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            if (/^#[0-9a-f]{6}$/i.test(value)) choose(value.toLowerCase());
          }}
          onBlur={() => setDraft(color)}
        />
        {(
          [
            ["Hue", "h", 360],
            ["Saturation", "s", 100],
            ["Brightness", "v", 100],
          ] as const
        ).map(([name, key, max]) => (
          <label className="colour-channel" key={key}>
            {name}
            <input
              type="range"
              aria-label={name}
              min="0"
              max={max}
              value={Math.round(hsv[key])}
              style={{
                backgroundImage:
                  key === "h"
                    ? "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)"
                    : key === "s"
                      ? `linear-gradient(to right, ${toHex(hsv.h, 0, hsv.v)}, ${toHex(hsv.h, 100, hsv.v)})`
                      : `linear-gradient(to right, black, ${toHex(hsv.h, hsv.s, 100)})`,
              }}
              onChange={(event) => {
                const next = { ...hsv, [key]: Number(event.target.value) };
                setHsv(next);
                onChange(toHex(next.h, next.s, next.v));
              }}
            />
            <output>
              {Math.round(hsv[key])}
              {key === "h" ? "°" : "%"}
            </output>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
