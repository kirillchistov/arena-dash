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
      pickups = msg.pickups;
      return;
    }

    if (msg.type === 'matchEnd') {
      if (msg.winner) {
        lastMatchResult = {
          matchId: msg.matchId,
          winnerName: msg.winner.nickname,
          winnerScore: msg.winner.score
        };
      } else {
        lastMatchResult = {
          matchId: msg.matchId,
          winnerName: 'No winner',
          winnerScore: null
        };
      }
      showMatchOverlay = true;

      // убираем оверлей через пару секунд
      setTimeout(() => {
        showMatchOverlay = false;
      }, 3000);
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
let players = [] as Array<{
  id: string;
  nickname: string;
  x: number;
  y: number;
  score: number;
}>;

let pickups = [] as Array<{
  id: string;
  x: number;
  y: number;
  value: number;
}>;

let currentMatchId: number | null = null;
let timeLeft = 0;

let lastMatchResult:
  | { matchId: number; winnerName: string; winnerScore: number | null }
  | null = null;
let showMatchOverlay = false;

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
function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

function draw() {
  if (!ctx || !canvas) {
    throw new Error('2D context not supported');
  }

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // рамка арены
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 120);

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
    'Use WASD to move. Score = pickups. Match resets every 60s.',
    50,
    canvas.height - 40
  );

  // pickup’ы (монетки/сферы)
  for (const pk of pickups) {
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ff9800';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Оверлей окончания матча
  if (showMatchOverlay && lastMatchResult) {
    const overlayWidth = 320;
    const overlayHeight = 120;
    const ox = (canvas.width - overlayWidth) / 2;
    const oy = (canvas.height - overlayHeight) / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(ox, oy, overlayWidth, overlayHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, overlayWidth, overlayHeight);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '18px system-ui';
    ctx.fillText(
        `Match ${lastMatchResult.matchId} finished`,
        ox + overlayWidth / 2,
        oy + 32
    );

    ctx.font = '16px system-ui';

    if (lastMatchResult.winnerScore !== null) {
        ctx.fillText(
        `Winner: ${lastMatchResult.winnerName} (${lastMatchResult.winnerScore} pts)`,
        ox + overlayWidth / 2,
        oy + 64
        );
    } else {
        ctx.fillText(
        'No winner this time',
        ox + overlayWidth / 2,
        oy + 64
        );
    }

    ctx.font = '14px system-ui';
    ctx.fillText(
        'New match starting...',
        ox + overlayWidth / 2,
        oy + 94
    );
  }
}

// ---------------------- Обработка инпута (WASD / стрелки) ----------------------

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
    case 'ArrowLeft':
      inputState.left = false;
      break;
    case 'd':
    case 'D':
    case 'ArrowRight':
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