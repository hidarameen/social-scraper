import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSettings, useUpdateSetting } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { Save } from "lucide-react";

export default function Settings() {
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const { user } = useAuth();

  const form = useForm({
    defaultValues: {
      telegram_bot_token: "",
      default_user_agent: "",
    }
  });

  useEffect(() => {
    if (settings) {
      const values: Record<string, string> = {};
      settings.forEach(s => {
        values[s.key] = s.value;
      });
      form.reset(values);
    }
  }, [settings, form]);

  const onSubmit = async (data: Record<string, string>) => {
    if (!user) return;
    
    // Save each setting
    for (const [key, value] of Object.entries(data)) {
      if (value) {
        await updateSetting.mutateAsync({
          userId: user.id,
          key,
          value
        });
      }
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Global Settings</h1>
        <p className="text-muted-foreground">Configure application-wide parameters.</p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Telegram Integration</CardTitle>
              <CardDescription>
                Configure the bot token used for sending notifications to channels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="text-sm font-medium mb-2 block">Bot Token</label>
              <Input 
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" 
                {...form.register("telegram_bot_token")}
              />
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Scraping Defaults</CardTitle>
              <CardDescription>
                Default User-Agent string for browser requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="text-sm font-medium mb-2 block">User Agent</label>
              <Input 
                placeholder="Mozilla/5.0..." 
                {...form.register("default_user_agent")}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="gap-2" disabled={updateSetting.isPending}>
              <Save size={16} /> Save Changes
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
