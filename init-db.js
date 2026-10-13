const pool = require('./src/config/db');

async function crearTablasEstructura() {
  try {
    // 1. Proyectos / PAU
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proyectos_pau (
        id SERIAL PRIMARY KEY,
        codigo_pau VARCHAR(50) UNIQUE NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        ubicacion VARCHAR(150),
        estado VARCHAR(20) DEFAULT 'en_ejecucion'
      );
    `);

    // 2. Catálogo Maestro de Actividades Eléctricas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS actividades_catalogo (
        id SERIAL PRIMARY KEY,
        codigo_item VARCHAR(50) UNIQUE NOT NULL,
        descripcion TEXT NOT NULL,
        unidad_medida VARCHAR(20) NOT NULL
      );
    `);

    // 3. Relación PAU - Actividades Presupuestadas (Meta)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pau_actividades (
        id SERIAL PRIMARY KEY,
        pau_id INT REFERENCES proyectos_pau(id) ON DELETE CASCADE,
        actividad_id INT REFERENCES actividades_catalogo(id) ON DELETE CASCADE,
        cantidad_presupuestada NUMERIC(10,2) NOT NULL,
        UNIQUE(pau_id, actividad_id)
      );
    `);

    // 4. Registros de Avance Diario por Técnico
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registros_avance (
        id SERIAL PRIMARY KEY,
        empleado_id INT REFERENCES empleados(id),
        pau_id INT REFERENCES proyectos_pau(id),
        actividad_id INT REFERENCES actividades_catalogo(id),
        cantidad_ejecutada NUMERIC(10,2) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        observaciones TEXT
      );
    `);

    console.log('¡Tablas de control de obra creadas exitosamente en PostgreSQL!');
  } catch (err) {
    console.error('Error al crear tablas:', err.message);
  } finally {
    pool.end();
  }
}

crearTablasEstructura();