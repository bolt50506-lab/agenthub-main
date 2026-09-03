'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Upload, Image as ImageIcon, FileText, MoreVertical, Trash2, AlertCircle, Check, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MediaDocument, ImageAnalysisResult, MediaType, ConfidenceLevel, VerificationStatus } from '@/lib/types/database';

const MEDIA_CATEGORIES: { value: MediaType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'product_image', label: 'Product Image' },
  { value: 'document', label: 'Document' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'scanned', label: 'Scanned Document' },
  { value: 'other', label: 'Other' },
];

export default function MediaPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [media, setMedia] = useState<MediaDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<MediaType>('general');
  const [analysisDetail, setAnalysisDetail] = useState<{ media: MediaDocument; analysis: ImageAnalysisResult | null } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    if (!activeBusiness) return;
    const { data } = await supabase.from('media_documents').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
    setMedia(data as MediaDocument[] ?? []);
    setLoading(false);
  }, [activeBusiness]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const handleUpload = async () => {
    if (!selectedFile || !activeBusiness) return;
    setUploading(true);
    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${activeBusiness.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(fileName, selectedFile);
    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data: mediaData, error: dbError } = await supabase.from('media_documents').insert({
      business_id: activeBusiness.id,
      file_name: selectedFile.name,
      file_path: fileName,
      file_type: selectedFile.type.startsWith('image/') ? 'image' : 'document',
      file_size: selectedFile.size,
      mime_type: selectedFile.type,
      category: uploadCategory,
    }).select().maybeSingle();

    if (!dbError && mediaData) {
      // Create a default "not_configured" analysis result for images
      if (selectedFile.type.startsWith('image/')) {
        await supabase.from('image_analysis_results').insert({
          business_id: activeBusiness.id,
          media_document_id: mediaData.id,
          processing_status: 'not_configured',
          verification_status: 'unverified',
        });
      }
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'uploaded_media', entity_type: 'media_document', entity_id: mediaData.id,
      });
    }

    setUploading(false);
    setSelectedFile(null);
    setUploadOpen(false);
    await fetchMedia();
    toast({ title: 'File uploaded', description: selectedFile.name });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const item = media.find((m) => m.id === deleteId);
    if (item) {
      await supabase.storage.from('media').remove([item.file_path]);
    }
    await supabase.from('media_documents').delete().eq('id', deleteId);
    setDeleteId(null);
    await fetchMedia();
    toast({ title: 'File deleted' });
  };

  const openAnalysis = async (mediaItem: MediaDocument) => {
    const { data } = await supabase.from('image_analysis_results').select('*').eq('media_document_id', mediaItem.id).maybeSingle();
    setAnalysisDetail({ media: mediaItem, analysis: data as ImageAnalysisResult | null });
  };

  const updateVerification = async (status: VerificationStatus) => {
    if (!analysisDetail?.analysis) return;
    await supabase.from('image_analysis_results').update({ verification_status: status }).eq('id', analysisDetail.analysis.id);
    setAnalysisDetail({ ...analysisDetail, analysis: { ...analysisDetail.analysis, verification_status: status } });
    toast({ title: 'Verification status updated' });
  };

  const saveCorrectedText = async (text: string) => {
    if (!analysisDetail?.analysis) return;
    await supabase.from('image_analysis_results').update({ corrected_text: text }).eq('id', analysisDetail.analysis.id);
    setAnalysisDetail({ ...analysisDetail, analysis: { ...analysisDetail.analysis, corrected_text: text } });
    toast({ title: 'Corrected text saved' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading media...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{media.length} file{media.length !== 1 ? 's' : ''}</p>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Upload className="w-4 h-4" /> Upload File</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>File</Label>
                <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-2"><Label>Category</Label>
                <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as MediaType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MEDIA_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
                {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {media.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><ImageIcon className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">No files uploaded yet. Upload images, documents, and prescriptions for AI analysis.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    {item.file_type === 'image' ? <ImageIcon className="w-5 h-5 text-muted-foreground" /> : <FileText className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.file_type === 'image' && <DropdownMenuItem onClick={() => openAnalysis(item)}><Eye className="w-4 h-4 mr-2" /> View Analysis</DropdownMenuItem>}
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-sm font-medium truncate">{item.file_name}</p>
                <Badge variant="outline" className="mt-1 text-xs">{MEDIA_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}</Badge>
                <p className="text-xs text-muted-foreground mt-2">{item.file_size ? `${(item.file_size / 1024).toFixed(1)} KB` : ''}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Analysis Detail Dialog */}
      <Dialog open={!!analysisDetail} onOpenChange={(open) => !open && setAnalysisDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Image Analysis</DialogTitle></DialogHeader>
          {analysisDetail && (
            <div className="space-y-4 py-4">
              {/* Original Image */}
              <div className="space-y-2">
                <Label>Original Image</Label>
                <div className="rounded-lg border border-border overflow-hidden bg-muted">
                  <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/media/${analysisDetail.media.file_path}`} alt={analysisDetail.media.file_name} className="w-full max-h-64 object-contain" />
                </div>
              </div>

              {/* Analysis Status */}
              {analysisDetail.analysis ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{analysisDetail.analysis.processing_status.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline" className="capitalize">{analysisDetail.analysis.verification_status.replace(/_/g, ' ')}</Badge>
                    {analysisDetail.analysis.confidence && (
                      <Badge variant="outline" className="capitalize">Confidence: {analysisDetail.analysis.confidence}</Badge>
                    )}
                  </div>

                  {analysisDetail.analysis.processing_status === 'not_configured' ? (
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Image AI analysis is not configured.</p>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">Configure an AI vision provider in Settings to enable automatic text extraction and image analysis.</p>
                    </div>
                  ) : (
                    <>
                      {/* Extracted Text */}
                      <div className="space-y-2">
                        <Label>Extracted Text</Label>
                        <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm">{analysisDetail.analysis.extracted_text || 'No text extracted.'}</div>
                      </div>

                      {/* Uncertain Segments */}
                      {analysisDetail.analysis.uncertain_segments?.length > 0 && (
                        <div className="space-y-2">
                          <Label>Uncertain Text Segments</Label>
                          <div className="space-y-1">
                            {analysisDetail.analysis.uncertain_segments.map((seg, i) => (
                              <div key={i} className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                                <p className="text-sm font-mono">{seg.text}</p>
                                <p className="text-xs text-red-600 dark:text-red-400">{seg.note}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Corrected Text */}
                      <div className="space-y-2">
                        <Label>Corrected Text (manual)</Label>
                        <Textarea
                          defaultValue={analysisDetail.analysis.corrected_text ?? ''}
                          onBlur={(e) => saveCorrectedText(e.target.value)}
                          rows={3}
                          placeholder="Manually correct the extracted text here..."
                        />
                      </div>

                      {/* Verification */}
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <Label>Verification:</Label>
                        <Button size="sm" variant={analysisDetail.analysis.verification_status === 'verified' ? 'default' : 'outline'} onClick={() => updateVerification('verified')}>
                          <Check className="w-3.5 h-3.5 mr-1" /> Verified
                        </Button>
                        <Button size="sm" variant={analysisDetail.analysis.verification_status === 'needs_review' ? 'default' : 'outline'} onClick={() => updateVerification('needs_review')}>
                          Needs Review
                        </Button>
                        <Button size="sm" variant={analysisDetail.analysis.verification_status === 'unverified' ? 'default' : 'outline'} onClick={() => updateVerification('unverified')}>
                          Unverified
                        </Button>
                      </div>

                      {/* Medical Disclaimer */}
                      {analysisDetail.media.category === 'prescription' && (
                        <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                          <p className="text-xs text-orange-700 dark:text-orange-400">
                            <strong>Important:</strong> Extracted prescription text requires human/pharmacy verification before acting on it. This system does not diagnose medical conditions or recommend dosages.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No analysis record found for this image.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this file?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">This action cannot be undone. The file will be permanently removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
