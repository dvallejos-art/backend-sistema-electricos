// src/routes/reportes.routes.js
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const authMiddleware = require('../middleware/auth');

// Extraer la función independientemente de si auth.js la exporta como objeto o directa
const verificarToken = typeof authMiddleware === 'function' ? authMiddleware : authMiddleware.verificarToken;

// Aplicar el middleware de autenticación a todas las rutas de reportes
if (typeof verificarToken === 'function') {
  router.use(verificarToken);
}

// Fallbacks seguros por resguardo
const obtenerReporte = reportesController?.obtenerReporteAsignaciones || ((req, res) => res.status(500).json({ error: 'Controlador obtenerReporteAsignaciones no definido' }));
const exportarExcel = reportesController?.exportarExcel || ((req, res) => res.status(500).json({ error: 'Controlador exportarExcel no definido' }));
const getResumen = reportesController?.getResumenAvancePAU || ((req, res) => res.json({ mensaje: 'Resumen PAU' }));
const getHistorial = reportesController?.getHistorialPorTecnico || ((req, res) => res.json({ mensaje: 'Historial' }));

// 1. Ruta principal para filtrado dinámico (Edificio, Depto, Fechas, Técnico, Estado)
router.get('/filtrar', obtenerReporte);

// 2. Ruta para exportación a Excel / CSV
router.get('/exportar-excel', exportarExcel);

// 3. Rutas auxiliares de resumen e historial
router.get('/pau/:pau_id/resumen-avance', getResumen);
router.get('/tecnico/:empleado_id/historial', getHistorial);

module.exports = router;