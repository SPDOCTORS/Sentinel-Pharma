import React, { useEffect, useMemo, useRef } from 'react';

const makeSeed = (text = '') => {
  let seed = 0;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  return seed || 1;
};

const seeded = (seed) => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

const buildModel = (token) => {
  const rand = seeded(makeSeed(token));
  const atoms = [];
  const atomCount = 20 + Math.floor(rand() * 8);

  for (let i = 0; i < atomCount; i += 1) {
    const radius = 1 + rand() * 2.8;
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI;
    atoms.push({
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
      size: 2 + rand() * 2.5,
      hue: [170, 195, 220, 155, 50][Math.floor(rand() * 5)]
    });
  }

  const bonds = [];
  for (let i = 1; i < atoms.length; i += 1) {
    const links = 1 + Math.floor(rand() * 2);
    for (let j = 0; j < links; j += 1) {
      const to = Math.floor(rand() * i);
      bonds.push([i, to]);
    }
  }

  return { atoms, bonds };
};

const EmbeddedMoleculeViewer = ({ molecule, pdbId }) => {
  const canvasRef = useRef(null);
  const model = useMemo(() => buildModel(`${molecule || 'drug'}-${pdbId || 'model'}`), [molecule, pdbId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let raf = null;
    let angle = 0;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#03121a';
      ctx.fillRect(0, 0, width, height);

      const projected = model.atoms.map((a) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = a.x * cos - a.z * sin;
        const z = a.x * sin + a.z * cos;
        const depth = 5 / (7 - z);
        return {
          x: width / 2 + x * 38 * depth,
          y: height / 2 + a.y * 38 * depth,
          depth,
          z,
          size: a.size * depth,
          hue: a.hue
        };
      });

      model.bonds.forEach(([from, to]) => {
        const a = projected[from];
        const b = projected[to];
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.38)';
        ctx.lineWidth = Math.max(0.8, (a.depth + b.depth) * 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      projected
        .sort((a, b) => a.z - b.z)
        .forEach((a) => {
          ctx.beginPath();
          ctx.fillStyle = `hsla(${a.hue}, 90%, 68%, 0.95)`;
          ctx.arc(a.x, a.y, Math.max(1.2, a.size), 0, Math.PI * 2);
          ctx.fill();
        });

      angle += 0.008;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [model]);

  return (
    <div className="h-48 rounded overflow-hidden border border-emerald-300/30 shadow-[0_0_20px_rgba(52,211,153,0.15)] relative">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute bottom-2 left-2 text-[10px] px-2 py-1 rounded bg-slate-950/70 text-emerald-200 border border-emerald-300/20">
        In-app 3D preview {pdbId ? `(${pdbId})` : ''}
      </div>
    </div>
  );
};

export default EmbeddedMoleculeViewer;

