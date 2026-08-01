const DEBOUNCE_MS = 120;

/**
 * The filter bar. Owns its own element and reports queries upward; it never
 * touches the container table.
 */
export function createUI({ onQuery, debounceMs = DEBOUNCE_MS }) {
  const element = document.createElement('div');
  element.className = 'df-bar';
  element.innerHTML = `
    <i class="fa fa-filter df-icon" aria-hidden="true"></i>
    <input type="text" class="df-input" spellcheck="false" autocomplete="off"
           placeholder="Filter containers…" aria-label="Filter containers">
    <button type="button" class="df-clear" title="Clear filter" hidden>&#10005;</button>
    <span class="df-count"></span>`;

  const input = element.querySelector('.df-input');
  const clearButton = element.querySelector('.df-clear');
  const count = element.querySelector('.df-count');
  let timer = null;

  function report(value) {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    onQuery(value);
  }

  function syncClearButton() {
    clearButton.hidden = input.value === '';
  }

  input.addEventListener('input', () => {
    syncClearButton();
    if (input.value === '') { report(''); return; }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onQuery(input.value); }, debounceMs);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // The bar can end up inside one of Unraid's own <form> elements;
      // without this Enter triggers implicit form submission and navigates
      // the page away. Flush the pending debounce instead.
      e.preventDefault();
      report(input.value);
      return;
    }
    if (e.key !== 'Escape') return;
    // Only swallow Escape when there's something to clear — an empty box
    // shouldn't eat Escape from Unraid's own document-level handlers.
    if (input.value !== '') e.stopPropagation();
    clear();
  });

  clearButton.addEventListener('click', clear);

  function clear() {
    input.value = '';
    syncClearButton();
    report('');
  }

  return {
    element,
    clear,
    focus() { input.focus(); },
    setCount(shown, total) {
      count.textContent = shown === null ? '' : `${shown} of ${total}`;
    },
  };
}
