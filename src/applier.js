import { HIDDEN_CLASS } from './selectors.js';

const HEADER_CLASS = 'df-results-header';
const FILTERING_CLASS = 'df-filtering';

function makeHeader(count, columnCount) {
  const tr = document.createElement('tr');
  tr.className = HEADER_CLASS;
  const td = document.createElement('td');
  td.colSpan = columnCount;
  td.textContent = `${count} matching container${count === 1 ? '' : 's'}`;
  tr.appendChild(td);
  return tr;
}

/**
 * The only unit permitted to mutate the container table.
 *
 * `apply()` always resets first, so exactly one dirty state exists and it can
 * never nest. Rows are MOVED, never cloned — they carry unique ids such as
 * `cpu-<cid>` that Unraid's live stats updater resolves with getElementById.
 */
export function createApplier(tbody, gate) {
  /** @type {Array<{row: Element, parent: Node, nextSibling: Node|null}>} */
  let moved = [];
  let hidden = [];
  let header = null;

  function restore() {
    try {
      // Reverse order: a row's recorded nextSibling may be a row moved after it.
      for (let i = moved.length - 1; i >= 0; i -= 1) {
        const { row, parent, nextSibling } = moved[i];
        try {
          if (parent) parent.insertBefore(row, nextSibling);
        } catch {
          // A corrupted record degrades to one lost row, not a wedged filter.
        }
      }
    } finally {
      moved = [];
      for (const row of hidden) row.classList.remove(HIDDEN_CLASS);
      hidden = [];
      if (header) {
        header.remove();
        header = null;
      }
      document.body.classList.remove(FILTERING_CLASS);
    }
  }

  function reset() {
    gate.run(restore);
  }

  function apply(entries) {
    reset();
    if (entries.length === 0) return;

    gate.run(() => {
      const columnCount = tbody.parentElement.tHead
        ? tbody.parentElement.tHead.rows[0].cells.length
        : 10;

      // Reordering while filtered would invalidate every recorded restore
      // position, so folder.view2's drag handles are hidden via this class.
      document.body.classList.add(FILTERING_CLASS);

      hidden = Array.from(tbody.children);
      for (const row of hidden) row.classList.add(HIDDEN_CLASS);

      header = makeHeader(entries.length, columnCount);
      tbody.insertBefore(header, tbody.firstChild);

      let anchor = header;
      for (const { row } of entries) {
        // A row with no current parent can't be restored later; skip it
        // rather than recording an unrestorable entry.
        if (!row.parentNode) continue;
        moved.push({ row, parent: row.parentNode, nextSibling: row.nextSibling });
        anchor.after(row);
        row.classList.remove(HIDDEN_CLASS);
        anchor = row;
      }
    });
  }

  return {
    apply,
    reset,
    get active() { return moved.length > 0; },
  };
}
