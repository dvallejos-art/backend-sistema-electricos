// src/middleware/auth.js
const jwt = require('jsonwebtoken');

// Usar exactamente la misma clave secreta
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_123';

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  // Extraer token quitando el prefijo 'Bearer '
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Formato de token inválido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    console.error('Error al verificar JWT:', error.message);
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = { verificarToken };