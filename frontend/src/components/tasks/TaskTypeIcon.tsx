import { ArrowLeftRight, SearchCheck, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuildingBlock, TaskType } from "@/types/task";

interface TaskTypeIconProps {
  type: TaskType;
  buildingBlock?: BuildingBlock;
  className?: string;
}

export function TaskTypeIcon({ type, buildingBlock, className }: TaskTypeIconProps) {
  const block = buildingBlock || (type === 'comparison' ? 'vergelijking' : type === 'validation' ? 'validatie' : 'vertaling');
  
  switch (block) {
    case 'vergelijking':
      return <ArrowLeftRight className={cn("h-4 w-4", className)} />;
    case 'validatie':
      return <SearchCheck className={cn("h-4 w-4", className)} />;
    case 'vertaling':
      return <FileEdit className={cn("h-4 w-4", className)} />;
    default:
      return <FileEdit className={cn("h-4 w-4", className)} />;
  }
}

export function getTaskTypeLabel(type: TaskType, buildingBlock?: BuildingBlock): string {
  const block = buildingBlock || (type === 'comparison' ? 'vergelijking' : type === 'validation' ? 'validatie' : 'vertaling');
  
  switch (block) {
    case 'vergelijking':
      return 'Vergelijking';
    case 'validatie':
      return 'Validatie';
    case 'vertaling':
      return 'Vertaling';
    default:
      return 'Controle';
  }
}
