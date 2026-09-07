/*
 * Exporta o restaura la base MongoDB configurada en MONGODB_URI.
 *
 * Uso:
 *   node backend/scripts/db-transfer.js export <carpeta-destino>
 *   node backend/scripts/db-transfer.js import <carpeta-respaldo>
 */
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { createHash } = require('crypto');

const [action, location] = process.argv.slice(2);

if (!['export', 'import'].includes(action) || !location) {
  console.error('Uso: node backend/scripts/db-transfer.js <export|import> <carpeta>');
  process.exit(1);
}

const uri = action === 'export'
  ? (process.env.MONGODB_BACKUP_URI || process.env.MONGODB_URI)
  : process.env.MONGODB_RESTORE_URI;
if (!uri) {
  console.error('Falta la conexión: MONGODB_BACKUP_URI/MONGODB_URI para exportar, MONGODB_RESTORE_URI para importar.');
  process.exit(1);
}

const destination = path.resolve(location);

async function exportDatabase(db) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination); // No sobrescribir respaldos anteriores.
  const collections = await db.listCollections().toArray();
  const manifest = {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    database: db.databaseName,
    consistency: 'Lectura por colección; no es una instantánea transaccional entre colecciones.',
    collections: []
  };

  for (const { name, type, options } of collections) {
    if (type !== 'collection') throw new Error(`Tipo de colección no soportado: ${type}. Usa mongodump.`);
    const collection = db.collection(name);
    const documents = await collection.find({}).toArray();
    const fileName = `${encodeURIComponent(name)}.ejson`;
    const content = EJSON.stringify(documents, null, 2, { relaxed: false });
    await fs.writeFile(path.join(destination, fileName), content, { flag: 'wx' });
    manifest.collections.push({ name, file: fileName, documents: documents.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      options: EJSON.serialize(options, { relaxed: false }),
      indexes: EJSON.serialize(await collection.listIndexes().toArray(), { relaxed: false }) });
    console.log(`${name}: ${documents.length} documentos`);
  }

  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Respaldo creado en: ${destination}`);
}

async function importDatabase(db) {
  const manifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
  if (db.databaseName === manifest.database || !/(_dev|_staging|_test)(_[a-z0-9-]+)?$/i.test(db.databaseName)) {
    throw new Error('El destino debe ser una base distinta del origen, con sufijo _dev, _staging o _test.');
  }
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) {
    throw new Error('La base destino contiene colecciones. Se rechaza la importación para no modificar datos existentes.');
  }
  // Verificar todos los archivos antes de escribir en el destino.
  const prepared = [];
  for (const entry of manifest.collections) {
    const { name, file, sha256 } = entry;
    if (path.basename(file) !== file) throw new Error('Ruta inválida en el manifiesto.');
    const content = await fs.readFile(path.join(destination, file), 'utf8');
    if (sha256 && createHash('sha256').update(content).digest('hex') !== sha256) {
      throw new Error(`Respaldo alterado o incompleto: ${file}`);
    }
    const documents = EJSON.parse(content, { relaxed: false });
    if (!Array.isArray(documents) || documents.length !== entry.documents) throw new Error(`Conteo inválido: ${name}`);
    prepared.push({ ...entry, documents });
  }
  for (const { name, documents, options, indexes } of prepared) {
    await db.createCollection(name, EJSON.deserialize(options || {}));
    const collection = db.collection(name);
    if (indexes) {
      const restoredIndexes = EJSON.deserialize(indexes).filter(index => index.name !== '_id_')
        .map(({ v, ns, ...index }) => index);
      if (restoredIndexes.length) await collection.createIndexes(restoredIndexes);
    }
    for (let offset = 0; offset < documents.length; offset += 1000) {
      await collection.insertMany(documents.slice(offset, offset + 1000));
    }
    if (await collection.countDocuments() !== documents.length) throw new Error(`Conteo final incorrecto: ${name}`);
    console.log(`${name}: ${documents.length} documentos restaurados`);
  }
}

async function main() {
  const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db();
    if (action === 'export') await exportDatabase(db);
    else await importDatabase(db);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('No se pudo completar la transferencia:', error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[conexión omitida]'));
  process.exit(1);
});
