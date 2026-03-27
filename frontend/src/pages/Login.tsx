import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";
import bcsLogo from "@/assets/bcs-logo.svg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: "Inloggen mislukt",
        description: "Controleer je e-mailadres en wachtwoord.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Welkom terug!",
      description: "Je bent succesvol ingelogd.",
    });
    navigate("/");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#DE1380] to-[#a00d5e] relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 -left-20 w-80 h-80 rounded-full bg-white/5" />
          <div className="absolute bottom-20 right-10 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-white/5" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <img src={bcsLogo} alt="BCS" className="h-8 w-auto brightness-0 invert" />
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              Controle assistent
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Beheer en automatiseer al je controles op een plek.
              Upload rapporten, pas regels toe, en ontvang direct terugkoppeling.
            </p>
          </div>
          <p className="text-white/50 text-sm">
            &copy; {new Date().getFullYear()} BCS HR Software
          </p>
        </div>
      </div>

      {/* Right - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <img src={bcsLogo} alt="BCS" className="h-10 w-auto mx-auto mb-4" />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              Welkom terug
            </h2>
            <p className="text-muted-foreground mt-1">
              Log in op het Controle Platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                E-mailadres
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="naam@bcs-hr.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Wachtwoord
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-base font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Bezig met inloggen...
                </>
              ) : (
                <>
                  Inloggen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
