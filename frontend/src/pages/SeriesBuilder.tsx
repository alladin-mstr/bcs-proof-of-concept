import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, GripVertical, Trash2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeaderAction } from "@/context/HeaderActionContext";
import { useToast } from "@/hooks/use-toast";
import {
  listKlanten,
  listControles,
  getControleSeries,
  createControleSeries,
  updateControleSeries,
} from "@/api/client";
import type { Klant, Controle, ControleSeriesStep, SeriesStepCondition } from "@/types";

export default function SeriesBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [klantId, setKlantId] = useState("");
  const [klantName, setKlantName] = useState("");
  const [steps, setSteps] = useState<ControleSeriesStep[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [controles, setControles] = useState<Controle[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    listKlanten().then(setKlanten).catch(() => {});
    listControles().then(setControles).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then((series) => {
      setName(series.name);
      setKlantId(series.klantId);
      setKlantName(series.klantName);
      setSteps(series.steps);
    }).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
  }, [id, toast, navigate]);

  const publishedForKlant = controles.filter(
    (c) => c.status === "published" && (!klantId || c.klantId === klantId),
  );

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        order: prev.length,
        controleId: "",
        controleName: "",
        condition: "always" as SeriesStepCondition,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const updateStep = (idx: number, patch: Partial<ControleSeriesStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setDragIdx(idx);
  };

  const handleSave = useCallback(async () => {
    if (!name.trim() || !klantId) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), klantId, klantName, steps };
      if (isEditing) {
        await updateControleSeries(id!, payload);
        toast({ title: "Serie opgeslagen" });
      } else {
        const created = await createControleSeries(payload);
        toast({ title: "Serie aangemaakt" });
        navigate(`/controle-series/${created.id}`);
      }
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [name, klantId, klantName, steps, isEditing, id, navigate, toast]);

  const conditionLabels: Record<SeriesStepCondition, string> = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim() || !klantId}
          className="rounded-full shadow-lg"
          size="sm"
        >
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
      </HeaderAction>

      {/* Name + Klant */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="series-name">Naam</Label>
          <Input
            id="series-name"
            placeholder="Bijv. Jaarrekening reeks 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="series-klant">Klant</Label>
          <Select
            value={klantId}
            onValueChange={(val) => {
              setKlantId(val);
              const k = klanten.find((k) => k.id === val);
              setKlantName(k?.name ?? "");
            }}
          >
            <SelectTrigger id="series-klant">
              <SelectValue placeholder="Selecteer een klant" />
            </SelectTrigger>
            <SelectContent>
              {klanten.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Stappen</h2>

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nog geen stappen toegevoegd. Voeg een stap toe om te beginnen.
          </p>
        )}

        {steps.map((step, idx) => (
          <Card
            key={step.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={() => setDragIdx(null)}
            className={`transition-opacity ${dragIdx === idx ? "opacity-50" : ""}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="cursor-grab pt-2 text-muted-foreground hover:text-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <Select
                      value={step.controleId}
                      onValueChange={(val) => {
                        const c = publishedForKlant.find((c) => c.id === val);
                        updateStep(idx, { controleId: val, controleName: c?.name ?? "" });
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecteer controle" />
                      </SelectTrigger>
                      <SelectContent>
                        {publishedForKlant.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Voorwaarde:</Label>
                    <Select
                      value={step.condition}
                      onValueChange={(val) => updateStep(idx, { condition: val as SeriesStepCondition })}
                      disabled={idx === 0}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(conditionLabels) as [SeriesStepCondition, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeStep(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={addStep} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Stap toevoegen
        </Button>
      </div>
    </div>
  );
}
