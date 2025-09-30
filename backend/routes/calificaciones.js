const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const Calificacion = require('../models/Calificacion');
const path = require('path');

// Configurar Multer para subir archivos Excel
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Asegúrate que la carpeta uploads/ exista
  },
  filename: (req, file, cb) => {
    cb(null, 'calificaciones_' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Ruta para subir Excel y guardar en MongoDB
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    const archivoRuta = req.file.path;
    const workbook = xlsx.readFile(archivoRuta);
    const hoja = workbook.SheetNames[0];
    const datos = xlsx.utils.sheet_to_json(workbook.Sheets[hoja]);

    const parcialSeleccionado = Number(req.body.parcial);
    const periodo = req.body.periodo;
    if (!periodo) return res.status(400).json({ error: 'Periodo no especificado' });

    const registrosProcesados = [];

    for (const fila of datos) {
      const base = {
        matricula: fila['Matrícula']?.toString().trim(),
        nombre: fila['Nombre Alumno']?.toString().trim(),
        especialidad: fila['Especialidad']?.toString().trim(),
        semestre: parseInt(fila['Semestre']) || null,
        grupo: fila['Grupo']?.toString().trim(),
        materia: fila['Materia']?.toString().trim(),
        periodo,
        ultimaModificacion: new Date()
      };

      if (!base.matricula || !base.materia || !periodo) continue;

      if (parcialSeleccionado >= 1 && parcialSeleccionado <= 4) {
        // Subida por parcial individual
        const parcialNum = parcialSeleccionado - 1;
        const parcialValor = Number(fila[`Parcial ${parcialSeleccionado}`]) || null;

        const update = {
          ...base,
          [`parciales.${parcialNum}`]: parcialValor
        };

        await Calificacion.findOneAndUpdate(
          { matricula: base.matricula, materia: base.materia, periodo },
          { $set: update },
          { upsert: true, new: true }
        );

      } else {
        // Subida completa con todos los parciales y final
        const parciales = [
          Number(fila['Parcial 1']) || null,
          Number(fila['Parcial 2']) || null,
          Number(fila['Parcial 3']) || null,
          Number(fila['Parcial 4']) || null
        ];

        const final = Number(
          fila['Calificacion final'] ??
          fila['Calificación final'] ??
          fila['Calificacon final']
        ) || null;

        await Calificacion.findOneAndUpdate(
          { matricula: base.matricula, materia: base.materia, periodo },
          { $set: { ...base, parciales, final } },
          { upsert: true, new: true }
        );
      }

      registrosProcesados.push(base.matricula);
    }

    res.status(200).json({
      mensaje: '✅ Archivo procesado correctamente',
      registros: registrosProcesados.length
    });

  } catch (error) {
    console.error('❌ Error al subir calificaciones:', error);
    res.status(500).json({ error: 'Error al procesar el archivo' });
  }
});


const mongoose = require('mongoose');

// Ruta para obtener estadísticas generales
// Ruta para obtener estadísticas generales con filtros
router.get('/estadisticas', async (req, res) => {
  try {
    const periodo = req.query.periodo || '2025-EneroJulio';
    const filtro = { periodo };

    // Filtros adicionales (opcional)
    if (req.query.especialidad) filtro.especialidad = req.query.especialidad;
    if (req.query.semestre) filtro.semestre = parseInt(req.query.semestre);
    if (req.query.grupo) filtro.grupo = req.query.grupo;

    // Promedio por materia
    const promedioPorMateria = await Calificacion.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$materia",
          promedio: { $avg: "$final" },
          total: { $sum: 1 }
        }
      },
      { $sort: { promedio: -1 } }
    ]);

    // Reprobación por especialidad
    const reprobacionPorEspecialidad = await Calificacion.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$especialidad",
          total: { $sum: 1 },
          reprobados: {
            $sum: {
              $cond: [{ $lt: ["$final", 70] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          total: 1,
          reprobados: 1,
          porcentajeReprobados: {
            $round: [{ $multiply: [{ $divide: ["$reprobados", "$total"] }, 100] }, 1]
          }
        }
      },
      { $sort: { porcentajeReprobados: -1 } }
    ]);

    // Top materias con más reprobados
    const topMateriasReprobadas = await Calificacion.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$materia",
          total: { $sum: 1 },
          reprobados: {
            $sum: {
              $cond: [{ $lt: ["$final", 70] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          total: 1,
          reprobados: 1,
          porcentaje: {
            $round: [{ $multiply: [{ $divide: ["$reprobados", "$total"] }, 100] }, 1]
          }
        }
      },
      { $sort: { reprobados: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      promedioPorMateria,
      reprobacionPorEspecialidad,
      topMateriasReprobadas
    });

  } catch (error) {
    console.error('❌ Error en /estadisticas:', error);
    res.status(500).json({ error: 'Error al generar estadísticas' });
  }
});


// Consultar qué parciales existen por periodo, grupo y materia
router.get('/existentes', async (req, res) => {
  const periodo = req.query.periodo || '2025-EneroJulio';
  const registros = await Calificacion.find({ periodo });

  // Construir mapa de parciales por materia/matrícula
  const mapa = {};

  registros.forEach(reg => {
    const clave = `${reg.matricula}-${reg.materia}`;
    mapa[clave] = reg.parciales.map((p, i) => (p !== null && p !== undefined ? i + 1 : null)).filter(p => p !== null);
  });

  res.json(mapa); // { "24SI001-Matemáticas II": [1, 2], ... }
});

// Obtener valores distintos de especialidad, semestre y grupo
router.get('/distintos', async (req, res) => {
  try {
    const periodo = req.query.periodo || '2025-EneroJulio';

    const [especialidades, semestres, grupos] = await Promise.all([
      Calificacion.distinct('especialidad', { periodo }),
      Calificacion.distinct('semestre', { periodo }),
      Calificacion.distinct('grupo', { periodo })
    ]);

    res.json({
      especialidades,
      semestres,
      grupos
    });
  } catch (error) {
    console.error('❌ Error al obtener valores distintos:', error);
    res.status(500).json({ error: 'Error al obtener filtros' });
  }
});

// Obtener todos los periodos distintos
router.get('/periodos', async (req, res) => {
  try {
    const periodos = await Calificacion.distinct('periodo');
    res.json(periodos.sort().reverse()); // orden descendente
  } catch (error) {
    console.error('❌ Error al obtener periodos:', error);
    res.status(500).json({ error: 'Error al obtener periodos' });
  }
});

const ExcelJS = require('exceljs');
const fs = require('fs');

// Ruta para exportar calificaciones en Excel
router.get('/exportar', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.periodo) filtro.periodo = req.query.periodo;
    if (req.query.especialidad) filtro.especialidad = req.query.especialidad;
    if (req.query.semestre) filtro.semestre = parseInt(req.query.semestre);
    if (req.query.grupo) filtro.grupo = req.query.grupo;

    const registros = await Calificacion.find(filtro).lean();

    if (registros.length === 0) {
      return res.status(404).json({ error: 'No hay registros para exportar' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Calificaciones');

    worksheet.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Matrícula', key: 'matricula', width: 15 },
      { header: 'Especialidad', key: 'especialidad', width: 20 },
      { header: 'Semestre', key: 'semestre', width: 10 },
      { header: 'Grupo', key: 'grupo', width: 10 },
      { header: 'Materia', key: 'materia', width: 25 },
      { header: 'Parcial 1', key: 'p1', width: 10 },
      { header: 'Parcial 2', key: 'p2', width: 10 },
      { header: 'Parcial 3', key: 'p3', width: 10 },
      { header: 'Parcial 4', key: 'p4', width: 10 },
      { header: 'Final', key: 'final', width: 10 }
    ];

    registros.forEach(r => {
      worksheet.addRow({
        nombre: r.nombre,
        matricula: r.matricula,
        especialidad: r.especialidad,
        semestre: r.semestre,
        grupo: r.grupo,
        materia: r.materia,
        p1: r.parciales?.[0] ?? '',
        p2: r.parciales?.[1] ?? '',
        p3: r.parciales?.[2] ?? '',
        p4: r.parciales?.[3] ?? '',
        final: r.final ?? ''
      });
    });

    const fileName = `Calificaciones_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, `../uploads/${fileName}`);
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, () => {
      // Borra el archivo después de descargar
      fs.unlinkSync(filePath);
    });

  } catch (error) {
    console.error('❌ Error al exportar calificaciones:', error);
    res.status(500).json({ error: 'Error al exportar el Excel' });
  }
});

// Índice de reprobación por grupo
router.get('/estadisticas/reprobacion-por-grupo', async (req, res) => {
  try {
    const { periodo, especialidad, semestre } = req.query;

    const filtro = {};
    if (periodo) filtro.periodo = periodo;
    if (especialidad) filtro.especialidad = especialidad;
    if (semestre) filtro.semestre = parseInt(semestre);

    const resultado = await Calificacion.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: '$grupo',
          total: { $sum: 1 },
          reprobados: {
            $sum: {
              $cond: [{ $lt: ['$final', 70] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          grupo: '$_id',
          porcentaje: {
            $cond: [
              { $eq: ['$total', 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ['$reprobados', '$total'] }, 100] }, 1] }
            ]
          },
          _id: 0
        }
      },
      { $sort: { grupo: 1 } }
    ]);

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error en /reprobacion-por-grupo:', err);
    res.status(500).json({ error: 'Error al calcular reprobación por grupo' });
  }
});



module.exports = router;
