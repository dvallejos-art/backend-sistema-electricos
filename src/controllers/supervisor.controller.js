// src/controllers/supervisor.controller.js

/**
 * Obtener PAUs de un proyecto por ID
 */
exports.obtenerPausPorProyecto = async (req, res) => {
  const { idProyecto } = req.params;
  try {
    const query = `
      SELECT id, proyecto_id, codigo, nombre 
      FROM paus 
      WHERE CAST(proyecto_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY codigo ASC;
    `;
    const result = await pool.query(query, [idProyecto]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener PAUs por proyecto:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Obtener lista de proyectos
 */
exports.obtenerProyectos = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre FROM proyectos ORDER BY nombre ASC;');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener proyectos:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Crear o devolver PAU existente cuando se escribe manualmente
 */
exports.crearODevolverPau = async (req, res) => {
  const { proyecto_id, codigo, nombre } = req.body;

  if (!proyecto_id || !codigo) {
    return res.status(400).json({ error: 'El proyecto y el código de PAU son obligatorios.' });
  }

  try {
    // 1. Verificar si ya existe el PAU en ese proyecto
    const existe = await pool.query(
      `SELECT id, proyecto_id, codigo, nombre 
       FROM paus 
       WHERE CAST(proyecto_id AS TEXT) = CAST($1 AS TEXT) 
         AND LOWER(codigo) = LOWER($2) 
       LIMIT 1;`,
      [proyecto_id, codigo.trim()]
    );

    if (existe.rows.length > 0) {
      return res.json({ pau: existe.rows[0], id: existe.rows[0].id });
    }

    // 2. Si no existe, crearlo
    const nuevo = await pool.query(
      `INSERT INTO paus (proyecto_id, codigo, nombre) 
       VALUES ($1, $2, $3) 
       RETURNING id, proyecto_id, codigo, nombre;`,
      [parseInt(proyecto_id, 10), codigo.trim(), (nombre || codigo).trim()]
    );

    res.status(201).json({ pau: nuevo.rows[0], id: nuevo.rows[0].id });
  } catch (err) {
    console.error('Error al crear o devolver PAU:', err);
    res.status(500).json({ error: err.message });
  }
};