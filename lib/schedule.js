// Door and window schedule derived from the same authoritative geometry as plans, elevations, sections and 3D.
// Read-only: nothing here changes the building geometry or its revision.
const EPS = 1e-6;
const f2 = v => (+Number(v).toFixed(2)).toFixed(2);
const pad = n => String(n).padStart(2, '0');
const compass = n => n[1] > 0.5 ? 'South' : n[1] < -0.5 ? 'North' : n[0] > 0.5 ? 'East' : 'West';

export const SCHEDULE_COLUMNS = ['Mark', 'Type', 'Floor', 'Room', 'Connects to or faces', 'Wall', 'Width m', 'Height m', 'Sill m', 'Head m', 'Area m2', 'Swing', 'Element id', 'Revision'];

export function scheduleRows(geometry, revision = '') {
  const rows = []; let d = 0, w = 0;
  (geometry.floors || []).forEach(f => {
    const L = f.L, byId = id => L.R.find(q => q.id === id);
    const at = (x, y) => L.R.find(q => x >= q.x - EPS && x <= q.x + q.w + EPS && y >= q.y - EPS && y <= q.y + q.h + EPS);
    const order = id => Math.max(0, L.R.findIndex(q => q.id === id));
    const items = (L.O || []).map(o => {
      const mx = (o.a[0] + o.b[0]) / 2, my = (o.a[1] + o.b[1]) / 2, win = o.t === 'win';
      const inward = o.in || (o.n ? [-o.n[0], -o.n[1]] : [0, 0]);
      const served = (o.roomId && byId(o.roomId)) || at(mx + inward[0] * .3, my + inward[1] * .3);
      return { o, mx, my, win, inward, served };
    }).sort((p, q) => (p.win - q.win) || (order(p.served?.id) - order(q.served?.id)) || (p.mx - q.mx) || (p.my - q.my));
    items.forEach(({ o, mx, my, win, inward, served }) => {
      const width = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]), sill = o.sill ?? (win ? .9 : 0), head = o.head ?? 2.1, height = head - sill;
      const mark = win ? 'W' + pad(++w) : 'D' + pad(++d);
      let type, other, swing = '';
      if (win) { type = 'Window'; other = o.n ? 'Faces ' + compass(o.n) : 'Faces outside'; }
      else if (o.t === 'entry' || o.ext) { type = 'Entrance door'; other = 'Outside'; swing = 'Opens into ' + (served?.name || 'room'); }
      else { type = 'Internal door'; const far = at(mx - inward[0] * .3, my - inward[1] * .3); other = far?.name || 'Adjacent space'; swing = 'Opens into ' + (served?.name || 'room'); }
      rows.push({ mark, type, floor: f.label || '', room: served?.name || 'Unassigned', other, wall: o.ext ? 'Exterior' : 'Internal', width: f2(width), height: f2(height), sill: f2(sill), head: f2(head), area: f2(width * height), swing, id: o.id || '', revision: String(revision).slice(0, 12) });
    });
  });
  return rows;
}

// Spreadsheet-safe CSV: quote when needed and neutralise formula-style cells from user-entered text.
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function scheduleCsv(draft) {
  const rows = scheduleRows(draft.geometry, draft.revision);
  const keys = ['mark', 'type', 'floor', 'room', 'other', 'wall', 'width', 'height', 'sill', 'head', 'area', 'swing', 'id', 'revision'];
  return [SCHEDULE_COLUMNS.map(csvCell).join(','), ...rows.map(r => keys.map(k => csvCell(r[k])).join(','))].join('\r\n') + '\r\n';
}