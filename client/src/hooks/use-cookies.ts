import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type Cookie } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useCookies() {
  return useQuery({
    queryKey: [api.cookies.list.path],
    queryFn: async () => {
      const res = await fetch(api.cookies.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cookies");
      return api.cookies.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateCookie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<Cookie, "id">) => {
      const res = await fetch(api.cookies.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create cookie");
      return api.cookies.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.cookies.list.path] });
      toast({ title: "Success", description: "Cookie added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add cookie", variant: "destructive" });
    },
  });
}

export function useDeleteCookie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.cookies.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete cookie");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.cookies.list.path] });
      toast({ title: "Success", description: "Cookie deleted successfully" });
    },
  });
}
