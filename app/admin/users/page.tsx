'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users } from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string | null; is_super_admin: boolean; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('id, email, full_name, is_super_admin, created_at').order('created_at', { ascending: false });
      setUsers(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading users...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">All registered users on the platform.</p>
      </div>
      {users.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><Users className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No users registered yet.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{u.is_super_admin ? <Badge>Super Admin</Badge> : <Badge variant="secondary">User</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
