import { ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { HeaderActionProvider, HeaderActionSlot } from "@/context/HeaderActionContext";

interface AppLayoutProps {
  children: ReactNode;
}

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/controle": "Nieuwe controle",
  "/controles": "Mijn controles",
  "/klanten": "Klanten",
  "/galerij": "Galerij",
  "/regels": "Regelbibliotheek",
  "/template/nieuw": "Nieuwe template",
  "/instellingen": "Instellingen",
  "/resultaten": "Resultaten",
};

function AppBreadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;

  const segments: { label: string; path: string }[] = [];

  if (routeLabels[pathname]) {
    segments.push({ label: routeLabels[pathname], path: pathname });
  } else {
    const parts = pathname.split("/").filter(Boolean);
    let builtPath = "";
    for (const part of parts) {
      builtPath += `/${part}`;
      const label = routeLabels[builtPath];
      if (label) {
        segments.push({ label, path: builtPath });
      } else {
        segments.push({ label: decodeURIComponent(part), path: builtPath });
      }
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <BreadcrumbItem key={segment.path}>
              {index > 0 && <BreadcrumbSeparator />}
              {isLast ? (
                <BreadcrumbPage className="font-medium">{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={segment.path} className="text-muted-foreground hover:text-foreground">
                    {segment.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <HeaderActionProvider>
        <div className="min-h-screen flex w-full bg-muted/30">
          <AppSidebar />
          <main className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b bg-background flex items-center gap-4 px-4 shrink-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground -ml-1" />
              <div className="h-5 w-px bg-border" />
              <AppBreadcrumbs />
              <HeaderActionSlot />
            </header>
            <div className="flex-1 overflow-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </HeaderActionProvider>
    </SidebarProvider>
  );
}
