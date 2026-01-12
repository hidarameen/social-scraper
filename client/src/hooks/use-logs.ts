import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useLogs(taskId?: number) {
  return useQuery({
    queryKey: [api.logs.list.path, taskId],
    queryFn: async () => {
      // Build query string if taskId exists
      const path = taskId 
        ? `${api.logs.list.path}?taskId=${taskId}` 
        : api.logs.list.path;
        
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Live poll for logs
  });
}
