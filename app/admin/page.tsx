'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building, Users, Bot, Activity } from 'lucide-react';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState({ businesses: 0, users: 0, agents: 0, activities: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [biz, users, agents, logs] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        businesses: biz.count ?? 0,
        users: users.count ?? 0,
        agents: agents.count ?? 0,
        activities: logs.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading platform data...</div>;

  const cards = [
    { label: 'Total Businesses', value: stats.businesses, icon: Building, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Total Users', value: stats.users, icon: Users, color: 'text-teal-600 dark:text-teal-400' },
    { label: 'Total AI Agents', value: stats.agents, icon: Bot, color: 'text-primary' },
    { label: 'Activity Logs', value: stats.activities, icon: Activity, color: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">Monitor all businesses and users on the AgentHub platform.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
