import { TaskType } from "@/types/task";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitCompare, Eye, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepTaskTypeProps {
  selected: TaskType | null;
  onSelect: (type: TaskType) => void;
}

const taskTypes = [
  {
    type: 'comparison' as TaskType,
    icon: GitCompare,
    title: 'Of twee dingen met elkaar kloppen',
    description: 'Vergelijk twee documenten en vind verschillen tussen gekoppelde velden',
    examples: ['Salarislijst vs. Excel-export', 'Factuur vs. Bestelling', 'Implementatieplan vs. Systeeminrichting'],
  },
  {
    type: 'pattern' as TaskType,
    icon: Eye,
    title: 'Of er iets opvalt in een document',
    description: 'Herken patronen, duplicaten of onregelmatigheden in je data',
    examples: ['Dubbele facturen', 'Ongebruikelijke bedragen', 'Afwijkende patronen'],
  },
  {
    type: 'validation' as TaskType,
    icon: FileEdit,
    title: 'Een rapport vertalen naar terugkoppeling',
    description: 'Lees signalen uit een rapport, pas vertaalregels toe, en genereer automatisch terugkoppeltekst per medewerker',
    examples: ['Verwerkingssignalen → terugkoppelbestand', 'Uitdiensttredingen → openstaande acties', 'Loonaangifte-fouten → terugmeldingen'],
  },
];

export function StepTaskType({ selected, onSelect }: StepTaskTypeProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Wat wil je controleren?</h2>
        <p className="text-muted-foreground mt-2">Kies het type controle dat je wilt uitvoeren</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {taskTypes.map(({ type, icon: Icon, title, description, examples }) => (
          <Card
            key={type}
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1",
              selected === type && "border-primary ring-2 ring-primary/20 bg-accent shadow-lg"
            )}
            onClick={() => onSelect(type)}
          >
            <CardHeader className="pb-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-lg font-semibold">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Voorbeelden</p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                {examples.map((example, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {example}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
