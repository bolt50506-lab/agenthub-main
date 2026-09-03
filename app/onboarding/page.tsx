'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, Loader2, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';
import { AGENT_GOALS } from '@/lib/types/database';

const INDUSTRIES = [
  'Healthcare & Pharmacy',
  'Retail & E-commerce',
  'Real Estate',
  'Education',
  'Finance & Insurance',
  'Hospitality & Travel',
  'Food & Beverage',
  'Technology & Software',
  'Manufacturing',
  'Professional Services',
  'Other',
];

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
];

const LANGUAGES = ['English', 'Spanish', 'French', 'Arabic', 'Hindi', 'Portuguese', 'German', 'Mandarin'];

export default function OnboardingPage() {
  const { user, profile, activeBusiness, refreshProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Business Info
  const [bizName, setBizName] = useState('');
  const [industry, setIndustry] = useState('');
  const [bizDescription, setBizDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('UTC');

  // Step 2: Working Hours
  const [workingHours, setWorkingHours] = useState<Record<string, { enabled: boolean; open: string; close: string }>>(
    DAYS.reduce((acc, d) => {
      acc[d.key] = { enabled: d.key !== 'saturday' && d.key !== 'sunday', open: '09:00', close: '17:00' };
      return acc;
    }, {} as Record<string, { enabled: boolean; open: string; close: string }>)
  );
  const [appointmentDuration, setAppointmentDuration] = useState(30);

  // Step 3: Agent Goal
  const [agentGoal, setAgentGoal] = useState('sales');

  // Step 4: Communication Behavior
  const [tone, setTone] = useState('professional');
  const [agentLanguages, setAgentLanguages] = useState<string[]>(['English']);
  const [greetingBehavior, setGreetingBehavior] = useState('Hello! How can I help you today?');
  const [autoCreateLeads, setAutoCreateLeads] = useState(true);
  const [appointmentsEnabled, setAppointmentsEnabled] = useState(true);
  const [autoFollowupsEnabled, setAutoFollowupsEnabled] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        return;
      }
      if (profile?.onboarding_completed) {
        router.push('/dashboard');
        return;
      }
      if (activeBusiness) {
        setBizName(activeBusiness.name);
        if (activeBusiness.industry) setIndustry(activeBusiness.industry);
        if (activeBusiness.description) setBizDescription(activeBusiness.description);
        if (activeBusiness.website) setWebsite(activeBusiness.website);
        if (activeBusiness.phone) setPhone(activeBusiness.phone);
        if (activeBusiness.address) setAddress(activeBusiness.address);
        if (activeBusiness.country) setCountry(activeBusiness.country);
        if (activeBusiness.timezone) setTimezone(activeBusiness.timezone);
        if (activeBusiness.working_hours) setWorkingHours(activeBusiness.working_hours);
        if (activeBusiness.appointment_duration) setAppointmentDuration(activeBusiness.appointment_duration);
      }
    }
  }, [user, profile, activeBusiness, loading, router]);

  const toggleLanguage = (lang: string) => {
    setAgentLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    if (!user) return;
    if (!activeBusiness) {
      toast({ title: 'No business assigned', description: 'Please contact your administrator to assign a business to your account.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);

    try {
      // Update business
      await supabase
        .from('businesses')
        .update({
          name: bizName,
          industry,
          description: bizDescription,
          website,
          phone,
          address,
          country,
          timezone,
          working_hours: workingHours,
          appointment_duration: appointmentDuration,
        })
        .eq('id', activeBusiness.id);

      // Create default agent
      const goalLabel = AGENT_GOALS.find((g) => g.value === agentGoal)?.label ?? agentGoal;
      const { data: agent } = await supabase
        .from('agents')
        .insert({
          business_id: activeBusiness.id,
          name: `${bizName} Assistant`,
          purpose: goalLabel,
          description: `AI agent for ${bizName} focused on ${goalLabel.toLowerCase()}`,
          communication_style: tone,
          primary_goal: agentGoal,
          supported_languages: agentLanguages,
          status: 'active',
          enabled_capabilities: ['search_knowledge', 'search_products', 'search_prices', 'create_lead'],
        })
        .select()
        .maybeSingle();

      // Create agent settings
      if (agent) {
        await supabase.from('agent_settings').insert({
          agent_id: agent.id,
          business_id: activeBusiness.id,
          tone,
          greeting_behavior: greetingBehavior,
          auto_create_leads: autoCreateLeads,
          appointments_enabled: appointmentsEnabled,
          auto_followups_enabled: autoFollowupsEnabled,
          response_language: agentLanguages[0] || 'English',
        });
      }

      // Mark onboarding complete
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      await refreshProfile();

      toast({ title: 'Setup complete!', description: 'Your workspace is ready.' });
      router.push('/dashboard');
    } catch (err) {
      toast({ title: 'Setup failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold tracking-tight">AgentHub</span>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  s < step
                    ? 'bg-primary text-primary-foreground'
                    : s === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Business Information'}
              {step === 2 && 'Working Hours'}
              {step === 3 && 'AI Agent Goal'}
              {step === 4 && 'Communication Behavior'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bizName">Business Name</Label>
                  <Input id="bizName" value={bizName} onChange={(e) => setBizName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bizDescription">Business Description</Label>
                  <Textarea id="bizDescription" value={bizDescription} onChange={(e) => setBizDescription(e.target.value)} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Time Zone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-3">
                  {DAYS.map((day) => (
                    <div key={day.key} className="flex items-center gap-4 p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3 flex-1">
                        <Switch
                          checked={workingHours[day.key].enabled}
                          onCheckedChange={(checked) =>
                            setWorkingHours((prev) => ({
                              ...prev,
                              [day.key]: { ...prev[day.key], enabled: checked },
                            }))
                          }
                        />
                        <span className="text-sm font-medium w-24">{day.label}</span>
                      </div>
                      {workingHours[day.key].enabled && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={workingHours[day.key].open}
                            onChange={(e) =>
                              setWorkingHours((prev) => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], open: e.target.value },
                              }))
                            }
                            className="w-28"
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={workingHours[day.key].close}
                            onChange={(e) =>
                              setWorkingHours((prev) => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], close: e.target.value },
                              }))
                            }
                            className="w-28"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label htmlFor="duration">Default Appointment Duration (minutes)</Label>
                  <Select value={String(appointmentDuration)} onValueChange={(v) => setAppointmentDuration(Number(v))}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60, 90, 120].map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  What is the primary goal of your AI agent? You can change this later.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {AGENT_GOALS.map((goal) => (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => setAgentGoal(goal.value)}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        agentGoal === goal.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="text-sm font-medium block">{goal.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-2">
                  <Label>Agent Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Languages</Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <Badge
                        key={lang}
                        variant={agentLanguages.includes(lang) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleLanguage(lang)}
                      >
                        {lang}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="greeting">Greeting Message</Label>
                  <Textarea
                    id="greeting"
                    value={greetingBehavior}
                    onChange={(e) => setGreetingBehavior(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium">Auto-create leads</p>
                      <p className="text-xs text-muted-foreground">Create leads from conversations automatically</p>
                    </div>
                    <Switch checked={autoCreateLeads} onCheckedChange={setAutoCreateLeads} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium">Appointments enabled</p>
                      <p className="text-xs text-muted-foreground">Allow the agent to book appointments</p>
                    </div>
                    <Switch checked={appointmentsEnabled} onCheckedChange={setAppointmentsEnabled} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium">Automatic follow-ups</p>
                      <p className="text-xs text-muted-foreground">Create follow-up tasks automatically</p>
                    </div>
                    <Switch checked={autoFollowupsEnabled} onCheckedChange={setAutoFollowupsEnabled} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
          <div className="flex items-center justify-between px-6 pb-6">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {step < 4 ? (
              <Button onClick={handleNext}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Complete Setup
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
