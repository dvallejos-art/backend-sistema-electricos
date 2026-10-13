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

async function simularSupervisor() {
  try {
    const login = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { cedula: '1234567890' });

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${login.token}`
    };

    console.log('1. Supervisor registrando Depto 201...');
    const depto201 = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/supervisor/departamentos-metas', method: 'POST',
      headers: authHeaders
    }, {
      codigo_departamento: 'DEP-201',
      nombre_departamento: 'Departamento 201',
      ubicacion: 'Piso 2 - Torre A',
      actividades: [
        { actividad_id: 1, meta: 20 },
        { actividad_id: 2, meta: 15 }
      ]
    });
    console.log('✓', depto201.mensaje);

    console.log('\n2. Supervisor registrando Depto 293...');
    const depto293 = await hacerPeticion({
      hostname: '127.0.0.1', port: 3000, path: '/api/supervisor/departamentos-metas', method: 'POST',
      headers: authHeaders
    }, {
      codigo_departamento: 'DEP-293',
      nombre_departamento: 'Departamento 293',
      ubicacion: 'Piso 9 - Torre B',
      actividades: [
        { actividad_id: 1, meta: 10 },
        { actividad_id: 2, meta: 8 }
      ]
    });
    console.log('✓', depto293.mensaje);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

simularSupervisor();