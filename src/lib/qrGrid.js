import QRCode from 'qrcode';
import { EC_LEVEL } from './protocol.js';

const CELL = 800;

/**
 * Draws up to `perFrame` QR codes into one canvas (1 = single, 2 = side by side, 4 = 2x2 grid).
 * Modules are drawn at whole-pixel sizes so edges stay sharp for the camera.
 */
export function drawQrGrid(canvas, texts, perFrame) {
  const cols = perFrame > 1 ? 2 : 1;
  const rows = Math.ceil(perFrame / cols);
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';

  texts.forEach((text, n) => {
    const modules = QRCode.create(text, { errorCorrectionLevel: EC_LEVEL }).modules;
    const px = Math.floor(CELL / (modules.size + 8)); // 4-module quiet zone on each side
    const x0 = (n % cols) * CELL + Math.floor((CELL - modules.size * px) / 2);
    const y0 = Math.floor(n / cols) * CELL + Math.floor((CELL - modules.size * px) / 2);
    for (let r = 0; r < modules.size; r++) {
      for (let c = 0; c < modules.size; c++) {
        if (modules.get(r, c)) ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
      }
    }
  });
}
