// src/routes/reportes.routes.js
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const authMiddleware = require('../middleware/auth');

// Extraer la función independientemente de si auth.js la exporta como objeto o directa
const verificarToken = typeof authMiddleware === 'function' ? authMiddleware : authMiddleware.verificarToken;

// Aplicar el middleware a todas las rutas
if (typeof verificarToken === 'function') {
  router.use(verificarToken);
}

// Handlers con fallback seguro para evitar crash si la función del controlador aún no está definida
const getResumen = reportesController?.getResumenAvancePAU || ((req, res) => res.json({ mensaje: 'Resumen PAU' }));
const getHistorial = reportesController?.getHistorialPorTecnico || ((req, res) => res.json({ mensaje: 'Historial' }));

// Definición limpia de rutas
router.get('/pau/:pau_id/resumen-avance', getResumen);
router.get('/tecnico/:empleado_id/historial', getHistorial);

module.exports = router;