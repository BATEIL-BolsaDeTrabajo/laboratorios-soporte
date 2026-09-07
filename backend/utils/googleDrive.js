// backend/utils/googleDrive.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Solo necesitamos el ID de la carpeta raíz desde .env
const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

if (!rootFolderId) {
  console.warn('⚠️ [GoogleDrive] Falta GOOGLE_DRIVE_ROOT_FOLDER_ID en .env');
}

// ======= Cargar Service Account (Render Secret File / Local) =======
function loadServiceAccount() {
  // 1) Render Secret File
  const renderSecretPath = '/etc/secrets/service-account.json';
  if (fs.existsSync(renderSecretPath)) {
    const json = JSON.parse(fs.readFileSync(renderSecretPath, 'utf8'));
    if (json.private_key) json.private_key = json.private_key.replace(/\\n/g, '\n');
    return json;
  }

  // 2) Local (tu PC). Este archivo NO se sube a GitHub.
  const localPath = path.join(__dirname, '../credentials/service-account.json');
  if (fs.existsSync(localPath)) {
    const json = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    if (json.private_key) json.private_key = json.private_key.replace(/\\n/g, '\n');
    return json;
  }

  throw new Error(
    '❌ [GoogleDrive] No se encontró service-account.json. ' +
    'En Render debe existir en /etc/secrets/service-account.json (Secret File).'
  );
}

// 👇 Usuario real de tu dominio que será el dueño de los archivos
const IMPERSONATED_USER = 'tickets@bateil.edu.mx';

let driveClientPromise = null;

/**
 * Devuelve un cliente autenticado de Google Drive (singleton)
 * usando domain-wide delegation e impersonando a tickets@bateil.edu.mx
 */
async function getDriveClient() {
  if (!driveClientPromise) {
    // Permite iniciar el proyecto local sin credenciales de Drive.
    // Se requieren únicamente cuando se utiliza esta integración.
    const key = loadServiceAccount();
    const jwtClient = new google.auth.JWT({
      email: key.client_email,                 // svc-bateil-tickets@...
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
      subject: IMPERSONATED_USER,             // 👈 Impersonación
    });

    driveClientPromise = jwtClient.authorize()
      .then(() => {
        console.log('✅ [GoogleDrive] Cliente autenticado como', IMPERSONATED_USER);
        return google.drive({ version: 'v3', auth: jwtClient });
      })
      .catch((err) => {
        console.error('❌ [GoogleDrive] Error autenticando (JWT):', err.message || err);
        driveClientPromise = null;
        throw err;
      });
  }

  return driveClientPromise;
}

/**
 * Comparte un archivo o carpeta con TODO el dominio (o público)
 */
async function compartirConDominio(fileId) {
  const drive = await getDriveClient();
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN || 'bateil.edu.mx';

  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',         // 👈 Público con enlace (no pide permisos)
        allowFileDiscovery: false
      }
    });

    console.log(`[GoogleDrive] Compartido correctamente: ${fileId}`);

  } catch (err) {
    console.error('[GoogleDrive] Error compartiendo:', err.message);
  }
}

/**
 * Crea (si hace falta) una carpeta para el ticket en la carpeta raíz.
 */
async function ensureTicketFolder(ticket) {
  const drive = await getDriveClient();

  if (!rootFolderId) {
    throw new Error('[GoogleDrive] No se configuró GOOGLE_DRIVE_ROOT_FOLDER_ID');
  }

  // Si ya existe la carpeta del ticket, la devolvemos
  if (ticket.driveFolderId && ticket.driveFolderLink) {
    return {
      id: ticket.driveFolderId,
      webViewLink: ticket.driveFolderLink,
    };
  }

  const name = `TICKET-${ticket.folio || ticket._id}`;

  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [rootFolderId],
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    fields: 'id, webViewLink',
  });

  const folderId = res.data.id;

  // 👇 COMPARTIR AUTOMÁTICAMENTE LA CARPETA
  await compartirConDominio(folderId);

  return res.data;
}

/**
 * Sube un archivo a una carpeta específica.
 */
async function uploadFileToFolder(folderId, file) {
  const drive = await getDriveClient();

  const res = await drive.files.create({
    resource: {
      name: file.originalname,
      parents: [folderId],
    },
    media: {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.path),
    },
    fields: 'id, name, webViewLink, webContentLink',
  });

  const fileId = res.data.id;

  // 👇 COMPARTIR AUTOMÁTICAMENTE EL ARCHIVO
  await compartirConDominio(fileId);

  return res.data;
}

/**
 * Sube una evidencia al ticket (creando la carpeta si no existe)
 */
async function uploadTicketEvidence(ticket, file) {
  const folder = await ensureTicketFolder(ticket);
  const uploaded = await uploadFileToFolder(folder.id, file);

  return {
    folderId: folder.id,
    fileId: uploaded.id,
    fileName: uploaded.name,
    webViewLink: uploaded.webViewLink,
    webContentLink: uploaded.webContentLink,
  };
}

module.exports = {
  ensureTicketFolder,
  uploadTicketEvidence,
};
