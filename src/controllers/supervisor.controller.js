// src/controllers/supervisor.controller.js
const pool = require('../config/db');

/**
 * 1. Obtener todas las asignaciones para la tabla del supervisor (Incluye Cuadrilla visible)
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
        p.proyecto_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        u1.nombre AS tecnico,
        COALESCE(u2.nombre, (SELECT nombre FROM usuarios WHERE id::TEXT = pa.tecnico_secundario_id::TEXT LIMIT 1)) AS tecnico_secundario_nombre,
        pr.nombre AS proyecto,
        COALESCE(p.nombre, p.codigo) AS departamento,
        COALESCE(p.nombre, p.codigo) AS pau,
        ac.descripcion AS actividad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        
        -- Cantidad ejecutada real registrada por el técnico
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            LEFT JOIN paus p_sub ON p_sub.id::TEXT = ra.pau_id::TEXT
            WHERE (
              ra.pau_actividad_id = pa.id
              OR (
                (
                  ra.pau_id::TEXT = pa.pau_id::TEXT
                  OR ra.pau_id::TEXT = p.codigo::TEXT
                  OR p_sub.codigo::TEXT = p.codigo::TEXT
                )
                AND ra.actividad_id::TEXT = pa.actividad_id::TEXT
              )
            )
          ), 0
        ) AS cantidad_ejecutada,

        pa.porcentaje_avance,
        pa.observaciones,
        pa.fecha_inicio,
        pa.fecha_fin
      FROM pau_actividades pa
      JOIN paus p ON p.id::TEXT = pa.pau_id::TEXT
      JOIN proyectos pr ON pr.id::TEXT = p.proyecto_id::TEXT
      JOIN actividades_catalogo ac ON ac.id::TEXT = pa.actividad_id::TEXT
      LEFT JOIN usuarios u1 ON u1.id::TEXT = pa.tecnico_id::TEXT
      LEFT JOIN usuarios u2 ON u2.id::TEXT = pa.tecnico_secundario_id::TEXT
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
 * 2. Crear nueva asignación (Guarda tecnico_id y tecnico_secundario_id de forma segura)
 */
exports.asignarTrabajo = async (req, res) => {
  const {
    tecnico_id,
    tecnico_secundario_id,
    proyecto_id,
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_avance,
    valor_calculado,
    observaciones,
    fecha_inicio,
    fecha_fin
  } = req.body;

  if (!tecnico_id || !actividad_id || !pau_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la asignación.' });
  }

  try {
    const query = `
      INSERT INTO pau_actividades (
        pau_id,
        actividad_id,
        tecnico_id,
        tecnico_secundario_id,
        cantidad_presupuestada,
        porcentaje_avance,
        valor_calculado,
        observaciones,
        fecha_inicio,
        fecha_fin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    // Manejo ultra seguro para que el ID secundario nunca se descarte
    let secId = null;
    if (tecnico_secundario_id !== null && tecnico_secundario_id !== undefined && String(tecnico_secundario_id).trim() !== '' && String(tecnico_secundario_id) !== 'null') {
      secId = parseInt(tecnico_secundario_id, 10);
      if (isNaN(secId)) secId = null;
    }

    const values = [
      parseInt(pau_id, 10),
      parseInt(actividad_id, 10),
      parseInt(tecnico_id, 10),
      secId,
      parseFloat(cantidad),
      porcentaje_avance ? parseFloat(porcentaje_avance) : 100,
      valor_calculado ? parseFloat(valor_calculado) : 0,
      observaciones || '',
      fecha_inicio || null,
      fecha_fin || null
    ];

    const result = await pool.query(query, values);
    res.json({ mensaje: 'Trabajo asignado exitosamente.', asignacion: result.rows[0] });
  } catch (err) {
    console.error('Error al asignar trabajo:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 3. Editar asignación existente
 */
exports.editarAsignacion = async (req, res) => {
  const { id } = req.params;
  const {
    tecnico_id,
    tecnico_secundario_id,
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_avance,
    valor_calculado,
    observaciones,
    fecha_inicio,
    fecha_fin
  } = req.body;

  try {
    const query = `
      UPDATE pau_actividades
      SET 
        tecnico_id = $1,
        tecnico_secundario_id = $2,
        actividad_id = $3,
        pau_id = $4,
        cantidad_presupuestada = $5,
        porcentaje_avance = $6,
        valor_calculado = $7,
        observaciones = $8,
        fecha_inicio = $9,
        fecha_fin = $10
      WHERE id = $11
      RETURNING *;
    `;

    let secId = null;
    if (tecnico_secundario_id !== null && tecnico_secundario_id !== undefined && String(tecnico_secundario_id).trim() !== '' && String(tecnico_secundario_id) !== 'null') {
      secId = parseInt(tecnico_secundario_id, 10);
      if (isNaN(secId)) secId = null;
    }

    const values = [
      parseInt(tecnico_id, 10),
      secId,
      parseInt(actividad_id, 10),
      parseInt(pau_id, 10),
      parseFloat(cantidad),
      porcentaje_avance ? parseFloat(porcentaje_avance) : 100,
      valor_calculado ? parseFloat(valor_calculado) : 0,
      observaciones || '',
      fecha_inicio || null,
      fecha_fin || null,
      parseInt(id, 10)
    ];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada.' });
    }

    res.json({ mensaje: 'Asignación actualizada correctamente.', asignacion: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar asignación:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 4. Eliminar asignación
 */
exports.eliminarAsignacion = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pau_actividades WHERE id = $1;', [id]);
    res.json({ mensaje: 'Asignación eliminada correctamente.' });
  } catch (err) {
    console.error('Error al eliminar asignación:', err);
    res.status(500).json({ error: err.message });
  }
};