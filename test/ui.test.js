import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUI } from '../src/ui.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
  const onQuery = vi.fn();
  const ui = createUI({ onQuery });
  document.body.innerHTML = '';
  document.body.appendChild(ui.element);
  const input = ui.element.querySelector('.df-input');
  const type = (v) => { input.value = v; input.dispatchEvent(new Event('input')); };
  return { ui, input, type, onQuery };
}

describe('createUI', () => {
  it('debounces input before reporting a query', () => {
    const { type, onQuery } = setup();
    type('so'); type('son'); type('sonarr');
    expect(onQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('sonarr');
  });

  it('reports an empty query immediately when cleared', () => {
    const { type, onQuery } = setup();
    type('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('clears on Escape', () => {
    const { input, type, onQuery } = setup();
    type('sonarr');
    vi.advanceTimersByTime(150);
    onQuery.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('clears when the clear button is clicked', () => {
    const { ui, input, type, onQuery } = setup();
    type('sonarr');
    vi.advanceTimersByTime(150);
    onQuery.mockClear();
    ui.element.querySelector('.df-clear').click();
    expect(input.value).toBe('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('shows the clear button only when there is text', () => {
    const { ui, type } = setup();
    const clear = ui.element.querySelector('.df-clear');
    expect(clear.hidden).toBe(true);
    type('x');
    expect(clear.hidden).toBe(false);
    type('');
    expect(clear.hidden).toBe(true);
  });

  it('renders the match count and hides it when idle', () => {
    const { ui } = setup();
    const count = ui.element.querySelector('.df-count');
    ui.setCount(3, 106);
    expect(count.textContent).toBe('3 of 106');
    ui.setCount(null, 106);
    expect(count.textContent).toBe('');
  });
});
