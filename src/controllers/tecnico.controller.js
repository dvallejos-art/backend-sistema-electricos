// src/controllers/tecnico.controller.js
const pool = require('../config/db');

/**
 * 1. Obtener Proyectos asignados al Técnico (como Líder o Integrante de Cuadrilla)
 */
exports.obtenerProyectosTecnico = async (req, res) => {
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : (req.query.tecnico_id || req.params.id));

  try {
    const query = `
      SELECT DISTINCT pr.id, pr.nombre
      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      LEFT JOIN pau_actividades_cuadrilla pac ON CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
      WHERE CAST(pa.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(pac.tecnico_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY pr.nombre ASC;
    `;
    const result = await pool.query(query, [tecnicoId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener proyectos del técnico:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 2. Obtener PAUs de un Proyecto asignados al Técnico
 */
exports.obtenerPausProyectoTecnico = async (req, res) => {
  const { idProyecto } = req.params;
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : (req.query.tecnico_id || req.params.id));

  try {
    const query = `
      SELECT DISTINCT p.id, p.codigo, COALESCE(p.nombre, p.codigo) AS nombre
      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      LEFT JOIN pau_actividades_cuadrilla pac ON CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
      WHERE CAST(p.proyecto_id AS TEXT) = CAST($1 AS TEXT)
        AND (
          CAST(pa.tecnico_id AS TEXT) = CAST($2 AS TEXT)
          OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($2 AS TEXT)
          OR CAST(pac.tecnico_id AS TEXT) = CAST($2 AS TEXT)
        )
      ORDER BY p.codigo ASC;
    `;
    const result = await pool.query(query, [idProyecto, tecnicoId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener PAUs del técnico:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 3. Obtener actividades asignadas con Saldo Disponible Real y datos de cuadrilla
 */
exports.obtenerActividadesPauTecnico = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const pau_id_param = req.params.pau_id || req.params.idPau;
  const tecnico_id = req.user ? req.user.id : (req.usuario ? req.usuario.id : (req.query.tecnico_id || null));

  try {
    const query = `
      SELECT DISTINCT
        pa.id,
        pa.id AS pau_actividad_id,
        pa.pau_id,
        pa.actividad_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        u1.nombre AS tecnico_lider_nombre,
        u2.nombre AS tecnico_secundario_nombre,
        ac.descripcion AS actividad,
        ac.descripcion AS actividad_descripcion,
        ac.descripcion AS nombre,
        ac.unidad_medida,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,

        -- Suma de avances
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,

        -- Saldo Restante Disponible
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ), 0
        ) AS cantidad_disponible

      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      LEFT JOIN usuarios u1 ON CAST(u1.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      LEFT JOIN pau_actividades_cuadrilla pac ON CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
      WHERE (
        CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT)
        OR LOWER(p.codigo) = LOWER($1)
        OR LOWER(p.nombre) = LOWER($1)
      )
      AND (
        $2::TEXT IS NULL 
        OR $2::TEXT = '' 
        OR CAST(pa.tecnico_id AS TEXT) = CAST($2 AS TEXT)
        OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($2 AS TEXT)
        OR CAST(pac.tecnico_id AS TEXT) = CAST($2 AS TEXT)
      )
      ORDER BY ac.descripcion ASC;
    `;

    const result = await pool.query(query, [pau_id_param, tecnico_id]);

    const mapeados = result.rows.map(row => ({
      ...row,
      tecnico_id: row.tecnico_id ? String(row.tecnico_id) : null,
      tecnico_secundario_id: row.tecnico_secundario_id ? String(row.tecnico_secundario_id) : null,
      disponibleReal: parseFloat(row.cantidad_disponible || 0)
    }));

    res.json(mapeados);
  } catch (err) {
    console.error('Error al obtener actividades asignadas al técnico:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 4. Registrar Avance Diario (Bloqueo estricto para Acompañante)
 */
exports.registrarAvanceDiario = async (req, res) => {
  const { pau_id, actividad_id, pau_actividad_id, cantidad, cantidad_ejecutada, observaciones } = req.body;
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : req.body.tecnico_id);

  const targetPauActividadId = pau_actividad_id || req.body.id;
  const cantIngresada = parseFloat(cantidad || cantidad_ejecutada);

  if (isNaN(cantIngresada) || cantIngresada <= 0) {
    return res.status(400).json({ error: 'Debe ingresar una cantidad válida mayor a 0.' });
  }

  try {
    const checkQuery = `
      SELECT 
        pa.id AS pau_actividad_id,
        pa.pau_id AS real_pau_id,
        pa.actividad_id AS actividad_catalogo_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        ROUND(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ), 2
        ) AS disponible
      FROM pau_actividades pa
      WHERE CAST(pa.id AS TEXT) = CAST($1 AS TEXT)
      LIMIT 1;
    `;

    const checkResult = await pool.query(checkQuery, [String(targetPauActividadId)]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No existe asignación para esta actividad.' });
    }

    const asignacion = checkResult.rows[0];

    // Verificar si el técnico que intenta guardar es acompañante directo o parte de la cuadrilla
    const esLider = String(asignacion.tecnico_id).trim() === String(tecnicoId).trim();

    if (!esLider) {
      return res.status(403).json({ error: 'Acción denegada: Solo el Técnico Líder de la cuadrilla puede registrar avances.' });
    }

    const realPauActividadId = asignacion.pau_actividad_id;
    const realPauId = asignacion.real_pau_id;
    const idActividadCatalogo = asignacion.actividad_catalogo_id;
    const disponible = parseFloat(asignacion.disponible);

    if (cantIngresada > disponible + 0.001) {
      return res.status(400).json({
        error: `Acción bloqueada: No puedes registrar ${cantIngresada.toFixed(2)}. El saldo máximo disponible es ${disponible > 0 ? disponible.toFixed(2) : '0.00'}.`
      });
    }

    const insertQuery = `
      INSERT INTO registros_avance (
        pau_id, 
        actividad_id, 
        pau_actividad_id,
        tecnico_id, 
        cantidad_ejecutada, 
        observaciones, 
        fecha_registro
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    const resultInsert = await pool.query(insertQuery, [
      realPauId,
      idActividadCatalogo,
      realPauActividadId,
      tecnicoId,
      cantIngresada,
      observaciones || ''
    ]);

    return res.json({ mensaje: 'Avance registrado con éxito.', avance: resultInsert.rows[0] });

  } catch (error) {
    console.error('Error al registrar avance:', error);
    return res.status(500).json({ error: 'Error interno en la base de datos.' });
  }
};

/**
 * 5. Historial de Mis Avances
 */
exports.obtenerMisAvances = async (req, res) => {
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : (req.params.id || req.query.tecnico_id));

  try {
    const query = `
      SELECT 
        ra.id,
        TO_CHAR(COALESCE(ra.fecha_registro, ra.creado_en), 'YYYY-MM-DD') AS fecha,
        p.nombre AS proyecto,
        COALESCE(pau.nombre, pau.codigo) AS pau,
        COALESCE(act.descripcion, 'Actividad') AS actividad,
        COALESCE(act.unidad_medida, '') AS unidad_medida,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad_ejecutada,
        ra.observaciones
      FROM registros_avance ra
      LEFT JOIN paus pau ON CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT)
      LEFT JOIN proyectos p ON CAST(p.id AS TEXT) = CAST(pau.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo act ON CAST(act.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      WHERE CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ra.id DESC
      LIMIT 50;
    `;

    const result = await pool.query(query, [tecnicoId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};