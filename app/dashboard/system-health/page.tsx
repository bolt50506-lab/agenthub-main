'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export default function SystemHealthPage() {
  const { activeBusiness, session } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!activeBusiness || !session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/health/integrations?business_id=' + encodeURIComponent(activeBusiness.id), { headers: { Authorization: 'Bearer ' + session.access_token } });
      setData(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [activeBusiness?.id, session?.access_token]);
  const railwayOk = data?.railway?.ok === true;
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">System Health</h1><p className="text-muted-foreground">Live connection and integration monitoring.</p></div><Button onClick={load} disabled={loading}><RefreshCw className={'w-4 h-4 mr-2 ' + (loading ? 'animate-spin' : '')}/>Refresh</Button></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">WhatsApp Service</CardTitle></CardHeader><CardContent className="flex items-center gap-2">{railwayOk ? <CheckCircle2 className="w-5 h-5 text-green-600"/> : <XCircle className="w-5 h-5 text-red-600"/>}<span>{railwayOk ? 'Healthy' : 'Unavailable'}</span></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Connected Sessions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{data?.railway?.sessions?.connected ?? '—'}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Voice Runtime</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{data?.railway?.voice?.enabled ? 'Enabled' : '—'}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Integrations</CardTitle></CardHeader><CardContent className="space-y-3">{(data?.integrations || []).map((i: any) => <div key={i.name + i.type} className="flex justify-between border rounded-lg p-3"><span>{i.name}</span><span className="text-sm text-muted-foreground">{i.status}</span></div>)}{data && !(data?.integrations || []).length && <p className="text-muted-foreground">No integrations configured.</p>}</CardContent></Card>
  </div>;
}
