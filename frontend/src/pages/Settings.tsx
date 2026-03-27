import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Weergave / Thema */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Weergave</CardTitle>
          <CardDescription>
            Kies je voorkeursthema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
            className="grid grid-cols-3 gap-4"
          >
            <Label
              htmlFor="light"
              className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-muted data-[state=checked]:border-primary data-[state=checked]:bg-accent"
              data-state={theme === "light" ? "checked" : "unchecked"}
            >
              <RadioGroupItem value="light" id="light" className="sr-only" />
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 flex items-center justify-center shadow-lg">
                <Sun className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium">Licht</span>
            </Label>

            <Label
              htmlFor="dark"
              className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-muted data-[state=checked]:border-primary data-[state=checked]:bg-accent"
              data-state={theme === "dark" ? "checked" : "unchecked"}
            >
              <RadioGroupItem value="dark" id="dark" className="sr-only" />
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg">
                <Moon className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium">Donker</span>
            </Label>

            <Label
              htmlFor="system"
              className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-muted data-[state=checked]:border-primary data-[state=checked]:bg-accent"
              data-state={theme === "system" ? "checked" : "unchecked"}
            >
              <RadioGroupItem value="system" id="system" className="sr-only" />
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-lg">
                <Monitor className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium">Systeem</span>
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Notificaties */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Notificaties</CardTitle>
          <CardDescription>
            Bepaal wanneer je meldingen ontvangt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-deviations" className="flex flex-col gap-1">
              <span className="font-medium">Afwijkingen melden</span>
              <span className="font-normal text-sm text-muted-foreground">
                Ontvang een melding bij gevonden afwijkingen
              </span>
            </Label>
            <Switch id="notify-deviations" defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-complete" className="flex flex-col gap-1">
              <span className="font-medium">Taak voltooid</span>
              <span className="font-normal text-sm text-muted-foreground">
                Melding wanneer een taak is afgerond
              </span>
            </Label>
            <Switch id="notify-complete" defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Gedrag */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Gedrag</CardTitle>
          <CardDescription>
            Pas het gedrag van de applicatie aan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="compact-view" className="flex flex-col gap-1">
              <span className="font-medium">Compacte weergave</span>
              <span className="font-normal text-sm text-muted-foreground">
                Toon taken in een compactere lijst
              </span>
            </Label>
            <Switch id="compact-view" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-run" className="flex flex-col gap-1">
              <span className="font-medium">Automatisch uitvoeren</span>
              <span className="font-normal text-sm text-muted-foreground">
                Start controle direct na uploaden
              </span>
            </Label>
            <Switch id="auto-run" />
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Over BCS Taakbouwer</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Versie:</strong> 1.0.0 (Prototype)</p>
          <p><strong className="text-foreground">Ontwikkeld door:</strong> BCS Development Team</p>
          <p className="pt-2">
            Dit is een prototype applicatie. Alle data wordt lokaal opgeslagen en
            verdwijnt bij het herladen van de pagina.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
