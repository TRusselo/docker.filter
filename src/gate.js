/**
 * Serialises our DOM writes so the MutationObserver guard can ignore them.
 *
 * Drain callbacks run inside the `finally`, before the depth is decremented,
 * so an observer's `takeRecords()` discards our own records while `busy` is
 * still true. Re-entrant: nested `run()` calls do not clear `busy` early.
 */
export function createGate() {
  let depth = 0;
  const drains = [];

  return {
    onDrain(fn) { drains.push(fn); },

    run(fn) {
      depth += 1;
      try {
        return fn();
      } finally {
        for (const drain of drains) drain();
        depth -= 1;
      }
    },

    get busy() { return depth > 0; },
  };
}
