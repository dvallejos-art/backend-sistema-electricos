// Ejemplo de consulta para guardar/editar en pau_actividades
const query = `
  INSERT INTO pau_actividades (
    pau_id, 
    actividad_id, 
    tecnico_id, 
    tecnico_secundario_id, -- <--- DEBE INCLUIRSE
    cantidad_presupuestada, 
    observaciones
  ) VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *;
`;

// Valores
const values = [
  pau_id,
  actividad_id,
  tecnico_id, // ID de Julio Miles
  tecnico_secundario_id || null, // ID de Angel Pillajo
  cantidad_presupuestada,
  observaciones
];