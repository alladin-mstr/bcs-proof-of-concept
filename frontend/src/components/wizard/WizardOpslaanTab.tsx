import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Settings2, CheckCircle, Save, Rocket, Loader2 } from "lucide-react";
import type { Controle } from "@/types";

interface WizardOpslaanTabProps {
  controle: Controle;
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
}

export function WizardOpslaanTab({ controle, onSaveDraft, onPublish }: WizardOpslaanTabProps) {
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const totalFields = controle.files.reduce((sum, f) => sum + f.fields.length, 0);
  const filesWithFields = controle.files.filter((f) => f.fields.length > 0).length;
  const allFilesHaveFields = controle.files.length > 0 && filesWithFields === controle.files.length;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await onSaveDraft();
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Overzicht</h2>
          <p className="text-muted-foreground">
            Controleer je instellingen en sla op of publiceer.
          </p>
        </div>

        {/* Summary cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">{controle.name || "Naamloos"}</p>
              <p className="text-sm text-muted-foreground">
                {controle.files.length} bestand{controle.files.length !== 1 ? "en" : ""}
              </p>
            </div>
          </div>

          {controle.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card ml-4"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.label}</p>
                <p className="text-xs text-muted-foreground">
                  {file.fields.length} veld{file.fields.length !== 1 ? "en" : ""}
                </p>
              </div>
              {file.fields.length > 0 && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">
                {controle.rules.length} regel{controle.rules.length !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalFields} veld{totalFields !== 1 ? "en" : ""} totaal
              </p>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {!allFilesHaveFields && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Niet alle bestanden hebben velden. Voeg velden toe aan elk bestand voordat je publiceert.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Opslaan als concept
          </Button>
          <Button
            className="flex-1"
            onClick={handlePublish}
            disabled={!allFilesHaveFields || saving || publishing}
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Rocket className="h-4 w-4 mr-2" />
            )}
            Publiceren
          </Button>
        </div>
      </div>
    </div>
  );
}
