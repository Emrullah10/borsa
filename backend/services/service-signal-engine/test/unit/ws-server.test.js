import { describe, it, expect, vi } from 'vitest';
import { createWsServer } from '../../src/ws-server.js';

describe('createWsServer', () => {
  it('broadcast: sadece OPEN client\'lara mesaj gönderir', () => {
    const { broadcast, addClient } = createWsServer();
    const sent = [];
    const openClient = { readyState: 1, send: (msg) => sent.push(msg) };
    const closedClient = { readyState: 3, send: vi.fn() };

    addClient(openClient);
    addClient(closedClient);
    broadcast({ type: 'signal', data: { id: 1 } });

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ type: 'signal', data: { id: 1 } });
    expect(closedClient.send).not.toHaveBeenCalled();
  });

  it('addClient: close event\'te client kümeden çıkar', () => {
    const { broadcast, addClient } = createWsServer();
    const handlers = {};
    const client = {
      readyState: 1,
      send: vi.fn(),
      on: (event, fn) => { handlers[event] = fn; },
    };
    addClient(client);
    handlers['close']?.();
    broadcast({ type: 'test' });
    expect(client.send).not.toHaveBeenCalled();
  });
});
