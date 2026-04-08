import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import PdfViewer from "@/components/PdfViewer";
import PdfUploader from "@/components/PdfUploader";
import { useAppStore } from "@/store/appStore";
import {
  getGlobalValueGroup,
  getGlobalValueTemplate,
  updateGlobalValueTemplate,
  uploadGlobalValuePdf,
  extractGlobalValues,
  confirmGlobalValues,
} from "@/api/client";
import type {
  GlobalValueGroup,
  GlobalValuePdfTemplate,
  ExtractionPreview,
} from "@/types";
import GlobalValueDiffPreview from "@/components/GlobalValueDiffPreview";

export default function GlobalValuePdfEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fields = useAppStore((s) => s.fields);
  const setFields = useAppStore((s) => s.setFields);
  const setPdf = useAppStore((s) => s.setPdf);
  const pdfId = useAppStore((s) => s.pdfId);

  const [group, setGroup] = useState<GlobalValueGroup | null>(null);
  const [template, setTemplate] = useState<GlobalValuePdfTemplate | null>(null);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const g = await getGlobalValueGroup(id);
      setGroup(g);
      if (g.templateId) {
        try {
          const t = await getGlobalValueTemplate(id);
          setTemplate(t);
          setPdf(t.pdfId, 0, t.filename);
          setFields(t.fields);
        } catch {
          setShowUploader(true);
        }
      } else {
        setShowUploader(true);
      }
    })();
  }, [id]);

  const handlePdfUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const result = await uploadGlobalValuePdf(id, file);
      setPdf(result.pdf_id, result.page_count, result.filename);
      const t = await getGlobalValueTemplate(id);
      setTemplate(t);
      setFields(t.fields);
      setShowUploader(false);
      // Auto-extract when fields already exist (re-upload scenario)
      if (t.fields.length > 0) {
        setExtracting(true);
        try {
          const extractResult = await extractGlobalValues(id);
          setPreview(extractResult);
        } finally {
          setExtracting(false);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSaveFields = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateGlobalValueTemplate(id, { fields });
      setTemplate(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!id) return;
    setExtracting(true);
    try {
      const result = await extractGlobalValues(id);
      setPreview(result);
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!id || !preview) return;
    setSaving(true);
    try {
      const updated = await confirmGlobalValues(id, preview.extractedValues);
      setGroup(updated);
      setPreview(null);
    } finally {
      setSaving(false);
    }
  };

  if (!group) {
    return <div className="p-8 text-center text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/controles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{group.name}</h1>
            <p className="text-sm text-muted-foreground">
              {template ? template.filename : "Geen PDF geupload"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {template && (
            <Button variant="outline" size="sm" onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Nieuw PDF uploaden
            </Button>
          )}
          {template && fields.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleSaveFields} disabled={saving}>
                {saving ? "Opslaan..." : "Velden opslaan"}
              </Button>
              <Button size="sm" onClick={handleExtract} disabled={extracting}>
                <Play className="h-4 w-4 mr-1" />
                {extracting ? "Extraheren..." : "Extractie uitvoeren"}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <GlobalValueDiffPreview
            preview={preview}
            onConfirm={handleConfirm}
            onCancel={() => setPreview(null)}
            saving={saving}
          />
        ) : showUploader || !pdfId ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-96">
              <PdfUploader onUpload={handlePdfUpload} uploading={uploading} />
            </div>
          </div>
        ) : (
          <PdfViewer />
        )}
      </div>
    </div>
  );
}
