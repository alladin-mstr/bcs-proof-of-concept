import { cn } from "@/lib/utils";
import { Check, Settings2, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ControleFile, WizardTab } from "@/types";

interface WizardTabsProps {
  activeTab: WizardTab;
  controleName: string;
  files: ControleFile[];
  onTabChange: (tab: WizardTab) => void;
  /** When viewing a file inside the Bestanden tab */
  isViewingFile?: boolean;
}

interface TabDef {
  id: WizardTab;
  label: string;
  icon?: React.ReactNode;
  isComplete?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function WizardTabs({ activeTab, controleName, files, onTabChange, isViewingFile }: WizardTabsProps) {
  const allFilesHaveFields = files.length > 0 && files.every((f) => f.fields.length > 0);
  const allFilesHaveResults = files.length > 0 && files.every((f) => {
    if (f.fileType === "spreadsheet") return true;
    return f.extractionResults !== null && f.extractionResults.length > 0;
  });
  const regelsDisabled = files.length === 0 || !allFilesHaveResults;

  let regelsDisabledReason = "";
  if (files.length === 0) {
    regelsDisabledReason = "Upload minstens één bestand om regels te kunnen instellen";
  } else if (!allFilesHaveResults) {
    const pending = files.filter((f) => f.fileType !== "spreadsheet" && (!f.extractionResults || f.extractionResults.length === 0));
    regelsDisabledReason = `Voer eerst een preview-extractie uit voor: ${pending.map((f) => f.label || "Naamloos").join(", ")}`;
  }

  const tabs: TabDef[] = [
    {
      id: "bestanden",
      label: `Bestanden (${files.length})`,
      isComplete: allFilesHaveFields,
    },
    {
      id: "regels",
      label: "Regels",
      icon: regelsDisabled ? <Lock className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />,
      disabled: regelsDisabled,
      disabledReason: regelsDisabledReason,
    },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        // Bestanden tab is also active when viewing a file
        const isActive = activeTab === tab.id || (tab.id === "bestanden" && isViewingFile);

        const button = (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            disabled={tab.disabled}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              tab.disabled
                ? "border-transparent text-muted-foreground/50 cursor-not-allowed"
                : isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.isComplete && !isActive && (
              <Check className="h-3.5 w-3.5 text-green-500 ml-1" />
            )}
          </button>
        );

        if (tab.disabled && tab.disabledReason) {
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {tab.disabledReason}
              </TooltipContent>
            </Tooltip>
          );
        }

        return button;
      })}
    </div>
  );
}
