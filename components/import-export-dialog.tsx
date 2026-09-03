'use client';

import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  type ColumnDef, type ImportResult, type ImportRowError,
  parseCsv, validateRow, generateCsvTemplate, exportToCsv, downloadFile, formatDateForFilename,
} from '@/lib/import-export/csv';

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ColumnDef[];
  onImport: (rows: Record<string, string>[]) => Promise<{ created: number; skipped: number; errors: ImportRowError[] }>;
  onExport: () => Promise<Record<string, unknown>[]>;
  exportColumns?: ColumnDef[];
  exportFilename: string;
}

export function ImportExportDialog({
  open, onOpenChange, title, columns, onImport, onExport, exportColumns, exportFilename,
}: ImportExportDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'import' | 'export'>('import');
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [validationErrors, setValidationErrors] = useState<ImportRowError[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: ImportRowError[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setParsedRows([]);
    setValidationErrors([]);
    setFileName('');
    setImportResult(null);
  };

  const handleTemplateDownload = () => {
    const csv = generateCsvTemplate(columns);
    downloadFile(csv, `${exportFilename}-template.csv`);
    toast({ title: 'Template downloaded', description: 'Fill in the template and upload it back.' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast({ title: 'Invalid file', description: 'File must have a header row and at least one data row.', variant: 'destructive' });
        return;
      }

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const colMap = columns.map((c) => {
        const idx = header.indexOf(c.label.toLowerCase());
        return { col: c, idx };
      });

      const validRows: Record<string, string>[] = [];
      const errors: ImportRowError[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const data: Record<string, string> = {};
        let rowValid = true;

        for (const { col, idx } of colMap) {
          const value = idx >= 0 ? (row[idx] ?? '').trim() : '';

          if (col.required && !value) {
            errors.push({ row: i + 1, field: col.key, message: `${col.label} is required` });
            rowValid = false;
            continue;
          }

          if (col.type === 'select' && col.options?.length && value && !col.options.includes(value)) {
            errors.push({ row: i + 1, field: col.key, message: `${col.label} must be one of: ${col.options.join(', ')}` });
            rowValid = false;
            continue;
          }

          data[col.key] = value;
        }

        if (rowValid) {
          validRows.push(data);
        }
      }

      setParsedRows(validRows);
      setValidationErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    const result = await onImport(parsedRows);
    setImportResult(result);
    setImporting(false);
    if (result.errors.length === 0) {
      toast({ title: 'Import complete', description: `${result.created} records imported, ${result.skipped} skipped.` });
    } else {
      toast({ title: 'Import completed with errors', description: `${result.created} imported, ${result.skipped} skipped, ${result.errors.length} errors.`, variant: 'destructive' });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await onExport();
      if (data.length === 0) {
        toast({ title: 'No data to export', description: 'There are no records to export.' });
      } else {
        exportToCsv(data, exportColumns ?? columns, `${exportFilename}-${formatDateForFilename()}.csv`);
        toast({ title: 'Export complete', description: `${data.length} records exported.` });
      }
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, variant: 'destructive' });
    }
    setExporting(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            {title} — Import / Export
          </DialogTitle>
          <DialogDescription>
            Bulk import data via CSV, or export your current data. Download a template to get started.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'import' | 'export')}>
          <TabsList className="w-full">
            <TabsTrigger value="import" className="flex-1">Import</TabsTrigger>
            <TabsTrigger value="export" className="flex-1">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
                <Download className="w-4 h-4 mr-2" /> Download Template
              </Button>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose CSV file
              </Button>
              {fileName && <p className="text-xs text-muted-foreground mt-2">{fileName}</p>}
            </div>

            {/* Validation summary */}
            {parsedRows.length > 0 && validationErrors.length === 0 && !importResult && (
              <Alert>
                <CheckCircle2 className="w-4 h-4" />
                <AlertDescription>
                  {parsedRows.length} valid rows ready to import. Click Import below.
                </AlertDescription>
              </Alert>
            )}

            {validationErrors.length > 0 && !importResult && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  {validationErrors.length} validation errors found. {parsedRows.length} valid rows will be imported.
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {validationErrors.slice(0, 10).map((err, i) => (
                      <div key={i} className="text-xs">
                        Row {err.row}: {err.message}
                      </div>
                    ))}
                    {validationErrors.length > 10 && <div className="text-xs">...and {validationErrors.length - 10} more</div>}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Import result */}
            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm">Total: {parsedRows.length}</Badge>
                    <Badge className="text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Imported: {importResult.created}</Badge>
                    {importResult.skipped > 0 && <Badge variant="outline" className="text-sm">Skipped: {importResult.skipped}</Badge>}
                    {importResult.errors.length > 0 && <Badge variant="destructive" className="text-sm">Failed: {importResult.errors.length}</Badge>}
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <div key={i} className="text-xs">Row {err.row}: {err.message}</div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
              {parsedRows.length > 0 && !importResult && (
                <Button onClick={handleImport} disabled={importing || parsedRows.length === 0}>
                  {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Import {parsedRows.length} rows
                </Button>
              )}
            </DialogFooter>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Export all {title.toLowerCase()} records for this business to a CSV file. The export respects business isolation — only records belonging to your business will be included.
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Export to CSV
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
