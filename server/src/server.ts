/**
 * 1. Поднимает Express HTTP-сервер (порт 3000) с простым /health эндпоинтом.
 * 2. Вешает WebSocket-сервер (ws) на тот же HTTP-сервер.
 * 3. Реализует echo-логику: при подключении шлёт приветствие, эхо-ответ на любые JSON/строки.
 *
 
 * Расширение (Sprint 2):
 * - Храним игроков в памяти, простая модель (id, nickname, position).
 * - Обрабатываем сообщения типов "join" и "input".
 * - Периодически шлём всем клиентам общий state (массив игроков).
 *
 * Заглушки / упрощения:
 * - Нет авторизации и ролей (это отдельный спринт).
 * - Нет реальной физики: игроки просто двигаются по вектору инпута.
 * - Нет комнат — одна глобальная "арена" для всех подключённых.
 */

import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// -------------------- Типы протокола --------------------

type ClientToServerMessage =
  | { type: 'join'; nickname: string }
  | { type: 'input'; input: { dx: number; dy: number } };

type ServerToClientMessage =
  | { type: 'welcome'; message: string }
  | { type: 'joined'; playerId: string }
  | {
      type: 'state';
      players: Array<{
        id: string;
        nickname: string;
        x: number;
        y: number;
        score: number;
      }>;
    };

type Player = {
  id: string;
  nickname: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number; // добавили счет игрока
  socket: WebSocket;
};

// Простое in-memory "хранилище" игроков.
const players = new Map<string, Player>();

const app = express();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', players: players.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// -------------------- Обработчики WebSocket --------------------

wss.on('connection', (ws: WebSocket, req) => {
  const clientAddress = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientAddress}`);

  // Отправляем приветствие.
  const welcome: ServerToClientMessage = {
    type: 'welcome',
    message: 'Hello from Arena Dash server!'
  };
  ws.send(JSON.stringify(welcome));

  // Локальный id игрока для этого сокета (появится после join).
  let playerId: string | null = null;

  ws.on('message', (data: Buffer) => {
    const text = data.toString();
    console.log('[WS] received raw:', text);

    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(text) as ClientToServerMessage;
    } catch (e) {
      console.warn('[WS] invalid JSON, ignoring');
      return;
    }

    if (msg.type === 'join') {
      if (playerId) {
        console.warn('[WS] player already joined, ignoring duplicate join');
        return;
      }
      const id = randomUUID();
      playerId = id;

      const player: Player = {
        id,
        nickname: msg.nickname || 'Anonymous',
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 200, // можно поправить позже, сейчас не критично
        vx: 0,
        vy: 0,
        score: 0, // начальный счет 0
        socket: ws
      };
      players.set(id, player);

      const joined: ServerToClientMessage = {
        type: 'joined',
        playerId: id
      };
      ws.send(JSON.stringify(joined));

      console.log(`[WS] player joined: ${player.nickname} (${id})`);
    } else if (msg.type === 'input') {
      if (!playerId) {
        console.warn('[WS] got input before join, ignoring');
        return;
      }
      const player = players.get(playerId);
      if (!player) return;

      // Простейшая модель скорости на основе инпута.
      const speed = 150; // пикселей в секунду, грубая константа
      player.vx = msg.input.dx * speed;
      player.vy = msg.input.dy * speed;
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log('[WS] client disconnected', code, reason.toString());
    if (playerId && players.has(playerId)) {
      players.delete(playerId);
      console.log(`[WS] removed player ${playerId} from registry`);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('[WS] socket error', err);
  });
});

// -------------------- Игровой цикл и рассылка state --------------------

// Дельта по времени в секундах.
let lastUpdate = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

  // Обновляем позиции всех игроков.
  // Очки вместо тиков потом заменим на столкновения, pickup’ы и т.д.
  players.forEach((player) => {
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const isMoving = player.vx !== 0 || player.vy !== 0;
    if (isMoving) {
        player.score += dt; // "очки за каждый тик движения"
    }
    // TODO: добавить ограничения по границам арены
  });

  // Рассылаем состояние всем подключённым игрокам.
  const snapshot: ServerToClientMessage = {
    type: 'state',
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      x: p.x,
      y: p.y,
      score: p.score // добавляем счет в состояние
    }))
  };

  const payload = JSON.stringify(snapshot);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// 20 тиков в секунду — достаточно для простого прототипа.
setInterval(gameLoop, 50);

server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});
