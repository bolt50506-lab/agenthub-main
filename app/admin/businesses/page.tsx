'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building, Plus, Loader2, Crown, Search, MoreHorizontal, Ban, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SubscriptionPlan, BusinessSubscription } from '@/lib/types/database';

interface BusinessWithDetails {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  created_at: string;
  subscription_plan_id: string | null;
  subscription_status: string | null;
  owner_email: string | null;
  owner_name: string | null;
  plan: SubscriptionPlan | null;
  subscription: BusinessSubscription | undefined;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const INDUSTRIES = [
  'Healthcare & Pharmacy', 'Retail & E-commerce', 'Real Estate', 'Education',
  'Finance & Insurance', 'Hospitality & Travel', 'Food & Beverage',
  'Technology & Software', 'Manufacturing', 'Professional Services', 'Other',
];

const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessWithDetails[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  // Multi-step form state
  const [formStep, setFormStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [newBiz, setNewBiz] = useState({
    name: '', industry: '', description: '', website: '', phone: '', address: '', country: '', timezone: 'UTC',
    ownerName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '',
    planId: '', billingCycle: 'monthly',
  });

  const loadData = useCallback(async () => {
    const [bizRes, planRes] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);

    const planMap = new Map<string, SubscriptionPlan>();
    (planRes.data as SubscriptionPlan[] | null)?.forEach((p) => planMap.set(p.id, p));

    // Get owner info for each business via business_members + profiles
    const businessIds = (bizRes.data ?? []).map((b: Record<string, unknown>) => b.id as string);
    let ownerMap = new Map<string, { email: string | null; name: string | null }>();

    if (businessIds.length > 0) {
      const { data: members } = await supabase
        .from('business_members')
        .select('business_id, user_id, profiles!inner(email, full_name)')
        .eq('role', 'owner')
        .in('business_id', businessIds);

      (members ?? []).forEach((m: Record<string, unknown>) => {
        const profiles = m.profiles as Record<string, unknown>;
        ownerMap.set(m.business_id as string, {
          email: profiles?.email as string ?? null,
          name: profiles?.full_name as string ?? null,
        });
      });
    }

    // Get subscriptions
    let subMap = new Map<string, BusinessSubscription>();
    if (businessIds.length > 0) {
      const { data: subs } = await supabase
        .from('business_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .in('business_id', businessIds);

      (subs ?? []).forEach((s: Record<string, unknown>) => {
        subMap.set(s.business_id as string, {
          id: s.id as string,
          business_id: s.business_id as string,
          plan_id: s.plan_id as string,
          status: s.status as BusinessSubscription['status'],
          billing_cycle: s.billing_cycle as BusinessSubscription['billing_cycle'],
          start_date: s.start_date as string,
          end_date: s.end_date as string | null,
          created_at: s.created_at as string,
          updated_at: s.updated_at as string,
          plan: s.plan as SubscriptionPlan | null,
        });
      });
    }

    const mapped = (bizRes.data ?? []).map((b: Record<string, unknown>) => {
      const bizId = b.id as string;
      const planId = b.subscription_plan_id as string | null;
      const owner = ownerMap.get(bizId);
      const sub = subMap.get(bizId);
      return {
        id: bizId,
        name: b.name as string,
        industry: b.industry as string | null,
        status: b.status as string,
        created_at: b.created_at as string,
        subscription_plan_id: planId,
        subscription_status: (sub?.status ?? b.subscription_status) as string | null,
        owner_email: owner?.email ?? null,
        owner_name: owner?.name ?? null,
        plan: planId ? planMap.get(planId) ?? sub?.plan ?? null : sub?.plan ?? null,
        subscription: sub,
      };
    });

    setBusinesses(mapped);
    setPlans(planRes.data as SubscriptionPlan[] ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = businesses.filter((b) => {
    const matchesSearch = !searchQuery ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.owner_email ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.industry ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || b.subscription_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetForm = () => {
    setFormStep(1);
    setNewBiz({
      name: '', industry: '', description: '', website: '', phone: '', address: '', country: '', timezone: 'UTC',
      ownerName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '',
      planId: '', billingCycle: 'monthly',
    });
  };

  const createBusiness = async () => {
    if (!newBiz.name || !newBiz.ownerEmail || !newBiz.planId || !newBiz.ownerName || !newBiz.ownerPassword) {
      toast({ title: 'Missing fields', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }

    setCreating(true);

    try {
      // Step 1: Create business via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_business_with_plan', {
        p_name: newBiz.name,
        p_industry: newBiz.industry || null,
        p_description: newBiz.description || null,
        p_website: newBiz.website || null,
        p_phone: newBiz.phone || null,
        p_address: newBiz.address || null,
        p_country: newBiz.country || null,
        p_timezone: newBiz.timezone,
        p_owner_email: newBiz.ownerEmail,
        p_owner_full_name: newBiz.ownerName,
        p_owner_phone: newBiz.ownerPhone || null,
        p_plan_id: newBiz.planId,
        p_billing_cycle: newBiz.billingCycle,
      });

      if (rpcError) {
        toast({ title: 'Failed to create business', description: rpcError.message, variant: 'destructive' });
        setCreating(false);
        return;
      }

      const result = rpcData as { business_id: string; owner_found: boolean };

      // Step 2: If owner doesn't exist yet, create auth account via edge function
      if (!result.owner_found) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          toast({ title: 'Business created', description: 'Business created but owner account creation failed — no session. The owner must sign up manually.', variant: 'default' });
          setCreating(false);
          setDialogOpen(false);
          resetForm();
          loadData();
          return;
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/create-business-owner`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({
            business_id: result.business_id,
            owner_email: newBiz.ownerEmail,
            owner_full_name: newBiz.ownerName,
            owner_phone: newBiz.ownerPhone || null,
            owner_password: newBiz.ownerPassword,
          }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
          toast({
            title: 'Business created, owner account failed',
            description: `Business was created but the owner account could not be created: ${errBody.error}. The owner email may need to be invited manually.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Business created successfully',
            description: `${newBiz.name} has been set up with the selected plan. Owner account created for ${newBiz.ownerEmail}.`,
          });
        }
      } else {
        toast({
          title: 'Business created successfully',
          description: `${newBiz.name} has been set up and linked to existing user ${newBiz.ownerEmail}.`,
        });
      }

      setCreating(false);
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      toast({ title: 'Failed to create business', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      setCreating(false);
    }
  };

  const updateSubscriptionStatus = async (businessId: string, status: string) => {
    setActionLoading(businessId);
    const { error } = await supabase.rpc('update_business_subscription_status', {
      p_business_id: businessId,
      p_status: status,
    });

    setActionLoading(null);
    if (error) {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated', description: `Subscription is now ${status}.` });
      loadData();
    }
  };

  const changePlan = async (businessId: string, planId: string) => {
    setActionLoading(businessId);
    const { error } = await supabase.rpc('update_business_subscription_status', {
      p_business_id: businessId,
      p_status: 'active',
      p_plan_id: planId,
    });

    setActionLoading(null);
    if (error) {
      toast({ title: 'Failed to change plan', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plan updated', description: 'The subscription plan has been changed.' });
      loadData();
    }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading businesses...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Businesses</h2>
          <p className="text-sm text-muted-foreground mt-1">Create businesses, assign subscription plans, and manage account status.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Create Business
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Business</DialogTitle>
              <DialogDescription>
                Step {formStep} of 3 — {formStep === 1 ? 'Business Information' : formStep === 2 ? 'Business Owner Account' : 'Select Pricing Plan'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${s <= formStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {s}
                    </div>
                    {s < 3 && <div className={`flex-1 h-0.5 ${s < formStep ? 'bg-primary' : 'bg-border'}`} />}
                  </div>
                ))}
              </div>

              {formStep === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="biz-name">Business Name *</Label>
                    <Input id="biz-name" value={newBiz.name} onChange={(e) => setNewBiz({ ...newBiz, name: e.target.value })} placeholder="Acme Inc." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="biz-industry">Industry</Label>
                    <Select value={newBiz.industry} onValueChange={(v) => setNewBiz({ ...newBiz, industry: v })}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="biz-description">Business Description</Label>
                    <Textarea id="biz-description" value={newBiz.description} onChange={(e) => setNewBiz({ ...newBiz, description: e.target.value })} rows={2} placeholder="Brief description of the business" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="biz-website">Website</Label>
                      <Input id="biz-website" value={newBiz.website} onChange={(e) => setNewBiz({ ...newBiz, website: e.target.value })} placeholder="https://" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="biz-phone">Phone</Label>
                      <Input id="biz-phone" value={newBiz.phone} onChange={(e) => setNewBiz({ ...newBiz, phone: e.target.value })} placeholder="+1..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="biz-address">Address</Label>
                      <Input id="biz-address" value={newBiz.address} onChange={(e) => setNewBiz({ ...newBiz, address: e.target.value })} placeholder="123 Main St" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="biz-country">Country</Label>
                      <Input id="biz-country" value={newBiz.country} onChange={(e) => setNewBiz({ ...newBiz, country: e.target.value })} placeholder="United States" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="biz-timezone">Time Zone</Label>
                    <Select value={newBiz.timezone} onValueChange={(v) => setNewBiz({ ...newBiz, timezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {formStep === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="owner-name">Owner Full Name *</Label>
                    <Input id="owner-name" value={newBiz.ownerName} onChange={(e) => setNewBiz({ ...newBiz, ownerName: e.target.value })} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-email">Owner Email *</Label>
                    <Input id="owner-email" type="email" value={newBiz.ownerEmail} onChange={(e) => setNewBiz({ ...newBiz, ownerEmail: e.target.value })} placeholder="owner@company.com" />
                    <p className="text-xs text-muted-foreground">If an account with this email already exists, it will be linked. Otherwise, a new account will be created.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-phone">Owner Phone</Label>
                    <Input id="owner-phone" value={newBiz.ownerPhone} onChange={(e) => setNewBiz({ ...newBiz, ownerPhone: e.target.value })} placeholder="+1..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-password">Initial Password *</Label>
                    <Input id="owner-password" type="password" value={newBiz.ownerPassword} onChange={(e) => setNewBiz({ ...newBiz, ownerPassword: e.target.value })} placeholder="Minimum 8 characters" />
                    <p className="text-xs text-muted-foreground">The owner can change this password after their first login.</p>
                  </div>
                </>
              )}

              {formStep === 3 && (
                <>
                  <div className="space-y-3">
                    {plans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setNewBiz({ ...newBiz, planId: plan.id })}
                        className={`w-full p-4 rounded-lg border text-left transition-all ${newBiz.planId === plan.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {plan.slug === 'enterprise' && <Crown className="w-4 h-4 text-amber-500" />}
                            <span className="font-medium">{plan.name}</span>
                          </div>
                          <span className="text-sm font-semibold">${(plan.price_cents / 100).toFixed(0)}/mo</span>
                        </div>
                        {plan.description && <p className="text-xs text-muted-foreground mb-2">{plan.description}</p>}
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-xs">{plan.max_agents} agents</Badge>
                          <Badge variant="outline" className="text-xs">{plan.max_team_members} members</Badge>
                          <Badge variant="outline" className="text-xs">{plan.max_leads} leads</Badge>
                          <Badge variant="outline" className="text-xs">{plan.max_appointments} appointments</Badge>
                          <Badge variant="outline" className="text-xs">{plan.max_knowledge_items} knowledge items</Badge>
                          <Badge variant="outline" className="text-xs">{plan.max_products} products</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Cycle</Label>
                    <Select value={newBiz.billingCycle} onValueChange={(v) => setNewBiz({ ...newBiz, billingCycle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between">
              <Button variant="outline" onClick={() => { if (formStep > 1) setFormStep(formStep - 1); else setDialogOpen(false); }}>
                {formStep > 1 ? 'Back' : 'Cancel'}
              </Button>
              {formStep < 3 ? (
                <Button
                  onClick={() => setFormStep(formStep + 1)}
                  disabled={formStep === 1 && !newBiz.name}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={createBusiness} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Business
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, owner, or industry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><Building className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">{businesses.length === 0 ? 'No businesses yet. Create one to get started.' : 'No businesses match your filters.'}</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Sub Status</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((biz) => (
                <TableRow key={biz.id}>
                  <TableCell className="font-medium">{biz.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{biz.owner_name ?? '-'}</span>
                      <span className="text-xs text-muted-foreground">{biz.owner_email ?? '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{biz.industry || '-'}</TableCell>
                  <TableCell>
                    {biz.plan ? (
                      <div className="flex items-center gap-1.5">
                        {biz.plan.slug === 'enterprise' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                        <Badge variant="secondary">{biz.plan.name}</Badge>
                      </div>
                    ) : (
                      <Badge variant="outline">No plan</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={SUBSCRIPTION_STATUS_COLORS[biz.subscription_status ?? ''] ?? 'bg-gray-100'}>
                      <span className="capitalize">{biz.subscription_status ?? '-'}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{biz.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(biz.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={actionLoading === biz.id}>
                          {actionLoading === biz.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Subscription</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => updateSubscriptionStatus(biz.id, 'active')}>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" /> Activate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateSubscriptionStatus(biz.id, 'trial')}>
                          <Clock className="w-4 h-4 mr-2 text-blue-500" /> Set Trial
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateSubscriptionStatus(biz.id, 'suspended')}>
                          <Ban className="w-4 h-4 mr-2 text-red-500" /> Suspend
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateSubscriptionStatus(biz.id, 'cancelled')}>
                          <XCircle className="w-4 h-4 mr-2 text-gray-500" /> Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateSubscriptionStatus(biz.id, 'expired')}>
                          <Calendar className="w-4 h-4 mr-2 text-orange-500" /> Mark Expired
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Change Plan</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {plans.map((plan) => (
                          <DropdownMenuItem key={plan.id} onClick={() => changePlan(biz.id, plan.id)}>
                            {plan.name} (${(plan.price_cents / 100).toFixed(0)}/mo)
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
