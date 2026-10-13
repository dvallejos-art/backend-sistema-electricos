// src/routes/supervisor.routes.js
const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisor.controller');

// 1. Obtener lista de proyectos
router.get('/proyectos', supervisorController.obtenerProyectos);

// 2. Obtener lista de técnicos
router.get('/tecnicos', supervisorController.obtenerTecnicos);

// 3. Obtener PAUs de un proyecto por ID
router.get('/proyectos/:idProyecto/paus', supervisorController.obtenerPausPorProyecto);

// 4. Crear o devolver PAU existente
router.post('/paus', supervisorController.crearODevolverPau);

// 5. Obtener actividades por nombre de edificio
router.get('/proyectos/edificio/:edificio/actividades', supervisorController.obtenerActividadesPorEdificio);

// 6. Catálogo general de actividades
router.get('/actividades', supervisorController.obtenerActividades);

// 7. Resumen de asignaciones
router.get('/asignaciones', supervisorController.obtenerAsignaciones);

// 8. Registrar asignación/avance a técnico
router.post('/asignar', supervisorController.registrarAvance);

// ✏️ 9. Editar asignación existente
router.put('/asignaciones/:id', supervisorController.editarAsignacion);

// 🗑️ 10. Eliminar asignación por ID
router.delete('/asignaciones/:id', supervisorController.eliminarAsignacion);

module.exports = router;