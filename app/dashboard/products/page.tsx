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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Package, MoreVertical, Edit, Trash2, Loader2, Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExportDialog } from '@/components/import-export-dialog';
import { type ColumnDef, type ImportRowError } from '@/lib/import-export/csv';
import type { Product, ProductCategory, ProductAvailability, ProductStatus } from '@/lib/types/database';

const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', required: true, type: 'text' },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'text' },
  { key: 'availability', label: 'Availability', type: 'select', options: ['in_stock', 'out_of_stock', 'limited', 'preorder'] },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'discontinued'] },
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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', category_id: '', description: '', sku: '', price: '', currency: 'USD',
    availability: 'in_stock' as ProductAvailability, status: 'active' as ProductStatus, image_url: '',
  });

  const fetchAll = async () => {
    if (!activeBusiness) return;
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
      supabase.from('product_categories').select('*').eq('business_id', activeBusiness.id).order('name'),
    ]);
    setProducts(prodRes.data as Product[] ?? []);
    setCategories(catRes.data as ProductCategory[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [activeBusiness]);

  const filtered = products.filter((p) => {
    if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.sku ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('products').insert({
      business_id: activeBusiness.id,
      name: form.name,
      category_id: form.category_id || null,
      description: form.description,
      sku: form.sku,
      price: form.price ? parseFloat(form.price) : null,
      currency: form.currency,
      availability: form.availability,
      status: form.status,
      image_url: form.image_url || null,
    }).select().maybeSingle();
    if (!error && data) {
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'created_product', entity_type: 'product', entity_id: data.id,
      });
    }
    setSubmitting(false);
    setCreateOpen(false);
    setForm({ name: '', category_id: '', description: '', sku: '', price: '', currency: 'USD', availability: 'in_stock', status: 'active', image_url: '' });
    await fetchAll();
    toast({ title: 'Product created' });
  };

  const handleEdit = async () => {
    if (!editProduct) return;
    setSubmitting(true);
    await supabase.from('products').update({
      name: editProduct.name, description: editProduct.description, sku: editProduct.sku,
      price: editProduct.price, currency: editProduct.currency, availability: editProduct.availability,
      status: editProduct.status, category_id: editProduct.category_id,
    }).eq('id', editProduct.id);
    setSubmitting(false);
    setEditProduct(null);
    await fetchAll();
    toast({ title: 'Product updated' });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('products').delete().eq('id', deleteId);
    setDeleteId(null);
    await fetchAll();
    toast({ title: 'Product deleted' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading products...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIoOpen(true)}><Upload className="w-4 h-4" /> Import / Export</Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Add Product</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Product or Service</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>SKU/Code</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Category</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Availability</Label>
                  <Select value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v as ProductAvailability })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProductStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !form.name}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><Package className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground mb-4">No products yet. Add your products and services so your AI agent can quote accurate prices.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Price</TableHead>
              <TableHead>Availability</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.sku || '-'}</TableCell>
                  <TableCell>{p.price ? `${p.currency} ${p.price.toFixed(2)}` : '-'}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{p.availability.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell><Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="capitalize">{p.status}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditProduct(p)}><Edit className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editProduct} onOpenChange={(open) => !open && setEditProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          {editProduct && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name</Label><Input value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>SKU</Label><Input value={editProduct.sku ?? ''} onChange={(e) => setEditProduct({ ...editProduct, sku: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={editProduct.price ?? ''} onChange={(e) => setEditProduct({ ...editProduct, price: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                <div className="space-y-2"><Label>Currency</Label><Input value={editProduct.currency} onChange={(e) => setEditProduct({ ...editProduct, currency: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Availability</Label>
                  <Select value={editProduct.availability} onValueChange={(v) => setEditProduct({ ...editProduct, availability: v as ProductAvailability })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={editProduct.status} onValueChange={(v) => setEditProduct({ ...editProduct, status: v as ProductStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={editProduct.description ?? ''} onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
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
        title="Products"
        columns={IMPORT_COLUMNS}
        exportFilename="products"
        onImport={async (rows) => {
          if (!activeBusiness) return { created: 0, skipped: 0, errors: [] };
          let created = 0, skipped = 0;
          const errors: ImportRowError[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const { error } = await supabase.from('products').insert({
              business_id: activeBusiness.id,
              name: r.name,
              sku: r.sku || null,
              description: r.description || null,
              price: r.price ? parseFloat(r.price) : null,
              currency: r.currency || 'USD',
              availability: (r.availability as ProductAvailability) || 'in_stock',
              status: (r.status as ProductStatus) || 'active',
            });
            if (error) {
              if (error.code === '23505') { skipped++; } else { errors.push({ row: i + 2, message: error.message }); }
            } else { created++; }
          }
          await fetchAll();
          return { created, skipped, errors };
        }}
        onExport={async () => {
          if (!activeBusiness) return [];
          const { data } = await supabase.from('products').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
          return (data ?? []) as Record<string, unknown>[];
        }}
      />
    </div>
  );
}
