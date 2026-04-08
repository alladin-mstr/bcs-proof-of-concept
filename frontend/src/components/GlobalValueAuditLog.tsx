import { useEffect, useState } from "react";
import { Check, FileText, Plus, Settings } from "lucide-react";
import { getGlobalValueAudit } from "@/api/client";
import type { AuditEntry } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  groupId: string | null;
  onClose: () => void;
}

const iconMap: Record<string, { icon: typeof Check; bg: string; color: string }> = {
  created: { icon: Plus, bg: "bg-purple-100", color: "text-purple-600" },
  pdf_uploaded: { icon: FileText, bg: "bg-blue-100", color: "text-blue-600" },
  values_confirmed: { icon: Check, bg: "bg-green-100", color: "text-green-600" },
  pdf_template_updated: { icon: Settings, bg: "bg-blue-100", color: "text-blue-600" },
};

const actionLabels: Record<string, string> = {
  created: "Groep aangemaakt",
  pdf_uploaded: "PDF geupload",
  values_confirmed: "Waarden bevestigd",
  pdf_template_updated: "Velden bijgewerkt",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function GlobalValueAuditLog({ groupId, onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    getGlobalValueAudit(groupId).then(setEntries).finally(() => setLoading(false));
  }, [groupId]);

  return (
    <Dialog open={!!groupId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Geschiedenis</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Laden...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Geen gebeurtenissen.</p>
        ) : (
          <div className="space-y-0">
            {[...entries].reverse().map((entry, i) => {
              const mapping = iconMap[entry.action] ?? iconMap.created;
              const Icon = mapping.icon;
              return (
                <div key={i} className="flex gap-3 py-3 border-b last:border-b-0">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${mapping.bg}`}>
                    <Icon className={`h-4 w-4 ${mapping.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm">{actionLabels[entry.action] ?? entry.action}</span>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{formatDate(entry.timestamp)}</span>
                    </div>
                    {entry.details.filename && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.details.filename}
                        {entry.details.replacedFilename && <> — vervangt {entry.details.replacedFilename}</>}
                      </p>
                    )}
                    {entry.details.mode && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.details.mode === "pdf" ? "PDF-modus" : "Handmatige modus"}
                      </p>
                    )}
                    {entry.details.fieldCount !== undefined && (
                      <p className="text-sm text-muted-foreground mt-0.5">{entry.details.fieldCount} velden</p>
                    )}
                    {entry.action === "values_confirmed" && entry.details.newValues && (
                      <div className="mt-2 text-xs bg-muted/50 rounded overflow-hidden">
                        <div className="flex font-medium px-3 py-1.5 border-b">
                          <span className="flex-1">Veld</span>
                          <span className="flex-1">Oud</span>
                          <span className="flex-1">Nieuw</span>
                        </div>
                        {entry.details.newValues.map((nv) => {
                          const ov = entry.details.previousValues?.find((p) => p.id === nv.id);
                          const changed = ov?.value !== nv.value;
                          if (!changed) return null;
                          return (
                            <div key={nv.id} className="flex px-3 py-1 border-b last:border-b-0">
                              <span className="flex-1">{nv.name}</span>
                              <span className="flex-1 text-red-500">{ov?.value ?? "\u2014"}</span>
                              <span className="flex-1 text-green-600">{nv.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
