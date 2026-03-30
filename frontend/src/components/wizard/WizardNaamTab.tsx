import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WizardNaamTabProps {
  name: string;
  onNameChange: (name: string) => void;
  onNext: () => void;
}

export function WizardNaamTab({ name, onNameChange, onNext }: WizardNaamTabProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Nieuwe controle</h2>
          <p className="text-muted-foreground">
            Geef je controle een naam om te beginnen.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="controle-name">Naam</Label>
          <Input
            id="controle-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Bijv. Salariscontrole, Factuurcontrole..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onNext();
            }}
          />
        </div>
        <button
          onClick={onNext}
          disabled={!name.trim()}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          Volgende
        </button>
      </div>
    </div>
  );
}
