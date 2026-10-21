//src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Clave secreta unificada
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_123';

exports.login = async (req, res) => {
  const emailIngresado = req.body.correo || req.body.email;
  const { password } = req.body;

  if (!emailIngresado || !password) {
    return res.status(400).json({ mensaje: 'Correo y contraseña son requeridos' });
  }

  try {
    const correoLimpio = String(emailIngresado).trim().toLowerCase();

    // 1. Buscar credenciales en la columna 'email' de la tabla 'usuarios'
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [correoLimpio]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const usuario = result.rows[0];

    // 2. Verificar si el usuario está activo (si la columna existe)
    if (usuario.estado === false) {
      return res.status(403).json({ mensaje: 'Usuario inactivo. Contacte al administrador.' });
    }

    // 3. Obtener el hash o contraseña guardada
    const hashGuardado = usuario.password_hash || usuario.password;

    if (!hashGuardado) {
      return res.status(401).json({ mensaje: 'Error de autenticación. Sin clave registrada.' });
    }

    // Comparar clave con bcrypt o texto plano de respaldo
    let match = false;
    try {
      match = await bcrypt.compare(password, hashGuardado);
    } catch (bErr) {
      match = false;
    }

    // Fallback por si la contraseña antigua en la BD estuviera en texto plano
    if (!match && password === hashGuardado) {
      match = true;
    }

    if (!match) {
      return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
    }

    // 4. Normalizar rol a minúsculas
    const rolNormalizado = usuario.rol ? String(usuario.rol).trim().toLowerCase() : 'tecnico';

    // 5. Generar Token JWT (INCLUYENDO edificio_id)
    const token = jwt.sign(
      { 
        id: usuario.id, 
        rol: rolNormalizado, 
        email: usuario.email,
        edificio_id: usuario.edificio_id // 👈 INCLUIDO EN TOKEN
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 6. Devolver respuesta con edificio_id
    res.json({
      mensaje: 'Autenticación exitosa',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        correo: usuario.email,
        rol: rolNormalizado,
        edificio_id: usuario.edificio_id // 👈 AQUÍ SE RETORNA AL FRONTEND
      }
    });

  } catch (err) {
    console.error('Error en controller de login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};