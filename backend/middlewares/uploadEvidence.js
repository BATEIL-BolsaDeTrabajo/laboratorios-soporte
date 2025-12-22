// backend/middlewares/uploadEvidence.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de dónde guardar el archivo temporalmente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'evidencias');
    fs.mkdirSync(dir, { recursive: true }); // Crea la carpeta si no existe
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/\s+/g, '-');
    const timestamp = Date.now();
    cb(null, `${base}-${timestamp}${ext}`);
  }
});

// Solo aceptar imágenes
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes como evidencia'), false);
  }
};

const uploadEvidence = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // Máximo 5 MB
  }
});

module.exports = uploadEvidence;
