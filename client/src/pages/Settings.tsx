import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSettings, useUpdateSetting } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { Save, LogIn, ShieldCheck, Phone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    defaultValues: {
      telegram_bot_token: "",
      default_user_agent: "",
      tg_api_id: "",
      tg_api_hash: "",
      phoneNumber: "",
      code: "",
      password: "",
      tg_use_userbot: "false",
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
    
    setLoading(true);
    try {
      // Save settings
      const settingsToSave = {
        telegram_bot_token: data.telegram_bot_token,
        default_user_agent: data.default_user_agent,
        tg_api_id: data.tg_api_id,
        tg_api_hash: data.tg_api_hash,
        tg_use_userbot: data.tg_use_userbot,
      };

      await apiRequest("POST", "/api/settings", settingsToSave);
      toast({ title: "Settings saved successfully" });
    } catch (e: any) {
      toast({ title: "Error saving settings", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartLogin = async () => {
    const { phoneNumber, tg_api_id, tg_api_hash } = form.getValues();
    if (!phoneNumber || !tg_api_id || !tg_api_hash) {
      toast({ title: "Missing fields", description: "Please fill in Phone, API ID and API Hash", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // First save the API credentials
      await apiRequest("POST", "/api/settings", { tg_api_id, tg_api_hash });
      
      const res = await apiRequest("POST", "/api/telegram/login/start", { phoneNumber });
      const { phoneCodeHash } = await res.json();
      setPhoneCodeHash(phoneCodeHash);
      setStep("code");
      toast({ title: "Verification code sent" });
    } catch (e: any) {
      toast({ title: "Error starting login", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteLogin = async () => {
    const { phoneNumber, code, password } = form.getValues();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/telegram/login/complete", {
        phoneNumber,
        code,
        phoneCodeHash,
        password: password || undefined
      });
      const result = await res.json();

      if (result.needs2FA) {
        setStep("2fa");
        toast({ title: "2FA Required", description: "Please enter your cloud password" });
      } else {
        setStep("idle");
        toast({ title: "Login successful", description: "Telegram Userbot session saved" });
      }
    } catch (e: any) {
      toast({ title: "Error completing login", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Global Settings</h1>
        <p className="text-muted-foreground">Configure application-wide parameters and Telegram authentication.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Telegram Bot Integration</CardTitle>
              <CardDescription>
                Traditional Bot API configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Bot Token</label>
                <Input 
                  type="password"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" 
                  {...form.register("telegram_bot_token")}
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="tg_use_userbot"
                  {...form.register("tg_use_userbot")}
                  className="rounded border-gray-300"
                />
                <label htmlFor="tg_use_userbot" className="text-sm">Use Userbot instead of Bot Token</label>
              </div>
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
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" /> Telegram Userbot (Telethon)
              </CardTitle>
              <CardDescription>
                Login with your phone number to use userbot features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">API ID</label>
                  <Input placeholder="123456" {...form.register("tg_api_id")} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">API Hash</label>
                  <Input placeholder="abcdef..." {...form.register("tg_api_hash")} />
                </div>
              </div>

              {step === "idle" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Phone Number</label>
                    <Input placeholder="+9665..." {...form.register("phoneNumber")} />
                  </div>
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleStartLogin}
                    disabled={loading}
                  >
                    <LogIn size={16} /> Start Login
                  </Button>
                </div>
              )}

              {step === "code" && (
                <div className="space-y-4 bg-primary/5 p-4 rounded-lg border border-primary/10">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Verification Code</label>
                    <Input placeholder="Enter code" {...form.register("code")} />
                  </div>
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleCompleteLogin}
                    disabled={loading}
                  >
                    Verify Code
                  </Button>
                  <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("idle")}>
                    Back
                  </Button>
                </div>
              )}

              {step === "2fa" && (
                <div className="space-y-4 bg-amber-500/5 p-4 rounded-lg border border-amber-500/10">
                  <div className="flex items-center gap-2 text-amber-600 mb-2">
                    <ShieldCheck size={18} />
                    <span className="text-sm font-semibold">2-Step Verification</span>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Cloud Password</label>
                    <Input type="password" placeholder="Your password" {...form.register("password")} />
                  </div>
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleCompleteLogin}
                    disabled={loading}
                  >
                    Confirm Password
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={form.handleSubmit(onSubmit)} className="gap-2" disabled={loading}>
          <Save size={16} /> Save Settings
        </Button>
      </div>
    </Layout>
  );
}
