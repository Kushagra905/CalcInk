import { useMemo } from "react";
import type { DocumentStore } from "../document/store";
import type { PenStyle } from "../document/types";
import { compileEquation } from "../graph/equation";
import type { InkTool } from "../ink/eraser";
import { GraphCanvas } from "./GraphCanvas";
import { Notebook, type RowFeedback } from "./Notebook";

export function GraphWorkspace({
  document,
  equation,
  onEquationChange,
  width,
  color,
  penStyle,
  tool,
  eraserRadius,
  pan,
  onError,
  feedback,
}: {
  document: DocumentStore;
  equation: string;
  onEquationChange(value: string): void;
  width: number;
  color: string;
  penStyle: PenStyle;
  tool: InkTool;
  eraserRadius: number;
  pan: boolean;
  onError(message: string): void;
  feedback: Record<string, RowFeedback>;
}) {
  const parsed = useMemo(() => {
    if (!equation.trim()) return { equation: null, error: "" };
    try {
      return { equation: compileEquation(equation), error: "" };
    } catch (error) {
      return {
        equation: null,
        error: error instanceof Error ? error.message : "Check the equation.",
      };
    }
  }, [equation]);
  return (
    <div className="graph-workspace">
      <section className="graph-writing" aria-label="Graph writing pad">
        <h2>Write an equation</h2>
        <p id="graph-writing-help" className="writing-help">
          Write one equation in x and y, such as y = x² or x² + y² = 9. Pause to
          plot it below.
        </p>
        <div className="graph-pad-viewport">
          <Notebook
            compact
            document={document}
            width={width}
            color={color}
            penStyle={penStyle}
            tool={tool}
            eraserRadius={eraserRadius}
            pan={pan}
            feedback={{}}
            onError={onError}
            title=""
            onTitleChange={() => {}}
            pageNumber={1}
            disabled={false}
          />
        </div>
        <label className="graph-equation-label" htmlFor="graph-equation">
          Equation · edit to correct handwriting or type one
        </label>
        <input
          id="graph-equation"
          aria-label="Graph equation"
          className="graph-equation-input"
          value={equation}
          maxLength={512}
          placeholder="y = x^2"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!parsed.error}
          aria-describedby="graph-equation-status"
          onChange={(event) => onEquationChange(event.target.value)}
        />
        <p
          id="graph-equation-status"
          className={`graph-equation-status${parsed.error ? " input-error" : ""}`}
          role="status"
        >
          {parsed.error ||
            (feedback["row-1"]?.kind === "error"
              ? "Could not read the handwriting. Retry recognition or type the equation above."
              : feedback["row-1"]?.kind === "recognizing"
                ? "Reading handwriting…"
                : parsed.equation
                  ? "Plotted below. Angles are in radians."
                  : "Write or type an equation to start plotting.")}
        </p>
      </section>
      <GraphCanvas equation={parsed.equation} />
      <p className="graph-session-note">
        Graph ink and equations stay in this tab. Switch to Notebook to return
        to your saved pages.
      </p>
    </div>
  );
}
