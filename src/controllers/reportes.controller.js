const pool = require('../config/db');

// Obtener resumen de avance de un PAU
exports.getResumenAvancePAU = async (req, res, next) => {
  const { pau_id } = req.params;
  try {
    const query = `
      SELECT 
        a.descripcion AS actividad,
        a.unidad_medida,
        pa.cantidad_presupuestada,
        COALESCE(SUM(ra.cantidad), 0) AS cantidad_ejecutada,
        (pa.cantidad_presupuestada - COALESCE(SUM(ra.cantidad), 0)) AS saldo_pendiente
      FROM pau_actividades pa
      INNER JOIN actividades a ON a.id = pa.actividad_id
      LEFT JOIN registros_avance ra ON ra.pau_id = pa.pau_id AND ra.actividad_id = pa.actividad_id
      WHERE pa.pau_id = $1
      GROUP BY a.descripcion, a.unidad_medida, pa.cantidad_presupuestada;
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
        ra.fecha,
        pau.nombre AS departamento,
        act.descripcion AS actividad,
        ra.cantidad,
        ra.observaciones
      FROM registros_avance ra
      INNER JOIN paus pau ON pau.id = ra.pau_id
      INNER JOIN actividades act ON act.id = ra.actividad_id
      WHERE ra.empleado_id = $1
      ORDER BY ra.fecha DESC;
    `;
    const result = await pool.query(query, [empleado_id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};