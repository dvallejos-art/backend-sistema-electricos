// src/routes/supervisor.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Importado para ejecutar la limpieza masiva en BD
const supervisorController = require('../controllers/supervisor.controller');

// 🔒 Middleware para verificar autenticación y token JWT (DEBE IR ANTES DE USARSE)
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

// 1. Obtener lista de proyectos
if (typeof supervisorController.obtenerProyectos === 'function') {
  router.get('/proyectos', verificarAuth, supervisorController.obtenerProyectos);
}

// 2. Obtener lista de técnicos
if (typeof supervisorController.obtenerTecnicos === 'function') {
  router.get('/tecnicos', verificarAuth, supervisorController.obtenerTecnicos);
}

// 3. Obtener PAUs de un proyecto por ID
if (typeof supervisorController.obtenerPausPorProyecto === 'function') {
  router.get('/proyectos/:idProyecto/paus', verificarAuth, supervisorController.obtenerPausPorProyecto);
}

// 4. Crear o devolver PAU existente
if (typeof supervisorController.crearODevolverPau === 'function') {
  router.post('/paus', verificarAuth, supervisorController.crearODevolverPau);
}

// 5. Obtener actividades por nombre de edificio
if (typeof supervisorController.obtenerActividadesPorEdificio === 'function') {
  router.get('/proyectos/edificio/:edificio/actividades', verificarAuth, supervisorController.obtenerActividadesPorEdificio);
}

// 6. Catálogo general de actividades
if (typeof supervisorController.obtenerActividades === 'function') {
  router.get('/actividades', verificarAuth, supervisorController.obtenerActividades);
}

// 7. Resumen de asignaciones
if (typeof supervisorController.obtenerAsignaciones === 'function') {
  router.get('/asignaciones', verificarAuth, supervisorController.obtenerAsignaciones);
}

// 8. Crear nueva asignación individual
const handlerAsignar = supervisorController.asignarTrabajo || supervisorController.registrarAvance;
if (typeof handlerAsignar === 'function') {
  router.post('/asignar', verificarAuth, handlerAsignar);
}

// 8b. Nueva asignación masiva multi-rubro (Carrito por departamento)
if (typeof supervisorController.asignarTrabajoMasivo === 'function') {
  router.post('/asignar-masivo', verificarAuth, supervisorController.asignarTrabajoMasivo);
}

// 🛠️ 8c. Actividades Provisionales / Adicionales
if (typeof supervisorController.crearActividadProvisional === 'function') {
  router.post('/provisionales', verificarAuth, supervisorController.crearActividadProvisional);
}

if (typeof supervisorController.obtenerActividadesProvisionales === 'function') {
  router.get('/provisionales', verificarAuth, supervisorController.obtenerActividadesProvisionales);
}

// 9. Editar asignación existente
if (typeof supervisorController.editarAsignacion === 'function') {
  router.put('/asignaciones/:id', verificarAuth, supervisorController.editarAsignacion);
}

// 10. Eliminar asignación por ID
if (typeof supervisorController.eliminarAsignacion === 'function') {
  router.delete('/asignaciones/:id', verificarAuth, supervisorController.eliminarAsignacion);
}

// 🗑️ 10b. VACIAR TODAS LAS ASIGNACIONES (EXCLUSIVO SUPER ADMINISTRADOR)
router.delete('/asignaciones-vaciar-todo', verificarAuth, async (req, res) => {
  try {
    const usuario = req.user || req.usuario || {};
    const rol = String(usuario.rol || '').toUpperCase().trim();
    const nombre = String(usuario.nombre || '').toLowerCase().trim();

    // Validación estricta de Super Administrador
    const esSuperAdmin = rol === 'SUPERADMIN' || rol === 'SUPER_ADMIN' || rol === 'ADMIN' || nombre === 'admin';

    if (!esSuperAdmin) {
      return res.status(403).json({
        error: 'Acceso denegado: Esta acción es exclusiva del Super Administrador.'
      });
    }

    // Ejecutamos limpieza en orden para respetar llaves foráneas (Foreign Keys)
    await pool.query('BEGIN');
    await pool.query('DELETE FROM registros_avance');
    await pool.query('DELETE FROM pau_actividades_cuadrilla');
    await pool.query('DELETE FROM pau_actividades');
    await pool.query('COMMIT');

    res.json({ mensaje: 'Todas las asignaciones y avances han sido eliminados. Sistema listo desde cero.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error al vaciar asignaciones:', err);
    res.status(500).json({ error: 'No se pudo realizar el borrado masivo: ' + err.message });
  }
});

// 11. Rutas de Presupuesto x Departamento y Matriz de Avance
if (typeof supervisorController.obtenerPresupuestoYSaldosDpto === 'function') {
  router.get('/paus/:pauId/presupuesto-saldos', verificarAuth, supervisorController.obtenerPresupuestoYSaldosDpto);
}

if (typeof supervisorController.guardarPresupuestoDpto === 'function') {
  router.post('/presupuesto-dpto', verificarAuth, supervisorController.guardarPresupuestoDpto);
}

if (typeof supervisorController.obtenerAvanceMatrizPisos === 'function') {
  router.get('/proyectos/:proyectoId/matriz-avance', verificarAuth, supervisorController.obtenerAvanceMatrizPisos);
}

// ⚠️ El module.exports SIEMPRE debe ser la ÚLTIMA línea del archivo
module.exports = router;