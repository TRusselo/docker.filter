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

/** Polls for an element, resolving null if it never appears. */
export function waitForElement(selector, { timeout = 10000, interval = 100 } = {}) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) { resolve(found); return; }
    let waited = 0;
    const tick = setInterval(() => {
      const el = document.querySelector(selector);
      waited += interval;
      if (el || waited >= timeout) {
        clearInterval(tick);
        resolve(el || null);
      }
    }, interval);
  });
}
