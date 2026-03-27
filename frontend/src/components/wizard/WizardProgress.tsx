import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
}

const stepLabels = [
  "Type kiezen",
  "Uploaden",
  "Velden bekijken",
  "Koppelen",
  "Opslaan",
];

export function WizardProgress({ currentStep, totalSteps }: WizardProgressProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-lg",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground border-2 border-border"
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : step}
                </div>
                <span
                  className={cn(
                    "mt-3 text-xs font-semibold text-center whitespace-nowrap uppercase tracking-wide",
                    isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {stepLabels[i]}
                </span>
              </div>

              {/* Connector Line */}
              {step < totalSteps && (
                <div
                  className={cn(
                    "flex-1 h-1 mx-3 rounded-full transition-colors",
                    step < currentStep ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
