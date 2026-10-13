const pool = require('./src/config/db');

async function crearEmpleado() {
  try {
    const query = `
      INSERT INTO empleados (codigo, cedula, nombres, apellidos, cargo, estado)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = ['EMP001', '1234567890', 'Admin', 'Central', 'Administrador', 'activo'];

    const res = await pool.query(query, values);
    console.log('¡Empleado creado con éxito!:', res.rows[0]);
  } catch (err) {
    console.error('Detalle:', err.message);
  } finally {
    pool.end();
  }
}

crearEmpleado();