import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Check,
  FileText,
  Plus,
  Settings,
  Globe,
  Clock,
  Hash,
  ListChecks,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getGlobalValueGroup, getGlobalValueAudit } from "@/api/client";
import type { GlobalValueGroup, AuditEntry, GlobalValue } from "@/types";

// --- Mock data: controls that used specific versions ---

interface ControlUsage {
  controlId: string;
  controlName: string;
  runDate: string;
  version: number;
  status: "passed" | "failed" | "running";
}

const mockControlUsages: ControlUsage[] = [
  {
    controlId: "ctrl-001",
    controlName: "Loonheffing validatie",
    runDate: "2026-04-10T14:30:00Z",
    version: 3,
    status: "passed",
  },
  {
    controlId: "ctrl-002",
    controlName: "BTW-aangifte controle",
    runDate: "2026-04-09T11:00:00Z",
    version: 3,
    status: "passed",
  },
  {
    controlId: "ctrl-003",
    controlName: "Jaarrekening check",
    runDate: "2026-04-08T09:15:00Z",
    version: 2,
    status: "failed",
  },
  {
    controlId: "ctrl-001",
    controlName: "Loonheffing validatie",
    runDate: "2026-04-05T16:45:00Z",
    version: 2,
    status: "passed",
  },
  {
    controlId: "ctrl-004",
    controlName: "Salarisadministratie audit",
    runDate: "2026-03-28T10:00:00Z",
    version: 1,
    status: "passed",
  },
];

// --- Helpers ---

const iconMap: Record<string, { icon: typeof Check; bg: string; color: string }> = {
  created: { icon: Plus, bg: "bg-purple-100 dark:bg-purple-900/30", color: "text-purple-600 dark:text-purple-400" },
  pdf_uploaded: { icon: FileText, bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600 dark:text-blue-400" },
  values_confirmed: { icon: Check, bg: "bg-green-100 dark:bg-green-900/30", color: "text-green-600 dark:text-green-400" },
  pdf_template_updated: { icon: Settings, bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600 dark:text-blue-400" },
  manual_update: { icon: Settings, bg: "bg-orange-100 dark:bg-orange-900/30", color: "text-orange-600 dark:text-orange-400" },
};

const actionLabels: Record<string, string> = {
  created: "Groep aangemaakt",
  pdf_uploaded: "PDF geupload",
  values_confirmed: "Waarden bevestigd",
  pdf_template_updated: "Velden bijgewerkt",
  manual_update: "Handmatig bijgewerkt",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string) {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Vandaag";
  if (diffDays === 1) return "Gisteren";
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weken geleden`;
  return formatDate(iso);
}

const statusColors: Record<string, string> = {
  passed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  running: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const statusLabels: Record<string, string> = {
  passed: "Geslaagd",
  failed: "Gefaald",
  running: "Actief",
};

// --- Version snapshot builder ---

function buildVersionSnapshots(entries: AuditEntry[]): { version: number; timestamp: string; values: GlobalValue[] }[] {
  const snapshots: { version: number; timestamp: string; values: GlobalValue[] }[] = [];
  let currentValues: GlobalValue[] = [];
  let version = 0;

  for (const entry of entries) {
    if (entry.action === "values_confirmed" && entry.details.newValues) {
      version++;
      currentValues = [...entry.details.newValues];
      snapshots.push({
        version,
        timestamp: entry.timestamp,
        values: currentValues,
      });
    } else if (entry.action === "created" && entry.details.mode) {
      // Initial creation - if values exist, that's v1
      // v1 snapshot is added when values are first confirmed
    }
  }

  return snapshots;
}

// --- Component ---

export default function GlobalValueAuditTrail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GlobalValueGroup | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getGlobalValueGroup(id),
      getGlobalValueAudit(id),
    ])
      .then(([g, a]) => {
        setGroup(g);
        setEntries(a);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const versionSnapshots = useMemo(() => buildVersionSnapshots(entries), [entries]);
  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  const usageByVersion = useMemo(() => {
    const map = new Map<number, ControlUsage[]>();
    for (const u of mockControlUsages) {
      const arr = map.get(u.version) || [];
      arr.push(u);
      map.set(u.version, arr);
    }
    return map;
  }, []);

  const toggleVersion = (v: number) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const toggleEntry = (i: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Globe className="h-8 w-8 mx-auto mb-2" />
        <p>Groep niet gevonden</p>
        <Button variant="link" onClick={() => navigate("/controles/globale-waarden")} className="mt-2">
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
            <Badge variant="outline" className="text-sm">v{group.version}</Badge>
            <Badge variant="secondary" className="text-xs">
              {group.mode === "pdf" ? "PDF" : "Handmatig"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Aangemaakt op {formatDate(group.createdAt)} &middot; Laatst bijgewerkt {formatRelative(group.updatedAt)}
          </p>
        </div>
        {group.mode === "pdf" && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/global-values/${group.id}/edit`}>
              <FileText className="h-4 w-4 mr-1.5" />
              Velden bewerken
            </Link>
          </Button>
        )}
      </div>

      {/* Current values summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Huidige waarden
            <span className="text-muted-foreground font-normal text-sm">({group.values.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {group.values.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nog geen waarden gedefinieerd.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Waarde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.values.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">{v.dataType}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{v.value || <span className="text-muted-foreground italic">leeg</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline - takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Audit trail
          </h2>

          {reversedEntries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Geen gebeurtenissen gevonden.
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-0">
                {reversedEntries.map((entry, i) => {
                  const mapping = iconMap[entry.action] ?? iconMap.created;
                  const Icon = mapping.icon;
                  const hasChanges = entry.action === "values_confirmed" && entry.details.newValues;
                  const isExpanded = expandedEntries.has(i);

                  return (
                    <div key={i} className="relative flex gap-3 pb-4">
                      {/* Icon node */}
                      <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${mapping.bg} ring-4 ring-background`}>
                        <Icon className={`h-4 w-4 ${mapping.color}`} />
                      </div>

                      {/* Content */}
                      <Card className="flex-1 shadow-sm">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{actionLabels[entry.action] ?? entry.action}</span>
                              {entry.action === "values_confirmed" && (
                                <Badge variant="outline" className="text-xs">
                                  <GitCommit className="h-3 w-3 mr-1" />
                                  Versie update
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {formatDateTime(entry.timestamp)}
                            </span>
                          </div>

                          {/* Details */}
                          {entry.details.filename && (
                            <p className="text-sm text-muted-foreground mt-1">
                              <FileText className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                              {entry.details.filename}
                              {entry.details.replacedFilename && (
                                <span className="text-xs"> — vervangt <span className="line-through">{entry.details.replacedFilename}</span></span>
                              )}
                            </p>
                          )}
                          {entry.details.mode && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.details.mode === "pdf" ? "PDF-modus" : "Handmatige modus"}
                            </p>
                          )}
                          {entry.details.fieldCount !== undefined && (
                            <p className="text-sm text-muted-foreground mt-1">{entry.details.fieldCount} velden</p>
                          )}

                          {/* Expandable value changes */}
                          {hasChanges && (
                            <div className="mt-2">
                              <button
                                onClick={() => toggleEntry(i)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                Wijzigingen bekijken
                              </button>
                              {isExpanded && (
                                <div className="mt-2 text-xs bg-muted/50 rounded overflow-hidden">
                                  <div className="flex font-medium px-3 py-1.5 border-b bg-muted/80">
                                    <span className="flex-1">Veld</span>
                                    <span className="flex-1">Oud</span>
                                    <span className="flex-1">Nieuw</span>
                                  </div>
                                  {entry.details.newValues!.map((nv) => {
                                    const ov = entry.details.previousValues?.find((p) => p.id === nv.id);
                                    const changed = ov?.value !== nv.value;
                                    if (!changed) return null;
                                    return (
                                      <div key={nv.id} className="flex px-3 py-1.5 border-b last:border-b-0">
                                        <span className="flex-1 font-medium">{nv.name}</span>
                                        <span className="flex-1 text-red-500 line-through">{ov?.value ?? "\u2014"}</span>
                                        <span className="flex-1 text-green-600 font-medium">{nv.value}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar - Versions & Control Usage */}
        <div className="space-y-6">
          {/* Version snapshots */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hash className="h-5 w-5 text-muted-foreground" />
              Versies
            </h2>

            {versionSnapshots.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Nog geen versies.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {[...versionSnapshots].reverse().map((snap) => {
                  const isExpanded = expandedVersions.has(snap.version);
                  const isCurrent = snap.version === group.version;
                  const usages = usageByVersion.get(snap.version) || [];

                  return (
                    <Card key={snap.version} className={isCurrent ? "ring-1 ring-primary/30" : ""}>
                      <CardContent className="p-3">
                        <button
                          onClick={() => toggleVersion(snap.version)}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={isCurrent ? "default" : "outline"} className="text-xs">
                              v{snap.version}
                            </Badge>
                            {isCurrent && (
                              <span className="text-xs text-primary font-medium">Huidig</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {usages.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <ListChecks className="h-3.5 w-3.5" />
                                    {usages.length}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Gebruikt door {usages.length} controle{usages.length !== 1 ? "s" : ""}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span className="text-xs text-muted-foreground">{formatDate(snap.timestamp)}</span>
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            <Separator />
                            {/* Snapshot values */}
                            <div className="text-xs space-y-1">
                              <p className="font-medium text-muted-foreground mb-1.5">Waarden in deze versie:</p>
                              {snap.values.map((v) => (
                                <div key={v.id} className="flex justify-between py-1 px-2 rounded bg-muted/50">
                                  <span>{v.name}</span>
                                  <span className="font-mono">{v.value || "\u2014"}</span>
                                </div>
                              ))}
                            </div>

                            {/* Control usages for this version */}
                            {usages.length > 0 && (
                              <>
                                <Separator />
                                <div className="text-xs space-y-1">
                                  <p className="font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    Gebruikt door controles:
                                  </p>
                                  {usages.map((u, i) => (
                                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
                                      <div className="flex items-center gap-2">
                                        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-medium">{u.controlName}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[u.status]}`}>
                                          {statusLabels[u.status]}
                                        </span>
                                        <span className="text-muted-foreground">{formatDate(u.runDate)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* All control usages summary */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-muted-foreground" />
              Gebruik door controles
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Controle</TableHead>
                      <TableHead className="text-xs">Versie</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Datum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockControlUsages.map((u, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium py-2">{u.controlName}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-[10px]">v{u.version}</Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[u.status]}`}>
                            {statusLabels[u.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground py-2">{formatDate(u.runDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground italic px-1">
              Toont welke controles deze globale waarden hebben gebruikt en met welke versie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
