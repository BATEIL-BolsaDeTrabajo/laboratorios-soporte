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

const [action, location] = process.argv.slice(2);

if (!['export', 'import'].includes(action) || !location) {
  console.error('Uso: node backend/scripts/db-transfer.js <export|import> <carpeta>');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('Falta MONGODB_URI en el archivo .env.');
  process.exit(1);
}

const destination = path.resolve(location);

async function exportDatabase(db) {
  await fs.mkdir(destination, { recursive: true });
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const manifest = {
    exportedAt: new Date().toISOString(),
    database: db.databaseName,
    collections: []
  };

  for (const { name } of collections) {
    const documents = await db.collection(name).find({}).toArray();
    const fileName = `${encodeURIComponent(name)}.ejson`;
    await fs.writeFile(path.join(destination, fileName), EJSON.stringify(documents, null, 2));
    manifest.collections.push({ name, file: fileName, documents: documents.length });
    console.log(`${name}: ${documents.length} documentos`);
  }

  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Respaldo creado en: ${destination}`);
}

async function importDatabase(db) {
  const manifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));

  for (const { name, file } of manifest.collections) {
    const documents = EJSON.parse(await fs.readFile(path.join(destination, file), 'utf8'));
    const collection = db.collection(name);
    await collection.deleteMany({});
    if (documents.length) await collection.insertMany(documents);
    console.log(`${name}: ${documents.length} documentos restaurados`);
  }
}

async function main() {
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI);
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
  console.error('No se pudo completar la transferencia:', error.message);
  process.exit(1);
});
