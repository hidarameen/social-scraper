import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useCookies, useCreateCookie, useDeleteCookie } from "@/hooks/use-cookies";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { platforms, type InsertCookie } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Cookies() {
  const { data: cookies, isLoading } = useCookies();
  const createCookie = useCreateCookie();
  const deleteCookie = useDeleteCookie();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<InsertCookie>>({ platform: "twitter", name: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.platform || !formData.name || !formData.value) return;
    
    await createCookie.mutateAsync({
      userId: user.id,
      platform: formData.platform as any,
      name: formData.name,
      value: formData.value,
    });
    setIsOpen(false);
    setFormData({ platform: "twitter", name: "", value: "" });
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cookie Manager</h1>
          <p className="text-muted-foreground">Store authentication cookies for platforms.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} /> Add Cookie
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Cookie</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Platform</label>
                <Select 
                  value={formData.platform} 
                  onValueChange={(val) => setFormData({...formData, platform: val as any})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Account Name</label>
                <Input 
                  placeholder="e.g. My Bot Account" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Cookie String (JSON or Netscape)</label>
                <Textarea 
                  placeholder="Paste cookies here..." 
                  className="font-mono text-xs min-h-[150px]"
                  value={formData.value}
                  onChange={e => setFormData({...formData, value: e.target.value})}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={createCookie.isPending}>
                Save Cookie
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-10">Loading cookies...</div>
        ) : cookies?.map((cookie) => (
          <Card key={cookie.id} className="glass-panel">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="capitalize flex items-center gap-2">
                  {cookie.platform}
                  <Lock size={14} className="text-muted-foreground" />
                </CardTitle>
                <CardDescription>{cookie.name}</CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground hover:text-destructive"
                onClick={() => deleteCookie.mutate(cookie.id)}
              >
                <Trash2 size={16} />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-black/20 p-2 rounded text-xs font-mono text-muted-foreground truncate">
                {cookie.value.substring(0, 40)}...
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && cookies?.length === 0 && (
          <div className="col-span-3 text-center py-12 border-2 border-dashed border-border rounded-xl">
            <p className="text-muted-foreground">No cookies configured.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
