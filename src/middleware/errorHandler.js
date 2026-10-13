// src/middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
  console.error('🔥 [ERROR CENTRALIZADO]:', err);

  // 1. Manejo de Errores Específicos de PostgreSQL (pg)
  if (err.code) {
    switch (err.code) {
      case '23505': // Violación de restricción UNIQUE (clave duplicada)
        return res.status(409).json({
          error: 'Conflicto de duplicidad',
          detalle: 'El registro ya existe en la base de datos (clave duplicada).'
        });
      case '23503': // Violación de Clave Foránea (Foreign Key)
        return res.status(400).json({
          error: 'Referencia inválida',
          detalle: 'El registro relacionado (PAU, usuario o actividad) no existe.'
        });
      case '22P02': // Sintaxis de entrada no válida (ej. enviar texto en campo INT)
        return res.status(400).json({
          error: 'Formato de datos inválido',
          detalle: 'Se esperaba un tipo de dato diferente en los parámetros.'
        });
      case '42703': // Columna no existente
        return res.status(500).json({
          error: 'Error de estructura',
          detalle: 'Consulta a columna inexistente en la base de datos.'
        });
    }
  }

  // 2. Manejo de Errores Personalizados de Aplicación (status explícito)
  const statusCode = err.status || err.statusCode || 500;
  
  return res.status(statusCode).json({
    error: err.name || 'Error del Servidor',
    mensaje: err.message || 'Ocurrió un error interno en el servidor.'
  });
};

module.exports = errorHandler;