'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminUsagePage() {
  const [data, setData] = useState<{ name: string; leads: number; appointments: number; agents: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: businesses } = await supabase.from('businesses').select('id, name').limit(10);
      if (!businesses) { setLoading(false); return; }

      const usageData = await Promise.all(
        businesses.map(async (biz) => {
          const [leads, appointments, agents] = await Promise.all([
            supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
            supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
            supabase.from('agents').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
          ]);
          return { name: biz.name, leads: leads.count ?? 0, appointments: appointments.count ?? 0, agents: agents.count ?? 0 };
        })
      );
      setData(usageData);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading usage data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Usage</h2>
        <p className="text-sm text-muted-foreground mt-1">Platform usage metrics across businesses.</p>
      </div>
      {data.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><p className="text-sm text-muted-foreground">No usage data available.</p></CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Business</CardTitle>
            <CardDescription>Leads, appointments, and agents per business</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Bar dataKey="leads" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appointments" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="agents" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
