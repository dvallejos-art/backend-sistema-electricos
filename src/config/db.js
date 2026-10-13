const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:admin1234@127.0.0.1:5432/ingresos_db',
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error al conectar:', err.message);
  }
  console.log('¡Conexión exitosa a la base de datos PostgreSQL!');
  release();
});

module.exports = pool;