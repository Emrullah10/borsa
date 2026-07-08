import { WebSocketServer } from 'ws';

export function createWsServer() {
  const clients = new Set();

  function addClient(ws) {
    clients.add(ws);
    ws.on?.('close', () => clients.delete(ws));
  }

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  function attach(httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', (ws) => {
      addClient(ws);
      const ping = setInterval(() => {
        if (ws.readyState === 1) ws.ping();
      }, 30_000);
      ws.on('close', () => clearInterval(ping));
    });
    return wss;
  }

  return { addClient, broadcast, attach };
}
