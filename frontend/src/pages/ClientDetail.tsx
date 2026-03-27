import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTaskContext } from "@/context/TaskContext";

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { getClientById, getClientControlRuns } = useTaskContext();

  const client = getClientById(clientId || '');
  const controlRuns = getClientControlRuns(clientId || '');

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
  }, {} as Record<string, { label: string; runs: typeof controlRuns }>);

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('nl-NL', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusBadge = (run: typeof controlRuns[0]) => {
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
        {run.deviations.length} afwijking{run.deviations.length !== 1 ? 'en' : ''}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/klanten')} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Terug
      </Button>

      <HeaderAction>
        <Button asChild className="rounded-full shadow-lg" size="sm">
          <Link to={`/controle?client=${client.id}`}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe controle
          </Link>
        </Button>
      </HeaderAction>

      {/* Control History */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Controlegeschiedenis</CardTitle>
        </CardHeader>
        <CardContent>
          {controlRuns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium text-foreground">Nog geen controles uitgevoerd</p>
              <p className="text-sm mt-1">Start je eerste controle voor deze klant</p>
              <Button asChild className="mt-6 rounded-full">
                <Link to={`/controle?client=${client.id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nieuwe controle
                </Link>
              </Button>
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
                        onClick={() => navigate(`/resultaten/${run.id}`)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground w-32">
                            {formatTime(run.runAt)}
                          </span>
                          <span className="font-medium">{run.templateName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(run)}
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
