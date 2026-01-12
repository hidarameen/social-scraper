import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ListTodo, 
  ScrollText, 
  Cookie, 
  Globe2, 
  Settings, 
  LogOut,
  ScanSearch
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Scraping Tasks", icon: ListTodo },
    { href: "/logs", label: "Execution Logs", icon: ScrollText },
    { href: "/cookies", label: "Platform Cookies", icon: Cookie },
    { href: "/proxies", label: "Proxies", icon: Globe2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
          <ScanSearch size={24} />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">ScrapeMaster</h1>
          <p className="text-xs text-muted-foreground">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;
          
          return (
            <Link key={link.href} href={link.href}>
              <div className={clsx("sidebar-link cursor-pointer", isActive && "active")}>
                <Icon size={20} />
                <span>{link.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => logout()}
        >
          <LogOut size={18} className="mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
