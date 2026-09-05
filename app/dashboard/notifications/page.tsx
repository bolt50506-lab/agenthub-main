'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Flame, CircleAlert, Hand } from 'lucide-react';

type Notice = { id: string; type: string; title: string; message: string | null; is_read: boolean; metadata: Record<string, unknown>; created_at: string };

export default function NotificationsPage() {
  const { activeBusiness } = useAuth();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }).limit(100);
    setItems((data as Notice[] | null) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeBusiness?.id]);

  const markAll = async () => {
    if (!activeBusiness) return;
    await supabase.from('notifications').update({ is_read: true }).eq('business_id', activeBusiness.id).eq('is_read', false);
    await load();
  };

  const icon = (type: string) => type === 'hot_lead' ? <Flame className="w-5 h-5" /> : type === 'complaint' ? <CircleAlert className="w-5 h-5" /> : type === 'human_takeover' ? <Hand className="w-5 h-5" /> : <Bell className="w-5 h-5" />;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold">Notifications</h1><p className="text-muted-foreground">Hot leads, conversions, complaints and human takeover alerts.</p></div>
      <Button variant="outline" onClick={markAll}><CheckCheck className="w-4 h-4 mr-2" />Mark all read</Button>
    </div>
    <Card>
      <CardHeader><CardTitle>Business alerts</CardTitle><CardDescription>{items.filter(x => !x.is_read).length} unread</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-muted-foreground">Loading notifications...</p> : items.length === 0 ? <p className="text-muted-foreground">No notifications yet.</p> : items.map(item => (
          <div key={item.id} className={'flex gap-3 rounded-lg border p-4 ' + (!item.is_read ? 'bg-muted/40' : '')}>
            <div className="text-primary">{icon(item.type)}</div>
            <div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium">{item.title}</p><span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(item.created_at).toLocaleString()}</span></div>{item.message && <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>;
}
