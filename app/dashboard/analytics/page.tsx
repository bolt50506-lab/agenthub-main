'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, TrendingUp, Bot, Calendar, BarChart3 } from 'lucide-react';
import { LEAD_STATUSES, APPOINTMENT_STATUSES } from '@/lib/types/database';

const CHART_COLORS = ['hsl(199, 89%, 48%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(280, 65%, 60%)', 'hsl(210, 40%, 50%)', 'hsl(180, 50%, 45%)'];

export default function AnalyticsPage() {
  const { activeBusiness } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leadData, setLeadData] = useState<{ name: string; value: number }[]>([]);
  const [aptData, setAptData] = useState<{ name: string; value: number }[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [wonLeads, setWonLeads] = useState(0);

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const [leads, appointments, agents] = await Promise.all([
        supabase.from('leads').select('status').eq('business_id', activeBusiness.id),
        supabase.from('appointments').select('status').eq('business_id', activeBusiness.id),
        supabase.from('agents').select('id, status').eq('business_id', activeBusiness.id),
      ]);

      const leadStatusCounts = LEAD_STATUSES.map((s) => ({
        name: s.label,
        value: (leads.data as Array<{ status: string }> | null)?.filter((l) => l.status === s.value).length ?? 0,
      })).filter((d) => d.value > 0);
      setLeadData(leadStatusCounts);

      const aptStatusCounts = APPOINTMENT_STATUSES.map((s) => ({
        name: s.label,
        value: (appointments.data as Array<{ status: string }> | null)?.filter((a) => a.status === s.value).length ?? 0,
      })).filter((d) => d.value > 0);
      setAptData(aptStatusCounts);

      setAgentCount((agents.data as Array<{ status: string }> | null)?.filter((a) => a.status === 'active').length ?? 0);
      setTotalLeads(leads.data?.length ?? 0);
      setTotalAppointments(appointments.data?.length ?? 0);
      setWonLeads((leads.data as Array<{ status: string }> | null)?.filter((l) => l.status === 'won').length ?? 0);
      setLoading(false);
    })();
  }, [activeBusiness]);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading analytics...</div>;

  const stats = [
    { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Won Leads', value: wonLeads, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
    { label: 'Appointments', value: totalAppointments, icon: Calendar, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Active Agents', value: agentCount, icon: Bot, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalLeads === 0 && totalAppointments === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><BarChart3 className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No data to analyze yet. Create leads and appointments to see analytics here.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {leadData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads by Status</CardTitle>
                <CardDescription>Distribution of leads across pipeline stages</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {aptData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appointments by Status</CardTitle>
                <CardDescription>Distribution of appointment statuses</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={aptData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {aptData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
