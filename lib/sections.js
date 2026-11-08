// Schematic building sections derived from the same authoritative geometry as plans, elevations and 3D.
// Read-only: nothing here changes the building geometry or its revision.
const EPS = 1e-6;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r = v => +Number(v).toFixed(3);
const num = v => +Number(v).toFixed(2);
const COL = { Entry: '#3a3a38', Living: '#3b4048', Bed: '#42403a', Bath: '#34444a', Study: '#403a45', Kitchen: '#465047', Dining: '#4a443b', Utility: '#454a42', Hall: '#2a2b2e' };
const CUT = '#e6dfd0';
const isV = w => Math.abs(w[0] - w[2]) < EPS, isH = w => Math.abs(w[1] - w[3]) < EPS;
const wallT = w => w.thickness || (w[4] ? .3 : .12), wallId = w => w[5] || w.id;
const crosses = (q, axis, c) => axis === 'y' ? q.y + .05 < c && c < q.y + q.h - .05 : q.x + .05 < c && c < q.x + q.w - .05;
const holeAt = (o, axis, c) => axis === 'y'
  ? Math.abs(o.a[0] - o.b[0]) < EPS && Math.min(o.a[1], o.b[1]) <= c && c <= Math.max(o.a[1], o.b[1])
  : Math.abs(o.a[1] - o.b[1]) < EPS && Math.min(o.a[0], o.b[0]) <= c && c <= Math.max(o.a[0], o.b[0]);

// axis 'y' = cut plane y=c (section looks north); axis 'x' = cut plane x=c (section looks west).
export function chooseCut(L, axis) {
  const ext = axis === 'y' ? L.D : L.W;
  let best = null;
  for (let c = .75; c <= ext - .75 + EPS; c += .25) {
    if (L.S.some(w => axis === 'y' ? isH(w) && Math.abs(w[1] - c) < .4 : isV(w) && Math.abs(w[0] - c) < .4)) continue;
    const named = L.R.filter(q => !q.hall && crosses(q, axis, c)).length;
    const holes = L.O.filter(o => holeAt(o, axis, c)).length;
    const score = named * 10 + holes * 2 - Math.abs(c - ext / 2) * .05;
    if (!best || score > best.score) best = { c, score };
  }
  return best ? best.c : ext / 2;
}

export function sectionCuts(geometry) {
  const L = geometry.floors[0].L;
  return ['y', 'x'].map((axis, i) => {
    const c = chooseCut(L, axis);
    return { label: i ? 'B' : 'A', axis, c, rooms: L.R.filter(q => !q.hall && crosses(q, axis, c)).map(q => q.name), cutOpenings: L.O.filter(o => holeAt(o, axis, c)).length };
  });
}

function panel(geometry, brief, cut) {
  const floors = geometry.floors, L0 = floors[0].L, H = geometry.height || 2.7, SL = .25, { axis, c, label } = cut;
  const ext = axis === 'y' ? L0.W : L0.D, top = (floors.length - 1) * (H + SL) + H, gy = 1.9 + top;
  let s = `<text x="${r(ext / 2)}" y=".95" font-size=".45" text-anchor="middle" fill="#f1eee7">Section ${label}\u2013${label} \u00b7 looking ${axis === 'y' ? 'north' : 'west'}</text>`;
  s += `<rect x="-1.5" y="${r(gy)}" width="${r(ext + 3)}" height=".35" fill="#2c2a25"/><line x1="-1.5" y1="${r(gy)}" x2="${r(ext + 1.5)}" y2="${r(gy)}" stroke="#c7a875" stroke-width=".07"/>`;
  floors.forEach((f, k) => {
    const L = f.L, z0 = k * (H + SL), y0 = gy - z0;
    L.R.forEach(q => {
      if (!crosses(q, axis, c)) return;
      const u1 = axis === 'y' ? q.x : L0.D - (q.y + q.h), u2 = axis === 'y' ? q.x + q.w : L0.D - q.y, cx = (u1 + u2) / 2;
      s += `<g data-room-id="${esc(q.id)}"><rect x="${r(u1)}" y="${r(y0 - H)}" width="${r(u2 - u1)}" height="${r(H)}" fill="${COL[q.kind] || '#2a2b2e'}" opacity=".6"/>`;
      if (!q.hall) {
        const fs = Math.min(.34, (u2 - u1) / (q.name.length * .62));
        const clear = q.net ? num(axis === 'y' ? q.net.w : q.net.h) : null;
        s += `<text x="${r(cx)}" y="${r(y0 - H + .6)}" font-size="${r(fs)}" text-anchor="middle" fill="#f1eee7">${esc(q.name)}</text>`;
        if (clear !== null) s += `<text x="${r(cx)}" y="${r(y0 - H + .6 + fs * 1.3)}" font-size="${r(fs * .8)}" text-anchor="middle" fill="#c7a875">${clear} m clear</text>`;
        if (u2 - u1 > 1.6) {
          const ax = u1 + .5;
          s += `<g stroke="#c7a875" stroke-width=".04" fill="#c7a875"><line x1="${r(ax)}" y1="${r(y0)}" x2="${r(ax)}" y2="${r(y0 - H)}"/><line x1="${r(ax - .1)}" y1="${r(y0)}" x2="${r(ax + .1)}" y2="${r(y0)}"/><line x1="${r(ax - .1)}" y1="${r(y0 - H)}" x2="${r(ax + .1)}" y2="${r(y0 - H)}"/><text stroke="none" x="${r(ax + .12)}" y="${r(y0 - H / 2)}" font-size=".24">${num(H)} m</text></g>`;
        }
      }
      s += `</g>`;
    });
    if (k) s += `<rect x="-.15" y="${r(y0)}" width="${r(ext + .3)}" height="${SL}" fill="${CUT}" stroke="#191a1d" stroke-width=".03"/>`;
    L.S.forEach(w => {
      if (axis === 'y' ? !isV(w) : !isH(w)) return;
      const lo = axis === 'y' ? Math.min(w[1], w[3]) : Math.min(w[0], w[2]), hi = axis === 'y' ? Math.max(w[1], w[3]) : Math.max(w[0], w[2]);
      if (c < lo - EPS || c > hi + EPS) return;
      const pos = axis === 'y' ? w[0] : L0.D - w[1], t = wallT(w), id = wallId(w);
      const hole = L.O.find(o => o.wallId === id && holeAt(o, axis, c));
      const solid = (za, zb) => { if (zb - za > EPS) s += `<rect data-element-id="${esc(id)}" x="${r(pos - t / 2)}" y="${r(y0 - zb)}" width="${r(t)}" height="${r(zb - za)}" fill="${CUT}" stroke="#191a1d" stroke-width=".03"/>`; };
      if (!hole) solid(0, H);
      else {
        const sill = hole.sill ?? (hole.t === 'win' ? .9 : 0), head = hole.head ?? 2.1;
        solid(0, sill); solid(head, H);
        if (hole.t === 'win') s += `<line x1="${r(pos)}" y1="${r(y0 - head)}" x2="${r(pos)}" y2="${r(y0 - sill)}" stroke="#7fa3b5" stroke-width=".05"/>`;
      }
    });
    s += `<text x="-.5" y="${r(y0 + .1)}" font-size=".26" text-anchor="end" fill="#c7a875">FFL +${z0.toFixed(2)}</text>`;
    s += `<text x="-.5" y="${r(y0 - H + .1)}" font-size=".26" text-anchor="end" fill="#c7a875">Ceiling +${(z0 + H).toFixed(2)}</text>`;
  });
  if (brief.roof) s += `<rect x="-.5" y="${r(gy - top - .25)}" width="${r(ext + 1)}" height=".25" fill="#d3cdbf" stroke="#191a1d" stroke-width=".03"/>`;
  const dy = gy + 1;
  s += `<g stroke="#c7a875" stroke-width=".05" fill="#c7a875"><line x1="0" y1="${r(dy)}" x2="${r(ext)}" y2="${r(dy)}"/><line x1="0" y1="${r(dy - .15)}" x2="0" y2="${r(dy + .15)}"/><line x1="${r(ext)}" y1="${r(dy - .15)}" x2="${r(ext)}" y2="${r(dy + .15)}"/><text stroke="none" x="${r(ext / 2)}" y="${r(dy + .5)}" font-size=".34" text-anchor="middle">${num(ext)} m (wall centrelines)</text></g>`;
  return s;
}

function keyPlan(L, cuts, size) {
  const k = size / Math.max(L.W, L.D), A = cuts[0], B = cuts[1];
  let s = `<text x="0" y="-.3" font-size=".3" fill="#c7a875">Key plan \u00b7 north up</text>`;
  L.R.forEach(q => { s += `<rect x="${r(q.x * k)}" y="${r(q.y * k)}" width="${r(q.w * k)}" height="${r(q.h * k)}" fill="${COL[q.kind] || '#2a2b2e'}" stroke="#6f6a5f" stroke-width=".03"/>`; });
  s += `<rect x="0" y="0" width="${r(L.W * k)}" height="${r(L.D * k)}" fill="none" stroke="${CUT}" stroke-width=".08"/>`;
  const ya = A.c * k, xb = B.c * k, tag = (t, x, y) => `<text x="${r(x)}" y="${r(y)}" font-size=".34" text-anchor="middle" fill="#ffcf70">${t}</text>`;
  s += `<line x1="-.5" y1="${r(ya)}" x2="${r(L.W * k + .5)}" y2="${r(ya)}" stroke="#ffcf70" stroke-width=".06" stroke-dasharray=".25 .15"/>` + tag('A', -.8, ya + .12) + tag('A', L.W * k + .8, ya + .12);
  { const up = x => `M${r(x)} ${r(ya - .35)} L${r(x - .15)} ${r(ya - .05)} L${r(x + .15)} ${r(ya - .05)}Z`; s += `<path d="${up(-.5)} ${up(L.W * k + .5)}" fill="#ffcf70"/>`; }
  s += `<line x1="${r(xb)}" y1="-.5" x2="${r(xb)}" y2="${r(L.D * k + .5)}" stroke="#ffcf70" stroke-width=".06" stroke-dasharray=".25 .15"/>` + tag('B', xb, -.7) + tag('B', xb, L.D * k + 1.1);
  { const lf = y => `M${r(xb - .35)} ${r(y)} L${r(xb - .05)} ${r(y - .15)} L${r(xb - .05)} ${r(y + .15)}Z`; s += `<path d="${lf(-.5)} ${lf(L.D * k + .5)}" fill="#ffcf70"/>`; }
  return s;
}

export function sectionsSvg(draft) {
  const { brief, geometry, revision, validation } = draft, floors = geometry.floors || [], L0 = floors[0].L;
  const H = geometry.height || 2.7, SL = .25, top = (floors.length - 1) * (H + SL) + H;
  const m = 2.4, pw = Math.max(L0.W, L0.D) + 2 * m, ph = top + 4.6, cuts = sectionCuts(geometry);
  const totalH = 2 * ph + 6;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(pw)} ${r(totalH)}" font-family="DM Sans,Arial,sans-serif"><rect width="${r(pw)}" height="${r(totalH)}" fill="#191a1d"/>`;
  cuts.forEach((cut, i) => {
    const ext = cut.axis === 'y' ? L0.W : L0.D;
    s += `<svg x="0" y="${r(i * ph)}" width="${r(pw)}" height="${r(ph)}" viewBox="0 0 ${r(pw)} ${r(ph)}"><g transform="translate(${r((pw - ext) / 2)} 0)">${panel(geometry, brief, cut)}</g></svg>`;
  });
  s += `<g transform="translate(1.6 ${r(2 * ph + 1)})">${keyPlan(L0, cuts, 4)}</g>`;
  s += `<text x="7" y="${r(2 * ph + 1.2)}" font-size=".3" fill="#aaa8a2">${esc(brief.name)} \u00b7 Schematic sections derived from model revision ${esc(String(revision).slice(0, 12))} \u00b7 ${esc(String(validation.status).toUpperCase())} \u00b7 NOT APPROVED</text>`;
  s += `<text x="7" y="${r(2 * ph + 1.9)}" font-size=".26" fill="#aaa8a2">Cut positions are chosen by rule through the most rooms and listed in the key plan.</text>`;
  s += `<text x="7" y="${r(2 * ph + 2.5)}" font-size=".26" fill="#aaa8a2">Floor-to-ceiling height is the modelled storey height. Foundations, roof structure, insulation and finishes are not modelled.</text>`;
  s += `<text x="7" y="${r(2 * ph + 3.1)}" font-size=".26" fill="#aaa8a2">Not surveyed. Not for construction, permitting or engineering.</text></svg>`;
  return s;
}