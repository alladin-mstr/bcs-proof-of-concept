import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TaskProvider } from "@/context/TaskContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import NewControl from "./pages/NewControl";
import NewTemplate from "./pages/NewTemplate";
import Gallery from "./pages/Gallery";
import Settings from "./pages/Settings";
import Results from "./pages/Results";
import RuleLibrary from "./pages/RuleLibrary";
import MyControls from "./pages/MyControls";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="bcs-ui-theme">
      <TooltipProvider>
        <AuthProvider>
          <TaskProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
                <Route path="/klanten" element={<ProtectedPage><Clients /></ProtectedPage>} />
                <Route path="/klanten/:clientId" element={<ProtectedPage><ClientDetail /></ProtectedPage>} />
                <Route path="/controle" element={<ProtectedPage><NewControl /></ProtectedPage>} />
                <Route path="/controles" element={<ProtectedPage><MyControls /></ProtectedPage>} />
                <Route path="/template/nieuw" element={<ProtectedPage><NewTemplate /></ProtectedPage>} />
                <Route path="/galerij" element={<ProtectedPage><Gallery /></ProtectedPage>} />
                <Route path="/regels" element={<ProtectedPage><RuleLibrary /></ProtectedPage>} />
                <Route path="/instellingen" element={<ProtectedPage><Settings /></ProtectedPage>} />
                <Route path="/resultaten/:taskId" element={<ProtectedPage><Results /></ProtectedPage>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TaskProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
