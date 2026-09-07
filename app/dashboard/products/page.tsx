'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Package, MoreVertical, Edit, Trash2, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExportDialog } from '@/components/import-export-dialog';
import { type ColumnDef, type ImportRowError } from '@/lib/import-export/csv';
import type { Product, ProductCategory, ProductAvailability, ProductStatus, Service } from '@/lib/types/database';

type CatalogType = 'product' | 'service';
type CatalogItem = Product & { catalog_type: CatalogType; duration_minutes?: number | null; advance_required?: number };

const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'type', label: 'Type', required: true, type: 'select', options: ['product', 'service'] },
  { key: 'name', label: 'Name', required: true, type: 'text' },
  { key: 'code', label: 'Code / SKU', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'text' },
  { key: 'availability', label: 'Availability', type: 'select', options: ['in_stock', 'out_of_stock', 'limited', 'preorder'] },
  { key: 'duration_minutes', label: 'Duration (minutes)', type: 'number' },
  { key: 'advance_required', label: 'Advance Required', type: 'number' },
  { key: 'status', label: 'Status', required: true, type: 'select', options: ['active', 'inactive', 'discontinued'] },
];

const AVAILABILITY_OPTIONS: { value: ProductAvailability; label: string }[] = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'limited', label: 'Limited' },
  { value: 'preorder', label: 'Pre-order' },
];

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'discontinued', label: 'Discontinued' },
];

export default function ProductsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CatalogType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'product' as CatalogType,
    name: '', category_id: '', description: '', code: '', price: '', currency: 'PKR',
    availability: 'in_stock' as ProductAvailability, status: 'active' as ProductStatus,
    duration_minutes: '', advance_required: '',
  });

  const fetchAll = async () => {
    if (!activeBusiness) return;
    const [prodRes, catRes, serviceRes] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
      supabase.from('product_categories').select('*').eq('business_id', activeBusiness.id).order('name'),
      supabase.from('services').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
    ]);

    const products = ((prodRes.data ?? []) as Product[]).map((p) => ({ ...p, catalog_type: 'product' as const }));
    const services = ((serviceRes.data ?? []) as Service[]).map((s) => ({
      id: s.id,
      business_id: s.business_id,
      category_id: null,
      name: s.name,
      description: s.description,
      sku: null,
      price: s.price,
      currency: s.currency,
      availability: 'in_stock' as ProductAvailability,
      status: s.status as ProductStatus,
      image_url: null,
      metadata: s.metadata ?? {},
      created_at: s.created_at,
      updated_at: s.updated_at,
      catalog_type: 'service' as const,
      duration_minutes: s.duration_minutes,
      advance_required: s.advance_required,
    }));

    setItems([...products, ...services].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setCategories(catRes.data as ProductCategory[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [activeBusiness]);

  const filtered = useMemo(() => items.filter((item) => {
    if (typeFilter !== 'all' && item.catalog_type !== typeFilter) return false;
    if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false;
    const query = search.trim().toLowerCase();
    if (query && !item.name.toLowerCase().includes(query) && !(item.sku ?? '').toLowerCase().includes(query)) return false;
    return true;
  }), [items, typeFilter, categoryFilter, search]);

  const resetForm = () => setForm({
    type: 'product', name: '', category_id: '', description: '', code: '', price: '', currency: 'PKR',
    availability: 'in_stock', status: 'active', duration_minutes: '', advance_required: '',
  });

  const handleCreate = async () => {
    if (!activeBusiness || !form.name.trim()) return;
    setSubmitting(true);
    let error = null;
    let createdId: string | null = null;

    if (form.type === 'product') {
      const result = await supabase.from('products').insert({
        business_id: activeBusiness.id,
        name: form.name.trim(),
        category_id: form.category_id || null,
        description: form.description || null,
        sku: form.code || null,
        price: form.price ? parseFloat(form.price) : null,
        currency: form.currency || 'PKR',
        availability: form.availability,
        status: form.status,
      }).select('id').maybeSingle();
      error = result.error;
      createdId = result.data?.id ?? null;
    } else {
      const result = await supabase.from('services').insert({
        business_id: activeBusiness.id,
        name: form.name.trim(),
        description: form.description || null,
        price: form.price ? parseFloat(form.price) : null,
        currency: form.currency || 'PKR',
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
        advance_required: form.advance_required ? parseFloat(form.advance_required) : 0,
        status: form.status === 'discontinued' ? 'inactive' : form.status,
      }).select('id').maybeSingle();
      error = result.error;
      createdId = result.data?.id ?? null;
    }

    if (error) {
      toast({ title: 'Could not create item', description: error.message, variant: 'destructive' });
    } else {
      if (createdId) await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id,
        action: form.type === 'product' ? 'created_product' : 'created_service',
        entity_type: form.type,
        entity_id: createdId,
      });
      setCreateOpen(false);
      resetForm();
      toast({ title: `${form.type === 'product' ? 'Product' : 'Service'} created` });
      await fetchAll();
    }
    setSubmitting(false);
  };

  const handleEdit = async () => {
    if (!editItem) return;
    setSubmitting(true);
    let error = null;

    if (editItem.catalog_type === 'product') {
      const result = await supabase.from('products').update({
        name: editItem.name,
        description: editItem.description,
        sku: editItem.sku,
        price: editItem.price,
        currency: editItem.currency,
        availability: editItem.availability,
        status: editItem.status,
        category_id: editItem.category_id,
      }).eq('id', editItem.id);
      error = result.error;
    } else {
      const result = await supabase.from('services').update({
        name: editItem.name,
        description: editItem.description,
        price: editItem.price,
        currency: editItem.currency,
        duration_minutes: editItem.duration_minutes ?? null,
        advance_required: editItem.advance_required ?? 0,
        status: editItem.status === 'discontinued' ? 'inactive' : editItem.status,
      }).eq('id', editItem.id);
      error = result.error;
    }

    setSubmitting(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setEditItem(null);
    await fetchAll();
    toast({ title: `${editItem.catalog_type === 'product' ? 'Product' : 'Service'} updated` });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.catalog_type === 'product' ? 'products' : 'services';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else toast({ title: `${deleteTarget.catalog_type === 'product' ? 'Product' : 'Service'} deleted` });
    setDeleteTarget(null);
    await fetchAll();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading products and services...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Products & Services</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage both from one simple catalog. Use the filter to see Products, Services, or All.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setIoOpen(true)}><Upload className="w-4 h-4" /> Import / Export</Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Product or Service</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CatalogType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="product">Product</SelectItem><SelectItem value="service">Service</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{form.type === 'product' ? 'SKU / Code' : 'Code (optional)'}</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                  </div>
                  {form.type === 'product' ? (
                    <div className="space-y-2"><Label>Category</Label>
                      <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" min="0" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Advance Required</Label><Input type="number" min="0" step="0.01" value={form.advance_required} onChange={(e) => setForm({ ...form, advance_required: e.target.value })} /></div>
                    </div>
                  )}
                  {form.type === 'product' && <div className="space-y-2"><Label>Availability</Label>
                    <Select value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v as ProductAvailability })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>}
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProductStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={submitting || !form.name.trim()}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products & services..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant={typeFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('all')}>All</Button>
            <Button variant={typeFilter === 'product' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('product')}>Products</Button>
            <Button variant={typeFilter === 'service' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('service')}>Services</Button>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><Package className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground mb-4">No products or services match your current filters.</p>
          <Button onClick={() => { setTypeFilter('all'); setCategoryFilter('all'); setSearch(''); setCreateOpen(true); }}><Plus className="w-4 h-4 mr-2" /> Add Product or Service</Button>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Code / SKU</TableHead><TableHead>Price</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={`${item.catalog_type}-${item.id}`}>
                  <TableCell><Badge variant="outline">{item.catalog_type === 'product' ? 'Product' : 'Service'}</Badge></TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                  <TableCell>{item.price != null ? `${item.currency} ${Number(item.price).toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.catalog_type === 'product' ? item.availability.replace(/_/g, ' ') : (item.duration_minutes ? `${item.duration_minutes} min` : '-')}
                  </TableCell>
                  <TableCell><Badge variant={item.status === 'active' ? 'default' : 'secondary'} className="capitalize">{item.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditItem(item)}><Edit className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editItem?.catalog_type === 'service' ? 'Service' : 'Product'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name</Label><Input value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} /></div>
              {editItem.catalog_type === 'product' && <div className="space-y-2"><Label>Category</Label>
                <Select value={editItem.category_id ?? ''} onValueChange={(v) => setEditItem({ ...editItem, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{editItem.catalog_type === 'product' ? 'SKU' : 'Code'}</Label><Input value={editItem.sku ?? ''} onChange={(e) => setEditItem({ ...editItem, sku: e.target.value || null })} disabled={editItem.catalog_type === 'service'} /></div>
                <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={editItem.price ?? ''} onChange={(e) => setEditItem({ ...editItem, price: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              </div>
              <div className="space-y-2"><Label>Currency</Label><Input value={editItem.currency} onChange={(e) => setEditItem({ ...editItem, currency: e.target.value })} /></div>
              {editItem.catalog_type === 'service' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" value={editItem.duration_minutes ?? ''} onChange={(e) => setEditItem({ ...editItem, duration_minutes: e.target.value ? parseInt(e.target.value, 10) : null })} /></div>
                <div className="space-y-2"><Label>Advance Required</Label><Input type="number" step="0.01" value={editItem.advance_required ?? 0} onChange={(e) => setEditItem({ ...editItem, advance_required: e.target.value ? parseFloat(e.target.value) : 0 })} /></div>
              </div>}
              {editItem.catalog_type === 'product' && <div className="space-y-2"><Label>Availability</Label>
                <Select value={editItem.availability} onValueChange={(v) => setEditItem({ ...editItem, availability: v as ProductAvailability })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              <div className="space-y-2"><Label>Status</Label>
                <Select value={editItem.status} onValueChange={(v) => setEditItem({ ...editItem, status: v as ProductStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={editItem.description ?? ''} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={3} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button><Button onClick={handleEdit} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this {deleteTarget?.catalog_type}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        title="Products & Services"
        columns={IMPORT_COLUMNS}
        exportColumns={IMPORT_COLUMNS}
        exportFilename="products-services"
        onImport={async (rows) => {
          if (!activeBusiness) return { created: 0, skipped: 0, errors: [] };
          let created = 0, skipped = 0;
          const errors: ImportRowError[] = [];

          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const type = r.type as CatalogType;
            let error = null;
            if (type === 'product') {
              const result = await supabase.from('products').insert({
                business_id: activeBusiness.id,
                name: r.name,
                sku: r.code || null,
                description: r.description || null,
                price: r.price ? parseFloat(r.price) : null,
                currency: r.currency || 'PKR',
                availability: (r.availability as ProductAvailability) || 'in_stock',
                status: (r.status as ProductStatus) || 'active',
              });
              error = result.error;
            } else {
              const result = await supabase.from('services').insert({
                business_id: activeBusiness.id,
                name: r.name,
                description: r.description || null,
                price: r.price ? parseFloat(r.price) : null,
                currency: r.currency || 'PKR',
                duration_minutes: r.duration_minutes ? parseInt(r.duration_minutes, 10) : null,
                advance_required: r.advance_required ? parseFloat(r.advance_required) : 0,
                status: r.status === 'discontinued' ? 'inactive' : (r.status as 'active' | 'inactive') || 'active',
                metadata: r.category ? { category: r.category } : {},
              });
              error = result.error;
            }
            if (error) {
              if (error.code === '23505') skipped++;
              else errors.push({ row: i + 2, message: error.message });
            } else created++;
          }
          await fetchAll();
          return { created, skipped, errors };
        }}
        onExport={async () => {
          if (!activeBusiness) return [];
          const [prodRes, serviceRes] = await Promise.all([
            supabase.from('products').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
            supabase.from('services').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
          ]);
          const productRows = ((prodRes.data ?? []) as Product[]).map((p) => ({
            type: 'product', name: p.name, code: p.sku ?? '', description: p.description ?? '', category: p.category_id ?? '',
            price: p.price ?? '', currency: p.currency, availability: p.availability, duration_minutes: '', advance_required: '', status: p.status,
          }));
          const serviceRows = ((serviceRes.data ?? []) as Service[]).map((s) => ({
            type: 'service', name: s.name, code: '', description: s.description ?? '', category: String((s.metadata ?? {}).category ?? ''),
            price: s.price ?? '', currency: s.currency, availability: '', duration_minutes: s.duration_minutes ?? '', advance_required: s.advance_required ?? 0,
            status: s.status,
          }));
          return [...productRows, ...serviceRows];
        }}
      />
    </div>
  );
}
