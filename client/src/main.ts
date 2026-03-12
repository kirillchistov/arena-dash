/**
 * (Sprint 2)
 *
 * Новое:
 * - Отправляем "join" на сервер с никнеймом.
 * - Отправляем "input" при изменении WASD-нажатий.
 * - Принимаем "joined" и "state" от сервера.
 * - Рендерим всех игроков (себя и других).
 *
 * Упрощения:
 * - Никнейм жёстко "Player" + случайное число.
 * - Нет предсказаний: позиции полностью берём со state от сервера.
 * - Input шлётся по таймеру, не по каждому keydown (для простоты).
 */

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
    };

type ClientToServerMessage =
  | { type: 'join'; nickname: string }
  | { type: 'input'; input: { dx: number; dy: number } };

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
const wsStatusEl = document.getElementById('ws-status');

if (!canvas) {
  throw new Error('Canvas element #game not found');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D context not supported');
}

function resizeCanvas() {
  if (!canvas) {
    throw new Error('Canvas element #game not found');
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------------------- Состояние клиента ----------------------

let myPlayerId: string | null = null;

let socket: WebSocket | null = null;

function setWsStatus(text: string, color: string) {
  if (!wsStatusEl) return;
  wsStatusEl.textContent = `WS: ${text}`;
  (wsStatusEl as HTMLElement).style.color = color;
}

function sendMessage(msg: ClientToServerMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(msg));
}

function connectWebSocket() {
  const url = 'ws://localhost:3000';
  console.log('[WS] Connecting to', url);
  setWsStatus('connecting...', 'orange');

  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    console.log('[WS] connected');
    setWsStatus('connected', 'lime');

    const joinMsg: ClientToServerMessage = {
      type: 'join',
      nickname
    };
    sendMessage(joinMsg);
  });

  socket.addEventListener('message', (event) => {
    console.log('[WS] message from server:', event.data);

    let msg: ServerToClientMessage;
    try {
      msg = JSON.parse(event.data) as ServerToClientMessage;
    } catch {
      return;
    }

    if (msg.type === 'welcome') {
      return;
    }

    if (msg.type === 'joined') {
      myPlayerId = msg.playerId;
      console.log('[WS] joined as', myPlayerId);
      return;
    }

    if (msg.type === 'state') {
      currentMatchId = msg.matchId;
      timeLeft = msg.timeLeft;
      players = msg.players;
      return;
    }
  });

  socket.addEventListener('close', (event) => {
    console.log('[WS] closed', event.code, event.reason);
    setWsStatus('disconnected', 'red');
    setTimeout(connectWebSocket, 2000);
  });

  socket.addEventListener('error', (err) => {
    console.error('[WS] error', err);
    setWsStatus('error', 'red');
  });
}

// сразу подключаемся
connectWebSocket();

// Игроки, пришедшие со state от сервера.
let players: Array<{
  id: string;
  nickname: string;
  x: number;
  y: number;
  score: number;
}> = [];

let currentMatchId: number | null = null;
let timeLeft: number = 0;

// Состояние ввода (WASD).
const inputState = {
  up: false,
  down: false,
  left: false,
  right: false
};

// Никнейм для join.
const nickname = `Player${Math.floor(Math.random() * 1000)}`;

// ---------------------- Рендер ----------------------

function draw() {
  if (!ctx || !canvas) {
    throw new Error('2D context not supported');
  }

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Рамка арены примерно - надо синхронизировать позже.
  const arenaX = 40;
  const arenaY = 40;
  const arenaWidth = canvas.width - 80;
  const arenaHeight = canvas.height - 120; // чуть больше места снизу под текст

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.strokeRect(arenaX, arenaY, arenaWidth, arenaHeight);

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  for (const p of sortedPlayers) {
    const isMe = p.id === myPlayerId;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isMe ? 18 : 14, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? '#4caf50' : '#2196f3';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(p.nickname, p.x, p.y - 20);
  }

  // Leaderboard (как раньше).
  const boardX = canvas.width - 220;
  const boardY = 60;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(boardX, boardY, 180, 20 + 18 * Math.min(5, sortedPlayers.length));

  ctx.fillStyle = '#ffffff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Leaderboard', boardX + 8, boardY + 14);

  const maxEntries = 5;
  for (let i = 0; i < Math.min(maxEntries, sortedPlayers.length); i++) {
    const p = sortedPlayers[i];
    const isMe = p.id === myPlayerId;
    const lineY = boardY + 14 + 16 * (i + 1);

    ctx.fillStyle = isMe ? '#ffeb3b' : '#ffffff';
    const scoreText = p.score.toFixed(1);

    ctx.fillText(`${i + 1}. ${p.nickname}`, boardX + 8, lineY);
    ctx.textAlign = 'right';
    ctx.fillText(scoreText, boardX + 172, lineY);
    ctx.textAlign = 'left';
  }

  // Таймер матча в левом верхнем углу.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(40, 10, 140, 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = '14px system-ui';
  ctx.textAlign = 'left';
  const timeSeconds = Math.max(0, Math.floor(timeLeft));
  ctx.fillText(
    `Match ${currentMatchId ?? '-' }  |  ${timeSeconds}s`,
    48,
    30
  );

  // Подсказка.
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(
    'Use WASD to move. Score = time while moving. Match resets every 60s.',
    50,
    canvas.height - 40
  );
}


// Периодическая отправка инпута (20 раз/сек).
setInterval(() => {
  const dx = (inputState.right ? 1 : 0) + (inputState.left ? -1 : 0);
  const dy = (inputState.down ? 1 : 0) + (inputState.up ? -1 : 0);

  if (dx === 0 && dy === 0) {
    return;
  }

  const msg: ClientToServerMessage = {
    type: 'input',
    input: { dx, dy }
  };
  sendMessage(msg);
}, 50);