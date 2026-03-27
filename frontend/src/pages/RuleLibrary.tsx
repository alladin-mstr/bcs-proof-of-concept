import { useState } from "react";
import { Search, Plus, Filter, Upload, Pencil } from "lucide-react";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTaskContext } from "@/context/TaskContext";
import { useToast } from "@/hooks/use-toast";

export default function RuleLibrary() {
  const { translationRules, teams } = useTaskContext();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [rapportFilter, setRapportFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const rapportNames = [...new Set(translationRules.map(r => r.rapport))];

  const filteredRules = translationRules.filter(rule => {
    const matchesSearch = rule.code.toLowerCase().includes(search.toLowerCase()) ||
      rule.translation.toLowerCase().includes(search.toLowerCase());
    const matchesTeam = teamFilter === 'all' || rule.teamId === teamFilter;
    const matchesRapport = rapportFilter === 'all' || rule.rapport === rapportFilter;
    return matchesSearch && matchesTeam && matchesRapport;
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Stats
  const totalRules = 42;
  const polarisRules = 28;
  const deltaRules = 8;
  const hreRules = 6;

  return (
    <div className="space-y-8">
      <HeaderAction>
        <Button variant="outline" className="rounded-full gap-2" size="sm" onClick={() => toast({ title: "CSV import", description: "Upload functie wordt binnenkort beschikbaar." })}>
          <Upload className="h-4 w-4" />
          Importeer regels (CSV)
        </Button>
        <Button className="rounded-full shadow-lg" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nieuwe regel
        </Button>
      </HeaderAction>

      {/* Stats */}
      <div className="flex gap-4 flex-wrap">
        <Badge variant="outline" className="text-sm py-1.5 px-3">{totalRules} regels totaal</Badge>
        <Badge variant="outline" className="text-sm py-1.5 px-3 border-primary/30 text-primary">{polarisRules} Polaris</Badge>
        <Badge variant="outline" className="text-sm py-1.5 px-3 border-blue-500/30 text-blue-600">{deltaRules} Delta</Badge>
        <Badge variant="outline" className="text-sm py-1.5 px-3 border-purple-500/30 text-purple-600">{hreRules} HR Essentials</Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op code of tekst..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-full"
          />
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle teams</SelectItem>
            {teams.map(team => (
              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rapportFilter} onValueChange={setRapportFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Rapport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle rapporten</SelectItem>
            {rapportNames.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rules Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Code/Conditie</TableHead>
                <TableHead className="w-40">Rapport</TableHead>
                <TableHead className="w-24">Team</TableHead>
                <TableHead>Vertaling</TableHead>
                <TableHead className="w-32 text-right">Laatst gewijzigd</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map((rule) => (
                <TableRow key={rule.id} className="hover:bg-muted/50">
                  <TableCell>
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{rule.code}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{rule.rapport}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{rule.teamName}</Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-md">
                    {editingId === rule.id ? (
                      <Textarea
                        defaultValue={rule.translation}
                        className="text-sm min-h-[60px]"
                        autoFocus
                        onBlur={() => {
                          setEditingId(null);
                          toast({ title: "Regel bijgewerkt" });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            setEditingId(null);
                            toast({ title: "Regel bijgewerkt" });
                          }
                        }}
                      />
                    ) : (
                      <p className="line-clamp-2">{rule.translation}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {formatDate(rule.lastModified)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(rule.id)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Geen regels gevonden
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
