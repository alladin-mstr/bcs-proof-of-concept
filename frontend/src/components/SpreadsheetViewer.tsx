import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Field } from "@/types";

interface DragState {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

function isCellInRange(col: number, row: number, drag: DragState): boolean {
  const minCol = Math.min(drag.startCol, drag.endCol);
  const maxCol = Math.max(drag.startCol, drag.endCol);
  const minRow = Math.min(drag.startRow, drag.endRow);
  const maxRow = Math.max(drag.startRow, drag.endRow);
  return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
}

export function SpreadsheetViewer({ fileId }: { fileId: string }) {
  const wizardControle = useAppStore((s) => s.wizardControle);
  const fields = useAppStore((s) => s.fields);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const updateFieldLabel = useAppStore((s) => s.updateFieldLabel);

  const [drag, setDrag] = useState<DragState | null>(null);
  const isDragging = useRef(false);

  const file = wizardControle?.files.find((f) => f.id === fileId) ?? null;
  const sheetData = file?.sheetData ?? null;

  const isCellSelected = useCallback(
    (col: number, row: number): Field | undefined => {
      return fields.find(
        (f) =>
          f.type === "cell" &&
          f.cell_ref?.col === col &&
          f.cell_ref?.row === row,
      );
    },
    [fields],
  );

  const isCellInSelectedRange = useCallback(
    (col: number, row: number): boolean => {
      return fields.some((f) => {
        if (f.type !== "cell_range" || !f.range_ref) return false;
        const { startCol, startRow, endCol, endRow } = f.range_ref;
        return col >= startCol && col <= endCol && row >= startRow && row <= endRow;
      });
    },
    [fields],
  );

  const handleMouseDown = useCallback(
    (col: number, row: number) => {
      isDragging.current = true;
      setDrag({ startCol: col, startRow: row, endCol: col, endRow: row });
    },
    [],
  );

  const handleMouseEnter = useCallback(
    (col: number, row: number) => {
      if (!isDragging.current) return;
      setDrag((prev) => (prev ? { ...prev, endCol: col, endRow: row } : prev));
    },
    [],
  );

  const handleMouseUp = useCallback(
    (col: number, row: number) => {
      if (!isDragging.current || !drag || !sheetData) {
        isDragging.current = false;
        setDrag(null);
        return;
      }
      isDragging.current = false;

      const finalDrag = { ...drag, endCol: col, endRow: row };
      setDrag(null);

      const minCol = Math.min(finalDrag.startCol, finalDrag.endCol);
      const maxCol = Math.max(finalDrag.startCol, finalDrag.endCol);
      const minRow = Math.min(finalDrag.startRow, finalDrag.endRow);
      const maxRow = Math.max(finalDrag.startRow, finalDrag.endRow);

      const isSingleCell = minCol === maxCol && minRow === maxRow;

      if (isSingleCell) {
        // Toggle cell selection
        const existingField = isCellSelected(minCol, minRow);
        if (existingField) {
          removeField(existingField.id);
        } else {
          const header = sheetData.headers[minCol] ?? `Col${minCol + 1}`;
          const autoLabel = `${header}_R${minRow + 1}`;
          const newField: Field = {
            id: crypto.randomUUID(),
            label: autoLabel,
            type: "cell",
            anchor_mode: "static",
            anchors: [],
            value_region: { page: 1, x: 0, y: 0, width: 0, height: 0 },
            rules: [],
            chain: [],
            cell_ref: { col: minCol, row: minRow },
          };
          addField(newField);
        }
      } else {
        // Range selection
        const startHeader = sheetData.headers[minCol] ?? `Col${minCol + 1}`;
        const endHeader = sheetData.headers[maxCol] ?? `Col${maxCol + 1}`;
        const autoLabel =
          minCol === maxCol
            ? `${startHeader}_R${minRow + 1}:R${maxRow + 1}`
            : `${startHeader}:${endHeader}_R${minRow + 1}:R${maxRow + 1}`;

        const newField: Field = {
          id: crypto.randomUUID(),
          label: autoLabel,
          type: "cell_range",
          anchor_mode: "static",
          anchors: [],
          value_region: { page: 1, x: 0, y: 0, width: 0, height: 0 },
          rules: [],
          chain: [],
          range_ref: {
            startCol: minCol,
            startRow: minRow,
            endCol: maxCol,
            endRow: maxRow,
          },
        };
        addField(newField);
      }
    },
    [drag, sheetData, isCellSelected, addField, removeField],
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      setDrag(null);
    }
  }, []);

  if (!file || !sheetData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Geen spreadsheetdata beschikbaar.
      </div>
    );
  }

  const cellFields = fields.filter((f) => f.type === "cell" || f.type === "cell_range");

  const getFieldTypeLabel = (field: Field): string => {
    if (field.type === "cell") {
      const col = field.cell_ref?.col ?? 0;
      const row = field.cell_ref?.row ?? 0;
      const header = sheetData.headers[col] ?? `Col${col + 1}`;
      return `Cel: ${header}, rij ${row + 1}`;
    }
    if (field.type === "cell_range" && field.range_ref) {
      const { startCol, startRow, endCol, endRow } = field.range_ref;
      const sh = sheetData.headers[startCol] ?? `Col${startCol + 1}`;
      const eh = sheetData.headers[endCol] ?? `Col${endCol + 1}`;
      return `Bereik: ${sh}–${eh}, rij ${startRow + 1}–${endRow + 1}`;
    }
    return field.type;
  };

  return (
    <div
      className="flex flex-row h-full overflow-hidden"
      onMouseUp={handleGlobalMouseUp}
    >
      {/* Grid */}
      <div className="flex-1 overflow-auto select-none">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {/* Row number header */}
              <th className="border border-border bg-muted px-2 py-1 text-xs text-muted-foreground font-medium min-w-[3rem] text-center sticky left-0 z-20">
                #
              </th>
              {sheetData.headers.map((header, colIdx) => (
                <th
                  key={colIdx}
                  className="border border-border bg-muted px-3 py-1.5 text-xs font-medium text-left whitespace-nowrap min-w-[8rem]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheetData.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="group">
                {/* Row number */}
                <td className="border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground text-center sticky left-0 z-10">
                  {rowIdx + 1}
                </td>
                {row.map((cell, colIdx) => {
                  const isSelected = !!isCellSelected(colIdx, rowIdx);
                  const isInRange = isCellInSelectedRange(colIdx, rowIdx);
                  const isInDrag = drag ? isCellInRange(colIdx, rowIdx, drag) : false;

                  let cellClass =
                    "border border-border px-3 py-1 cursor-pointer whitespace-nowrap transition-colors";

                  if (isSelected || isInRange) {
                    cellClass += " bg-primary/20 border-primary/50";
                  } else if (isInDrag) {
                    cellClass += " bg-blue-100 dark:bg-blue-900/30";
                  } else {
                    cellClass += " hover:bg-muted/50";
                  }

                  return (
                    <td
                      key={colIdx}
                      className={cellClass}
                      onMouseDown={() => handleMouseDown(colIdx, rowIdx)}
                      onMouseEnter={() => handleMouseEnter(colIdx, rowIdx)}
                      onMouseUp={() => handleMouseUp(colIdx, rowIdx)}
                    >
                      {cell === null || cell === undefined ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fields panel */}
      <div className="w-64 border-l border-border flex flex-col bg-background flex-shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Geselecteerde velden ({cellFields.length})
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cellFields.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground space-y-1">
              <p>Klik op een cel om deze te selecteren.</p>
              <p>Klik en sleep om een bereik te selecteren.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {cellFields.map((field) => (
                <li key={field.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={field.label}
                      onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                      className="h-7 text-xs px-2 flex-1 min-w-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeField(field.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {getFieldTypeLabel(field)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
