import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Pencil, Play, Trash2, FileText, Hash, GitBranch } from "lucide-react";
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="mt-1">
              {controle.status === "published" ? (
                <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                  Gepubliceerd
                </Badge>
              ) : (
                <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                  Concept
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Bestanden
            </div>
            <div className="mt-1 text-2xl font-semibold">{controle.files.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Hash className="h-3.5 w-3.5" /> Velden
            </div>
            <div className="mt-1 text-2xl font-semibold">{totalFields}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" /> Regels
            </div>
            <div className="mt-1 text-2xl font-semibold">{controle.rules.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Timestamps */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>Aangemaakt: {formatDate(controle.createdAt)}</span>
        <span>Laatst gewijzigd: {formatDate(controle.updatedAt)}</span>
      </div>

      {/* Files table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bestanden</CardTitle>
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
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Geen bestanden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Rules table */}
      {controle.rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regels</CardTitle>
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

      {/* Computed fields */}
      {controle.computedFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Berekende velden</CardTitle>
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
  );
}
