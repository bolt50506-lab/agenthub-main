'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  MessageSquare, Globe, Facebook, Instagram, Linkedin, Plug, Loader2,
  CheckCircle2, XCircle, AlertCircle, Copy, ExternalLink, Power, Settings2,
  QrCode, ZapOff, Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Integration, IntegrationType, IntegrationStatus, WhatsAppConnectionMethod } from '@/lib/types/database';

interface ChannelMeta {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  docsUrl: string;
  configFields: ConfigField[];
  canTestConnection: boolean;
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  required: boolean;
  helpText?: string;
}

const CHANNEL_META: Record<IntegrationType, ChannelMeta> = {
  whatsapp: {
    icon: MessageSquare,
    label: 'WhatsApp',
    description: 'Connect WhatsApp via Cloud API or QR Code scanning. Receive and reply to customer messages automatically.',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    canTestConnection: true,
    configFields: [
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', placeholder: '106000225', required: true, helpText: 'From your WhatsApp Business account.' },
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'EAAG...', required: true, helpText: 'Permanent access token from Meta App.' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'my-verify-token', required: true, helpText: 'Set this same token in your Meta App webhook config.' },
      { key: 'business_phone', label: 'Business Phone Number', type: 'text', placeholder: '+1234567890', required: false, helpText: 'The WhatsApp Business number customers see.' },
    ],
  },
  website_chat: {
    icon: Globe,
    label: 'Website Chat',
    description: 'Embed a chat widget on your website. Visitors can chat with your AI agent in real time.',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    docsUrl: '#',
    canTestConnection: false,
    configFields: [
      { key: 'site_url', label: 'Website URL', type: 'url', placeholder: 'https://example.com', required: true, helpText: 'The primary domain where the widget will be embedded. Used for domain validation.' },
      { key: 'allowed_domains', label: 'Allowed Domains (comma-separated)', type: 'text', placeholder: 'example.com, shop.example.com, www.example.com', required: false, helpText: 'Additional domains allowed to load the widget. Comma-separated.' },
      { key: 'widget_title', label: 'Widget Title', type: 'text', placeholder: 'Chat with us', required: false },
      { key: 'welcome_message', label: 'Welcome Message', type: 'text', placeholder: 'Hi! How can I help you today?', required: false },
    ],
  },
  facebook_messenger: {
    icon: Facebook,
    label: 'Facebook Messenger',
    description: 'Connect your Facebook Page to receive and reply to messages through Messenger via your AI agent.',
    color: 'text-blue-700 dark:text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    canTestConnection: true,
    configFields: [
      { key: 'page_id', label: 'Facebook Page ID', type: 'text', placeholder: '1234567890', required: true, helpText: 'Numeric ID of your Facebook Page.' },
      { key: 'page_access_token', label: 'Page Access Token', type: 'password', placeholder: 'EAAG...', required: true, helpText: 'Generated from your Meta App with pages_messaging permission.' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'my-verify-token', required: true, helpText: 'Set this same token in your Meta App webhook config.' },
    ],
  },
  instagram: {
    icon: Instagram,
    label: 'Instagram',
    description: 'Connect your Instagram Business account to receive and handle DMs through your AI agent.',
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
    canTestConnection: true,
    configFields: [
      { key: 'instagram_account_id', label: 'Instagram Account ID', type: 'text', placeholder: '1784...', required: true, helpText: 'IG Business account ID linked to your Facebook Page.' },
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'EAAG...', required: true, helpText: 'Token with instagram_manage_messages permission.' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'my-verify-token', required: true, helpText: 'Set this same token in your Meta App webhook config.' },
    ],
  },
  linkedin: {
    icon: Linkedin,
    label: 'LinkedIn',
    description: 'Connect your LinkedIn account to handle messages and inquiries through your AI agent.',
    color: 'text-sky-700 dark:text-sky-500',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    docsUrl: 'https://learn.microsoft.com/linkedin/marketing/integrations',
    canTestConnection: true,
    configFields: [
      { key: 'organization_id', label: 'LinkedIn Organization ID', type: 'text', placeholder: '12345678', required: true, helpText: 'Numeric ID of your LinkedIn organization.' },
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'AQU...', required: true, helpText: 'OAuth 2.0 token with messaging permissions.' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'my-verify-token', required: true, helpText: 'Token for webhook verification.' },
    ],
  },
};

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_connected: { label: 'Not Connected', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: XCircle },
  configuration_required: { label: 'Configured', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  configured: { label: 'Configured', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  connecting: { label: 'Connecting...', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Loader2 },
  connected: { label: 'Connected', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
  paused: { label: 'Paused', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Power },
};

const ALL_CHANNELS: IntegrationType[] = ['whatsapp', 'website_chat', 'facebook_messenger', 'instagram', 'linkedin'];

export default function IntegrationsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [configDialog, setConfigDialog] = useState<IntegrationType | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [whatsappMethod, setWhatsappMethod] = useState<WhatsAppConnectionMethod>('cloud_api');
  const [whatsappQrStatus, setWhatsappQrStatus] = useState<string>('not_started');
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);
  const [whatsappSessionId, setWhatsappSessionId] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState<string | null>(null);
  const [whatsappQrError, setWhatsappQrError] = useState<string | null>(null);
  const [voiceReplyMode, setVoiceReplyMode] = useState<'disabled' | 'text_only' | 'voice_only' | 'text_and_voice' | 'random'>('text_and_voice');
  const [savingVoiceMode, setSavingVoiceMode] = useState(false);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadIntegrations = useCallback(async () => {
    if (!activeBusiness) return;
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('business_id', activeBusiness.id)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load integrations', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const loaded = (data as Integration[]) ?? [];
    setIntegrations(loaded);

    // Restore the saved WhatsApp reply rule after every reload. Previously
    // the selector state always started as text_and_voice, so a successful
    // save could look like it was reverted immediately after refresh.
    const whatsappIntegration = loaded.find((item) => item.type === 'whatsapp');
    const savedMode = (whatsappIntegration?.config as Record<string, unknown> | undefined)?.voice_reply_mode;

    if (
      savedMode === 'disabled' ||
      savedMode === 'text_only' ||
      savedMode === 'voice_only' ||
      savedMode === 'text_and_voice' ||
      savedMode === 'random'
    ) {
      setVoiceReplyMode(savedMode);
    }

    setLoading(false);
  }, [activeBusiness, toast]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const getIntegration = (type: IntegrationType) => integrations.find((i) => i.type === type);

  const openConfig = (type: IntegrationType) => {
    const existing = getIntegration(type);
    const existingConfig = (existing?.config ?? {}) as Record<string, unknown>;
    const initial: Record<string, string> = {};
    for (const field of CHANNEL_META[type].configFields) {
      const val = existingConfig[field.key];
      if (field.key === 'allowed_domains' && Array.isArray(val)) {
        initial[field.key] = (val as string[]).join(', ');
      } else {
        initial[field.key] = field.type === 'password' ? '' : (val as string) ?? '';
      }
    }
    setConfigValues(initial);
    setConfigDialog(type);
  };

  const handleSaveVoiceMode = async () => {
    if (!activeBusiness) {
      toast({ title: 'No business selected', description: 'Select a business before saving the WhatsApp reply rule.', variant: 'destructive' });
      return;
    }

    const integration = getIntegration('whatsapp');
    setSavingVoiceMode(true);

    const config = {
      ...((integration?.config ?? {}) as Record<string, unknown>),
      voice_reply_mode: voiceReplyMode,
    };

    let error: { message: string } | null = null;

    if (integration) {
      const result = await supabase
        .from('integrations')
        .update({ config })
        .eq('id', integration.id)
        .select()
        .maybeSingle();
      error = result.error;
      if (!result.error && result.data) {
        setIntegrations((current) =>
          current.map((item) => item.id === integration.id ? (result.data as Integration) : item)
        );
      }
    } else {
      // QR-connected businesses may have a whatsapp_sessions row without an
      // integrations row. Create the integration automatically so the rule
      // can always be saved from this dashboard.
      const result = await supabase
        .from('integrations')
        .insert({
          business_id: activeBusiness.id,
          type: 'whatsapp',
          name: 'WhatsApp',
          status: 'connected',
          config,
        })
        .select()
        .maybeSingle();
      error = result.error;
      if (!result.error && result.data) {
        setIntegrations((current) => [...current, result.data as Integration]);
      }
    }

    setSavingVoiceMode(false);

    if (error) {
      toast({ title: 'Failed to save reply mode', description: error.message, variant: 'destructive' });
      return;
    }

    toast({
      title: 'Reply mode saved',
      description: voiceReplyMode === 'disabled'
        ? 'Voice replies are disabled. Customers will receive text replies only.'
        : voiceReplyMode === 'random'
          ? 'Some replies will be text and some voice.'
          : `WhatsApp reply mode set to ${voiceReplyMode.replaceAll('_', ' ')}.`,
    });

    await loadIntegrations();
  };

  const handleSaveConfig = async () => {
    if (!configDialog || !activeBusiness) return;
    const meta = CHANNEL_META[configDialog];
    setSaving(true);

    for (const field of meta.configFields) {
      if (field.required && !configValues[field.key]?.trim()) {
        toast({ title: 'Missing field', description: `${field.label} is required.`, variant: 'destructive' });
        setSaving(false);
        return;
      }
    }

    const existing = getIntegration(configDialog);
    const existingConfig = (existing?.config ?? {}) as Record<string, unknown>;
    const config: Record<string, unknown> = { ...existingConfig };

    for (const field of meta.configFields) {
      if (field.key === 'allowed_domains') {
        const raw = configValues[field.key] ?? '';
        config[field.key] = raw.split(',').map((d) => d.trim()).filter(Boolean);
      } else if (field.type === 'password') {
        if (configValues[field.key]?.trim()) {
          config[field.key] = configValues[field.key];
        }
      } else {
        config[field.key] = configValues[field.key] ?? '';
      }
    }

    // The production database currently allows configuration_required but not configured.
    // A saved config is still considered ready to connect by the UI below.
    const newStatus: IntegrationStatus = 'configuration_required';

    if (existing) {
      const { error } = await supabase
        .from('integrations')
        .update({ config, status: newStatus })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Configuration saved', description: `${meta.label} settings saved. Use Test Connection to verify, then Connect to activate.` });
        setConfigDialog(null);
        await loadIntegrations();
      }
    } else {
      const { error } = await supabase
        .from('integrations')
        .insert({
          business_id: activeBusiness.id,
          type: configDialog,
          name: meta.label,
          status: newStatus,
          config,
        });
      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Configuration saved', description: `${meta.label} settings saved. Use Test Connection to verify, then Connect to activate.` });
        setConfigDialog(null);
        await loadIntegrations();
      }
    }
    setSaving(false);
  };

  const handleTestConnection = async (type: IntegrationType) => {
    const integration = getIntegration(type);
    if (!integration) return;
    setTesting(type);

    try {
      const res = await fetch('/api/admin/test-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: integration.id, type }),
      });
      const result = await res.json() as { success: boolean; message: string };

      toast({
        title: result.success ? 'Connection test passed' : 'Connection test failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      await loadIntegrations();
    } catch (err) {
      toast({ title: 'Connection test failed', description: (err as Error).message, variant: 'destructive' });
    }
    setTesting(null);
  };

  const handleConnect = async (type: IntegrationType) => {
    const integration = getIntegration(type);
    if (!integration) {
      openConfig(type);
      return;
    }
    const hasConfig = Object.keys(integration.config ?? {}).length > 0;
    if (!hasConfig) {
      openConfig(type);
      return;
    }

    if (integration.status !== 'configured' && integration.status !== 'configuration_required' && integration.status !== 'connected') {
      toast({ title: 'Test required', description: 'Please test the connection before connecting.', variant: 'destructive' });
      return;
    }

    setActionLoading(`connect-${type}`);
    const { error } = await supabase
      .from('integrations')
      .update({ status: 'connected' as IntegrationStatus, last_connected_at: new Date().toISOString() })
      .eq('id', integration.id);

    if (error) {
      toast({ title: 'Connection failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Connected', description: `${CHANNEL_META[type].label} is now active and ready to receive messages.` });
      await loadIntegrations();
    }
    setActionLoading(null);
  };

  const handleDisconnect = async (type: IntegrationType) => {
    const integration = getIntegration(type);
    if (!integration) return;
    setActionLoading(`disconnect-${type}`);
    const { error } = await supabase
      .from('integrations')
      .update({ status: 'not_connected' as IntegrationStatus })
      .eq('id', integration.id);
    if (error) {
      toast({ title: 'Failed to disconnect', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Disconnected', description: `${CHANNEL_META[type].label} has been disconnected.` });
      await loadIntegrations();
    }
    setActionLoading(null);
  };

  const handleTogglePause = async (type: IntegrationType) => {
    const integration = getIntegration(type);
    if (!integration) return;
    const newStatus: IntegrationStatus = integration.status === 'paused' ? 'connected' : 'paused';
    setActionLoading(`toggle-${type}`);
    const { error } = await supabase
      .from('integrations')
      .update({ status: newStatus })
      .eq('id', integration.id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'paused' ? 'Paused' : 'Resumed', description: `${CHANNEL_META[type].label} is now ${newStatus === 'paused' ? 'paused' : 'active'}.` });
      await loadIntegrations();
    }
    setActionLoading(null);
  };

  const stopQrPolling = useCallback(() => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  }, []);

  const loadWhatsappSession = useCallback(async () => {
  if (!activeBusiness) return;

  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('id, status, qr_code_url, phone_number')
    .eq('business_id', activeBusiness.id)
    .eq('connection_method', 'qr_code')
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load WhatsApp session:',
      error
    );
    return;
  }

  if (!data) {
    return;
  }

  setWhatsappSessionId(data.id);
  setWhatsappQrStatus(data.status);
  setWhatsappPhone(data.phone_number ?? null);

  if (data.status === 'connected') {

    setWhatsappQrCode(null);
    setWhatsappQrError(null);

    /*
     * Make sure the main integration list
     * also updates.
     */
    await loadIntegrations();

    return;
  }

  if (data.qr_code_url) {
    setWhatsappQrCode(
      data.qr_code_url
    );
  }

}, [
  activeBusiness,
  loadIntegrations,
]);

  const pollQrStatus = useCallback(async (sessionId: string) => {
  try {
    const res = await fetch('/api/whatsapp/qr/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
      cache: 'no-store',
    });

    const rawText = await res.text();

    let data: {
      status: string;
      qr_code?: string | null;
      phone_number?: string | null;
      error_message?: string | null;
    } = {
      status: 'error',
    };

    if (rawText.trim()) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {
          status: 'error',
          error_message: 'Invalid response from server',
        };
      }
    }

    console.log('QR poll response:', data);

    if (res.status === 404) {
      // The row was removed/replaced while an old interval was still polling.
      // Stop immediately instead of treating this as a missing API route.
      stopQrPolling();
      setWhatsappSessionId(null);
      setWhatsappQrCode(null);
      setWhatsappPhone(null);
      setWhatsappQrStatus('not_started');
      setWhatsappQrError(
        data.error_message ?? 'WhatsApp session expired. Please start a new QR connection.'
      );
      return;
    }

    setWhatsappQrStatus(data.status);

    // UPDATE QR CODE WHEN SERVICE RETURNS ONE
    if (data.qr_code) {
      setWhatsappQrCode(data.qr_code);
      setWhatsappQrError(null);
    }

    if (data.status === 'connected') {
      setWhatsappQrCode(null);
      setWhatsappPhone(data.phone_number ?? null);
      setWhatsappQrError(null);

      stopQrPolling();

      toast({
        title: 'WhatsApp connected',
        description: 'Your WhatsApp number is now connected.',
      });

      await loadIntegrations();

      return;
    }

    if (data.status === 'error') {
      setWhatsappQrCode(null);

      setWhatsappQrError(
        data.error_message ?? 'Connection failed.'
      );

      stopQrPolling();
    }

  } catch (error) {
    console.error('QR polling error:', error);
  }

}, [
  stopQrPolling,
  toast,
  loadIntegrations,
]);
   useEffect(() => {

  let active = true;

  const initializeWhatsappSession = async () => {

    if (!activeBusiness) return;

    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('id, status')
      .eq(
        'business_id',
        activeBusiness.id
      )
      .eq(
        'connection_method',
        'qr_code'
      )
      .maybeSingle();

    if (!active) return;

    if (data) {

      setWhatsappSessionId(
        data.id
      );

      /*
       * Immediately check the real
       * Baileys status.
       */

      await pollQrStatus(
        data.id
      );

      /*
       * Continue polling until connected.
       */

      if (
        data.status !== 'connected'
      ) {

        stopQrPolling();

        qrPollRef.current =
          setInterval(() => {
            pollQrStatus(
              data.id
            );
          }, 3000);
      }

    } else {

      await loadWhatsappSession();

    }
  };

  initializeWhatsappSession();

  return () => {
    active = false;
    stopQrPolling();
  };

}, [
  activeBusiness,
  loadWhatsappSession,
  pollQrStatus,
  stopQrPolling,
]);

  const handleWhatsappQrConnect = async () => {
    if (!activeBusiness) return;

    // Stop any old interval before the backend resets the Baileys session.
    stopQrPolling();
    setWhatsappSessionId(null);
    setWhatsappQrCode(null);
    setWhatsappPhone(null);
    setWhatsappQrError(null);

    setActionLoading('qr-connect');
    setWhatsappQrStatus('creating_session');

    try {
      const res = await fetch('/api/whatsapp/qr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: activeBusiness.id }),
      });
      const rawText = await res.text();
      let data: { session_id: string; qr_code: string; status: string; error?: string } = { session_id: '', qr_code: '', status: 'error' };
      if (rawText.trim()) {
        try { data = JSON.parse(rawText); } catch { data = { session_id: '', qr_code: '', status: 'error', error: 'Invalid response from server' }; }
      } else {
        data = { session_id: '', qr_code: '', status: 'error', error: 'Empty response from server' };
      }

      if (!res.ok) {
        setWhatsappQrStatus('error');
        const errMsg = data.error ?? 'Unknown error';
        setWhatsappQrError(errMsg);
        toast({ title: 'Failed to start QR connection', description: errMsg, variant: 'destructive' });
        setActionLoading(null);
        return;
      }

      if (!data.session_id) {
        throw new Error('QR service started without returning a session ID.');
      }

      setWhatsappSessionId(data.session_id);
      setWhatsappQrCode(data.qr_code || null);
      setWhatsappQrStatus(data.status);
      setActionLoading(null);

      // Poll the newly returned stable Supabase row ID.
      stopQrPolling();
      await pollQrStatus(data.session_id);
      qrPollRef.current = setInterval(() => {
        pollQrStatus(data.session_id);
      }, 3000);
    } catch (err) {
      setWhatsappQrStatus('error');
      const errMsg = (err as Error).message;
      setWhatsappQrError(errMsg);
      toast({ title: 'Failed to start QR connection', description: errMsg, variant: 'destructive' });
      setActionLoading(null);
    }
  };

  const handleWhatsappQrDisconnect = async () => {
    if (!activeBusiness) return;
    setActionLoading('qr-disconnect');
    stopQrPolling();
    try {
      await fetch('/api/whatsapp/qr/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: activeBusiness.id }),
      });
      setWhatsappQrStatus('not_started');
      setWhatsappQrCode(null);
      setWhatsappSessionId(null);
      setWhatsappPhone(null);
      toast({ title: 'WhatsApp disconnected' });
      await loadIntegrations();
    } catch (err) {
      toast({ title: 'Failed to disconnect', description: (err as Error).message, variant: 'destructive' });
    }
    setActionLoading(null);
  };

  const copyToClipboard = (text: string, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast({ title: label, description: 'Copied to clipboard.' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const connectedCount = integrations.filter((i) => i.status === 'connected').length;
  const configuredCount = integrations.filter((i) => i.status === 'configured').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your communication channels. Configure, test, then connect to activate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configuredCount > 0 && (
            <Badge variant="outline" className="text-sm">
              {configuredCount} configured
            </Badge>
          )}
          <Badge variant="secondary" className="text-sm">
            {connectedCount} of {ALL_CHANNELS.length} connected
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ALL_CHANNELS.map((type) => {
          const meta = CHANNEL_META[type];
          const Icon = meta.icon;
          const integration = getIntegration(type);
          const status = integration?.status ?? 'not_connected';
          const statusConfig = STATUS_CONFIG[status];
          const StatusIcon = statusConfig.icon;
          const isConfigured = integration && Object.keys(integration.config ?? {}).length > 0;
          const isConnected = status === 'connected';
          const isPaused = status === 'paused';
          const isConfiguredStatus = status === 'configured' || status === 'configuration_required';
          const isError = status === 'error';
          const canConnect = isConfiguredStatus || isConnected;

          return (
            <Card key={type} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${meta.bgColor} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${meta.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.color.split(' ')[1] ?? ''} ${status === 'connecting' ? 'animate-spin' : ''}`} />
                        <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                      </div>
                    </div>
                  </div>
                  {isConnected && (
                    <span className="flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-sm leading-relaxed">{meta.description}</CardDescription>

                {/* WhatsApp reply format rules */}
                {type === 'whatsapp' && (
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">AI Reply Format</p>
                      <p className="text-xs text-muted-foreground mt-1">Choose how the WhatsApp AI replies to customers.</p>
                    </div>
                    <Select value={voiceReplyMode} onValueChange={(value) => setVoiceReplyMode(value as 'disabled' | 'text_only' | 'voice_only' | 'text_and_voice' | 'random')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">Voice disabled — normal text replies</SelectItem>
                        <SelectItem value="text_only">Text only</SelectItem>
                        <SelectItem value="voice_only">Voice only</SelectItem>
                        <SelectItem value="text_and_voice">Text and voice</SelectItem>
                        <SelectItem value="random">Random — some text, some voice</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Random mode chooses independently for every customer message.</p>
                    <Button size="sm" onClick={handleSaveVoiceMode} disabled={savingVoiceMode}>
                      {savingVoiceMode && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Save Reply Rule
                    </Button>
                  </div>
                )}

                {/* WhatsApp QR Code section */}
                {type === 'whatsapp' && (
                  <div className="rounded-lg border border-border p-3 space-y-3">
                    <Tabs value={whatsappMethod} onValueChange={(v) => setWhatsappMethod(v as WhatsAppConnectionMethod)}>
                      <TabsList className="w-full">
                        <TabsTrigger value="cloud_api" className="flex-1 text-xs">Cloud API</TabsTrigger>
                        <TabsTrigger value="qr_code" className="flex-1 text-xs">QR Code</TabsTrigger>
                      </TabsList>
                      <TabsContent value="cloud_api" className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Use the official WhatsApp Cloud API. Configure your credentials below and test the connection.
                        </p>
                      </TabsContent>
                      <TabsContent value="qr_code" className="mt-3 space-y-3">
                        {whatsappQrStatus === 'not_started' && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Scan a QR code with your WhatsApp phone app to connect. No API credentials needed.
                            </p>
                            <Button size="sm" variant="outline" onClick={handleWhatsappQrConnect} disabled={actionLoading === 'qr-connect'}>
                              {actionLoading === 'qr-connect' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1.5" />}
                              Start QR Connection
                            </Button>
                          </>
                        )}
                        {(whatsappQrStatus === 'creating_session' || whatsappQrStatus === 'generating_qr') && (
                          <div className="flex flex-col items-center py-4 gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Generating QR code...</p>
                          </div>
                        )}
                        {whatsappQrStatus === 'waiting_for_scan' && whatsappQrCode && (
                          <div className="flex flex-col items-center py-2 gap-3">
                            <div className="rounded-lg border-2 border-border p-3 bg-white">
                              <img src={whatsappQrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                              Open WhatsApp on your phone, go to Settings &gt; Linked Devices &gt; Link a Device, then scan this QR code.
                            </p>
                            <Button size="sm" variant="ghost" onClick={() => { stopQrPolling(); setWhatsappQrStatus('not_started'); setWhatsappQrCode(null); }}>
                              Cancel
                            </Button>
                          </div>
                        )}
                        {whatsappQrStatus === 'connecting' && (
                          <div className="flex flex-col items-center py-4 gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                            <p className="text-xs text-muted-foreground">Connecting...</p>
                          </div>
                        )}
                        {whatsappQrStatus === 'error' && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-red-700 dark:text-red-400">Connection Failed</p>
                              <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                                {whatsappQrError ?? 'Could not generate QR code. Please try again.'}
                              </p>
                              <Button size="sm" variant="outline" className="mt-2" onClick={handleWhatsappQrConnect} disabled={actionLoading === 'qr-connect'}>
                                Retry
                              </Button>
                            </div>
                          </div>
                        )}
                        {whatsappQrStatus === 'connected' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                              <div className="flex-1">
                                <p className="text-xs font-medium text-green-700 dark:text-green-400">WhatsApp connected via QR</p>
                                {whatsappPhone && <p className="text-xs text-green-600 dark:text-green-500">{whatsappPhone}</p>}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={handleWhatsappQrDisconnect} disabled={actionLoading === 'qr-disconnect'}>
                              {actionLoading === 'qr-disconnect' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                              Disconnect
                            </Button>
                          </div>
                        )}
                        {whatsappQrStatus === 'disconnected' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-800">
                              <XCircle className="w-4 h-4 text-gray-500" />
                              <p className="text-xs text-muted-foreground">WhatsApp disconnected. Click Start to reconnect.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={handleWhatsappQrConnect} disabled={actionLoading === 'qr-connect'}>
                              {actionLoading === 'qr-connect' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1.5" />}
                              Start QR Connection
                            </Button>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                )}

                {/* Webhook URL */}
                {isConfigured && Boolean((integration?.config as Record<string, unknown>)?.verify_token) && (whatsappMethod === 'cloud_api' || type !== 'whatsapp') && (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Webhook URL</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${type}`, 'Webhook URL copied')}
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <code className="block text-xs text-muted-foreground truncate">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/api/webhooks/{type}
                    </code>
                  </div>
                )}

                {/* Website chat embed code */}
                {type === 'website_chat' && isConfigured && (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">Embed Code</span>
                    <code className="block text-xs text-muted-foreground break-all">
                      {`<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/widget-js?business=${activeBusiness?.id}"></script>`}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        const code = `<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/widget-js?business=${activeBusiness?.id}"></script>`;
                        copyToClipboard(code, 'Embed code copied');
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copy embed code
                    </Button>
                  </div>
                )}

                {/* Error message */}
                {isError && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">Connection test failed. Check your credentials and try again.</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/*
                    IMPORTANT: for WhatsApp in QR mode, the generic
                    Test Connection / Connect buttons below don't apply
                    at all - they operate on integration.config /
                    integration.status, which is the Cloud API path.
                    QR mode has its own dedicated flow (Start QR
                    Connection -> scan -> connected) rendered above,
                    inside the QR Code tab. Showing both was confusing:
                    clicking the generic "Connect" button for a WhatsApp
                    QR session did nothing but flip a database status
                    field, with no real connection behind it - so it's
                    hidden here instead.
                  */}
                  {!(type === 'whatsapp' && whatsappMethod === 'qr_code') && (
                    <>
                      {/* Test Connection button */}
                      {isConfigured && meta.canTestConnection && !isConnected && !isPaused && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestConnection(type)}
                          disabled={testing === type}
                        >
                          {testing === type ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                          Test Connection
                        </Button>
                      )}

                      {/* Connect button - only after test passes (configured status) */}
                      {!isConnected && !isPaused && (
                        <Button
                          size="sm"
                          onClick={() => handleConnect(type)}
                          disabled={actionLoading === `connect-${type}` || !canConnect}
                        >
                          {actionLoading === `connect-${type}` ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Plug className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {isConfigured ? 'Connect' : 'Configure'}
                        </Button>
                      )}
                    </>
                  )}

                  {isConnected && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleTogglePause(type)} disabled={actionLoading === `toggle-${type}`}>
                        {actionLoading === `toggle-${type}` ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Power className="w-3.5 h-3.5 mr-1.5" />}
                        Pause
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDisconnect(type)} disabled={actionLoading === `disconnect-${type}`}>
                        {actionLoading === `disconnect-${type}` ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                        Disconnect
                      </Button>
                    </>
                  )}

                  {isPaused && (
                    <>
                      <Button size="sm" onClick={() => handleTogglePause(type)} disabled={actionLoading === `toggle-${type}`}>
                        {actionLoading === `toggle-${type}` ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Power className="w-3.5 h-3.5 mr-1.5" />}
                        Resume
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDisconnect(type)} disabled={actionLoading === `disconnect-${type}`}>
                        <XCircle className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                      </Button>
                    </>
                  )}

                  <Button variant="ghost" size="sm" onClick={() => openConfig(type)}>
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Settings
                  </Button>

                  {meta.docsUrl !== '#' && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Docs
                      </a>
                    </Button>
                  )}
                </div>

                {integration?.last_connected_at && (
                  <p className="text-xs text-muted-foreground">
                    Last connected: {new Date(integration.last_connected_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Integrations Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {[
              { step: 'Configure', desc: 'Enter your channel API credentials and webhook verify token.' },
              { step: 'Test Connection', desc: 'Verify your credentials work before going live.' },
              { step: 'Connect', desc: 'Activate the channel. Messages will start flowing to your AI agent.' },
              { step: 'Set Webhook', desc: 'Copy the webhook URL to your provider dashboard (Meta, LinkedIn, etc.).' },
              { step: 'Assign Agent', desc: 'Go to AI Agents and assign an agent to handle messages from each channel.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <span className="text-sm font-medium">{item.step}</span>
                  <span className="text-sm text-muted-foreground"> — {item.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Saving credentials alone does not connect a channel. Test the connection first, then click Connect to activate. Tokens are stored securely and never exposed in the widget embed code.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={configDialog !== null} onOpenChange={(open) => !open && setConfigDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {configDialog && (() => {
                const meta = CHANNEL_META[configDialog];
                const Icon = meta.icon;
                return <><Icon className={`w-5 h-5 ${meta.color}`} /> {meta.label} Settings</>;
              })()}
            </DialogTitle>
            <DialogDescription>
              {configDialog && CHANNEL_META[configDialog].description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {configDialog && CHANNEL_META[configDialog].configFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key} className="text-sm">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={configValues[field.key] ?? ''}
                  onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
                {field.helpText && (
                  <p className="text-xs text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            ))}
            {configDialog && (
              <p className="text-xs text-muted-foreground">
                {CHANNEL_META[configDialog].configFields.some(f => f.type === 'password') &&
                  'Password fields are pre-filled with stored values for security. Leave blank to keep existing value.'}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
