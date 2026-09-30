/**
 * Lightweight zero-dependency Canvas Confetti utility
 */

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const COLORS = [
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#e11d48", // rose
];

export function triggerConfetti(durationMs: number = 2000): void {
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();

  const particleCount = 80;
  const particles: Particle[] = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.45 + (Math.random() - 0.5) * 100,
      size: Math.random() * 8 + 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speedX: (Math.random() - 0.5) * 14,
      speedY: (Math.random() - 0.9) * 16,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  const startTime = Date.now();

  function animate() {
    if (!ctx) return;
    const elapsed = Date.now() - startTime;
    if (elapsed > durationMs) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const progress = elapsed / durationMs;
    const fadeOut = progress > 0.7 ? (1 - progress) / 0.3 : 1;

    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.speedY += 0.45; // gravity
      p.speedX *= 0.98; // air resistance
      p.rotation += p.rotationSpeed;
      p.opacity = fadeOut;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
