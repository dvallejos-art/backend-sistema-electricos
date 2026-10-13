// src/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth');
const db = require('../config/db');

// Resolver middleware de autenticación de forma segura
let verificarToken;
if (typeof authMiddleware === 'function') {
  verificarToken = authMiddleware;
} else if (authMiddleware && typeof authMiddleware.verificarToken === 'function') {
  verificarToken = authMiddleware.verificarToken;
} else if (authMiddleware && typeof authMiddleware.autenticar === 'function') {
  verificarToken = authMiddleware.autenticar;
}

if (typeof verificarToken === 'function') {
  router.use(verificarToken);
}

// Función auxiliar para registrar rutas
const registrarRuta = (metodo, ruta, funcion) => {
  if (typeof funcion === 'function') {
    router[metodo](ruta, funcion);
  } else {
    console.warn(`⚠️ ADVERTENCIA: La función para ${metodo.toUpperCase()} ${ruta} no está definida en admin.controller.js`);
    router[metodo](ruta, (req, res) => {
      res.status(501).json({ error: `La ruta ${ruta} no está implementada en el controlador.` });
    });
  }
};

// --- RUTAS DE USUARIOS ---
registrarRuta('get', '/usuarios', adminController.obtenerUsuarios || adminController.getUsuarios);
registrarRuta('post', '/usuarios', adminController.crearUsuario);
registrarRuta('put', '/usuarios/:id', adminController.actualizarUsuario);
registrarRuta('delete', '/usuarios/:id', adminController.eliminarUsuario);

// --- RUTAS DE ACTIVIDADES / RUBROS ---
registrarRuta('get', '/actividades', adminController.obtenerActividades || adminController.getActividades);
registrarRuta('post', '/actividades', adminController.crearActividad);
registrarRuta('put', '/actividades/:id', adminController.actualizarActividad);
registrarRuta('delete', '/actividades/:id', adminController.eliminarActividad);

// --- RUTAS DE PRECIOS Y TARIFAS ---
registrarRuta('get', '/actividades/:id/precios', adminController.obtenerPreciosActividad);
registrarRuta('post', '/actividades/:id/precios', adminController.guardarPrecioActividad);
registrarRuta('delete', '/actividades/precios/:precioId', adminController.eliminarPrecioActividad);
registrarRuta('delete', '/precios/:precioId', adminController.eliminarPrecioActividad);

// --- RUTAS DE EDIFICIOS / PROYECTOS ---
registrarRuta('get', '/edificios', adminController.obtenerEdificios || adminController.getEdificios || adminController.getProyectos);

// GET /proyectos - Consulta proyectos calculando Avance Monetario Real ($)
router.get('/proyectos', async (req, res, next) => {
  try {
    const queryResiliente = `
      SELECT 
        p.id, 
        p.nombre, 
        CAST(COALESCE(p.presupuesto_total, 0) AS NUMERIC) AS presupuesto_total,
        
        -- Suma total ejecutada en dinero ($)
        COALESCE(
          (
            SELECT SUM(
              CAST(ra.cantidad_ejecutada AS NUMERIC) * 
              COALESCE(
                (
                  SELECT pa_precio.precio_unitario 
                  FROM precios_actividades pa_precio 
                  WHERE CAST(pa_precio.actividad_id AS TEXT) = CAST(ra.actividad_id AS TEXT) 
                    AND CAST(pa_precio.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
                  LIMIT 1
                ),
                (
                  SELECT pa_precio.precio_unitario 
                  FROM precios_actividades pa_precio 
                  WHERE CAST(pa_precio.actividad_id AS TEXT) = CAST(ra.actividad_id AS TEXT)
                  LIMIT 1
                ),
                0
              )
            )
            FROM registros_avance ra
            JOIN paus pau ON (
              CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) 
              OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT)
            )
            WHERE CAST(pau.proyecto_id AS TEXT) = CAST(p.id AS TEXT)
          ), 0
        ) AS total_ejecutado

      FROM proyectos p
      ORDER BY p.id DESC;
    `;

    const result = await db.query(queryResiliente);

    const proyectos = result.rows.map((p) => {
      const pres = parseFloat(p.presupuesto_total || 0);
      const ejec = parseFloat(p.total_ejecutado || 0);
      const avancePorcentaje = pres > 0 ? Math.min((ejec / pres) * 100, 100).toFixed(2) : '0.00';

      return {
        id: p.id,
        nombre: p.nombre,
        presupuesto_total: pres,
        total_ejecutado: ejec,
        avance_porcentaje: avancePorcentaje,
        porcentaje_avance: avancePorcentaje
      };
    });

    res.json(proyectos);
  } catch (err) {
    console.error('Error en GET /proyectos:', err);
    next(err);
  }
});

// GET /proyectos/:id/detalle-paus - CÁLCULOS 100% DESDE BASE DE DATOS
router.get('/proyectos/:id/detalle-paus', async (req, res, next) => {
  const { id } = req.params;
  try {
    const queryPaus = `
      SELECT 
        pau.id AS pau_id,
        COALESCE(pau.nombre, pau.codigo) AS departamento,
        pau.codigo
      FROM paus pau
      WHERE CAST(pau.proyecto_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY pau.codigo ASC, pau.nombre ASC;
    `;

    const resultPaus = await db.query(queryPaus, [id]);

    const resumenPaus = await Promise.all(
      resultPaus.rows.map(async (row) => {
        const queryActividadesBD = `
          WITH base_actividades AS (
            SELECT actividad_id FROM pau_actividades WHERE CAST(pau_id AS TEXT) = CAST($2 AS TEXT) OR CAST(pau_id AS TEXT) = CAST($3 AS TEXT)
            UNION
            SELECT actividad_id FROM registros_avance WHERE CAST(pau_id AS TEXT) = CAST($2 AS TEXT) OR CAST(pau_id AS TEXT) = CAST($3 AS TEXT)
          ),
          actividades_calculadas AS (
            SELECT 
              b.actividad_id,
              COALESCE(
                (
                  SELECT ac.descripcion 
                  FROM actividades_catalogo ac 
                  WHERE CAST(ac.id AS TEXT) = CAST(b.actividad_id AS TEXT) 
                  LIMIT 1
                ),
                CONCAT('Rubro / Actividad #', b.actividad_id)
              ) AS descripcion,

              -- Cantidad Asignada
              COALESCE(
                (
                  SELECT SUM(CAST(pa.cantidad_presupuestada AS NUMERIC)) 
                  FROM pau_actividades pa 
                  WHERE CAST(pa.actividad_id AS TEXT) = CAST(b.actividad_id AS TEXT)
                    AND (CAST(pa.pau_id AS TEXT) = CAST($2 AS TEXT) OR CAST(pa.pau_id AS TEXT) = CAST($3 AS TEXT))
                ), 0
              ) AS cantidad_asignada,

              -- Cantidad Ejecutada
              COALESCE(
                (
                  SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC)) 
                  FROM registros_avance ra 
                  WHERE CAST(ra.actividad_id AS TEXT) = CAST(b.actividad_id AS TEXT)
                    AND (CAST(ra.pau_id AS TEXT) = CAST($2 AS TEXT) OR CAST(ra.pau_id AS TEXT) = CAST($3 AS TEXT))
                ), 0
              ) AS cantidad_ejecutada,

              -- Precio Unitario ($)
              COALESCE(
                (
                  SELECT pa_precio.precio_unitario 
                  FROM precios_actividades pa_precio 
                  WHERE CAST(pa_precio.actividad_id AS TEXT) = CAST(b.actividad_id AS TEXT) 
                    AND CAST(pa_precio.proyecto_id AS TEXT) = CAST($1 AS TEXT)
                  LIMIT 1
                ),
                (
                  SELECT pa_precio.precio_unitario 
                  FROM precios_actividades pa_precio 
                  WHERE CAST(pa_precio.actividad_id AS TEXT) = CAST(b.actividad_id AS TEXT)
                  LIMIT 1
                ),
                0
              ) AS precio_unitario
            FROM base_actividades b
          )
          SELECT 
            actividad_id,
            descripcion,
            cantidad_asignada,
            cantidad_ejecutada,
            GREATEST(cantidad_asignada - cantidad_ejecutada, 0) AS cantidad_pendiente,
            precio_unitario,
            (cantidad_ejecutada * precio_unitario) AS subtotal_ejecutado,
            (GREATEST(cantidad_asignada - cantidad_ejecutada, 0) * precio_unitario) AS subtotal_pendiente
          FROM actividades_calculadas;
        `;

        const resAct = await db.query(queryActividadesBD, [id, row.pau_id, row.codigo]);

        let costoTotalEjecutado = 0;
        let costoTotalPendiente = 0;

        const actividades = resAct.rows.map((a) => {
          const subEjec = parseFloat(a.subtotal_ejecutado || 0);
          const subPend = parseFloat(a.subtotal_pendiente || 0);

          costoTotalEjecutado += subEjec;
          costoTotalPendiente += subPend;

          return {
            actividad_id: a.actividad_id,
            descripcion: a.descripcion,
            cantidad_asignada: parseFloat(a.cantidad_asignada || 0),
            cantidad_ejecutada: parseFloat(a.cantidad_ejecutada || 0),
            cantidad_pendiente: parseFloat(a.cantidad_pendiente || 0),
            precio_unitario: parseFloat(a.precio_unitario || 0),
            subtotal: subEjec,
            subtotal_pendiente: subPend
          };
        });

        return {
          pau_id: row.pau_id,
          departamento: row.departamento,
          codigo: row.codigo,
          costo_total: costoTotalEjecutado,
          costo_total_pendiente: costoTotalPendiente,
          actividades
        };
      })
    );

    res.json(resumenPaus);
  } catch (err) {
    console.error('Error al obtener detalle de PAUs por edificio:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /proyectos - Crear nuevo proyecto
router.post('/proyectos', async (req, res, next) => {
  const { nombre, presupuesto_total } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO proyectos (nombre, presupuesto_total) VALUES ($1, $2) RETURNING *',
      [nombre, presupuesto_total || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /proyectos/:id - Actualizar proyecto existente
router.put('/proyectos/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre, presupuesto_total } = req.body;
  try {
    await db.query(
      'UPDATE proyectos SET nombre = $1, presupuesto_total = $2 WHERE id = $3',
      [nombre, presupuesto_total || 0, id]
    );
    res.json({ mensaje: 'Proyecto actualizado correctamente' });
  } catch (err) {
    next(err);
  }
});

// DELETE /proyectos/:id - Eliminar proyecto
router.delete('/proyectos/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM proyectos WHERE id = $1', [id]);
    res.json({ mensaje: 'Proyecto eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;