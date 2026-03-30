import axios from "axios";
import type { Template, Field, ExtractionResponse, Region, LayoutBlock, TestRun, TemplateRule, ComputedField, Controle, ControleRunResult } from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
});

export async function uploadPdf(
  file: File,
): Promise<{ pdf_id: string; page_count: number; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/pdfs/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export interface PdfInfo {
  pdf_id: string;
  filename: string;
  page_count: number;
}

export async function listPdfs(): Promise<PdfInfo[]> {
  const response = await api.get("/pdfs");
  return response.data;
}

export async function deletePdf(pdfId: string): Promise<void> {
  await api.delete(`/pdfs/${pdfId}`);
}

export function getPdfUrl(pdfId: string): string {
  return `${api.defaults.baseURL}/pdfs/${pdfId}`;
}

export async function createTemplate(
  name: string,
  fields: Field[],
  mode: "single" | "comparison" = "single",
  rules: TemplateRule[] = [],
  computed_fields: ComputedField[] = [],
  rule_graph?: { nodes: unknown[]; edges: unknown[] },
): Promise<Template> {
  const response = await api.post("/templates", { name, fields, mode, rules, computed_fields, rule_graph });
  return response.data;
}

export async function listTemplates(): Promise<Template[]> {
  const response = await api.get("/templates");
  return response.data;
}

export async function getTemplate(templateId: string): Promise<Template> {
  const response = await api.get(`/templates/${templateId}`);
  return response.data;
}

export async function updateTemplate(
  templateId: string,
  name: string,
  fields: Field[],
  mode: "single" | "comparison" = "single",
  rules: TemplateRule[] = [],
  computed_fields: ComputedField[] = [],
  rule_graph?: { nodes: unknown[]; edges: unknown[] },
): Promise<Template> {
  const response = await api.put(`/templates/${templateId}`, {
    name,
    fields,
    mode,
    rules,
    computed_fields,
    rule_graph,
  });
  return response.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.delete(`/templates/${templateId}`);
}

// Extract text from a single region of a PDF (used to auto-populate exact_match value)
export async function extractRegion(
  pdfId: string,
  region: Region,
): Promise<string> {
  const response = await api.post(`/pdfs/${pdfId}/extract-region`, region);
  return response.data.text;
}

// Auto-detect value format from a region of the PDF
export async function detectFormat(
  pdfId: string,
  region: Region,
): Promise<{ text: string; format: string }> {
  const response = await api.post(`/pdfs/${pdfId}/detect-format`, region);
  return response.data;
}

// Get layout blocks for a page of a PDF
export async function getPageLayout(pdfId: string, page: number, lineMargin: number = 1.0): Promise<LayoutBlock[]> {
  const response = await api.get(`/pdfs/${pdfId}/layout`, { params: { page, line_margin: lineMargin } });
  return response.data.blocks;
}

// Test extraction with current fields (no saved template needed)
export async function testExtraction(
  pdfId: string,
  fields: Field[],
  pdfIdB?: string,
  rules: TemplateRule[] = [],
  computed_fields: ComputedField[] = [],
): Promise<ExtractionResponse> {
  const body: Record<string, unknown> = { pdf_id: pdfId, fields, rules, computed_fields };
  if (pdfIdB) body.pdf_id_b = pdfIdB;
  const response = await api.post("/test", body);
  return response.data;
}

// --- Test Runs ---

export async function saveTestRun(data: {
  pdf_id: string;
  pdf_filename: string;
  template_name?: string;
  template_id?: string;
  entries: { label: string; value: string; status: string }[];
}): Promise<TestRun> {
  const response = await api.post("/test-runs", data);
  return response.data;
}

export async function listTestRuns(): Promise<TestRun[]> {
  const response = await api.get("/test-runs");
  return response.data;
}

export async function getTestRun(runId: string): Promise<TestRun> {
  const response = await api.get(`/test-runs/${runId}`);
  return response.data;
}

export async function deleteTestRun(runId: string): Promise<void> {
  await api.delete(`/test-runs/${runId}`);
}

// --- Cross-template field references ---

export interface TemplateFieldInfo {
  template_id: string;
  template_name: string;
  fields: { label: string; datatype?: string; computed?: boolean; field_type?: string; table_columns?: { id: string; label: string }[] }[];
}

export async function listAllTemplateFields(): Promise<TemplateFieldInfo[]> {
  const response = await api.get("/templates/all-fields");
  return response.data;
}

// --- Controles ---

export async function createControle(
  data: Omit<Controle, "id" | "createdAt" | "updatedAt">,
): Promise<Controle> {
  const response = await api.post("/controles", data);
  return response.data;
}

export async function getControle(id: string): Promise<Controle> {
  const response = await api.get(`/controles/${id}`);
  return response.data;
}

export async function updateControle(
  id: string,
  data: Partial<Controle>,
): Promise<Controle> {
  const response = await api.put(`/controles/${id}`, data);
  return response.data;
}

export async function listControles(): Promise<Controle[]> {
  const response = await api.get("/controles");
  return response.data;
}

export async function deleteControle(id: string): Promise<void> {
  await api.delete(`/controles/${id}`);
}

export async function runControle(
  controleId: string,
  files: Record<string, string>,
): Promise<ExtractionResponse[]> {
  const response = await api.post(`/controles/${controleId}/run`, { files });
  return response.data;
}

export async function listControleRuns(): Promise<ControleRunResult[]> {
  const response = await api.get("/controles/runs/all");
  return response.data;
}
