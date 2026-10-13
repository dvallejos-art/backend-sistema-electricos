// verificar-usuarios.js
const db = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function main() {
  try {
    console.log('Encriptando contraseña para admin@ingresos.com...');
    const passHash = await bcrypt.hash('123456', 10);

    const queryUpdate = `
      UPDATE usuarios 
      SET password_hash = $1 
      WHERE correo = $2 
      RETURNING id, correo, rol;
    `;

    const res = await db.query(queryUpdate, [passHash, 'admin@ingresos.com']);
    console.log('¡Contraseña actualizada correctamente!');
    console.table(res.rows);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

main();