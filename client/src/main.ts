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

let socket: WebSocket | null = null;
let myPlayerId: string | null = null;

// Игроки, пришедшие со state от сервера.
let players: Array<{
    id: string;
    nickname: string;
    x: number;
    y: number;
    score: number;
}> = [];

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

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  // Сортируем игроков по убыванию score для рендера и для лидерборда.
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Рендерим сущности игроков.
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

  // Leaderboard в правом верхнем углу.
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
    const scoreText = p.score.toFixed(1); // округляем для красоты

    ctx.fillText(`${i + 1}. ${p.nickname}`, boardX + 8, lineY);
    ctx.textAlign = 'right';
    ctx.fillText(scoreText, boardX + 172, lineY);
    ctx.textAlign = 'left';
  }

  // Подсказка.
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(
    'Use WASD to move (prototype scoring = time while moving)',
    50,
    canvas.height - 40
  );
}

function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ---------------------- WebSocket-клиент ----------------------

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

    // Сразу отправляем join.
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
      // Возможно, это не JSON (или другое служебное сообщение).
      return;
    }

    if (msg.type === 'welcome') {
      // Можно отобразить в UI при желании.
      return;
    }

    if (msg.type === 'joined') {
      myPlayerId = msg.playerId;
      console.log('[WS] joined as', myPlayerId);
      return;
    }

    if (msg.type === 'state') {
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

connectWebSocket();

// ---------------------- Обработка инпута ----------------------

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      inputState.up = true;
      break;
    case 's':
    case 'S':
    case 'ArrowDown':
      inputState.down = true;
      break;
    case 'a':
    case 'A':
    case 'ArrowLeft':
      inputState.left = true;
      break;
    case 'd':
    case 'D':
    case 'ArrowRight':
      inputState.right = true;
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      inputState.up = false;
      break;
    case 's':
    case 'S':
    case 'ArrowDown':
      inputState.down = false;
      break;
    case 'a':
    case 'A':
      inputState.left = false;
      break;
    case 'd':
    case 'D':
      inputState.right = false;
      break;
  }
});

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
