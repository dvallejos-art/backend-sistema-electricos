// src/routes/tecnico.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Obtener Edificios/Proyectos REALES
router.get('/:id/proyectos', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT p.id, p.nombre
      FROM proyectos p
      JOIN paus pau ON pau.proyecto_id = p.id
      ORDER BY p.nombre ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener proyectos del técnico:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Obtener Departamentos/PAUs del Proyecto
router.get('/:id/proyectos/:idProyecto/paus', async (req, res) => {
  try {
    const { idProyecto } = req.params;
    const query = `
      SELECT id, nombre, codigo
      FROM paus
      WHERE proyecto_id = $1
      ORDER BY nombre ASC
    `;
    const result = await pool.query(query, [idProyecto]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener PAUs del proyecto:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Obtener Actividades Presupuestadas vinculando estrictamente por pau_actividad_id
router.get('/:tecnicoId/paus/:pau_id/actividades-asignadas', async (req, res) => {
  const { pau_id } = req.params;

  try {
    const query = `
      SELECT 
        pa.id AS pau_actividad_id,
        ac.id AS actividad_id,
        ac.descripcion AS actividad,
        ac.descripcion AS nombre,
        ac.unidad_medida,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,

        -- Suma vinculada estrictamente al ID de la asignación (pau_actividad_id)
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE ra.pau_actividad_id = pa.id
          ), 0
        ) AS cantidad_ejecutada,

        -- Cantidad Restante Disponible (Presupuestado - Avances de ESTA asignación)
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE ra.pau_actividad_id = pa.id
            ), 0
          ), 0
        ) AS cantidad_disponible

      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN actividades_catalogo ac ON CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
      WHERE (
        CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT)
        OR CAST(p.codigo AS TEXT) = CAST($1 AS TEXT)
        OR CAST(p.nombre AS TEXT) = CAST($1 AS TEXT)
      )
      ORDER BY pa.id DESC;
    `;

    const result = await pool.query(query, [pau_id]);

    const actividadesPreparadas = result.rows.map((row) => ({
      ...row,
      disponibleReal: parseFloat(row.cantidad_disponible || 0)
    }));

    res.json(actividadesPreparadas);
  } catch (err) {
    console.error('Error al obtener actividades asignadas:', err);
    res.status(500).json({ error: 'Error al obtener actividades asignadas' });
  }
});

// 4. Registrar Avance Diario en 'registros_avance' asociado a pau_actividad_id
router.post('/registrar-avance', async (req, res) => {
  const { tecnico_id, pau_id, actividad_id, pau_actividad_id, cantidad, observaciones } = req.body;

  const cantIngresada = parseFloat(cantidad);
  if (isNaN(cantIngresada) || cantIngresada <= 0) {
    return res.status(400).json({ error: 'Debe ingresar una cantidad válida mayor a 0.' });
  }

  try {
    // A. Consultar disponible filtrando ÚNICAMENTE por el ID específico de la asignación
    const checkQuery = `
      SELECT 
        pa.id AS pau_actividad_id,
        pa.pau_id AS real_pau_id,
        pa.actividad_id AS actividad_catalogo_id,
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE ra.pau_actividad_id = pa.id
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
      pau_actividad_id ? String(pau_actividad_id) : null,
      String(pau_id),
      actividad_id ? String(actividad_id) : null
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró la asignación de actividad para este departamento.' });
    }

    const realPauActividadId = checkResult.rows[0].pau_actividad_id;
    const realPauId = checkResult.rows[0].real_pau_id;
    const realActividadId = checkResult.rows[0].actividad_catalogo_id;
    const disponible = parseFloat(checkResult.rows[0].disponible);

    if (cantIngresada > disponible + 0.001) {
      return res.status(400).json({
        error: `No puedes ingresar ${cantIngresada.toFixed(2)}. La cantidad máxima disponible restante es ${disponible.toFixed(2)}.`
      });
    }

    // B. Insertar siempre el pau_actividad_id de la asignación actual
    const insertQuery = `
      INSERT INTO registros_avance (
        empleado_id, 
        tecnico_id, 
        pau_id, 
        actividad_id, 
        pau_actividad_id, 
        cantidad_ejecutada, 
        observaciones,
        fecha_registro
      )
      VALUES ($1, $1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      tecnico_id,
      realPauId,
      realActividadId,
      realPauActividadId,
      cantIngresada,
      observaciones || ''
    ]);

    res.json({ mensaje: 'Avance registrado con éxito', avance: result.rows[0] });
  } catch (err) {
    console.error('Error al registrar avance:', err);
    res.status(500).json({ error: 'No se pudo guardar el avance' });
  }
});

// 5. Obtener Historial de Avances del Técnico
router.get('/:id/historial', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        ra.id,
        TO_CHAR(ra.fecha_registro, 'YYYY-MM-DD') AS fecha,
        p.nombre AS proyecto,
        COALESCE(pau.nombre, pau.codigo) AS pau,
        COALESCE(ac.descripcion, 'Actividad') AS actividad,
        ac.unidad_medida,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad,
        ra.observaciones
      FROM registros_avance ra
      LEFT JOIN paus pau ON (CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT))
      LEFT JOIN proyectos p ON pau.proyecto_id = p.id
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      WHERE CAST(ra.empleado_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ra.fecha_registro DESC, ra.id DESC
      LIMIT 50;
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;