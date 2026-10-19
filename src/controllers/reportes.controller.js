// src/controllers/reportes.controller.js
const pool = require('../config/db');

// 1. OBTENER REPORTE DE ASIGNACIONES (Con filtros por Edificio, Departamento, Fechas, Técnico y Estado)
exports.obtenerReporteAsignaciones = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const {
    fecha_inicio,
    fecha_fin,
    tipo_fecha,
    proyecto_id,
    pau_id,
    pau_texto,
    tecnico_id,
    actividad_id,
    estado
  } = req.query;

  try {
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Filtro por Edificio / Proyecto
    if (proyecto_id && proyecto_id !== 'todos') {
      whereConditions.push(`CAST(p.proyecto_id AS TEXT) = $${paramIndex}`);
      queryParams.push(String(proyecto_id));
      paramIndex++;
    }

    // Filtro por Departamento / PAU
    if (pau_id && pau_id !== 'todos') {
      whereConditions.push(`CAST(pa.pau_id AS TEXT) = $${paramIndex}`);
      queryParams.push(String(pau_id));
      paramIndex++;
    } else if (pau_texto && pau_texto.trim() !== '') {
      whereConditions.push(`(
        LOWER(p.nombre) LIKE LOWER($${paramIndex}) 
        OR LOWER(p.codigo) LIKE LOWER($${paramIndex})
      )`);
      queryParams.push(`%${pau_texto.trim()}%`);
      paramIndex++;
    }

    // Filtro por Técnico
    if (tecnico_id && tecnico_id !== 'todos') {
      whereConditions.push(`(
        CAST(pa.tecnico_id AS TEXT) = $${paramIndex} 
        OR CAST(pa.tecnico_secundario_id AS TEXT) = $${paramIndex}
      )`);
      queryParams.push(String(tecnico_id));
      paramIndex++;
    }

    // Filtro por Actividad
    if (actividad_id && actividad_id !== 'todos') {
      whereConditions.push(`CAST(pa.actividad_id AS TEXT) = $${paramIndex}`);
      queryParams.push(String(actividad_id));
      paramIndex++;
    }

    // Filtros por Rango de Fechas
    if (fecha_inicio) {
      if (tipo_fecha === 'ejecucion') {
        whereConditions.push(`(
          CAST(pa.creado_en AS DATE) >= $${paramIndex}
          OR EXISTS (
            SELECT 1 FROM registros_avance ra 
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            AND CAST(ra.creado_en AS DATE) >= $${paramIndex}
          )
        )`);
      } else {
        whereConditions.push(`CAST(pa.creado_en AS DATE) >= $${paramIndex}`);
      }
      queryParams.push(fecha_inicio);
      paramIndex++;
    }

    if (fecha_fin) {
      if (tipo_fecha === 'ejecucion') {
        whereConditions.push(`(
          CAST(pa.creado_en AS DATE) <= $${paramIndex}
          OR EXISTS (
            SELECT 1 FROM registros_avance ra 
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            AND CAST(ra.creado_en AS DATE) <= $${paramIndex}
          )
        )`);
      } else {
        whereConditions.push(`CAST(pa.creado_en AS DATE) <= $${paramIndex}`);
      }
      queryParams.push(fecha_fin);
      paramIndex++;
    }

    // Filtro por Estado Calculado
    if (estado && estado !== 'todos') {
      if (estado === 'pendiente') {
        whereConditions.push(`COALESCE(avances.total_ejecutado, 0) = 0`);
      } else if (estado === 'en_proceso') {
        whereConditions.push(`COALESCE(avances.total_ejecutado, 0) > 0 AND COALESCE(avances.total_ejecutado, 0) < pa.cantidad_presupuestada`);
      } else if (estado === 'realizada') {
        whereConditions.push(`COALESCE(avances.total_ejecutado, 0) >= pa.cantidad_presupuestada`);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        pa.id AS asignacion_id,
        pr.nombre AS edificio,
        COALESCE(p.nombre, p.codigo) AS departamento_pau,
        ac.descripcion AS actividad,
        ac.unidad_medida,
        COALESCE(u1.nombre, 'Sin Asignar') AS tecnico_principal,
        COALESCE(u2.nombre, 'N/A') AS tecnico_acompanante,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        COALESCE(avances.total_ejecutado, 0) AS cantidad_ejecutada,
        GREATEST(CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(avances.total_ejecutado, 0), 0) AS saldo_disponible,
        CASE 
          WHEN COALESCE(avances.total_ejecutado, 0) >= pa.cantidad_presupuestada THEN 'Realizada'
          WHEN COALESCE(avances.total_ejecutado, 0) > 0 THEN 'En Proceso'
          ELSE 'Pendiente'
        END AS estado_calculado,
        TO_CHAR(pa.creado_en, 'YYYY-MM-DD') AS fecha_asignacion
      FROM pau_actividades pa
      LEFT JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      LEFT JOIN proyectos pr ON CAST(pr.id AS TEXT) = CAST(p.proyecto_id AS TEXT)
      LEFT JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      LEFT JOIN usuarios u1 ON CAST(u1.id AS TEXT) = CAST(pa.tecnico_id AS TEXT)
      LEFT JOIN usuarios u2 ON CAST(u2.id AS TEXT) = CAST(pa.tecnico_secundario_id AS TEXT)
      LEFT JOIN (
        SELECT pau_actividad_id, SUM(CAST(cantidad_ejecutada AS NUMERIC)) AS total_ejecutado
        FROM registros_avance
        GROUP BY pau_actividad_id
      ) avances ON CAST(avances.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
      ${whereClause}
      ORDER BY pa.id DESC;
    `;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al filtrar reportes:', err);
    res.status(500).json({ error: err.message });
  }
};

// 2. EXPORTAR A EXCEL (.CSV)
exports.exportarExcel = async (req, res) => {
  try {
    req.query.limite = 10000;
    const mockRes = {
      setHeader: () => {},
      json: (data) => {
        let csv = 'ID;Edificio;Departamento/PAU;Actividad;Tecnico Lider;Tecnico Acompanante;Presupuestado;Ejecutado;Saldo;Estado;Fecha\n';
        data.forEach((row) => {
          csv += `${row.asignacion_id};"${row.edificio}";"${row.departamento_pau}";"${row.actividad}";"${row.tecnico_principal}";"${row.tecnico_acompanante}";${row.cantidad_presupuestada};${row.cantidad_ejecutada};${row.saldo_disponible};"${row.estado_calculado}";${row.fecha_asignacion}\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Actividades.csv');
        return res.send(csv);
      },
      status: () => ({ json: (err) => res.status(500).json(err) })
    };
    await exports.obtenerReporteAsignaciones(req, mockRes);
  } catch (err) {
    console.error('Error al exportar CSV:', err);
    res.status(500).json({ error: err.message });
  }
};

// 3. OBTENER RESUMEN DE AVANCE DE UN PAU
exports.getResumenAvancePAU = async (req, res, next) => {
  const { pau_id } = req.params;
  try {
    const query = `
      SELECT 
        pa.id AS pau_actividad_id,
        ac.descripcion AS actividad,
        ac.unidad_medida,
        CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) AS cantidad_presupuestada,
        COALESCE(
          (
            SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
            FROM registros_avance ra
            WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
          ), 0
        ) AS cantidad_ejecutada,
        GREATEST(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) - COALESCE(
            (
              SELECT SUM(CAST(ra.cantidad_ejecutada AS NUMERIC))
              FROM registros_avance ra
              WHERE CAST(ra.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
            ), 0
          ), 0
        ) AS saldo_pendiente
      FROM pau_actividades pa
      JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(p.codigo AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ac.descripcion ASC;
    `;
    const result = await pool.query(query, [pau_id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

// 4. OBTENER HISTORIAL POR TÉCNICO
exports.getHistorialPorTecnico = async (req, res, next) => {
  const { empleado_id } = req.params;
  try {
    const query = `
      SELECT 
        ra.id,
        TO_CHAR(COALESCE(ra.fecha_registro, NOW()), 'YYYY-MM-DD') AS fecha,
        COALESCE(pau.nombre, pau.codigo) AS departamento,
        COALESCE(act.descripcion, 'Actividad') AS actividad,
        CAST(ra.cantidad_ejecutada AS NUMERIC) AS cantidad,
        ra.observaciones
      FROM registros_avance ra
      LEFT JOIN paus pau ON (CAST(pau.id AS TEXT) = CAST(ra.pau_id AS TEXT) OR CAST(pau.codigo AS TEXT) = CAST(ra.pau_id AS TEXT))
      LEFT JOIN actividades_catalogo act ON CAST(act.id AS TEXT) = CAST(ra.actividad_id AS TEXT)
      WHERE CAST(ra.tecnico_id AS TEXT) = CAST($1 AS TEXT)
         OR CAST(ra.empleado_id AS TEXT) = CAST($1 AS TEXT)
      ORDER BY ra.id DESC;
    `;
    const result = await pool.query(query, [empleado_id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

// 5. OBTENER DETALLE DE RUBROS Y AVANCES PONDERADOS POR PORCENTAJE DE ETAPA (CONSOLIDADO CORRECTO)
exports.getDetalleRubrosPAU = async (req, res) => {
  const { pau_id } = req.params;

  try {
    const query = `
      SELECT 
        pa.actividad_id,
        ac.descripcion AS descripcion_rubro,
        
        -- Obtiene la tarifa específica del proyecto
        COALESCE(pre.precio_unitario, 0) AS precio_unitario,
        
        -- Si hay asignaciones fragmentadas por etapa ([Etapa: X%]), toma el MAX base para no duplicar (ej: 2.00)
        -- Si son asignaciones de diferentes etapas completas, suma nominalmente
        CASE 
          WHEN COUNT(pa.id) > 1 AND SUM(CASE WHEN pa.observaciones LIKE '%[Etapa: %' THEN 1 ELSE 0 END) > 0 THEN
            MAX(CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC))
          ELSE
            SUM(CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC))
        END AS cant_asignada_fisica,
        
        -- Suma ponderada equivalente según porcentajes asignados (60% + 40% = 100% de 2.00 = 2.00)
        SUM(
          CAST(COALESCE(pa.cantidad_presupuestada, 0) AS NUMERIC) * 
          (
            CASE 
              WHEN pa.observaciones LIKE '%[Etapa: %' THEN 
                CAST(SUBSTRING(pa.observaciones FROM '\\[Etapa: ([0-9.]+)%\\]') AS NUMERIC) / 100.0
              WHEN pa.observaciones LIKE '%[Porcentaje de rubro: %' THEN 
                CAST(SUBSTRING(pa.observaciones FROM '\\[Porcentaje de rubro: ([0-9.]+)%\\]') AS NUMERIC) / 100.0
              ELSE 1.0
            END
          )
        ) AS cantidad_presupuestada_valorada,
        
        -- Suma real de avances ejecutados por los técnicos
        COALESCE(SUM(DISTINCT avances.total_ejecutado_pa), 0) AS cantidad_ejecutada,
        
        -- Subtotal financiero ejecutado
        ROUND(COALESCE(SUM(DISTINCT avances.total_ejecutado_pa), 0) * COALESCE(pre.precio_unitario, 0), 2) AS subtotal_ejecutado

      FROM pau_actividades pa
      JOIN paus p ON CAST(p.id AS TEXT) = CAST(pa.pau_id AS TEXT)
      JOIN actividades_catalogo ac ON CAST(ac.id AS TEXT) = CAST(pa.actividad_id AS TEXT)
      
      LEFT JOIN precios_actividades pre 
        ON CAST(pre.actividad_id AS TEXT) = CAST(pa.actividad_id AS TEXT)
       AND CAST(pre.proyecto_id AS TEXT) = CAST(p.proyecto_id AS TEXT)
       
      LEFT JOIN (
        SELECT pau_actividad_id, SUM(CAST(cantidad_ejecutada AS NUMERIC)) AS total_ejecutado_pa
        FROM registros_avance
        GROUP BY pau_actividad_id
      ) avances ON CAST(avances.pau_actividad_id AS TEXT) = CAST(pa.id AS TEXT)
      
      WHERE CAST(pa.pau_id AS TEXT) = CAST($1 AS TEXT) OR CAST(p.codigo AS TEXT) = CAST($1 AS TEXT)
      GROUP BY pa.actividad_id, ac.descripcion, pre.precio_unitario
      ORDER BY ac.descripcion ASC;
    `;

    const result = await pool.query(query, [pau_id]);

    const rubrosFormateados = result.rows.map((row) => {
      const ejecutada = parseFloat(row.cantidad_ejecutada || 0);
      const valorada = parseFloat(row.cantidad_presupuestada_valorada || 0);
      const precio = parseFloat(row.precio_unitario || 0);

      const subtotalEjecutado = parseFloat(row.subtotal_ejecutado || 0);
      const subtotalTotal = valorada * precio;
      
      const pendienteFisica = Math.max(0, valorada - ejecutada);
      const subtotalPendiente = precio === 0 ? 0 : Math.max(0, subtotalTotal - subtotalEjecutado);
      
      const pctAvance = valorada > 0 ? Math.min(100, (ejecutada / valorada) * 100) : 100;
      const pctPendiente = (100 - pctAvance).toFixed(0);

      const estaCompletado = subtotalPendiente === 0 && pendienteFisica === 0;

      return {
        descripcion_rubro: row.descripcion_rubro,
        cantidad_asignada: parseFloat(row.cant_asignada_fisica).toFixed(2),
        cantidad_ejecutada: ejecutada.toFixed(2),
        cantidad_pendiente: estaCompletado ? "0.00 (Completado)" : `${pendienteFisica.toFixed(2)} (${pctPendiente}% Pendiente)`,
        precio_unitario: precio.toFixed(2),
        subtotal_ejecutado: subtotalEjecutado.toFixed(2),
        subtotal_pendiente: subtotalPendiente.toFixed(2),
        completado: estaCompletado
      };
    });

    res.json(rubrosFormateados);
  } catch (err) {
    console.error('Error al obtener detalle de rubros:', err);
    res.status(500).json({ error: err.message });
  }
};