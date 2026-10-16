// src/controllers/tecnico.controller.js
const pool = require('../config/db');

/**
 * 1. Obtener actividades asignadas con Saldo Disponible Real y datos de cuadrilla
 */
exports.obtenerActividadesPauTecnico = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const pau_id_param = req.params.pau_id;
  const tecnico_id = req.params.id || (req.user ? req.user.id : (req.query.tecnico_id || null));

  try {
    const query = `
      SELECT 
        pa.id AS pau_actividad_id,
        pa.pau_id,
        pa.actividad_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        u1.nombre AS tecnico_lider_nombre,
        u2.nombre AS tecnico_secundario_nombre,
        ac.descripcion AS actividad,
        ac.descripcion AS nombre,
        ac.unidad_medida,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,

        -- Suma de avances
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            LEFT JOIN paus p_sub ON p_sub.id = ra.pau_id
            WHERE (
              ra.pau_actividad_id = pa.id
              OR (
                (
                  ra.pau_id = pa.pau_id
                  OR ra.pau_id::TEXT = p.codigo::TEXT
                  OR p_sub.codigo::TEXT = p.codigo::TEXT
                )
                AND ra.actividad_id = pa.actividad_id
              )
            )
          ), 0
        ) AS cantidad_ejecutada,

        -- Saldo Restante Disponible
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              LEFT JOIN paus p_sub ON p_sub.id = ra.pau_id
              WHERE (
                ra.pau_actividad_id = pa.id
                OR (
                  (
                    ra.pau_id = pa.pau_id
                    OR ra.pau_id::TEXT = p.codigo::TEXT
                    OR p_sub.codigo::TEXT = p.codigo::TEXT
                  )
                  AND ra.actividad_id = pa.actividad_id
                )
              )
            ), 0
          ), 0
        ) AS cantidad_disponible

      FROM pau_actividades pa
      JOIN paus p ON p.id = pa.pau_id
      JOIN actividades_catalogo ac ON ac.id = pa.actividad_id
      LEFT JOIN usuarios u1 ON u1.id = pa.tecnico_id
      LEFT JOIN usuarios u2 ON u2.id = pa.tecnico_secundario_id
      WHERE (
        pa.pau_id::TEXT = $1::TEXT
        OR p.codigo::TEXT = $1::TEXT
        OR p.nombre::TEXT = $1::TEXT
      )
      AND (
        $2::TEXT IS NULL 
        OR $2::TEXT = '' 
        OR pa.tecnico_id::TEXT = $2::TEXT
        OR pa.tecnico_secundario_id::TEXT = $2::TEXT
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
 * 2. Registrar Avance Diario
 */
exports.registrarAvanceDiario = async (req, res) => {
  const { pau_id, actividad_id, pau_actividad_id, cantidad, observaciones } = req.body;
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : req.body.tecnico_id);

  if (!pau_id || (!actividad_id && !pau_actividad_id) || cantidad === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos.' });
  }

  const cantIngresada = parseFloat(cantidad);
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
              LEFT JOIN paus p_sub ON p_sub.id = ra.pau_id
              WHERE (
                ra.pau_actividad_id = pa.id 
                OR (
                  (
                    ra.pau_id = pa.pau_id
                    OR ra.pau_id::TEXT = p.codigo::TEXT
                    OR p_sub.codigo::TEXT = p.codigo::TEXT
                  )
                  AND ra.actividad_id = pa.actividad_id
                )
              )
            ), 0
          ), 2
        ) AS disponible
      FROM pau_actividades pa
      JOIN paus p ON p.id = pa.pau_id
      WHERE (
        ($1::TEXT IS NOT NULL AND $1::TEXT != '' AND pa.id::TEXT = $1::TEXT)
        OR (
          (pa.pau_id::TEXT = $2::TEXT OR p.codigo::TEXT = $2::TEXT)
          AND pa.actividad_id::TEXT = $3::TEXT
        )
      )
      ORDER BY pa.id DESC
      LIMIT 1;
    `;

    const checkResult = await pool.query(checkQuery, [
      pau_actividad_id ? String(pau_actividad_id) : null,
      String(pau_id),
      actividad_id ? String(actividad_id) : null
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No existe asignación para esta actividad.' });
    }

    const asignacion = checkResult.rows[0];

    // Bloqueo estricto en Backend: Si es el acompañante, no puede registrar avance
    if (asignacion.tecnico_secundario_id && String(asignacion.tecnico_secundario_id) === String(tecnicoId)) {
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
        empleado_id, 
        tecnico_id, 
        cantidad_ejecutada, 
        observaciones, 
        fecha_registro
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, NOW())
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
 * 3. Historial de Mis Avances
 */
exports.obtenerMisAvances = async (req, res) => {
  const tecnicoId = req.params.id || (req.user && req.user.id) || (req.usuario && req.usuario.id);

  try {
    const query = `
      SELECT 
        ra.id,
        TO_CHAR(ra.fecha_registro, 'YYYY-MM-DD') AS fecha,
        p.nombre AS proyecto,
        COALESCE(pau.nombre, pau.codigo) AS pau,
        COALESCE(act.descripcion, pa_act.descripcion, 'Actividad') AS actividad,
        COALESCE(act.unidad_medida, pa_act.unidad_medida, '') AS unidad_medida,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad,
        ra.observaciones,
        CASE WHEN pa.tecnico_secundario_id IS NOT NULL THEN true ELSE false END AS es_cuadrilla
      FROM registros_avance ra
      LEFT JOIN paus pau ON (pau.id = ra.pau_id OR pau.codigo::TEXT = ra.pau_id::TEXT)
      LEFT JOIN proyectos p ON p.id = pau.proyecto_id
      LEFT JOIN actividades_catalogo act ON act.id = ra.actividad_id
      LEFT JOIN pau_actividades pa ON pa.id = ra.pau_actividad_id
      LEFT JOIN actividades_catalogo pa_act ON pa_act.id = pa.actividad_id
      WHERE ra.empleado_id::TEXT = $1::TEXT
         OR ra.tecnico_id::TEXT = $1::TEXT
      ORDER BY ra.fecha_registro DESC, ra.id DESC
      LIMIT 50;
    `;

    const result = await pool.query(query, [tecnicoId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};