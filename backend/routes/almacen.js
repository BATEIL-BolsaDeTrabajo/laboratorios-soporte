//// backend/routes/almacen.js
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
      const { nombre, categoria, estado } = req.query;

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
 */
router.get(
  '/entradas',
  verifyToken,
  verifyRole(allowAlmacen),
  async (req, res) => {
    try {
      const { productoId, proveedor, fechaInicio, fechaFin } = req.query;
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
          // incluir todo el día
          const fin = new Date(fechaFin);
          fin.setHours(23, 59, 59, 999);
          filtro.fecha.$lte = fin;
        }
      }

      const entradas = await EntradaAlmacen.find(filtro)
        .populate('producto', 'nombre codigo categoria unidadMedida')
        .populate('registradoPor', 'nombre email')
        .sort({ fecha: -1, createdAt: -1 });

      res.json({ entradas });
    } catch (err) {
      console.error('Error al obtener entradas:', err);
      res.status(500).json({ mensaje: 'Error al obtener entradas' });
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
        comentarios,
        fecha
      } = req.body;

      if (!productoId || !cantidad || !entregadoA || !departamento) {
        return res.status(400).json({
          mensaje: 'productoId, cantidad, entregadoA y departamento son obligatorios.'
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

      // Actualizar stock
      producto.stockActual = cantidadDespues;
      await producto.save();

      // Registrar salida
      const salida = await SalidaAlmacen.create({
        producto: producto._id,
        cantidad,
        entregadoA,
        departamento,
        comentarios: comentarios || '',
        fecha: fecha ? new Date(fecha) : new Date(),
        realizadoPor: req.usuario?.id || null
      });

      // Auditoría
      await registrarAuditoriaMovimiento({
        producto,
        accion: 'salida',
        cantidadAntes,
        cantidadDespues,
        usuarioId: req.usuario?.id,
        detalle: `Salida de ${cantidad} unidades para ${entregadoA} (${departamento}).`
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

/**
 * POST /api/almacen/ajustes
 * Registrar un ajuste de inventario:
 *  - merma (resta)
 *  - devolucion (suma)
 *  - error (ajuste manual a un valor)
 *
 * Body:
 *  - productoId
 *  - tipo: merma | devolucion | error
 *  - cantidad
 *  - motivo
 */
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
        cantidadDespues = cantidad; // Se sobrescribe stockActual
      }

      else {
        return res.status(400).json({ mensaje: 'Tipo de ajuste no válido.' });
      }

      // Guardar nuevo stock
      producto.stockActual = cantidadDespues;
      await producto.save();

      // Registrar ajuste
      const ajuste = await AjusteInventario.create({
        producto: producto._id,
        tipo,
        cantidad,
        motivo,
        realizadoPor: req.usuario.id
      });

      // Auditoría
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

/**
 * GET /api/almacen/ajustes
 * Lista de ajustes de inventario con filtros:
 *  - productoId
 *  - tipo (merma | devolucion | error)
 *  - fechaInicio, fechaFin
 */
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

      // Filtrar por fecha (si tu esquema tiene campo "fecha")
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

/**
 * GET /api/almacen/productos/:id/historial
 * Devuelve:
 *  - Datos del producto
 *  - Entradas
 *  - Salidas
 *  - Ajustes
 *  - Auditoría
 */
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


module.exports = router;

