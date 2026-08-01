import { describe, it, expect, vi } from 'vitest';
import { buildTable, mount } from './fixtures/dockerTable.js';
import { indexContainers } from '../src/indexer.js';
import { matchEntries } from '../src/matcher.js';
import { createGate } from '../src/gate.js';
import { createApplier } from '../src/applier.js';
import { createGuard } from '../src/guard.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

const sample = () => buildTable({
  loose: [{ cid: 'aaa111', name: 'mylar3' }],
  folders: [
    { id: 'F1', name: 'Services', collapsed: true,
      children: [{ cid: 'bbb111', name: 'sonarr' }, { cid: 'bbb222', name: 'radarr' }] },
  ],
});

/**
 * Nothing else proves the applier's writes actually go through the gate. An
 * applier that bypassed gate.run() entirely would still pass every applier
 * test in isolation — those tests build a real gate but never a guard, so a
 * bypass would be invisible there. Wire a real gate + applier + guard
 * together, the way bootstrap will, and prove the guard never sees our own
 * writes as foreign.
 */
describe('applier + guard integration', () => {
  it('never trips the guard for its own writes across a full filter/reset cycle', async () => {
    const tbody = mount(sample());
    const gate = createGate();
    const applier = createApplier(tbody, gate);
    const onForeign = vi.fn();
    const guard = createGuard(tbody, gate, onForeign);
    guard.start();

    applier.apply(matchEntries(indexContainers(tbody), 'arr'));
    await flush();
    expect(onForeign).not.toHaveBeenCalled();

    applier.reset();
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });
});
