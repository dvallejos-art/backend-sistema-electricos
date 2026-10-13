// fix-admin.js
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function arreglarAdmin() {
  try {
    // Generar hash bcrypt de 'admin123' usando 10 rondas de salado
    const hash = await bcrypt.hash('admin123', 10);
    console.log('Hash generado:', hash);

    const sql = `
      UPDATE usuarios 
      SET password_hash = $1, 
          rol = 'admin' 
      WHERE LOWER(correo) = 'admin@ingresos.com';
    `;

    const res = await pool.query(sql, [hash]);
    console.log(`✅ Filas actualizadas: ${res.rowCount}`);
    console.log('Contraseña cambiada exitosamente a: admin123');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

arreglarAdmin();