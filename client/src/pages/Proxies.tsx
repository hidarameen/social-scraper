import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useProxies, useCreateProxy, useDeleteProxy } from "@/hooks/use-proxies";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platforms } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Globe } from "lucide-react";

export default function Proxies() {
  const { data: proxies, isLoading } = useProxies();
  const createProxy = useCreateProxy();
  const deleteProxy = useDeleteProxy();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !url) return;
    
    await createProxy.mutateAsync({
      userId: user.id,
      url,
      platform: platform as any,
    });
    setIsOpen(false);
    setUrl("");
    setPlatform(undefined);
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proxy Management</h1>
          <p className="text-muted-foreground">Configure proxies to avoid IP blocks.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} /> Add Proxy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Proxy</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Proxy URL</label>
                <Input 
                  placeholder="http://user:pass@host:port" 
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Specific Platform (Optional)</label>
                <Select 
                  value={platform || "all"} 
                  onValueChange={(val) => setPlatform(val === "all" ? undefined : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {platforms.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createProxy.isPending}>
                Add Proxy
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proxy URL</TableHead>
              <TableHead>Assigned Platform</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : proxies?.map((proxy) => (
              <TableRow key={proxy.id}>
                <TableCell className="font-mono text-sm">{proxy.url}</TableCell>
                <TableCell className="capitalize">
                  {proxy.platform ? (
                    <span className="flex items-center gap-2">
                      <Globe size={14} /> {proxy.platform}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Global</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => deleteProxy.mutate(proxy.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && proxies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No proxies configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
