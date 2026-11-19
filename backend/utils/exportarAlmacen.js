const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Entrada = require('../models/EntradaAlmacen');
const Salida = require('../models/SalidaAlmacen');
const Ajuste = require('../models/AjusteInventario');
const Auditoria = require('../models/AuditoriaInventario');
const Catalogo = require('../models/CatalogoAlmacen');
const Equipo = require('../models/AsignacionEquipo');
const User = require('../models/User');

const colecciones = [
  ['Productos', Producto], ['Entradas y recepción', Entrada], ['Salidas', Salida],
  ['Ajustes', Ajuste], ['Auditoría', Auditoria], ['Catálogos', Catalogo],
  ['Asignaciones de equipo', Equipo]
];

function valorExcel(valor) {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof mongoose.Types.ObjectId) return valor.toString();
  const celda = typeof valor === 'object' ? JSON.stringify(valor) : valor;
  if (typeof celda === 'string' && celda.length > 32767) {
    throw new Error('Un campo supera el límite de texto de una celda de Excel.');
  }
  return celda;
}

function crearHoja(libro, nombre, campos) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = campos.map(campo => ({
    header: campo, key: campo, width: Math.max(20, campo.length + 4)
  }));
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: campos.length } };
  hoja.getRow(1).commit();
  return hoja;
}

function agregarFila(hoja, campos, documento) {
  const fila = hoja.addRow(campos.map(campo => valorExcel(documento[campo])));
  if (fila.number > 1048576) throw new Error('Se excedió el límite de filas de Excel.');
  fila.commit();
}

async function exportarAlmacen(archivo) {
  const session = await mongoose.startSession({ snapshot: true });
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: archivo });
  const usuarios = new Set();
  try {
    for (const [nombre, modelo] of colecciones) {
      const campos = Object.keys(modelo.schema.paths).filter(campo => campo !== 'historial');
      const referencias = campos.filter(campo => modelo.schema.path(campo).options.ref === 'User');
      const columnas = [...campos, 'otrosCampos'];
      const hoja = crearHoja(libro, nombre, columnas);
      const camposHistorial = ['asignacionId', 'orden', 'fecha', 'accion', 'descripcion', 'usuario', 'otrosCampos'];
      const historial = modelo === Equipo && crearHoja(libro, 'Historial de equipos', camposHistorial);
      for await (const doc of modelo.collection.find({}, { session })) {
        const extras = Object.fromEntries(Object.entries(doc).filter(([k]) =>
          !campos.includes(k) && !(historial && k === 'historial')));
        agregarFila(hoja, columnas, { ...doc, otrosCampos: Object.keys(extras).length ? extras : null });
        for (const campo of referencias) {
          if (doc[campo]) usuarios.add(String(doc[campo]));
        }
        if (historial) {
          for (const [index, movimiento] of (doc.historial || []).entries()) {
            const { fecha, accion, descripcion, usuario, ...otros } = movimiento;
            agregarFila(historial, camposHistorial, { asignacionId: doc._id, orden: index + 1,
              fecha, accion, descripcion, usuario, otrosCampos: Object.keys(otros).length ? otros : null });
            if (usuario) usuarios.add(String(usuario));
          }
        }
      }
      hoja.commit();
      if (historial) historial.commit();
    }
    const campos = ['_id', 'nombre', 'correo', 'departamento', 'puesto'];
    const hoja = crearHoja(libro, 'Personas referenciadas', campos);
    const ids = [...usuarios].filter(id => mongoose.isObjectIdOrHexString(id));
    for await (const persona of User.find({ _id: { $in: ids } }).select(campos.join(' ')).session(session).lean().cursor()) {
      agregarFila(hoja, campos, persona);
    }
    hoja.commit();
    await libro.commit();
  } catch (error) {
    libro.stream.destroy();
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = exportarAlmacen;
