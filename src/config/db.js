const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'ingresos_db',
  password: 'admin1234',
  port: 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error al conectar:', err.message);
  }
  console.log('¡Conexión exitosa a la base de datos PostgreSQL (ingresos_db)!');
  release();
});

module.exports = pool;