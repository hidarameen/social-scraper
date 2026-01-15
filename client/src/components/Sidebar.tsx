import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ListTodo, 
  ScrollText, 
  Cookie, 
  Globe2, 
  Settings, 
  LogOut,
  ScanSearch,
  ChevronLeft,
  Menu
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/hooks/use-sidebar";

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { isOpen, toggle } = useSidebar();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Scraping Tasks", icon: ListTodo },
    { href: "/logs", label: "Execution Logs", icon: ScrollText },
    { href: "/cookies", label: "Platform Cookies", icon: Cookie },
    { href: "/proxies", label: "Proxies", icon: Globe2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className={clsx(
      "h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out",
      isOpen ? "w-64" : "w-20"
    )}>
      <div className={clsx("p-6 flex items-center justify-between", !isOpen && "flex-col gap-4")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ScanSearch size={24} />
          </div>
          {isOpen && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-bold text-lg tracking-tight">ScrapeMaster</h1>
              <p className="text-xs text-muted-foreground">Admin Console</p>
            </div>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggle}
          className="hover:bg-primary/10 text-muted-foreground hover:text-primary"
        >
          {isOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
        </Button>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;
          
          return (
            <Link key={link.href} href={link.href}>
              <div className={clsx(
                "sidebar-link cursor-pointer flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                !isOpen && "justify-center px-0"
              )}>
                <Icon size={20} className="shrink-0" />
                {isOpen && <span className="animate-in fade-in slide-in-from-left-1 duration-300">{link.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <Button 
          variant="ghost" 
          className={clsx(
            "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all",
            isOpen ? "justify-start" : "justify-center px-0"
          )}
          onClick={() => logout()}
        >
          <LogOut size={18} className={clsx(isOpen && "mr-2")} />
          {isOpen && <span className="animate-in fade-in duration-300">Sign Out</span>}
        </Button>
      </div>
    </div>
  );
}
