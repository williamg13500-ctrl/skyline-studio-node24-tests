// Schematic elevations derived from the same authoritative geometry as the plans and 3D model.
// Read-only: nothing here changes the building geometry or its revision.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FILL = { modern: '#c9c3b6', warm: '#d3b98f', traditional: '#bf9680' };
const num = v => +Number(v).toFixed(2);
const VIEWS = [
  { title: 'South elevation', n: [0, 1], len: 'W', map: (W, D, p) => p[0] },
  { title: 'North elevation', n: [0, -1], len: 'W', map: (W, D, p) => W - p[0] },
  { title: 'East elevation', n: [1, 0], len: 'D', map: (W, D, p) => D - p[1] },
  { title: 'West elevation', n: [-1, 0], len: 'D', map: (W, D, p) => p[1] }
];

export function elevationViews(geometry) {
  const floors = geometry.floors || [], W = floors[0].L.W, D = floors[0].L.D, H = 2.7, SL = .25;
  return VIEWS.map(v => {
    const openings = [];
    floors.forEach((f, k) => (f.L.O || []).forEach(o => {
      if (!o.ext || !o.n || Math.abs(o.n[0] - v.n[0]) > 1e-6 || Math.abs(o.n[1] - v.n[1]) > 1e-6) return;
      const u1 = v.map(W, D, o.a), u2 = v.map(W, D, o.b), win = o.t === 'win', z0 = k * (H + SL);
      openings.push({ id: o.id, type: win ? 'window' : 'door', u1: Math.min(u1, u2), u2: Math.max(u1, u2), z1: z0 + (o.sill ?? (win ? .9 : 0)), z2: z0 + (o.head ?? 2.1) });
    }));
    return { title: v.title, length: v.len === 'W' ? W : D, openings };
  });
}

export function elevationsSvg(draft) {
  const { brief, geometry, revision, validation } = draft, floors = geometry.floors || [];
  const W = floors[0].L.W, D = floors[0].L.D, H = 2.7, SL = .25, top = (floors.length - 1) * (H + SL) + H;
  const fill = FILL[brief.style] || FILL.modern, views = elevationViews(geometry);
  const mx = Math.max(W, D), m = 2.4, pw = mx + 2 * m, ph = top + 4.6;
  const totalW = 2 * pw, totalH = 2 * ph + 2.6;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" font-family="DM Sans,Arial,sans-serif"><rect width="${totalW}" height="${totalH}" fill="#191a1d"/>`;
  views.forEach((v, i) => {
    const Wf = v.length, gy = 1.6 + top, ox = (pw - Wf) / 2;
    s += `<svg x="${(i % 2) * pw}" y="${Math.floor(i / 2) * ph}" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}"><g transform="translate(${ox} 0)">`;
    s += `<text x="${Wf / 2}" y=".9" font-size=".45" text-anchor="middle" fill="#f1eee7">${v.title}</text>`;
    s += `<rect x="-.15" y="${gy - top}" width="${Wf + .3}" height="${top}" fill="${fill}" stroke="#191a1d" stroke-width=".05"/>`;
    if (brief.roof) s += `<rect x="-.5" y="${gy - top - .25}" width="${Wf + 1}" height=".25" fill="#d3cdbf" stroke="#191a1d" stroke-width=".04"/>`;
    floors.forEach((f, k) => {
      const z = k * (H + SL);
      if (k) s += `<line x1="-.15" y1="${gy - z}" x2="${Wf + .15}" y2="${gy - z}" stroke="#191a1d" stroke-width=".06"/>`;
      s += `<text x="-.5" y="${gy - z + .1}" font-size=".26" text-anchor="end" fill="#c7a875">FFL +${z.toFixed(2)}</text>`;
    });
    s += `<text x="-.5" y="${gy - top + .1}" font-size=".26" text-anchor="end" fill="#c7a875">Wall top +${top.toFixed(2)}</text>`;
    v.openings.forEach(o => {
      const w = o.u2 - o.u1, win = o.type === 'window';
      s += `<g data-element-id="${esc(o.id)}"><title>${win ? 'Window' : 'Door'}</title><rect x="${o.u1}" y="${gy - o.z2}" width="${w}" height="${o.z2 - o.z1}" fill="${win ? '#7fa3b5' : '#2b2118'}" stroke="${win ? '#191a1d' : '#c7a875'}" stroke-width=".05"/>`;
      if (win) s += `<line x1="${o.u1 + w / 2}" y1="${gy - o.z2}" x2="${o.u1 + w / 2}" y2="${gy - o.z1}" stroke="#191a1d" stroke-width=".04"/>`;
      s += `</g>`;
    });
    s += `<line x1="-1.5" y1="${gy}" x2="${Wf + 1.5}" y2="${gy}" stroke="#c7a875" stroke-width=".07"/>`;
    const dy = gy + .8;
    s += `<g stroke="#c7a875" stroke-width=".05" fill="#c7a875"><line x1="0" y1="${dy}" x2="${Wf}" y2="${dy}"/><line x1="0" y1="${dy - .15}" x2="0" y2="${dy + .15}"/><line x1="${Wf}" y1="${dy - .15}" x2="${Wf}" y2="${dy + .15}"/><text stroke="none" x="${Wf / 2}" y="${dy + .5}" font-size=".34" text-anchor="middle">${num(Wf)} m</text></g>`;
    s += `</g></svg>`;
  });
  s += `<text x="1" y="${2 * ph + 1}" font-size=".3" fill="#aaa8a2">${esc(brief.name)} · Schematic elevations derived from model revision ${esc(String(revision).slice(0, 12))} · ${esc(String(validation.status).toUpperCase())} · NOT APPROVED</text>`;
  s += `<text x="1" y="${2 * ph + 1.6}" font-size=".26" fill="#aaa8a2">North is assumed at the top of the plan. Opening heights come from the model. Not surveyed. Not for construction, permitting or engineering.</text></svg>`;
  return s;
}