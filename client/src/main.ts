/**
 * main.ts
 *
 * Делает три вещи:
 * 1. Настраивает canvas и простой игровой цикл (фон + кружок-игрок).
 * 2. Подключается к WebSocket-серверу и логирует все сообщения в консоль.
 * 3. Обновляет небольшой индикатор статуса WebSocket на экране.
 *
 * Заглушки / упрощения:
 * - Игрок всегда в центре экрана, нет управления и коллизий.
 * - WebSocket пока без авторизации и без протокола игры (только логгирование).
 * - Адрес сервера захардкожен как ws://localhost:3000 — потом вынесем в конфиг.
 */

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
const wsStatusEl = document.getElementById('ws-status');

if (!canvas) {
  throw new Error('Canvas element #game not found');
}

const ctx = canvas.getContext('2d');

if (!ctx) {
  throw new Error('2D context not supported');
}

// ВАЖНО: после этих проверок ниже TypeScript уже знает,
// что canvas и ctx не равны null.

function resizeCanvas() {
  if (!canvas) {
     throw new Error('Canvas element #game not found');
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const player = {
  x: () => canvas.width / 2,
  y: () => canvas.height / 2,
  radius: 20
};

function draw() {

  if (!ctx) {
     throw new Error('ctx element #game not found');
  }

  if (!canvas) {
     throw new Error('canvas element #game not found');
  }  

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.beginPath();
  ctx.arc(player.x(), player.y(), player.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#4caf50';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ---------------------- WebSocket-клиент ----------------------

let socket: WebSocket | null = null;

function setWsStatus(text: string, color: string) {
  if (!wsStatusEl) return;
  wsStatusEl.textContent = `WS: ${text}`;
  (wsStatusEl as HTMLElement).style.color = color;
}

function connectWebSocket() {
  // ВНИМАНИЕ: порт должен совпадать с портом сервера.
  const url = 'ws://localhost:3000';
  console.log('[WS] Connecting to', url);
  setWsStatus('connecting...', 'orange');

  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    console.log('[WS] connected');
    setWsStatus('connected', 'lime');
    // Для демонстрации сразу отправим тестовое сообщение.
    socket?.send(JSON.stringify({ type: 'hello', payload: 'from client' }));
  });

  socket.addEventListener('message', (event) => {
    console.log('[WS] message from server:', event.data);
  });

  socket.addEventListener('close', (event) => {
    console.log('[WS] closed', event.code, event.reason);
    setWsStatus('disconnected', 'red');
    // Очень простая (и не лучшая) логика реконнекта,
    // позже можно заменить на экспоненциальную.
    setTimeout(connectWebSocket, 2000);
  });

  socket.addEventListener('error', (err) => {
    console.error('[WS] error', err);
    setWsStatus('error', 'red');
  });
}

// Подключаемся сразу при загрузке страницы.
connectWebSocket();
