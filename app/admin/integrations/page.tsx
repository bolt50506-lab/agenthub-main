'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Globe, Facebook, Instagram, Linkedin, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Power } from 'lucide-react';
import type { Integration, IntegrationType, IntegrationStatus } from '@/lib/types/database';

const CHANNEL_META: Record<IntegrationType, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30' },
  website_chat: { icon: Globe, label: 'Website Chat', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  facebook_messenger: { icon: Facebook, label: 'Facebook Messenger', color: 'text-blue-700 dark:text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-950/30' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'text-sky-700 dark:text-sky-500', bgColor: 'bg-sky-50 dark:bg-sky-950/30' },
};

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_connected: { label: 'Not Connected', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: XCircle },
  configuration_required: { label: 'Configuration Required', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  configured: { label: 'Configured', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  connecting: { label: 'Connecting...', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Loader2 },
  connected: { label: 'Connected', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
  paused: { label: 'Paused', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Power },
};

const ALL_CHANNELS: IntegrationType[] = ['whatsapp', 'website_chat', 'facebook_messenger', 'instagram', 'linkedin'];

interface BusinessIntegrations {
  businessId: string;
  businessName: string;
  integrations: Integration[];
}

export default function AdminIntegrationsPage() {
  const [data, setData] = useState<BusinessIntegrations[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const { data: businesses } = await supabase.from('businesses').select('id, name').order('name');
    if (!businesses) { setLoading(false); return; }

    const { data: allIntegrations } = await supabase.from('integrations').select('*');

    const grouped: BusinessIntegrations[] = businesses.map((b) => ({
      businessId: b.id,
      businessName: b.name,
      integrations: (allIntegrations ?? []).filter((i) => i.business_id === b.id) as Integration[],
    }));
    setData(grouped);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const getStatus = (integrations: Integration[], type: IntegrationType): IntegrationStatus => {
    const integration = integrations.find((i) => i.type === type);
    return integration?.status ?? 'not_connected';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">Platform-level integration status and configuration.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalConnected = data.reduce((sum, b) => sum + b.integrations.filter((i) => i.status === 'connected').length, 0);
  const totalChannels = data.length * ALL_CHANNELS.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">Platform-level integration status across all businesses.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {totalConnected} / {totalChannels} connected
          </Badge>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards per channel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_CHANNELS.map((type) => {
          const meta = CHANNEL_META[type];
          const Icon = meta.icon;
          const connectedForChannel = data.filter((b) => b.integrations.some((i) => i.type === type && i.status === 'connected')).length;
          const totalForChannel = data.length;

          return (
            <Card key={type}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                  </div>
                  <Badge variant={connectedForChannel > 0 ? 'default' : 'outline'}>
                    {connectedForChannel} / {totalForChannel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {connectedForChannel > 0
                    ? `${connectedForChannel} business${connectedForChannel !== 1 ? 'es' : ''} actively using this channel.`
                    : 'No businesses connected to this channel yet.'}
                </CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-business breakdown */}
      {data.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Per-Business Status</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Business</th>
                    {ALL_CHANNELS.map((type) => {
                      const meta = CHANNEL_META[type];
                      const Icon = meta.icon;
                      return (
                        <th key={type} className="text-center font-medium px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                            <span className="hidden lg:inline">{meta.label}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.businessId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{b.businessName}</td>
                      {ALL_CHANNELS.map((type) => {
                        const status = getStatus(b.integrations, type);
                        const config = STATUS_CONFIG[status];
                        const StatusIcon = config.icon;
                        return (
                          <td key={type} className="text-center px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <StatusIcon className={`w-3.5 h-3.5 ${config.color.split(' ')[1] ?? ''}`} />
                              <span className={`text-xs ${config.color} hidden xl:inline`}>{config.label}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
