'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Agreement = {
  id: string;
  business_id: string;
  voice_profile_id: string | null;
  business_name: string;
  voice_name: string;
  provider: string;
  agreement_version: string;
  agreement_text: string;
  accepted_at: string;
};

export default function VoiceCloneAgreementsPage() {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/voice-clone-agreements', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({ title: 'Unable to load agreements', description: result.error || 'Please try again', variant: 'destructive' });
      } else {
        setAgreements(result.agreements || []);
      }
      setLoading(false);
    };
    load();
  }, [toast]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading voice cloning agreements...</div>;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold"><FileSignature className="h-6 w-6" /> Voice Clone Agreements</h2>
        <p className="text-muted-foreground">Immutable consent records accepted before businesses created cloned voices.</p>
      </div>

      {agreements.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No voice cloning agreements have been accepted yet.</CardContent></Card>
      ) : agreements.map((agreement) => (
        <Card key={agreement.id}>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg">{agreement.business_name}</CardTitle>
                <CardDescription>Voice: {agreement.voice_name}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{agreement.provider}</Badge>
                <Badge variant="outline">{agreement.agreement_version}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Accepted {new Date(agreement.accepted_at).toLocaleString()}</p>
            <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === agreement.id ? null : agreement.id)}>
              {expanded === agreement.id ? 'Hide Agreement' : 'View Agreement'}
            </Button>
            {expanded === agreement.id && (
              <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm font-sans leading-6">{agreement.agreement_text}</pre>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
