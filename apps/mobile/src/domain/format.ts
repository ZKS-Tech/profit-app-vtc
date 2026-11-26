// Formatage des nombres à la française, sans Intl : `toLocaleString` est lent sur Android (moteur Hermes)
// quand il est appelé des milliers de fois (90 zones × chaque heure de la semaine).
const NBSP = ' ';

/** 12345.6 → « 12 346 » */
export function int(n: number) {
  const s = String(Math.round(Math.abs(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return n < 0 && Math.round(Math.abs(n)) !== 0 ? `−${grouped}` : grouped;
}

/** 1.234 → « 1,2 » (digits décimales, virgule) */
export function dec(n: number, digits = 1) {
  const [i, f] = Math.abs(n).toFixed(digits).split('.');
  const s = `${int(Number(i))}${f ? `,${f}` : ''}`;
  return n < 0 ? `−${s}` : s;
}
