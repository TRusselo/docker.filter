/**
 * Watches the container table for row changes we did not cause — folder.view2
 * expanding a folder, or an Unraid background re-render. Rather than fight it,
 * we drop the filter and let the page return to its own state.
 *
 * Registers a drain on the gate so records produced by our own writes are
 * consumed and discarded while the gate is still busy.
 */
function touchesRow(nodes) {
  for (const node of nodes) {
    if (node.nodeName === 'TR') return true;
  }
  return false;
}

export function createGuard(tbody, gate, onForeignChange) {
  const observer = new MutationObserver((records) => {
    if (gate.busy) return;
    const rowChanged = records.some(
      (r) => r.type === 'childList' &&
        (touchesRow(r.addedNodes) || touchesRow(r.removedNodes)),
    );
    if (!rowChanged) return;
    onForeignChange();
  });

  gate.onDrain(() => observer.takeRecords());

  return {
    start() {
      observer.observe(tbody, { childList: true, subtree: true });
    },
    stop() {
      observer.disconnect();
    },
  };
}
