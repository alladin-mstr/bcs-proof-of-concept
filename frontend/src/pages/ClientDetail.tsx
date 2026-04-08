import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Plus, CheckCircle, AlertTriangle, ChevronRight, FileText, Clock, Pencil, Play, Layers } from "lucide-react";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getKlant, listControles, listControleRuns, listControleSeries } from "@/api/client";
import type { Klant, Controle, ControleRunResult, ControleSeries } from "@/types";

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Klant | null>(null);
  const [controles, setControles] = useState<Controle[]>([]);
  const [controlRuns, setControlRuns] = useState<ControleRunResult[]>([]);
  const [series, setSeries] = useState<ControleSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    Promise.all([
      getKlant(clientId),
      listControles(),
      listControleRuns(),
      listControleSeries(clientId),
    ])
      .then(([klant, allControles, allRuns, klantSeries]) => {
        setClient(klant);
        setControles(allControles.filter((c) => c.klantId === clientId));
        setControlRuns(allRuns.filter((r) => r.klantId === clientId));
        setSeries(klantSeries);
      })
      .catch(() => setClient(null))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Laden...
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16">
        <p className="text-lg font-medium text-foreground">Klant niet gevonden</p>
        <Button asChild className="mt-4">
          <Link to="/klanten">Terug naar klanten</Link>
        </Button>
      </div>
    );
  }

  // Group runs by month
  const runsByMonth = controlRuns.reduce((acc, run) => {
    const date = new Date(run.runAt);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const monthLabel = date.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

    if (!acc[monthKey]) {
      acc[monthKey] = { label: monthLabel, runs: [] };
    }
    acc[monthKey].runs.push(run);
    return acc;
  }, {} as Record<string, { label: string; runs: ControleRunResult[] }>);

  const formatTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });

  const getRunStatusBadge = (run: ControleRunResult) => {
    if (run.status === 'success') {
      return (
        <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
          <CheckCircle className="h-3 w-3" />
          Alles ok
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 gap-1">
        <AlertTriangle className="h-3 w-3" />
        {run.failedFields} afwijking{run.failedFields !== 1 ? 'en' : ''}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <HeaderAction>
        <Button
          className="rounded-full shadow-lg"
          size="sm"
          onClick={() => navigate(`/controles?newForKlant=${client.id}`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nieuwe controle
        </Button>
      </HeaderAction>

      {/* Controles for this klant */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Controles</CardTitle>
        </CardHeader>
        <CardContent>
          {controles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Nog geen controles voor deze klant</p>
            </div>
          ) : (
            <div className="space-y-2">
              {controles.map((c) => {
                const totalFields = c.files.reduce((sum, f) => sum + f.fields.length, 0);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                    onClick={() => navigate(`/controle/${c.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{c.files.length} bestanden</span>
                          <span>{totalFields} velden</span>
                          <span>{formatDate(c.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.status === "published" ? (
                        <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                          Gepubliceerd
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                          Concept
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Controle reeksen voor deze klant */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Controle reeksen</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Nog geen controle reeksen voor deze klant</p>
            </div>
          ) : (
            <div className="space-y-2">
              {series.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                  onClick={() => navigate(`/controle-series/${s.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{s.steps.length} stappen</span>
                        <span>{formatDate(s.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Control Run History */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Controlegeschiedenis</CardTitle>
        </CardHeader>
        <CardContent>
          {controlRuns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Nog geen controles uitgevoerd</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(runsByMonth).map(([monthKey, { label, runs }]) => (
                <div key={monthKey}>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 border-b pb-2">
                    {label}
                  </h3>
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                        onClick={() => navigate(`/controle/${run.controleId}/run`)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground w-32">
                            {formatTime(run.runAt)}
                          </span>
                          <span className="font-medium">{run.controleName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {getRunStatusBadge(run)}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
