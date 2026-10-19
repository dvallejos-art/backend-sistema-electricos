// src/controllers/supervisor.controller.js
const pool = require('../config/db');

/**
 * 1. Obtener lista de proyectos
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
 * 2. Obtener catálogo general de actividades
 */
exports.obtenerActividades = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, COALESCE(codigo_item, 'RUB-00') AS codigo_item, descripcion, unidad_medida 
       FROM actividades_catalogo 
       ORDER BY descripcion ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener actividades:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 3. Obtener lista de técnicos
 */
exports.obtenerTecnicos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, email, email AS correo, rol 
       FROM usuarios 
       WHERE LOWER(rol) = 'tecnico' 
       ORDER BY nombre ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener técnicos:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 4. Obtener PAUs de un proyecto por ID
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
 * 5. Crear o devolver PAU existente cuando se escribe manualmente
 */
exports.crearODevolverPau = async (req, res) => {
  const { proyecto_id, codigo, nombre } = req.body;

  if (!proyecto_id || !codigo) {
    return res.status(400).json({ error: 'El proyecto y el código de PAU son obligatorios.' });
  }

  try {
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

/**
 * 6. Obtener actividades por edificio
 */
exports.obtenerActividadesPorEdificio = async (req, res) => {
  const { edificio } = req.params;
  try {
    const query = `
      SELECT DISTINCT ac.id, ac.codigo_item, ac.descripcion, ac.unidad_medida
      FROM actividades_catalogo ac
      JOIN precios_actividades pa ON CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
      JOIN proyectos p ON CAST(p.id AS TEXT) = CAST(pa.proyecto_id AS TEXT)
      WHERE LOWER(p.nombre) = LOWER($1)
      ORDER BY ac.descripcion ASC;
    `;
    const result = await pool.query(query, [edificio]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener actividades por edificio:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 7. Obtener todas las asignaciones con cálculo de Avance Real acumulado
 */
exports.obtenerAsignaciones = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const query = `
      SELECT 
        pa.id,
        pa.pau_id,
        pa.actividad_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        COALESCE(u1.nombre, 'Sin Asignar') AS tecnico,
        u2.nombre AS tecnico_secundario_nombre,
        COALESCE(pr.nombre, 'Sin Proyecto') AS proyecto,
        COALESCE(p.nombre, p.codigo, 'N/A') AS departamento,
        COALESCE(p.nombre, p.codigo, 'N/A') AS pau,
        COALESCE(ac.descripcion, 'Sin Actividad') AS actividad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        
        -- Cálculo dinámico de avances registrados para esta asignación
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,

        pa.observaciones,
        pa.fecha_inicio,
        pa.fecha_fin
      FROM pau_actividades pa
      LEFT JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      LEFT JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      LEFT JOIN usuarios u1 ON CAST(u1.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      ORDER BY pa.id DESC;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener asignaciones:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 8. Crear nueva asignación (Conserva la cantidad física real ingresada)
 */
exports.asignarTrabajo = async (req, res) => {
  const tecnico_id = req.body.tecnico_id || req.body.tecnicoId;
  const rawSecundario = req.body.tecnico_secundario_id ?? req.body.tecnico_secundario ?? req.body.tecnicoSecundarioId;

  const {
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_pago,
    porcentaje,
    observaciones,
    fecha_inicio,
    fecha_fin
  } = req.body;

  if (!tecnico_id || !actividad_id || !pau_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la asignación.' });
  }

  try {
    let secId = null;
    if (
      rawSecundario !== null && 
      rawSecundario !== undefined && 
      String(rawSecundario).trim() !== '' && 
      String(rawSecundario) !== 'null'
    ) {
      secId = parseInt(rawSecundario, 10);
      if (isNaN(secId)) secId = null;
    }

    const pctReal = parseFloat(porcentaje_pago || porcentaje || 100);
    let obsFinales = observaciones || '';
    if (pctReal < 100 && !obsFinales.includes('[Etapa:')) {
      obsFinales = `[Etapa: ${pctReal}%] ${obsFinales}`.trim();
    }

    const query = `
      INSERT INTO pau_actividades (
        pau_id,
        actividad_id,
        tecnico_id,
        tecnico_secundario_id,
        cantidad_presupuestada,
        observaciones,
        fecha_inicio,
        fecha_fin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      parseInt(pau_id, 10),
      parseInt(actividad_id, 10),
      parseInt(tecnico_id, 10),
      secId,
      parseFloat(cantidad),
      obsFinales,
      fecha_inicio || null,
      fecha_fin || null
    ];

    const result = await pool.query(query, values);
    res.json({ mensaje: 'Nueva asignación guardada con éxito.', asignacion: result.rows[0] });
  } catch (err) {
    console.error('Error al asignar trabajo:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.registrarAvance = exports.asignarTrabajo;

/**
 * 9. Editar asignación
 */
exports.editarAsignacion = async (req, res) => {
  const { id } = req.params;
  const tecnico_id = req.body.tecnico_id || req.body.tecnicoId;
  const rawSecundario = req.body.tecnico_secundario_id ?? req.body.tecnico_secundario ?? req.body.tecnicoSecundarioId;

  const {
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_pago,
    porcentaje,
    observaciones,
    fecha_inicio,
    fecha_fin
  } = req.body;

  try {
    let secId = null;
    if (
      rawSecundario !== null && 
      rawSecundario !== undefined && 
      String(rawSecundario).trim() !== '' && 
      String(rawSecundario) !== 'null'
    ) {
      secId = parseInt(rawSecundario, 10);
      if (isNaN(secId)) secId = null;
    }

    const pctReal = parseFloat(porcentaje_pago || porcentaje || 100);
    let obsFinales = observaciones || '';
    if (pctReal < 100 && !obsFinales.includes('[Etapa:')) {
      obsFinales = `[Etapa: ${pctReal}%] ${obsFinales}`.trim();
    }

    const query = `
      UPDATE pau_actividades
      SET 
        tecnico_id = $1,
        tecnico_secundario_id = $2,
        actividad_id = $3,
        pau_id = $4,
        cantidad_presupuestada = $5,
        observaciones = $6,
        fecha_inicio = $7,
        fecha_fin = $8
      WHERE id = $9
      RETURNING *;
    `;

    const values = [
      parseInt(tecnico_id, 10),
      secId,
      parseInt(actividad_id, 10),
      parseInt(pau_id, 10),
      parseFloat(cantidad),
      obsFinales,
      fecha_inicio || null,
      fecha_fin || null,
      parseInt(id, 10)
    ];

    const result = await pool.query(query, values);
    res.json({ mensaje: 'Asignación actualizada correctamente.', asignacion: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar asignación:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 10. Eliminar asignación por ID (CON ELIMINACIÓN EN CASCADA DE AVANCES REGISTRADOS)
 */
exports.eliminarAsignacion = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Eliminar los registros de avance de técnicos asociados a la asignación
    await client.query(
      `DELETE FROM registros_avance 
       WHERE CAST(pau_actividad_id AS TEXT) = CAST($1 AS TEXT);`,
      [id]
    );

    // 2. Eliminar la asignación principal
    const result = await client.query(
      `DELETE FROM pau_actividades 
       WHERE CAST(id AS TEXT) = CAST($1 AS TEXT);`,
      [id]
    );

    await client.query('COMMIT');

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'La asignación no existe o ya fue eliminada.' });
    }

    res.json({ mensaje: 'Asignación e historial de avances asociados eliminados correctamente.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar asignación en cascada:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};