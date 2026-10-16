// src/controllers/tecnico.controller.js
const pool = require('../config/db');

/**
 * 1. Obtener actividades asignadas con Saldo Disponible Real y datos de cuadrilla
 */
exports.obtenerActividadesPauTecnico = async (req, res) => {
  const pau_id_param = req.params.pau_id;
  const tecnico_id = req.user ? req.user.id : (req.query.tecnico_id || null);

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
            LEFT JOIN paus p_sub ON CAST(p_sub.id AS TEXT) = CAST(ra.pau_id AS TEXT)
            WHERE (
              ra.pau_actividad_id = pa.id
              OR (
                (
                  CAST(ra.pau_id AS TEXT) = CAST(pa.pau_id AS TEXT)
                  OR CAST(ra.pau_id AS TEXT) = CAST(p.codigo AS TEXT)
                  OR CAST(p_sub.codigo AS TEXT) = CAST(p.codigo AS TEXT)
                )
                AND CAST(ra.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT)
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
              LEFT JOIN paus p_sub ON CAST(p_sub.id AS TEXT) = CAST(ra.pau_id AS TEXT)
              WHERE (
                ra.pau_actividad_id = pa.id
                OR (
                  (
                    CAST(ra.pau_id AS TEXT) = CAST(pa.pau_id AS TEXT)
                    OR CAST(ra.pau_id AS TEXT) = CAST(p.codigo AS TEXT)
                    OR CAST(p_sub.codigo AS TEXT) = CAST(p.codigo AS TEXT)
                  )
                  AND CAST(ra.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT)
                )
              )
            ), 0
          ), 0
        ) AS cantidad_disponible

      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN actividades_catalogo ac ON CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
      LEFT JOIN usuarios u1 ON CAST(u1.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      WHERE (
        CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT)
        OR CAST(p.codigo AS TEXT) = CAST($1 AS TEXT)
        OR CAST(p.nombre AS TEXT) = CAST($1 AS TEXT)
      )
      AND (
        $2::TEXT IS NULL 
        OR $2::TEXT = '' 
        OR CAST(pa.tecnico_id AS TEXT) = CAST($2 AS TEXT)
        OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($2 AS TEXT)
      )
      ORDER BY ac.descripcion ASC;
    `;

    const result = await pool.query(query, [pau_id_param, tecnico_id]);

    // MAPEO GARANTIZADO DE CAMPOS PARA REACT
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
 * 2. Registrar Avance Diario con Bloqueo de Exceso
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
              LEFT JOIN paus p_sub ON CAST(p_sub.id AS TEXT) = CAST(ra.pau_id AS TEXT)
              WHERE (
                ra.pau_actividad_id = pa.id 
                OR (
                  (
                    CAST(ra.pau_id AS TEXT) = CAST(pa.pau_id AS TEXT)
                    OR CAST(ra.pau_id AS TEXT) = CAST(p.codigo AS TEXT)
                    OR CAST(p_sub.codigo AS TEXT) = CAST(p.codigo AS TEXT)
                  )
                  AND CAST(ra.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT)
                )
              )
            ), 0
          ), 2
        ) AS disponible
      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      WHERE (
        ($1::TEXT IS NOT NULL AND $1::TEXT != '' AND CAST(pa.id AS TEXT) = CAST($1 AS TEXT))
        OR (
          (CAST(pa.pau_id AS TEXT) = CAST($2 AS TEXT) OR CAST(p.codigo AS TEXT) = CAST($2 AS TEXT))
          AND CAST(pa.actividad_id AS TEXT) = CAST($3 AS TEXT)
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

    // Bloqueo de seguridad en el backend: solo el técnico líder puede registrar avances
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
      LEFT JOIN paus pau ON (CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT))
      LEFT JOIN proyectos p ON p.id = pau.proyecto_id
      LEFT JOIN actividades_catalogo act ON CAST(act.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      LEFT JOIN pau_actividades pa ON CAST(pa.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
      LEFT JOIN actividades_catalogo pa_act ON CAST(pa_act.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      WHERE CAST(ra.empleado_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
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