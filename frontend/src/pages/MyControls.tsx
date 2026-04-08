import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, CheckCircle, AlertTriangle, Clock, ListChecks, Plus, Play, Pencil, FileText, MoreHorizontal, Eye, Trash2, Globe } from "lucide-react";
import GlobalValueAuditLog from "@/components/GlobalValueAuditLog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listControles, listControleRuns, deleteControle, listKlanten, listGlobalValueGroups, createGlobalValueGroup, updateGlobalValueGroup, deleteGlobalValueGroup } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import type { Controle, ControleRunResult, Klant, GlobalValueGroup, GlobalValue } from "@/types";

export default function MyControls() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"definities" | "resultaten" | "globale_waarden">("definities");
  const [controles, setControles] = useState<Controle[]>([]);
  const [runs, setRuns] = useState<ControleRunResult[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Controle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [selectedKlantId, setSelectedKlantId] = useState<string>("");
  const [globalGroups, setGlobalGroups] = useState<GlobalValueGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<{ id: string | null; name: string; values: GlobalValue[] } | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<GlobalValueGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [newGroupMode, setNewGroupMode] = useState<"manual" | "pdf">("manual");
  const [auditGroupId, setAuditGroupId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    listControles().then(setControles).catch(() => {});
    listControleRuns().then(setRuns).catch(() => {});
  }, []);

  useEffect(() => {
    listGlobalValueGroups().then(setGlobalGroups).catch(() => {});
  }, []);

  useEffect(() => {
    listKlanten().then(setKlanten).catch(() => {});
  }, []);

  // Auto-open dialog when navigating from klant detail page
  useEffect(() => {
    const klantId = searchParams.get("newForKlant");
    if (klantId) {
      setSelectedKlantId(klantId);
      setNewName("");
      setShowNewDialog(true);
    }
  }, [searchParams]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteControle(deleteTarget.id);
      setControles((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast({ title: "Controle verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredRuns = runs.filter(run =>
    run.controleName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredControles = controles.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

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

  const getRunStatusBadge = (status: ControleRunResult["status"]) => {
    if (status === "success") {
      return (
        <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
          <CheckCircle className="h-3 w-3" />
          Geslaagd
        </Badge>
      );
    }
    if (status === "review") {
      return (
        <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Review nodig
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 gap-1">
        <Clock className="h-3 w-3" />
        Mislukt
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <HeaderAction>
        <Button onClick={() => { setNewName(""); setShowNewDialog(true); }} className="rounded-full shadow-lg" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nieuwe controle
        </Button>
      </HeaderAction>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam, klant of controleur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-full"
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("definities")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "definities"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Controles
        </button>
        <button
          onClick={() => setTab("resultaten")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "resultaten"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Resultaten
        </button>
        <button
          onClick={() => setTab("globale_waarden")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "globale_waarden"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Globale waarden
        </button>
      </div>

      {tab === "definities" ? (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Bestanden</TableHead>
                  <TableHead>Velden</TableHead>
                  <TableHead>Regels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aangemaakt</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredControles.map((c) => {
                  const totalFields = c.files.reduce((sum, f) => sum + f.fields.length, 0);
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/controle/${c.id}`)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{c.files.length}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{totalFields}</TableCell>
                      <TableCell className="text-muted-foreground">{c.rules.length}</TableCell>
                      <TableCell>
                        {c.status === "published" ? (
                          <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                            Gepubliceerd
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                            Concept
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/controle/${c.id}`)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Bekijken
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/controle/${c.id}/edit`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Bewerken
                            </DropdownMenuItem>
                            {c.status === "published" && (
                              <DropdownMenuItem onClick={() => navigate(`/controle/${c.id}/run`)}>
                                <Play className="h-4 w-4 mr-2" />
                                Uitvoeren
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Verwijderen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredControles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Nog geen controles aangemaakt</p>
                      <Button
                        variant="link"
                        className="mt-2"
                        onClick={() => { setNewName(""); setShowNewDialog(true); }}
                      >
                        Maak je eerste controle
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : tab === "resultaten" ? (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Controle</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Velden</TableHead>
                  <TableHead>Regels</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.controleName}</TableCell>
                    <TableCell className="text-muted-foreground">{run.klantName || "—"}</TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell>
                      <span className={run.failedFields > 0 ? "text-destructive" : "text-success"}>
                        {run.passedFields}/{run.totalFields} OK
                      </span>
                    </TableCell>
                    <TableCell>
                      {run.rulesTotal > 0 ? (
                        <span className={run.rulesPassed < run.rulesTotal ? "text-warning" : "text-success"}>
                          {run.rulesPassed}/{run.rulesTotal}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(run.runAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/controle/${run.controleId}/run`)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Opnieuw
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRuns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">Nog geen resultaten</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* New group button */}
          <div className="flex justify-end">
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
                              <>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/global-values/${g.id}/edit`); }}>
                                  Velden bewerken
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setAuditGroupId(g.id); }}>
                                  Geschiedenis
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingGroup({ id: g.id, name: g.name, values: g.values }); }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Bewerken
                              </DropdownMenuItem>
                            )}
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

          <GlobalValueAuditLog groupId={auditGroupId} onClose={() => setAuditGroupId(null)} />

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
        </>
      )}

      {/* New controle name dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe controle</DialogTitle>
            <DialogDescription>
              Geef een naam op en selecteer een klant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="controle-name">Naam</Label>
              <Input
                id="controle-name"
                placeholder="Bijv. Jaarrekening controle 2025"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="controle-klant">Klant</Label>
              <Select value={selectedKlantId} onValueChange={setSelectedKlantId}>
                <SelectTrigger id="controle-klant">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Annuleren
            </Button>
            <Button
              disabled={!newName.trim()}
              onClick={() => {
                const klant = klanten.find((k) => k.id === selectedKlantId);
                const params = new URLSearchParams({ naam: newName.trim() });
                if (klant) {
                  params.set("klantId", klant.id);
                  params.set("klantName", klant.name);
                }
                setShowNewDialog(false);
                navigate(`/controle/nieuw?${params.toString()}`);
              }}
            >
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Controle verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{deleteTarget?.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
