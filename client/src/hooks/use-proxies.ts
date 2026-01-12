import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type Proxy } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useProxies() {
  return useQuery({
    queryKey: [api.proxies.list.path],
    queryFn: async () => {
      const res = await fetch(api.proxies.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch proxies");
      return api.proxies.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateProxy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<Proxy, "id">) => {
      const res = await fetch(api.proxies.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add proxy");
      return api.proxies.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.proxies.list.path] });
      toast({ title: "Success", description: "Proxy added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add proxy", variant: "destructive" });
    },
  });
}

export function useDeleteProxy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.proxies.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete proxy");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.proxies.list.path] });
      toast({ title: "Success", description: "Proxy deleted successfully" });
    },
  });
}
