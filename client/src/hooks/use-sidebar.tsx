import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggle = () => setIsOpen((prev: boolean) => !prev);

  useEffect(() => {
    localStorage.setItem("sidebar-open", JSON.stringify(isOpen));
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
