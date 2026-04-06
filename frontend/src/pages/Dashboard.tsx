import { Link, useNavigate } from "react-router-dom";
import { Plus, CheckCircle, AlertTriangle, Clock, TrendingUp, Users, ArrowRight, Sparkles, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTaskContext } from "@/context/TaskContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { getAllControlRuns, currentUser } = useTaskContext();

  const allRuns = getAllControlRuns();

  // Fixed demo stats from mega-prompt
  const controlesThisMonth = 47;
  const avgDoorlooptijd = 12;
  const bevindingen = 203;

  // Recent controls (top 5 across all teams)
  const recentControls = allRuns.slice(0, 5);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (run: typeof allRuns[0]) => {
    if (run.status === 'success') {
      return (
        <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
          <CheckCircle className="h-3 w-3" />
          Afgerond
        </Badge>
      );
    }
    if (run.status === 'review') {
      return (
        <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Review nodig
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1">
        <Clock className="h-3 w-3" />
        In behandeling
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      {/* Hero Welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-accent to-primary/5 p-8 border border-primary/10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium">Welkom terug, {currentUser}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
            Controle assistent
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Beheer en automatiseer al je controles op één plek. Upload rapporten, pas regels toe, 
            en ontvang direct terugkoppeling.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button asChild size="lg" className="rounded-full shadow-lg hover:shadow-xl transition-shadow">
              <Link to="/controle">
                <Plus className="mr-2 h-5 w-5" />
                Nieuwe controle
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full">
              <Link to="/klanten">
                Bekijk klanten
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Controles deze maand</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{controlesThisMonth}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gem. doorlooptijd</CardTitle>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{avgDoorlooptijd} min</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bevindingen gevangen</CardTitle>
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{bevindingen}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Controls Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Recente controles</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/controles" className="text-muted-foreground hover:text-foreground">
              Alles zien
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Klant</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Bevindingen</TableHead>
                <TableHead>Controleur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentControls.map((run) => (
                <TableRow 
                  key={run.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/resultaten/${run.id}`)}
                >
                  <TableCell className="font-medium">{run.clientName}</TableCell>
                  <TableCell className="text-muted-foreground">{run.templateName}</TableCell>
                  <TableCell>{getStatusBadge(run)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(run.runAt)}</TableCell>
                  <TableCell className="text-right">
                    {(run.bevindingen ?? run.deviations.length) > 0 ? (
                      <span>{run.bevindingen ?? run.deviations.length} opmerkingen</span>
                    ) : (
                      <span className="text-success">0 afwijkingen</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.controleurName || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
