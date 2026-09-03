'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Send, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GroupRules, GroupResponseMode, Agent, Product, ProductCategory } from '@/lib/types/database';
import { shouldReplyInGroup, classifyPriceInquiry, RESPONSE_MODES } from '@/lib/group-rules';

export default function GroupRulesPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<GroupRules | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<{ action: 'REPLY' | 'IGNORE'; reason: string; keywords?: string[] } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!activeBusiness) { setLoading(false); return; }
    try {
      const [rulesRes, agentsRes, productsRes, categoriesRes] = await Promise.all([
        supabase.from('group_rules').select('*').eq('business_id', activeBusiness.id).maybeSingle(),
        supabase.from('agents').select('*').eq('business_id', activeBusiness.id).eq('status', 'active'),
        supabase.from('products').select('*').eq('business_id', activeBusiness.id).eq('status', 'active'),
        supabase.from('product_categories').select('*').eq('business_id', activeBusiness.id),
      ]);

      if (rulesRes.error) {
        toast({ title: 'Failed to load group rules', description: rulesRes.error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }

      let currentRules = rulesRes.data as GroupRules | null;

      if (!currentRules) {
        const { data: newRules, error: insertError } = await supabase
          .from('group_rules')
          .insert({
            business_id: activeBusiness.id,
            group_ai_enabled: false,
            response_mode: 'disabled',
            allowed_category_ids: [],
            allowed_product_ids: [],
            allow_price_list: true,
            allow_quotation: false,
            require_product_name: true,
            response_language: 'English',
            max_response_length: 300,
            custom_rules: [],
          })
          .select()
          .maybeSingle();

        if (insertError) {
          toast({ title: 'Failed to create group rules', description: insertError.message, variant: 'destructive' });
          setLoading(false);
          return;
        }
        currentRules = newRules as GroupRules;
      }

      setRules(currentRules);
      setAgents(agentsRes.data as Agent[] ?? []);
      setProducts(productsRes.data as Product[] ?? []);
      setCategories(categoriesRes.data as ProductCategory[] ?? []);
    } catch (err) {
      toast({ title: 'Failed to load group rules', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeBusiness, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async () => {
    if (!rules || !activeBusiness) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('group_rules')
        .update({
          group_ai_enabled: rules.group_ai_enabled,
          response_mode: rules.response_mode,
          agent_id: rules.agent_id,
          allowed_category_ids: rules.allowed_category_ids,
          allowed_product_ids: rules.allowed_product_ids,
          allow_price_list: rules.allow_price_list,
          allow_quotation: rules.allow_quotation,
          require_product_name: rules.require_product_name,
          response_language: rules.response_language,
          max_response_length: rules.max_response_length,
          custom_rules: rules.custom_rules ?? [],
        })
        .eq('id', rules.id);

      if (error) {
        toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Group rules saved' });
      }
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const runTest = () => {
    if (!rules || !testMessage.trim()) return;
    const { shouldReply, reason } = shouldReplyInGroup(rules, testMessage);
    const keywords = rules.response_mode === 'price_inquiries_only'
      ? classifyPriceInquiry(testMessage).matchedKeywords
      : undefined;
    setTestResult({ action: shouldReply ? 'REPLY' : 'IGNORE', reason, keywords });
  };

  const toggleCategory = (catId: string) => {
    if (!rules) return;
    const ids = rules.allowed_category_ids.includes(catId)
      ? rules.allowed_category_ids.filter((id) => id !== catId)
      : [...rules.allowed_category_ids, catId];
    setRules({ ...rules, allowed_category_ids: ids });
  };

  const toggleProduct = (prodId: string) => {
    if (!rules) return;
    const ids = rules.allowed_product_ids.includes(prodId)
      ? rules.allowed_product_ids.filter((id) => id !== prodId)
      : [...rules.allowed_product_ids, prodId];
    setRules({ ...rules, allowed_product_ids: ids });
  };

  const addCustomRule = () => {
    if (!rules) return;
    setRules({
      ...rules,
      custom_rules: [...(rules.custom_rules ?? []), { condition: '', action: 'reply' }],
    });
  };

  const updateCustomRule = (index: number, field: 'condition' | 'action', value: string) => {
    if (!rules) return;
    const updated = [...(rules.custom_rules ?? [])];
    updated[index] = { ...updated[index], [field]: value };
    setRules({ ...rules, custom_rules: updated });
  };

  const removeCustomRule = (index: number) => {
    if (!rules) return;
    const updated = (rules.custom_rules ?? []).filter((_, i) => i !== index);
    setRules({ ...rules, custom_rules: updated });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading group rules...</div>;
  if (!rules) return <div className="text-muted-foreground">Group rules not found. Please complete onboarding first.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Configure how your AI agent behaves in WhatsApp group conversations.</p>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Rules
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Group AI Settings</CardTitle>
          <CardDescription>Control whether and how your AI agent participates in group conversations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">Group AI Enabled</p>
              <p className="text-xs text-muted-foreground">Master switch for AI participation in groups</p>
            </div>
            <Switch checked={rules.group_ai_enabled} onCheckedChange={(v) => setRules({ ...rules, group_ai_enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label>Response Mode</Label>
            <Select value={rules.response_mode} onValueChange={(v) => setRules({ ...rules, response_mode: v as GroupResponseMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSE_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{RESPONSE_MODES.find((m) => m.value === rules.response_mode)?.description}</p>
          </div>

          <div className="space-y-2">
            <Label>Assigned Agent</Label>
            <Select value={rules.agent_id ?? 'none'} onValueChange={(v) => setRules({ ...rules, agent_id: v === 'none' ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No agent assigned</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {rules.response_mode === 'price_inquiries_only' && (
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <h4 className="text-sm font-semibold">Price Inquiry Settings</h4>

              <div className="space-y-2">
                <Label>Allowed Product Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {categories.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No categories created yet.</p>
                  ) : categories.map((cat) => (
                    <Badge
                      key={cat.id}
                      variant={rules.allowed_category_ids.includes(cat.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(cat.id)}
                    >{cat.name}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Allowed Products</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto scrollbar-thin">
                  {products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No products created yet.</p>
                  ) : products.map((prod) => (
                    <Badge
                      key={prod.id}
                      variant={rules.allowed_product_ids.includes(prod.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleProduct(prod.id)}
                    >{prod.name}</Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <span className="text-sm">Allow price list response</span>
                  <Switch checked={rules.allow_price_list} onCheckedChange={(v) => setRules({ ...rules, allow_price_list: v })} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <span className="text-sm">Allow quotation response</span>
                  <Switch checked={rules.allow_quotation} onCheckedChange={(v) => setRules({ ...rules, allow_quotation: v })} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <span className="text-sm">Require product name in inquiry</span>
                <Switch checked={rules.require_product_name} onCheckedChange={(v) => setRules({ ...rules, require_product_name: v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Response Language</Label>
                  <Input value={rules.response_language} onChange={(e) => setRules({ ...rules, response_language: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Response Length</Label>
                  <Input type="number" value={rules.max_response_length ?? 300} onChange={(e) => setRules({ ...rules, max_response_length: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}

          {rules.response_mode === 'custom_rules' && (
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Custom Rules</h4>
                <Button size="sm" variant="outline" onClick={addCustomRule}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Rule
                </Button>
              </div>
              {(rules.custom_rules ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No custom rules defined. Click "Add Rule" to create one.</p>
              )}
              {(rules.custom_rules ?? []).map((rule, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-border">
                  <Input
                    className="flex-1"
                    placeholder="Condition (e.g. message contains 'order')"
                    value={rule.condition}
                    onChange={(e) => updateCustomRule(i, 'condition', e.target.value)}
                  />
                  <Select value={rule.action} onValueChange={(v) => updateCustomRule(i, 'action', v)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply">Reply</SelectItem>
                      <SelectItem value="ignore">Ignore</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" onClick={() => removeCustomRule(i)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Panel</CardTitle>
          <CardDescription>Enter a sample group message to see if the rule would classify it as REPLY or IGNORE. Uses deterministic local rule simulation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Sample Group Message</Label>
            <Textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={2} placeholder="e.g. What's the price of Amoxicillin?" />
          </div>
          <Button onClick={runTest} disabled={!testMessage.trim()} className="gap-2">
            <Send className="w-4 h-4" /> Test Message
          </Button>

          {testResult && (
            <div className={`p-4 rounded-lg border ${testResult.action === 'REPLY' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800'}`}>
              <div className="flex items-center gap-2 mb-2">
                {testResult.action === 'REPLY' ? (
                  <><Badge className="bg-green-600 text-white">REPLY</Badge></>
                ) : (
                  <><Badge variant="secondary">IGNORE</Badge></>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{testResult.reason}</p>
              {testResult.keywords && testResult.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {testResult.keywords.map((kw) => <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>)}
                </div>
              )}
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              This test panel uses deterministic local rule simulation, not AI analysis. It checks for price-related keywords in the message. No external AI API is called.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
