const http = require('http');

const data = JSON.stringify({
  cedula: '1234567890'
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log('\n--- RESPUESTA DEL SERVIDOR ---');
    console.log(responseData);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();