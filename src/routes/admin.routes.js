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
const obtenerProyectosResiliente = async (req, res, next) => {
  try {
    const queryResiliente = `
      SELECT 
        p.id, 
        p.nombre, 
        CAST(COALESCE(p.presupuesto_total, 0) AS NUMERIC) AS presupuesto_total,
        
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
                0
              )
            )
            FROM registros_avance ra
            JOIN pau_actividades pa_act ON CAST(pa_act.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
            JOIN paus pau ON (
              CAST(pau.id AS TEXT) = CAST(pa_act.pau_id AS TEXT) 
              OR CAST(pau.codigo AS TEXT) = CAST(pa_act.pau_id AS TEXT)
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
};

router.get('/proyectos', obtenerProyectosResiliente);

// GET /proyectos/:id/detalle-paus - UNIFICA ETAPAS COMPLEMENTARIAS
const obtenerDetallePausHandler = async (req, res, next) => {
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
        const queryAsignacionesBD = `
          SELECT 
            pa.id AS asignacion_id,
            pa.actividad_id,
            COALESCE(ac.descripcion, CONCAT('Rubro / Actividad #', pa.actividad_id)) AS descripcion_base,
            CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cant_asig_bruta,
            pa.observaciones,
            
            CASE 
              WHEN pa.observaciones ~ '[0-9]+%' THEN 
                CAST(SUBSTRING(pa.observaciones FROM '([0-9]+)%') AS NUMERIC)
              ELSE 100.0
            END AS pct_etapa,

            COALESCE(
              (
                SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC)) 
                FROM registros_avance ra 
                WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
              ), 0
            ) AS cant_ejec_bruta,

            COALESCE(
              (
                SELECT pa_precio.precio_unitario 
                FROM precios_actividades pa_precio 
                WHERE CAST(pa_precio.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT) 
                  AND CAST(pa_precio.proyecto_id AS TEXT) = CAST($1 AS TEXT)
                LIMIT 1
              ), 0
            ) AS precio_unitario

          FROM pau_actividades pa
          LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
          WHERE CAST(pa.pau_id AS TEXT) = CAST($2 AS TEXT) 
             OR CAST(pa.pau_id AS TEXT) = CAST($3 AS TEXT)
          ORDER BY ac.descripcion ASC, pa.id ASC;
        `;

        const resAct = await db.query(queryAsignacionesBD, [id, row.pau_id, row.codigo]);

        const gruposPorActividad = {};

        resAct.rows.forEach((a) => {
          const actId = a.actividad_id;
          if (!gruposPorActividad[actId]) {
            gruposPorActividad[actId] = {
              actividad_id: actId,
              descripcion_base: a.descripcion_base,
              precio_unitario: parseFloat(a.precio_unitario || 0),
              asignaciones: []
            };
          }

          const cantAsig = parseFloat(a.cant_asig_bruta || 0);
          const cantEjecBruta = parseFloat(a.cant_ejec_bruta || 0);
          const pctEtapa = parseFloat(a.pct_etapa || 100);

          const limiteFisicoEtapa = cantAsig * (pctEtapa / 100.0);
          const cantEjecFisica = Math.min(cantEjecBruta, limiteFisicoEtapa);

          gruposPorActividad[actId].asignaciones.push({
            asignacion_id: a.asignacion_id,
            cantAsig,
            cantEjecFisica,
            limiteFisicoEtapa,
            pctEtapa
          });
        });

        let costoTotalEjecutado = 0;
        let costoTotalPendiente = 0;
        const listaActividadesFinal = [];

        Object.values(gruposPorActividad).forEach((grupo) => {
          const precio = grupo.precio_unitario;

          let cantFisicaConsolidada = 0;
          const asignacionesEnProceso = [];

          let acumuladorParcial = 0;
          let loteTemporal = [];

          grupo.asignaciones.forEach((item) => {
            acumuladorParcial += item.cantEjecFisica;
            loteTemporal.push(item);

            if (Math.abs(acumuladorParcial - Math.round(acumuladorParcial)) < 0.001 && acumuladorParcial > 0) {
              cantFisicaConsolidada += acumuladorParcial;
              acumuladorParcial = 0;
              loteTemporal = [];
            }
          });

          if (loteTemporal.length > 0) {
            loteTemporal.forEach((resto) => asignacionesEnProceso.push(resto));
          }

          if (cantFisicaConsolidada > 0) {
            const subEjecComp = cantFisicaConsolidada * precio;
            costoTotalEjecutado += subEjecComp;

            listaActividadesFinal.push({
              actividad_id: `${grupo.actividad_id}_completado`,
              descripcion: grupo.descripcion_base,
              cantidad_asignada: cantFisicaConsolidada,
              cantidad_ejecutada: cantFisicaConsolidada,
              cantidad_pendiente: 0,
              precio_unitario: precio,
              subtotal: subEjecComp,
              subtotal_ejecutado: subEjecComp,
              subtotal_pendiente: 0
            });
          }

          asignacionesEnProceso.forEach((p) => {
            const subEjecPend = p.cantEjecFisica * precio;
            const subPend = (p.cantAsig * ((100 - p.pctEtapa) / 100.0)) * precio;

            costoTotalEjecutado += subEjecPend;
            costoTotalPendiente += subPend;

            let desc = grupo.descripcion_base;
            if (p.pctEtapa < 100) {
              desc += ` [${p.pctEtapa.toFixed(0)}% Etapa]`;
            }

            listaActividadesFinal.push({
              actividad_id: `${grupo.actividad_id}_asig_${p.asignacion_id}`,
              descripcion: desc,
              cantidad_asignada: p.cantAsig,
              cantidad_ejecutada: p.cantEjecFisica,
              cantidad_pendiente: p.cantAsig * ((100 - p.pctEtapa) / 100.0),
              precio_unitario: precio,
              subtotal: subEjecPend,
              subtotal_ejecutado: subEjecPend,
              subtotal_pendiente: subPend
            });
          });
        });

        return {
          pau_id: row.pau_id,
          departamento: row.departamento,
          dpto: row.departamento,
          codigo: row.codigo,
          costo_total: costoTotalEjecutado,
          costo_acumulado: costoTotalEjecutado,
          costo_total_pendiente: costoTotalPendiente,
          actividades: listaActividadesFinal
        };
      })
    );

    res.json(resumenPaus);
  } catch (err) {
    console.error('Error al obtener detalle de PAUs por edificio:', err);
    res.status(500).json({ error: err.message });
  }
};

router.get('/proyectos/:id/detalle-paus', obtenerDetallePausHandler);

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

// ==========================================
// ALIAS DE LECTURA PARA EL PORTAL CLIENTE
// ==========================================
router.get('/resumen-edificios', obtenerProyectosResiliente);
router.get('/resumen-departamentos/:id', obtenerDetallePausHandler);
router.get('/edificios/:id/departamentos', obtenerDetallePausHandler);

module.exports = router;

// GET /matriz-pisos/:id - Genera la estructura matricial agrupada por pisos/niveles
router.get('/matriz-pisos/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    // 1. Obtener todos los PAUs del proyecto con sus avances calculados
    const query = `
      WITH datos_pau AS (
        SELECT 
          p.id AS pau_id,
          p.codigo,
          COALESCE(p.nombre, p.codigo) AS departamento,
          
          -- Cálculo de avance acumulado en dinero
          COALESCE(
            (
              SELECT SUM(
                CAST(ra.cantidad_ejecutada AS NUMERIC) * COALESCE(pa_precio.precio_unitario, 0)
              )
              FROM registros_avance ra
              JOIN pau_actividades pa_act ON CAST(pa_act.id AS TEXT) = CAST(ra.pau_actividad_id AS TEXT)
              LEFT JOIN precios_actividades pa_precio 
                ON CAST(pa_precio.actividad_id AS TEXT) = CAST(pa_act.actividad_id AS TEXT)
               AND CAST(pa_precio.proyecto_id AS TEXT) = CAST($1 AS TEXT)
              WHERE CAST(pa_act.pau_id AS TEXT) = CAST(p.id AS TEXT)
            ), 0
          ) AS ejec_dinero,

          -- Cálculo de presupuesto base del departamento
          COALESCE(
            (
              SELECT SUM(
                CAST(pa_act.cantidad_presupuestada AS NUMERIC) * COALESCE(pa_precio.precio_unitario, 0)
              )
              FROM pau_actividades pa_act
              LEFT JOIN precios_actividades pa_precio 
                ON CAST(pa_precio.actividad_id AS TEXT) = CAST(pa_act.actividad_id AS TEXT)
               AND CAST(pa_precio.proyecto_id AS TEXT) = CAST($1 AS TEXT)
              WHERE CAST(pa_act.pau_id AS TEXT) = CAST(p.id AS TEXT)
            ), 0
          ) AS pres_dinero

        FROM paus p
        WHERE CAST(p.proyecto_id AS TEXT) = CAST($1 AS TEXT)
      )
      SELECT 
        pau_id,
        codigo,
        departamento,
        ejec_dinero,
        pres_dinero,
        CASE 
          WHEN pres_dinero > 0 THEN ROUND((ejec_dinero / pres_dinero) * 100, 1)
          ELSE 0.0
        END AS porcentaje_avance
      FROM datos_pau
      ORDER BY codigo ASC;
    `;

    const result = await db.query(query, [id]);

    // 2. Agrupación por Pisos/Niveles
    const nivelesMap = {};

    result.rows.forEach((item) => {
      const dpto = String(item.departamento || item.codigo).trim();
      let pisoEtiqueta = 'Otros';

      // Detectar Subsuelos (ej: S01, S02, S1, SUB1)
      if (/^S/i.test(dpto)) {
        const num = dpto.match(/\d+/);
        pisoEtiqueta = num ? `Subsuelo S${num[0]}` : 'Subsuelos';
      } 
      // Detectar Planta Baja (PB)
      else if (/^PB/i.test(dpto)) {
        pisoEtiqueta = 'Planta Baja (PB)';
      } 
      // Detectar por dígitos numéricos (ej: 101 -> Piso 1, 202 -> Piso 2, 1001 -> Piso 10)
      else if (/^\d+$/.test(dpto)) {
        if (dpto.length === 3) {
          pisoEtiqueta = `Piso ${dpto.substring(0, 1)}`;
        } else if (dpto.length >= 4) {
          pisoEtiqueta = `Piso ${dpto.substring(0, dpto.length - 2)}`;
        } else {
          pisoEtiqueta = 'Piso 1';
        }
      }

      if (!nivelesMap[pisoEtiqueta]) {
        nivelesMap[pisoEtiqueta] = [];
      }

      nivelesMap[pisoEtiqueta].push({
        pau_id: item.pau_id,
        departamento: dpto,
        porcentaje_avance: parseFloat(item.porcentaje_avance || 0),
        ejecutado: parseFloat(item.ejec_dinero || 0),
        presupuesto: parseFloat(item.pres_dinero || 0)
      });
    });

    res.json(nivelesMap);
  } catch (err) {
    console.error('Error en GET /matriz-pisos:', err);
    res.status(500).json({ error: err.message });
  }
});