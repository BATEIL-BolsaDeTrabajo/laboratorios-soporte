// backend/routes/almacen.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Producto = require('../models/Producto');
const EntradaAlmacen = require('../models/EntradaAlmacen');
const SalidaAlmacen = require('../models/SalidaAlmacen');
const AjusteInventario = require('../models/AjusteInventario');
const AuditoriaInventario = require('../models/AuditoriaInventario');
const CatalogoAlmacen = require('../models/CatalogoAlmacen');
const AsignacionEquipo = require('../models/AsignacionEquipo');
const User = require('../models/User');
const ExcelJS = require('exceljs');

const { verifyToken, verifyRole } = require('../middlewares/auth');

const allowAlmacen = ['almacen', 'finanzas'];
const RESTRICTED_ALMACEN_EMAIL = 'almacen@bateil.edu.mx';
const ALLOW_DELETE_ENTRADAS_EMAIL = 'jose.garcia@bateil.edu.mx';
const LIMITE_PAGINA_DEFAULT = 25;
const LIMITE_PAGINA_MAXIMO = 100;
const TIPOS_CATALOGO_ALMACEN = ['categoria', 'unidadMedida', 'departamento', 'tipoSalida'];

function bloquearEntradasYProductosParaCorreo(req, res, next) {
  const email = (req.usuario?.email || '').toLowerCase();

  if (email === RESTRICTED_ALMACEN_EMAIL) {
    return res.status(403).json({
      mensaje: 'Acceso denegado: tu cuenta no tiene permiso para usar este módulo.'
    });
  }

  next();
}

/* ===========================
   Helpers
=========================== */

function validarProducto(body) {
  const errores = [];
  const { nombre, categoria, unidadMedida, codigo, tipoUso } = body;

  if (!String(nombre || '').trim()) errores.push('El nombre es obligatorio.');
  if (!String(categoria || '').trim()) errores.push('La categoría es obligatoria.');
  if (!String(unidadMedida || '').trim()) errores.push('La unidad de medida es obligatoria.');
  if (!String(codigo || '').trim()) errores.push('El código es obligatorio.');

  if (tipoUso && !['venta', 'interno'].includes(tipoUso)) {
    errores.push('El tipo de uso debe ser venta o interno.');
  }

  return errores;
}

function normalizarNumeroNoNegativo(valor, campo) {
  if (valor === undefined || valor === null || valor === '' || String(valor).trim() === '') {
    throw crearErrorHttp(`${campo} es obligatorio.`);
  }

  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw crearErrorHttp(`${campo} debe ser un número válido mayor o igual a cero.`);
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw crearErrorHttp(`${campo} debe ser un número válido mayor o igual a cero.`);
  }

  return numero;
}

function normalizarCantidadPositiva(valor, campo = 'La cantidad') {
  const numero = normalizarNumeroNoNegativo(valor, campo);
  if (numero <= 0) {
    throw crearErrorHttp(`${campo} debe ser mayor a cero.`);
  }

  return numero;
}

function obtenerContextoAuditoria(req) {
  if (!req) {
    return {
      usuarioEmail: '',
      requestId: '',
      ip: '',
      userAgent: ''
    };
  }

  const forwardedFor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();

  return {
    usuarioEmail: String(req.usuario?.email || '').toLowerCase(),
    requestId: String(req.get('x-request-id') || '').slice(0, 120),
    ip: forwardedFor || req.ip || req.socket?.remoteAddress || '',
    userAgent: String(req.get('user-agent') || '').slice(0, 500)
  };
}

function crearErrorHttp(mensaje, status = 400) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function registrarAuditoriaMovimientoEnTransaccion({
  producto,
  accion,
  cantidadAntes,
  cantidadDespues,
  usuarioId,
  detalle,
  movimientoId,
  movimientoModelo,
  cantidadMovimiento,
  referencia,
  metadatos,
  req,
  session
}) {
  const productoId = producto?._id || producto;

  await AuditoriaInventario.create([{
    producto: productoId,
    accion,
    cantidadAntes,
    cantidadDespues,
    usuario: usuarioId || null,
    detalle: detalle || '',
    movimientoId: movimientoId || undefined,
    movimientoModelo: movimientoModelo || undefined,
    cantidadMovimiento: cantidadMovimiento ?? null,
    referencia: referencia || '',
    metadatos: metadatos || {},
    ...obtenerContextoAuditoria(req)
  }], { session });
}

async function ejecutarTransaccionInventario(operacion) {
  const session = await mongoose.startSession();

  try {
    let resultado;

    await session.withTransaction(async () => {
      resultado = await operacion(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    return resultado;
  } finally {
    await session.endSession();
  }
}

function escaparRegex(valor) {
  return String(valor || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regexBusqueda(valor) {
  const texto = String(valor || '').trim();
  return texto ? new RegExp(escaparRegex(texto), 'i') : null;
}

function obtenerPaginacion(query) {
  const pagina = Math.max(Number.parseInt(query.pagina, 10) || 1, 1);
  const limiteSolicitado = Number.parseInt(query.limite, 10) || LIMITE_PAGINA_DEFAULT;
  const limite = Math.min(Math.max(limiteSolicitado, 1), LIMITE_PAGINA_MAXIMO);

  return { pagina, limite, skip: (pagina - 1) * limite };
}

function crearRespuestaPaginada(registros, total, paginacion) {
  return {
    registros,
    paginacion: {
      pagina: paginacion.pagina,
      limite: paginacion.limite,
      total,
      totalPaginas: Math.max(Math.ceil(total / paginacion.limite), 1)
    }
  };
}

function aplicarRangoFechas(filtro, campo, fechaInicio, fechaFin) {
  if (!fechaInicio && !fechaFin) return;

  filtro[campo] = {};
  if (fechaInicio) filtro[campo].$gte = new Date(`${fechaInicio}T00:00:00.000Z`);
  if (fechaFin) filtro[campo].$lte = new Date(`${fechaFin}T23:59:59.999Z`);
}

async function buscarProductosPorTexto(texto) {
  const regex = regexBusqueda(texto);
  if (!regex) return [];

  const productos = await Producto.find({
    $or: [{ nombre: regex }, { codigo: regex }]
  }).select('_id');

  return productos.map((producto) => producto._id);
}

function crearFiltroProductos(query) {
  const { nombre, categoria, estado, fechaInicio, fechaFin, q } = query;
  const filtro = {};
  const busqueda = regexBusqueda(q);

  if (nombre) filtro.nombre = regexBusqueda(nombre);
  if (categoria) filtro.categoria = regexBusqueda(categoria);
  if (estado) filtro.estado = estado;
  aplicarRangoFechas(filtro, 'createdAt', fechaInicio, fechaFin);

  if (busqueda) {
    filtro.$or = [
      { nombre: busqueda },
      { codigo: busqueda },
      { categoria: busqueda },
      { descripcion: busqueda }
    ];
  }

  return filtro;
}

async function crearFiltroEntradas(query) {
  const { productoId, proveedor, fechaInicio, fechaFin, recibido, q } = query;
  const filtro = {};

  if (productoId) filtro.producto = productoId;
  if (proveedor) filtro.proveedor = regexBusqueda(proveedor);
  aplicarRangoFechas(filtro, 'fecha', fechaInicio, fechaFin);

  if (typeof recibido !== 'undefined' && recibido !== '') {
    filtro.recibido = String(recibido).toLowerCase() === 'true';
  }

  const busqueda = regexBusqueda(q);
  if (busqueda) {
    const productos = await buscarProductosPorTexto(q);
    filtro.$or = [{ proveedor: busqueda }, { folio: busqueda }];
    if (productos.length) filtro.$or.push({ producto: { $in: productos } });
  }

  return filtro;
}

async function crearFiltroSalidas(query) {
  const { productoId, entregadoA, departamento, tipoSalida, fechaInicio, fechaFin, q } = query;
  const filtro = {};

  if (productoId) filtro.producto = productoId;
  if (entregadoA) filtro.entregadoA = regexBusqueda(entregadoA);
  if (departamento) filtro.departamento = regexBusqueda(departamento);
  if (tipoSalida) filtro.tipoSalida = regexBusqueda(tipoSalida);
  aplicarRangoFechas(filtro, 'fecha', fechaInicio, fechaFin);

  const busqueda = regexBusqueda(q);
  if (busqueda) {
    const productos = await buscarProductosPorTexto(q);
    filtro.$or = [
      { entregadoA: busqueda },
      { departamento: busqueda },
      { tipoSalida: busqueda },
      { comentarios: busqueda }
    ];
    if (productos.length) filtro.$or.push({ producto: { $in: productos } });
  }

  return filtro;
}

async function crearFiltroAjustes(query) {
  const { productoId, tipo, fechaInicio, fechaFin, q } = query;
  const filtro = {};

  if (productoId) filtro.producto = productoId;
  if (tipo) filtro.tipo = tipo;
  aplicarRangoFechas(filtro, 'fecha', fechaInicio, fechaFin);

  const busqueda = regexBusqueda(q);
  if (busqueda) {
    const productos = await buscarProductosPorTexto(q);
    filtro.$or = [{ motivo: busqueda }, { tipo: busqueda }];
    if (productos.length) filtro.$or.push({ producto: { $in: productos } });
  }

  return filtro;
}

async function enviarExcel(res, nombreArchivo, nombreHoja, columnas, filas) {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet(nombreHoja);

  hoja.columns = columnas;
  filas.forEach((fila) => hoja.addRow(fila));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columnas.length)}1` };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  await workbook.xlsx.write(res);
  res.end();
}

function limpiarTexto(valor) {
  return String(valor || '').trim();
}

function normalizarNombreCatalogo(valor) {
  return limpiarTexto(valor).toLocaleLowerCase('es-MX');
}

function resumenEquipo(asignacion) {
  const partes = [
    asignacion.tipoEquipo,
    asignacion.marca,
    asignacion.modelo,
    asignacion.numeroSerie ? `Serie: ${asignacion.numeroSerie}` : ''
  ].filter(Boolean);

  return partes.join(' ');
}

function crearMovimientoAsignacion(accion, descripcion, usuarioId) {
  return {
    accion,
    descripcion,
    usuario: usuarioId || null,
    fecha: new Date()
  };
}

/* ===========================
   RUTA SOLO PARA SELECTS
=========================== */

router.get(
  '/productos-select',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const productos = await Producto.find({ estado: 'activo', stockActual: { $gt: 0 } })
        .select('_id nombre codigo unidadMedida stockActual tipoUso')
        .sort({ nombre: 1 });

      return res.json(productos);
    } catch (err) {
      console.error('Error en /productos-select:', err);
      return res.status(500).json({ mensaje: 'Error al cargar productos' });
    }
  }
);

router.get(
  '/productos-select-entrada',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const productos = await Producto.find({ estado: 'activo' })
        .select('_id nombre codigo unidadMedida stockActual tipoUso')
        .sort({ nombre: 1 });

      return res.json(productos);
    } catch (err) {
      console.error('Error en /productos-select-entrada:', err);
      return res.status(500).json({ mensaje: 'Error al cargar productos' });
    }
  }
);

/* ===========================
   CATALOGOS ADMINISTRABLES
=========================== */

router.get(
  '/catalogos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { tipo, incluirInactivos } = req.query;
      const filtro = {};

      if (tipo) {
        if (!TIPOS_CATALOGO_ALMACEN.includes(tipo)) {
          return res.status(400).json({ mensaje: 'Tipo de catálogo no válido.' });
        }
        filtro.tipo = tipo;
      }

      if (String(incluirInactivos).toLowerCase() !== 'true') {
        filtro.activo = true;
      }

      const catalogos = await CatalogoAlmacen.find(filtro)
        .populate('actualizadoPor', 'nombre correo')
        .sort({ tipo: 1, orden: 1, nombre: 1 });

      res.json({ catalogos });
    } catch (err) {
      console.error('Error al obtener catálogos:', err);
      res.status(500).json({ mensaje: 'Error al obtener catálogos' });
    }
  }
);

router.post(
  '/catalogos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { tipo, nombre, orden } = req.body;
      const nombreLimpio = limpiarTexto(nombre);

      if (!TIPOS_CATALOGO_ALMACEN.includes(tipo) || !nombreLimpio) {
        return res.status(400).json({ mensaje: 'Tipo y nombre son obligatorios.' });
      }

      const catalogo = await CatalogoAlmacen.create({
        tipo,
        nombre: nombreLimpio,
        nombreNormalizado: normalizarNombreCatalogo(nombreLimpio),
        orden: orden === undefined ? 0 : normalizarNumeroNoNegativo(orden, 'El orden'),
        actualizadoPor: req.usuario?.id || null
      });

      res.status(201).json({ mensaje: 'Valor agregado al catálogo.', catalogo });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(400).json({ mensaje: 'Ese valor ya existe en este catálogo.' });
      }

      console.error('Error al crear catálogo:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al crear catálogo' });
    }
  }
);

router.put(
  '/catalogos/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, orden } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID no válido.' });
      }

      const catalogo = await CatalogoAlmacen.findById(id);
      if (!catalogo) return res.status(404).json({ mensaje: 'Valor de catálogo no encontrado.' });

      if (nombre !== undefined) {
        const nombreLimpio = limpiarTexto(nombre);
        if (!nombreLimpio) return res.status(400).json({ mensaje: 'El nombre es obligatorio.' });
        catalogo.nombre = nombreLimpio;
        catalogo.nombreNormalizado = normalizarNombreCatalogo(nombreLimpio);
      }

      if (orden !== undefined) {
        catalogo.orden = normalizarNumeroNoNegativo(orden, 'El orden');
      }

      catalogo.actualizadoPor = req.usuario?.id || null;
      await catalogo.save();

      res.json({ mensaje: 'Catálogo actualizado.', catalogo });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(400).json({ mensaje: 'Ese valor ya existe en este catálogo.' });
      }

      console.error('Error al actualizar catálogo:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al actualizar catálogo' });
    }
  }
);

router.patch(
  '/catalogos/:id/estado',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || typeof req.body.activo !== 'boolean') {
        return res.status(400).json({ mensaje: 'ID y estado válido son obligatorios.' });
      }

      const catalogo = await CatalogoAlmacen.findByIdAndUpdate(
        id,
        { activo: req.body.activo, actualizadoPor: req.usuario?.id || null },
        { new: true, runValidators: true }
      );

      if (!catalogo) return res.status(404).json({ mensaje: 'Valor de catálogo no encontrado.' });
      res.json({ mensaje: req.body.activo ? 'Valor activado.' : 'Valor desactivado.', catalogo });
    } catch (err) {
      console.error('Error al cambiar estado del catálogo:', err);
      res.status(500).json({ mensaje: 'Error al cambiar estado del catálogo' });
    }
  }
);

router.post(
  '/catalogos/sincronizar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const [productos, salidas] = await Promise.all([
        Producto.find({}).select('categoria unidadMedida').lean(),
        SalidaAlmacen.find({}).select('departamento tipoSalida').lean()
      ]);

      const fuentes = {
        categoria: productos.map((producto) => producto.categoria),
        unidadMedida: productos.map((producto) => producto.unidadMedida),
        departamento: salidas.map((salida) => salida.departamento),
        tipoSalida: salidas.map((salida) => salida.tipoSalida)
      };

      const operaciones = [];
      Object.entries(fuentes).forEach(([tipo, valores]) => {
        [...new Set(valores.map(limpiarTexto).filter(Boolean))].forEach((nombre) => {
          operaciones.push({
            updateOne: {
              filter: { tipo, nombreNormalizado: normalizarNombreCatalogo(nombre) },
              update: {
                $setOnInsert: {
                  tipo,
                  nombre,
                  nombreNormalizado: normalizarNombreCatalogo(nombre),
                  orden: 0,
                  activo: true,
                  actualizadoPor: req.usuario?.id || null
                }
              },
              upsert: true
            }
          });
        });
      });

      const resultado = operaciones.length
        ? await CatalogoAlmacen.bulkWrite(operaciones, { ordered: false })
        : { upsertedCount: 0 };

      res.json({
        mensaje: 'Catálogos sincronizados.',
        agregados: resultado.upsertedCount || 0
      });
    } catch (err) {
      console.error('Error al sincronizar catálogos:', err);
      res.status(500).json({ mensaje: 'Error al sincronizar catálogos' });
    }
  }
);

/* ===========================
   RUTAS DE PRODUCTOS
=========================== */

router.get(
  '/productos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const filtro = crearFiltroProductos(req.query);
      const paginacion = obtenerPaginacion(req.query);
      const [productos, total] = await Promise.all([
        Producto.find(filtro)
          .sort({ nombre: 1 })
          .skip(paginacion.skip)
          .limit(paginacion.limite),
        Producto.countDocuments(filtro)
      ]);

      res.json({
        productos,
        paginacion: crearRespuestaPaginada(productos, total, paginacion).paginacion
      });
    } catch (err) {
      console.error('Error al obtener productos:', err);
      res.status(500).json({ mensaje: 'Error al obtener productos' });
    }
  }
);

router.get(
  '/productos/exportar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const productos = await Producto.find(crearFiltroProductos(req.query)).sort({ nombre: 1 }).lean();

      await enviarExcel(
        res,
        'reporte-productos.xlsx',
        'Productos',
        [
          { header: 'Nombre', key: 'nombre', width: 32 },
          { header: 'Codigo', key: 'codigo', width: 20 },
          { header: 'Categoria', key: 'categoria', width: 24 },
          { header: 'Unidad', key: 'unidadMedida', width: 16 },
          { header: 'Tipo de uso', key: 'tipoUso', width: 16 },
          { header: 'Stock actual', key: 'stockActual', width: 15 },
          { header: 'Stock minimo', key: 'stockMinimo', width: 15 },
          { header: 'Estado', key: 'estado', width: 14 },
          { header: 'Descripcion', key: 'descripcion', width: 42 },
          { header: 'Creado', key: 'createdAt', width: 22 }
        ],
        productos.map((producto) => ({
          ...producto,
          createdAt: producto.createdAt ? new Date(producto.createdAt) : ''
        }))
      );
    } catch (err) {
      console.error('Error al exportar productos:', err);
      res.status(500).json({ mensaje: 'Error al exportar productos' });
    }
  }
);

router.get(
  '/productos/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);

      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      res.json({ producto });
    } catch (err) {
      console.error('Error al obtener producto:', err);
      res.status(500).json({ mensaje: 'Error al obtener producto' });
    }
  }
);

router.post(
  '/productos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      if (Object.prototype.hasOwnProperty.call(req.body, 'stockActual')) {
        return res.status(400).json({
          mensaje: 'El stock actual se modifica únicamente mediante entradas, salidas o ajustes.'
        });
      }

      const errores = validarProducto(req.body);

      if (errores.length > 0) {
        return res.status(400).json({ mensaje: 'Datos inválidos', errores });
      }

      const {
        nombre,
        categoria,
        unidadMedida,
        codigo,
        tipoUso,
        descripcion,
        stockMinimo,
        estado
      } = req.body;
      const stockMinimoNum = stockMinimo === undefined
        ? 0
        : normalizarNumeroNoNegativo(stockMinimo, 'El stock mínimo');

      const existente = await Producto.findOne({ codigo });

      if (existente) {
        return res.status(400).json({ mensaje: 'Ya existe un producto con ese código.' });
      }

      const nuevo = await Producto.create({
        nombre,
        categoria,
        unidadMedida,
        codigo,
        tipoUso: tipoUso || 'interno',
        descripcion: descripcion || '',
        stockMinimo: stockMinimoNum,
        stockActual: 0,
        estado: estado || 'activo'
      });

      res.status(201).json({
        mensaje: 'Producto creado correctamente',
        producto: nuevo
      });
    } catch (err) {
      console.error('Error al crear producto:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al crear producto' });
    }
  }
);

router.put(
  '/productos/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      if (Object.prototype.hasOwnProperty.call(req.body, 'stockActual')) {
        return res.status(400).json({
          mensaje: 'El stock actual se modifica únicamente mediante entradas, salidas o ajustes.'
        });
      }

      const producto = await Producto.findById(req.params.id);

      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      const errores = validarProducto({
        ...producto.toObject(),
        ...req.body
      });

      if (errores.length > 0) {
        return res.status(400).json({ mensaje: 'Datos inválidos', errores });
      }

      const {
        nombre,
        categoria,
        unidadMedida,
        codigo,
        tipoUso,
        descripcion,
        stockMinimo,
        estado
      } = req.body;

      if (nombre !== undefined) producto.nombre = nombre;
      if (categoria !== undefined) producto.categoria = categoria;
      if (unidadMedida !== undefined) producto.unidadMedida = unidadMedida;
      if (codigo !== undefined) producto.codigo = codigo;
      if (tipoUso !== undefined) producto.tipoUso = tipoUso;
      if (descripcion !== undefined) producto.descripcion = descripcion;
      if (stockMinimo !== undefined) {
        producto.stockMinimo = normalizarNumeroNoNegativo(stockMinimo, 'El stock mínimo');
      }
      if (estado !== undefined) producto.estado = estado;

      if (codigo) {
        const repetido = await Producto.findOne({
          _id: { $ne: producto._id },
          codigo
        });

        if (repetido) {
          return res.status(400).json({ mensaje: 'Ya existe otro producto con ese código.' });
        }
      }

      await producto.save();

      res.json({
        mensaje: 'Producto actualizado correctamente',
        producto
      });
    } catch (err) {
      console.error('Error al actualizar producto:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al actualizar producto' });
    }
  }
);

router.delete(
  '/productos/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  bloquearEntradasYProductosParaCorreo,
  async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);

      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      producto.estado = 'inactivo';
      await producto.save();

      res.json({
        mensaje: 'Producto marcado como inactivo',
        producto
      });
    } catch (err) {
      console.error('Error al eliminar producto:', err);
      res.status(500).json({ mensaje: 'Error al eliminar producto' });
    }
  }
);

router.get(
  '/resumen',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const totalProductos = await Producto.countDocuments({});

      const agg = await Producto.aggregate([
        {
          $group: {
            _id: null,
            totalInventario: { $sum: '$stockActual' }
          }
        }
      ]);

      const totalInventario = agg.length ? agg[0].totalInventario : 0;

      const productosBajoStock = await Producto.find({
        stockMinimo: { $gt: 0 },
        $expr: { $lte: ['$stockActual', '$stockMinimo'] },
        estado: 'activo'
      }).sort({ nombre: 1 });

      res.json({
        totalProductos,
        totalInventario,
        productosBajoStock
      });
    } catch (err) {
      console.error('Error al obtener resumen de almacén:', err);
      res.status(500).json({ mensaje: 'Error al obtener resumen de almacén' });
    }
  }
);

/* ===========================
   RUTAS DE ENTRADAS
=========================== */

router.post(
  '/entradas',
  verifyToken,
  verifyRole(allowAlmacen),
  bloquearEntradasYProductosParaCorreo,
  async (req, res) => {
    try {
      const { productoId, cantidad, proveedor, folio, fecha, clientRequestId } = req.body;

      if (!productoId) {
        return res.status(400).json({ mensaje: 'productoId es obligatorio.' });
      }

      const cantidadNum = normalizarCantidadPositiva(cantidad);

      if (!mongoose.Types.ObjectId.isValid(productoId)) {
        return res.status(400).json({ mensaje: 'productoId no es válido.' });
      }

      const resultado = await ejecutarTransaccionInventario(async (session) => {
        const productoAntes = await Producto.findByIdAndUpdate(
          productoId,
          { $inc: { stockActual: cantidadNum } },
          { new: false, session }
        );

        if (!productoAntes) {
          throw crearErrorHttp('Producto no encontrado.', 404);
        }

        const entradaData = {
          producto: productoAntes._id,
          cantidad: cantidadNum,
          proveedor: proveedor || '',
          folio: folio || '',
          fecha: fecha ? new Date(fecha) : new Date(),
          registradoPor: req.usuario?.id || null
        };

        if (clientRequestId) {
          entradaData.clientRequestId = String(clientRequestId);
        }

        const [entrada] = await EntradaAlmacen.create([entradaData], { session });
        const cantidadAntes = Number(productoAntes.stockActual || 0);
        const cantidadDespues = cantidadAntes + cantidadNum;

        await registrarAuditoriaMovimientoEnTransaccion({
          producto: productoAntes,
          accion: 'entrada',
          cantidadAntes,
          cantidadDespues,
          usuarioId: req.usuario?.id,
          detalle: `Entrada de ${cantidadNum} unidades.`,
          movimientoId: entrada._id,
          movimientoModelo: 'EntradaAlmacen',
          cantidadMovimiento: cantidadNum,
          referencia: entrada.folio,
          metadatos: {
            proveedor: entrada.proveedor,
            folio: entrada.folio,
            fechaMovimiento: entrada.fecha,
            clientRequestId: entrada.clientRequestId || ''
          },
          req,
          session
        });

        return {
          entrada,
          productoActualizado: {
            ...productoAntes.toObject(),
            stockActual: cantidadDespues
          }
        };
      });

      res.status(201).json({
        mensaje: 'Entrada registrada correctamente',
        entrada: resultado.entrada,
        productoActualizado: resultado.productoActualizado
      });
    } catch (err) {
      if (err?.code === 11000 && clientRequestId) {
        const existente = await EntradaAlmacen.findOne({ clientRequestId });
        return res.status(200).json({
          mensaje: 'Esta entrada ya habia sido registrada.',
          entrada: existente,
          duplicada: true
        });
      }

      console.error('Error al registrar entrada:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al registrar entrada' });
    }
  }
);

router.get(
  '/entradas',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const filtro = await crearFiltroEntradas(req.query);
      const paginacion = obtenerPaginacion(req.query);
      const [entradas, total] = await Promise.all([
        EntradaAlmacen.find(filtro)
          .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
          .populate('registradoPor', 'nombre email')
          .populate('recibidoPor', 'nombre email')
          .sort({ fecha: -1, createdAt: -1 })
          .skip(paginacion.skip)
          .limit(paginacion.limite),
        EntradaAlmacen.countDocuments(filtro)
      ]);

      res.json({
        entradas,
        paginacion: crearRespuestaPaginada(entradas, total, paginacion).paginacion
      });
    } catch (err) {
      console.error('Error al obtener entradas:', err);
      res.status(500).json({ mensaje: 'Error al obtener entradas' });
    }
  }
);

router.get(
  '/entradas/exportar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const entradas = await EntradaAlmacen.find(await crearFiltroEntradas(req.query))
        .populate('producto', 'nombre codigo unidadMedida')
        .populate('registradoPor', 'nombre email')
        .populate('recibidoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .lean();

      await enviarExcel(
        res,
        'reporte-entradas.xlsx',
        'Entradas',
        [
          { header: 'Fecha', key: 'fecha', width: 20 },
          { header: 'Producto', key: 'producto', width: 32 },
          { header: 'Codigo', key: 'codigo', width: 18 },
          { header: 'Cantidad', key: 'cantidad', width: 14 },
          { header: 'Unidad', key: 'unidad', width: 14 },
          { header: 'Proveedor', key: 'proveedor', width: 24 },
          { header: 'Folio', key: 'folio', width: 20 },
          { header: 'Registrado por', key: 'registradoPor', width: 28 },
          { header: 'Recibido', key: 'recibido', width: 14 },
          { header: 'Fecha recibido', key: 'fechaRecibido', width: 20 },
          { header: 'Recibido por', key: 'recibidoPor', width: 28 }
        ],
        entradas.map((entrada) => ({
          fecha: entrada.fecha ? new Date(entrada.fecha) : '',
          producto: entrada.producto?.nombre || '',
          codigo: entrada.producto?.codigo || '',
          cantidad: entrada.cantidad,
          unidad: entrada.producto?.unidadMedida || '',
          proveedor: entrada.proveedor,
          folio: entrada.folio,
          registradoPor: entrada.registradoPor?.nombre || entrada.registradoPor?.email || '',
          recibido: entrada.recibido ? 'Si' : 'No',
          fechaRecibido: entrada.fechaRecibido ? new Date(entrada.fechaRecibido) : '',
          recibidoPor: entrada.recibidoPor?.nombre || entrada.recibidoPor?.email || ''
        }))
      );
    } catch (err) {
      console.error('Error al exportar entradas:', err);
      res.status(500).json({ mensaje: 'Error al exportar entradas' });
    }
  }
);

router.patch(
  '/entradas/:id/recibir',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const entradaId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(entradaId)) {
        return res.status(400).json({ mensaje: 'ID inválido.' });
      }

      const entrada = await EntradaAlmacen.findById(entradaId);

      if (!entrada) {
        return res.status(404).json({ mensaje: 'Entrada no encontrada.' });
      }

      if (entrada.recibido) {
        return res.json({
          mensaje: 'Esta entrada ya estaba marcada como recibida.',
          entrada
        });
      }

      entrada.recibido = true;
      entrada.fechaRecibido = new Date();
      entrada.recibidoPor = req.usuario?.id || null;

      await entrada.save();

      const entradaPop = await EntradaAlmacen.findById(entradaId)
        .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
        .populate('registradoPor', 'nombre email')
        .populate('recibidoPor', 'nombre email');

      return res.json({
        mensaje: 'Entrada marcada como recibida ✅',
        entrada: entradaPop
      });
    } catch (err) {
      console.error('Error al marcar entrada como recibida:', err);
      return res.status(500).json({ mensaje: 'Error al marcar como recibida' });
    }
  }
);

router.delete(
  '/entradas/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const email = (req.usuario?.email || '').toLowerCase();

      if (email !== ALLOW_DELETE_ENTRADAS_EMAIL) {
        return res.status(403).json({ mensaje: 'Acceso denegado.' });
      }

      const entradaId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(entradaId)) {
        return res.status(400).json({ mensaje: 'ID inválido.' });
      }

      const resultado = await ejecutarTransaccionInventario(async (session) => {
        const entrada = await EntradaAlmacen.findById(entradaId).session(session);

        if (!entrada) {
          throw crearErrorHttp('Entrada no encontrada.', 404);
        }

        const cantidadEntrada = Number(entrada.cantidad || 0);
        const productoAntes = await Producto.findOneAndUpdate(
          { _id: entrada.producto, stockActual: { $gte: cantidadEntrada } },
          { $inc: { stockActual: -cantidadEntrada } },
          { new: false, session }
        );

        if (!productoAntes) {
          const productoExiste = await Producto.exists({ _id: entrada.producto }).session(session);
          if (!productoExiste) throw crearErrorHttp('Producto no encontrado.', 404);

          throw crearErrorHttp('No se puede eliminar: el stock actual es menor que la cantidad de la entrada.');
        }

        const stockAntes = Number(productoAntes.stockActual || 0);
        const stockDespues = stockAntes - cantidadEntrada;

        await EntradaAlmacen.deleteOne({ _id: entradaId }).session(session);

        await registrarAuditoriaMovimientoEnTransaccion({
          producto: productoAntes,
          accion: 'entrada_eliminada',
          cantidadAntes: stockAntes,
          cantidadDespues: stockDespues,
          usuarioId: req.usuario?.id,
          detalle: `Se eliminó entrada de ${cantidadEntrada} unidades. Folio: ${entrada.folio || '-'}`,
          movimientoId: entrada._id,
          movimientoModelo: 'EntradaAlmacen',
          cantidadMovimiento: -cantidadEntrada,
          referencia: entrada.folio,
          metadatos: {
            proveedor: entrada.proveedor,
            folio: entrada.folio,
            fechaMovimiento: entrada.fecha,
            eliminado: true
          },
          req,
          session
        });

        return {
          ...productoAntes.toObject(),
          stockActual: stockDespues
        };
      });

      return res.json({
        mensaje: 'Entrada eliminada y stock revertido ✅',
        productoActualizado: resultado
      });
    } catch (err) {
      console.error('Error al eliminar entrada:', err);
      return res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al eliminar entrada' });
    }
  }
);

/* ===========================
   RUTAS DE SALIDAS
=========================== */

router.post(
  '/salidas',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const {
        productoId,
        cantidad,
        entregadoA,
        departamento,
        tipoSalida,
        comentarios,
        fecha
      } = req.body;

      if (!productoId || !entregadoA || !departamento || !tipoSalida) {
        return res.status(400).json({
          mensaje: 'productoId, cantidad, entregadoA, departamento y tipoSalida son obligatorios.'
        });
      }

      const cantidadNum = normalizarCantidadPositiva(cantidad);

      if (!mongoose.Types.ObjectId.isValid(productoId)) {
        return res.status(400).json({ mensaje: 'productoId no es válido.' });
      }

      const resultado = await ejecutarTransaccionInventario(async (session) => {
        const productoAntes = await Producto.findOneAndUpdate(
          { _id: productoId, stockActual: { $gte: cantidadNum } },
          { $inc: { stockActual: -cantidadNum } },
          { new: false, session }
        );

        if (!productoAntes) {
          const producto = await Producto.findById(productoId).session(session);
          if (!producto) throw crearErrorHttp('Producto no encontrado.', 404);

          throw crearErrorHttp(`No hay suficiente stock. Stock actual: ${producto.stockActual || 0}`);
        }

        const cantidadAntes = Number(productoAntes.stockActual || 0);
        const cantidadDespues = cantidadAntes - cantidadNum;
        const [salida] = await SalidaAlmacen.create([{
          producto: productoAntes._id,
          cantidad: cantidadNum,
          entregadoA,
          departamento,
          tipoSalida,
          comentarios: comentarios || '',
          fecha: fecha ? new Date(fecha) : new Date(),
          realizadoPor: req.usuario?.id || null
        }], { session });

        await registrarAuditoriaMovimientoEnTransaccion({
          producto: productoAntes,
          accion: 'salida',
          cantidadAntes,
          cantidadDespues,
          usuarioId: req.usuario?.id,
          detalle: `Salida de ${cantidadNum} unidades para ${entregadoA} (${departamento}) - Tipo: ${tipoSalida}.`,
          movimientoId: salida._id,
          movimientoModelo: 'SalidaAlmacen',
          cantidadMovimiento: -cantidadNum,
          referencia: salida.tipoSalida,
          metadatos: {
            entregadoA: salida.entregadoA,
            departamento: salida.departamento,
            tipoSalida: salida.tipoSalida,
            comentarios: salida.comentarios,
            fechaMovimiento: salida.fecha
          },
          req,
          session
        });

        return {
          salida,
          productoActualizado: {
            ...productoAntes.toObject(),
            stockActual: cantidadDespues
          },
          alertaBajoStock: productoAntes.stockMinimo > 0 && cantidadDespues <= productoAntes.stockMinimo
        };
      });

      res.status(201).json({
        mensaje: 'Salida registrada correctamente',
        salida: resultado.salida,
        productoActualizado: resultado.productoActualizado,
        alertaBajoStock: resultado.alertaBajoStock
      });
    } catch (err) {
      console.error('Error al registrar salida:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al registrar salida' });
    }
  }
);

router.get(
  '/salidas',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const filtro = await crearFiltroSalidas(req.query);
      const paginacion = obtenerPaginacion(req.query);
      const [salidas, total] = await Promise.all([
        SalidaAlmacen.find(filtro)
          .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
          .populate('realizadoPor', 'nombre email')
          .sort({ fecha: -1, createdAt: -1 })
          .skip(paginacion.skip)
          .limit(paginacion.limite),
        SalidaAlmacen.countDocuments(filtro)
      ]);

      res.json({
        salidas,
        paginacion: crearRespuestaPaginada(salidas, total, paginacion).paginacion
      });
    } catch (err) {
      console.error('Error al obtener salidas:', err);
      res.status(500).json({ mensaje: 'Error al obtener salidas' });
    }
  }
);

router.get(
  '/salidas/exportar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const salidas = await SalidaAlmacen.find(await crearFiltroSalidas(req.query))
        .populate('producto', 'nombre codigo unidadMedida')
        .populate('realizadoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .lean();

      await enviarExcel(
        res,
        'reporte-salidas.xlsx',
        'Salidas',
        [
          { header: 'Fecha', key: 'fecha', width: 20 },
          { header: 'Producto', key: 'producto', width: 32 },
          { header: 'Codigo', key: 'codigo', width: 18 },
          { header: 'Cantidad', key: 'cantidad', width: 14 },
          { header: 'Unidad', key: 'unidad', width: 14 },
          { header: 'Entregado a', key: 'entregadoA', width: 28 },
          { header: 'Departamento', key: 'departamento', width: 24 },
          { header: 'Tipo de salida', key: 'tipoSalida', width: 20 },
          { header: 'Comentarios', key: 'comentarios', width: 40 },
          { header: 'Realizado por', key: 'realizadoPor', width: 28 }
        ],
        salidas.map((salida) => ({
          fecha: salida.fecha ? new Date(salida.fecha) : '',
          producto: salida.producto?.nombre || '',
          codigo: salida.producto?.codigo || '',
          cantidad: salida.cantidad,
          unidad: salida.producto?.unidadMedida || '',
          entregadoA: salida.entregadoA,
          departamento: salida.departamento,
          tipoSalida: salida.tipoSalida,
          comentarios: salida.comentarios,
          realizadoPor: salida.realizadoPor?.nombre || salida.realizadoPor?.email || ''
        }))
      );
    } catch (err) {
      console.error('Error al exportar salidas:', err);
      res.status(500).json({ mensaje: 'Error al exportar salidas' });
    }
  }
);

/* ===========================
   MOVIMIENTOS RECIENTES
=========================== */

router.get(
  '/movimientos-recientes',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const limite = Number(req.query.limite) || 10;

      const entradasRecientes = await EntradaAlmacen.find({})
        .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
        .populate('registradoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .limit(limite);

      const salidasRecientes = await SalidaAlmacen.find({})
        .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
        .populate('realizadoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .limit(limite);

      res.json({
        entradasRecientes,
        salidasRecientes
      });
    } catch (err) {
      console.error('Error al obtener movimientos recientes:', err);
      res.status(500).json({ mensaje: 'Error al obtener movimientos recientes' });
    }
  }
);

/* ===========================
   AJUSTES DE INVENTARIO
=========================== */

router.post(
  '/ajustes',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { productoId, tipo, cantidad, motivo } = req.body;

      if (!productoId || !tipo || cantidad === undefined || cantidad === null || cantidad === '' || !motivo) {
        return res.status(400).json({
          mensaje: 'productoId, tipo, cantidad y motivo son obligatorios.'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(productoId)) {
        return res.status(400).json({ mensaje: 'productoId no es válido' });
      }

      if (!['merma', 'devolucion', 'error'].includes(tipo)) {
        return res.status(400).json({ mensaje: 'Tipo de ajuste no válido.' });
      }

      const cantidadNum = tipo === 'error'
        ? normalizarNumeroNoNegativo(cantidad, 'La cantidad')
        : normalizarCantidadPositiva(cantidad);

      const resultado = await ejecutarTransaccionInventario(async (session) => {
        const producto = await Producto.findById(productoId).session(session);

        if (!producto) {
          throw crearErrorHttp('Producto no encontrado.', 404);
        }

        const cantidadAntes = Number(producto.stockActual || 0);
        let productoAntes;
        let cantidadDespues;

        if (tipo === 'merma') {
          productoAntes = await Producto.findOneAndUpdate(
            { _id: productoId, stockActual: { $gte: cantidadNum } },
            { $inc: { stockActual: -cantidadNum } },
            { new: false, session }
          );

          if (!productoAntes) {
            throw crearErrorHttp(`La merma no puede ser mayor al stock actual (${cantidadAntes}).`);
          }

          cantidadDespues = cantidadAntes - cantidadNum;
        } else if (tipo === 'devolucion') {
          productoAntes = await Producto.findByIdAndUpdate(
            productoId,
            { $inc: { stockActual: cantidadNum } },
            { new: false, session }
          );
          cantidadDespues = cantidadAntes + cantidadNum;
        } else {
          productoAntes = await Producto.findOneAndUpdate(
            { _id: productoId, stockActual: cantidadAntes },
            { $set: { stockActual: cantidadNum } },
            { new: false, session }
          );

          if (!productoAntes) {
            throw crearErrorHttp('El stock cambió durante el ajuste. Intenta nuevamente.', 409);
          }

          cantidadDespues = cantidadNum;
        }

        const [ajuste] = await AjusteInventario.create([{
          producto: producto._id,
          tipo,
          cantidad: cantidadNum,
          motivo,
          realizadoPor: req.usuario.id
        }], { session });

        await registrarAuditoriaMovimientoEnTransaccion({
          producto: productoAntes,
          accion: `ajuste_${tipo}`,
          cantidadAntes,
          cantidadDespues,
          usuarioId: req.usuario.id,
          detalle: `Ajuste (${tipo}): ${motivo}`,
          movimientoId: ajuste._id,
          movimientoModelo: 'AjusteInventario',
          cantidadMovimiento: cantidadDespues - cantidadAntes,
          referencia: tipo,
          metadatos: {
            tipo,
            motivo: ajuste.motivo,
            cantidadCapturada: ajuste.cantidad,
            fechaMovimiento: ajuste.fecha
          },
          req,
          session
        });

        return {
          ajuste,
          productoActualizado: {
            ...productoAntes.toObject(),
            stockActual: cantidadDespues
          }
        };
      });

      res.status(201).json({
        mensaje: 'Ajuste registrado correctamente',
        ajuste: resultado.ajuste,
        productoActualizado: resultado.productoActualizado
      });
    } catch (err) {
      console.error('Error al registrar ajuste:', err);
      res.status(err.status || 500).json({ mensaje: err.status ? err.message : 'Error al registrar ajuste' });
    }
  }
);

router.get(
  '/ajustes',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const filtro = await crearFiltroAjustes(req.query);
      const paginacion = obtenerPaginacion(req.query);
      const [ajustes, total] = await Promise.all([
        AjusteInventario.find(filtro)
          .populate('producto', 'nombre codigo categoria unidadMedida tipoUso')
          .populate('realizadoPor', 'nombre email')
          .sort({ fecha: -1, createdAt: -1 })
          .skip(paginacion.skip)
          .limit(paginacion.limite),
        AjusteInventario.countDocuments(filtro)
      ]);

      res.json({
        ajustes,
        paginacion: crearRespuestaPaginada(ajustes, total, paginacion).paginacion
      });
    } catch (err) {
      console.error('Error al obtener ajustes:', err);
      res.status(500).json({ mensaje: 'Error al obtener ajustes' });
    }
  }
);

router.get(
  '/ajustes/exportar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const ajustes = await AjusteInventario.find(await crearFiltroAjustes(req.query))
        .populate('producto', 'nombre codigo unidadMedida')
        .populate('realizadoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .lean();

      await enviarExcel(
        res,
        'reporte-ajustes.xlsx',
        'Ajustes',
        [
          { header: 'Fecha', key: 'fecha', width: 20 },
          { header: 'Producto', key: 'producto', width: 32 },
          { header: 'Codigo', key: 'codigo', width: 18 },
          { header: 'Unidad', key: 'unidad', width: 14 },
          { header: 'Tipo', key: 'tipo', width: 16 },
          { header: 'Cantidad', key: 'cantidad', width: 14 },
          { header: 'Motivo', key: 'motivo', width: 42 },
          { header: 'Realizado por', key: 'realizadoPor', width: 28 }
        ],
        ajustes.map((ajuste) => ({
          fecha: ajuste.fecha ? new Date(ajuste.fecha) : '',
          producto: ajuste.producto?.nombre || '',
          codigo: ajuste.producto?.codigo || '',
          unidad: ajuste.producto?.unidadMedida || '',
          tipo: ajuste.tipo,
          cantidad: ajuste.cantidad,
          motivo: ajuste.motivo,
          realizadoPor: ajuste.realizadoPor?.nombre || ajuste.realizadoPor?.email || ''
        }))
      );
    } catch (err) {
      console.error('Error al exportar ajustes:', err);
      res.status(500).json({ mensaje: 'Error al exportar ajustes' });
    }
  }
);

/* ===========================
   ASIGNACION DE EQUIPO
=========================== */

router.get(
  '/mis-equipos',
  verifyToken,
  async (req, res) => {
    try {
      const equipos = await AsignacionEquipo.find({
        colaborador: req.usuario?.id,
        estadoAsignacion: 'activo'
      })
        .select('tipoEquipo marca modelo numeroSerie numeroInventario estadoEquipo fechaAsignacion observaciones estadoAsignacion aceptadoPorColaborador fechaAceptacion')
        .sort({ fechaAsignacion: -1, createdAt: -1 });

      res.json({ equipos });
    } catch (err) {
      console.error('Error al obtener mis equipos:', err);
      res.status(500).json({ mensaje: 'Error al obtener mis equipos' });
    }
  }
);

router.patch(
  '/mis-equipos/:id/aceptar',
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID no valido.' });
      }

      const asignacion = await AsignacionEquipo.findOne({
        _id: id,
        colaborador: req.usuario?.id,
        estadoAsignacion: 'activo'
      });

      if (!asignacion) {
        return res.status(404).json({ mensaje: 'Equipo asignado no encontrado.' });
      }

      if (asignacion.aceptadoPorColaborador) {
        return res.json({
          mensaje: 'Ya habias aceptado este equipo.',
          asignacion
        });
      }

      asignacion.aceptadoPorColaborador = true;
      asignacion.fechaAceptacion = new Date();
      asignacion.historial.push(crearMovimientoAsignacion(
        'equipo_aceptado',
        'El colaborador acepto estar de acuerdo con el equipo asignado.',
        req.usuario?.id
      ));

      await asignacion.save();

      res.json({
        mensaje: 'Equipo aceptado correctamente.',
        asignacion
      });
    } catch (err) {
      console.error('Error al aceptar equipo asignado:', err);
      res.status(500).json({ mensaje: 'Error al aceptar equipo asignado' });
    }
  }
);

router.get(
  '/asignaciones-equipo/colaboradores',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const usuarios = await User.find({})
        .select('nombre correo departamento puesto')
        .sort({ nombre: 1 });

      res.json({ colaboradores: usuarios });
    } catch (err) {
      console.error('Error al obtener colaboradores:', err);
      res.status(500).json({ mensaje: 'Error al obtener colaboradores' });
    }
  }
);

router.get(
  '/asignaciones-equipo',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { q, departamento, estado = 'activo' } = req.query;
      const filtroAsignaciones = {};

      if (estado && estado !== 'todos') {
        filtroAsignaciones.estadoAsignacion = estado;
      }

      const [usuarios, asignaciones] = await Promise.all([
        User.find({})
          .select('nombre correo departamento puesto')
          .sort({ nombre: 1 }),
        AsignacionEquipo.find(filtroAsignaciones)
          .populate('colaborador', 'nombre correo departamento puesto')
          .populate('historial.usuario', 'nombre correo')
          .sort({ fechaAsignacion: -1, createdAt: -1 })
      ]);

      const asignacionesPorUsuario = new Map();
      asignaciones.forEach((asignacion) => {
        const id = String(asignacion.colaborador?._id || asignacion.colaborador);
        if (!asignacionesPorUsuario.has(id)) asignacionesPorUsuario.set(id, []);
        asignacionesPorUsuario.get(id).push(asignacion);
      });

      const texto = limpiarTexto(q).toLowerCase();
      const area = limpiarTexto(departamento).toLowerCase();

      const colaboradores = usuarios
        .map((usuario) => {
          const equipos = asignacionesPorUsuario.get(String(usuario._id)) || [];
          const ultimaAsignacion = equipos
            .map((equipo) => equipo.fechaAsignacion)
            .filter(Boolean)
            .sort((a, b) => new Date(b) - new Date(a))[0] || null;

          return {
            colaborador: usuario,
            cantidadEquipos: equipos.length,
            equipos,
            equiposResumen: equipos.map(resumenEquipo).join(', '),
            ultimaAsignacion
          };
        })
        .filter((fila) => {
          if (area && !String(fila.colaborador.departamento || '').toLowerCase().includes(area)) {
            return false;
          }

          if (!texto) return true;

          const busqueda = [
            fila.colaborador.nombre,
            fila.colaborador.correo,
            fila.colaborador.departamento,
            fila.colaborador.puesto,
            fila.equiposResumen
          ].join(' ').toLowerCase();

          return busqueda.includes(texto);
        });

      res.json({ colaboradores });
    } catch (err) {
      console.error('Error al obtener asignaciones de equipo:', err);
      res.status(500).json({ mensaje: 'Error al obtener asignaciones de equipo' });
    }
  }
);

router.post(
  '/asignaciones-equipo',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const {
        colaborador,
        tipoEquipo,
        marca,
        modelo,
        numeroSerie,
        numeroInventario,
        estadoEquipo,
        fechaAsignacion,
        observaciones
      } = req.body;

      if (!mongoose.Types.ObjectId.isValid(colaborador)) {
        return res.status(400).json({ mensaje: 'Colaborador no valido.' });
      }

      const usuario = await User.findById(colaborador);
      if (!usuario) {
        return res.status(404).json({ mensaje: 'Colaborador no encontrado.' });
      }

      const requerido = [tipoEquipo, marca, modelo, numeroSerie].map(limpiarTexto);
      if (requerido.some((valor) => !valor)) {
        return res.status(400).json({ mensaje: 'Tipo, marca, modelo y numero de serie son obligatorios.' });
      }

      const asignacion = new AsignacionEquipo({
        colaborador,
        tipoEquipo: limpiarTexto(tipoEquipo),
        marca: limpiarTexto(marca),
        modelo: limpiarTexto(modelo),
        numeroSerie: limpiarTexto(numeroSerie),
        numeroInventario: limpiarTexto(numeroInventario),
        estadoEquipo: estadoEquipo || 'bueno',
        fechaAsignacion: fechaAsignacion ? new Date(fechaAsignacion) : new Date(),
        observaciones: limpiarTexto(observaciones)
      });

      asignacion.historial.push(crearMovimientoAsignacion(
        'equipo_asignado',
        `Equipo asignado a ${usuario.nombre}: ${resumenEquipo(asignacion)}.`,
        req.usuario?.id
      ));

      await asignacion.save();

      res.status(201).json({
        mensaje: 'Equipo asignado correctamente',
        asignacion
      });
    } catch (err) {
      console.error('Error al crear asignacion de equipo:', err);
      res.status(500).json({ mensaje: 'Error al crear asignacion de equipo' });
    }
  }
);

router.put(
  '/asignaciones-equipo/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID no valido.' });
      }

      const asignacion = await AsignacionEquipo.findById(id).populate('colaborador', 'nombre');
      if (!asignacion) {
        return res.status(404).json({ mensaje: 'Asignacion no encontrada.' });
      }

      const campos = [
        'tipoEquipo',
        'marca',
        'modelo',
        'numeroSerie',
        'numeroInventario',
        'estadoEquipo',
        'observaciones'
      ];
      const cambios = [];

      campos.forEach((campo) => {
        if (typeof req.body[campo] === 'undefined') return;

        const nuevoValor = campo === 'estadoEquipo'
          ? req.body[campo]
          : limpiarTexto(req.body[campo]);

        if (String(asignacion[campo] || '') !== String(nuevoValor || '')) {
          cambios.push(`${campo}: ${asignacion[campo] || '-'} -> ${nuevoValor || '-'}`);
          asignacion[campo] = nuevoValor;
        }
      });

      if (req.body.fechaAsignacion) {
        const nuevaFecha = new Date(req.body.fechaAsignacion);
        if (String(asignacion.fechaAsignacion?.toISOString().slice(0, 10)) !== req.body.fechaAsignacion) {
          cambios.push(`fechaAsignacion: ${asignacion.fechaAsignacion?.toISOString().slice(0, 10) || '-'} -> ${req.body.fechaAsignacion}`);
          asignacion.fechaAsignacion = nuevaFecha;
        }
      }

      if (!cambios.length) {
        return res.json({ mensaje: 'No hubo cambios para guardar.', asignacion });
      }

      asignacion.historial.push(crearMovimientoAsignacion(
        'equipo_actualizado',
        `Equipo actualizado. ${cambios.join('; ')}`,
        req.usuario?.id
      ));

      await asignacion.save();

      res.json({
        mensaje: 'Equipo actualizado correctamente',
        asignacion
      });
    } catch (err) {
      console.error('Error al actualizar asignacion de equipo:', err);
      res.status(500).json({ mensaje: 'Error al actualizar asignacion de equipo' });
    }
  }
);

router.patch(
  '/asignaciones-equipo/:id/retirar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;
      const motivo = limpiarTexto(req.body.motivoRetiro);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID no valido.' });
      }

      const asignacion = await AsignacionEquipo.findById(id).populate('colaborador', 'nombre');
      if (!asignacion) {
        return res.status(404).json({ mensaje: 'Asignacion no encontrada.' });
      }

      if (asignacion.estadoAsignacion === 'retirado') {
        return res.status(400).json({ mensaje: 'El equipo ya fue retirado.' });
      }

      asignacion.estadoAsignacion = 'retirado';
      asignacion.fechaRetiro = new Date();
      asignacion.motivoRetiro = motivo;
      asignacion.historial.push(crearMovimientoAsignacion(
        'equipo_retirado',
        `Equipo retirado de ${asignacion.colaborador?.nombre || 'colaborador'}. ${motivo || ''}`.trim(),
        req.usuario?.id
      ));

      await asignacion.save();

      res.json({
        mensaje: 'Equipo retirado correctamente',
        asignacion
      });
    } catch (err) {
      console.error('Error al retirar equipo:', err);
      res.status(500).json({ mensaje: 'Error al retirar equipo' });
    }
  }
);

router.patch(
  '/asignaciones-equipo/:id/reasignar',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { colaborador } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(colaborador)) {
        return res.status(400).json({ mensaje: 'Datos no validos.' });
      }

      const [asignacion, nuevoColaborador] = await Promise.all([
        AsignacionEquipo.findById(id).populate('colaborador', 'nombre'),
        User.findById(colaborador).select('nombre')
      ]);

      if (!asignacion) {
        return res.status(404).json({ mensaje: 'Asignacion no encontrada.' });
      }

      if (!nuevoColaborador) {
        return res.status(404).json({ mensaje: 'Nuevo colaborador no encontrado.' });
      }

      const colaboradorAnterior = asignacion.colaborador?.nombre || 'colaborador anterior';
      asignacion.colaborador = nuevoColaborador._id;
      asignacion.estadoAsignacion = 'activo';
      asignacion.aceptadoPorColaborador = false;
      asignacion.fechaAceptacion = undefined;
      asignacion.fechaRetiro = undefined;
      asignacion.motivoRetiro = '';
      asignacion.fechaAsignacion = new Date();
      asignacion.historial.push(crearMovimientoAsignacion(
        'equipo_reasignado',
        `Equipo reasignado de ${colaboradorAnterior} a ${nuevoColaborador.nombre}.`,
        req.usuario?.id
      ));

      await asignacion.save();

      res.json({
        mensaje: 'Equipo reasignado correctamente',
        asignacion
      });
    } catch (err) {
      console.error('Error al reasignar equipo:', err);
      res.status(500).json({ mensaje: 'Error al reasignar equipo' });
    }
  }
);

router.get(
  '/asignaciones-equipo/export',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const asignaciones = await AsignacionEquipo.find({})
        .populate('colaborador', 'nombre correo departamento puesto')
        .sort({ fechaAsignacion: -1, createdAt: -1 });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Equipos asignados');

      sheet.columns = [
        { header: 'Colaborador', key: 'colaborador', width: 32 },
        { header: 'Correo', key: 'correo', width: 34 },
        { header: 'Area', key: 'area', width: 24 },
        { header: 'Puesto', key: 'puesto', width: 24 },
        { header: 'Tipo de equipo', key: 'tipoEquipo', width: 18 },
        { header: 'Marca', key: 'marca', width: 18 },
        { header: 'Modelo', key: 'modelo', width: 22 },
        { header: 'Numero de serie', key: 'numeroSerie', width: 24 },
        { header: 'Numero de inventario', key: 'numeroInventario', width: 24 },
        { header: 'Estado del equipo', key: 'estadoEquipo', width: 22 },
        { header: 'Estado asignacion', key: 'estadoAsignacion', width: 20 },
        { header: 'Aceptado por colaborador', key: 'aceptadoPorColaborador', width: 26 },
        { header: 'Fecha aceptacion', key: 'fechaAceptacion', width: 20 },
        { header: 'Fecha asignacion', key: 'fechaAsignacion', width: 20 },
        { header: 'Fecha retiro', key: 'fechaRetiro', width: 20 },
        { header: 'Observaciones', key: 'observaciones', width: 40 }
      ];

      asignaciones.forEach((asignacion) => {
        sheet.addRow({
          colaborador: asignacion.colaborador?.nombre || '',
          correo: asignacion.colaborador?.correo || '',
          area: asignacion.colaborador?.departamento || '',
          puesto: asignacion.colaborador?.puesto || '',
          tipoEquipo: asignacion.tipoEquipo,
          marca: asignacion.marca,
          modelo: asignacion.modelo,
          numeroSerie: asignacion.numeroSerie,
          numeroInventario: asignacion.numeroInventario,
          estadoEquipo: asignacion.estadoEquipo,
          estadoAsignacion: asignacion.estadoAsignacion,
          aceptadoPorColaborador: asignacion.aceptadoPorColaborador ? 'Si' : 'No',
          fechaAceptacion: asignacion.fechaAceptacion || '',
          fechaAsignacion: asignacion.fechaAsignacion,
          fechaRetiro: asignacion.fechaRetiro || '',
          observaciones: asignacion.observaciones
        });
      });

      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=\"equipos-asignados.xlsx\"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('Error al exportar asignaciones de equipo:', err);
      res.status(500).json({ mensaje: 'Error al exportar asignaciones de equipo' });
    }
  }
);

/* ===========================
   HISTORIAL COMPLETO DE UN PRODUCTO
=========================== */

router.get(
  '/productos/:id/historial',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID no válido' });
      }

      const producto = await Producto.findById(id);

      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      const entradas = await EntradaAlmacen.find({ producto: id })
        .sort({ fecha: -1 })
        .populate('registradoPor', 'nombre email');

      const salidas = await SalidaAlmacen.find({ producto: id })
        .sort({ fecha: -1 })
        .populate('realizadoPor', 'nombre email');

      const ajustes = await AjusteInventario.find({ producto: id })
        .sort({ fecha: -1 })
        .populate('realizadoPor', 'nombre email');

      const auditoria = await AuditoriaInventario.find({ producto: id })
        .sort({ fecha: -1 })
        .populate('usuario', 'nombre email');

      res.json({
        producto,
        entradas,
        salidas,
        ajustes,
        auditoria
      });
    } catch (err) {
      console.error('Error al obtener historial:', err);
      res.status(500).json({ mensaje: 'Error al obtener historial del producto' });
    }
  }
);

/* ===========================
   ELIMINAR DEFINITIVAMENTE PRODUCTO
=========================== */

router.delete(
  '/productos/eliminar-definitivo/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const email = (req.usuario?.email || '').toLowerCase();

      const correosPermitidos = [
        'jose.garcia@bateil.edu.mx',
        'rosario.gonzalez@bateil.edu.mx'
      ];

      if (!correosPermitidos.includes(email)) {
        return res.status(403).json({
          mensaje: 'No tienes permiso para eliminar definitivamente.'
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: 'ID inválido.' });
      }

      const producto = await Producto.findById(id);

      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado.' });
      }

      await Producto.deleteOne({ _id: id });

      return res.json({
        mensaje: 'Producto eliminado definitivamente ✅'
      });
    } catch (error) {
      console.error('Error al eliminar definitivo:', error);
      return res.status(500).json({ mensaje: 'Error del servidor.' });
    }
  }
);

module.exports = router;
