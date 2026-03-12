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

  // Расширяем под pickups
  type ServerToClientMessage =
  | { type: 'welcome'; message: string }
  | { type: 'joined'; playerId: string }
  | {
      type: 'state';
      matchId: number;
      timeLeft: number;
      players: Array<{
        id: string;
        nickname: string;
        x: number;
        y: number;
        score: number;
      }>;
      pickups: Array<{
        id: string;
        x: number;
        y: number;
        value: number;
      }>;
    }
  | {
      type: 'matchEnd';
      matchId: number;
      winner: { id: string; nickname: string; score: number } | null;
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
  speedMultiplier: number;
  shieldTicks: number;
};

type Pickup = {
  id: string;
  x: number;
  y: number;
  value: number;
  kind: PowerUpType;
};

type PowerUpType = 'speed' | 'shield';

// Простое in-memory "хранилище" игроков.
const players = new Map<string, Player>();
// Коллекция Pickups для начисления баллов
const pickups = new Map<string, Pickup>();



const app = express();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', players: players.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// -------------------- Константы арены и матча --------------------

const ARENA = {
  xMin: 60,
  yMin: 60,
  xMax: 740, // подгоним под размер Canvas позже, пока константы
  yMax: 540
};

const MATCH_DURATION_SECONDS = 60; // длительность матча
let matchTimeLeft = MATCH_DURATION_SECONDS;
let matchId = 1; // счётчик матчей

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
        speedMultiplier: 1;
        shieldTicks: 0;
        return;
      }
      const id = randomUUID();
      playerId = id;

      const player: Player = {
        id,
        nickname: msg.nickname || 'Anonymous',
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 200,
        vx: 0,
        vy: 0,
        score: 0,
        speedMultiplier: 1,
        shieldTicks: 0,
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

// --------------------- Границы арены + клэмп позиций -------------------
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// -------------------- Игровой цикл и рассылка state --------------------

// Дельта по времени в секундах.
let lastUpdate = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

  // Обновляем таймер матча.
  matchTimeLeft -= dt;
  if (matchTimeLeft <= 0) {
    // определяем победителя
    let winner: { id: string; nickname: string; score: number } | null = null;
    players.forEach((p) => {
      if (!winner || p.score > winner.score) {
        winner = { id: p.id, nickname: p.nickname, score: p.score };
      }
    });

    const endMsg: ServerToClientMessage = {
      type: 'matchEnd',
      matchId,
      winner
    };
    const endPayload = JSON.stringify(endMsg);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(endPayload);
      }
    });

    resetMatch();
  }

  // Коллизии игрок ↔ pickup
  const PICKUP_RADIUS = 16;
  const PLAYER_RADIUS = 14;
  const KNOCKBACK_STRENGTH = 250;

  // Обновляем позиции игроков и ограничиваем ареной.
  players.forEach((player) => {
    if (player.shieldTicks > 0) {
        player.shieldTicks -= 1;
    } else {
        player.shieldTicks = 0;
    }

    const effectiveSpeedMultiplier = player.speedMultiplier;
    player.x += player.vx * dt * effectiveSpeedMultiplier;
    player.y += player.vy * dt * effectiveSpeedMultiplier;

    player.x = clamp(player.x, ARENA.xMin, ARENA.xMax);
    player.y = clamp(player.y, ARENA.yMin, ARENA.yMax);
  });

  const playerList = Array.from(players.values());

  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a = playerList[i];
      const b = playerList[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = PLAYER_RADIUS * 2;
      if (distSq > minDist * minDist) continue;

      const dist = Math.max(Math.sqrt(distSq), 0.001);
      const nx = dx / dist;
      const ny = dy / dist;

      // Нокбэк в противоположные стороны
      a.vx -= nx * KNOCKBACK_STRENGTH;
      a.vy -= ny * KNOCKBACK_STRENGTH;
      b.vx += nx * KNOCKBACK_STRENGTH;
      b.vy += ny * KNOCKBACK_STRENGTH;

      // Простейший "демпфинг"
      a.vx *= 0.6;
      a.vy *= 0.6;
      b.vx *= 0.6;
      b.vy *= 0.6;

      // Очки: кто имел большую скорость, тот получает балл за «таран»
      const aSpeedSq = a.vx * a.vx + a.vy * a.vy;
      const bSpeedSq = b.vx * b.vx + b.vy * b.vy;
      if (aSpeedSq > bSpeedSq) {
        a.score += 5;
      } else if (bSpeedSq > aSpeedSq) {
        b.score += 5;
      }
    }
  }

  // отдельный проход по pickup’ам
  for (const [id, pickup] of pickups) {
    for (const player of players.values()) {
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const distSq = dx * dx + dy * dy;
      const radiusSum = PICKUP_RADIUS + 14; // радиус игрока

      if (distSq <= radiusSum * radiusSum) {
        // базовые очки
        player.score += pickup.value;

        // эффект
        if (pickup.kind === 'speed') {
            player.speedMultiplier = 1.8;
            // эффект продлится несколько тиков — например, 3 секунды
            player.shieldTicks = player.shieldTicks; // без изменения
        } else if (pickup.kind === 'shield') {
            player.shieldTicks = 60; // 60 тиков ~ 3 секунды при 20 тиках/сек
        }

        pickups.delete(id);
        spawnRandomPickup();
        break;
      }
    }
  }

  const snapshot: ServerToClientMessage = {
    type: 'state',
    matchId,
    timeLeft: matchTimeLeft,
    players: Array.from(players.values()).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        x: p.x,
        y: p.y,
        score: p.score
    })),
    pickups: Array.from(pickups.values()).map((pk) => ({
        id: pk.id,
        x: pk.x,
        y: pk.y,
        value: pk.value
    }))
  };

  const payload = JSON.stringify(snapshot);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// -------------------- Возобновление пикапов --------------------
function spawnRandomPickup() {
  const id = randomUUID();
  const kinds: PowerUpType[] = ['speed', 'shield'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];

  const pickup: Pickup = {
    id,
    x: ARENA.xMin + 40 + Math.random() * (ARENA.xMax - ARENA.xMin - 80),
    y: ARENA.yMin + 40 + Math.random() * (ARENA.yMax - ARENA.yMin - 80),
    value: 10,
    kind
  };
  pickups.set(id, pickup);
}

function resetMatch() {
  matchId += 1;
  matchTimeLeft = MATCH_DURATION_SECONDS;

  players.forEach((p) => {
    p.x = 100 + Math.random() * 400;
    p.y = 100 + Math.random() * 200;
    p.vx = 0;
    p.vy = 0;
    p.score = 0;
    speedMultiplier: 1;
    shieldTicks: 0;
  });

  pickups.clear();
  for (let i = 0; i < 5; i++) {
    spawnRandomPickup();
  }
}

resetMatch(); // сразу один матч при старте сервера

// 20 тиков в секунду — достаточно для простого прототипа.
setInterval(gameLoop, 50);

server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});
