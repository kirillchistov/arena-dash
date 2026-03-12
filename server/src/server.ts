/**
 * 1. Поднимает Express HTTP-сервер (порт 3000) с простым /health эндпоинтом.
 * 2. Вешает WebSocket-сервер (ws) на тот же HTTP-сервер.
 * 3. Реализует echo-логику: при подключении шлёт приветствие, эхо-ответ на любые JSON/строки.
 *
 * Заглушки / упрощения:
 * - Нет авторизации и ролей (будут добавлены позже через JWT).
 * - Нет игрового цикла и комнат, только эхо-поведение.
 * - Сообщения не типизированы и не валидируются (это будет отдельным этапом).
 */

import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  const clientAddress = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientAddress}`);

  ws.send(
    JSON.stringify({
      type: 'welcome',
      message: 'Hello from Arena Dash server!'
    })
  );

  ws.on('message', (data: Buffer) => {
    const text = data.toString();
    console.log('[WS] received:', text);

    ws.send(
      JSON.stringify({
        type: 'echo',
        payload: text
      })
    );
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log('[WS] client disconnected', code, reason.toString());
  });

  ws.on('error', (err: Error) => {
    console.error('[WS] socket error', err);
  });
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});