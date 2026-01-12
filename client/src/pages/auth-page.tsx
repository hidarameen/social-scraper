import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function AuthPage() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary mb-4">
            <Activity size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ScrapeMaster</h1>
          <p className="text-muted-foreground">Professional Social Media Monitoring Dashboard</p>
        </div>

        <Card className="glass-panel border-white/5">
          <CardHeader className="text-center">
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Sign in to access your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLogin} className="w-full py-6 text-lg font-medium">
              Login with Replit
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Secure authentication powered by Replit Auth
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
