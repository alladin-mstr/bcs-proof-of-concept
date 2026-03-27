import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Template, Client, ControlRun, Team, TaskResult, Deviation, TaskType, TranslationRule } from '@/types/task';
import {
  defaultTeams,
  controleurs,
  sampleTemplates,
  sampleClients,
  sampleControlRuns,
  translationRules,
} from '@/data/demo-data';

interface TaskContextType {
  // Team state
  teams: Team[];
  currentTeamId: string;
  setCurrentTeamId: (teamId: string) => void;
  currentTeam: Team | undefined;
  
  // Templates
  templates: Template[];
  addTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'teamId'>) => Template;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;
  getTeamTemplates: () => Template[];
  getSharedTemplates: () => Template[];
  getAllTemplates: () => Template[];
  
  // Clients
  clients: Client[];
  addClient: (name: string) => Client;
  deleteClient: (id: string) => void;
  getTeamClients: () => Client[];
  getAllClients: () => Client[];
  getClientById: (id: string) => Client | undefined;
  
  // Control runs
  controlRuns: ControlRun[];
  runControl: (templateId: string, clientId: string) => Promise<TaskResult>;
  getClientControlRuns: (clientId: string) => ControlRun[];
  getTeamControlRuns: () => ControlRun[];
  getAllControlRuns: () => ControlRun[];
  getControlRunById: (id: string) => ControlRun | undefined;
  
  // Translation rules
  translationRules: TranslationRule[];

  // Current user
  currentUser: string;
  
  // Current result
  currentResult: TaskResult | null;
  setCurrentResult: (result: TaskResult | null) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [teams] = useState<Team[]>(defaultTeams);
  const [currentTeamId, setCurrentTeamId] = useState<string>('polaris');
  const [templates, setTemplates] = useState<Template[]>(sampleTemplates);
  const [clients, setClients] = useState<Client[]>(sampleClients);
  const [controlRuns, setControlRuns] = useState<ControlRun[]>(sampleControlRuns);
  const [rules] = useState<TranslationRule[]>(translationRules);
  const [currentResult, setCurrentResult] = useState<TaskResult | null>(null);
  const currentUser = 'Nikki';

  const currentTeam = teams.find(t => t.id === currentTeamId);

  // Templates
  const getTeamTemplates = () => templates.filter(t => t.teamId === currentTeamId);
  const getSharedTemplates = () => templates.filter(t => t.isShared && t.teamId !== currentTeamId);
  const getAllTemplates = () => templates;

  const addTemplate = (templateData: Omit<Template, 'id' | 'createdAt' | 'teamId'>): Template => {
    const newTemplate: Template = {
      ...templateData,
      id: `template-${Date.now()}`,
      createdAt: new Date(),
      teamId: currentTeamId,
    };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  const updateTemplate = (id: string, updates: Partial<Template>) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  // Clients
  const getTeamClients = () => clients.filter(c => c.teamId === currentTeamId);
  const getAllClients = () => clients;
  const getClientById = (id: string) => clients.find(c => c.id === id);

  const addClient = (name: string): Client => {
    const newClient: Client = {
      id: `client-${Date.now()}`,
      name,
      createdAt: new Date(),
      teamId: currentTeamId,
    };
    setClients(prev => [...prev, newClient]);
    return newClient;
  };

  const deleteClient = (id: string) => {
    setClients(prev => prev.filter(c => c.id !== id));
  };

  // Control runs
  const getTeamControlRuns = () => controlRuns
    .filter(r => r.teamId === currentTeamId)
    .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
  const getAllControlRuns = () => controlRuns
    .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
  const getClientControlRuns = (clientId: string) => 
    controlRuns.filter(r => r.clientId === clientId).sort((a, b) => 
      new Date(b.runAt).getTime() - new Date(a.runAt).getTime()
    );
  const getControlRunById = (id: string) => controlRuns.find(r => r.id === id);

  const runControl = async (templateId: string, clientId: string): Promise<TaskResult> => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const template = templates.find(t => t.id === templateId);
    const client = clients.find(c => c.id === clientId);
    
    if (!template || !client) throw new Error('Template or client not found');

    const totalRows = Math.floor(Math.random() * 100) + 30;
    const deviationCount = Math.floor(Math.random() * 5);
    
    const sampleDeviations: Deviation[] = [];
    const names = ['M. Bakker', 'P. Jansen', 'K. de Vries', 'A. Smit', 'L. Pietersen'];
    const fields = ['Uren per week', 'Bruto salaris', 'Startdatum', 'Afdeling', 'Functie'];

    for (let i = 0; i < deviationCount; i++) {
      sampleDeviations.push({
        id: `dev-${Date.now()}-${i}`,
        identifier: names[i % names.length],
        fieldName: fields[i % fields.length],
        leftValue: `€${(Math.random() * 5000 + 2000).toFixed(2)}`,
        rightValue: `€${(Math.random() * 5000 + 2000).toFixed(2)}`,
        rule: 'exact',
      });
    }

    const teamControleur = controleurs.find(c => c.teamId === currentTeamId);

    const newRun: ControlRun = {
      id: `run-${Date.now()}`,
      templateId,
      templateName: template.name,
      clientId,
      clientName: client.name,
      controleurId: teamControleur?.id,
      controleurName: teamControleur?.name || currentUser,
      runAt: new Date(),
      totalRows,
      deviations: sampleDeviations,
      status: deviationCount === 0 ? 'success' : deviationCount > 3 ? 'error' : 'warning',
      teamId: currentTeamId,
      bevindingen: deviationCount,
    };

    setControlRuns(prev => [newRun, ...prev]);
    updateTemplate(templateId, { lastUsed: new Date() });

    const result: TaskResult = {
      taskId: newRun.id,
      taskName: template.name,
      clientName: client.name,
      runAt: newRun.runAt,
      totalRows: newRun.totalRows,
      deviations: newRun.deviations,
      status: newRun.status,
    };

    setCurrentResult(result);
    return result;
  };

  return (
    <TaskContext.Provider value={{
      teams,
      currentTeamId,
      setCurrentTeamId,
      currentTeam,
      templates,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      getTeamTemplates,
      getSharedTemplates,
      getAllTemplates,
      clients,
      addClient,
      deleteClient,
      getTeamClients,
      getAllClients,
      getClientById,
      controlRuns,
      runControl,
      getClientControlRuns,
      getTeamControlRuns,
      getAllControlRuns,
      getControlRunById,
      translationRules: rules,
      currentUser,
      currentResult,
      setCurrentResult,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext() {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
}
