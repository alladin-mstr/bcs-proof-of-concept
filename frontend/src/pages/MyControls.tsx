import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CheckCircle, AlertTriangle, Clock, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTaskContext } from "@/context/TaskContext";

export default function MyControls() {
  const navigate = useNavigate();
  const { getAllControlRuns } = useTaskContext();
  const [search, setSearch] = useState("");

  const allRuns = getAllControlRuns();

  const filteredRuns = allRuns.filter(run =>
    run.clientName.toLowerCase().includes(search.toLowerCase()) ||
    run.templateName.toLowerCase().includes(search.toLowerCase()) ||
    (run.controleurName || '').toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
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
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op klant, template of controleur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-full"
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
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
              {filteredRuns.map((run) => (
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
                    {(run.bevindingen ?? run.deviations.length) > 0
                      ? `${run.bevindingen ?? run.deviations.length} opmerkingen`
                      : <span className="text-success">0</span>
                    }
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.controleurName || '—'}</TableCell>
                </TableRow>
              ))}
              {filteredRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Geen controles gevonden</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
