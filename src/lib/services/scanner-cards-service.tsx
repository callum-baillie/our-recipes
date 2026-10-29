import 'server-only';
import { recipeCardUrl } from './recipe-link-service';
import { Document, Page, View, Text, QrCode, serialize } from '@formepdf/react';
import { renderSerializedDoc } from '@formepdf/core';
import { z } from 'zod';
import { getRecipe } from './recipe-service';
import { getPantryBatch, listPantryLocations } from './pantry-service';
import { parseServingCount } from '@/lib/domain/ingredient-scaling';
import { ScannerError } from '@/lib/domain/scanner';
import type { KitchenExport } from './pdf-export-service';
export const scannerCardQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('controls') }),
  z.object({ kind: z.literal('locations') }),
  z.object({ kind: z.literal('recipe'), id: z.string().uuid() }),
  z.object({ kind: z.literal('batch'), id: z.string().uuid() }),
]);
const controls = [
  ['Add packages', 'BORD:1:MODE:ADD'],
  ['Remove packages', 'BORD:1:MODE:REMOVE'],
  ['Look up food', 'BORD:2:MODE:LOOKUP'],
  ['Stocktake review', 'BORD:2:MODE:STOCKTAKE'],
  ['Idle', 'BORD:1:MODE:IDLE'],
  ['Reset controls', 'BORD:1:RESET'],
  ['Undo last transaction', 'BORD:1:UNDO'],
  ['Clear last grocery session (unchanged additions only)', 'BORD:2:CLEAR_SESSION'],
  ['Expired batch · discard and track waste', 'BORD:2:ACTION:EXPIRED'],
  ['Next product ×2', 'BORD:1:QTY:2'],
  ['Next product ×3', 'BORD:1:QTY:3'],
  ['Open batch', 'BORD:2:ACTION:OPEN'],
  ['Freeze batch', 'BORD:2:ACTION:FREEZE'],
  ['Thaw batch', 'BORD:2:ACTION:THAW'],
  ['Move batch', 'BORD:2:ACTION:MOVE'],
  ['Mark batch empty', 'BORD:2:ACTION:EMPTY'],
  ['Discard batch', 'BORD:2:ACTION:DISCARD'],
  ['Donate batch', 'BORD:2:ACTION:DONATE'],
];
let rendering = false;
export async function exportScannerCards(raw: unknown): Promise<KitchenExport> {
  const input = scannerCardQuerySchema.parse(raw);
  let cards = controls;
  if (input.kind === 'locations')
    cards = listPantryLocations()
      .slice(0, 100)
      .map((l) => [l.path, `BORD:1:LOCATION:${l.id}`]);
  if (input.kind === 'recipe') {
    const r = getRecipe(input.id),
      servings = r ? (parseServingCount(r.servings) ?? 0) : 0;
    if (
      !r ||
      r.status !== 'active' ||
      !Number.isFinite(servings) ||
      servings <= 0 ||
      servings > 100
    )
      throw new ScannerError(
        'scanner_recipe_card_invalid',
        'Set a numeric serving count from 1–100 on an active recipe before printing.',
      );
    cards = [
      [`${r.title} · ${servings} servings · revision ${r.currentRevision}`, recipeCardUrl(r.id)],
    ];
  }
  if (input.kind === 'batch') {
    const b = getPantryBatch(input.id);
    if (!b)
      throw new ScannerError('scanner_batch_missing', 'This stock batch no longer exists.', 404);
    cards = [
      [
        `${b.product.displayName} · ${b.location.path} · ${b.quantityRemaining} ${b.unit}`,
        `BORD:2:BATCH:${b.id}`,
      ],
    ];
  }
  if (rendering)
    throw new ScannerError('scanner_print_busy', 'Print queue busy. Try again shortly.', 429);
  rendering = true;
  try {
    return {
      bytes: await renderSerializedDoc({
        ...serialize(
          <Document title="Bòrd scanner cards">
            {Array.from({ length: Math.ceil(cards.length / 6) }, (_, page) => (
              <Page key={page} size="A4" margin={24}>
                <Text style={{ fontSize: 20, marginBottom: 8 }}>Pantry scanner actions</Text>
                <Text style={{ fontSize: 10, marginBottom: 16 }}>
                  Print at actual size. Scan an action, then the product or batch label. Extended
                  companion profile required for actions other than adding.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {cards.slice(page * 6, page * 6 + 6).map(([title, code]) => (
                    <View key={code} style={{ width: '50%', padding: 12, marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, marginBottom: 8 }}>{title}</Text>
                      <QrCode data={code!} size={110} />
                      <Text style={{ fontSize: 7, marginTop: 6 }}>{code}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 9 }}>
                  A beep means read; check Bòrd for the saved result. Undo reverses the last
                  eligible transaction. Reset returns to the configured default mode.
                </Text>
              </Page>
            ))}
          </Document>,
        ),
      }),
      contentType: 'application/pdf',
      filename: 'bord-scanner-cards.pdf',
    };
  } finally {
    rendering = false;
  }
}
