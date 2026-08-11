import { model, type ModelBuilder } from '@diagramming/core';

/**
 * One model, built three times with a different plane declared first.
 *
 * The first-declared plane is the default, and `diagc publish` exports the
 * default plane — so this is how the docs get one exported image per plane
 * without hand-made screenshots. Not a filename ending in `.diagram.ts`, so the
 * compiler's glob ignores it; the three sibling sources import it.
 *
 * Used by docs/how-to/use-planes-and-layers.md.
 */
export type PlaneOrder = 'architecture' | 'infra' | 'flow';

export function docsPlanes(id: string, name: string, first: PlaneOrder): ModelBuilder {
  const m = model(id, { name });

  m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });

  // A container is meaningless outside its own plane — with no containment there
  // it would float in as an empty box — so each plane hides the other's.
  const INFRA_ONLY = ['k8s', 'rds'];
  const ARCH_ONLY = ['shop', 'billing'];

  const planes: Record<PlaneOrder, () => void> = {
    architecture: () => m.plane('architecture', { name: 'Architecture', hides: INFRA_ONLY }),
    infra: () => m.plane('infra', { name: 'Infrastructure', hides: ARCH_ONLY }),
    // borrows architecture's structure, presets the overlay, and drops the
    // ordinary arrows so only the flow shows
    flow: () =>
      m.plane('flow', {
        name: 'Data flow',
        containmentOf: 'architecture',
        layers: ['data-flow'],
        baseRelations: false,
        hides: INFRA_ONLY,
      }),
  };
  planes[first]();
  for (const key of ['architecture', 'infra', 'flow'] as PlaneOrder[]) {
    if (key !== first) planes[key]();
  }

  // ---- the entities, declared once -----------------------------------------
  const shop = m.node('shop', { type: 'system', name: 'Shop' });
  const billing = m.node('billing', { type: 'system', name: 'Billing' });
  const web = m.node('web', { type: 'service', name: 'Storefront' });
  const orders = m.node('orders', { type: 'service', name: 'Orders API' });
  const payments = m.node('payments', { type: 'service', name: 'Payments API' });
  const db = m.node('db', { type: 'database', name: 'Orders DB' });

  const k8s = m.node('k8s', { type: 'infra', icon: 'kubernetes', name: 'K8s cluster' });
  const rds = m.node('rds', { type: 'aws-rds', name: 'RDS' });

  // ---- architecture plane: who owns what -----------------------------------
  // Tagged explicitly rather than left untagged: untagged containment belongs to
  // whichever plane is declared FIRST, so leaving it bare would make these three
  // files different models instead of one model shown three ways.
  shop.contains(web, orders, { plane: 'architecture' });
  billing.contains(payments, { plane: 'architecture' });
  orders.contains(db, { plane: 'architecture' });

  // ---- infra plane: where it runs ------------------------------------------
  k8s.contains(web, orders, payments, { plane: 'infra' });
  rds.contains(db, { plane: 'infra' });

  // ---- relations -----------------------------------------------------------
  m.relate(web, orders, { kind: 'sync' });
  m.relate(orders, db, { kind: 'writes' });
  m.relate(payments, db, { kind: 'reads' });

  m.relate(orders, payments, { kind: 'flow', label: 'order placed', layer: 'data-flow' });
  m.relate(payments, web, { kind: 'flow', label: 'receipt', layer: 'data-flow' });

  return m;
}
