import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getControle, deleteControle } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Play, Trash2, FileText, Hash, GitBranch, Users } from "lucide-react";
import type { Controle } from "@/types";

export default function ControleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [controle, setControle] = useState<Controle | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getControle(id)
      .then(setControle)
      .catch(() => {
        toast({ title: "Controle niet gevonden", variant: "destructive" });
        navigate("/controles");
      });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteControle(id);
      toast({ title: "Controle verwijderd" });
      navigate("/controles");
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!controle) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Laden...
      </div>
    );
  }

  const totalFields = controle.files.reduce((sum, f) => sum + f.fields.length, 0);

  return (
    <div className="space-y-6">
      <HeaderAction>
        {controle.status === "published" && (
          <Button
            className="rounded-full"
            size="sm"
            onClick={() => navigate(`/controle/${id}/run`)}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Uitvoeren
          </Button>
        )}
        <Button
          variant="outline"
          className="rounded-full"
          size="sm"
          onClick={() => navigate(`/controle/${id}/edit`)}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Bewerken
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" size="sm">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Verwijderen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Controle verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je "{controle.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Verwijderen..." : "Verwijderen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </HeaderAction>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            {controle.status === "published" ? (
              <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                Gepubliceerd
              </Badge>
            ) : (
              <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                Concept
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bestanden</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{controle.files.length}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Velden</CardTitle>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <Hash className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{totalFields}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Regels</CardTitle>
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{controle.rules.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Timestamps */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>Aangemaakt: {formatDate(controle.createdAt)}</span>
        <span>Laatst gewijzigd: {formatDate(controle.updatedAt)}</span>
      </div>

      {/* Klant */}
      {controle.klantName && (
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Klant:</span>
          <Link
            to={`/klanten/${controle.klantId}`}
            className="font-medium text-primary hover:underline"
          >
            {controle.klantName}
          </Link>
        </div>
      )}

      {/* Files table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Bestanden</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead>Pagina's</TableHead>
                <TableHead>Velden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {controle.files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">{file.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.pdfFilename || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{file.pageCount}</TableCell>
                  <TableCell className="text-muted-foreground">{file.fields.length}</TableCell>
                </TableRow>
              ))}
              {controle.files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Geen bestanden</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Rules & Computed fields side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {controle.rules.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Regels</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controle.rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{rule.type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {controle.computedFields.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Berekende velden</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Formule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controle.computedFields.map((cf) => (
                    <TableRow key={cf.id}>
                      <TableCell className="font-medium">{cf.label}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {cf.formula}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
