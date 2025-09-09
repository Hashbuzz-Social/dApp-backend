import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { verifyAccessToken } from '@shared/Verify';
import Logger from 'jet-logger';
import { encryptData } from './wsCrypto';

type ClientMap = Map<string, WebSocket>;

const clients: ClientMap = new Map();

export const attachWebSocketServer = (server: http.Server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    (async () => {
      try {
        const host = req.headers.host ?? 'localhost';
        const url = new URL(req.url || '', `http://${host}`);
        const token = url.searchParams.get('access_token');
        if (!token) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        const { payload } = await verifyAccessToken(token);
        const userId = String((payload as any).id ?? (payload as any).userId ?? '');
        if (!userId) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        clients.set(userId, ws);
        Logger.info(`WebSocket: User ${userId} connected`);

        ws.on('close', () => {
          clients.delete(userId);
          Logger.info(`WebSocket: User ${userId} disconnected`);
        });

        ws.on('message', (raw) => {
          Logger.info(`WS message from ${userId}: ${String(raw)}`);
          // Optional: handle pings or client requests here
        });
      } catch (err) {
        Logger.err('WS connection error: ' + String(err));
        try {
          ws.close(1011, 'Internal error');
        } catch (closeErr) {
          Logger.err('Failed to close WS: ' + String(closeErr));
        }
      }
    })();
  });

  Logger.info('WebSocket server attached');
  return wss;
};

export const sendToUser = async (userId: string, event: string, data: any) => {
  const client = clients.get(userId);
  if (!client || client.readyState !== WebSocket.OPEN) return false;
  const payload = JSON.stringify({ event, data });
  const message = await encryptData(payload);
  client.send(message);
  return true;
};
