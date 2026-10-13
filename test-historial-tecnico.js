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

async function probarHistorial() {
  try {
    const loginReq = http.request({
      hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        const login = JSON.parse(data);
        const empleadoId = login.usuario.id;

        const authHeaders = {
          'Authorization': `Bearer ${login.token}`
        };

        console.log(`--- CONSULTANDO HISTORIAL DEL TÉCNICO ID: ${empleadoId} ---`);
        const respuesta = await hacerPeticion({
          hostname: '127.0.0.1', port: 3000, 
          path: `/api/reportes/tecnico/${empleadoId}/historial`, 
          method: 'GET',
          headers: authHeaders
        });

        if (respuesta.status === 200) {
          console.log(`Total de registros encontrados: ${respuesta.body.total_registros}`);
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

probarHistorial();