import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { whenSettled } from '../src/bootstrap.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function target() {
  document.body.innerHTML = '<div id="t"></div>';
  return document.getElementById('t');
}

describe('whenSettled', () => {
  it('resolves after the quiet period with no mutations', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 10000 }).then(done);
    await vi.advanceTimersByTimeAsync(399);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toHaveBeenCalledOnce();
  });

  it('restarts the quiet period when a mutation lands', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 10000 }).then(done);
    await vi.advanceTimersByTimeAsync(300);
    el.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(300);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(done).toHaveBeenCalledOnce();
  });

  it('resolves at the hard timeout even if mutations never stop', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 1000 }).then(done);
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(150);
      el.appendChild(document.createElement('span'));
    }
    expect(done).toHaveBeenCalledOnce();
  });

  it('resolves only once', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 100, timeout: 300 }).then(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledOnce();
  });
});
