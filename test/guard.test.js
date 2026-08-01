import { describe, it, expect, vi } from 'vitest';
import { buildTable, mount } from './fixtures/dockerTable.js';
import { createGate } from '../src/gate.js';
import { createGuard } from '../src/guard.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const tbody = mount(buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] }));
  const gate = createGate();
  const onForeign = vi.fn();
  const guard = createGuard(tbody, gate, onForeign);
  guard.start();
  return { tbody, gate, guard, onForeign };
}

describe('createGuard', () => {
  it('fires when something else changes the rows', async () => {
    const { tbody, onForeign } = setup();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('stays silent for writes made through the gate', async () => {
    const { tbody, gate, onForeign } = setup();
    gate.run(() => tbody.appendChild(document.createElement('tr')));
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('stays silent for gated writes even when they throw', async () => {
    const { tbody, gate, onForeign } = setup();
    expect(() => gate.run(() => {
      tbody.appendChild(document.createElement('tr'));
      throw new Error('boom');
    })).toThrow();
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('detects a foreign change that happens after a gated write', async () => {
    const { tbody, gate, onForeign } = setup();
    gate.run(() => tbody.appendChild(document.createElement('tr')));
    await flush();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('stops firing after stop()', async () => {
    const { tbody, guard, onForeign } = setup();
    guard.stop();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('detects a mutation inside a folder-storage subtree', async () => {
    const tbody = mount(buildTable({
      folders: [{
        id: 'F1', name: 'Services', collapsed: true,
        children: [{ cid: 'bbb111', name: 'sonarr' }],
      }],
    }));
    const gate = createGate();
    const onForeign = vi.fn();
    const guard = createGuard(tbody, gate, onForeign);
    guard.start();

    const storage = tbody.querySelector('.folder-storage');
    storage.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('ignores a live stats update that replaces an <i> element\'s text node', async () => {
    const { tbody, onForeign } = setup();
    const cpuEl = tbody.querySelector('i[id^="cpu-"]');
    cpuEl.textContent = '12%';
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('ignores a live stats update setting textContent repeatedly', async () => {
    const { tbody, onForeign } = setup();
    const loadEl = tbody.querySelector('i[id^="load-"]');
    loadEl.textContent = '0.5';
    loadEl.textContent = '0.6';
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('fires when a <tr> is removed', async () => {
    const { tbody, onForeign } = setup();
    tbody.removeChild(tbody.firstElementChild);
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('fires when a <tr> moves out of a folder-storage subtree', async () => {
    const tbody = mount(buildTable({
      folders: [{
        id: 'F1', name: 'Services', collapsed: true,
        children: [{ cid: 'bbb111', name: 'sonarr' }],
      }],
    }));
    const gate = createGate();
    const onForeign = vi.fn();
    const guard = createGuard(tbody, gate, onForeign);
    guard.start();

    const storage = tbody.querySelector('.folder-storage');
    const row = storage.querySelector('tr');
    tbody.appendChild(row);
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('ignores a non-TR element added inside a row', async () => {
    const { tbody, onForeign } = setup();
    const cell = tbody.querySelector('td');
    const span = document.createElement('span');
    cell.appendChild(span);
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });
});
