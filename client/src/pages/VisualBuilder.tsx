import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, MousePointer2, Save, ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function VisualBuilder() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "select">("idle");
  const [selectors, setSelectors] = useState({
    title: "",
    content: "",
    image: "",
    link: ""
  });
  const [activeField, setActiveField] = useState<keyof typeof selectors | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(prev => [...prev, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }]);
  };

  const handleLoadUrl = async (navigateUrl?: string) => {
    const targetUrl = navigateUrl || url;
    if (!targetUrl) return;
    setLoading(true);
    addLog(`Starting load for: ${targetUrl}`, 'info');
    try {
      const res = await apiRequest("POST", "/api/visual-proxy", { url: targetUrl });
      const { content } = await res.json();
      setPreviewContent(content);
      addLog(`Successfully loaded content from ${new URL(targetUrl).hostname}`, 'success');
    } catch (e: any) {
      addLog(`Failed to load site: ${e.message}`, 'error');
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "ELEMENT_SELECTED" && activeField) {
        setSelectors(prev => ({ ...prev, [activeField]: event.data.selector }));
        setMode("idle");
        setActiveField(null);
      } else if (event.data.type === "NAVIGATE" && event.data.url) {
        setUrl(event.data.url);
        handleLoadUrl(event.data.url);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeField, url]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "SET_MODE", mode }, "*");
    }
  }, [mode]);

  const startSelecting = (field: keyof typeof selectors) => {
    setActiveField(field);
    setMode("select");
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await apiRequest("POST", "/api/tasks", {
        name: new URL(url).hostname,
        platform: "website",
        url,
        scrapeMethod: "visual",
        selectorTitle: selectors.title,
        selectorContent: selectors.content,
        selectorImage: selectors.image,
        selectorLink: selectors.link,
        interval: 60,
        status: "active"
      });
      toast({ title: "Success", description: "Website monitor created" });
      setLocation("/");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Visual Website Builder</h1>
        </div>

        <div className="flex gap-6 flex-1 overflow-hidden">
          <div className="w-1/3 flex flex-col gap-4">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Configure URL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://example.com" 
                    value={url} 
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Button onClick={() => handleLoadUrl()} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel flex-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Selectors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.keys(selectors).map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-medium uppercase text-muted-foreground">{field}</label>
                    <div className="flex gap-2">
                      <Input 
                        className="text-xs h-8" 
                        value={selectors[field as keyof typeof selectors]} 
                        readOnly 
                      />
                      <Button 
                        size="sm" 
                        variant={activeField === field ? "secondary" : "outline"}
                        onClick={() => startSelecting(field as keyof typeof selectors)}
                        className="h-8 w-8 p-0"
                      >
                        <MousePointer2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button className="w-full mt-4" onClick={handleSave} disabled={!selectors.title || loading}>
                  <Save className="h-4 w-4 mr-2" /> Save Scraper
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-panel overflow-hidden flex flex-col h-48">
              <CardHeader className="py-2 border-b">
                <CardTitle className="text-xs font-medium flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live Activity Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 overflow-y-auto font-mono text-[10px] space-y-1">
                {logs.length === 0 && <div className="text-muted-foreground italic text-center py-4">Waiting for activity...</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`break-words ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-green-400' : 
                    'text-blue-300'
                  }`}>
                    {log.msg}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="flex-1 glass-panel overflow-hidden relative">
            {!previewContent ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                Enter a URL to start preview
              </div>
            ) : (
              <iframe 
                ref={iframeRef}
                srcDoc={previewContent}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            )}
            {mode === "select" && (
              <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs animate-pulse">
                Selecting {activeField}... Click an element in the preview
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
