import { TaskType, Field, FieldMapping, ComparisonRule } from "@/types/task";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Unlink, ArrowRight, Plus, FileEdit } from "lucide-react";
import { useState } from "react";

interface StepMappingsProps {
  taskType: TaskType;
  fields: Field[];
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
}

const ruleLabels: Record<ComparisonRule, string> = {
  exact: 'Moet exact gelijk zijn',
  percentage: 'Mag afwijken met %',
  fuzzy: 'Mag kleine schrijfverschillen hebben',
  exists: 'Alleen checken of gevuld',
};

// Demo vertaalregels voor wizard stap 4
const demoVertaalRegels = [
  { code: 'P0003', translation: 'Ingangsdatum functie ligt voor aanvang dienstverband. Graag corrigeren...' },
  { code: 'P0012', translation: 'Adresgegevens ontbreken. Graag het woonadres invoeren...' },
];

export function StepMappings({ taskType, fields, mappings, onMappingsChange }: StepMappingsProps) {
  const leftFields = fields.filter(f => f.source === 'left');
  const rightFields = fields.filter(f => f.source === 'right');

  const mappedLeftIds = new Set(mappings.map(m => m.leftFieldId));
  const mappedRightIds = new Set(mappings.map(m => m.rightFieldId));

  const unmappedLeft = leftFields.filter(f => !mappedLeftIds.has(f.id));
  const unmappedRight = rightFields.filter(f => !mappedRightIds.has(f.id));

  const handleCreateMapping = (leftFieldId: string, rightFieldId: string) => {
    const newMapping: FieldMapping = {
      id: `map-${Date.now()}`,
      leftFieldId,
      rightFieldId,
      rule: 'exact',
    };
    onMappingsChange([...mappings, newMapping]);
  };

  const handleRemoveMapping = (mappingId: string) => {
    onMappingsChange(mappings.filter(m => m.id !== mappingId));
  };

  const handleRuleChange = (mappingId: string, rule: ComparisonRule) => {
    onMappingsChange(
      mappings.map(m => (m.id === mappingId ? { ...m, rule } : m))
    );
  };

  const handleToleranceChange = (mappingId: string, tolerance: number) => {
    onMappingsChange(
      mappings.map(m => (m.id === mappingId ? { ...m, tolerance } : m))
    );
  };

  const getFieldName = (fieldId: string) => {
    return fields.find(f => f.id === fieldId)?.name || fieldId;
  };

  // Vertaling type: show signal-to-translation mapping
  if (taskType === 'validation') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Vertaalregels koppelen</h2>
          <p className="text-muted-foreground mt-1">
            Koppel signaalcodes aan de output-tekst die gegenereerd wordt
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileEdit className="h-5 w-5" />
              Signaal → Vertaling
            </CardTitle>
            <CardDescription>
              Voeg regels toe die bepalen welke terugkoppeltekst er gegenereerd wordt per signaalcode
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {demoVertaalRegels.map((regel, idx) => (
              <div key={idx} className="p-4 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded font-semibold">{regel.code}</code>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1">{regel.translation}</span>
                </div>
              </div>
            ))}

            <Button variant="outline" className="w-full border-dashed gap-2">
              <Plus className="h-4 w-4" />
              Regel toevoegen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pattern type (Validatie): show auto-detection info
  if (taskType === 'pattern') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Validatieregels</h2>
          <p className="text-muted-foreground mt-1">
            Het systeem valideert de velden automatisch op basis van formules en drempelwaarden
          </p>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Automatische detectie</CardTitle>
            <CardDescription>
              Velden worden gevalideerd op basis van standaard formaten en berekeningen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                <Badge key={field.id} variant="secondary">
                  {field.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Comparison type: field mapping
  if (taskType !== 'comparison') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Controleregels</h2>
          <p className="text-muted-foreground mt-1">
            Het systeem zoekt automatisch naar patronen en duplicaten
          </p>
        </div>
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Automatische detectie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                <Badge key={field.id} variant="secondary">{field.name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Velden koppelen</h2>
        <p className="text-muted-foreground mt-1">
          Koppel velden uit beide documenten en stel vergelijkingsregels in
        </p>
      </div>

      {mappings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gekoppelde velden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mappings.map((mapping) => (
              <div key={mapping.id} className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{getFieldName(mapping.leftFieldId)}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline">{getFieldName(mapping.rightFieldId)}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveMapping(mapping.id)}>
                    <Unlink className="h-4 w-4 mr-1" /> Ontkoppelen
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Select value={mapping.rule} onValueChange={(v) => handleRuleChange(mapping.id, v as ComparisonRule)}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ruleLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping.rule === 'percentage' && (
                    <div className="flex items-center gap-2">
                      <Input type="number" className="w-20" value={mapping.tolerance || 1} onChange={(e) => handleToleranceChange(mapping.id, parseFloat(e.target.value) || 0)} min={0} max={100} />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(unmappedLeft.length > 0 || unmappedRight.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nog te koppelen</CardTitle>
            <CardDescription>Selecteer velden uit beide kolommen om te koppelen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Bronbestand</h4>
                {unmappedLeft.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Alle velden gekoppeld</p>
                ) : (
                  unmappedLeft.map((field) => (
                    <div key={field.id} className="flex gap-2">
                      <Badge variant="outline" className="cursor-pointer hover:bg-accent flex-1 justify-start">{field.name}</Badge>
                      <Select onValueChange={(rightId) => handleCreateMapping(field.id, rightId)}>
                        <SelectTrigger className="w-44">
                          <Link2 className="h-4 w-4 mr-2" />
                          <span className="text-muted-foreground">Koppelen aan...</span>
                        </SelectTrigger>
                        <SelectContent>
                          {unmappedRight.map((rightField) => (
                            <SelectItem key={rightField.id} value={rightField.id}>{rightField.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Controlebestand</h4>
                {unmappedRight.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Alle velden gekoppeld</p>
                ) : (
                  unmappedRight.map((field) => (
                    <Badge key={field.id} variant="outline" className="block w-full text-left py-2">{field.name}</Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
