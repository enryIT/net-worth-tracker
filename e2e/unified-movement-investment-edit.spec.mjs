import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceSource = readFileSync(
  path.join(repoRoot, 'lib/services/investmentOperationService.ts'),
  'utf8'
);

function currentSiblingPrefetchConstraints() {
  const updatePrefetchBlock = serviceSource.match(
    /const operationsQuery = query\([\s\S]*?const operationsSnap = await getDocs\(operationsQuery\);/
  )?.[0] ?? '';

  const constraints = [
    { field: 'assetId', op: '==', value: 'asset-1' },
  ];

  if (/where\(\s*['"]userId['"]\s*,\s*['"]==['"]/.test(updatePrefetchBlock)) {
    constraints.push({ field: 'userId', op: '==', value: 'user-1' });
  }

  return constraints;
}

function hasConstraint(constraints, field, value) {
  return constraints.some((constraint) =>
    constraint.field === field
    && constraint.op === '=='
    && constraint.value === value
  );
}

function unifiedMovementEditFixture() {
  const constraints = JSON.stringify(currentSiblingPrefetchConstraints()).replace(/</g, '\\u003c');

  return `<!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Unified movement investment edit fixture</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 32px; color: #111827; }
          button { min-height: 40px; border: 1px solid #9ca3af; border-radius: 6px; padding: 8px 14px; background: #fff; }
          [role="dialog"] { margin-top: 20px; max-width: 720px; border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; }
          .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
          label { display: grid; gap: 4px; font-size: 14px; }
          input { min-height: 36px; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
          [role="alert"] { margin-top: 12px; color: #b91c1c; }
        </style>
      </head>
      <body>
        <button type="button" id="open-edit">Modifica movimento</button>
        <section role="dialog" aria-labelledby="dialog-title" hidden>
          <h1 id="dialog-title">Modifica movimento</h1>
          <p>Dettagli operazione</p>
          <div class="field-grid">
            <label>Asset <input value="ETF Europa" readonly /></label>
            <label>Tipo <input value="Acquisto" readonly /></label>
            <label>Quote <input value="10" /></label>
            <label>Prezzo unitario <input value="100" /></label>
          </div>
          <button type="button" id="update">Aggiorna</button>
          <div role="alert" id="error" hidden></div>
        </section>
        <script>
          const dialog = document.querySelector('[role="dialog"]');
          const error = document.querySelector('#error');
          const prefetchConstraints = ${constraints};

          document.querySelector('#open-edit').addEventListener('click', () => {
            dialog.hidden = false;
          });

          document.querySelector('#update').addEventListener('click', async () => {
            error.hidden = true;
            error.textContent = '';

            const response = await fetch('/__e2e__/investment-operation/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                kind: 'investment',
                operationId: 'op-1',
                userId: 'user-1',
                assetId: 'asset-1',
                prefetchConstraints
              })
            });

            if (!response.ok) {
              const body = await response.json();
              error.textContent = body.error || 'Errore nel salvataggio del movimento';
              error.hidden = false;
            }
          });
        </script>
      </body>
    </html>`;
}

test.describe('unified movement investment edit', () => {
  test('clicking Aggiorna does not surface a Firestore permission error', async ({ page }) => {
    const updatePayloads = [];

    await page.route('**/__e2e__/unified-movement-investment-edit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: unifiedMovementEditFixture(),
      });
    });

    await page.route('**/__e2e__/investment-operation/update', async (route) => {
      const payload = route.request().postDataJSON();
      updatePayloads.push(payload);

      const constraints = Array.isArray(payload.prefetchConstraints)
        ? payload.prefetchConstraints
        : [];

      if (
        !hasConstraint(constraints, 'assetId', 'asset-1')
        || !hasConstraint(constraints, 'userId', 'user-1')
      ) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Missing or insufficient permissions' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/__e2e__/unified-movement-investment-edit');

    await page.getByRole('button', { name: 'Modifica movimento' }).click();
    const dialog = page.getByRole('dialog', { name: 'Modifica movimento' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Aggiorna' }).click();

    await expect(page.getByText('Missing or insufficient permissions')).not.toBeVisible();
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      kind: 'investment',
      operationId: 'op-1',
      userId: 'user-1',
      assetId: 'asset-1',
    });
    expect(hasConstraint(updatePayloads[0].prefetchConstraints, 'assetId', 'asset-1')).toBe(true);
    expect(hasConstraint(updatePayloads[0].prefetchConstraints, 'userId', 'user-1')).toBe(true);
  });
});
