import { Layout } from "@/components/Layout";
import { useLogs } from "@/hooks/use-logs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function Logs() {
  const { data: logs, isLoading } = useLogs();

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Execution Logs</h1>
        <p className="text-muted-foreground">History of scraping operations.</p>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="text-right">Items Found</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Loading logs...</TableCell>
              </TableRow>
            ) : logs?.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {log.timestamp ? format(new Date(log.timestamp), "MMM d, HH:mm:ss") : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`
                    ${log.status === 'success' ? 'border-green-500 text-green-500' : 
                      log.status === 'error' ? 'border-red-500 text-red-500' : 'border-blue-500 text-blue-500'}
                  `}>
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs md:text-sm">{log.message}</TableCell>
                <TableCell className="text-right font-medium">{log.itemsFound}</TableCell>
              </TableRow>
            ))}
            {!isLoading && logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No logs available yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
