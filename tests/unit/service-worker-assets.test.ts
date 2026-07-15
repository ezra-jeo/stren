import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type FetchHandler = (event: {
  request: { method: string; url: string; mode: string; destination: string };
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

function loadWorker(fetchMock: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, FetchHandler>();
  const cache = {
    match: vi.fn().mockResolvedValue(new Response('<html>stale landing</html>', { headers: { 'content-type': 'text/html' } })),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  vm.runInNewContext(source, {
    URL,
    Promise,
    Response,
    setTimeout,
    self: {
      location: { origin: 'https://stren.test' },
      addEventListener: (type: string, handler: FetchHandler) => listeners.set(type, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
    caches: {
      open: vi.fn().mockResolvedValue(cache),
      match: vi.fn(),
      keys: vi.fn(),
      delete: vi.fn(),
    },
    fetch: fetchMock,
  });

  return { cache, fetchHandler: listeners.get('fetch')! };
}

describe('service-worker static assets', () => {
  it('ships the canonical logo as real PNG bytes', () => {
    const logo = readFileSync(resolve(process.cwd(), 'public/stren-logo.png'));
    expect([...logo.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('always fetches Next styles from the network instead of replaying an old cached response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('body { color: black; }', { headers: { 'content-type': 'text/css' } }));
    const { cache, fetchHandler } = loadWorker(fetchMock);
    let response: Promise<Response> | undefined;

    fetchHandler({
      request: { method: 'GET', url: 'https://stren.test/_next/static/chunks/app.css', mode: 'cors', destination: 'style' },
      respondWith: (nextResponse) => { response = nextResponse; },
      waitUntil: () => {},
    });

    expect(await response?.then((result) => result.text())).toBe('body { color: black; }');
    expect(cache.match).not.toHaveBeenCalled();
  });

  it('discards a stale non-image logo response and replaces it with a real image', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('png-bytes', { headers: { 'content-type': 'image/png' } }));
    const { cache, fetchHandler } = loadWorker(fetchMock);
    let response: Promise<Response> | undefined;
    const request = { method: 'GET', url: 'https://stren.test/stren-logo.png', mode: 'cors', destination: 'image' };

    fetchHandler({
      request,
      respondWith: (nextResponse) => { response = nextResponse; },
      waitUntil: () => {},
    });

    expect(await response?.then((result) => result.text())).toBe('png-bytes');
    expect(cache.delete).toHaveBeenCalledWith(request);
  });
});
