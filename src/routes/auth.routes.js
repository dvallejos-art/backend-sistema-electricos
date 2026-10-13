// src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validarCampos = require('../middleware/validator');

router.post('/login', [
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.correo) {
      throw new Error('Debe proporcionar un correo electrónico');
    }
    return true;
  }),
  body('password').notEmpty().withMessage('La contraseña es obligatoria'),
  validarCampos
], authController.login);

module.exports = router;