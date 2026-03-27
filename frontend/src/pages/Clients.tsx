import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Search, Plus, FolderOpen, ChevronRight, CheckCircle, AlertTriangle, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTaskContext } from "@/context/TaskContext";

export default function Clients() {
  const navigate = useNavigate();
  const { getAllClients, getClientControlRuns, addClient, teams } = useTaskContext();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [newClientName, setNewClientName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const clients = getAllClients();

  const clientsWithStats = clients.map(client => {
    const runs = getClientControlRuns(client.id);
    const lastRun = runs[0];
    const totalRuns = runs.length;
    const openBevindingen = runs.reduce((sum, r) => sum + (r.bevindingen ?? r.deviations.length), 0);
    const team = teams.find(t => t.id === client.teamId);

    return {
      ...client,
      lastRun,
      totalRuns,
      openBevindingen,
      teamName: team?.name || '',
    };
  });

  const filteredClients = clientsWithStats
    .filter(client => client.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "recent") {
        const aDate = a.lastRun?.runAt || a.createdAt;
        const bDate = b.lastRun?.runAt || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }
      return a.name.localeCompare(b.name);
    });

  const handleAddClient = () => {
    if (newClientName.trim()) {
      addClient(newClientName.trim());
      setNewClientName("");
      setDialogOpen(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-8">
      <HeaderAction>
        <Button className="rounded-full shadow-lg" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nieuwe klant
        </Button>
      </HeaderAction>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe klant toevoegen</DialogTitle>
            <DialogDescription>Voeg een nieuwe klant toe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Klantnaam</Label>
              <Input
                id="client-name"
                placeholder="Bijv. Bakkerij de Gouden Korst"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddClient} disabled={!newClientName.trim()}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-full"
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48 rounded-full">
            <SelectValue placeholder="Sorteer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="name">Naam A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clients Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Klant</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Medewerkers</TableHead>
                <TableHead>Laatste controle</TableHead>
                <TableHead className="text-right">Open bevindingen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/klanten/${client.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        {client.medewerkerCount && (
                          <p className="text-xs text-muted-foreground">{client.medewerkerCount} medewerkers</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{client.teamName}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.medewerkerCount || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.lastRun ? formatDate(client.lastRun.runAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {client.openBevindingen > 0 ? (
                      <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                        {client.openBevindingen}
                      </Badge>
                    ) : (
                      <span className="text-success text-sm">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
