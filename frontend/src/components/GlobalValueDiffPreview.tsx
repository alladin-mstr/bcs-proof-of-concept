import { Button } from "@/components/ui/button";
import type { ExtractionPreview } from "@/types";

interface Props {
  preview: ExtractionPreview;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

export default function GlobalValueDiffPreview({ preview, onConfirm, onCancel, saving }: Props) {
  const currentMap = new Map(
    preview.currentValues.map((v) => [v.id, v])
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6">
        <h2 className="text-lg font-semibold mb-1">Extractie resultaat</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Controleer de geextraheerde waarden voordat u ze opslaat.
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-4 font-medium">Veld</th>
                <th className="text-left py-2 px-4 font-medium">Type</th>
                <th className="text-left py-2 px-4 font-medium">Huidig</th>
                <th className="text-left py-2 px-4 font-medium">Nieuw</th>
                <th className="text-left py-2 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.extractedValues.map((ev, i) => {
                const current = currentMap.get(ev.id);
                const currentVal = current?.value ?? "\u2014";
                const changed = currentVal !== ev.value;
                const result = preview.fieldResults[i];
                return (
                  <tr key={ev.id} className="border-t">
                    <td className="py-2 px-4 font-medium">{ev.name}</td>
                    <td className="py-2 px-4 text-muted-foreground">{ev.dataType}</td>
                    <td className={`py-2 px-4 ${changed ? "text-red-500 line-through" : "text-muted-foreground"}`}>
                      {currentVal}
                    </td>
                    <td className={`py-2 px-4 ${changed ? "text-green-600 font-medium" : ""}`}>
                      {ev.value || "\u2014"}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        result?.status === "ok" ? "bg-green-100 text-green-800"
                          : result?.status === "empty" ? "bg-gray-100 text-gray-600"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {result?.status ?? "unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Annuleren</Button>
        <Button onClick={onConfirm} disabled={saving}>{saving ? "Opslaan..." : "Bevestigen"}</Button>
      </div>
    </div>
  );
}
