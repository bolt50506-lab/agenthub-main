'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<Array<{ id: string; action: string; entity_type: string | null; business_id: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('activity_logs').select('id, action, entity_type, business_id, created_at').order('created_at', { ascending: false }).limit(100);
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading logs...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">System Logs</h2>
        <p className="text-sm text-muted-foreground mt-1">Recent activity across all businesses (last 100 entries).</p>
      </div>
      {logs.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><FileText className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No system logs yet.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Business</TableHead><TableHead>Time</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-sm">{log.action.replace(/_/g, ' ')}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{log.entity_type || '-'}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{log.business_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(log.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
