import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import TemplateBuilder from "@/components/TemplateBuilder";

interface WizardFileTabProps {
  fileId: string;
}

export function WizardFileTab({ fileId }: WizardFileTabProps) {
  const loadFileIntoStore = useAppStore((s) => s.loadFileIntoStore);
  const saveCurrentFileToWizard = useAppStore((s) => s.saveCurrentFileToWizard);
  const prevFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Save previous file before loading new one
    if (prevFileIdRef.current && prevFileIdRef.current !== fileId) {
      saveCurrentFileToWizard();
    }
    loadFileIntoStore(fileId);
    prevFileIdRef.current = fileId;
  }, [fileId, loadFileIntoStore, saveCurrentFileToWizard]);

  // Save on unmount
  useEffect(() => {
    return () => {
      saveCurrentFileToWizard();
    };
  }, [saveCurrentFileToWizard]);

  return <TemplateBuilder embedded />;
}
