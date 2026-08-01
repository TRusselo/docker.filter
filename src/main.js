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
 *
 * `table` is the specific `#docker_containers` element `start()` found —
 * other plugins (e.g. compose.manager) can render their own `.TableContainer`
 * elsewhere on the page, so we anchor on the container that actually wraps
 * our table rather than the first `.TableContainer` in the document. If our
 * table isn't wrapped in one at all, fall back to anchoring on the table
 * itself so the bar still enters the document.
 */
export function relocate(bar, table) {
  const anchor = (table && table.closest(S.tableContainer)) || table || null;
  if (anchor) {
    anchor.parentNode.insertBefore(bar, anchor);
  }

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
  // `test` guards against the parse race: the HTML parser can yield between
  // <table> and its first <tr> while streaming a large table, so a poll tick
  // may see the table before it has a tbody. Keep polling until both exist.
  const table = await waitForElement(`#${TABLE_ID}`, {
    timeout: settle.timeout ?? 10000,
    test: (el) => el.tBodies.length > 0,
  });
  if (!table) return null;

  const tbody = table.tBodies[0];

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
  relocate(ui.element, table);

  guard.start();
  window.addEventListener('beforeunload', () => applier.reset());

  return app;
}

// Guards against starting the stack twice — two #df-root elements, or the
// bundle script included twice, would otherwise race two independent
// applier/guard stacks over the same rows. Lives here, not inside start(),
// so tests can still call the exported start() directly and repeatedly.
if (typeof document !== 'undefined' && document.getElementById(ROOT_ID)) {
  if (typeof window !== 'undefined' && window.__dockerFilterStarted) {
    // Another evaluation of this script already claimed the page.
  } else {
    if (typeof window !== 'undefined') window.__dockerFilterStarted = true;
    start().catch((err) => console.error('[docker.filter]', err));
  }
}
