'use client';

import { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { A, GhostBtn, PrimaryBtn } from '@/lib/admin-ui';
import { useWizard } from '@/lib/onboarding/state';
import { parseMemberCsv, CSV_TEMPLATE, type CsvParseResult } from '@/lib/onboarding/csv';

export function MemberImportSection() {
  const { state, dispatch } = useWizard();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmedSkip, setConfirmedSkip] = useState(false);

  const imported = state.draft.importedMembers;

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stren-member-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setConfirmedSkip(false);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const result = parseMemberCsv(text);
      setParseResult(result);
      if (result.headerError) {
        toast.error(result.headerError);
        dispatch({ type: 'setImport', rows: [], skipped: 0 });
        return;
      }
      if (result.invalid.length === 0) {
        dispatch({ type: 'setImport', rows: result.valid, skipped: 0 });
        toast.success(`${result.valid.length} member${result.valid.length === 1 ? '' : 's'} ready to import.`);
      } else {
        // All-or-explicit-confirmation: invalid rows block import until fixed or explicitly skipped.
        dispatch({ type: 'setImport', rows: [], skipped: 0 });
      }
    };
    reader.readAsText(file);
  }

  function confirmSkipInvalid() {
    if (!parseResult) return;
    setConfirmedSkip(true);
    dispatch({ type: 'setImport', rows: parseResult.valid, skipped: parseResult.invalid.length });
  }

  function clearImport() {
    setParseResult(null);
    setFileName(null);
    setConfirmedSkip(false);
    dispatch({ type: 'setImport', rows: [], skipped: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="space-y-3 pt-3" style={{ borderTop: `1px solid ${A.border}` }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: A.text }}>Member import <span className="font-normal" style={{ color: A.muted }}>(optional)</span></h3>
        <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: A.primary, border: `1px solid ${A.border}` }}>
          <Download className="h-3.5 w-3.5" /> Download template
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

      {!fileName && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-6 text-sm"
          style={{ border: `1px dashed ${A.border}`, color: A.muted }}
        >
          <Upload className="h-4 w-4" /> Upload a CSV of members (optional)
        </button>
      )}

      {fileName && parseResult && (
        <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium" style={{ color: A.text2 }}>{fileName}</p>
            <button type="button" onClick={clearImport} aria-label="Remove imported file" style={{ color: A.muted }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {parseResult.headerError ? (
            <p className="text-xs" style={{ color: A.danger }}>{parseResult.headerError}</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--admin-active-text))' }}>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {parseResult.valid.length} valid row{parseResult.valid.length === 1 ? '' : 's'}
              </div>
              {parseResult.invalid.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs" style={{ color: A.danger }}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {parseResult.invalid.length} invalid row{parseResult.invalid.length === 1 ? '' : 's'} will not be imported silently
                  </div>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs" style={{ color: A.muted }}>
                    {parseResult.invalid.slice(0, 20).map((row) => (
                      <li key={row.row}>Row {row.row}: {row.errors.join(' ')}</li>
                    ))}
                  </ul>
                  {!confirmedSkip ? (
                    <div className="flex items-center gap-2 pt-1">
                      <GhostBtn onClick={confirmSkipInvalid}>
                        Import {parseResult.valid.length} valid, skip {parseResult.invalid.length} invalid
                      </GhostBtn>
                      <p className="text-xs" style={{ color: A.muted }}>or fix the file and re-upload</p>
                    </div>
                  ) : (
                    <p role="status" className="text-xs" style={{ color: A.muted }}>
                      Confirmed: {imported.length} member{imported.length === 1 ? '' : 's'} will import; {parseResult.invalid.length} skipped.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {imported.length === 0 && !fileName && (
        <p className="text-xs" style={{ color: 'hsl(38 92% 40%)' }}>Optional — skipped for now.</p>
      )}
    </section>
  );
}
