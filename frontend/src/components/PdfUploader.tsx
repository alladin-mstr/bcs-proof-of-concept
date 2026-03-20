import { useState, useCallback } from 'react';
import { uploadPdf } from '../api/client';
import { useAppStore } from '../store/appStore';

export default function PdfUploader() {
  const setPdf = useAppStore((s) => s.setPdf);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        setError('Please upload a PDF file.');
        return;
      }
      setError(null);
      setIsUploading(true);
      try {
        const { pdf_id, page_count } = await uploadPdf(file);
        setPdf(pdf_id, page_count);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Upload failed. Is the backend running?';
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [setPdf]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      for (const file of Array.from(e.dataTransfer.files)) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(e.target.files ?? [])) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="flex items-center justify-center h-full">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          flex flex-col items-center justify-center w-full max-w-lg p-12
          border-2 border-dashed rounded-2xl cursor-pointer transition-colors
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'}
        `}
        onClick={() => document.getElementById('pdf-file-input')?.click()}
      >
        <svg
          className="w-12 h-12 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        {isUploading ? (
          <p className="text-gray-600 font-medium">Uploading...</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium mb-1">
              Drop a PDF here or click to upload
            </p>
            <p className="text-gray-400 text-sm">PDF files only</p>
          </>
        )}
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        <input
          id="pdf-file-input"
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={onFileInput}
        />
      </div>
    </div>
  );
}
