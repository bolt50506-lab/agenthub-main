export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: string[];
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
}

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export function generateCsvTemplate(columns: ColumnDef[]): string {
  const header = columns.map((c) => c.label).join(',');
  const sampleRow = columns.map((c) => {
    if (c.type === 'select' && c.options?.length) return c.options[0];
    if (c.type === 'number') return '0';
    return c.label.includes('URL') ? 'https://' : '';
  }).join(',');
  return `${header}\n${sampleRow}\n`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // skip
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''));
}

export function validateRow(
  row: string[],
  columns: ColumnDef[],
  rowIndex: number
): { valid: boolean; data: Record<string, string>; errors: ImportRowError[] } {
  const data: Record<string, string> = {};
  const errors: ImportRowError[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const value = (row[i] ?? '').trim();

    if (col.required && !value) {
      errors.push({ row: rowIndex, field: col.key, message: `${col.label} is required` });
      continue;
    }

    if (col.type === 'select' && col.options?.length && value && !col.options.includes(value)) {
      errors.push({ row: rowIndex, field: col.key, message: `${col.label} must be one of: ${col.options.join(', ')}` });
      continue;
    }

    data[col.key] = value;
  }

  return { valid: errors.length === 0, data, errors };
}

export function downloadFile(content: string, filename: string, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCsv(rows: Record<string, unknown>[], columns: ColumnDef[], filename: string) {
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      const str = val == null ? '' : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  const csv = [header, ...lines].join('\n');
  downloadFile(csv, filename);
}

export function formatDateForFilename(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
