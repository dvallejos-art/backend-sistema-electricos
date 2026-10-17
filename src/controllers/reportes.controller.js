// src/controllers/reportes.controller.js
const pool = require('../config/db');

// Obtener resumen de avance de un PAU
exports.getResumenAvancePAU = async (req, res, next) => {
  const { pau_id } = req.params;
  try {
    const query = `
      SELECT 
        pa.id AS pau_actividad_id,
        ac.descripcion AS actividad,
        ac.unidad_medida,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        
        -- Suma vinculada estrictamente por pau_actividad_id
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,

        -- Saldo pendiente real
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ), 0
        ) AS saldo_pendiente

      FROM pau_actividades pa
      JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(p.codigo AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ac.descripcion ASC;
    `;
    const result = await pool.query(query, [pau_id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

// Obtener historial por técnico
exports.getHistorialPorTecnico = async (req, res, next) => {
  const { empleado_id } = req.params;
  try {
    const query = `
      SELECT 
        ra.id,
        TO_CHAR(COALESCE(ra.fecha_registro, NOW()), 'YYYY-MM-DD') AS fecha,
        COALESCE(pau.nombre, pau.codigo) AS departamento,
        COALESCE(act.descripcion, 'Actividad') AS actividad,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad,
        ra.observaciones
      FROM registros_avance ra
      LEFT JOIN paus pau ON (CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT))
      LEFT JOIN actividades_catalogo act ON CAST(act.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      WHERE CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(ra.empleado_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ra.id DESC;
    `;
    const result = await pool.query(query, [empleado_id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};