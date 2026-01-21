import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 text-right" dir="rtl">
      <Card className="w-full max-w-lg border-none shadow-lg bg-card/50 backdrop-blur-sm">
        <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
          <div className="bg-primary/10 p-4 rounded-full mb-6">
            <ShieldAlert className="h-12 w-12 text-primary animate-pulse" />
          </div>
          
          <h1 className="text-3xl font-bold text-foreground mb-4">الصفحة غير متاحة</h1>
          
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            عذراً، الصفحة التي تبحث عنها غير متاحة حالياً. 
            <br />
            يمكنك المحاولة مرة أخرى باستخدام أداة البحث أو استكشاف المحتوى من خلال لوحة التحكم.
          </p>

          <div className="w-full relative mb-6 group">
            <Input 
              type="text" 
              placeholder="ابحث عن صفحة أو وظيفة..." 
              className="pr-12 h-12 text-lg rounded-xl border-primary/20 focus-visible:ring-primary/30"
              data-testid="input-search-404"
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
          </div>

          <div className="flex flex-wrap gap-3 justify-center mb-10">
            <Button 
              onClick={() => setLocation("/")}
              className="rounded-xl px-8 h-12 text-lg font-medium hover-elevate active-elevate-2"
              data-testid="button-home-redirect"
            >
              العودة للرئيسية
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.history.back()}
              className="rounded-xl px-8 h-12 text-lg font-medium hover-elevate active-elevate-2"
              data-testid="button-back-redirect"
            >
              رجوع للسابقة
            </Button>
          </div>

          <div className="flex items-center gap-2 py-3 px-4 bg-muted/50 rounded-lg text-xs text-muted-foreground border border-border/50">
            <ShieldCheck size={14} className="text-green-600" />
            <span>محمي بخدمة reCAPTCHA</span>
          </div>
        </CardContent>
      </Card>
      
      <footer className="mt-8 text-muted-foreground/60 text-sm">
        برجاء المحاولة مرة أخرى في وقت لاحق بعد ظهور الموقع بالكامل
      </footer>
    </div>
  );
}
