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

async function simularSistema() {
  try {
    // Login
    const login = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { cedula: '1234567890' });

    const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${login.token}` };

    // 1. SUPERVISOR: Consulta los ítems disponibles en la base de datos
    console.log('--- 1. ROL SUPERVISOR ---');
    const itemsExistentes = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/supervisor/catalogo-items', method: 'GET',
      headers: authHeaders
    });
    console.log('Ítems obtenidos automáticamente de la BD:', itemsExistentes.length);

    // 2. SUPERVISOR: Crea el Depto "502" y le asigna metas a los 2 primeros ítems
    const cargaSupervisor = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/supervisor/asignar-metas-departamento', method: 'POST',
      headers: authHeaders
    }, {
      numero_departamento: '502',
      items_metas: [
        { actividad_id: itemsExistentes[0].actividad_id, cantidad_meta: 30 },
        { actividad_id: itemsExistentes[1].actividad_id, cantidad_meta: 12 }
      ]
    });
    console.log('✓', cargaSupervisor.mensaje);

    // 3. TÉCNICO: Abre el Depto 502 y solo ve los ítems configurados y sus metas
    console.log('\n--- 2. ROL TÉCNICO (Vista de consulta) ---');
    const vistaTecnico = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: `/api/pau/${cargaSupervisor.pau_id}/actividades`, method: 'GET',
      headers: authHeaders
    });
    console.table(vistaTecnico);

    // 4. TÉCNICO: Ingresa únicamente la cantidad realizada hoy (ej: 8 unidades)
    console.log('\n--- 3. TÉCNICO REGISTRA TRABAJO REALIZADO ---');
    const registroTecnico = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/avances', method: 'POST',
      headers: authHeaders
    }, {
      pau_id: cargaSupervisor.pau_id,
      actividad_id: itemsExistentes[0].actividad_id,
      cantidad_ejecutada: 8,
      observaciones: 'Instalación completada turno mañana'
    });
    console.log('✓', registroTecnico.mensaje);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

simularSistema();