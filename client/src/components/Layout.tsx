import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { useSidebar } from "@/hooks/use-sidebar";
import { clsx } from "clsx";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <main className={clsx(
        "flex-1 p-8 overflow-y-auto h-screen transition-all duration-300 ease-in-out",
        isOpen ? "ml-64" : "ml-20"
      )}>
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
