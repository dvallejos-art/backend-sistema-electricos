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

async function probarFlujoAdmin() {
  try {
    // 1. Login del Admin
    console.log('1. Autenticando Administrador...');
    const login = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { cedula: '1234567890' });

    const token = login.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 2. Admin crea una nueva actividad maestra en el catálogo
    console.log('\n2. Creando nueva actividad en el catálogo maestro...');
    const nuevaActividad = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/actividades', method: 'POST',
      headers: authHeaders
    }, {
      codigo_item: 'ITEM-04',
      descripcion: 'Hincado de Estructura de Salida 13.2kV',
      unidad_medida: 'unidad'
    });
    console.log('✓ Actividad creada:', nuevaActividad.actividad);

    // 3. Admin asigna la nueva actividad al PAU-001 con una meta de 5 unidades
    console.log('\n3. Asignando meta al PAU-001 (5 unidades)...');
    const asignacion = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/pau/asignar-actividad', method: 'POST',
      headers: authHeaders
    }, {
      pau_id: 1,
      actividad_id: nuevaActividad.actividad.id,
      cantidad_presupuestada: 5.00
    });
    console.log('✓ Presupuesto asignado exitosamente.');

    // 4. Verificación: Consultar la lista que verá el técnico para el PAU-001
    console.log('\n4. Consultando lista de actividades disponibles para el Técnico en PAU-001...');
    const actividadesTecnico = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/pau/1/actividades', method: 'GET',
      headers: authHeaders
    });

    console.log('\n--- CATÁLOGO DISPONIBLE EN CAMPO PARA PAU-001 ---');
    console.table(actividadesTecnico);

  } catch (error) {
    console.error('Error en prueba de administración:', error.message);
  }
}

probarFlujoAdmin();