/* ============================================
   CANVAS COMPONENT
   ============================================ */
import { gameState } from '../state.js';
import { sendDraw } from '../websocket.js';
import { events, EVT } from '../events.js';

const COLORS = [
  '#000000', '#FFFFFF', '#FF5E5B', '#FF8A5C', '#FFD166',
  '#56FFA4', '#6DD5FA', '#667EEA', '#C471F5', '#F093FB',
  '#8B5E3C', '#808080',
];

let canvas, ctx;
let drawing = false;
let lastX = 0, lastY = 0;
let currentColor = '#000000';
let brushSize = 4;
let isEraser = false;
let cleanupFns = [];

export function createCanvas(parentEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas-wrapper';
  wrapper.id = 'canvas-wrapper';

  canvas = document.createElement('canvas');
  canvas.id = 'draw-canvas';
  canvas.width = 700;
  canvas.height = 500;
  wrapper.appendChild(canvas);

  ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  parentEl.appendChild(wrapper);

  // ── Toolbar ──
  const toolbar = document.createElement('div');
  toolbar.className = 'draw-toolbar glass';
  toolbar.id = 'draw-toolbar';
  toolbar.innerHTML = `
    <div class="color-palette">
      ${COLORS.map(c => `
        <div class="color-swatch ${c === currentColor ? 'active' : ''}"
             data-color="${c}"
             style="background: ${c}; ${c === '#FFFFFF' ? 'border: 1px solid rgba(255,255,255,0.3);' : ''}">
        </div>
      `).join('')}
    </div>
    <div class="toolbar-divider"></div>
    <div class="brush-size-group">
      <label>🖊️</label>
      <input type="range" class="brush-slider" id="brush-slider" min="1" max="20" value="${brushSize}" />
    </div>
    <div class="toolbar-divider"></div>
    <button class="tool-btn" id="eraser-btn" title="Eraser">🧹</button>
    <button class="tool-btn" id="clear-btn" title="Clear Canvas">🗑️</button>
  `;
  parentEl.appendChild(toolbar);

  setupDrawing();
  setupToolbar(toolbar);
  updateToolbarVisibility();

  return { canvas, ctx, wrapper, toolbar };
}

function setupDrawing() {
  const onMouseDown = (e) => {
    if (!gameState.get().isDrawer) return;
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    lastX = (e.clientX - rect.left) * scaleX;
    lastY = (e.clientY - rect.top) * scaleY;
  };

  const onMouseMove = (e) => {
    if (!drawing || !gameState.get().isDrawer) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const color = isEraser ? '#FFFFFF' : currentColor;
    drawLine(lastX, lastY, x, y, color, brushSize);
    sendDraw(
      Math.round(lastX), Math.round(lastY),
      Math.round(x), Math.round(y),
      color
    );

    lastX = x;
    lastY = y;
  };

  const onMouseUp = () => { drawing = false; };

  // ── Touch support ──
  const onTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
    canvas.dispatchEvent(mouseEvent);
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
    canvas.dispatchEvent(mouseEvent);
  };

  const onTouchEnd = (e) => {
    e.preventDefault();
    canvas.dispatchEvent(new MouseEvent('mouseup'));
  };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });

  // ── Receive remote draw events ──
  const offDraw = events.on(EVT.DRAW_EVENT, (data) => {
    drawLine(data.prevX, data.prevY, data.currentX, data.currentY, data.color, brushSize);
  });

  cleanupFns.push(offDraw);
}

function drawLine(x1, y1, x2, y2, color, size) {
  if (!ctx) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function setupToolbar(toolbar) {
  // Color swatches
  toolbar.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      currentColor = swatch.dataset.color;
      isEraser = false;
      toolbar.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      document.getElementById('eraser-btn')?.classList.remove('active');
    });
  });

  // Brush size
  const slider = document.getElementById('brush-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      brushSize = parseInt(e.target.value);
    });
  }

  // Eraser
  const eraserBtn = document.getElementById('eraser-btn');
  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      isEraser = !isEraser;
      eraserBtn.classList.toggle('active', isEraser);
      if (isEraser) {
        toolbar.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      }
    });
  }

  // Clear canvas
  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearCanvas();
    });
  }
}

export function clearCanvas() {
  if (!ctx || !canvas) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function updateToolbarVisibility() {
  const toolbar = document.getElementById('draw-toolbar');
  const wrapper = document.getElementById('canvas-wrapper');
  const state = gameState.get();

  if (toolbar) {
    toolbar.style.display = state.isDrawer ? 'flex' : 'none';
  }
  if (wrapper) {
    wrapper.classList.toggle('disabled', !state.isDrawer);
  }
}

export function destroyCanvas() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  canvas = null;
  ctx = null;
}
