import { useState } from "react";
import { FileText, FileSpreadsheet, ChevronDown } from "lucide-react";
import type { FileGroup } from "@/types";

interface Props {
  fileGroups: FileGroup[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
}

export default function FileSidebar({ fileGroups, selectedFileId, onSelectFile }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      <div className="px-3 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bestanden</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileGroups.map((group) => {
          const isCollapsed = collapsed[group.label] ?? false;
          const groupPassed = group.files.reduce((s, f) => s + f.passed, 0);
          const groupTotal = group.files.reduce((s, f) => s + f.total, 0);
          const allOk = groupPassed === groupTotal;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1 truncate">
                  {group.label}
                </span>
                <span className={`text-[10px] font-medium ${allOk ? "text-green-600" : "text-amber-600"}`}>
                  {groupPassed}/{groupTotal}
                </span>
              </button>
              {!isCollapsed && (
                <div className="pb-1">
                  {group.files.map((file) => {
                    const isSelected = file.fileId === selectedFileId;
                    const fileAllOk = file.passed === file.total;
                    const FileIcon = file.fileType === "spreadsheet" ? FileSpreadsheet : FileText;

                    return (
                      <button
                        key={file.fileId}
                        onClick={() => onSelectFile(file.fileId)}
                        className={`flex items-center gap-2 w-full px-3 pl-8 py-1.5 text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-l-2 border-primary"
                            : "hover:bg-muted/50 border-l-2 border-transparent"
                        }`}
                      >
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-foreground flex-1 truncate">
                          {file.filename}
                        </span>
                        <span className={`text-[10px] font-medium shrink-0 ${fileAllOk ? "text-green-600" : "text-amber-600"}`}>
                          {file.passed}/{file.total}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
