'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCog, Plus, Loader2, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { BusinessMember, Profile } from '@/lib/types/database';

interface TeamMember extends BusinessMember {
  profiles?: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

export default function TeamPage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  const fetchMembers = async () => {
    if (!activeBusiness) return;
    const { data } = await supabase
      .from('business_members')
      .select('*, profiles:profiles!business_members_user_id_fkey(id, email, full_name, avatar_url)')
      .eq('business_id', activeBusiness.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    setMembers(data as TeamMember[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [activeBusiness]);

  const handleInvite = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    // Look up user by email
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', inviteEmail).maybeSingle();
    if (!profile) {
      toast({ title: 'User not found', description: 'No account found with that email. Ask them to sign up first.', variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from('business_members').insert({
      business_id: activeBusiness.id,
      user_id: profile.id,
      role: inviteRole,
      status: 'active',
    });
    if (error) {
      toast({ title: 'Failed to add member', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'added_team_member', entity_type: 'business_member',
      });
      toast({ title: 'Team member added', description: `${inviteEmail} is now a ${inviteRole}.` });
      setInviteEmail('');
      setInviteOpen(false);
      await fetchMembers();
    }
    setSubmitting(false);
  };

  const updateRole = async (member: TeamMember, newRole: string) => {
    await supabase.from('business_members').update({ role: newRole }).eq('id', member.id);
    await fetchMembers();
    toast({ title: 'Role updated' });
  };

  const removeMember = async (member: TeamMember) => {
    await supabase.from('business_members').update({ status: 'removed' }).eq('id', member.id);
    await fetchMembers();
    toast({ title: 'Member removed' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading team...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} team member{members.length !== 1 ? 's' : ''}</p>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Member</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" /></div>
                <div className="space-y-2"><Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">The user must have an AgentHub account with this email. Ask them to sign up first if they don&apos;t.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={handleInvite} disabled={submitting || !inviteEmail}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {members.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><UserCog className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>{canManage && <TableHead>Actions</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.profiles?.full_name || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">{member.profiles?.email || '-'}</TableCell>
                  <TableCell>
                    {canManage && member.role !== 'owner' ? (
                      <Select value={member.role} onValueChange={(v) => updateRole(member, v)}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="capitalize">{member.role}</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {member.role !== 'owner' && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeMember(member)}>Remove</Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
