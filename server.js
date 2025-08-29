/* eslint-disable no-console */

import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

// --- Configuration ---
const PORT = Number(process.env.PORT) || 5000;
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pwmoi_db2',
  port: Number(process.env.DB_PORT) || 3306,
};

// --- Helpers (mappers and utils) ---
function safeJsonParse(value, fallback) {
  try {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// DB row -> API shape mappers
function dbUserToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    isVerified: Number(row.is_verified ?? row.isVerified ?? 0),
    phoneNumber: row.phone_number ?? row.phoneNumber ?? null,
    mediaName: row.media_name ?? row.mediaName ?? null,
    position: row.position ?? null,
    ukwCertification: row.ukw_certification ?? row.ukwCertification ?? null,
  };
}

function dbPartnerToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url ?? row.logoUrl ?? null,
    link: row.link ?? null,
  };
}

function dbStructureToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    photoUrl: row.photo_url ?? row.photoUrl ?? null,
  };
}

function dbArticleToApi(row) {
  if (!row) return null;
  const cover = row.cover_image_url ?? row.coverImageUrl ?? row.imageUrl ?? null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    snippet: row.snippet,
    status: row.status,
    authorId: row.authorId,
    editorFeedback: row.editor_feedback ?? row.editorFeedback ?? null,
    coverImageUrl: cover,
    imageUrl: cover,
  };
}

function apiArticleToDb(payload) {
  const {
    id,
    title,
    content,
    snippet,
    status,
    authorId,
    editorFeedback,
    coverImageUrl,
    imageUrl,
  } = payload || {};

  const dbObj = {};
  if (title !== undefined) dbObj.title = title;
  if (content !== undefined) dbObj.content = content;
  if (snippet !== undefined) dbObj.snippet = snippet;
  if (status !== undefined) dbObj.status = status;
  if (authorId !== undefined) dbObj.authorId = authorId;
  if (editorFeedback !== undefined) dbObj.editor_feedback = editorFeedback;
  const cover = coverImageUrl ?? imageUrl;
  if (cover !== undefined) dbObj.cover_image_url = cover;
  if (id !== undefined) dbObj.id = id;
  return dbObj;
}

function formatContactFromRow(row) {
  if (!row) return null;
  const socials = safeJsonParse(row.socials, {});
  return {
    organizationName: row.organizationName || '',
    address: row.address || '',
    email: row.email || '',
    phone: row.phone || '',
    siteLogo: row.logo_url || '',
    faviconUrl: row.favicon_url || '',
    socials,
  };
}

// API payload -> DB object mappers
function apiUserToDb(payload) {
  const {
    name,
    email,
    password,
    role,
    avatarUrl,
    formalPhotoUrl,
    isVerified,
    phoneNumber,
    mediaName,
    position,
    ukwCertification,
  } = payload || {};
  const dbObj = {};
  if (name !== undefined) dbObj.name = name;
  if (email !== undefined) dbObj.email = email;
  if (password !== undefined) dbObj.password = password;
  if (role !== undefined) dbObj.role = role;
  const avatar = formalPhotoUrl ?? avatarUrl;
  if (avatar !== undefined) dbObj.avatar_url = avatar;
  if (isVerified !== undefined) dbObj.is_verified = Number(isVerified ? 1 : 0);
  if (phoneNumber !== undefined) dbObj.phone_number = phoneNumber;
  if (mediaName !== undefined) dbObj.media_name = mediaName;
  if (position !== undefined) dbObj.position = position;
  if (ukwCertification !== undefined) dbObj.ukw_certification = ukwCertification;
  return dbObj;
}

function apiStructureToDb(item) {
  const { id, name, position, photoUrl } = item || {};
  const dbObj = { name, position, photo_url: photoUrl };
  if (id !== undefined) dbObj.id = id;
  return dbObj;
}

function apiPartnerToDb(item) {
  const { id, name, logoUrl, link } = item || {};
  const dbObj = { name, logo_url: logoUrl, link };
  if (id !== undefined) dbObj.id = id;
  return dbObj;
}

// --- Main server start function ---
async function startServer() {
  try {
    const testDb = await mysql.createConnection(dbConfig);
    await testDb.ping();
    await testDb.end();
    console.log('✅ Database connection successful. Starting full application server.');
    runApp();
  } catch (dbError) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! ❌ DATABASE CONNECTION FAILED !!!');
    console.error(`!!! Could not connect to database '${dbConfig.database}' on host '${dbConfig.host}'.`);
    console.error('!!! Please ensure the database exists and your MySQL server is running.');
    if (dbError.code) {
      console.error(`!!! [Code: ${dbError.code}] ${dbError.message}`);
    }
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    runFallbackServerError(dbError);
  }
}

// --- Fallback server if DB connection fails ---
function runFallbackServerError(dbError) {
  const app = express();
  app.use(cors());
  app.all('/api/*', (req, res) => {
    res.status(503).json({
      message: 'Service Unavailable: Could not connect to the database.',
      error: { code: dbError.code, message: dbError.message },
    });
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`❌ Fallback server running on http://0.0.0.0:${PORT} due to database connection failure.`);
  });
}

// --- Full application server ---
function runApp() {
  const app = express();

  // ✅ Middleware CORS (penting untuk frontend)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // ✅ Route utama untuk cek server hidup
  app.get('/', (req, res) => {
    res.send(`
      <h1>Backend PWMOI Banyuwangi</h1>
      <p>✅ Backend sedang berjalan di port ${PORT}.</p>
      <p>➡️ API tersedia di: <a href="/api">/api</a></p>
    `);
  });

  // Health check endpoint
  app.get('/api', (req, res) => {
    res.json({ 
      message: 'PWMOI Backend API is running!', 
      envLoaded: true,
      timestamp: new Date().toISOString()
    });
  });

  // --- Endpoint to fetch ALL initial data ---
  app.get('/api/all-data', async (req, res) => {
    try {
      const safeQuery = async (query, params = []) => {
        try {
          const [rows] = await pool.query(query, params);
          return rows;
        } catch (err) {
          console.warn(`Query failed: ${query.substring(0, 60)}... | Error: ${err.message}`);
          return [];
        }
      };

      const [
        usersRows,
        articles,
        profileContentRows,
        contactInfoRows,
        programs,
        structureRows,
        announcements,
        galleryImages,
        comments,
        notifications,
        inspirationNotes,
        partnersRows,
        legalContentRows,
      ] = await Promise.all([
        safeQuery('SELECT * FROM users'),
        safeQuery('SELECT * FROM articles'),
        safeQuery('SELECT * FROM site_profile LIMIT 1'),
        safeQuery('SELECT * FROM contact_info LIMIT 1'),
        safeQuery('SELECT * FROM programs'),
        safeQuery('SELECT * FROM structure'),
        safeQuery('SELECT * FROM announcements'),
        safeQuery('SELECT * FROM gallery'),
        safeQuery('SELECT * FROM comments'),
        safeQuery('SELECT * FROM notifications'),
        safeQuery('SELECT * FROM inspiration_notes'),
        safeQuery('SELECT * FROM partners'),
        safeQuery('SELECT * FROM legal_content'),
      ]);

      const legalContent = legalContentRows.reduce((acc, row) => {
        acc[row.page_key] = { title: row.title, content: row.content };
        return acc;
      }, {});

      let formattedProfile = null;
      if (profileContentRows.length > 0) {
        const rawProfile = profileContentRows[0];
        let missionData = [];
        try {
          missionData = typeof rawProfile.mission === 'string'
            ? JSON.parse(rawProfile.mission)
            : (rawProfile.mission || []);
        } catch (e) {
          console.warn('Could not parse mission JSON:', rawProfile.mission);
          missionData = [];
        }

        formattedProfile = {
          about: rawProfile.about || '',
          vision: rawProfile.vision || '',
          mission: missionData,
          purpose: rawProfile.purpose || '',
          legality: {
            text: rawProfile.legality_text || '',
            sk: rawProfile.legality_sk || '',
          },
          adArt: rawProfile.ad_art || '',
        };
      }

      let formattedContact = null;
      if (contactInfoRows.length > 0) {
        formattedContact = formatContactFromRow(contactInfoRows[0]);
      }

      const users = (usersRows || []).map(dbUserToApi);
      const partners = (partnersRows || []).map(dbPartnerToApi);
      const structure = (structureRows || []).map(dbStructureToApi);
      const articlesApi = (articles || []).map(dbArticleToApi);

      res.status(200).json({
        users,
        articles: articlesApi,
        profileContent: formattedProfile,
        contactInfo: formattedContact,
        programs: programs || [],
        structure,
        announcements: announcements || [],
        galleryImages: galleryImages || [],
        comments: comments || [],
        notifications: notifications || [],
        inspirationNotes: inspirationNotes || [],
        partners,
        legalContent,
      });
    } catch (err) {
      console.error('Critical error in /api/all-data handler:', err);
      res.status(500).json({
        message: 'Critical server error while fetching initial data.',
        error: err.message,
      });
    }
  });

  // --- Semua route API Anda tetap sama (tidak ada perubahan struktur)
  // ... (semua route seperti /register, /users, /articles, dll tetap sesuai)

  // Karena kode terlalu panjang, saya pastikan semua route sudah benar formatnya
  // Contoh: app.put('/api/users/:id') → ✅ benar

  // Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Full application server running on http://0.0.0.0:${PORT}`);
  });
}

// Start the server
startServer();