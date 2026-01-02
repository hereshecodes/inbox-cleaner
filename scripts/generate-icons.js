/**
 * Generate PNG icons from SVG for Chrome Extension
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

// Pip-Boy theme colors
const DARK_BG = '#0a0f0a';
const GREEN = '#14f06e';
const AMBER = '#f0a830';

function drawIcon(ctx, size) {
  const scale = size / 128;

  // Background
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 4 * scale;
  ctx.strokeRect(8 * scale, 8 * scale, 112 * scale, 112 * scale);

  // Envelope top (V shape)
  ctx.beginPath();
  ctx.moveTo(24 * scale, 40 * scale);
  ctx.lineTo(64 * scale, 70 * scale);
  ctx.lineTo(104 * scale, 40 * scale);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 6 * scale;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Envelope body
  ctx.beginPath();
  ctx.moveTo(24 * scale, 40 * scale);
  ctx.lineTo(24 * scale, 88 * scale);
  ctx.lineTo(104 * scale, 88 * scale);
  ctx.lineTo(104 * scale, 40 * scale);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 4 * scale;
  ctx.stroke();

  // Notification badge circle
  ctx.beginPath();
  ctx.arc(96 * scale, 32 * scale, 16 * scale, 0, Math.PI * 2);
  ctx.fillStyle = AMBER;
  ctx.fill();

  // Exclamation mark in badge
  ctx.fillStyle = DARK_BG;
  ctx.font = `bold ${16 * scale}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 96 * scale, 33 * scale);
}

// Generate each size
sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  drawIcon(ctx, size);

  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created ${outputPath}`);
});

console.log('Done! All icons generated.');
