// Minimal CSV import for Assisted Onboarding member import (§12-D). No CSV
// library exists in this repo; parsing is intentionally small — one header
// row, comma-separated, quoted-field support, no multi-line quoted fields.

export const CSV_TEMPLATE_COLUMNS = ['name', 'email', 'contact_number'] as const;
export const CSV_TEMPLATE_HEADER = CSV_TEMPLATE_COLUMNS.join(',');
export const CSV_TEMPLATE_EXAMPLE = 'Juan Dela Cruz,juan@example.com,09171234567';
export const CSV_TEMPLATE = `${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}\n`;

const MAX_ROWS = 2000;
const MAX_FILE_BYTES = 1024 * 1024;

export interface CsvValidRow {
  row: number;
  name: string;
  email: string;
  contactNumber: string;
}

export interface CsvInvalidRow {
  row: number;
  raw: string;
  errors: string[];
}

export interface CsvParseResult {
  valid: CsvValidRow[];
  invalid: CsvInvalidRow[];
  duplicateEmails: string[];
  headerError: string | null;
  truncated: boolean;
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseMemberCsv(text: string): CsvParseResult {
  if (text.length > MAX_FILE_BYTES) {
    return { valid: [], invalid: [], duplicateEmails: [], headerError: 'File is too large (max 1 MB).', truncated: false };
  }

  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { valid: [], invalid: [], duplicateEmails: [], headerError: 'File is empty.', truncated: false };
  }

  const header = parseLine(lines[0]).map((cell) => cell.toLowerCase());
  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const contactIdx = header.indexOf('contact_number');
  if (nameIdx === -1 || emailIdx === -1) {
    return {
      valid: [], invalid: [], duplicateEmails: [],
      headerError: `Missing required column(s). Expected header: ${CSV_TEMPLATE_HEADER}`,
      truncated: false,
    };
  }

  const dataLines = lines.slice(1);
  const truncated = dataLines.length > MAX_ROWS;
  const bounded = dataLines.slice(0, MAX_ROWS);

  const valid: CsvValidRow[] = [];
  const invalid: CsvInvalidRow[] = [];
  const emailFirstSeenRow = new Map<string, number>();
  const duplicateEmails = new Set<string>();

  bounded.forEach((line, index) => {
    const rowNumber = index + 2; // header is row 1
    const cells = parseLine(line);
    const name = (cells[nameIdx] ?? '').trim();
    const email = (cells[emailIdx] ?? '').trim().toLowerCase();
    const contactNumber = contactIdx >= 0 ? (cells[contactIdx] ?? '').trim() : '';

    const errors: string[] = [];
    if (!name || name.length < 2) errors.push('Name is required (min 2 characters).');
    if (!email || !EMAIL_RE.test(email)) errors.push('A valid email is required.');

    if (email && errors.length === 0) {
      if (emailFirstSeenRow.has(email)) {
        duplicateEmails.add(email);
        errors.push(`Duplicate email — already used on row ${emailFirstSeenRow.get(email)}.`);
      } else {
        emailFirstSeenRow.set(email, rowNumber);
      }
    }

    if (errors.length > 0) {
      invalid.push({ row: rowNumber, raw: line, errors });
    } else {
      valid.push({ row: rowNumber, name, email, contactNumber });
    }
  });

  return { valid, invalid, duplicateEmails: Array.from(duplicateEmails), headerError: null, truncated };
}

