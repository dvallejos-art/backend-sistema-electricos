const http = require('http');

function hacerPeticion(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', err => reject(err));
    req.end();
  });
}

async function probarFiltroFechas() {
  try {
    // 1. Autenticación
    const loginReq = http.request({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        const login = JSON.parse(data);
        const empleadoId = login.usuario.id;
        const authHeaders = { 'Authorization': `Bearer ${login.token}` };

        // Definimos el rango de filtro (Solo día 2026-09-07)
        const fechaInicio = '2026-09-07';
        const fechaFin = '2026-09-07';

        console.log(`--- CONSULTANDO HISTORIAL (Filtro: ${fechaInicio} a ${fechaFin}) ---`);
        
        const respuesta = await hacerPeticion({
          hostname: '127.0.0.1', 
          port: 3000, 
          path: `/api/reportes/tecnico/${empleadoId}/historial?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`, 
          method: 'GET',
          headers: authHeaders
        });

        if (respuesta.status === 200) {
          console.log(`Registros filtrados encontrados: ${respuesta.body.total_registros}`);
          console.table(respuesta.body.historial);
        } else {
          console.error(`Error ${respuesta.status}:`, respuesta.body);
        }
      });
    });

    loginReq.write(JSON.stringify({ cedula: '1234567890' }));
    loginReq.end();

  } catch (error) {
    console.error('Error:', error.message);
  }
}

probarFiltroFechas();