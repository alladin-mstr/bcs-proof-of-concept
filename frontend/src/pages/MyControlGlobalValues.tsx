import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Pencil, Trash2, FileText, Globe, MoreHorizontal, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HeaderAction } from "@/context/HeaderActionContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listGlobalValueGroups, createGlobalValueGroup, updateGlobalValueGroup, deleteGlobalValueGroup } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import type { GlobalValueGroup, GlobalValue } from "@/types";

export default function MyControlGlobalValues() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [globalGroups, setGlobalGroups] = useState<GlobalValueGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<{ id: string | null; name: string; values: GlobalValue[] } | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<GlobalValueGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [newGroupMode, setNewGroupMode] = useState<"manual" | "pdf">("manual");

  useEffect(() => {
    listGlobalValueGroups().then(setGlobalGroups).catch(() => {});
  }, []);

  const handleSaveGroup = async (groupId: string | null, name: string, values: GlobalValue[]) => {
    try {
      if (groupId) {
        const updated = await updateGlobalValueGroup(groupId, { name, values });
        setGlobalGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
        setEditingGroup(null);
        toast({ title: "Groep bijgewerkt" });
      } else {
        const created = await createGlobalValueGroup({ name, values, mode: newGroupMode });
        setGlobalGroups((prev) => [created, ...prev]);
        setEditingGroup(null);
        toast({ title: "Groep aangemaakt" });
        if (newGroupMode === "pdf") {
          navigate(`/global-values/${created.id}/edit`);
          return;
        }
      }
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    setDeletingGroup(true);
    try {
      await deleteGlobalValueGroup(deleteGroupTarget.id);
      setGlobalGroups((prev) => prev.filter((g) => g.id !== deleteGroupTarget.id));
      toast({ title: "Groep verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setDeletingGroup(false);
      setDeleteGroupTarget(null);
    }
  };

  const filteredGroups = globalGroups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <HeaderAction>
        <Button
          size="sm"
          className="rounded-full shadow-lg"
          onClick={() => {
            setEditingGroup({ id: null, name: "", values: [] });
            setNewGroupMode("manual");
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nieuwe groep
        </Button>
      </HeaderAction>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-full"
        />
      </div>

      {/* Inline edit form */}
      {editingGroup && (
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Groepsnaam</Label>
              <Input
                value={editingGroup.name}
                onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                placeholder="Bijv. Loonheffing 2026"
                autoFocus
              />
            </div>
            {editingGroup.id === null && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Type</label>
                <div className="flex gap-2">
                  <button type="button" className={`px-4 py-2 rounded border text-sm ${newGroupMode === "manual" ? "bg-primary text-white border-primary" : "border-gray-300"}`} onClick={() => setNewGroupMode("manual")}>Handmatig</button>
                  <button type="button" className={`px-4 py-2 rounded border text-sm ${newGroupMode === "pdf" ? "bg-primary text-white border-primary" : "border-gray-300"}`} onClick={() => setNewGroupMode("pdf")}>PDF</button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Waarden</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Naam</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead>Waarde</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editingGroup.values.map((v, i) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Input
                            value={v.name}
                            onChange={(e) => {
                              const vals = [...editingGroup.values];
                              vals[i] = { ...v, name: e.target.value };
                              setEditingGroup({ ...editingGroup, values: vals });
                            }}
                            placeholder="Naam"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={v.dataType}
                            onValueChange={(val) => {
                              const vals = [...editingGroup.values];
                              vals[i] = { ...v, dataType: val as GlobalValue["dataType"] };
                              setEditingGroup({ ...editingGroup, values: vals });
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Tekst</SelectItem>
                              <SelectItem value="number">Nummer</SelectItem>
                              <SelectItem value="date">Datum</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {v.dataType === "boolean" ? (
                            <Select
                              value={v.value || "false"}
                              onValueChange={(val) => {
                                const vals = [...editingGroup.values];
                                vals[i] = { ...v, value: val };
                                setEditingGroup({ ...editingGroup, values: vals });
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Waar</SelectItem>
                                <SelectItem value="false">Onwaar</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={v.dataType === "number" ? "number" : v.dataType === "date" ? "date" : "text"}
                              value={v.value}
                              onChange={(e) => {
                                const vals = [...editingGroup.values];
                                vals[i] = { ...v, value: e.target.value };
                                setEditingGroup({ ...editingGroup, values: vals });
                              }}
                              placeholder={v.dataType === "number" ? "0" : v.dataType === "date" ? "" : "Waarde"}
                              className="h-8"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => {
                              const vals = editingGroup.values.filter((_, j) => j !== i);
                              setEditingGroup({ ...editingGroup, values: vals });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newVal: GlobalValue = {
                    id: crypto.randomUUID(),
                    name: "",
                    dataType: "text",
                    value: "",
                  };
                  setEditingGroup({ ...editingGroup, values: [...editingGroup.values, newVal] });
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Waarde toevoegen
              </Button>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingGroup(null)}>
                Annuleren
              </Button>
              <Button
                disabled={!editingGroup.name.trim()}
                onClick={() => handleSaveGroup(editingGroup.id, editingGroup.name, editingGroup.values)}
              >
                Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Waarden</TableHead>
                <TableHead>Versie</TableHead>
                <TableHead>Laatst bijgewerkt</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((g) => (
                <TableRow key={g.id} className="cursor-pointer" onClick={() => {
                  if (g.mode === "pdf") {
                    navigate(`/global-values/${g.id}/edit`);
                    return;
                  }
                  setEditingGroup({ id: g.id, name: g.name, values: g.values });
                }}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {g.mode === "pdf" && <FileText className="h-4 w-4 text-primary" />}
                      {g.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{g.values.length}</TableCell>
                  <TableCell>
                    <Badge variant="outline">v{g.version}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(g.updatedAt)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {g.mode === "pdf" ? (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/global-values/${g.id}/edit`); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Velden bewerken
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingGroup({ id: g.id, name: g.name, values: g.values }); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Bewerken
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/controles/globale-waarden/${g.id}/audit`); }}>
                          <History className="h-4 w-4 mr-2" />
                          Audit trail
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteGroupTarget(g); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Nog geen globale waarden</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete group confirmation */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={(open) => !open && setDeleteGroupTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Groep verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je &quot;{deleteGroupTarget?.name}&quot; wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              disabled={deletingGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingGroup ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
