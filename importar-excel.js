const xlsx = require('xlsx');
const pool = require('./src/config/db');

async function cargarDesdeExcel() {
  try {
    const workbook = xlsx.readFile('./actividades.xlsx');
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`Cargando ${data.length} registros desde Excel...\n`);

    for (const fila of data) {
      const { codigo_item, descripcion, unidad_medida, codigo_pau, cantidad_presupuestada } = fila;

      // 1. Insertar o actualizar la actividad en el catálogo maestro
      const actRes = await pool.query(`
        INSERT INTO actividades_catalogo (codigo_item, descripcion, unidad_medida)
        VALUES ($1, $2, $3)
        ON CONFLICT (codigo_item) DO UPDATE 
        SET descripcion = EXCLUDED.descripcion, unidad_medida = EXCLUDED.unidad_medida
        RETURNING id;
      `, [codigo_item, descripcion, unidad_medida]);

      const actividadId = actRes.rows[0].id;

      // 2. Verificar que el PAU exista
      const pauRes = await pool.query(`
        SELECT id FROM proyectos_pau WHERE codigo_pau = $1;
      `, [codigo_pau]);

      if (pauRes.rows.length === 0) {
        console.warn(`⚠️ PAU [${codigo_pau}] no existe. Se omitió ${codigo_item}.`);
        continue;
      }

      const pauId = pauRes.rows[0].id;

      // 3. Asignar el presupuesto
      await pool.query(`
        INSERT INTO pau_actividades (pau_id, actividad_id, cantidad_presupuestada)
        VALUES ($1, $2, $3)
        ON CONFLICT (pau_id, actividad_id) DO UPDATE 
        SET cantidad_presupuestada = EXCLUDED.cantidad_presupuestada;
      `, [pauId, actividadId, cantidad_presupuestada]);

      console.log(`✓ [${codigo_pau}] ${codigo_item} - Meta: ${cantidad_presupuestada} ${unidad_medida}`);
    }

    console.log('\n¡Importación masiva completada con éxito!');
  } catch (err) {
    console.error('Error al importar archivo:', err.message);
  } finally {
    pool.end();
  }
}

cargarDesdeExcel();