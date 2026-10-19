// src/controllers/admin.controller.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// 1. GESTIÓN DE USUARIOS
exports.obtenerUsuarios = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, email, email AS correo, rol, creado_en 
       FROM usuarios 
       ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    next(error);
  }
};

exports.crearUsuario = async (req, res, next) => {
  const { nombre, correo, email, password, rol } = req.body;
  const emailFinal = (correo || email || '').trim().toLowerCase();

  if (!nombre || !emailFinal || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, nombre, email, email AS correo, rol`,
      [nombre.trim(), emailFinal, passwordHash, (rol || 'supervisor').trim().toLowerCase()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El email ya está registrado.' });
    }
    console.error('Error al crear usuario:', error);
    next(error);
  }
};

exports.actualizarUsuario = async (req, res, next) => {
  const { id } = req.params;
  const { nombre, correo, email, rol, password } = req.body;
  const emailFinal = (correo || email || '').trim().toLowerCase();

  if (!nombre || !emailFinal || !rol) {
    return res.status(400).json({ error: 'Nombre, email y rol son obligatorios.' });
  }

  try {
    const rolClean = rol.trim().toLowerCase();
    const nombreClean = nombre.trim();

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const result = await pool.query(
        `UPDATE usuarios 
         SET nombre = $1, email = $2, rol = $3, password = $4
         WHERE id = $5 RETURNING id, nombre, email, email AS correo, rol`,
        [nombreClean, emailFinal, rolClean, passwordHash, id]
      );

      return res.json({ mensaje: 'Usuario actualizado con éxito', usuario: result.rows[0] });
    } else {
      const result = await pool.query(
        `UPDATE usuarios 
         SET nombre = $1, email = $2, rol = $3
         WHERE id = $4 RETURNING id, nombre, email, email AS correo, rol`,
        [nombreClean, emailFinal, rolClean, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      return res.json({ mensaje: 'Usuario actualizado con éxito', usuario: result.rows[0] });
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El email ya está registrado por otro usuario.' });
    }
    next(error);
  }
};

exports.eliminarUsuario = async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ mensaje: 'Usuario eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    next(error);
  }
};

// 2. CATÁLOGO DE ACTIVIDADES
exports.obtenerActividades = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, COALESCE(codigo_item, 'RUB-00') AS codigo_item, descripcion, unidad_medida 
       FROM actividades_catalogo 
       ORDER BY descripcion ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener actividades:', error);
    next(error);
  }
};

exports.crearActividad = async (req, res, next) => {
  const { descripcion, unidad_medida, codigo_item } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria.' });

  try {
    const existe = await pool.query(
      'SELECT id FROM actividades_catalogo WHERE LOWER(descripcion) = LOWER($1)',
      [descripcion.trim()]
    );
    if (existe.rows.length > 0) return res.status(400).json({ error: 'La actividad ya existe.' });

    const codigoFinal = codigo_item || `RUB-${Date.now().toString().slice(-5)}`;
    const nueva = await pool.query(
      `INSERT INTO actividades_catalogo (codigo_item, descripcion, unidad_medida) 
       VALUES ($1, $2, $3) RETURNING id, codigo_item, descripcion, unidad_medida`,
      [codigoFinal, descripcion.trim(), unidad_medida || 'Unidad']
    );
    res.status(201).json(nueva.rows[0]);
  } catch (error) {
    next(error);
  }
};

exports.actualizarActividad = async (req, res, next) => {
  const { id } = req.params;
  const { descripcion, unidad_medida, codigo_item } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria.' });

  try {
    const result = await pool.query(
      `UPDATE actividades_catalogo 
       SET descripcion = $1, unidad_medida = $2, codigo_item = COALESCE($3, codigo_item) 
       WHERE id = $4 RETURNING *`,
      [descripcion.trim(), unidad_medida || 'Unidad', codigo_item, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

exports.eliminarActividad = async (req, res, next) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM actividades_catalogo WHERE id = $1', [id]);
    res.json({ mensaje: 'Actividad eliminada con éxito.' });
  } catch (error) {
    next(error);
  }
};

// 3. TARIFAS Y PRECIOS DE ACTIVIDADES
exports.obtenerPreciosActividad = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT pa.id, pa.actividad_id, pa.proyecto_id, pa.precio_unitario,
              COALESCE(p.nombre, 'Sin Edificio') AS edificio,
              COALESCE(p.nombre, 'Sin Edificio') AS edificio_nombre
       FROM precios_actividades pa
       LEFT JOIN proyectos p ON CAST(pa.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
       WHERE CAST(pa.actividad_id AS TEXT) = CAST($1 AS TEXT) 
       ORDER BY pa.id DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las tarifas.' });
  }
};

exports.guardarPrecioActividad = async (req, res) => {
  const { id } = req.params;
  const { proyecto_id, edificio_id, precio_unitario } = req.body;
  const targetProyectoId = parseInt(proyecto_id || edificio_id, 10);
  const precioFinal = parseFloat(precio_unitario);

  if (!targetProyectoId || isNaN(precioFinal)) {
    return res.status(400).json({ error: 'Proyecto y precio unitario son obligatorios.' });
  }

  try {
    const existe = await pool.query(
      'SELECT id FROM precios_actividades WHERE CAST(actividad_id AS TEXT) = CAST($1 AS TEXT) AND CAST(proyecto_id AS TEXT) = CAST($2 AS TEXT)',
      [id, targetProyectoId]
    );

    if (existe.rows.length > 0) {
      await pool.query('UPDATE precios_actividades SET precio_unitario = $1 WHERE id = $2', [precioFinal, existe.rows[0].id]);
    } else {
      await pool.query('INSERT INTO precios_actividades (actividad_id, proyecto_id, precio_unitario) VALUES ($1, $2, $3)', [id, targetProyectoId, precioFinal]);
    }

    const result = await pool.query(
      `SELECT pa.id, pa.actividad_id, pa.proyecto_id, pa.precio_unitario,
              COALESCE(p.nombre, 'Sin Edificio') AS edificio
       FROM precios_actividades pa
       LEFT JOIN proyectos p ON CAST(p.id AS TEXT) = CAST(pa.proyecto_id AS TEXT)
       WHERE CAST(pa.actividad_id AS TEXT) = CAST($1 AS TEXT) 
       ORDER BY pa.id DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la tarifa.' });
  }
};

exports.eliminarPrecioActividad = async (req, res, next) => {
  const { precioId } = req.params;
  try {
    await pool.query('DELETE FROM precios_actividades WHERE id = $1', [precioId]);
    res.json({ mensaje: 'Tarifa eliminada con éxito.' });
  } catch (error) {
    next(error);
  }
};

// 4. PROYECTOS / EDIFICIOS Y AVANCE TOTAL
exports.obtenerEdificios = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const query = `
      SELECT 
        p.id,
        p.nombre,
        CAST(COALESCE(p.presupuesto_total, 0) AS NUMERIC) AS presupuesto_total,
        
        -- Suma acumulada de avances ejecutados en valor monetario
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC) * COALESCE(pa_precio.precio_unitario, 0))
            FROM registros_avance ra
            JOIN pau_actividades pa_act ON CAST(pa_act.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
            JOIN paus pau ON CAST(pau.id AS TEXT) = CAST(pa_act.pau_id AS TEXT)
            LEFT JOIN precios_actividades pa_precio 
              ON CAST(pa_precio.actividad_id AS TEXT) = CAST(pa_act.actividad_id AS TEXT) 
             AND CAST(pa_precio.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
            WHERE CAST(pau.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
          ), 0
        ) AS total_ejecutado,

        -- Porcentaje de avance global
        CASE 
          WHEN CAST(COALESCE(p.presupuesto_total, 0) AS NUMERIC) > 0 THEN
            ROUND(
              (
                COALESCE(
                  (
                    SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC) * COALESCE(pa_precio.precio_unitario, 0))
                    FROM registros_avance ra
                    JOIN pau_actividades pa_act ON CAST(pa_act.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
                    JOIN paus pau ON CAST(pau.id AS TEXT) = CAST(pa_act.pau_id AS TEXT)
                    LEFT JOIN precios_actividades pa_precio 
                      ON CAST(pa_precio.actividad_id AS TEXT) = CAST(pa_act.actividad_id AS TEXT) 
                     AND CAST(pa_precio.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
                    WHERE CAST(pau.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
                  ), 0
                ) / CAST(p.presupuesto_total AS NUMERIC)
              ) * 100, 2
            )
          ELSE 0.00
        END AS porcentaje_avance_global

      FROM proyectos p
      ORDER BY p.nombre ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener edificios:', error);
    next(error);
  }
};

exports.crearEdificio = async (req, res, next) => {
  const { nombre, presupuesto_total } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre del edificio es obligatorio.' });

  try {
    const result = await pool.query(
      `INSERT INTO proyectos (nombre, presupuesto_total) 
       VALUES ($1, $2) 
       RETURNING id, nombre, CAST(COALESCE(presupuesto_total, 0) AS NUMERIC) AS presupuesto_total`,
      [nombre.trim(), parseFloat(presupuesto_total) || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear edificio:', error);
    next(error);
  }
};

exports.eliminarEdificio = async (req, res, next) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM proyectos WHERE id = $1', [id]);
    res.json({ mensaje: 'Edificio eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar edificio:', error);
    next(error);
  }
};

// 5. RESUMEN POR DEPARTAMENTOS / PAU (CÁLCULO EXACTO DE COSTO ACUMULADO Y PENDIENTE NOMINAL)
exports.obtenerResumenDepartamentos = async (req, res) => {
  const { proyecto_id } = req.params;

  try {
    const query = `
      WITH desglosado_asignaciones AS (
        SELECT 
          p.id AS pau_id,
          COALESCE(p.nombre, p.codigo) AS dpto,
          pa.id AS asignacion_id,
          pa.actividad_id,
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cant_asig,
          
          -- Extrae el % asignado (ej: 60, 40 o 100 por defecto)
          CASE 
            WHEN pa.observaciones ~ '[0-9]+%' THEN 
              CAST(SUBSTRING(pa.observaciones FROM '([0-9]+)%') AS NUMERIC)
            ELSE 100.0
          END AS pct_etapa,

          -- Cantidad ejecutada real en la base de datos para esta asignación
          COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ) AS cant_ejec_bruta,

          -- Tarifa/Precio unitario para el proyecto actual
          COALESCE(pre.precio_unitario, 0) AS precio_unitario

        FROM paus p
        JOIN pau_actividades pa ON CAST(pa.pau_id AS TEXT) = CAST(p.id AS TEXT)
        LEFT JOIN precios_actividades pre 
          ON CAST(pre.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT)
         AND CAST(pre.proyecto_id AS TEXT) = CAST(p.proyecto_id AS TEXT)
        WHERE CAST(p.proyecto_id AS TEXT) = CAST($1 AS TEXT)
      ),
      calculo_ponderado AS (
        SELECT 
          pau_id,
          dpto,
          precio_unitario,
          cant_asig,
          cant_ejec_bruta,
          pct_etapa,
          (cant_asig * (pct_etapa / 100.0)) AS limite_fisico_etapa,
          LEAST(cant_ejec_bruta, (cant_asig * (pct_etapa / 100.0))) AS cantidad_ejecutada_fisica,
          
          -- Calcula el pendiente NOMINAL REAL (solo es 0 si la ejecución alcanza el 100% nominal de la asignación)
          CASE 
            WHEN LEAST(cant_ejec_bruta, (cant_asig * (pct_etapa / 100.0))) >= cant_asig OR pct_etapa = 100 THEN
              GREATEST(0, cant_asig - LEAST(cant_ejec_bruta, (cant_asig * (pct_etapa / 100.0))))
            ELSE 
              GREATEST(0, cant_asig - LEAST(cant_ejec_bruta, (cant_asig * (pct_etapa / 100.0))))
          END AS cantidad_pendiente_fisica
        FROM desglosado_asignaciones
      )
      SELECT 
        pau_id,
        dpto,
        COALESCE(SUM(cantidad_ejecutada_fisica * precio_unitario), 0) AS costo_acumulado,
        COALESCE(SUM(cantidad_pendiente_fisica * precio_unitario), 0) AS costo_pendiente
      FROM calculo_ponderado
      GROUP BY pau_id, dpto
      ORDER BY dpto ASC;
    `;

    const result = await pool.query(query, [proyecto_id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener resumen de departamentos:', err);
    res.status(500).json({ error: err.message });
  }
};