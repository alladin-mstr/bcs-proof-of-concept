import axios from 'axios';
import type { Template, Field, ExtractionResponse, Region } from '../types';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

export async function uploadPdf(file: File): Promise<{ pdf_id: string; page_count: number; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/pdfs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export interface PdfInfo {
  pdf_id: string;
  filename: string;
  page_count: number;
}

export async function listPdfs(): Promise<PdfInfo[]> {
  const response = await api.get('/pdfs');
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
  mode: "single" | "comparison" = "single"
): Promise<Template> {
  const response = await api.post('/templates', { name, fields, mode });
  return response.data;
}

export async function listTemplates(): Promise<Template[]> {
  const response = await api.get('/templates');
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
  mode: "single" | "comparison" = "single"
): Promise<Template> {
  const response = await api.put(`/templates/${templateId}`, { name, fields, mode });
  return response.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.delete(`/templates/${templateId}`);
}

// Extract text from a single region of a PDF (used to auto-populate exact_match value)
export async function extractRegion(pdfId: string, region: Region): Promise<string> {
  const response = await api.post(`/pdfs/${pdfId}/extract-region`, region);
  return response.data.text;
}

// Auto-detect value format from a region of the PDF
export async function detectFormat(pdfId: string, region: Region): Promise<{ text: string; format: string }> {
  const response = await api.post(`/pdfs/${pdfId}/detect-format`, region);
  return response.data;
}

// Test extraction with current fields (no saved template needed)
export async function testExtraction(pdfId: string, fields: Field[], pdfIdB?: string): Promise<ExtractionResponse> {
  const body: Record<string, unknown> = { pdf_id: pdfId, fields };
  if (pdfIdB) body.pdf_id_b = pdfIdB;
  const response = await api.post('/test', body);
  return response.data;
}
