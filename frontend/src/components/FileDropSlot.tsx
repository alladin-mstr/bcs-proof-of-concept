import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import DraggableFileChip from "./DraggableFileChip";
import type { UploadedFile } from "@/types";

interface FileDropSlotProps {
  label: string;
  fileType: "pdf" | "spreadsheet";
  assignedFiles: UploadedFile[];
  onFileDrop: (file: UploadedFile) => void;
  onFileRemove: (fileId: string) => void;
}

export default function FileDropSlot({ label, fileType, assignedFiles, onFileDrop, onFileRemove }: FileDropSlotProps) {
  const [dragOver, setDragOver] = useState(false);
  const [rejectFlash, setRejectFlash] = useState(false);

  const Icon = fileType === "pdf" ? FileText : FileSpreadsheet;
  const typeLabel = fileType === "pdf" ? "PDF" : "XLSX";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const file: UploadedFile = JSON.parse(e.dataTransfer.getData("application/json"));
      if (file.type !== fileType) {
        setRejectFlash(true);
        setTimeout(() => setRejectFlash(false), 600);
        return;
      }
      if (assignedFiles.some((f) => f.id === file.id)) return;
      onFileDrop(file);
    } catch {
      // ignore invalid drop data
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border-2 p-4 transition-all ${
        rejectFlash
          ? "border-red-400 bg-red-50/50 dark:bg-red-950/10"
          : dragOver
            ? "border-primary/50 bg-primary/5"
            : assignedFiles.length > 0
              ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10"
              : "border-dashed border-border"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
          assignedFiles.length > 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
        }`}>
          <Icon className={`h-4 w-4 ${assignedFiles.length > 0 ? "text-green-600" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {typeLabel} · {assignedFiles.length} bestand{assignedFiles.length !== 1 ? "en" : ""}
          </p>
        </div>
      </div>

      {assignedFiles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {assignedFiles.map((f) => (
            <DraggableFileChip
              key={f.id}
              file={f}
              showGrip={false}
              onRemove={() => onFileRemove(f.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic mt-1">
          Sleep bestanden hierheen
        </div>
      )}
    </div>
  );
}
