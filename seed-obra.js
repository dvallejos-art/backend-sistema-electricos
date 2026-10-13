const pool = require('./src/config/db');

async function poblarDatosObra() {
  try {
    // 1. Crear un Proyecto / PAU de prueba
    const pauRes = await pool.query(`
      INSERT INTO proyectos_pau (codigo_pau, nombre, ubicacion)
      VALUES ('PAU-001', 'Circuito Eléctrico Norte - Sector 1', 'Planta Central')
      ON CONFLICT (codigo_pau) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING *;
    `);
    const pau = pauRes.rows[0];
    console.log('✓ Proyecto/PAU registrado:', pau.codigo_pau);

    // 2. Insertar Actividades Eléctricas en el Catálogo
    const actividades = [
      ['ITEM-01', 'Instalación de Poste de Concreto 12m', 'unidad'],
      ['ITEM-02', 'Tendido de Cable Aéreo ACSR 2/0', 'metros'],
      ['ITEM-03', 'Montaje de Transformador Trifásico 75kVA', 'unidad']
    ];

    const actIds = [];
    for (const [codigo, desc, unidad] of actividades) {
      const actRes = await pool.query(`
        INSERT INTO actividades_catalogo (codigo_item, descripcion, unidad_medida)
        VALUES ($1, $2, $3)
        ON CONFLICT (codigo_item) DO UPDATE SET descripcion = EXCLUDED.descripcion
        RETURNING *;
      `, [codigo, desc, unidad]);
      actIds.push(actRes.rows[0]);
    }
    console.log('✓ Catálogo de actividades poblado:', actIds.length, 'ítems');

    // 3. Asignar Metas Presupuestadas (PAU <-> Actividades)
    // Ejemplo: 10 postes, 500 metros de cable, 2 transformadores
    const presupuestos = [
      [pau.id, actIds[0].id, 10.00],
      [pau.id, actIds[1].id, 500.00],
      [pau.id, actIds[2].id, 2.00]
    ];

    for (const [pau_id, act_id, cantidad] of presupuestos) {
      await pool.query(`
        INSERT INTO pau_actividades (pau_id, actividad_id, cantidad_presupuestada)
        VALUES ($1, $2, $3)
        ON CONFLICT (pau_id, actividad_id) DO UPDATE SET cantidad_presupuestada = EXCLUDED.cantidad_presupuestada;
      `, [pau_id, act_id, cantidad]);
    }
    console.log('✓ Presupuesto asignado al PAU-001 correctamente.');

  } catch (err) {
    console.error('Error al poblar datos de obra:', err.message);
  } finally {
    pool.end();
  }
}

poblarDatosObra();