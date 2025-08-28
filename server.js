/* eslint-disable no-console */

import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

// Optionally load environment variables from ../.env if dotenv is available
let envLoaded = true;
try {
    console.log('✅ Environment variables will be loaded from Replit Secrets (process.env)');
} catch (e) {
  console.warn('ℹ️ dotenv not installed, skipping .env loading. Using process.env/defaults.');
}

// --- Configuration ---
const PORT = Number(process.env.PORT) || 3001;
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pwmoi_db2',
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
    password: row.password, // consider removing in API responses in future
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

// Articles mappers
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
    imageUrl: cover, // compatibility with frontend expecting imageUrl
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
    siteLogo: row.logo_url || '', // column is logo_url (was site_logo)
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
    // idCardUrl, editorialBoxUrl not persisted (no columns)
  } = payload || {};
  const dbObj = {};
  if (name !== undefined) dbObj.name = name;
  if (email !== undefined) dbObj.email = email;
  if (password !== undefined) dbObj.password = password;
  if (role !== undefined) dbObj.role = role;
  // prefer formalPhotoUrl if provided, else avatarUrl
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
  const dbObj = {
    name,
    position,
    photo_url: photoUrl,
  };
  if (id !== undefined) dbObj.id = id;
  return dbObj;
}

function apiPartnerToDb(item) {
  const { id, name, logoUrl, link } = item || {};
  const dbObj = {
    name,
    logo_url: logoUrl,
    link,
  };
  if (id !== undefined) dbObj.id = id;
  return dbObj;
}

// --- Main server start function ---
async function startServer() {
  try {
    // Test DB connection at startup
    const testDb = await mysql.createConnection(dbConfig);
    await testDb.ping();
    await testDb.end();
    console.log('✅ Database connection successful. Starting full application server.');

    // Run full app if DB ok
    runApp();
  } catch (dbError) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! ❌ DATABASE CONNECTION FAILED !!!');
    console.error(`!!! Could not connect to database '${dbConfig.database}' on host '${dbConfig.host}'.`);
    console.error('!!! Please ensure the database exists and your MySQL server (like XAMPP) is running.');
    if (dbError.code) {
      console.error(`!!! [Code: ${dbError.code}] ${dbError.message}`);
    }
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

    // Run fallback server that only returns 503 for API routes
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
      error: {
        code: dbError.code,
        message: dbError.message,
      },
    });
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`❌ Fallback server running on http://0.0.0.0:${PORT} due to database connection failure.`);
  });
}

// --- Full application server ---
function runApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Use a MySQL connection pool
  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Health check endpoint
  app.get('/api', (req, res) => {
    res.json({ message: 'PWMOI Backend API is running!', envLoaded });
  });

  // --- Endpoint to fetch ALL initial data ---
  app.get('/api/all-data', async (req, res) => {
    try {
      const safeQuery = async (query, params = []) => {
        try {
          const [rows] = await pool.query(query, params);
          return rows;
        } catch (err) {
          console.warn(`Query failed, returning empty set. [Query: ${query.substring(0, 60)}...] [Error: ${err.message}]`);
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

      // Format legalContent
      const legalContent = legalContentRows.reduce((acc, row) => {
        acc[row.page_key] = { title: row.title, content: row.content };
        return acc;
      }, {});

      // Format profileContent
      let formattedProfile = null;
      if (profileContentRows.length > 0) {
        const rawProfile = profileContentRows[0];
        let missionData = [];
        try {
          missionData = typeof rawProfile.mission === 'string'
            ? JSON.parse(rawProfile.mission)
            : (rawProfile.mission || []);
        } catch (e) {
          console.warn('Could not parse mission JSON, using empty array:', rawProfile.mission);
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

      // Format contactInfo
      let formattedContact = null;
      if (contactInfoRows.length > 0) {
        formattedContact = formatContactFromRow(contactInfoRows[0]);
      }

      // Map rows to API shapes where necessary
      const users = (usersRows || []).map(dbUserToApi);
      const partners = (partnersRows || []).map(dbPartnerToApi);
      const structure = (structureRows || []).map(dbStructureToApi);
      const articlesApi = (articles || []).map(dbArticleToApi);

      res.setHeader('Content-Type', 'application/json');
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
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({
        message: 'Critical server error while fetching initial data.',
        error: err.message,
      });
    }
  });

  // --- USER MANAGEMENT ---
  app.post('/api/register', async (req, res) => {
    try {
      // Build DB object from API payload (ignore unsupported fields)
      const payload = { ...req.body, role: 'Jurnalis' };
      const dbUser = apiUserToDb(payload);

      const columns = [
        'name', 'email', 'password', 'role',
        'avatar_url', 'is_verified',
        'phone_number', 'media_name', 'position', 'ukw_certification',
      ];
      const values = [
        dbUser.name ?? null,
        dbUser.email ?? null,
        dbUser.password ?? null,
        dbUser.role ?? 'Jurnalis',
        dbUser.avatar_url ?? null,
        dbUser.is_verified ?? 0,
        dbUser.phone_number ?? null,
        dbUser.media_name ?? null,
        dbUser.position ?? null,
        dbUser.ukw_certification ?? null,
      ];

      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`;

      const [result] = await pool.query(sql, values);
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      const user = dbUserToApi(rows[0]);
      res.status(201).json({ user });
    } catch (err) {
      console.error('Error at /api/register:', err);
      res.status(500).json({ message: 'Gagal mendaftarkan pengguna' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const fieldsToUpdate = apiUserToDb(req.body);

      // Remove undefined keys to avoid setting to NULL unintentionally
      Object.keys(fieldsToUpdate).forEach((k) => {
        if (fieldsToUpdate[k] === undefined) delete fieldsToUpdate[k];
      });

      if (Object.keys(fieldsToUpdate).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      await pool.query('UPDATE users SET ? WHERE id = ?', [fieldsToUpdate, id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at PUT /api/users/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at PUT /api/users/${id}/role:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    const { name, avatarUrl } = req.body;
    try {
      await pool.query('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?', [name, avatarUrl, id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at PUT /api/users/${id}/profile:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/users/:id/password', async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    try {
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at PUT /api/users/${id}/password:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/users/:id/verify', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at PUT /api/users/${id}/verify:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      const [rows] = await pool.query('SELECT * FROM users');
      const users = rows.map(dbUserToApi);
      res.json({ users });
    } catch (err) {
      console.error(`Error at DELETE /api/users/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- ARTICLE MANAGEMENT ---
  app.post('/api/articles', async (req, res) => {
    try {
      const dbArticle = apiArticleToDb(req.body);
      await pool.query('INSERT INTO articles SET ?', dbArticle);
      const [rows] = await pool.query('SELECT * FROM articles');
      const articles = rows.map(dbArticleToApi);
      res.status(201).json({ articles });
    } catch (err) {
      console.error('Error at POST /api/articles:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/articles/:id', async (req, res) => {
    const { id } = req.params;
    const updatedArticle = apiArticleToDb(req.body);
    delete updatedArticle.id; // Avoid updating primary key
    try {
      await pool.query('UPDATE articles SET ? WHERE id = ?', [updatedArticle, id]);
      const [rows] = await pool.query('SELECT * FROM articles');
      const articles = rows.map(dbArticleToApi);
      res.json({ articles });
    } catch (err) {
      console.error(`Error at PUT /api/articles/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/articles/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, title, snippet } = req.body;
    try {
      let query = 'UPDATE articles SET status = ? WHERE id = ?';
      let params = [status, id];
      if (title && snippet) {
        query = 'UPDATE articles SET status = ?, title = ?, snippet = ? WHERE id = ?';
        params = [status, title, snippet, id];
      }
      await pool.query(query, params);
      const [rows] = await pool.query('SELECT * FROM articles');
      const articles = rows.map(dbArticleToApi);
      res.json({ articles });
    } catch (err) {
      console.error(`Error at PUT /api/articles/${id}/status:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/articles/:id/revision', async (req, res) => {
    const { id } = req.params;
    const { feedback } = req.body;
    try {
      await pool.query(
        'UPDATE articles SET status = ?, editor_feedback = ? WHERE id = ?',
        ['Needs Revision', feedback, id]
      );
      const [rows] = await pool.query('SELECT * FROM articles');
      const articles = rows.map(dbArticleToApi);
      res.json({ articles });
    } catch (err) {
      console.error(`Error at PUT /api/articles/${id}/revision:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/articles/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM articles WHERE id = ?', [id]);
      const [rows] = await pool.query('SELECT * FROM articles');
      const articles = rows.map(dbArticleToApi);
      res.json({ articles });
    } catch (err) {
      console.error(`Error at DELETE /api/articles/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- SITE CONTENT MANAGEMENT ---
  app.put('/api/site/profile', async (req, res) => {
    const { about, vision, mission, purpose, legality, adArt } = req.body;
    const profileData = {
      about,
      vision,
      mission: JSON.stringify(mission ?? []),
      purpose,
      legality_text: legality?.text ?? '',
      legality_sk: legality?.sk ?? '',
      ad_art: adArt,
    };
    try {
      await pool.query('UPDATE site_profile SET ? WHERE id = 1', [profileData]);
      res.json({
        profileContent: {
          about: profileData.about || '',
          vision: profileData.vision || '',
          mission: safeJsonParse(profileData.mission, []),
          purpose: profileData.purpose || '',
          legality: { text: profileData.legality_text || '', sk: profileData.legality_sk || '' },
          adArt: profileData.ad_art || '',
        },
      });
    } catch (err) {
      console.error('Error at PUT /api/site/profile:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/site/contact', async (req, res) => {
    const { organizationName, address, email, phone, socials } = req.body;
    const contactData = {
      organizationName,
      address,
      email,
      phone,
      socials: JSON.stringify(socials ?? {}),
    };
    try {
      await pool.query('UPDATE contact_info SET ? WHERE id = 1', [contactData]);
      const [rows] = await pool.query('SELECT * FROM contact_info WHERE id = 1');
      res.json({ contactInfo: formatContactFromRow(rows[0]) });
    } catch (err) {
      console.error('Error at PUT /api/site/contact:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/site/logo', async (req, res) => {
    const { logoUrl } = req.body;
    try {
      await pool.query('UPDATE contact_info SET logo_url = ? WHERE id = 1', [logoUrl]);
      const [rows] = await pool.query('SELECT * FROM contact_info WHERE id = 1');
      res.json({ contactInfo: formatContactFromRow(rows[0]) });
    } catch (err) {
      console.error('Error updating logo:', err);
      res.status(500).json({ message: 'Failed to update logo' });
    }
  });

  app.put('/api/site/favicon', async (req, res) => {
    const { faviconUrl } = req.body;
    try {
      await pool.query('UPDATE contact_info SET favicon_url = ? WHERE id = 1', [faviconUrl]);
      const [rows] = await pool.query('SELECT * FROM contact_info WHERE id = 1');
      res.json({ contactInfo: formatContactFromRow(rows[0]) });
    } catch (err) {
      console.error('Error updating favicon:', err);
      res.status(500).json({ message: 'Failed to update favicon' });
    }
  });

  app.put('/api/site/programs', async (req, res) => {
    const { programs } = req.body;
    try {
      await pool.query('DELETE FROM programs');
      if (Array.isArray(programs)) {
        for (const program of programs) {
          await pool.query('INSERT INTO programs SET ?', program);
        }
      }
      res.json({ programs: programs ?? [] });
    } catch (err) {
      console.error('Error at PUT /api/site/programs:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/site/structure', async (req, res) => {
    const { structure } = req.body;
    try {
      await pool.query('DELETE FROM structure');
      if (Array.isArray(structure)) {
        for (const official of structure) {
          const dbOfficial = apiStructureToDb(official);
          await pool.query('INSERT INTO structure SET ?', dbOfficial);
        }
      }
      res.json({ structure: structure ?? [] });
    } catch (err) {
      console.error('Error at PUT /api/site/structure:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/site/announcements', async (req, res) => {
    const { announcements } = req.body;
    try {
      await pool.query('DELETE FROM announcements');
      if (Array.isArray(announcements)) {
        for (const announcement of announcements) {
          await pool.query('INSERT INTO announcements SET ?', announcement);
        }
      }
      res.json({ announcements: announcements ?? [] });
    } catch (err) {
      console.error('Error at PUT /api/site/announcements:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/site/legal', async (req, res) => {
    const legalContent = req.body || {};
    try {
      for (const key of Object.keys(legalContent)) {
        const page = legalContent[key];
        await pool.query(
          'UPDATE legal_content SET content = ? WHERE page_key = ?',
          [page?.content ?? '', key]
        );
      }
      res.json({ legalContent });
    } catch (err) {
      console.error('Error at PUT /api/site/legal:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- GALLERY MANAGEMENT ---
  app.post('/api/gallery', async (req, res) => {
    const newImage = req.body; // { title, imageUrl, description }
    try {
      await pool.query('INSERT INTO gallery SET ?', newImage);
      const [galleryImages] = await pool.query('SELECT * FROM gallery');
      res.status(201).json({ galleryImages });
    } catch (err) {
      console.error('Error at POST /api/gallery:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/gallery/:id', async (req, res) => {
    const { id } = req.params;
    const updatedImage = { ...req.body };
    delete updatedImage.id;
    try {
      await pool.query('UPDATE gallery SET ? WHERE id = ?', [updatedImage, id]);
      const [galleryImages] = await pool.query('SELECT * FROM gallery');
      res.json({ galleryImages });
    } catch (err) {
      console.error(`Error at PUT /api/gallery/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/gallery/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM gallery WHERE id = ?', [id]);
      const [galleryImages] = await pool.query('SELECT * FROM gallery');
      res.json({ galleryImages });
    } catch (err) {
      console.error(`Error at DELETE /api/gallery/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- COMMENT MANAGEMENT ---
  app.post('/api/comments', async (req, res) => {
    const newComment = req.body; // { articleId, userId, content, status }
    try {
      await pool.query('INSERT INTO comments SET ?', newComment);
      const [comments] = await pool.query('SELECT * FROM comments');
      res.status(201).json({ comments });
    } catch (err) {
      console.error('Error at POST /api/comments:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/comments/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      await pool.query('UPDATE comments SET status = ? WHERE id = ?', [status, id]);
      const [comments] = await pool.query('SELECT * FROM comments');
      res.json({ comments });
    } catch (err) {
      console.error(`Error at PUT /api/comments/${id}/status:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/comments/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM comments WHERE id = ?', [id]);
      const [comments] = await pool.query('SELECT * FROM comments');
      res.json({ comments });
    } catch (err) {
      console.error(`Error at DELETE /api/comments/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- INSPIRATION & PARTNERS ---
  app.post('/api/inspiration-notes', async (req, res) => {
    const newNote = req.body; // { userId, content }
    try {
      await pool.query('INSERT INTO inspiration_notes SET ?', newNote);
      const [inspirationNotes] = await pool.query('SELECT * FROM inspiration_notes');
      res.status(201).json({ inspirationNotes });
    } catch (err) {
      console.error('Error at POST /api/inspiration-notes:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/inspiration-notes/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM inspiration_notes WHERE id = ?', [id]);
      const [inspirationNotes] = await pool.query('SELECT * FROM inspiration_notes');
      res.json({ inspirationNotes });
    } catch (err) {
      console.error(`Error at DELETE /api/inspiration-notes/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/partners', async (req, res) => {
    try {
      const dbPartner = apiPartnerToDb(req.body);
      await pool.query('INSERT INTO partners SET ?', dbPartner);
      const [rows] = await pool.query('SELECT * FROM partners');
      const partners = rows.map(dbPartnerToApi);
      res.status(201).json({ partners });
    } catch (err) {
      console.error('Error at POST /api/partners:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/partners/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const dbPartner = apiPartnerToDb(req.body);
      delete dbPartner.id;
      await pool.query('UPDATE partners SET ? WHERE id = ?', [dbPartner, id]);
      const [rows] = await pool.query('SELECT * FROM partners');
      const partners = rows.map(dbPartnerToApi);
      res.json({ partners });
    } catch (err) {
      console.error(`Error at PUT /api/partners/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/partners/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM partners WHERE id = ?', [id]);
      const [rows] = await pool.query('SELECT * FROM partners');
      const partners = rows.map(dbPartnerToApi);
      res.json({ partners });
    } catch (err) {
      console.error(`Error at DELETE /api/partners/${id}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // --- NOTIFICATIONS ---
  app.post('/api/notifications', async (req, res) => {
    // Sanitize payload to avoid overriding AUTO_INCREMENT id and ensure defaults
    const { userId, message, link } = req.body || {};
    const notif = {
      userId,
      message,
      link: link ?? null,
      isRead: 0, // default unread; DB has default too
      // timestamp uses DB default if exists
    };
    try {
      await pool.query('INSERT INTO notifications SET ?', notif);
      const [notifications] = await pool.query('SELECT * FROM notifications');
      res.status(201).json({ notifications });
    } catch (err) {
      console.error('Error at POST /api/notifications:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/notifications/read/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
      await pool.query('UPDATE notifications SET isRead = 1 WHERE userId = ?', [userId]);
      const [notifications] = await pool.query('SELECT * FROM notifications');
      res.json({ notifications });
    } catch (err) {
      console.error(`Error at PUT /api/notifications/read/${userId}:`, err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/', (req, res) => {
  res.send(`
    <h1>Backend PWMOI Banyuwangi</h1>
    <p>✅ Backend sedang berjalan.</p>
    <p>➡️ API tersedia di: <a href="/api">/api</a></p>
  `);
});

  // Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Full application server running on http://0.0.0.0:${PORT}`);
  });
}

// Start the server
startServer();
