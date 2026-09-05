'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Calendar, CheckSquare, Bot, TrendingUp, Clock, ArrowRight, CircleDollarSign, MessageSquare, Zap, Plus, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { LEAD_STATUSES, APPOINTMENT_STATUSES, FOLLOWUP_STATUSES } from '@/lib/types/database';

interface DashboardData {
  totalLeads: number;
  newLeads: number;
  convertedCustomers: number;
  conversionRate: number;
  appointments: number;
  pendingFollowUps: number;
  activeAgents: number;
  recentLeads: Array<{ id: string; name: string; status: string; created_at: string; interested_product: string | null }>;
  recentConversions: Array<{ id: string; name: string; phone: string | null; interested_product: string | null; conversion_amount: number | null; conversion_currency: string | null; converted_at: string | null }>;
  upcomingAppointments: Array<{ id: string; customer_name: string | null; date: string; start_time: string; status: string }>;
  pendingFollowUpsList: Array<{ id: string; task_type: string; scheduled_at: string; notes: string | null; status: string }>;
  recentActivities: Array<{ id: string; action: string; entity_type: string | null; created_at: string }>;
  agents: Array<{ id: string; name: string; status: string; purpose: string }>;
}

export default function DashboardOverview() {
  const { activeBusiness } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const bizId = activeBusiness.id;

      const [recentLeadsResult, totalLeadsResult, newLeadsResult, convertedResult, recentConversionsResult, appointmentsResult, appointmentCountResult, followUps, agents, activities] = await Promise.all([
        supabase.from('leads').select('id, name, status, created_at, interested_product').eq('business_id', bizId).order('created_at', { ascending: false }).limit(5),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', bizId),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', bizId).eq('status', 'new'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', bizId).eq('status', 'won'),
        supabase.from('leads').select('id, name, phone, interested_product, conversion_amount, conversion_currency, converted_at').eq('business_id', bizId).eq('status', 'won').order('converted_at', { ascending: false, nullsFirst: false }).limit(5),
        supabase.from('appointments').select('id, customer_name, date, start_time, status').eq('business_id', bizId).gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(5),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', bizId).gte('date', new Date().toISOString().split('T')[0]),
        supabase.from('follow_up_tasks').select('id, task_type, scheduled_at, notes, status').eq('business_id', bizId).eq('status', 'pending').order('scheduled_at', { ascending: true }).limit(5),
        supabase.from('agents').select('id, name, status, purpose').eq('business_id', bizId),
        supabase.from('activity_logs').select('id, action, entity_type, created_at').eq('business_id', bizId).order('created_at', { ascending: false }).limit(8),
      ]);

      const totalLeads = totalLeadsResult.count ?? 0;
      const convertedCustomers = convertedResult.count ?? 0;
      const pendingFollowUpsCount = (followUps.data ?? []).length;
      const activeAgents = (agents.data ?? []).filter((a) => a.status === 'active').length;

      setData({
        totalLeads,
        newLeads: newLeadsResult.count ?? 0,
        convertedCustomers,
        conversionRate: totalLeads > 0 ? Number(((convertedCustomers / totalLeads) * 100).toFixed(1)) : 0,
        appointments: appointmentCountResult.count ?? 0,
        pendingFollowUps: pendingFollowUpsCount,
        activeAgents,
        recentLeads: recentLeadsResult.data ?? [],
        recentConversions: recentConversionsResult.data ?? [],
        upcomingAppointments: appointmentsResult.data ?? [],
        pendingFollowUpsList: followUps.data ?? [],
        recentActivities: activities.data ?? [],
        agents: agents.data ?? [],
      });
      setLoading(false);
    })();
  }, [activeBusiness]);

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }

  if (!data) return null;

  const stats = [
    { label: 'Total Leads', value: data.totalLeads, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'New Leads', value: data.newLeads, icon: TrendingUp, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30' },
    { label: 'Converted Customers', value: data.convertedCustomers, icon: CircleDollarSign, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30' },
    { label: 'Conversion Rate', value: data.conversionRate + '%', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Appointments', value: data.appointments, icon: Calendar, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Pending Follow-ups', value: data.pendingFollowUps, icon: CheckSquare, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    { label: 'Active AI Agents', value: data.activeAgents, icon: Bot, color: 'text-primary', bg: 'bg-primary/5' },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-background to-background p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3 gap-2"><Zap className="h-3.5 w-3.5" /> AI Command Center</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Welcome back, {activeBusiness?.name || 'Business'}.</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">Monitor leads, conversions, appointments and AI automation from one live workspace.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/conversations"><Button className="gap-2"><MessageSquare className="h-4 w-4" /> Open Inbox</Button></Link>
            <Link href="/dashboard/leads"><Button variant="outline" className="gap-2"><UserPlus className="h-4 w-4" /> Manage Leads</Button></Link>
            <Link href="/dashboard/appointments"><Button variant="outline" size="icon" title="Appointments"><Plus className="h-4 w-4" /></Button></Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Leads</CardTitle>
              <CardDescription>Latest leads captured by your agents</CardDescription>
            </div>
            <Link href="/dashboard/leads">
              <Button variant="ghost" size="sm" className="gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentLeads.length === 0 ? (
              <EmptyState icon={Users} message="No leads yet. Your AI agents will capture leads from conversations." />
            ) : (
              <div className="space-y-3">
                {data.recentLeads.map((lead) => {
                  const statusInfo = LEAD_STATUSES.find((s) => s.value === lead.status);
                  return (
                    <Link key={lead.id} href={`/dashboard/leads/${lead.id}`} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                      <div>
                        <p className="text-sm font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.interested_product || 'No product specified'}</p>
                      </div>
                      <Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? lead.status}</Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Conversions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Conversions</CardTitle>
              <CardDescription>Customers whose leads were marked as Converted</CardDescription>
            </div>
            <Link href="/dashboard/leads">
              <Button variant="ghost" size="sm" className="gap-1">
                View leads <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentConversions.length === 0 ? (
              <EmptyState icon={CircleDollarSign} message="No converted customers yet. Mark a lead as Converted to record it here." />
            ) : (
              <div className="space-y-3">
                {data.recentConversions.map((lead) => (
                  <Link key={lead.id} href={"/dashboard/leads/" + lead.id} className="flex items-center justify-between p-3 rounded-lg border border-green-200 dark:border-green-900 hover:bg-accent transition-colors">
                    <div>
                      <p className="text-sm font-medium">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone || lead.interested_product || 'Converted customer'}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" variant="secondary">Converted</Badge>
                      {lead.conversion_amount != null && <p className="text-xs text-muted-foreground mt-1">{lead.conversion_currency || 'PKR'} {lead.conversion_amount}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Appointments</CardTitle>
              <CardDescription>Scheduled appointments</CardDescription>
            </div>
            <Link href="/dashboard/appointments">
              <Button variant="ghost" size="sm" className="gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.upcomingAppointments.length === 0 ? (
              <EmptyState icon={Calendar} message="No upcoming appointments. Book appointments from leads or conversations." />
            ) : (
              <div className="space-y-3">
                {data.upcomingAppointments.map((apt) => {
                  const statusInfo = APPOINTMENT_STATUSES.find((s) => s.value === apt.status);
                  return (
                    <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{apt.customer_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{apt.date} at {apt.start_time}</p>
                        </div>
                      </div>
                      <Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? apt.status}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Follow-ups */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Follow-ups</CardTitle>
              <CardDescription>Tasks that need attention</CardDescription>
            </div>
            <Link href="/dashboard/follow-ups">
              <Button variant="ghost" size="sm" className="gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.pendingFollowUpsList.length === 0 ? (
              <EmptyState icon={CheckSquare} message="No pending follow-ups. Tasks will appear here when created." />
            ) : (
              <div className="space-y-3">
                {data.pendingFollowUpsList.map((fu) => {
                  const statusInfo = FOLLOWUP_STATUSES.find((s) => s.value === fu.status);
                  return (
                    <div key={fu.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div>
                        <p className="text-sm font-medium capitalize">{fu.task_type}</p>
                        <p className="text-xs text-muted-foreground">{new Date(fu.scheduled_at).toLocaleString()}</p>
                      </div>
                      <Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? fu.status}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Status */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Agent Status</CardTitle>
              <CardDescription>Your AI agents</CardDescription>
            </div>
            <Link href="/dashboard/agents">
              <Button variant="ghost" size="sm" className="gap-1">
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {data.agents.length === 0 ? (
              <EmptyState icon={Bot} message="No agents yet. Create an AI agent to start automating conversations." />
            ) : (
              <div className="space-y-3">
                {data.agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${agent.status === 'active' ? 'bg-green-50 dark:bg-green-950/30' : 'bg-muted'}`}>
                        <Bot className={`w-4 h-4 ${agent.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.purpose}</p>
                      </div>
                    </div>
                    <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="capitalize">{agent.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {data.recentActivities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions in your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-medium">{activity.action}</span>
                  {activity.entity_type && <span className="text-muted-foreground">on {activity.entity_type}</span>}
                  <span className="text-muted-foreground ml-auto text-xs">{new Date(activity.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}
