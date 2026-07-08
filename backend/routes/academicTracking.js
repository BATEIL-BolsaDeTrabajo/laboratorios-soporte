const express = require('express');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const AcademicTracking = require('../models/AcademicTracking');
const { verifyToken } = require('../middlewares/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    cb(null, `seguimiento_academico_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });
let indexesChecked = false;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function findNextValue(row, startIndex) {
  for (let i = startIndex + 1; i < row.length; i += 1) {
    const value = cleanText(row[i]);
    if (value) return value;
  }
  return '';
}

function findLabeledValue(row, startIndex, label) {
  const cellText = cleanText(row[startIndex]);
  const withoutLabel = cleanText(cellText.replace(new RegExp(`^\\s*${label}\\s*:?\\s*`, 'i'), ''));
  if (withoutLabel && withoutLabel !== cellText && withoutLabel !== ':') return withoutLabel;
  return findNextValue(row, startIndex);
}

function normalizeParcial(value) {
  const text = cleanText(value).toUpperCase();
  const match = text.match(/PARCIAL\s*([0-9]+)/i) || text.match(/\bP\s*([0-9]+)\b/i);
  if (match) return `PARCIAL ${match[1]}`;
  return text;
}

function parcialNumber(value) {
  const match = cleanText(value).match(/([0-9]+)/);
  return match ? Number(match[1]) : null;
}

function buildProjection(currentRecord, registrosAlumno) {
  const parcialActual = parcialNumber(currentRecord.parcial);
  const parciales = [1, 2, 3, 4];
  const parcialesCargados = new Map();

  registrosAlumno.forEach((registro) => {
    const numero = parcialNumber(registro.parcial);
    if (numero) parcialesCargados.set(numero, registro);
  });

  const materiasVistas = new Set();
  const materias = [];
  registrosAlumno
    .filter((registro) => {
      const numero = parcialNumber(registro.parcial);
      return !parcialActual || !numero || numero <= parcialActual;
    })
    .forEach((registro) => {
      (registro.materias || []).forEach((item) => {
        if (!materiasVistas.has(item.materia)) {
          materiasVistas.add(item.materia);
          materias.push(item.materia);
        }
      });
    });

  const parcialesConsiderados = parcialActual
    ? parciales.filter((numero) => numero <= parcialActual)
    : [];
  const parcialesRestantes = parcialActual
    ? parciales.filter((numero) => numero > parcialActual)
    : [];

  const proyeccion = materias.map((materia) => {
    const calificaciones = {};
    let acumulado = 0;
    const faltantesCargados = [];
    const calificacionesCargadas = [];

    parcialesConsiderados.forEach((numero) => {
      const registro = parcialesCargados.get(numero);
      const item = registro?.materias?.find((materiaItem) => materiaItem.materia === materia);
      const calificacion = item && Number.isFinite(Number(item.calificacion))
        ? Number(item.calificacion)
        : null;
      calificaciones[`PARCIAL ${numero}`] = calificacion;
      if (calificacion === null) faltantesCargados.push(`PARCIAL ${numero}`);
      else {
        acumulado += calificacion;
        calificacionesCargadas.push(calificacion);
      }
    });

    const promedioParciales = calificacionesCargadas.length
      ? Number((acumulado / calificacionesCargadas.length).toFixed(1))
      : null;

    if (!parcialActual) {
      return {
        materia,
        calificaciones,
        acumulado,
        promedioParciales,
        parcialesRestantes: [],
        puntosFaltantes: null,
        requeridoPorParcial: null,
        estado: 'Parcial no valido'
      };
    }

    if (faltantesCargados.length) {
      return {
        materia,
        calificaciones,
        acumulado,
        promedioParciales,
        parcialesRestantes: parcialesRestantes.map((numero) => `PARCIAL ${numero}`),
        puntosFaltantes: null,
        requeridoPorParcial: null,
        estado: `Falta cargar ${faltantesCargados.join(', ')}`
      };
    }

    if (!parcialesRestantes.length) {
      const aprobado = acumulado >= 280;
      return {
        materia,
        calificaciones,
        acumulado,
        promedioParciales,
        parcialesRestantes: [],
        puntosFaltantes: Math.max(0, 280 - acumulado),
        requeridoPorParcial: null,
        estado: aprobado ? 'Aprobado' : 'Extra'
      };
    }

    const puntosFaltantes = Math.max(0, 280 - acumulado);
    const requeridoPorParcial = Math.ceil(puntosFaltantes / parcialesRestantes.length);
    let estado = 'En proyeccion';
    if (parcialActual === 3 && requeridoPorParcial > 100) {
      estado = 'Extra directo';
    } else if (parcialActual === 3 && promedioParciales !== null && promedioParciales < requeridoPorParcial) {
      estado = 'Posible extraordinario';
    }

    return {
      materia,
      calificaciones,
      acumulado,
      promedioParciales,
      parcialesRestantes: parcialesRestantes.map((numero) => `PARCIAL ${numero}`),
      puntosFaltantes,
      requeridoPorParcial,
      estado
    };
  });

  return {
    alumno: {
      matricula: currentRecord.matricula,
      nombre: currentRecord.nombre,
      grupo: currentRecord.grupo,
      ciclo: currentRecord.ciclo
    },
    parcialActual: currentRecord.parcial,
    parcialNumero: parcialActual,
    minimoAprobar: 280,
    proyeccion
  };
}

async function ensureAcademicTrackingIndexes() {
  if (indexesChecked) return;

  try {
    const indexes = await AcademicTracking.collection.indexes();
    const oldUniqueIndex = indexes.find((index) =>
      index.unique &&
      JSON.stringify(index.key) === JSON.stringify({ ciclo: 1, grupo: 1, matricula: 1 })
    );

    if (oldUniqueIndex) {
      await AcademicTracking.collection.dropIndex(oldUniqueIndex.name);
    }

    await AcademicTracking.syncIndexes();
    indexesChecked = true;
  } catch (error) {
    console.warn('No se pudieron sincronizar indices de seguimiento academico:', error.message);
  }
}

function extractWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: false
  });
}

function parseConcentrado(filePath, fallbackCiclo) {
  const rows = extractWorkbookRows(filePath);
  let ciclo = '';
  let grupo = '';
  let parcial = '';
  let headerRowIndex = -1;
  let matriculaCol = -1;
  let nombreCol = -1;
  let noCol = -1;

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const normalized = normalizeText(cell);
      if (normalized.includes('ciclo escolar')) ciclo = findLabeledValue(row, colIndex, 'ciclo escolar');
      if (normalized === 'grupo' || normalized === 'grupo:') grupo = findLabeledValue(row, colIndex, 'grupo');
      if (normalized.includes('evaluacion')) parcial = findLabeledValue(row, colIndex, 'evaluacion');
    });

    if (headerRowIndex !== -1) return;

    const possibleMatricula = row.findIndex((cell) => normalizeText(cell).includes('matricula'));
    const possibleNombre = row.findIndex((cell) => {
      const value = normalizeText(cell);
      return value.includes('nombre') && (value.includes('alumno') || value.includes('alumna'));
    });

    if (possibleMatricula !== -1 && possibleNombre !== -1) {
      headerRowIndex = rowIndex;
      matriculaCol = possibleMatricula;
      nombreCol = possibleNombre;
      noCol = row.findIndex((cell) => ['no.', 'no', 'n'].includes(normalizeText(cell)));
    }
  });

  ciclo = cleanText(ciclo || fallbackCiclo);
  grupo = cleanText(grupo);
  parcial = normalizeParcial(parcial);

  if (!ciclo) {
    const error = new Error('El archivo no contiene ciclo escolar. Escribe un ciclo manual solo como respaldo.');
    error.status = 400;
    throw error;
  }

  if (!parcial) {
    const error = new Error('El archivo no contiene evaluacion/parcial. Verifica que el concentrado incluya el dato de Evaluacion.');
    error.status = 400;
    throw error;
  }

  if (headerRowIndex === -1 || matriculaCol === -1 || nombreCol === -1) {
    const error = new Error('No se encontraron las columnas Matricula y Nombre del Alumno en el archivo.');
    error.status = 400;
    throw error;
  }

  const header = rows[headerRowIndex];
  const knownColumns = new Set([
    noCol,
    matriculaCol,
    nombreCol
  ]);

  const ignoredHeaderFragments = [
    'materias reprobadas',
    'reprobadas',
    'promedio',
    'accion',
    'comentarios',
    'acuerdos',
    'seguimiento',
    'nombre',
    'matricula',
    'no.'
  ];

  const subjectColumns = header
    .map((cell, index) => ({ index, materia: cleanText(cell) }))
    .filter(({ index, materia }) => {
      if (!materia || knownColumns.has(index)) return false;
      const normalized = normalizeText(materia);
      return !ignoredHeaderFragments.some((fragment) => normalized.includes(fragment));
    });

  const alumnos = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const matricula = cleanText(row[matriculaCol]);
    const nombre = cleanText(row[nombreCol]);

    if (!matricula || !nombre) continue;

    const materias = subjectColumns
      .map(({ index, materia }) => ({
        materia,
        calificacion: parseGrade(row[index])
      }))
      .filter((item) => item.calificacion !== null);

    if (!materias.length) continue;

    const calificaciones = materias.map((item) => item.calificacion);
    const promedio = Number((calificaciones.reduce((sum, value) => sum + value, 0) / calificaciones.length).toFixed(1));
    const materiasReprobadas = calificaciones.filter((value) => value < 70).length;

    alumnos.push({
      ciclo,
      grupo,
      parcial,
      matricula,
      nombre,
      materias,
      promedio,
      materiasReprobadas
    });
  }

  return { ciclo, grupo, parcial, alumnos, materias: subjectColumns.map((item) => item.materia) };
}

function userName(req) {
  return req.usuario?.nombre || req.usuario?.name || req.usuario?.email || 'Usuario';
}

function accionAutomatica(materiasReprobadas) {
  return Number(materiasReprobadas || 0) > 3 ? 'CITA' : 'MENSAJE';
}

router.post('/importar', verifyToken, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' });

    await ensureAcademicTrackingIndexes();
    const parsed = parseConcentrado(req.file.path, req.body.ciclo);
    let creados = 0;
    let actualizados = 0;

    for (const alumno of parsed.alumnos) {
      const filtro = {
        ciclo: alumno.ciclo,
        grupo: alumno.grupo,
        parcial: alumno.parcial,
        matricula: alumno.matricula
      };
      const existente = await AcademicTracking.exists(filtro);

      await AcademicTracking.findOneAndUpdate(
        filtro,
        {
          $set: {
            nombre: alumno.nombre,
            parcial: alumno.parcial,
            materias: alumno.materias,
            promedio: alumno.promedio,
            materiasReprobadas: alumno.materiasReprobadas,
            accion: accionAutomatica(alumno.materiasReprobadas),
            fuenteArchivo: req.file.originalname,
            ultimaImportacion: new Date()
          },
          $setOnInsert: {
            comentarios: [],
            acuerdos: []
          }
        },
        { upsert: true, new: true }
      );

      if (existente) actualizados += 1;
      else creados += 1;
    }

    res.json({
      mensaje: 'Concentrado importado correctamente',
      ciclo: parsed.ciclo,
      grupo: parsed.grupo,
      parcial: parsed.parcial,
      materias: parsed.materias.length,
      registros: parsed.alumnos.length,
      creados,
      actualizados
    });
  } catch (error) {
    console.error('Error al importar seguimiento academico:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error al importar el concentrado' });
  }
});

router.get('/filtros', verifyToken, async (req, res) => {
  try {
    await ensureAcademicTrackingIndexes();
    const ciclos = await AcademicTracking.distinct('ciclo');
    const filtroBase = {};
    if (req.query.ciclo) filtroBase.ciclo = req.query.ciclo;
    if (req.query.grupo) filtroBase.grupo = req.query.grupo;

    const filtroGrupo = { ...filtroBase };
    delete filtroGrupo.grupo;
    if (req.query.parcial) filtroGrupo.parcial = req.query.parcial;

    const filtroParcial = { ...filtroBase };
    if (req.query.parcial) delete filtroParcial.parcial;

    const grupos = await AcademicTracking.distinct('grupo', filtroGrupo);
    const parciales = await AcademicTracking.distinct('parcial', filtroParcial);

    res.json({
      ciclos: ciclos.filter(Boolean).sort().reverse(),
      grupos: grupos.filter(Boolean).sort(),
      parciales: parciales.filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    });
  } catch (error) {
    console.error('Error al obtener filtros de seguimiento:', error);
    res.status(500).json({ error: 'Error al obtener filtros' });
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.ciclo) filtro.ciclo = req.query.ciclo;
    if (req.query.grupo) filtro.grupo = req.query.grupo;
    if (req.query.parcial) filtro.parcial = req.query.parcial;

    const registros = await AcademicTracking.find(filtro)
      .sort({ grupo: 1, nombre: 1 })
      .lean();

    registros.forEach((registro) => {
      registro.accion = accionAutomatica(registro.materiasReprobadas);
    });

    const materias = [];
    const vistas = new Set();
    registros.forEach((registro) => {
      (registro.materias || []).forEach((materia) => {
        if (!vistas.has(materia.materia)) {
          vistas.add(materia.materia);
          materias.push(materia.materia);
        }
      });
    });

    res.json({ materias, registros });
  } catch (error) {
    console.error('Error al consultar seguimiento academico:', error);
    res.status(500).json({ error: 'Error al consultar seguimiento academico' });
  }
});

router.get('/:id/proyeccion', verifyToken, async (req, res) => {
  try {
    const registro = await AcademicTracking.findById(req.params.id).lean();
    if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });

    const registrosAlumno = await AcademicTracking.find({
      ciclo: registro.ciclo,
      grupo: registro.grupo,
      matricula: registro.matricula
    })
      .sort({ parcial: 1 })
      .lean();

    res.json(buildProjection(registro, registrosAlumno));
  } catch (error) {
    console.error('Error al consultar proyeccion academica:', error);
    res.status(500).json({ error: 'Error al consultar proyeccion academica' });
  }
});

router.patch('/:id/accion', verifyToken, async (req, res) => {
  try {
    const accion = req.body.accion;
    if (!['CITA', 'MENSAJE'].includes(accion)) {
      return res.status(400).json({ error: 'Accion no valida' });
    }

    const registro = await AcademicTracking.findByIdAndUpdate(
      req.params.id,
      { $set: { accion } },
      { new: true }
    );

    if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(registro);
  } catch (error) {
    console.error('Error al actualizar accion:', error);
    res.status(500).json({ error: 'Error al actualizar la accion' });
  }
});

router.post('/:id/comentarios', verifyToken, async (req, res) => {
  try {
    const texto = cleanText(req.body.texto);
    if (!texto) return res.status(400).json({ error: 'El comentario no puede estar vacio' });

    const comentario = {
      texto,
      usuarioId: req.usuario?.id || req.usuario?._id || null,
      usuarioNombre: userName(req),
      fecha: new Date()
    };

    const registro = await AcademicTracking.findByIdAndUpdate(
      req.params.id,
      { $push: { comentarios: comentario } },
      { new: true }
    );

    if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(registro);
  } catch (error) {
    console.error('Error al guardar comentario:', error);
    res.status(500).json({ error: 'Error al guardar comentario' });
  }
});

router.post('/:id/acuerdos', verifyToken, async (req, res) => {
  try {
    const texto = cleanText(req.body.texto);
    if (!texto) return res.status(400).json({ error: 'El acuerdo no puede estar vacio' });

    const acuerdo = {
      texto,
      usuarioId: req.usuario?.id || req.usuario?._id || null,
      usuarioNombre: userName(req),
      fecha: new Date()
    };

    const registro = await AcademicTracking.findByIdAndUpdate(
      req.params.id,
      { $push: { acuerdos: acuerdo } },
      { new: true }
    );

    if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(registro);
  } catch (error) {
    console.error('Error al guardar acuerdo:', error);
    res.status(500).json({ error: 'Error al guardar acuerdo' });
  }
});

module.exports = router;
