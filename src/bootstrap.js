/**
 * Resolves once `target` has gone `quiet` ms without a DOM mutation, or after
 * `timeout` ms regardless. folder.view2 moves rows into `.folder-storage` and
 * then re-expands saved-open folders; indexing before that finishes yields a
 * wrong model.
 */
export function whenSettled(target, { quiet = 400, timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    let quietTimer = null;
    let hardTimer = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (hardTimer !== null) clearTimeout(hardTimer);
      observer.disconnect();
      resolve();
    };

    const observer = new MutationObserver(() => {
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quiet);
    });

    observer.observe(target, { childList: true, subtree: true });
    quietTimer = setTimeout(finish, quiet);
    hardTimer = setTimeout(finish, timeout);
  });
}

/**
 * Polls for an element, resolving null if it never appears (or never
 * satisfies `test`, when given).
 *
 * `test` guards against a parse race: the HTML parser yields mid-stream while
 * a large table is still being written, so a poll tick can land between
 * `<table>` and its first `<tr>` — the element exists but isn't ready yet.
 * Without a predicate an early match would be accepted anyway and the
 * caller would never get another look.
 */
export function waitForElement(selector, { timeout = 10000, interval = 100, test } = {}) {
  const satisfies = (el) => !!el && (!test || test(el));
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (satisfies(found)) { resolve(found); return; }
    let waited = 0;
    const tick = setInterval(() => {
      const el = document.querySelector(selector);
      waited += interval;
      if (satisfies(el)) {
        clearInterval(tick);
        resolve(el);
      } else if (waited >= timeout) {
        clearInterval(tick);
        resolve(null);
      }
    }, interval);
  });
}
