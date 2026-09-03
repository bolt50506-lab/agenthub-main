'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AdminSettingsPage() {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure platform-wide settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Configuration</CardTitle>
          <CardDescription>Global settings that affect all businesses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">Allow New Signups</p>
              <p className="text-xs text-muted-foreground">Allow new businesses to register on the platform</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">Require Email Verification</p>
              <p className="text-xs text-muted-foreground">Require new users to verify their email before accessing the platform</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">Maintenance Mode</p>
              <p className="text-xs text-muted-foreground">Temporarily disable access to the platform</p>
            </div>
            <Switch />
          </div>
          <Button onClick={() => toast({ title: 'Settings saved' })}>Save Platform Settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default AI Configuration</CardTitle>
          <CardDescription>Default AI provider settings for new businesses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="text-sm">Default Primary Provider</span>
            <Badge variant="secondary">Google Gemini</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="text-sm">Default Fallback Provider</span>
            <Badge variant="secondary">Groq</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="text-sm">Default Temperature</span>
            <Badge variant="secondary">0.7</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
