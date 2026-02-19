import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hueShift: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function FlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = media.matches;

    const pointer = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.45,
      tx: window.innerWidth * 0.5,
      ty: window.innerHeight * 0.45,
      speed: 0
    };

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let frame = 0;
    let raf = 0;

    const particles: Particle[] = [];
    const particleCount = 95;

    const resetParticles = () => {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          size: Math.random() * 1.9 + 0.3,
          hueShift: Math.random() * 24 - 12
        });
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      resetParticles();
    };

    const onMove = (event: MouseEvent) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      document.documentElement.style.setProperty("--mx", `${Math.round((event.clientX / window.innerWidth) * 100)}%`);
      document.documentElement.style.setProperty("--my", `${Math.round((event.clientY / window.innerHeight) * 100)}%`);
    };

    const onTouch = (event: TouchEvent) => {
      const t = event.touches[0];
      if (!t) return;
      pointer.tx = t.clientX;
      pointer.ty = t.clientY;
    };

    const onMotionPrefChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };

    const drawGradientBackdrop = () => {
      const radialA = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        Math.min(width, height) * 0.05,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.82
      );
      radialA.addColorStop(0, "rgba(58, 94, 173, 0.21)");
      radialA.addColorStop(0.55, "rgba(16, 30, 63, 0.34)");
      radialA.addColorStop(1, "rgba(2, 8, 26, 0.84)");
      ctx.fillStyle = radialA;
      ctx.fillRect(0, 0, width, height);

      const radialB = ctx.createRadialGradient(
        width * 0.2,
        height * 0.85,
        0,
        width * 0.2,
        height * 0.85,
        Math.max(width, height) * 0.8
      );
      radialB.addColorStop(0, "rgba(255, 89, 130, 0.12)");
      radialB.addColorStop(1, "rgba(255, 89, 130, 0)");
      ctx.fillStyle = radialB;
      ctx.fillRect(0, 0, width, height);
    };

    const drawFlowLines = () => {
      const t = frame * 0.0026;
      const rowGap = clamp(height / 22, 22, 42);
      const lineCount = Math.ceil(height / rowGap) + 4;
      const segmentStep = clamp(width / 24, 26, 72);
      const influenceRadius = Math.min(width, height) * 0.28;

      for (let row = -2; row < lineCount; row++) {
        const baseY = row * rowGap;
        const hue = 205 + Math.sin(row * 0.36 + t * 0.5) * 10;
        const warmMix = Math.sin(row * 0.47 + t) * 0.5 + 0.5;
        const sat = 60 + warmMix * 25;
        const light = 65 - warmMix * 18;

        ctx.beginPath();
        let started = false;

        for (let x = -80; x <= width + 80; x += segmentStep) {
          const noise =
            Math.sin(x * 0.006 + row * 0.65 + t) * 24 +
            Math.sin(x * 0.0018 - row * 0.3 + t * 0.8) * 34;

          const dx = x - pointer.x;
          const dy = baseY - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const influence = clamp(1 - dist / influenceRadius, 0, 1);

          const swirl = Math.sin((x + row * 28) * 0.004 + t * 1.2) * influence * 70;
          const pull = (pointer.y - baseY) * influence * 0.12;
          const y = baseY + noise + swirl + pull;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        const pinkWeight = clamp((row / lineCount) * 0.85 + warmMix * 0.4, 0.05, 0.92);
        const strokeHue = hue + pinkWeight * 125;

        ctx.strokeStyle = `hsla(${strokeHue}, ${sat}%, ${light + pinkWeight * 8}%, ${0.06 + pinkWeight * 0.15})`;
        ctx.lineWidth = 1 + pinkWeight * 1.8;
        ctx.shadowColor = `hsla(${strokeHue}, 90%, 70%, ${0.08 + pinkWeight * 0.22})`;
        ctx.shadowBlur = 8 + pinkWeight * 10;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    const drawParticles = () => {
      const connectionDistance = clamp(Math.min(width, height) * 0.16, 60, 140);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!reducedMotion) {
          p.x += p.vx + Math.sin(frame * 0.006 + i) * 0.08;
          p.y += p.vy + Math.cos(frame * 0.007 + i * 0.8) * 0.08;
        }

        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        const pdx = p.x - pointer.x;
        const pdy = p.y - pointer.y;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
        const pInfluence = clamp(1 - pDist / connectionDistance, 0, 1);

        const hue = 195 + p.hueShift + pInfluence * 95;
        const size = p.size + pInfluence * 2.3;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 92%, 72%, ${0.3 + pInfluence * 0.5})`;
        ctx.arc(p.x - pdx * pInfluence * 0.08, p.y - pdy * pInfluence * 0.08, size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p2.x - p.x;
          const dy = p2.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > connectionDistance) continue;

          const alpha = (1 - d / connectionDistance) * 0.22;
          ctx.strokeStyle = `rgba(148, 195, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    };

    const render = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.075;
      pointer.y += (pointer.ty - pointer.y) * 0.075;
      pointer.speed = Math.hypot(pointer.tx - pointer.x, pointer.ty - pointer.y);

      ctx.clearRect(0, 0, width, height);
      drawGradientBackdrop();
      drawFlowLines();
      drawParticles();

      if (!reducedMotion) frame += 1 + clamp(pointer.speed * 0.01, 0, 1.6);
      raf = window.requestAnimationFrame(render);
    };

    resize();
    render();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    media.addEventListener("change", onMotionPrefChange);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      media.removeEventListener("change", onMotionPrefChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />;
}
