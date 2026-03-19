const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');

const StudentPaymentTracking = require('../models/StudentPaymentTracking');
const Cycle = require('../models/Cycle');
const { verifyToken } = require('../middlewares/auth');

router.get('/export-excel', verifyToken, async (req, res) => {
  try {
    const { cycleId, grupo = '', search = '' } = req.query;

    if (!cycleId) {
      return res.status(400).json({ mensaje: 'El cycleId es obligatorio' });
    }

    const cycle = await Cycle.findById(cycleId);
    if (!cycle) {
      return res.status(404).json({ mensaje: 'Ciclo no encontrado' });
    }

    const filter = { cycleId };

    if (grupo) {
      filter.grupo = grupo;
    }

    if (search) {
      filter.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { matricula: { $regex: search, $options: 'i' } }
      ];
    }

    const rows = await StudentPaymentTracking.find(filter).sort({ grupo: 1, nombre: 1 });

    const months = [...cycle.months].sort((a, b) => a.order - b.order);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Colegiatura');

    const columns = [
      { header: '#', key: 'numero', width: 8 },
      { header: 'Nombre', key: 'nombre', width: 38 },
      { header: 'Grupo', key: 'grupo', width: 12 },
      ...months.map(m => ({
        header: m.label,
        key: m.key,
        width: 10
      })),
      { header: 'Asistencia', key: 'asistencia', width: 16 },
      { header: 'Motivo', key: 'motivo', width: 24 },
      { header: 'Notas Acad.', key: 'notasAcademicas', width: 35 },
      { header: 'Notas Adm.', key: 'notasAdministrativas', width: 35 }
    ];

    worksheet.columns = columns;

    const titleRow = worksheet.addRow([`Control de colegiatura - ${cycle.name}`]);
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 22;

    const infoRow = worksheet.addRow([
      `Grupo: ${grupo || 'Todos'}    |    Búsqueda: ${search || 'Sin filtro'}    |    Total: ${rows.length}`
    ]);
    worksheet.mergeCells(infoRow.number, 1, infoRow.number, columns.length);
    infoRow.font = { italic: true, size: 10 };
    infoRow.alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.addRow([]);

    const headerRow = worksheet.addRow(columns.map(col => col.header));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1F2937' }
    };
    headerRow.height = 22;

    rows.forEach((row, index) => {
      const data = {
        numero: index + 1,
        nombre: row.nombre || '',
        grupo: row.grupo || '',
        asistencia: row.asistencia || '',
        motivo: row.motivo || '',
        notasAcademicas: row.notasAcademicas || '',
        notasAdministrativas: row.notasAdministrativas || ''
      };

      months.forEach(m => {
        data[m.key] = row.payments?.get
          ? (row.payments.get(m.key)?.value || '')
          : (row.payments?.[m.key]?.value || '');
      });

      const excelRow = worksheet.addRow(columns.map(col => data[col.key] ?? ''));

      excelRow.eachCell((cell, colNumber) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber >= 4 && colNumber < 4 + months.length ? 'center' : 'left',
          wrapText: true
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });

      months.forEach((m, idx) => {
        const cell = excelRow.getCell(4 + idx);
        const value = data[m.key];

        if (value === 'SI') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9F2D9' }
          };
          cell.font = { bold: true, color: { argb: 'FF1D5E20' } };
        }

        if (value === 'NO') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFD9D9' }
          };
          cell.font = { bold: true, color: { argb: 'FF8A1F1F' } };
        }
      });

      if (data.asistencia === 'REGULAR') {
        const cell = excelRow.getCell(4 + months.length);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDFF0D8' }
        };
        cell.font = { bold: true, color: { argb: 'FF256029' } };
      }

      if (data.asistencia === 'IRREGULAR') {
        const cell = excelRow.getCell(4 + months.length);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFDE7B2' }
        };
        cell.font = { bold: true, color: { argb: 'FF8A5A00' } };
      }
    });

    worksheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }];

    const safeCycle = String(cycle.name).replace(/[^\w\-]+/g, '_');
    const safeGrupo = grupo ? String(grupo).replace(/[^\w\-]+/g, '_') : 'todos';
    const fileName = `colegiatura_${safeCycle}_${safeGrupo}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al exportar Excel de colegiatura:', error);
    res.status(500).json({ mensaje: 'Error al exportar Excel' });
  }
});

module.exports = router;