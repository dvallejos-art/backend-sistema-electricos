// src/controllers/supervisor.controller.js
const pool = require('../config/db');

// 1. Obtener Proyectos
exports.obtenerProyectos = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre FROM proyectos ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener proyectos:', err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Obtener Técnicos (CORREGIDO: email AS correo)
exports.obtenerTecnicos = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, email AS correo FROM usuarios WHERE LOWER(rol) IN ('tecnico', 'supervisor') ORDER BY nombre ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener técnicos:', err);
    res.status(500).json({ error: err.message });
  }
};

// 3. Obtener PAUs de un Proyecto
exports.obtenerPausPorProyecto = async (req, res) => {
  try {
    const { idProyecto } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, codigo FROM paus WHERE proyecto_id = $1 ORDER BY nombre ASC',
      [idProyecto]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener PAUs por proyecto:', err);
    res.status(500).json({ error: err.message });
  }
};

// 4. Crear o devolver PAU existente
exports.crearODevolverPau = async (req, res) => {
  const { proyecto_id, nombre } = req.body;
  if (!proyecto_id || !nombre) {
    return res.status(400).json({ error: 'El ID del proyecto y el nombre del PAU son requeridos.' });
  }

  try {
    const existe = await pool.query(
      'SELECT id, nombre FROM paus WHERE proyecto_id = $1 AND LOWER(nombre) = LOWER($2)',
      [proyecto_id, nombre.trim()]
    );
    if (existe.rows.length > 0) {
      return res.json(existe.rows[0]);
    }
    const nuevo = await pool.query(
      'INSERT INTO paus (proyecto_id, nombre, codigo) VALUES ($1, $2, $2) RETURNING id, nombre',
      [proyecto_id, nombre.trim()]
    );
    res.json(nuevo.rows[0]);
  } catch (err) {
    console.error('Error al crear/devolver PAU:', err);
    res.status(500).json({ error: err.message });
  }
};

// 5. Obtener actividades por nombre de edificio
exports.obtenerActividadesPorEdificio = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, descripcion AS nombre, unidad_medida FROM actividades_catalogo ORDER BY descripcion ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener actividades por edificio:', err);
    res.status(500).json({ error: err.message });
  }
};

// 6. Catálogo general de actividades
exports.obtenerActividades = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, codigo_item, descripcion, unidad_medida FROM actividades_catalogo ORDER BY descripcion ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener catálogo de actividades:', err);
    res.status(500).json({ error: err.message });
  }
};

// 7. Resumen de asignaciones y avance de técnicos
exports.obtenerAsignaciones = async (req, res) => {
  try {
    const query = `
      SELECT 
        pa.id,
        COALESCE(u.nombre, 'Sin asignar') AS tecnico,
        u.id AS tecnico_id,
        p.nombre AS proyecto,
        p.id AS proyecto_id,
        COALESCE(pau.nombre, pau.codigo) AS pau,
        COALESCE(pau.nombre, pau.codigo) AS departamento,
        pau.id AS pau_id,
        ac.descripcion AS actividad,
        ac.id AS actividad_id,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,

        COALESCE((
          SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
          FROM registros_avance ra
          WHERE ra.pau_actividad_id = pa.id
        ), 0) AS cantidad_ejecutada,

        ROUND(
          LEAST(
            (
              COALESCE((
                SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
                FROM registros_avance ra
                WHERE ra.pau_actividad_id = pa.id
              ), 0) / NULLIF(CAST(pa.cantidad_presupuestada AS NUMERIC), 0)
            ) * 100, 100
          ), 2
        ) AS porcentaje_avance,

        TO_CHAR(pa.fecha_inicio, 'DD/MM/YYYY') AS fecha_inicio,
        TO_CHAR(pa.fecha_fin, 'DD/MM/YYYY') AS fecha_fin,
        pa.observaciones

      FROM pau_actividades pa
      LEFT JOIN usuarios u ON pa.tecnico_id = u.id
      LEFT JOIN paus pau ON pa.pau_id = pau.id
      LEFT JOIN proyectos p ON pau.proyecto_id = p.id
      LEFT JOIN actividades_catalogo ac ON pa.actividad_id = ac.id
      ORDER BY pa.id DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener asignaciones:', err);
    res.status(500).json({ error: err.message });
  }
};

// 8. Registrar una NUEVA asignación independiente
exports.registrarAvance = async (req, res) => {
  const { 
    tecnico_id, 
    pau_id, 
    actividad_id, 
    cantidad, 
    fecha_inicio, 
    fecha_fin, 
    observaciones 
  } = req.body;

  if (!tecnico_id || !pau_id || !actividad_id) {
    return res.status(400).json({ 
      error: 'Debe seleccionar obligatoriamente un técnico, un departamento/PAU y una actividad.' 
    });
  }

  try {
    const insertQuery = `
      INSERT INTO pau_actividades (
        tecnico_id, 
        pau_id, 
        actividad_id, 
        cantidad_presupuestada, 
        fecha_inicio, 
        fecha_fin, 
        observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [
      tecnico_id, 
      pau_id, 
      actividad_id, 
      cantidad || 0, 
      fecha_inicio || null, 
      fecha_fin || null, 
      observaciones || ''
    ]);

    res.json({ mensaje: 'Nueva asignación guardada con éxito.', asignacion: result.rows[0] });
  } catch (err) {
    console.error('Error al registrar asignación:', err);
    res.status(500).json({ error: err.message });
  }
};

// 9. Métricas: Avance Por Departamento (PAU)
exports.obtenerAvancePorDepartamento = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.nombre AS proyecto,
        COALESCE(pau.nombre, pau.codigo) AS departamento,
        SUM(CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC)) AS total_asignado,
        COALESCE(
          SUM(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE ra.pau_actividad_id = pa.id
                 OR (
                   ra.pau_actividad_id IS NULL 
                   AND ra.pau_id = pa.pau_id 
                   AND ra.actividad_id = pa.actividad_id
                 )
            )
          ), 0
        ) AS total_ejecutado,
        ROUND(
          LEAST(
            (
              COALESCE(
                SUM(
                  (
                    SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
                    FROM registros_avance ra
                    WHERE ra.pau_actividad_id = pa.id
                       OR (
                         ra.pau_actividad_id IS NULL 
                         AND ra.pau_id = pa.pau_id 
                         AND ra.actividad_id = pa.actividad_id
                       )
                  )
                ), 0
              ) / NULLIF(SUM(CAST(pa.cantidad_presupuestada AS NUMERIC)), 0)
            ) * 100, 100
          ), 2
        ) AS porcentaje_dpto
      FROM pau_actividades pa
      JOIN paus pau ON pa.pau_id = pau.id
      JOIN proyectos p ON pau.proyecto_id = p.id
      GROUP BY p.nombre, pau.nombre, pau.codigo
      ORDER BY p.nombre, departamento;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener avance por dpto:', err);
    res.status(500).json({ error: err.message });
  }
};

// 10. Métricas: Avance General Por Edificio/Proyecto
exports.obtenerAvancePorEdificio = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.nombre AS proyecto_edificio,
        SUM(CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC)) AS total_asignado,
        COALESCE(
          SUM(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE ra.pau_actividad_id = pa.id
                 OR (
                   ra.pau_actividad_id IS NULL 
                   AND ra.pau_id = pa.pau_id 
                   AND ra.actividad_id = pa.actividad_id
                 )
            )
          ), 0
        ) AS total_ejecutado,
        ROUND(
          LEAST(
            (
              COALESCE(
                SUM(
                  (
                    SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
                    FROM registros_avance ra
                    WHERE ra.pau_actividad_id = pa.id
                       OR (
                         ra.pau_actividad_id IS NULL 
                         AND ra.pau_id = pa.pau_id 
                         AND ra.actividad_id = pa.actividad_id
                       )
                  )
                ), 0
              ) / NULLIF(SUM(CAST(pa.cantidad_presupuestada AS NUMERIC)), 0)
            ) * 100, 100
          ), 2
        ) AS porcentaje_edificio
      FROM pau_actividades pa
      JOIN paus pau ON pa.pau_id = pau.id
      JOIN proyectos p ON pau.proyecto_id = p.id
      GROUP BY p.nombre
      ORDER BY p.nombre;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener avance por edificio:', err);
    res.status(500).json({ error: err.message });
  }
};

// 11. Editar asignación existente
exports.editarAsignacion = async (req, res) => {
  const { id } = req.params;
  const { 
    tecnico_id, 
    pau_id, 
    actividad_id, 
    cantidad, 
    fecha_inicio, 
    fecha_fin, 
    observaciones 
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'El ID de la asignación es requerido.' });
  }

  try {
    const updateQuery = `
      UPDATE pau_actividades 
      SET 
        tecnico_id = COALESCE($1, tecnico_id),
        pau_id = COALESCE($2, pau_id),
        actividad_id = COALESCE($3, actividad_id),
        cantidad_presupuestada = COALESCE($4, cantidad_presupuestada),
        fecha_inicio = $5,
        fecha_fin = $6,
        observaciones = COALESCE($7, observaciones)
      WHERE id = $8
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [
      tecnico_id || null,
      pau_id || null,
      actividad_id || null,
      cantidad || null,
      fecha_inicio || null,
      fecha_fin || null,
      observaciones !== undefined ? observaciones : null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'La asignación no existe o fue eliminada.' });
    }

    res.json({ 
      mensaje: 'Asignación actualizada correctamente.', 
      asignacion: result.rows[0] 
    });

  } catch (err) {
    console.error('Error al editar asignación:', err);
    res.status(500).json({ error: 'Error interno del servidor al actualizar asignación.' });
  }
};

// 12. Eliminar asignación (Limpieza en cascada segura con transacción)
exports.eliminarAsignacion = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'El ID de la asignación es requerido.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const asignacionRes = await client.query(
      'SELECT id, tecnico_id, pau_id, actividad_id FROM pau_actividades WHERE id = $1',
      [id]
    );

    if (asignacionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La asignación no existe o ya fue eliminada.' });
    }

    const { tecnico_id, pau_id, actividad_id } = asignacionRes.rows[0];

    await client.query(
      `DELETE FROM registros_avance 
       WHERE pau_actividad_id = $1
          OR (
               pau_actividad_id IS NULL 
           AND pau_id = $2 
           AND actividad_id = $3 
           AND (tecnico_id = $4 OR $4 IS NULL)
          )`,
      [id, pau_id, actividad_id, tecnico_id]
    );

    await client.query('DELETE FROM pau_actividades WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({ 
      mensaje: 'Asignación y todos sus registros de avance asociados fueron eliminados correctamente.' 
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar asignación:', err);
    res.status(500).json({ error: 'Error interno del servidor al eliminar asignación.' });
  } finally {
    client.release();
  }
};