import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Plus, Search, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Klant } from "@/types";
import { buildTree, filterTree, type KlantTreeNode } from "@/lib/tree-utils";

interface KlantTreeProps {
  klanten: Klant[];
  selectedId?: string;
  onSelect: (klant: Klant) => void;
  onAddChild: (parentId: string | null) => void;
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  onAddChild,
  defaultExpanded,
}: {
  node: KlantTreeNode;
  selectedId?: string;
  onSelect: (klant: Klant) => void;
  onAddChild: (parentId: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? node.depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm transition-colors",
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted/50 text-foreground"
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <span className="truncate flex-1">{node.name}</span>

        <button
          className="p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          title="Sub-klant toevoegen"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KlantTree({ klanten, selectedId, onSelect, onAddChild }: KlantTreeProps) {
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(klanten), [klanten]);
  const filteredRoots = useMemo(() => filterTree(tree, search), [tree, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Klanten</span>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => onAddChild(null)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Nieuw
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm rounded-lg"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1 pb-3">
        {filteredRoots.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {search ? "Geen resultaten" : "Nog geen klanten"}
          </div>
        ) : (
          filteredRoots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              defaultExpanded
            />
          ))
        )}
      </div>
    </div>
  );
}
