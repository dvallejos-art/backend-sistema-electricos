// index.js (Ubicado en C:\Users\ACER PREDATOR\Desktop\ingresos-backend\index.js)
const express = require('express');
const cors = require('cors');

// Importar rutas desde la carpeta /src
const authRoutes = require('./src/routes/auth.routes');
const supervisorRoutes = require('./src/routes/supervisor.routes');
const tecnicoRoutes = require('./src/routes/tecnico.routes');
const reportesRoutes = require('./src/routes/reportes.routes');
const adminRoutes = require('./src/routes/admin.routes');

// Importar middleware centralizado de errores
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Middlewares globales con CORS habilitado
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('API de Control de Obra y Avance de Técnicos activa (Arquitectura MVC)');
});

// Definición de Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/tecnico', tecnicoRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/admin', adminRoutes);

// Manejo de rutas inexistentes (404)
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    mensaje: `La ruta '${req.originalUrl}' no existe en este servidor.`
  });
});

// Middleware Centralizado de Errores
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo bajo arquitectura MVC en el puerto ${PORT}`);
});