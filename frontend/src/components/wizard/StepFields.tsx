import { useState } from "react";
import { TaskType, Field } from "@/types/task";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

interface StepFieldsProps {
  taskType: TaskType;
  fields: Field[];
  onFieldsChange: (fields: Field[]) => void;
}

export function StepFields({ taskType, fields, onFieldsChange }: StepFieldsProps) {
  const [newFieldName, setNewFieldName] = useState("");
  const [addingTo, setAddingTo] = useState<'left' | 'right' | 'single' | null>(null);

  const leftFields = fields.filter(f => f.source === 'left');
  const rightFields = fields.filter(f => f.source === 'right');
  const singleFields = fields.filter(f => f.source === 'single');

  const handleAddField = (source: 'left' | 'right' | 'single') => {
    if (!newFieldName.trim()) return;

    const newField: Field = {
      id: `custom-${Date.now()}`,
      name: newFieldName.trim(),
      source,
      type: 'text',
    };

    onFieldsChange([...fields, newField]);
    setNewFieldName("");
    setAddingTo(null);
  };

  const handleRemoveField = (fieldId: string) => {
    onFieldsChange(fields.filter(f => f.id !== fieldId));
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'number':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'currency':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'date':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const FieldList = ({ title, fieldList, source }: { title: string; fieldList: Field[]; source: 'left' | 'right' | 'single' }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          {title}
          <Badge variant="outline">{fieldList.length} velden</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {fieldList.map((field) => (
          <div
            key={field.id}
            className="flex items-center justify-between p-2 rounded-md bg-muted/50 group"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{field.name}</span>
              {field.type && (
                <Badge variant="secondary" className={getTypeColor(field.type)}>
                  {field.type}
                </Badge>
              )}
            </div>
            {field.id.startsWith('custom-') && (
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => handleRemoveField(field.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {addingTo === source ? (
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Veldnaam..."
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddField(source)}
              autoFocus
            />
            <Button size="sm" onClick={() => handleAddField(source)}>
              Toevoegen
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddingTo(null)}>
              Annuleren
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => setAddingTo(source)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Veld toevoegen
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Herkende velden</h2>
        <p className="text-muted-foreground mt-1">
          Controleer de gevonden velden en voeg eventueel extra velden toe
        </p>
      </div>

      {taskType === 'comparison' ? (
        <div className="grid md:grid-cols-2 gap-6">
          <FieldList title="Bronbestand" fieldList={leftFields} source="left" />
          <FieldList title="Controlebestand" fieldList={rightFields} source="right" />
        </div>
      ) : (
        <div className="max-w-md mx-auto">
          <FieldList title="Gevonden velden" fieldList={singleFields} source="single" />
        </div>
      )}
    </div>
  );
}
