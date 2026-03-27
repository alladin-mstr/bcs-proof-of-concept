import { useState } from "react";
import { Link } from "react-router-dom";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Search, Copy, Plus, Pencil, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTaskContext } from "@/context/TaskContext";
import { TaskTypeIcon, getTaskTypeLabel } from "@/components/tasks/TaskTypeIcon";
import { Template } from "@/types/task";

// Pre-built gallery templates
const galleryTemplates: Omit<Template, 'id' | 'createdAt' | 'teamId'>[] = [
  {
    name: 'Polaris Standaard',
    description: 'Complete Polaris looncontrole met alle rapporten',
    type: 'pattern',
    buildingBlock: 'vertaling',
    fields: [],
    mappings: [],
    isShared: true,
    createdBy: 'BCS',
    reports: [
      { id: 'r1', name: 'Verwerkingssignalen', isRequired: true },
      { id: 'r2', name: 'Loonaangifte', isRequired: true },
      { id: 'r3', name: 'TWK controle', isRequired: false },
      { id: 'r4', name: 'In-dienst rapport', isRequired: true },
      { id: 'r5', name: 'Uit-dienst rapport', isRequired: true },
      { id: 'r6', name: 'Betalingen', isRequired: false },
      { id: 'r7', name: 'Reserveringen', isRequired: false },
    ],
  },
  {
    name: 'Delta Vergelijking',
    description: 'Vergelijk twee documenten op afwijkingen',
    type: 'comparison',
    buildingBlock: 'vergelijking',
    fields: [],
    mappings: [],
    isShared: true,
    createdBy: 'BCS',
    leftDocumentLabel: 'Bronbestand',
    rightDocumentLabel: 'Controlebestand',
  },
  {
    name: 'Pensioencheck',
    description: 'Controleer pensioenbijdragen op basis van parameters',
    type: 'validation',
    buildingBlock: 'validatie',
    fields: [],
    mappings: [],
    isShared: true,
    createdBy: 'BCS',
    reports: [
      { id: 'r1', name: 'Loonstroken + Parameters', isRequired: true },
    ],
  },
  {
    name: 'Loonstrookcheck',
    description: 'Vergelijk loonstroken met salarissysteem',
    type: 'comparison',
    buildingBlock: 'vergelijking',
    fields: [],
    mappings: [],
    isShared: true,
    createdBy: 'BCS',
    leftDocumentLabel: 'Loonstroken',
    rightDocumentLabel: 'Salarissysteem export',
  },
];

type FilterCategory = 'all' | 'vertaling' | 'comparison' | 'validation';

export default function Gallery() {
  const { getTeamTemplates, getSharedTemplates, currentTeam, addTemplate } = useTaskContext();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FilterCategory>('all');

  const teamTemplates = getTeamTemplates();
  const sharedTemplates = getSharedTemplates();

  const filterByCategory = (template: Template | typeof galleryTemplates[0]) => {
    if (category === 'all') return true;
    if (category === 'vertaling') {
      return template.buildingBlock === 'vertaling' || template.type === 'pattern';
    }
    if (category === 'comparison') return template.type === 'comparison';
    if (category === 'validation') return template.type === 'validation' || template.type === 'pattern';
    return true;
  };

  const filteredTeamTemplates = teamTemplates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) && filterByCategory(t)
  );

  const filteredSharedTemplates = sharedTemplates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) && filterByCategory(t)
  );

  const filteredGalleryTemplates = galleryTemplates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) && filterByCategory(t)
  );

  const handleCopy = (template: typeof galleryTemplates[0]) => {
    addTemplate(template);
    toast({
      title: "Template gekopieerd!",
      description: `"${template.name}" is toegevoegd aan je templates.`,
    });
  };

  const formatLastUsed = (date?: Date) => {
    if (!date) return 'Nooit gebruikt';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Vandaag';
    if (days === 1) return 'Gisteren';
    if (days < 7) return `${days} dagen geleden`;
    return 'Vorige week';
  };

  const getReportCount = (template: Template | typeof galleryTemplates[0]) => {
    if (template.reports?.length) return template.reports.length;
    if (template.type === 'comparison') return 2;
    return 1;
  };

  const getTypeLabel = (template: Template | typeof galleryTemplates[0]) => {
    return getTaskTypeLabel(template.type, template.buildingBlock);
  };

  return (
    <div className="space-y-8">
      <HeaderAction>
        <Button asChild className="rounded-full shadow-lg" size="sm">
          <Link to="/template/nieuw">
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe template
          </Link>
        </Button>
      </HeaderAction>

      {/* Search & Filter */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-full"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as FilterCategory)}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="vertaling">Vertaling</SelectItem>
            <SelectItem value="comparison">Vergelijking</SelectItem>
            <SelectItem value="validation">Validatie</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team Templates */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b pb-2">
          {currentTeam?.name || 'Mijn Team'}
        </h2>
        
        {filteredTeamTemplates.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium text-foreground">
                {search ? "Geen templates gevonden" : "Nog geen templates"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Pas je zoekopdracht aan" : "Kopieer een standaard template of maak er zelf een"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeamTemplates.map((template) => (
              <Card key={template.id} className="shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <TaskTypeIcon type={template.type} className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {getReportCount(template)} rapporten
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(template)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      {formatLastUsed(template.lastUsed)}
                    </span>
                    <Button variant="outline" size="sm" className="rounded-full h-8">
                      <Pencil className="h-3 w-3 mr-1" />
                      Bewerk
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Standard Templates Gallery */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide border-b pb-2">
          Standaard templates
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGalleryTemplates.map((template, index) => (
            <Card key={index} className="shadow-sm hover:shadow-md transition-all border-dashed">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <TaskTypeIcon type={template.type} className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {template.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {getReportCount(template)} rapporten
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(template)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Door: {template.createdBy}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full h-8"
                    onClick={() => handleCopy(template)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Kopieer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
}
