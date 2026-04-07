import { useState, useEffect } from "react";
import { getSpreadsheet } from "@/api/client";
import type { FieldResult, SheetData } from "@/types";

interface Props {
  fileId: string;
  results: FieldResult[];
  onFieldClick?: (fieldIndex: number) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  static: { bg: "bg-blue-100/50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700" },
  dynamic: { bg: "bg-amber-100/50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700" },
  table: { bg: "bg-violet-100/50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700" },
  cell: { bg: "bg-blue-100/50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700" },
  cell_range: { bg: "bg-violet-100/50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700" },
};

export default function ReadOnlySpreadsheetViewer({ fileId, results, onFieldClick }: Props) {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSpreadsheet(fileId)
      .then((resp) =>
        setSheetData({
          headers: resp.headers,
          rows: resp.rows,
          rowCount: resp.row_count,
          colCount: resp.col_count,
        })
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Laden...
      </div>
    );
  }

  if (!sheetData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Geen spreadsheetdata beschikbaar.
      </div>
    );
  }

  // Build a lookup: cell coord -> result index for highlighting
  const cellHighlights = new Map<string, { resultIndex: number; result: FieldResult }>();
  results.forEach((r, idx) => {
    if (r.field_type === "cell" && r.value_found_x !== undefined && r.value_found_y !== undefined) {
      const key = `${Math.round(r.value_found_x)},${Math.round(r.value_found_y)}`;
      cellHighlights.set(key, { resultIndex: idx, result: r });
    }
    if (r.field_type === "cell_range" && r.resolved_region) {
      const reg = r.resolved_region;
      const startCol = Math.round(reg.x);
      const startRow = Math.round(reg.y);
      const endCol = Math.round(reg.x + reg.width);
      const endRow = Math.round(reg.y + reg.height);
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          cellHighlights.set(`${col},${row}`, { resultIndex: idx, result: r });
        }
      }
    }
  });

  return (
    <div className="flex-1 overflow-auto select-none">
      <table className="border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
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
            <tr key={rowIdx}>
              <td className="border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground text-center sticky left-0 z-10">
                {rowIdx + 1}
              </td>
              {row.map((cell, colIdx) => {
                const highlight = cellHighlights.get(`${colIdx},${rowIdx}`);
                const colors = highlight ? TYPE_COLORS[highlight.result.field_type] ?? TYPE_COLORS.cell : null;

                return (
                  <td
                    key={colIdx}
                    className={`border px-3 py-1 whitespace-nowrap relative ${
                      colors
                        ? `${colors.bg} ${colors.border} cursor-pointer`
                        : "border-border"
                    }`}
                    onClick={highlight && onFieldClick ? () => onFieldClick(highlight.resultIndex) : undefined}
                    title={highlight ? `${highlight.result.label}: ${highlight.result.value}` : undefined}
                  >
                    {cell === null || cell === undefined ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      String(cell)
                    )}
                    {highlight && (
                      <span className="absolute -top-2 left-1 text-[8px] font-semibold px-1 rounded bg-background border border-border text-foreground/70 whitespace-nowrap">
                        {highlight.result.label}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
