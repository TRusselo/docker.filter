import { describe, it, expect, vi } from 'vitest';
import { createGate } from '../src/gate.js';

describe('createGate', () => {
  it('reports busy only while running', () => {
    const gate = createGate();
    expect(gate.busy).toBe(false);
    gate.run(() => { expect(gate.busy).toBe(true); });
    expect(gate.busy).toBe(false);
  });

  it('runs drains before clearing busy, so drains still see busy', () => {
    const gate = createGate();
    const seen = [];
    gate.onDrain(() => seen.push(gate.busy));
    gate.run(() => {});
    expect(seen).toEqual([true]);
  });

  it('clears busy even when the body throws', () => {
    const gate = createGate();
    expect(() => gate.run(() => { throw new Error('boom'); })).toThrow('boom');
    expect(gate.busy).toBe(false);
  });

  it('still runs drains when the body throws', () => {
    const gate = createGate();
    const drain = vi.fn();
    gate.onDrain(drain);
    expect(() => gate.run(() => { throw new Error('boom'); })).toThrow();
    expect(drain).toHaveBeenCalledOnce();
  });

  it('supports nesting without clearing busy early', () => {
    const gate = createGate();
    gate.run(() => {
      gate.run(() => {});
      expect(gate.busy).toBe(true);
    });
    expect(gate.busy).toBe(false);
  });

  it('returns the body result', () => {
    expect(createGate().run(() => 42)).toBe(42);
  });

  it('runs remaining drains and clears busy even if an earlier drain throws', () => {
    const gate = createGate();
    const second = vi.fn();
    gate.onDrain(() => { throw new Error('drain boom'); });
    gate.onDrain(second);
    gate.run(() => {});
    expect(second).toHaveBeenCalledOnce();
    expect(gate.busy).toBe(false);
  });
});
