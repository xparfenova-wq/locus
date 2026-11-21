                                                                                
const { NetDostupa } = require('../db/db.js');

function tolko_admin(db, avtor, soobshchenie = 'доступ меняют только администраторы системы') {
  const admins = new Set((process.env.LOCUS_ADMIN_IDS || '').split(',')
    .map(s => Number(s.trim())).filter(n => Number.isSafeInteger(n) && n > 0));
  if (!admins.has(Number(avtor))) throw new NetDostupa(soobshchenie);
  const chelovek = db.prepare('SELECT id,imja,komanda,dostup FROM ljudi WHERE id=?').get(Number(avtor));
  if (!chelovek) throw new NetDostupa('автора запроса нет в базе');
  return chelovek;
}

module.exports = { tolko_admin };
