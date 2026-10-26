const fs = require('fs');
const [,, kind, out] = process.argv;
const S = 1600;
const isCard = kind === 'card';
// оси: длина листа вправо-вниз, ширина влево-вниз
const len = isCard ? 980 : 1120, wid = isCard ? 720 : 560;
const ang = a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
const [lx, ly] = ang(16).map(v => v * len), [wx, wy] = ang(152).map(v => v * wid);
const n = isCard ? 9 : 14, t = isCard ? 16 : 7.5;
const H = n * t;
const ox = 0, oy = 0;
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
let rnd = 7; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
const tex = isCard ? 'card-t.jpg' : 'steel-t.jpg';
let g = '';
// тень
const sh = [[0, 0], [lx, ly], [lx + wx, ly + wy], [wx, wy]].map(([x, y]) => pt(ox + x + 18, oy + y + H + 26)).join(' ');
g += `<polygon points="${sh}" fill="#000" opacity="${isCard ? .28 : .32}" filter="url(#blur)"/>`;
for (let i = 0; i < n; i++) {
  const z = H - (i + 1) * t;                  // низ листа (снизу вверх: i=0 нижний)
  const dx = (r() - .5) * (isCard ? 10 : 6), dy = (r() - .5) * (isCard ? 6 : 3);
  const X = ox + dx, Y = oy + dy + z;          // верх этого листа
  const A = [X + wx, Y + wy], B = [X + lx + wx, Y + ly + wy], C = [X + lx, Y + ly];
  const down = ([x, y]) => [x, y + t];
  // передняя грань вдоль длины (A→B) и правая вдоль ширины (C→B)
  const f1 = [A, B, down(B), down(A)].map(p => pt(...p)).join(' ');
  const f2 = [C, B, down(B), down(C)].map(p => pt(...p)).join(' ');
  if (isCard) {
    const shade = 0.92 + r() * 0.08;
    g += `<polygon points="${f1}" fill="url(#cardSide1)" opacity="${shade}"/><polygon points="${f2}" fill="url(#cardSide2)" opacity="${shade}"/>`;
    // гофра: волна между двумя слоями
    const wave = (P, Q, amp) => {
      const steps = Math.round(Math.hypot(Q[0] - P[0], Q[1] - P[1]) / 7);
      let d = '';
      for (let k = 0; k <= steps; k++) {
        const u = k / steps, x = P[0] + (Q[0] - P[0]) * u, y = P[1] + (Q[1] - P[1]) * u + t / 2 + Math.sin(k * Math.PI) * 0 + (k % 2 ? amp : -amp);
        d += (k ? 'L' : 'M') + pt(x, y);
      }
      return d;
    };
    g += `<path d="${wave(A, B, t * 0.28)}" fill="none" stroke="#8a6234" stroke-width="1.6" opacity=".75"/>`;
    g += `<path d="${wave(C, B, t * 0.28)}" fill="none" stroke="#7a552c" stroke-width="1.6" opacity=".75"/>`;
    g += `<polyline points="${[A, B, C].map(p => pt(...p)).join(' ')}" fill="none" stroke="#e9c993" stroke-width="1.4" opacity=".8"/>`;
    g += `<polyline points="${[down(A), down(B), down(C)].map(p => pt(...p)).join(' ')}" fill="none" stroke="#6b4a25" stroke-width="1.2" opacity=".6"/>`;
  } else {
    g += `<polygon points="${f1}" fill="url(#steelSide1)"/><polygon points="${f2}" fill="url(#steelSide2)"/>`;
    g += `<polyline points="${[A, B, C].map(p => pt(...p)).join(' ')}" fill="none" stroke="#e8eef1" stroke-width="1.3" opacity=".9"/>`;
    g += `<polyline points="${[down(A), down(B), down(C)].map(p => pt(...p)).join(' ')}" fill="none" stroke="#4d565b" stroke-width=".9" opacity=".7"/>`;
  }
  if (i === n - 1) {
    const top = [[X, Y], C, B, A].map(p => pt(...p)).join(' ');
    g += `<clipPath id="topc"><polygon points="${top}"/></clipPath>
      <g clip-path="url(#topc)">
        <image href="${tex}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${lx} ${ly} ${wx} ${wy} ${X} ${Y})"/>
        <polygon points="${top}" fill="url(#sheen)"/>
        ${isCard ? '' : `<polygon points="${top}" fill="url(#streak)"/>`}
      </g>
      <polygon points="${top}" fill="none" stroke="${isCard ? '#c79c62' : '#f4f8fa'}" stroke-width="1.2" opacity=".9"/>`;
  }
}
function fit() {
  const minX = Math.min(0, wx) - 12, maxX = Math.max(lx, lx + wx) + 40;
  const minY = Math.min(0, ly, wy) - 10, maxY = ly + wy + H + 60;
  const k = Math.min(1460 / (maxX - minX), 1340 / (maxY - minY));
  const tx = S / 2 - k * (minX + maxX) / 2, ty = S / 2 - k * (minY + maxY) / 2;
  return `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
 <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
 <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stop-color="#fff" stop-opacity="${isCard ? .18 : .38}"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
   <stop offset="1" stop-color="#000" stop-opacity="${isCard ? .14 : .18}"/></linearGradient>
 <linearGradient id="streak" x1="0" y1="0" x2="1" y2=".6">
   <stop offset=".30" stop-color="#fff" stop-opacity="0"/><stop offset=".40" stop-color="#fff" stop-opacity=".30"/>
   <stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/>
   <stop offset=".66" stop-color="#fff" stop-opacity=".18"/><stop offset=".70" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <linearGradient id="steelSide1" x1="0" x2="1"><stop offset="0" stop-color="#a7b1b6"/><stop offset=".5" stop-color="#c3cbcf"/><stop offset="1" stop-color="#8b959a"/></linearGradient>
 <linearGradient id="steelSide2" x1="0" x2="1"><stop offset="0" stop-color="#6f797e"/><stop offset="1" stop-color="#5c656a"/></linearGradient>
 <linearGradient id="cardSide1" x1="0" x2="1"><stop offset="0" stop-color="#c99a5c"/><stop offset=".5" stop-color="#d8ab6c"/><stop offset="1" stop-color="#bb8c50"/></linearGradient>
 <linearGradient id="cardSide2" x1="0" x2="1"><stop offset="0" stop-color="#a87a43"/><stop offset="1" stop-color="#946a39"/></linearGradient>
</defs>
<rect width="${S}" height="${S}" fill="#fff"/>
<g transform="${fit()}">${g}</g>
</svg>`;
fs.writeFileSync(out, `<!doctype html><html><body style="margin:0">${svg}</body></html>`);
