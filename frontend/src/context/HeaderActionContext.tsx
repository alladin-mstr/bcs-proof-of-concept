import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

const HeaderActionContext = createContext<{
  portalTarget: HTMLDivElement | null;
  setPortalTarget: (el: HTMLDivElement | null) => void;
}>({ portalTarget: null, setPortalTarget: () => {} });

export function HeaderActionProvider({ children }: { children: ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  return (
    <HeaderActionContext.Provider value={{ portalTarget, setPortalTarget }}>
      {children}
    </HeaderActionContext.Provider>
  );
}

/** Slot in the header bar where actions will be portaled into */
export function HeaderActionSlot() {
  const { setPortalTarget } = useContext(HeaderActionContext);
  return <div ref={setPortalTarget} className="ml-auto flex items-center gap-2" />;
}

/** Use in pages to render action buttons into the header bar */
export function HeaderAction({ children }: { children: ReactNode }) {
  const { portalTarget } = useContext(HeaderActionContext);
  if (!portalTarget) return null;
  return createPortal(children, portalTarget);
}
