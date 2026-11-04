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
 * 7. Obtener todas las asignaciones normales (Excluye provisionales)
 */
exports.obtenerAsignaciones = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pau_actividades_cuadrilla (
        id SERIAL PRIMARY KEY,
        pau_actividad_id INT,
        tecnico_id INT
      );
    `);

    const query = `
      SELECT 
        pa.id,
        pa.pau_id,
        pa.actividad_id,
        pa.tecnico_id,
        pa.tecnico_secundario_id,
        pa.creado_por,
        
        COALESCE(u_sup.nombre, 'admin') AS supervisor_nombre,
        COALESCE(u_sup.nombre, 'admin') AS supervisor_asignador,
        
        COALESCE(u1.nombre, 'Sin Asignar') AS tecnico,
        COALESCE(u1.nombre, 'Sin Asignar') AS tecnico_principal,
        u2.nombre AS tecnico_secundario_nombre,
        
        COALESCE(
          (
            SELECT STRING_AGG(DISTINCT u_acomp.nombre, ', ')
            FROM pau_actividades_cuadrilla pac
            JOIN usuarios u_acomp ON CAST(u_acomp.id AS TEXT) = CAST(pac.tecnico_id AS TEXT)
            WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ),
          u2.nombre,
          'Individual'
        ) AS acompanantes_nombres,

        COALESCE(pr.nombre, 'Sin Proyecto') AS proyecto,
        COALESCE(pr.nombre, 'Sin Proyecto') AS edificio,
        COALESCE(p.nombre, p.codigo, 'N/A') AS departamento,
        COALESCE(p.nombre, p.codigo, 'N/A') AS pau,
        COALESCE(ac.descripcion, 'Sin Actividad') AS actividad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_asignada,
        
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,

        COALESCE(
          (
            SELECT MAX(ra.fecha_registro)
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), NULL
        ) AS fecha_ejecucion,

        pa.observaciones,
        pa.fecha_inicio AS fecha_asignacion,
        pa.fecha_inicio,
        pa.fecha_fin
      FROM pau_actividades pa
      LEFT JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      LEFT JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      LEFT JOIN usuarios u1 ON CAST(u1.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      LEFT JOIN usuarios u_sup ON CAST(u_sup.id AS TEXT) = CAST(pa.creado_por AS TEXT)
      WHERE COALESCE(pa.es_provisional, FALSE) = FALSE
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
 * 8. Crear nueva asignación (CON VALIDACIÓN ESTRICTA DE PRESUPUESTO)
 */
exports.asignarTrabajo = async (req, res) => {
  const tecnico_id = req.body.tecnico_id || req.body.tecnicoId;
  const rawSecundario = req.body.tecnico_secundario_id ?? req.body.tecnico_secundario ?? req.body.tecnicoSecundarioId;
  
  const supervisorId = req.user?.id || req.usuario?.id || req.user?.usuario_id || req.usuario?.usuario_id || req.body.supervisor_id || req.body.creado_por;

  let listaAcompanantes = [];
  if (Array.isArray(req.body.acompanantes)) {
    listaAcompanantes = req.body.acompanantes;
  } else if (Array.isArray(req.body.tecnicos_cuadrilla)) {
    listaAcompanantes = req.body.tecnicos_cuadrilla;
  } else if (rawSecundario) {
    listaAcompanantes = [rawSecundario];
  }

  const {
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_pago,
    porcentaje,
    observaciones,
    fecha_inicio,
    fecha_fin,
    fecha_asignacion
  } = req.body;

  if (!tecnico_id || !actividad_id || !pau_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la asignación.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 🔴 RESTRICCIÓN DE PRESUPUESTO Y SALDO (Solo cuenta asignaciones normales)
    const querySaldo = `
      SELECT 
        COALESCE(pd.cantidad_presupuestada, 0) AS pres,
        COALESCE((
          SELECT SUM(pa.cantidad_presupuestada) 
          FROM pau_actividades pa 
          WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) 
            AND CAST(pa.actividad_id AS TEXT) = CAST($2 AS TEXT)
            AND COALESCE(pa.es_provisional, FALSE) = FALSE
        ), 0) AS asignado
      FROM presupuesto_departamento pd
      WHERE CAST(pd.pau_id AS TEXT) = CAST($1 AS TEXT)
        AND CAST(pd.actividad_id AS TEXT) = CAST($2 AS TEXT);
    `;

    const resSaldo = await client.query(querySaldo, [pau_id, actividad_id]);

    if (resSaldo.rows.length === 0 || parseFloat(resSaldo.rows[0].pres) <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'No se puede asignar: El rubro seleccionado no tiene un presupuesto asignado para este departamento.' 
      });
    }

    const pres = parseFloat(resSaldo.rows[0].pres);
    const asignado = parseFloat(resSaldo.rows[0].asignado);
    const saldoDisponible = pres - asignado;
    const cantidadSolicitada = parseFloat(cantidad);

    if (cantidadSolicitada > saldoDisponible) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Acción bloqueada: La cantidad solicitada (${cantidadSolicitada}) supera el saldo disponible (${saldoDisponible.toFixed(2)}).` 
      });
    }

    let secId = null;
    if (listaAcompanantes.length > 0) {
      const parsedFirst = parseInt(listaAcompanantes[0], 10);
      if (!isNaN(parsedFirst)) secId = parsedFirst;
    }

    const pctReal = parseFloat(porcentaje_pago || porcentaje || 100);
    let obsFinales = observaciones || '';
    if (pctReal < 100 && !obsFinales.includes('[Etapa:')) {
      obsFinales = `[Etapa: ${pctReal}%] ${obsFinales}`.trim();
    }

    const fechaAsigFinal = fecha_asignacion || fecha_inicio || new Date().toISOString().split('T')[0];

    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS creado_por INT;`);
    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS es_provisional BOOLEAN DEFAULT FALSE;`);

    const query = `
      INSERT INTO pau_actividades (
        pau_id, actividad_id, tecnico_id, tecnico_secundario_id,
        cantidad_presupuestada, observaciones, fecha_inicio, fecha_fin, creado_por, es_provisional
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
      RETURNING *;
    `;

    const values = [
      parseInt(pau_id, 10),
      parseInt(actividad_id, 10),
      parseInt(tecnico_id, 10),
      secId,
      cantidadSolicitada,
      obsFinales,
      fechaAsigFinal,
      fecha_fin || null,
      supervisorId ? parseInt(supervisorId, 10) : null
    ];

    const result = await client.query(query, values);
    const asignacionId = result.rows[0].id;

    await client.query(`
      CREATE TABLE IF NOT EXISTS pau_actividades_cuadrilla (
        id SERIAL PRIMARY KEY,
        pau_actividad_id INT,
        tecnico_id INT
      );
    `);

    const procesados = new Set();
    for (const acompId of listaAcompanantes) {
      const idNum = parseInt(acompId, 10);
      if (!isNaN(idNum) && !procesados.has(idNum)) {
        procesados.add(idNum);
        await client.query(
          `INSERT INTO pau_actividades_cuadrilla (pau_actividad_id, tecnico_id) VALUES ($1, $2);`,
          [asignacionId, idNum]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Nueva asignación guardada con éxito.', asignacion: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al asignar trabajo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * 9. Editar asignación existente
 */
exports.editarAsignacion = async (req, res) => {
  const { id } = req.params;
  const tecnico_id = req.body.tecnico_id || req.body.tecnicoId;
  const rawSecundario = req.body.tecnico_secundario_id ?? req.body.tecnico_secundario ?? req.body.tecnicoSecundarioId;
  
  let listaAcompanantes = [];
  if (Array.isArray(req.body.acompanantes)) {
    listaAcompanantes = req.body.acompanantes;
  } else if (Array.isArray(req.body.tecnicos_cuadrilla)) {
    listaAcompanantes = req.body.tecnicos_cuadrilla;
  } else if (rawSecundario) {
    listaAcompanantes = [rawSecundario];
  }

  const {
    actividad_id,
    pau_id,
    cantidad,
    porcentaje_pago,
    porcentaje,
    observaciones,
    fecha_inicio,
    fecha_fin,
    fecha_asignacion
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let secId = null;
    if (listaAcompanantes.length > 0) {
      const parsedFirst = parseInt(listaAcompanantes[0], 10);
      if (!isNaN(parsedFirst)) secId = parsedFirst;
    }

    const pctReal = parseFloat(porcentaje_pago || porcentaje || 100);
    let obsFinales = observaciones || '';
    if (pctReal < 100 && !obsFinales.includes('[Etapa:')) {
      obsFinales = `[Etapa: ${pctReal}%] ${obsFinales}`.trim();
    }

    const fechaAsigFinal = fecha_asignacion || fecha_inicio || new Date().toISOString().split('T')[0];

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
      fechaAsigFinal,
      fecha_fin || null,
      parseInt(id, 10)
    ];

    const result = await client.query(query, values);

    await client.query(
      `DELETE FROM pau_actividades_cuadrilla WHERE CAST(pau_actividad_id AS TEXT) = CAST($1 AS TEXT);`,
      [id]
    );

    const procesados = new Set();
    for (const acompId of listaAcompanantes) {
      const idNum = parseInt(acompId, 10);
      if (!isNaN(idNum) && !procesados.has(idNum)) {
        procesados.add(idNum);
        await client.query(
          `INSERT INTO pau_actividades_cuadrilla (pau_actividad_id, tecnico_id) VALUES ($1, $2);`,
          [parseInt(id, 10), idNum]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Asignación actualizada correctamente.', asignacion: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar asignación:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * 10. Eliminar asignación por ID
 */
exports.eliminarAsignacion = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM pau_actividades_cuadrilla 
       WHERE CAST(pau_actividad_id AS TEXT) = CAST($1 AS TEXT);`,
      [id]
    );

    await client.query(
      `DELETE FROM registros_avance 
       WHERE CAST(pau_actividad_id AS TEXT) = CAST($1 AS TEXT);`,
      [id]
    );

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

/**
 * 11. Asignaciones masivas (CON VALIDACIÓN ESTRICTA DE PRESUPUESTO)
 */
exports.asignarTrabajoMasivo = async (req, res) => {
  const {
    tecnico_id,
    acompanantes,
    fecha_asignacion,
    proyecto_id,
    pau_id,
    actividades
  } = req.body;

  const supervisorId = req.user?.id || req.usuario?.id || req.user?.usuario_id || req.usuario?.usuario_id || req.body.supervisor_id || req.body.creado_por;

  if (!tecnico_id || !proyecto_id || !pau_id || !Array.isArray(actividades) || actividades.length === 0) {
    return res.status(400).json({ error: 'Faltan datos requeridos o la lista de actividades está vacía.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const item of actividades) {
      const querySaldo = `
        SELECT 
          COALESCE(pd.cantidad_presupuestada, 0) AS pres,
          COALESCE((
            SELECT SUM(pa.cantidad_presupuestada) 
            FROM pau_actividades pa 
            WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) 
              AND CAST(pa.actividad_id AS TEXT) = CAST($2 AS TEXT)
              AND COALESCE(pa.es_provisional, FALSE) = FALSE
          ), 0) AS asignado
        FROM presupuesto_departamento pd
        WHERE CAST(pd.pau_id AS TEXT) = CAST($1 AS TEXT)
          AND CAST(pd.actividad_id AS TEXT) = CAST($2 AS TEXT);
      `;

      const resSaldo = await client.query(querySaldo, [pau_id, item.actividad_id]);

      if (resSaldo.rows.length === 0 || parseFloat(resSaldo.rows[0].pres) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Acción bloqueada: La actividad ID ${item.actividad_id} no tiene un presupuesto ingresado.` 
        });
      }

      const pres = parseFloat(resSaldo.rows[0].pres);
      const asignado = parseFloat(resSaldo.rows[0].asignado);
      const saldoDisponible = pres - asignado;
      const cantidadSolicitada = parseFloat(item.cantidad);

      if (cantidadSolicitada > saldoDisponible) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Acción bloqueada: Para un rubro del lote, la cantidad (${cantidadSolicitada}) supera el disponible (${saldoDisponible.toFixed(2)}).` 
        });
      }
    }

    let secId = null;
    const listaAcomp = Array.isArray(acompanantes) ? acompanantes : [];
    if (listaAcomp.length > 0) {
      const parsedFirst = parseInt(listaAcomp[0], 10);
      if (!isNaN(parsedFirst)) secId = parsedFirst;
    }

    const fechaAsigFinal = fecha_asignacion || new Date().toISOString().split('T')[0];

    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS creado_por INT;`);
    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS es_provisional BOOLEAN DEFAULT FALSE;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pau_actividades_cuadrilla (
        id SERIAL PRIMARY KEY,
        pau_actividad_id INT,
        tecnico_id INT
      );
    `);

    const asignacionesCreadas = [];

    for (const item of actividades) {
      const pctReal = parseFloat(item.porcentaje_pago || 100);
      let obsFinales = item.observaciones || '';
      if (pctReal < 100 && !obsFinales.includes('[Etapa:')) {
        obsFinales = `[Etapa: ${pctReal}%] ${obsFinales}`.trim();
      }

      const insertQuery = `
        INSERT INTO pau_actividades (
          pau_id, actividad_id, tecnico_id, tecnico_secundario_id,
          cantidad_presupuestada, observaciones, fecha_inicio, creado_por, es_provisional
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
        RETURNING *;
      `;

      const values = [
        parseInt(pau_id, 10),
        parseInt(item.actividad_id, 10),
        parseInt(tecnico_id, 10),
        secId,
        parseFloat(item.cantidad),
        obsFinales,
        fechaAsigFinal,
        supervisorId ? parseInt(supervisorId, 10) : null
      ];

      const resIns = await client.query(insertQuery, values);
      const asignacionId = resIns.rows[0].id;
      asignacionesCreadas.push(resIns.rows[0]);

      const procesados = new Set();
      for (const acompId of listaAcomp) {
        const idNum = parseInt(acompId, 10);
        if (!isNaN(idNum) && !procesados.has(idNum)) {
          procesados.add(idNum);
          await client.query(
            `INSERT INTO pau_actividades_cuadrilla (pau_actividad_id, tecnico_id) VALUES ($1, $2);`,
            [asignacionId, idNum]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ mensaje: '¡Todas las actividades se asignaron correctamente!', asignaciones: asignacionesCreadas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en asignación masiva:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * 12. Obtener el presupuesto de un departamento y el saldo disponible (Excluye provisionales)
 */
exports.obtenerPresupuestoYSaldosDpto = async (req, res) => {
  const { pauId } = req.params;
  try {
    const query = `
      SELECT 
        ac.id AS actividad_id,
        ac.descripcion AS actividad_nombre,
        ac.unidad_medida,
        COALESCE(pd.cantidad_presupuestada, 0) AS cantidad_presupuestada,
        
        COALESCE((
          SELECT SUM(pa.cantidad_presupuestada) 
          FROM pau_actividades pa 
          WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) 
            AND CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
            AND COALESCE(pa.es_provisional, FALSE) = FALSE
        ), 0) AS cantidad_ya_asignada,

        COALESCE(pd.cantidad_presupuestada, 0) - COALESCE((
          SELECT SUM(pa.cantidad_presupuestada) 
          FROM pau_actividades pa 
          WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) 
            AND CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
            AND COALESCE(pa.es_provisional, FALSE) = FALSE
        ), 0) AS saldo_por_asignar,

        COALESCE((
          SELECT SUM(ra.cantidad_ejecutada) 
          FROM pau_actividades pa 
          JOIN registros_avance ra ON CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) 
            AND CAST(pa.actividad_id AS TEXT) = CAST(ac.id AS TEXT)
            AND COALESCE(pa.es_provisional, FALSE) = FALSE
        ), 0) AS cantidad_ejecutada_real

      FROM presupuesto_departamento pd
      JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pd.actividad_id AS TEXT)
      WHERE CAST(pd.pau_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ac.descripcion ASC;
    `;
    const result = await pool.query(query, [pauId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener saldos del departamento:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 13. Guardar / Cargar Presupuesto por Departamento
 */
exports.guardarPresupuestoDpto = async (req, res) => {
  const { pau_id, presupuesto } = req.body;
  if (!pau_id || !Array.isArray(presupuesto)) {
    return res.status(400).json({ error: 'Faltan datos de presupuesto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of presupuesto) {
      const query = `
        INSERT INTO presupuesto_departamento (pau_id, actividad_id, cantidad_presupuestada)
        VALUES ($1, $2, $3)
        ON CONFLICT (pau_id, actividad_id) 
        DO UPDATE SET cantidad_presupuestada = EXCLUDED.cantidad_presupuestada;
      `;
      await client.query(query, [pau_id, item.actividad_id, item.cantidad_presupuestada]);
    }
    await client.query('COMMIT');
    res.json({ mensaje: 'Presupuesto del departamento actualizado con éxito.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al guardar presupuesto:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * 14. Calcular el Porcentaje de Avance Real para la Matriz por Pisos
 */
exports.obtenerAvanceMatrizPisos = async (req, res) => {
  const { proyectoId } = req.params;
  try {
    const query = `
      SELECT 
        p.id AS pau_id,
        p.codigo AS pau_codigo,
        p.nombre AS pau_nombre,
        
        CASE 
          WHEN LENGTH(REGEXP_REPLACE(p.codigo, '[^0-9]', '', 'g')) >= 3 THEN 
            'Piso ' || SUBSTRING(REGEXP_REPLACE(p.codigo, '[^0-9]', '', 'g') FROM 1 FOR LENGTH(REGEXP_REPLACE(p.codigo, '[^0-9]', '', 'g')) - 2)
          ELSE 'Piso 1'
        END AS piso,
        
        COALESCE((
          SELECT SUM(pd.cantidad_presupuestada)
          FROM presupuesto_departamento pd
          WHERE CAST(pd.pau_id AS TEXT) = CAST(p.id AS TEXT)
        ), 0) AS total_presupuestado,

        COALESCE((
          SELECT SUM(ra.cantidad_ejecutada)
          FROM pau_actividades pa
          JOIN registros_avance ra ON CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          WHERE CAST(pa.pau_id AS TEXT) = CAST(p.id AS TEXT)
            AND COALESCE(pa.es_provisional, FALSE) = FALSE
        ), 0) AS total_ejecutado

      FROM paus p
      WHERE CAST(p.proyecto_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY p.codigo ASC;
    `;

    const result = await pool.query(query, [proyectoId]);

    const datosProcesados = result.rows.map(row => {
      const pres = parseFloat(row.total_presupuestado) || 0;
      const ejec = parseFloat(row.total_ejecutado) || 0;
      let porcentaje = 0;

      if (pres > 0) {
        porcentaje = Math.min(Math.round((ejec / pres) * 100), 100);
      } else if (ejec > 0) {
        porcentaje = 100;
      }

      return {
        ...row,
        porcentaje_avance: porcentaje
      };
    });

    res.json(datosProcesados);
  } catch (err) {
    console.error('Error al calcular avance de matriz:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * 15. Crear actividad provisional (Con soporte de cuadrilla)
 */
exports.crearActividadProvisional = async (req, res) => {
  const tecnico_id = req.body.tecnico_id || req.body.tecnicoId;
  const rawSecundario = req.body.tecnico_secundario_id ?? req.body.tecnico_secundario;
  
  const supervisorId = req.user?.id || req.usuario?.id || req.body.supervisor_id || req.body.creado_por;

  let listaAcompanantes = [];
  if (Array.isArray(req.body.acompanantes)) {
    listaAcompanantes = req.body.acompanantes;
  } else if (rawSecundario) {
    listaAcompanantes = [rawSecundario];
  }

  const { pau_id, actividad_id, cantidad, observaciones, fecha_asignacion } = req.body;

  if (!tecnico_id || !pau_id || !actividad_id || !cantidad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la actividad provisional.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS es_provisional BOOLEAN DEFAULT FALSE;`);
    await client.query(`ALTER TABLE pau_actividades ADD COLUMN IF NOT EXISTS creado_por INT;`);

    let secId = null;
    if (listaAcompanantes.length > 0) {
      const parsedFirst = parseInt(listaAcompanantes[0], 10);
      if (!isNaN(parsedFirst)) secId = parsedFirst;
    }

    const query = `
      INSERT INTO pau_actividades (
        pau_id, actividad_id, tecnico_id, tecnico_secundario_id, cantidad_presupuestada, 
        observaciones, fecha_inicio, creado_por, es_provisional
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *;
    `;
    const values = [
      parseInt(pau_id, 10),
      parseInt(actividad_id, 10),
      parseInt(tecnico_id, 10),
      secId,
      parseFloat(cantidad),
      `[PROVISIONAL] ${observaciones || ''}`.trim(),
      fecha_asignacion || new Date().toISOString().split('T')[0],
      supervisorId ? parseInt(supervisorId, 10) : null
    ];

    const result = await client.query(query, values);
    const asignacionId = result.rows[0].id;

    await client.query(`
      CREATE TABLE IF NOT EXISTS pau_actividades_cuadrilla (
        id SERIAL PRIMARY KEY,
        pau_actividad_id INT,
        tecnico_id INT
      );
    `);

    const procesados = new Set();
    for (const acompId of listaAcompanantes) {
      const idNum = parseInt(acompId, 10);
      if (!isNaN(idNum) && !procesados.has(idNum)) {
        procesados.add(idNum);
        await client.query(
          `INSERT INTO pau_actividades_cuadrilla (pau_actividad_id, tecnico_id) VALUES ($1, $2);`,
          [asignacionId, idNum]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Actividad provisional creada con éxito.', asignacion: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear actividad provisional:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * 16. Obtener listado de actividades provisionales (Incluye cuadrilla)
 */
exports.obtenerActividadesProvisionales = async (req, res) => {
  try {
    const query = `
      SELECT 
        pa.id,
        pa.fecha_inicio AS fecha,
        COALESCE(u_sup.nombre, 'admin') AS supervisor,
        COALESCE(u_tec.nombre, 'Sin Técnico') AS tecnico,
        COALESCE(
          (
            SELECT STRING_AGG(DISTINCT u_acomp.nombre, ', ')
            FROM pau_actividades_cuadrilla pac
            JOIN usuarios u_acomp ON CAST(u_acomp.id AS TEXT) = CAST(pac.tecnico_id AS TEXT)
            WHERE CAST(pac.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ),
          u2.nombre,
          'Individual'
        ) AS acompanantes_nombres,
        COALESCE(pr.nombre, 'Sin Proyecto') AS edificio,
        COALESCE(p.nombre, p.codigo, 'N/A') AS departamento,
        COALESCE(ac.descripcion, 'Sin Actividad') AS actividad,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_solicitada,
        COALESCE((
          SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
          FROM registros_avance ra
          WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
        ), 0) AS cantidad_ejecutada,
        CASE 
          WHEN COALESCE((
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0) >= pa.cantidad_presupuestada THEN 'Verificado / Realizado'
          WHEN COALESCE((
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0) > 0 THEN 'En Proceso'
          ELSE 'Pendiente'
        END AS estado,
        pa.observaciones
      FROM pau_actividades pa
      LEFT JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      LEFT JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      LEFT JOIN usuarios u_tec ON CAST(u_tec.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      LEFT JOIN usuarios u_sup ON CAST(u_sup.id AS TEXT) = CAST(pa.creado_por AS TEXT)
      WHERE pa.es_provisional = TRUE
      ORDER BY pa.id DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener actividades provisionales:', err);
    res.status(500).json({ error: err.message });
  }
};