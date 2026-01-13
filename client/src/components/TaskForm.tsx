import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask, platforms, scrapeMethods } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useAuth } from "@/hooks/use-auth";

interface TaskFormProps {
  task?: InsertTask & { id?: number, messageTemplate?: string | null };
  onSuccess?: () => void;
}

export function TaskForm({ task, onSuccess }: TaskFormProps) {
  const { user } = useAuth();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      userId: user?.id,
      platform: task?.platform || "twitter",
      url: task?.url || "",
      target: task?.target || "",
      interval: task?.interval || 60,
      postLimit: task?.postLimit || 10,
      scrapeMethod: task?.scrapeMethod || "html",
      status: task?.status || "active",
      messageTemplate: (task as any)?.messageTemplate || "<b>[ScrapeMaster]</b>\nAccount: {account}\nPlatform: {platform}\nDate: {date}\n\n{text}\n\n<a href=\"{url}\">View Post</a>",
    },
  });

  const onSubmit = async (data: InsertTask) => {
    try {
      if (task?.id) {
        await updateTask.mutateAsync({ id: task.id, ...data });
      } else {
        await createTask.mutateAsync(data);
      }
      onSuccess?.();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="platform"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Platform</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target URL</FormLabel>
              <FormControl>
                <Input placeholder="https://twitter.com/username" {...field} />
              </FormControl>
              <FormDescription>The profile or page URL to monitor.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="scrapeMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Method</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || "html"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {scrapeMethods.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="target"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telegram Chat ID</FormLabel>
                <FormControl>
                  <Input placeholder="@channelname" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="interval"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check Interval: {field.value} minutes</FormLabel>
              <FormControl>
                <Slider
                  min={5}
                  max={1440}
                  step={5}
                  defaultValue={[field.value || 60]}
                  onValueChange={(vals) => field.onChange(vals[0])}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="postLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Posts to Check: {field.value}</FormLabel>
              <FormControl>
                <Slider
                  min={1}
                  max={50}
                  step={1}
                  defaultValue={[field.value || 10]}
                  onValueChange={(vals) => field.onChange(vals[0])}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="messageTemplate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telegram Message Template</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Enter template..." 
                  className="min-h-[120px] font-mono text-xs"
                  {...field} 
                  value={field.value || ""} 
                />
              </FormControl>
              <FormDescription>
                Placeholders: &#123;text&#125;, &#123;url&#125;, &#123;platform&#125;, &#123;account&#125;, &#123;date&#125;. Supports HTML.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>
            {task?.id ? "Update Task" : "Create Task"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
