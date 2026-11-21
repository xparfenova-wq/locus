                                               
const { itog, ADRES } = require('./prover.js');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const papka = path.join(__dirname, 'api');
  const fajly = fs.readdirSync(papka).filter((f) => f.endsWith('.js')).sort();
  console.log(`сервер: ${ADRES}`);
  for (const f of fajly) {
    process.stdout.write(`  ${f} ... `);
    try {
      await require(path.join(papka, f))();
      console.log('прошёл');
    } catch (e) {
      console.log('упал:', e.message);
      process.exitCode = 1;
    }
  }
  const upalo = itog('итог');
  if (upalo) process.exitCode = 1;
})();
