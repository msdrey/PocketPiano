import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CACHE, ASSETS, networkFirst } from '../serviceWorker.js';

describe('CACHE config', () => {
  it('has a non-empty cache name', () => {
    expect(typeof CACHE).toBe('string');
    expect(CACHE.length).toBeGreaterThan(0);
  });

  it('includes key app assets', () => {
    expect(ASSETS).toContain('/');
    expect(ASSETS).toContain('/src/audio.js');
    expect(ASSETS).toContain('/src/keyboard.js');
    expect(ASSETS).toContain('/manifest.json');
    expect(ASSETS).toContain('/icon.png');
  });
});

describe('networkFirst', () => {
  let mockCache;

  beforeEach(() => {
    mockCache = { put: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue(mockCache),
      match: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns network response and caches it when online', async () => {
    const mockRes = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockRes));

    const res = await networkFirst(new Request('http://localhost/'));

    expect(res).toBe(mockRes);
    expect(mockCache.put).toHaveBeenCalledOnce();
  });

  it('returns cached response when network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const cached = new Response('cached', { status: 200 });
    vi.stubGlobal('caches', {
      open: vi.fn(),
      match: vi.fn().mockResolvedValue(cached),
    });

    const res = await networkFirst(new Request('http://localhost/'));

    expect(res).toBe(cached);
  });

  it('returns 503 when both network and cache fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.stubGlobal('caches', {
      open: vi.fn(),
      match: vi.fn().mockResolvedValue(undefined),
    });

    const res = await networkFirst(new Request('http://localhost/'));

    expect(res.status).toBe(503);
  });
});
