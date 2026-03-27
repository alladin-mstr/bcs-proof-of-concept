import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Download, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, Pencil, BookOpen, ArrowLeftRight, SearchCheck, FileEdit, FileSpreadsheet, FileDown, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { vergelijkingResultData, validatieResultData, vertalingResultData } from "@/data/demo-data";

export default function Results() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { getControlRunById, currentResult } = useTaskContext();
  const { toast } = useToast();

  const controlRun = getControlRunById(taskId || '');
  const result = controlRun || (currentResult?.taskId === taskId ? currentResult : null);

  if (!result) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-2">Resultaat niet gevonden</h1>
        <p className="text-muted-foreground mb-4">Dit resultaat bestaat niet of is verlopen.</p>
        <Button onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Terug naar dashboard
        </Button>
      </div>
    );
  }

  const templateName = 'templateName' in result ? result.templateName : ('taskName' in result ? result.taskName : '');
  const clientName = 'clientName' in result ? result.clientName : '';
  const runAt = 'runAt' in result ? result.runAt : new Date();

  if (templateName.includes('Implementatiecheck') || templateName.includes('Loonstrookcheck')) {
    return <VergelijkingResult navigate={navigate} toast={toast} />;
  }
  if (templateName.includes('Pensioencheck')) {
    return <ValidatieResult navigate={navigate} toast={toast} />;
  }
  if (templateName.includes('Maandcontrole')) {
    return <VertalingResult navigate={navigate} toast={toast} />;
  }

  return <VertalingResult navigate={navigate} toast={toast} />;
}

// ===== VERGELIJKING VARIANT =====
function VergelijkingResult({ navigate, toast }: any) {
  const data = vergelijkingResultData;
  const afwijkingen = data.fields.filter(f => !f.match).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight className="h-5 w-5 text-blue-500" />
            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 bg-blue-500/10">Vergelijking</Badge>
          </div>
          <h1 className="text-2xl font-bold">{data.clientName}</h1>
          <p className="text-muted-foreground">
            {data.templateName} — {data.date} — Controleur: {data.controleur}
          </p>
        </div>
        <Badge className="bg-success/10 text-success border-success/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Afgerond — {afwijkingen} afwijkingen
        </Badge>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Veld</TableHead>
                <TableHead>Implementatieplan</TableHead>
                <TableHead>Systeem</TableHead>
                <TableHead className="w-28 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.fields.map((field, idx) => (
                <TableRow key={idx} className={!field.match ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{field.veld}</TableCell>
                  <TableCell>{field.plan}</TableCell>
                  <TableCell className={!field.match ? "font-semibold text-destructive" : ""}>
                    {field.systeem}
                  </TableCell>
                  <TableCell className="text-center">
                    {field.match ? (
                      <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                        <CheckCircle className="h-3 w-3 mr-1" /> Match
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">
                        <XCircle className="h-3 w-3 mr-1" /> Afwijking
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-warning bg-warning/5">
        <CardContent className="py-4">
          <p className="text-sm">
            <strong>{afwijkingen} afwijkingen</strong> gevonden in {data.fields.length} gecontroleerde velden.
            Actie vereist voor: {data.fields.filter(f => !f.match).map(f => f.veld).join(', ')}.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button variant="outline" className="gap-2" onClick={() => toast({ title: "Rapport gedownload", description: "PDF opgeslagen." })}>
          <Download className="h-4 w-4" /> Download rapport
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => toast({ title: "Mail geopend", description: "Terugkoppeling template klaargemaakt." })}>
          Terugkoppeling sturen
        </Button>
        <Button className="gap-2" onClick={() => toast({ title: "Gemarkeerd", description: "Controle is afgehandeld." })}>
          Markeer als afgehandeld
        </Button>
      </div>
    </div>
  );
}

// ===== VALIDATIE VARIANT =====
function ValidatieResult({ navigate, toast }: any) {
  const data = validatieResultData;
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const afwijkingen = data.medewerkers.filter(m => !m.correct).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <SearchCheck className="h-5 w-5 text-purple-500" />
            <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-600 bg-purple-500/10">Validatie</Badge>
          </div>
          <h1 className="text-2xl font-bold">{data.clientName}</h1>
          <p className="text-muted-foreground">
            {data.templateName} — {data.date} — Controleur: {data.controleur}
          </p>
        </div>
        <Badge className="bg-warning/10 text-warning border-warning/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Review nodig — {afwijkingen} afwijkingen
        </Badge>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuratie (Parameters)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {data.parameters.map((param, idx) => (
              <div key={idx}>
                <p className="text-xs text-muted-foreground">{param.label}</p>
                <p className="font-medium text-sm">{param.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Formule</p>
            <code className="text-sm font-mono">{data.formule}</code>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Resultaat per medewerker
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead className="text-right">Bruto loon</TableHead>
                <TableHead className="text-right">Grondslag</TableHead>
                <TableHead className="text-right">Verwacht</TableHead>
                <TableHead className="text-right">Op loonstrook</TableHead>
                <TableHead className="text-right">Verschil</TableHead>
                <TableHead className="text-center w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.medewerkers.map((med) => (
                <>
                  <TableRow
                    key={med.nr}
                    className={`cursor-pointer hover:bg-muted/50 ${!med.correct ? "bg-destructive/5" : ""}`}
                    onClick={() => setExpandedRow(expandedRow === med.nr ? null : med.nr)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {!med.correct && (
                          expandedRow === med.nr
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        {med.nr} - {med.naam}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{med.bruto}</TableCell>
                    <TableCell className="text-right">{med.grondslag}</TableCell>
                    <TableCell className="text-right">{med.verwacht}</TableCell>
                    <TableCell className={`text-right ${!med.correct ? "font-semibold text-destructive" : ""}`}>
                      {med.werkelijk}
                    </TableCell>
                    <TableCell className={`text-right ${!med.correct ? "font-semibold text-destructive" : ""}`}>
                      {med.verschil}
                    </TableCell>
                    <TableCell className="text-center">
                      {med.correct ? (
                        <Badge variant="outline" className="text-success border-success/30 bg-success/10 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> Correct
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 text-xs">
                          <XCircle className="h-3 w-3 mr-1" /> Afwijking
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedRow === med.nr && !med.correct && med.nr === data.detailExpand.nr && (
                    <TableRow key={`${med.nr}-detail`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-0">
                        <div className="p-4 font-mono text-sm whitespace-pre-line border-l-4 border-warning ml-4">
                          <p className="font-semibold mb-2">Berekening {data.detailExpand.naam}:</p>
                          {data.detailExpand.lines.map((line, i) => (
                            <p key={i} className={line.startsWith('⚠️') ? 'text-warning font-semibold mt-2' : line.startsWith('Maar') || line.startsWith('Mogelijke') ? 'text-destructive' : ''}>
                              {line}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button variant="outline" className="gap-2" onClick={() => toast({ title: "Rapport gedownload" })}>
          <Download className="h-4 w-4" /> Download rapport
        </Button>
        <Button variant="outline" className="gap-2">Terugkoppeling sturen</Button>
        <Button variant="outline" className="gap-2">Parameters aanpassen</Button>
      </div>
    </div>
  );
}

// ===== VERTALING VARIANT (⭐ BELANGRIJKSTE) =====
function VertalingResult({ navigate, toast }: any) {
  const data = vertalingResultData;
  const [activeTab, setActiveTab] = useState(data.tabs[0].name);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  const handleEditSave = (id: string, text: string) => {
    setEditedTexts(prev => ({ ...prev, [id]: text }));
    setEditingId(null);
    toast({ title: "Opmerking aangepast", description: "De tekst is bijgewerkt." });
  };

  const getOpmerking = (id: string, original: string) => editedTexts[id] ?? original;

  const handleExport = () => {
    toast({
      title: "Terugkoppelbestand gegenereerd",
      description: `${data.terugkoppelTotaal} opmerkingen uit ${data.tabs.length} rapporten samengevoegd.`,
    });
  };

  const EditableCell = ({ id, text }: { id: string; text: string }) => {
    const currentText = getOpmerking(id, text);
    if (editingId === id) {
      return (
        <div className="space-y-2">
          <Textarea
            defaultValue={currentText}
            className="text-xs min-h-[60px]"
            autoFocus
            onBlur={(e) => handleEditSave(id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEditSave(id, (e.target as HTMLTextAreaElement).value);
              }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>Annuleren</Button>
          </div>
        </div>
      );
    }
    return <span className="text-xs">{currentText}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <FileEdit className="h-5 w-5 text-amber-500" />
            <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 bg-amber-500/10">Vertaling</Badge>
          </div>
          <h1 className="text-2xl font-bold">{data.clientName}</h1>
          <p className="text-muted-foreground">
            {data.templateName} — {data.date} — Controleur: {data.controleur}
          </p>
        </div>
        <Badge className="bg-success/10 text-success border-success/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Afgerond — {data.terugkoppelTotaal} opmerkingen
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
          {data.tabs.map((tab) => (
            <TabsTrigger key={tab.name} value={tab.name} className="whitespace-nowrap text-xs">
              {tab.name} ({tab.count})
            </TabsTrigger>
          ))}
        </TabsList>

        {data.tabs.map((tab) => (
          <TabsContent key={tab.name} value={tab.name} className="space-y-4">
            {/* Verwerkingssignalen tab - split view */}
            {tab.bronData && tab.vertalingen && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="shadow-sm bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Bronrapport</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Fout</TableHead>
                          <TableHead className="w-20">Code</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="w-16">Nr</TableHead>
                          <TableHead>Naam</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tab.bronData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Badge variant="outline" className={row.fout === 'f' ? "text-destructive border-destructive/30 text-xs" : "text-warning border-warning/30 text-xs"}>
                                {row.fout}
                              </Badge>
                            </TableCell>
                            <TableCell><code className="text-xs font-mono">{row.controle}</code></TableCell>
                            <TableCell className="text-xs">{row.omschrijving}</TableCell>
                            <TableCell className="font-mono text-xs">{row.persNr}</TableCell>
                            <TableCell className="text-xs">{row.persNaam}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Vertaling (gegenereerde output)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Nr</TableHead>
                          <TableHead className="w-28">Naam</TableHead>
                          <TableHead>Opmerking</TableHead>
                          <TableHead className="w-16">Bron</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tab.vertalingen.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-mono text-xs">{row.persNr}</TableCell>
                            <TableCell className="text-xs font-medium">{row.naam}</TableCell>
                            <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                            <TableCell><code className="text-xs font-mono">{row.bron}</code></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Loonaangifte tab */}
            {tab.loonaangifteData && (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Pers.nr</TableHead>
                        <TableHead className="w-32">Naam</TableHead>
                        <TableHead>Opmerking</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tab.loonaangifteData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.persNr}</TableCell>
                          <TableCell className="font-medium">{row.naam}</TableCell>
                          <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* In-dienst tab */}
            {tab.indienstData && (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Pers.nr</TableHead>
                        <TableHead className="w-32">Naam</TableHead>
                        <TableHead className="w-40">Check</TableHead>
                        <TableHead>Opmerking</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tab.indienstData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.persNr}</TableCell>
                          <TableCell className="font-medium">{row.naam}</TableCell>
                          <TableCell className="text-sm">{row.check}</TableCell>
                          <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Uit-dienst tab */}
            {tab.uitdienstData && (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pers.nr</TableHead>
                        <TableHead>Naam</TableHead>
                        <TableHead>Uitdienst</TableHead>
                        <TableHead>Reservering</TableHead>
                        <TableHead>Saldo</TableHead>
                        <TableHead>Opmerking</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tab.uitdienstData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.persNr}</TableCell>
                          <TableCell className="font-medium">{row.naam}</TableCell>
                          <TableCell>{row.uitdienst}</TableCell>
                          <TableCell>{row.reservering}</TableCell>
                          <TableCell className="font-medium">{row.saldo}</TableCell>
                          <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* TWK tab */}
            {tab.twkData && (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pers.nr</TableHead>
                        <TableHead>Naam</TableHead>
                        <TableHead>Mutatie</TableHead>
                        <TableHead>Oud</TableHead>
                        <TableHead>Nieuw</TableHead>
                        <TableHead>Opmerking</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tab.twkData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.persNr}</TableCell>
                          <TableCell className="font-medium">{row.naam}</TableCell>
                          <TableCell>{row.mutatie}</TableCell>
                          <TableCell>{row.oud}</TableCell>
                          <TableCell className="font-semibold">{row.nieuw}</TableCell>
                          <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Betalingen tab */}
            {tab.betalingenData && (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Pers.nr</TableHead>
                        <TableHead className="w-32">Naam</TableHead>
                        <TableHead className="w-28">Type</TableHead>
                        <TableHead>Opmerking</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tab.betalingenData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">{row.persNr}</TableCell>
                          <TableCell className="font-medium">{row.naam}</TableCell>
                          <TableCell className="text-sm">{row.type}</TableCell>
                          <TableCell><EditableCell id={row.id} text={row.opmerking} /></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(row.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Reserveringen - empty */}
            {tab.count === 0 && !tab.bronData && !tab.uitdienstData && !tab.twkData && !tab.loonaangifteData && !tab.indienstData && !tab.betalingenData && (
              <Card className="shadow-sm">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                  <p>✅ Alle reserveringen in orde.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Regelbibliotheek mini-panel */}
      <Card className="shadow-sm border-muted">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">📚 12 actieve vertaalregels</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><code className="bg-muted px-1 rounded">P0003</code> → "Ingangsdatum functie ligt voor aanvang dienstverband..."</p>
            <p><code className="bg-muted px-1 rounded">P0012</code> → "Adresgegevens ontbreken..."</p>
            <p><code className="bg-muted px-1 rounded">P0047</code> → "Geboortedatum is niet ingevuld..."</p>
          </div>
          <Link to="/regels" className="text-xs text-primary hover:underline mt-2 inline-block">
            Bekijk alle regels →
          </Link>
        </CardContent>
      </Card>

      {/* Gecombineerd terugkoppelbestand */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Gecombineerd terugkoppelbestand
            </CardTitle>
            <Button className="gap-2 shadow-lg" onClick={handleExport}>
              <FileDown className="h-4 w-4" />
              Genereer Terugkoppelbestand
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-20">Pers.nr</TableHead>
                <TableHead className="w-32">Naam</TableHead>
                <TableHead className="w-36">Rapport</TableHead>
                <TableHead>Opmerking</TableHead>
                <TableHead className="w-28">Reactie klant</TableHead>
                <TableHead className="w-28">Reactie BCS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.terugkoppelbestand.map((row) => (
                <TableRow key={row.nr}>
                  <TableCell className="text-muted-foreground text-xs">{row.nr}</TableCell>
                  <TableCell className="font-mono text-xs">{row.persNr}</TableCell>
                  <TableCell className="text-xs font-medium">{row.naam}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs">{row.rapport}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-sm">{row.opmerking}</TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">_(leeg)_</TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">_(leeg)_</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2 pb-4">
        <span className="text-sm text-muted-foreground">
          Totaal: {data.terugkoppelTotaal} opmerkingen uit {data.tabs.length} rapporten
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => toast({ title: "Excel gedownload" })}>
            <Download className="h-3 w-3" /> Download als Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => toast({ title: "PDF gedownload" })}>
            <Download className="h-3 w-3" /> Download als PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText('Terugkoppelbestand gekopieerd'); toast({ title: "Gekopieerd naar klembord" }); }}>
            <Copy className="h-3 w-3" /> Kopieer
          </Button>
        </div>
      </div>
    </div>
  );
}
