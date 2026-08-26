// util.js — helpers sans dépendance.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "2026-08-24" -> "24/08/2026". '' si vide.
export function dateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Date du jour au format ISO AAAA-MM-JJ.
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Identifiant court unique (nouvelles entités).
export function genId(prefixe = 'x') {
  const rnd = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/\D/g, '').slice(0, 8);
  return `${prefixe}${rnd}`;
}

// Pourcentage lisible : 0.6667 -> "67 %".
export function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${Math.round(x * 100)} %`;
}

// Arrondi entier d'un rating ELO.
export function r0(x) {
  return Math.round(x);
}

// Mini-graphe SVG d'une série de nombres (courbe d'ELO). '' si trop court.
export function sparkline(serie, stroke = 'currentColor', w = 110, h = 28) {
  if (!serie || serie.length < 2) return '';
  const pad = 2;
  const min = Math.min(...serie), max = Math.max(...serie), range = (max - min) || 1;
  const pts = serie.map((v, i) => {
    const x = pad + (i / (serie.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="évolution du rating">
    <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
