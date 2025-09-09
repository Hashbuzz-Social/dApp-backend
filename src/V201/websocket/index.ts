import http from 'http';
import { attachWebSocketServer, sendToUser } from './websocketManager';

export const attach = (server: http.Server) => attachWebSocketServer(server);
export { sendToUser };

export default { attach, sendToUser } as const;
