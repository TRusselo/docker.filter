import { TABLE_ID, S } from './selectors.js';
import { indexContainers } from './indexer.js';
import { matchEntries } from './matcher.js';
import { createGate } from './gate.js';
import { createApplier } from './applier.js';
import { createGuard } from './guard.js';
import { createUI } from './ui.js';
import { whenSettled, waitForElement } from './bootstrap.js';

const ROOT_ID = 'df-root';
const SECTION_TITLE = 'Docker Filter';

/**
 * Moves the bar directly above the container table and removes the section
 * wrapper Unraid rendered it in, along with that section's heading.
 */
export function relocate(bar) {
  const container = document.querySelector(S.tableContainer);
  if (!container) return;
  container.parentNode.insertBefore(bar, container);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  let prev = root.previousElementSibling;
  while (prev && (prev.tagName === 'SCRIPT' || prev.tagName === 'LINK')) {
    prev = prev.previousElementSibling;
  }
  if (prev && prev.classList.contains('title') &&
      prev.textContent.trim() === SECTION_TITLE) {
    prev.remove();
  }
  root.remove();
}

export async function start({ settle = {} } = {}) {
  const table = await waitForElement(`#${TABLE_ID}`, { timeout: settle.timeout ?? 10000 });
  if (!table) return null;

  const tbody = table.tBodies[0];
  if (!tbody) return null;

  await whenSettled(tbody, settle);

  const gate = createGate();
  const applier = createApplier(tbody, gate);
  const app = { lastCount: { shown: null, total: 0 } };

  const ui = createUI({ onQuery: (q) => app.setQuery(q) });

  const guard = createGuard(tbody, gate, () => {
    if (!applier.active) return;
    applier.reset();
    ui.clear();
    ui.setCount(null, 0);
  });

  app.setQuery = (query) => {
    try {
      const entries = indexContainers(tbody);
      const matches = matchEntries(entries, query);
      applier.apply(matches);
      app.lastCount = {
        shown: query.trim() === '' ? null : matches.length,
        total: entries.length,
      };
      ui.setCount(app.lastCount.shown, app.lastCount.total);
    } catch (err) {
      // A bug must never leave the table mangled.
      console.error('[docker.filter]', err);
      try { applier.reset(); } catch { /* already broken; nothing more to do */ }
      guard.stop();
      ui.element.remove();
    }
  };

  const root = document.getElementById(ROOT_ID);
  const bar = root ? root.querySelector('.df-bar') : null;
  if (bar) { bar.replaceWith(ui.element); }
  relocate(ui.element);

  guard.start();
  window.addEventListener('beforeunload', () => applier.reset());

  return app;
}

if (typeof document !== 'undefined' && document.getElementById(ROOT_ID)) {
  start().catch((err) => console.error('[docker.filter]', err));
}
