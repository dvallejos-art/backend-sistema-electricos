// src/routes/supervisor.routes.js
const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisor.controller');

// Middleware para verificar autenticación y token JWT
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
router.get('/asignaciones', verificarAuth, supervisorController.obtenerAsignaciones);

// 8. Crear nueva asignación individual
const handlerAsignar = supervisorController.asignarTrabajo || supervisorController.registrarAvance;
router.post('/asignar', verificarAuth, handlerAsignar);

// 🚀 8b. Nueva asignación masiva multi-rubro (Carrito por departamento)
if (typeof supervisorController.asignarTrabajoMasivo === 'function') {
  router.post('/asignar-masivo', verificarAuth, supervisorController.asignarTrabajoMasivo);
}

// ✏️ 9. Editar asignación existente
router.put('/asignaciones/:id', verificarAuth, supervisorController.editarAsignacion);

// 🗑️ 10. Eliminar asignación por ID
router.delete('/asignaciones/:id', verificarAuth, supervisorController.eliminarAsignacion);

module.exports = router;