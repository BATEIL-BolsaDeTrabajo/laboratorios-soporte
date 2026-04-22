// backend/routes/almacen.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Producto = require('../models/Producto');
const EntradaAlmacen = require('../models/EntradaAlmacen');
const SalidaAlmacen = require('../models/SalidaAlmacen');
const AjusteInventario = require('../models/AjusteInventario');
const AuditoriaInventario = require('../models/AuditoriaInventario');

const { verifyToken, verifyRole } = require('../middlewares/auth');


// 🔐 Solo pueden usar este módulo: almacen y finanzas
const allowAlmacen = ['almacen', 'finanzas'];

// 🚫 Restricción especial por correo
const RESTRICTED_ALMACEN_EMAIL = 'almacen@bateil.edu.mx';

// ✅ Solo este correo puede eliminar entradas
const ALLOW_DELETE_ENTRADAS_EMAIL = 'jose.garcia@bateil.edu.mx';

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
  const {
    nombre,
    categoria,
    unidadMedida,
    codigo
  } = body;

  if (!nombre) errores.push('El nombre es obligatorio.');
  if (!categoria) errores.push('La categoría es obligatoria.');
  if (!unidadMedida) errores.push('La unidad de medida es obligatoria.');
  if (!codigo) errores.push('El código es obligatorio.');

  return errores;
}

// Registra auditoría de inventario (no rompe si falla)
async function registrarAuditoriaMovimiento({
  producto,
  accion,
  cantidadAntes,
  cantidadDespues,
  usuarioId,
  detalle
}) {
  try {
    const productoId = producto?._id || producto;

    await AuditoriaInventario.create({
      producto: productoId,
      accion,
      cantidadAntes,
      cantidadDespues,
      usuario: usuarioId || null,
      detalle: detalle || ''
    });
  } catch (err) {
    console.error('Error al registrar auditoría de inventario:', err);
  }
}

/* ===========================
   RUTA SOLO PARA SELECTS
   (Permite cargar productos para Salidas/Ajustes,
   sin dar acceso al CRUD de Productos)
=========================== */

/**
 * GET /api/almacen/productos-select
 * Lista mínima de productos activos para llenar selects
 */
router.get(
  '/productos-select',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const productos = await Producto.find({ estado: 'activo', stockActual: { $gt: 0 } })
        .select('_id nombre codigo unidadMedida stockActual')
        .sort({ nombre: 1 });

      return res.json(productos);
    } catch (err) {
      console.error('Error en /productos-select:', err);
      return res.status(500).json({ mensaje: 'Error al cargar productos' });
    }
  }
);

// ✅ Productos para Entradas (incluye stock 0)
router.get(
  "/productos-select-entrada",
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const productos = await Producto.find({ estado: "activo" })
        .select("_id nombre codigo unidadMedida stockActual")
        .sort({ nombre: 1 });

      return res.json(productos);
    } catch (err) {
      console.error("Error en /productos-select-entrada:", err);
      return res.status(500).json({ mensaje: "Error al cargar productos" });
    }
  }
);


/* ===========================
   RUTAS DE PRODUCTOS
=========================== */

/**
 * GET /api/almacen/productos
 * Lista de productos con filtros:
 *  - nombre (contains)
 *  - categoria
 *  - estado (activo/inactivo)
 */
router.get(
  '/productos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { nombre, categoria, estado, fechaInicio, fechaFin } = req.query;

      const filtro = {};

      if (nombre) {
        filtro.nombre = { $regex: nombre, $options: 'i' };
      }

      if (categoria) {
        filtro.categoria = { $regex: categoria, $options: 'i' };
      }

      if (estado) {
        filtro.estado = estado;
      }

      if (fechaInicio || fechaFin) {
        filtro.createdAt = {};

        if (fechaInicio) {
          filtro.createdAt.$gte = new Date(`${fechaInicio}T00:00:00.000Z`);
        }

        if (fechaFin) {
          filtro.createdAt.$lte = new Date(`${fechaFin}T23:59:59.999Z`);
        }
      }

      const productos = await Producto.find(filtro).sort({ nombre: 1 });

      res.json({ productos });
    } catch (err) {
      console.error('Error al obtener productos:', err);
      res.status(500).json({ mensaje: 'Error al obtener productos' });
    }
  }
);

/**
 * GET /api/almacen/productos/:id
 * Obtener un producto por ID
 */
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

/**
 * POST /api/almacen/productos
 * Crear nuevo producto
 */
router.post(
  '/productos',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const errores = validarProducto(req.body);
      if (errores.length > 0) {
        return res.status(400).json({ mensaje: 'Datos inválidos', errores });
      }

      const {
        nombre,
        categoria,
        unidadMedida,
        codigo,
        descripcion,
        stockMinimo,
        stockActual,
        estado
      } = req.body;

      // Verificar código único
      const existente = await Producto.findOne({ codigo });
      if (existente) {
        return res.status(400).json({ mensaje: 'Ya existe un producto con ese código.' });
      }

      const nuevo = await Producto.create({
        nombre,
        categoria,
        unidadMedida,
        codigo,
        descripcion: descripcion || '',
        stockMinimo: stockMinimo || 0,
        stockActual: stockActual || 0,
        estado: estado || 'activo'
      });

      res.status(201).json({
        mensaje: 'Producto creado correctamente',
        producto: nuevo
      });
    } catch (err) {
      console.error('Error al crear producto:', err);
      res.status(500).json({ mensaje: 'Error al crear producto' });
    }
  }
);

/**
 * PUT /api/almacen/productos/:id
 * Actualizar producto
 */
router.put(
  '/productos/:id',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);
      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      const {
        nombre,
        categoria,
        unidadMedida,
        codigo,
        descripcion,
        stockMinimo,
        stockActual,
        estado
      } = req.body;

      if (nombre !== undefined) producto.nombre = nombre;
      if (categoria !== undefined) producto.categoria = categoria;
      if (unidadMedida !== undefined) producto.unidadMedida = unidadMedida;
      if (codigo !== undefined) producto.codigo = codigo;
      if (descripcion !== undefined) producto.descripcion = descripcion;
      if (stockMinimo !== undefined) producto.stockMinimo = stockMinimo;
      if (stockActual !== undefined) producto.stockActual = stockActual;
      if (estado !== undefined) producto.estado = estado;

      // Si cambian código, validar que no exista duplicado
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
      res.status(500).json({ mensaje: 'Error al actualizar producto' });
    }
  }
);

/**
 * DELETE /api/almacen/productos/:id
 * Baja lógica: marcar como inactivo
 */
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
      console.error('Error al eliminar (baja lógica) producto:', err);
      res.status(500).json({ mensaje: 'Error al eliminar producto' });
    }
  }
);

/**
 * GET /api/almacen/resumen
 * Resumen básico para el panel:
 *  - totalProductos
 *  - totalInventario (suma de stockActual)
 *  - productosBajoStock (lista)
 */
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

/**
 * POST /api/almacen/entradas
 * Registrar una entrada de almacén
 * Body:
 *  - productoId
 *  - cantidad
 *  - proveedor (opcional)
 *  - folio (opcional)
 *  - fecha (opcional, ISO string)
 */
router.post(
  '/entradas',
  verifyToken,
  verifyRole(allowAlmacen),
  bloquearEntradasYProductosParaCorreo,
  async (req, res) => {
    try {
      const { productoId, cantidad, proveedor, folio, fecha } = req.body;

      if (!productoId || !cantidad) {
        return res.status(400).json({ mensaje: 'productoId y cantidad son obligatorios.' });
      }

      if (cantidad <= 0) {
        return res.status(400).json({ mensaje: 'La cantidad debe ser mayor a cero.' });
      }

      const producto = await Producto.findById(productoId);
      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado.' });
      }

      const cantidadAntes = producto.stockActual || 0;
      const cantidadDespues = cantidadAntes + Number(cantidad);

      // Actualizar stock
      producto.stockActual = cantidadDespues;
      await producto.save();

      // Registrar entrada
      const entrada = await EntradaAlmacen.create({
        producto: producto._id,
        cantidad,
        proveedor: proveedor || '',
        folio: folio || '',
        fecha: fecha ? new Date(fecha) : new Date(),
        registradoPor: req.usuario?.id || null
      });

      // Auditoría
      await registrarAuditoriaMovimiento({
        producto,
        accion: 'entrada',
        cantidadAntes,
        cantidadDespues,
        usuarioId: req.usuario?.id,
        detalle: `Entrada de ${cantidad} unidades.`
      });

      res.status(201).json({
        mensaje: 'Entrada registrada correctamente',
        entrada,
        productoActualizado: producto
      });
    } catch (err) {
      console.error('Error al registrar entrada:', err);
      res.status(500).json({ mensaje: 'Error al registrar entrada' });
    }
  }
);

/**
 * GET /api/almacen/entradas
 * Listar entradas con filtros:
 *  - productoId
 *  - proveedor
 *  - fechaInicio, fechaFin (YYYY-MM-DD o ISO)
 *  - recibido (true/false)
 */
router.get(
  '/entradas',
  verifyToken,
  verifyRole(allowAlmacen),
  bloquearEntradasYProductosParaCorreo,
  async (req, res) => {
    try {
      const { productoId, proveedor, fechaInicio, fechaFin, recibido } = req.query;
      const filtro = {};

      if (productoId) {
        filtro.producto = productoId;
      }

      if (proveedor) {
        filtro.proveedor = { $regex: proveedor, $options: 'i' };
      }

      if (fechaInicio || fechaFin) {
        filtro.fecha = {};
        if (fechaInicio) {
          filtro.fecha.$gte = new Date(fechaInicio);
        }
        if (fechaFin) {
          const fin = new Date(fechaFin);
          fin.setHours(23, 59, 59, 999);
          filtro.fecha.$lte = fin;
        }
      }

      if (typeof recibido !== 'undefined' && recibido !== '') {
        filtro.recibido = String(recibido).toLowerCase() === 'true';
      }

      const entradas = await EntradaAlmacen.find(filtro)
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('registradoPor', 'nombre email')
        .populate('recibidoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 });

      res.json({ entradas });
    } catch (err) {
      console.error('Error al obtener entradas:', err);
      res.status(500).json({ mensaje: 'Error al obtener entradas' });
    }
  }
);

/**
 * PATCH /api/almacen/entradas/:id/recibir
 * Marca una entrada como RECIBIDA y guarda fechaRecibido + recibidoPor
 */
router.patch(
  '/entradas/:id/recibir',
  verifyToken,
  verifyRole(allowAlmacen),
  bloquearEntradasYProductosParaCorreo,
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
        return res.json({ mensaje: 'Esta entrada ya estaba marcada como recibida.', entrada });
      }

      entrada.recibido = true;
      entrada.fechaRecibido = new Date();
      entrada.recibidoPor = req.usuario?.id || null;

      await entrada.save();

      const entradaPop = await EntradaAlmacen.findById(entradaId)
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('registradoPor', 'nombre email')
        .populate('recibidoPor', 'nombre email');

      return res.json({ mensaje: 'Entrada marcada como recibida ✅', entrada: entradaPop });
    } catch (err) {
      console.error('Error al marcar entrada como recibida:', err);
      return res.status(500).json({ mensaje: 'Error al marcar como recibida' });
    }
  }
);

/**
 * DELETE /api/almacen/entradas/:id
 * Elimina una entrada y revierte el stock (solo permitido a jose.garcia@bateil.edu.mx)
 */
router.delete(
  "/entradas/:id",
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const email = (req.usuario?.email || "").toLowerCase();
      if (email !== ALLOW_DELETE_ENTRADAS_EMAIL) {
        return res.status(403).json({ mensaje: "Acceso denegado." });
      }

      const entradaId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(entradaId)) {
        return res.status(400).json({ mensaje: "ID inválido." });
      }

      const entrada = await EntradaAlmacen.findById(entradaId);
      if (!entrada) {
        return res.status(404).json({ mensaje: "Entrada no encontrada." });
      }

      const producto = await Producto.findById(entrada.producto);
      if (!producto) {
        return res.status(404).json({ mensaje: "Producto no encontrado." });
      }

      const cantidadEntrada = Number(entrada.cantidad || 0);
      const stockAntes = Number(producto.stockActual || 0);
      const stockDespues = stockAntes - cantidadEntrada;

      if (stockDespues < 0) {
        return res.status(400).json({
          mensaje:
            "No se puede eliminar: el stock actual es menor que la cantidad de la entrada (ya se usó en salidas).",
        });
      }

      producto.stockActual = stockDespues;
      await producto.save();

      await EntradaAlmacen.deleteOne({ _id: entradaId });

      await registrarAuditoriaMovimiento({
        producto,
        accion: "entrada_eliminada",
        cantidadAntes: stockAntes,
        cantidadDespues: stockDespues,
        usuarioId: req.usuario?.id,
        detalle: `Se eliminó entrada de ${cantidadEntrada} unidades. Folio: ${entrada.folio || "-"}`,
      });

      return res.json({
        mensaje: "Entrada eliminada y stock revertido ✅",
        productoActualizado: producto,
      });
    } catch (err) {
      console.error("Error al eliminar entrada:", err);
      return res.status(500).json({ mensaje: "Error al eliminar entrada" });
    }
  }
);


/* ===========================
   RUTAS DE SALIDAS
=========================== */

/**
 * POST /api/almacen/salidas
 * Registrar una salida de almacén (entrega)
 * Body:
 *  - productoId
 *  - cantidad
 *  - entregadoA
 *  - departamento
 *  - tipoSalida
 *  - comentarios (opcional)
 *  - fecha (opcional)
 */
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

      if (!productoId || !cantidad || !entregadoA || !departamento || !tipoSalida) {
        return res.status(400).json({
          mensaje: 'productoId, cantidad, entregadoA, departamento y tipoSalida son obligatorios.'
        });
      }

      if (cantidad <= 0) {
        return res.status(400).json({ mensaje: 'La cantidad debe ser mayor a cero.' });
      }

      const producto = await Producto.findById(productoId);
      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado.' });
      }

      const cantidadAntes = producto.stockActual || 0;

      if (cantidad > cantidadAntes) {
        return res.status(400).json({
          mensaje: `No hay suficiente stock. Stock actual: ${cantidadAntes}`
        });
      }

      const cantidadDespues = cantidadAntes - Number(cantidad);

      producto.stockActual = cantidadDespues;
      await producto.save();

      const salida = await SalidaAlmacen.create({
        producto: producto._id,
        cantidad,
        entregadoA,
        departamento,
        tipoSalida,
        comentarios: comentarios || '',
        fecha: fecha ? new Date(fecha) : new Date(),
        realizadoPor: req.usuario?.id || null
      });

      await registrarAuditoriaMovimiento({
        producto,
        accion: 'salida',
        cantidadAntes,
        cantidadDespues,
        usuarioId: req.usuario?.id,
        detalle: `Salida de ${cantidad} unidades para ${entregadoA} (${departamento}) - Tipo: ${tipoSalida}.`
      });

      const alertaBajoStock = producto.stockMinimo > 0 &&
        cantidadDespues <= producto.stockMinimo;

      res.status(201).json({
        mensaje: 'Salida registrada correctamente',
        salida,
        productoActualizado: producto,
        alertaBajoStock
      });
    } catch (err) {
      console.error('Error al registrar salida:', err);
      res.status(500).json({ mensaje: 'Error al registrar salida' });
    }
  }
);

/**
 * GET /api/almacen/salidas
 * Listar salidas con filtros:
 *  - productoId
 *  - entregadoA
 *  - departamento
 *  - tipoSalida
 *  - fechaInicio, fechaFin
 */
router.get(
  '/salidas',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const {
        productoId,
        entregadoA,
        departamento,
        tipoSalida,
        fechaInicio,
        fechaFin
      } = req.query;

      const filtro = {};

      if (productoId) {
        filtro.producto = productoId;
      }

      if (entregadoA) {
        filtro.entregadoA = { $regex: entregadoA, $options: 'i' };
      }

      if (departamento) {
        filtro.departamento = { $regex: departamento, $options: 'i' };
      }

      if (tipoSalida) {
        filtro.tipoSalida = { $regex: tipoSalida, $options: 'i' };
      }

      if (fechaInicio || fechaFin) {
        filtro.fecha = {};
        if (fechaInicio) {
          filtro.fecha.$gte = new Date(fechaInicio);
        }
        if (fechaFin) {
          const fin = new Date(fechaFin);
          fin.setHours(23, 59, 59, 999);
          filtro.fecha.$lte = fin;
        }
      }

      const salidas = await SalidaAlmacen.find(filtro)
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('realizadoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 });

      res.json({ salidas });
    } catch (err) {
      console.error('Error al obtener salidas:', err);
      res.status(500).json({ mensaje: 'Error al obtener salidas' });
    }
  }
);

/* ===========================
   MOVIMIENTOS RECIENTES
=========================== */

/**
 * GET /api/almacen/movimientos-recientes
 * Devuelve las últimas entradas y salidas (para el panel)
 */
router.get(
  '/movimientos-recientes',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const limite = Number(req.query.limite) || 10;

      const entradasRecientes = await EntradaAlmacen.find({})
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('registradoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 })
        .limit(limite);

      const salidasRecientes = await SalidaAlmacen.find({})
        .populate('producto', 'nombre codigo categoria unidadMedida')
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

      if (!productoId || !tipo || !cantidad || !motivo) {
        return res.status(400).json({
          mensaje: 'productoId, tipo, cantidad y motivo son obligatorios.'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(productoId)) {
        return res.status(400).json({ mensaje: 'productoId no es válido' });
      }

      const producto = await Producto.findById(productoId);
      if (!producto) {
        return res.status(404).json({ mensaje: 'Producto no encontrado.' });
      }

      const cantidadAntes = producto.stockActual;

      let cantidadDespues = cantidadAntes;

      if (tipo === 'merma') {
        if (cantidad > cantidadAntes) {
          return res.status(400).json({
            mensaje: `La merma no puede ser mayor al stock actual (${cantidadAntes}).`
          });
        }
        cantidadDespues -= cantidad;
      }

      else if (tipo === 'devolucion') {
        cantidadDespues += cantidad;
      }

      else if (tipo === 'error') {
        if (cantidad < 0) {
          return res.status(400).json({
            mensaje: 'El stock no puede ser negativo.'
          });
        }
        cantidadDespues = cantidad;
      }

      else {
        return res.status(400).json({ mensaje: 'Tipo de ajuste no válido.' });
      }

      producto.stockActual = cantidadDespues;
      await producto.save();

      const ajuste = await AjusteInventario.create({
        producto: producto._id,
        tipo,
        cantidad,
        motivo,
        realizadoPor: req.usuario.id
      });

      await registrarAuditoriaMovimiento({
        producto,
        accion: `ajuste_${tipo}`,
        cantidadAntes,
        cantidadDespues,
        usuarioId: req.usuario.id,
        detalle: `Ajuste (${tipo}): ${motivo}`
      });

      res.status(201).json({
        mensaje: 'Ajuste registrado correctamente',
        ajuste,
        productoActualizado: producto
      });
    } catch (err) {
      console.error('Error al registrar ajuste:', err);
      res.status(500).json({ mensaje: 'Error al registrar ajuste' });
    }
  }
);

router.get(
  '/ajustes',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { productoId, tipo, fechaInicio, fechaFin } = req.query;

      const filtro = {};

      if (productoId) {
        filtro.producto = productoId;
      }

      if (tipo) {
        filtro.tipo = tipo;
      }

      if (fechaInicio || fechaFin) {
        filtro.fecha = {};
        if (fechaInicio) {
          filtro.fecha.$gte = new Date(fechaInicio);
        }
        if (fechaFin) {
          const fin = new Date(fechaFin);
          fin.setHours(23, 59, 59, 999);
          filtro.fecha.$lte = fin;
        }
      }

      const ajustes = await AjusteInventario.find(filtro)
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('realizadoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 });

      res.json({ ajustes });
    } catch (err) {
      console.error('Error al obtener ajustes:', err);
      res.status(500).json({ mensaje: 'Error al obtener ajustes' });
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
   Solo jose.garcia y rosario.gonzalez
=========================== */

router.delete(
  "/productos/eliminar-definitivo/:id",
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const email = (req.usuario?.email || "").toLowerCase();

      const correosPermitidos = [
        "jose.garcia@bateil.edu.mx",
        "rosario.gonzalez@bateil.edu.mx"
      ];

      if (!correosPermitidos.includes(email)) {
        return res.status(403).json({
          mensaje: "No tienes permiso para eliminar definitivamente."
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ mensaje: "ID inválido." });
      }

      const producto = await Producto.findById(id);

      if (!producto) {
        return res.status(404).json({ mensaje: "Producto no encontrado." });
      }

      await Producto.deleteOne({ _id: id });

      return res.json({
        mensaje: "Producto eliminado definitivamente ✅"
      });

    } catch (error) {
      console.error("Error al eliminar definitivo:", error);
      return res.status(500).json({ mensaje: "Error del servidor." });
    }
  }
);



module.exports = router;