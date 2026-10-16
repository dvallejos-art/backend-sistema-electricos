// src/routes/supervisor.routes.js
const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisor.controller');

// 1. Obtener lista de proyectos
if (typeof supervisorController.obtenerProyectos === 'function') {
  router.get('/proyectos', supervisorController.obtenerProyectos);
}

// 2. Obtener lista de técnicos
if (typeof supervisorController.obtenerTecnicos === 'function') {
  router.get('/tecnicos', supervisorController.obtenerTecnicos);
}

// 3. Obtener PAUs de un proyecto por ID
if (typeof supervisorController.obtenerPausPorProyecto === 'function') {
  router.get('/proyectos/:idProyecto/paus', supervisorController.obtenerPausPorProyecto);
}

// 4. Crear o devolver PAU existente
if (typeof supervisorController.crearODevolverPau === 'function') {
  router.post('/paus', supervisorController.crearODevolverPau);
}

// 5. Obtener actividades por nombre de edificio
if (typeof supervisorController.obtenerActividadesPorEdificio === 'function') {
  router.get('/proyectos/edificio/:edificio/actividades', supervisorController.obtenerActividadesPorEdificio);
}

// 6. Catálogo general de actividades
if (typeof supervisorController.obtenerActividades === 'function') {
  router.get('/actividades', supervisorController.obtenerActividades);
}

// 7. Resumen de asignaciones
router.get('/asignaciones', supervisorController.obtenerAsignaciones);

// 8. Crear nueva asignación a técnico (Mapea asignarTrabajo o registrarAvance de forma segura)
const handlerAsignar = supervisorController.asignarTrabajo || supervisorController.registrarAvance;
router.post('/asignar', handlerAsignar);

// ✏️ 9. Editar asignación existente
router.put('/asignaciones/:id', supervisorController.editarAsignacion);

// 🗑️ 10. Eliminar asignación por ID
router.delete('/asignaciones/:id', supervisorController.eliminarAsignacion);

module.exports = router;