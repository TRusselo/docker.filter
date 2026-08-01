import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { whenSettled, waitForElement } from '../src/bootstrap.js';

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

describe('waitForElement', () => {
  it('resolves once an element that initially fails the predicate later satisfies it', async () => {
    document.body.innerHTML = '<table id="t"></table>';
    const done = vi.fn();
    waitForElement('#t', {
      timeout: 10000,
      interval: 100,
      test: (el) => el.tBodies.length > 0,
    }).then(done);

    await vi.advanceTimersByTimeAsync(250);
    expect(done).not.toHaveBeenCalled();

    document.getElementById('t').createTBody();
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledWith(document.getElementById('t'));
  });

  it('resolves null at timeout when the predicate is never satisfied', async () => {
    document.body.innerHTML = '<table id="t"></table>';
    const done = vi.fn();
    waitForElement('#t', {
      timeout: 500,
      interval: 100,
      test: (el) => el.tBodies.length > 0,
    }).then(done);

    await vi.advanceTimersByTimeAsync(500);
    expect(done).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('keeps the default behavior (no predicate) for existing callers', async () => {
    document.body.innerHTML = '';
    const done = vi.fn();
    waitForElement('#t', { timeout: 500, interval: 100 }).then(done);

    await vi.advanceTimersByTimeAsync(200);
    document.body.innerHTML = '<div id="t"></div>';
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalledExactlyOnceWith(document.getElementById('t'));
  });
});
