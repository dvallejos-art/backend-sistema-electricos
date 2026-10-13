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

async function simularTrabajoTecnico() {
  try {
    // 1. Login del Técnico
    console.log('1. Autenticando técnico...');
    const login = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { cedula: '1234567890' });

    const token = login.token;
    console.log('✓ Login exitoso. Técnico:', login.usuario.nombre_completo);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 2. Registrar avance diario (Ejemplo: Instaló 3 postes de los 10 presupuestados)
    console.log('\n2. Registrando avance en campo (3 postes)...');
    const avance = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/avances', method: 'POST',
      headers: authHeaders
    }, {
      pau_id: 1,
      actividad_id: 1,
      cantidad_ejecutada: 3,
      observaciones: 'Instalados postes 1, 2 y 3 sin novedades.'
    });
    console.log('✓ Respuesta:', avance.mensaje);

    // 3. Consultar Resumen de Avance vs Presupuesto del PAU
    console.log('\n3. Consultando reporte de avance del PAU-001...');
    const resumen = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/pau/1/resumen-avance', method: 'GET',
      headers: authHeaders
    });

    console.log('\n--- RESUMEN DE AVANCE DE OBRA ---');
    console.table(resumen);

  } catch (error) {
    console.error('Error en simulación:', error.message);
  }
}

simularTrabajoTecnico();