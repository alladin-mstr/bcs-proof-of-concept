import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search, Plus, Loader2, FileText, Upload, CheckCircle, AlertTriangle, Database, List } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTaskContext } from "@/context/TaskContext";
import { TaskTypeIcon, getTaskTypeLabel } from "@/components/tasks/TaskTypeIcon";
import { cn } from "@/lib/utils";
import { Template, Client, ReportSlot } from "@/types/task";

type Step = 'template' | 'client' | 'upload' | 'result';
type UploadMode = 'multi' | 'step';

export default function NewControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    getTeamTemplates, 
    getTeamClients, 
    addClient, 
    runControl,
    currentResult 
  } = useTaskContext();

  const [currentStep, setCurrentStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('multi');
  const [stepIndex, setStepIndex] = useState(0);
  
  // Files keyed by report id or legacy keys
  const [files, setFiles] = useState<Record<string, File>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);

  const templates = getTeamTemplates();
  const clients = getTeamClients();

  // Get report slots from template (or generate legacy slots)
  const getReportSlots = (): ReportSlot[] => {
    if (!selectedTemplate) return [];
    
    // If template has multi-rapport support
    if (selectedTemplate.reports && selectedTemplate.reports.length > 0) {
      return selectedTemplate.reports;
    }
    
    // Legacy: generate slots from old labels
    if (selectedTemplate.type === 'comparison') {
      return [
        { id: 'left', name: selectedTemplate.leftDocumentLabel || 'Bronbestand', isRequired: true },
        { id: 'right', name: selectedTemplate.rightDocumentLabel || 'Controlebestand', isRequired: true },
      ];
    }
    return [
      { id: 'single', name: selectedTemplate.singleDocumentLabel || 'Bestand', isRequired: true },
    ];
  };

  const reportSlots = getReportSlots();
  const requiredSlots = reportSlots.filter(r => r.isRequired);
  const uploadedCount = Object.keys(files).filter(k => reportSlots.some(r => r.id === k)).length;
  const requiredUploaded = requiredSlots.filter(r => files[r.id]).length;

  // Pre-select client if provided in URL
  useEffect(() => {
    const clientIdParam = searchParams.get('client');
    if (clientIdParam) {
      const client = clients.find(c => c.id === clientIdParam);
      if (client) {
        setSelectedClient(client);
      }
    }
  }, [searchParams, clients]);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setCurrentStep('client');
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setCurrentStep('upload');
  };

  const handleAddClient = () => {
    if (newClientName.trim()) {
      const newClient = addClient(newClientName.trim());
      setSelectedClient(newClient);
      setNewClientName("");
      setShowNewClientDialog(false);
      setCurrentStep('upload');
    }
  };

  const handleFileChange = (reportId: string, file: File) => {
    setFiles(prev => ({ ...prev, [reportId]: file }));
  };

  const isUploadReady = requiredUploaded === requiredSlots.length;

  const handleRunControl = async () => {
    if (!selectedTemplate || !selectedClient) return;
    
    setIsRunning(true);
    try {
      await runControl(selectedTemplate.id, selectedClient.id);
      setCurrentStep('result');
    } catch (error) {
      console.error('Error running control:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const goBack = () => {
    switch (currentStep) {
      case 'client':
        setCurrentStep('template');
        setSelectedTemplate(null);
        break;
      case 'upload':
        if (uploadMode === 'step' && stepIndex > 0) {
          setStepIndex(stepIndex - 1);
        } else {
          setCurrentStep('client');
          setSelectedClient(null);
          setFiles({});
          setStepIndex(0);
        }
        break;
      case 'result':
        setCurrentStep('template');
        setSelectedTemplate(null);
        setSelectedClient(null);
        setFiles({});
        setStepIndex(0);
        break;
    }
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

  // Step 1: Template Selection
  const renderTemplateStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Welke controle wil je uitvoeren?</h2>
      </div>

      {templates.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium text-foreground">Nog geen templates</p>
            <p className="text-sm text-muted-foreground mt-1">Maak eerst een template aan</p>
            <Button asChild className="mt-6 rounded-full">
              <a href="/template/nieuw">
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe template maken
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-primary/50"
              onClick={() => handleSelectTemplate(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TaskTypeIcon type={template.type} buildingBlock={template.buildingBlock} className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{template.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {getTaskTypeLabel(template.type, template.buildingBlock)}
                      </Badge>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{template.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{template.reports?.length || (template.type === 'comparison' ? 2 : 1)} rapporten</span>
                      <span>•</span>
                      <span>Laatst: {formatLastUsed(template.lastUsed)}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-center pt-4">
        <Button variant="link" asChild>
          <a href="/template/nieuw">
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe template maken
          </a>
        </Button>
      </div>
    </div>
  );

  // Step 2: Client Selection
  const renderClientStep = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      <div>
        <Badge variant="outline" className="mb-2">{selectedTemplate?.name}</Badge>
        <h2 className="text-2xl font-semibold">Voor welke klant?</h2>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek of selecteer klant..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <RadioGroup
        value={selectedClient?.id}
        onValueChange={(id) => {
          const client = clients.find(c => c.id === id);
          if (client) handleSelectClient(client);
        }}
        className="space-y-2"
      >
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => handleSelectClient(client)}
          >
            <RadioGroupItem value={client.id} id={client.id} />
            <Label htmlFor={client.id} className="flex-1 cursor-pointer">
              <span className="font-medium">{client.name}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <Button 
        variant="outline" 
        className="w-full" 
        onClick={() => setShowNewClientDialog(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Nieuwe klant toevoegen
      </Button>

      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe klant toevoegen</DialogTitle>
            <DialogDescription>
              Voeg een nieuwe klant toe aan je team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Klantnaam</Label>
              <Input
                id="new-client-name"
                placeholder="Bijv. Bakkerij Jansen"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClientDialog(false)}>
              Annuleren
            </Button>
            <Button onClick={handleAddClient} disabled={!newClientName.trim()}>
              Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Step 3: Multi-Upload Mode
  const renderMultiUploadStep = () => {
    const FileUploadCard = ({ 
      report,
      file,
    }: { 
      report: ReportSlot;
      file?: File;
    }) => (
      <Card className={cn(
        "border-2 transition-colors",
        file ? "border-success bg-success/5" : report.isRequired ? "border-dashed" : "border-dashed border-muted"
      )}>
        <CardContent className="p-4">
          <label className="cursor-pointer flex flex-col items-center text-center min-h-[120px] justify-center">
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={(e) => e.target.files?.[0] && handleFileChange(report.id, e.target.files[0])}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-success mb-2" />
                <p className="font-medium text-sm truncate max-w-full">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">Klik om te wijzigen</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="font-medium text-sm">{report.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {report.isRequired ? 'Verplicht' : 'Optioneel'}
                </p>
              </>
            )}
          </label>
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-1">
            {selectedTemplate?.name} — {selectedClient?.name}
          </p>
          <h2 className="text-2xl font-semibold">Upload je rapporten</h2>
        </div>

        {/* Upload Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {reportSlots.map((report) => (
            <FileUploadCard
              key={report.id}
              report={report}
              file={files[report.id]}
            />
          ))}
        </div>

        {/* Progress */}
        <div className="text-center text-sm text-muted-foreground">
          {uploadedCount} van {reportSlots.length} rapporten geüpload
          {requiredSlots.length > 0 && requiredUploaded < requiredSlots.length && (
            <span className="text-destructive ml-2">
              ({requiredSlots.length - requiredUploaded} verplicht nog nodig)
            </span>
          )}
        </div>

        {/* Database hint */}
        <div className="flex items-center justify-center gap-2 p-3 bg-muted/30 rounded-lg">
          <span className="text-sm text-muted-foreground">Of binnenkort:</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 opacity-50 cursor-not-allowed" disabled>
                  <Database className="h-4 w-4" />
                  Haal op uit database
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Directe koppeling met je salarissysteem</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadMode('step')}
            className="gap-2"
          >
            <List className="h-4 w-4" />
            Stap-voor-stap modus
          </Button>

          <Button
            size="lg"
            disabled={!isUploadReady || isRunning}
            onClick={handleRunControl}
            className="rounded-full min-w-48"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Controle uitvoeren...
              </>
            ) : (
              <>
                Start controle
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>

        {isRunning && (
          <div className="text-center text-sm text-muted-foreground animate-pulse">
            AI analyseert de documenten...
          </div>
        )}
      </div>
    );
  };

  // Step 3b: Step-by-step Upload Mode
  const renderStepUploadStep = () => {
    const currentReport = reportSlots[stepIndex];
    if (!currentReport) return null;

    const file = files[currentReport.id];
    const isLastStep = stepIndex === reportSlots.length - 1;
    const canSkip = !currentReport.isRequired;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {stepIndex === 0 ? 'Terug' : 'Vorige'}
          </Button>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-1">
            Stap {stepIndex + 1} van {reportSlots.length}
          </p>
          <h2 className="text-2xl font-semibold">{currentReport.name}</h2>
          {!currentReport.isRequired && (
            <Badge variant="outline" className="mt-2">Optioneel</Badge>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${((stepIndex + 1) / reportSlots.length) * 100}%` }}
          />
        </div>

        {/* Upload zone */}
        <Card className={cn(
          "border-2 border-dashed",
          file && "border-success bg-success/5"
        )}>
          <CardContent className="py-16">
            <label className="cursor-pointer flex flex-col items-center text-center">
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => e.target.files?.[0] && handleFileChange(currentReport.id, e.target.files[0])}
              />
              {file ? (
                <>
                  <FileText className="h-16 w-16 text-success mb-4" />
                  <p className="text-lg font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">Klik om te wijzigen</p>
                </>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Sleep je bestand hier</p>
                  <p className="text-sm text-muted-foreground mt-1">of klik om te bladeren</p>
                  <p className="text-xs text-muted-foreground mt-4">PDF, Excel (.xlsx)</p>
                </>
              )}
            </label>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <Button
            variant="ghost"
            onClick={() => setUploadMode('multi')}
            className="gap-2"
          >
            Naar multi-upload
          </Button>

          <div className="flex gap-2">
            {canSkip && !file && (
              <Button
                variant="outline"
                onClick={() => {
                  if (isLastStep) {
                    if (isUploadReady) handleRunControl();
                  } else {
                    setStepIndex(stepIndex + 1);
                  }
                }}
              >
                Overslaan
              </Button>
            )}
            <Button
              onClick={() => {
                if (isLastStep) {
                  if (isUploadReady) handleRunControl();
                } else {
                  setStepIndex(stepIndex + 1);
                }
              }}
              disabled={(!file && currentReport.isRequired) || isRunning}
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Bezig...
                </>
              ) : isLastStep ? (
                <>
                  Start controle
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Volgende
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Step 4: Result
  const renderResultStep = () => {
    const result = currentResult;
    if (!result) return null;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {selectedTemplate?.name} — {selectedClient?.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date(result.runAt).toLocaleDateString('nl-NL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Summary Card */}
        <Card className={cn(
          "border-2",
          result.status === 'success' && "border-success bg-success/5",
          result.status === 'warning' && "border-warning bg-warning/5",
          result.status === 'error' && "border-destructive bg-destructive/5"
        )}>
          <CardContent className="py-8 text-center">
            {result.status === 'success' ? (
              <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
            ) : (
              <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-3" />
            )}
            <p className="text-2xl font-bold">
              {result.deviations.length === 0
                ? 'Alles in orde!'
                : `${result.deviations.length} afwijkingen gevonden`}
            </p>
            <p className="text-muted-foreground mt-1">
              {result.totalRows} rijen gecontroleerd
            </p>
          </CardContent>
        </Card>

        {/* Deviations */}
        {result.deviations.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Afwijkingen</h3>
            {result.deviations.map((dev) => (
              <Card key={dev.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{dev.identifier}</p>
                      <p className="text-sm text-muted-foreground">
                        {dev.fieldName}: {dev.leftValue} → {dev.rightValue}
                      </p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 justify-center pt-4">
          <Button variant="outline" onClick={goBack}>
            Opnieuw controleren
          </Button>
          <Button variant="outline">
            Exporteer rapport
          </Button>
          <Button onClick={() => navigate(`/klanten/${selectedClient?.id}`)}>
            Terug naar klant
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      {currentStep === 'template' && renderTemplateStep()}
      {currentStep === 'client' && renderClientStep()}
      {currentStep === 'upload' && (uploadMode === 'multi' ? renderMultiUploadStep() : renderStepUploadStep())}
      {currentStep === 'result' && renderResultStep()}
    </div>
  );
}
