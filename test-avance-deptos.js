const http = require('http');

function hacerPeticion(options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', err => reject(err));
    if (bodyData) req.write(JSON.stringify(bodyData));
    req.end();
  });
}

async function probarAvanceDepartamentos() {
  try {
    // 1. Login del Técnico
    const login = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { cedula: '1234567890' });

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${login.token}`
    };

    // 2. Técnico registra 5 puntos de iluminación instalados en el Depto 201 (id PAU: 2)
    console.log('1. Técnico reportando 5 puntos instalados en Depto 201...');
    await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/avances', method: 'POST',
      headers: authHeaders
    }, {
      pau_id: 2,
      actividad_id: 1,
      cantidad_ejecutada: 5,
      observaciones: 'Instalación en recámara principal y cocina'
    });

    // 3. Consultar reporte del Depto 201
    console.log('\n2. Consultando estado de avance del Depto 201...');
    const reporte201 = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/pau/2/resumen-avance', method: 'GET',
      headers: authHeaders
    });

    console.log('\n--- RESUMEN DEPTO 201 ---');
    console.table(reporte201);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

probarAvanceDepartamentos();