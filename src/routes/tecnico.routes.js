// src/routes/tecnico.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware para verificar JWT
const verificarAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto');
    req.user = decoded;
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

// 1. Obtener Proyectos asignados al Técnico (Líder, Secundario o Miembro de Cuadrilla)
const obtenerProyectosHandler = async (req, res) => {
  const tecnicoId = req.params.id || (req.user ? req.user.id : (req.usuario ? req.usuario.id : req.query.tecnico_id));

  try {
    const query = `
      SELECT DISTINCT pr.id, pr.nombre
      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      WHERE CAST(pa.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($1 AS TEXT)
         OR EXISTS (
            SELECT 1 FROM pau_actividades_cuadrilla pac 
            WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
              AND CAST(pac.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         )
      ORDER BY pr.nombre ASC;
    `;
    const result = await pool.query(query, [tecnicoId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener proyectos del técnico:', err);
    res.status(500).json({ error: err.message });
  }
};

router.get('/proyectos', verificarAuth, obtenerProyectosHandler);
router.get('/:id/proyectos', verificarAuth, obtenerProyectosHandler);

// 2. Obtener Departamentos/PAUs del Proyecto asignados al Técnico (Líder o Cuadrilla)
const obtenerPausHandler = async (req, res) => {
  const { idProyecto } = req.params;
  const tecnicoId = req.params.id || (req.user ? req.user.id : (req.usuario ? req.usuario.id : req.query.tecnico_id));

  try {
    const query = `
      SELECT DISTINCT p.id, p.codigo, COALESCE(p.nombre, p.codigo) AS nombre
      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      WHERE CAST(p.proyecto_id AS TEXT) = CAST($1 AS TEXT)
        AND (
          CAST(pa.tecnico_id AS TEXT) = CAST($2 AS TEXT)
          OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($2 AS TEXT)
          OR EXISTS (
             SELECT 1 FROM pau_actividades_cuadrilla pac 
             WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
               AND CAST(pac.tecnico_id AS TEXT) = CAST($2 AS TEXT)
          )
        )
      ORDER BY p.codigo ASC;
    `;
    const result = await pool.query(query, [idProyecto, tecnicoId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener PAUs del proyecto:', err);
    res.status(500).json({ error: err.message });
  }
};

router.get('/proyectos/:idProyecto/paus', verificarAuth, obtenerPausHandler);
router.get('/:id/proyectos/:idProyecto/paus', verificarAuth, obtenerPausHandler);

// 3. Obtener Actividades Asignadas (Garantizado para TODOS los acompañantes)
const obtenerActividadesHandler = async (req, res) => {
  const pau_id = req.params.pau_id || req.params.idPau;
  const tecnicoId = req.params.tecnicoId || (req.user ? req.user.id : (req.usuario ? req.usuario.id : req.query.tecnico_id));

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
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,

        -- Suma de Avances registrados
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,

        -- Cantidad Restante Disponible
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
        OR EXISTS (
           SELECT 1 FROM pau_actividades_cuadrilla pac 
           WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
             AND CAST(pac.tecnico_id AS TEXT) = CAST($2 AS TEXT)
        )
      )
      ORDER BY pa.id DESC;
    `;

    const result = await pool.query(query, [pau_id, tecnicoId]);

    const actividadesPreparadas = result.rows.map((row) => ({
      ...row,
      tecnico_id: row.tecnico_id ? String(row.tecnico_id) : null,
      tecnico_secundario_id: row.tecnico_secundario_id ? String(row.tecnico_secundario_id) : null,
      disponibleReal: parseFloat(row.cantidad_disponible || 0)
    }));

    res.json(actividadesPreparadas);
  } catch (err) {
    console.error('Error al obtener actividades asignadas:', err);
    res.status(500).json({ error: 'Error al obtener actividades asignadas.' });
  }
};

router.get('/paus/:pau_id/actividades', verificarAuth, obtenerActividadesHandler);
router.get('/:tecnicoId/paus/:pau_id/actividades-asignadas', verificarAuth, obtenerActividadesHandler);

// 4. Registrar Avance Diario (Bloqueo estricto para Acompañantes)
router.post('/registrar-avance', verificarAuth, async (req, res) => {
  const tecnicoId = req.user ? req.user.id : (req.usuario ? req.usuario.id : req.body.tecnico_id);
  const { pau_id, actividad_id, pau_actividad_id, cantidad, cantidad_ejecutada, observaciones } = req.body;

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
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ), 0
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
      targetPauActividadId ? String(targetPauActividadId) : null,
      pau_id ? String(pau_id) : null,
      actividad_id ? String(actividad_id) : null
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró la asignación de actividad para este departamento.' });
    }

    const asignacion = checkResult.rows[0];

    // Solo el Técnico Líder (tecnico_id) puede ingresar el avance
    const esLider = String(asignacion.tecnico_id).trim() === String(tecnicoId).trim();
    if (!esLider) {
      return res.status(403).json({ error: 'Acción denegada: Solo el Técnico Líder de la cuadrilla puede registrar avances.' });
    }

    const realPauActividadId = asignacion.pau_actividad_id;
    const realPauId = asignacion.real_pau_id;
    const realActividadId = asignacion.actividad_catalogo_id;
    const disponible = parseFloat(asignacion.disponible);

    if (cantIngresada > disponible + 0.001) {
      return res.status(400).json({
        error: `No puedes ingresar ${cantIngresada.toFixed(2)}. La cantidad máxima disponible restante es ${disponible.toFixed(2)}.`
      });
    }

    const insertQuery = `
      INSERT INTO registros_avance (
        tecnico_id, 
        pau_id, 
        actividad_id, 
        pau_actividad_id, 
        cantidad_ejecutada, 
        observaciones,
        fecha_registro
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      tecnicoId,
      realPauId,
      realActividadId,
      realPauActividadId,
      cantIngresada,
      observaciones || ''
    ]);

    res.json({ mensaje: 'Avance registrado con éxito.', avance: result.rows[0] });
  } catch (err) {
    console.error('Error al registrar avance:', err);
    res.status(500).json({ error: 'No se pudo guardar el avance.' });
  }
});

// 5. Historial de Avances del Técnico (Muestra los avances registrados para su cuadrilla)
const obtenerHistorialHandler = async (req, res) => {
  const tecnicoId = req.params.id || (req.user ? req.user.id : (req.usuario ? req.usuario.id : req.query.tecnico_id));

  try {
    const query = `
      SELECT DISTINCT
        ra.id,
        TO_CHAR(COALESCE(ra.fecha_registro, NOW()), 'YYYY-MM-DD') AS fecha,
        p.nombre AS proyecto,
        COALESCE(pau.nombre, pau.codigo) AS pau,
        COALESCE(ac.descripcion, 'Actividad') AS actividad,
        ac.unidad_medida,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad_ejecutada,
        ra.observaciones
      FROM registros_avance ra
      JOIN pau_actividades pa ON CAST(pa.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
      LEFT JOIN paus pau ON (CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT))
      LEFT JOIN proyectos p ON CAST(p.id AS TEXT) = CAST(pau.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      WHERE CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(pa.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(pa.tecnico_secundario_id AS TEXT) = CAST($1 AS TEXT)
         OR EXISTS (
            SELECT 1 FROM pau_actividades_cuadrilla pac 
            WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
              AND CAST(pac.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         )
      ORDER BY ra.id DESC
      LIMIT 50;
    `;
    const result = await pool.query(query, [tecnicoId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ error: err.message });
  }
};

router.get('/historial', verificarAuth, obtenerHistorialHandler);
router.get('/:id/historial', verificarAuth, obtenerHistorialHandler);

module.exports = router;