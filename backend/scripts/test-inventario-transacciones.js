require('dotenv').config();

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const EntradaAlmacen = require('../models/EntradaAlmacen');
const SalidaAlmacen = require('../models/SalidaAlmacen');
const AuditoriaInventario = require('../models/AuditoriaInventario');

async function ejecutarPrueba() {
  const marcador = `TXTEST-${Date.now()}`;
  let producto;

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    producto = await Producto.create({
      nombre: marcador,
      categoria: 'Pruebas',
      unidadMedida: 'pieza',
      codigo: marcador,
      tipoUso: 'interno',
      stockActual: 10,
      stockMinimo: 0
    });

    async function registrarSalidaConcurrente() {
      const session = await mongoose.startSession();

      try {
        let registrada = false;

        await session.withTransaction(async () => {
          const productoAntes = await Producto.findOneAndUpdate(
            { _id: producto._id, stockActual: { $gte: 7 } },
            { $inc: { stockActual: -7 } },
            { new: false, session }
          );

          if (!productoAntes) return;

          await SalidaAlmacen.create([{
            producto: producto._id,
            cantidad: 7,
            entregadoA: 'Prueba transaccional',
            departamento: 'QA',
            tipoSalida: marcador,
            comentarios: 'Prueba de concurrencia'
          }], { session });

          await AuditoriaInventario.create([{
            producto: producto._id,
            accion: 'salida_prueba',
            cantidadAntes: productoAntes.stockActual,
            cantidadDespues: productoAntes.stockActual - 7,
            detalle: marcador
          }], { session });

          registrada = true;
        });

        return registrada;
      } finally {
        await session.endSession();
      }
    }

    const resultados = await Promise.all([
      registrarSalidaConcurrente(),
      registrarSalidaConcurrente()
    ]);

    const productoTrasConcurrencia = await Producto.findById(producto._id).lean();
    const salidas = await SalidaAlmacen.countDocuments({ producto: producto._id });
    const auditorias = await AuditoriaInventario.countDocuments({
      producto: producto._id,
      accion: 'salida_prueba'
    });

    const concurrenciaConfirmada = resultados.filter(Boolean).length === 1
      && productoTrasConcurrencia.stockActual === 3
      && salidas === 1
      && auditorias === 1;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Producto.updateOne(
          { _id: producto._id },
          { $inc: { stockActual: 5 } },
          { session }
        );

        await EntradaAlmacen.create([{
          producto: producto._id,
          cantidad: 5,
          proveedor: marcador,
          folio: marcador
        }], { session });

        await AuditoriaInventario.create([{
          producto: producto._id,
          accion: 'rollback_prueba',
          detalle: marcador
        }], { session });

        throw new Error('Fallo intencional para comprobar rollback');
      });
    } catch (error) {
      if (error.message !== 'Fallo intencional para comprobar rollback') throw error;
    } finally {
      await session.endSession();
    }

    const productoTrasRollback = await Producto.findById(producto._id).lean();
    const entradasRollback = await EntradaAlmacen.countDocuments({
      producto: producto._id,
      folio: marcador
    });
    const auditoriasRollback = await AuditoriaInventario.countDocuments({
      producto: producto._id,
      accion: 'rollback_prueba'
    });

    const rollbackConfirmado = productoTrasRollback.stockActual === 3
      && entradasRollback === 0
      && auditoriasRollback === 0;

    console.log(JSON.stringify({
      concurrenciaConfirmada,
      rollbackConfirmado,
      stockFinal: productoTrasRollback.stockActual,
      salidas,
      auditorias
    }, null, 2));

    if (!concurrenciaConfirmada || !rollbackConfirmado) {
      throw new Error('La prueba de inventario no produjo el resultado esperado.');
    }
  } finally {
    if (producto) {
      await EntradaAlmacen.deleteMany({ producto: producto._id });
      await SalidaAlmacen.deleteMany({ producto: producto._id });
      await AuditoriaInventario.deleteMany({ producto: producto._id });
      await Producto.deleteOne({ _id: producto._id });
    }

    await mongoose.disconnect();
  }
}

ejecutarPrueba().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
