import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Setting } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useSettings() {
  return useQuery({
    queryKey: [api.settings.list.path],
    queryFn: async () => {
      const res = await fetch(api.settings.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return api.settings.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<Setting, "id">) => {
      const res = await fetch(api.settings.update.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return api.settings.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.settings.list.path] });
      toast({ title: "Success", description: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });
}
