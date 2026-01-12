import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { useTasks } from "@/hooks/use-tasks";
import { useLogs } from "@/hooks/use-logs";
import { Activity, CheckCircle, Clock, XCircle } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function Dashboard() {
  const { data: tasks } = useTasks();
  const { data: logs } = useLogs();

  const activeTasks = tasks?.filter(t => t.status === 'active').length || 0;
  const errorTasks = tasks?.filter(t => t.status === 'error').length || 0;
  const totalLogs = logs?.length || 0;
  const successLogs = logs?.filter(l => l.status === 'success').length || 0;

  // Calculate success rate
  const successRate = totalLogs > 0 
    ? Math.round((successLogs / totalLogs) * 100) 
    : 0;

  // Chart data (mock distribution for now, real app would aggregate logs)
  const chartData = [
    { name: 'Twitter', count: tasks?.filter(t => t.platform === 'twitter').length || 0, color: '#1DA1F2' },
    { name: 'Facebook', count: tasks?.filter(t => t.platform === 'facebook').length || 0, color: '#4267B2' },
    { name: 'Instagram', count: tasks?.filter(t => t.platform === 'instagram').length || 0, color: '#C13584' },
    { name: 'YouTube', count: tasks?.filter(t => t.platform === 'youtube').length || 0, color: '#FF0000' },
    { name: 'TikTok', count: tasks?.filter(t => t.platform === 'tiktok').length || 0, color: '#000000' },
  ];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your scraping operations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Active Tasks" 
          value={activeTasks} 
          icon={Activity} 
          description={`${tasks?.length || 0} total tasks configured`}
        />
        <StatCard 
          title="Success Rate" 
          value={`${successRate}%`} 
          icon={CheckCircle} 
          trend={successRate > 90 ? "Excellent" : "Needs Attention"}
        />
        <StatCard 
          title="Total Executions" 
          value={totalLogs} 
          icon={Clock} 
          description="In the last 30 days"
        />
        <StatCard 
          title="Errors" 
          value={errorTasks} 
          icon={XCircle} 
          description="Tasks currently failing"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-6">Task Distribution by Platform</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {logs?.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-black/20">
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  log.status === 'success' ? 'bg-green-500' : 
                  log.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium">{log.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '-'}
                  </p>
                </div>
              </div>
            ))}
            {(!logs || logs.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">No logs available</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
