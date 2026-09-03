'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Search, BookOpen, MoreVertical, Edit, Trash2, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExportDialog } from '@/components/import-export-dialog';
import { type ColumnDef, type ImportRowError } from '@/lib/import-export/csv';
import type { KnowledgeItem, KnowledgeCategory } from '@/lib/types/database';

const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'title', label: 'Title', required: true, type: 'text' },
  { key: 'category', label: 'Category', required: true, type: 'select', options: ['business_info', 'products', 'services', 'faqs', 'policies', 'documents'] },
  { key: 'content', label: 'Content', required: true, type: 'text' },
  { key: 'tags', label: 'Tags (comma-separated)', type: 'text' },
];

const CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: 'business_info', label: 'Business Information' },
  { value: 'products', label: 'Products' },
  { value: 'services', label: 'Services' },
  { value: 'faqs', label: 'FAQs' },
  { value: 'policies', label: 'Policies' },
  { value: 'documents', label: 'Documents' },
];

export default function KnowledgeBasePage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'business_info' as KnowledgeCategory, content: '', tags: '' });

  const fetchItems = async () => {
    if (!activeBusiness) return;
    let query = supabase.from('knowledge_items').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    const { data } = await query;
    setItems(data as KnowledgeItem[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [activeBusiness, categoryFilter, search]);

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('knowledge_items').insert({
      business_id: activeBusiness.id,
      title: form.title,
      category: form.category,
      content: form.content,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }).select().maybeSingle();
    if (!error && data) {
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'created_knowledge_item', entity_type: 'knowledge_item', entity_id: data.id,
      });
    }
    setSubmitting(false);
    setCreateOpen(false);
    setForm({ title: '', category: 'business_info', content: '', tags: '' });
    await fetchItems();
    toast({ title: 'Knowledge item created' });
  };

  const handleEdit = async () => {
    if (!editItem) return;
    setSubmitting(true);
    await supabase.from('knowledge_items').update({
      title: editItem.title, category: editItem.category, content: editItem.content,
    }).eq('id', editItem.id);
    setSubmitting(false);
    setEditItem(null);
    await fetchItems();
    toast({ title: 'Knowledge item updated' });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('knowledge_items').delete().eq('id', deleteId);
    setDeleteId(null);
    await fetchItems();
    toast({ title: 'Knowledge item deleted' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading knowledge base...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search knowledge..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIoOpen(true)}><Upload className="w-4 h-4" /> Import / Export</Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Knowledge</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Knowledge Item</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as KnowledgeCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Content</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} /></div>
              <div className="space-y-2"><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="pricing, hours, policy" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !form.title || !form.content}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><BookOpen className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">No knowledge items yet. Add business info, FAQs, and policies so your AI agent can answer customer questions accurately.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const cat = CATEGORIES.find((c) => c.value === item.category);
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <Badge variant="outline" className="mt-1 text-xs">{cat?.label ?? item.category}</Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditItem(item)}><Edit className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Knowledge Item</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Title</Label><Input value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={editItem.category} onValueChange={(v) => setEditItem({ ...editItem, category: v as KnowledgeCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Content</Label><Textarea value={editItem.content} onChange={(e) => setEditItem({ ...editItem, content: e.target.value })} rows={5} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this knowledge item?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        title="Knowledge"
        columns={IMPORT_COLUMNS}
        exportFilename="knowledge"
        onImport={async (rows) => {
          if (!activeBusiness) return { created: 0, skipped: 0, errors: [] };
          let created = 0, skipped = 0;
          const errors: ImportRowError[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const { error } = await supabase.from('knowledge_items').insert({
              business_id: activeBusiness.id,
              title: r.title,
              category: r.category as KnowledgeCategory,
              content: r.content,
              tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
            });
            if (error) { errors.push({ row: i + 2, message: error.message }); } else { created++; }
          }
          await fetchItems();
          return { created, skipped, errors };
        }}
        onExport={async () => {
          if (!activeBusiness) return [];
          const { data } = await supabase.from('knowledge_items').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
          return (data ?? []).map((item: Record<string, unknown>) => ({ ...item, tags: Array.isArray(item.tags) ? (item.tags as string[]).join(', ') : '' })) as Record<string, unknown>[];
        }}
      />
    </div>
  );
}
