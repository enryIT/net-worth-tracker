import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('asset dialog UI regression guards', () => {
  it('keeps ticker validation conditional for hidden ticker asset types', () => {
    const source = readFileSync('components/assets/AssetDialog.tsx', 'utf8');

    expect(source).toContain("if (data.type !== 'cash' && data.type !== 'realestate'");
    expect(source).toContain("message: 'Il ticker è obbligatorio per questo tipo di asset'");
  });

  it('allows hidden-ticker asset types to submit when ticker is missing from form state', () => {
    const source = readFileSync('components/assets/AssetDialog.tsx', 'utf8');

    // Hidden ticker fields (cash/realestate) may be unregistered in RHF: schema must accept missing ticker.
    expect(source).toContain('ticker: z.string().optional()');
    // Payload builder must still be resilient if ticker is undefined at runtime.
    expect(source).toContain("const normalizedTicker = (data.ticker ?? '').trim();");
    expect(source).toContain('const resolvedTicker = normalizedTicker.length > 0 ? normalizedTicker : data.name.trim();');
  });

  it('keeps asset submit non-silent when form validation fails', () => {
    const source = readFileSync('components/assets/AssetDialog.tsx', 'utf8');

    expect(source).toMatch(/const onInvalidSubmit(?:\s*:\s*[^=]+)?\s*=/);
    expect(source).toContain("Controlla i campi obbligatori prima di salvare l'asset");
    expect(source).toContain('toast.error(errorMessage)');
    expect(source).toContain('onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}');
  });
});
