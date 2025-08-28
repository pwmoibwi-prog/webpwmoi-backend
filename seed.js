// seed.js (versi final otomatis)
import mysql from "mysql2/promise";

const RESET_MODE = process.argv.includes("--reset");

// Konfigurasi koneksi DB
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "", // sesuaikan dengan XAMPP/MySQL Anda
  database: "pwmoi_db2",
};

// Helper untuk cek kolom
async function ensureColumn(conn, table, oldName, newName, definition) {
  // Cek keberadaan kolom lama dan baru terlebih dulu
  const [oldRows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [oldName]);
  const [newRows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [newName]);

  const oldExists = oldRows.length > 0;
  const newExists = newRows.length > 0;

  // Jika kolom lama ada dan kolom baru belum ada, lakukan rename
  if (oldExists && !newExists && oldName !== newName) {
    console.log(`🔄 Rename kolom ${oldName} → ${newName} di ${table}`);
    try {
      await conn.query(`ALTER TABLE ${table} CHANGE COLUMN ${oldName} ${newName} ${definition}`);
    } catch (e) {
      // Jika gagal rename (mis. karena kolom baru sudah ada secara race-condition), abaikan
      console.warn(`⚠️ Gagal rename ${table}.${oldName} → ${newName}:`, e?.message || e);
    }
    return;
  }

  // Jika kolom lama tidak ada dan kolom baru juga tidak ada, tambahkan kolom baru
  if (!oldExists && !newExists) {
    console.log(`➕ Tambah kolom ${newName} di ${table}`);
    try {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN ${newName} ${definition}`);
    } catch (e) {
      console.warn(`⚠️ Gagal tambah kolom ${table}.${newName}:`, e?.message || e);
    }
    return;
  }

  // Jika kolom lama dan baru sama-sama ada, biarkan apa adanya (hindari error duplicate column)
  if (oldExists && newExists) {
    console.log(`ℹ️ Kolom ${table}.${oldName} dan ${table}.${newName} keduanya ada. Melewati perubahan.`);
    return;
  }

  // Jika kolom baru sudah ada, tidak perlu melakukan apa-apa
  if (newExists) return;
}

async function seedDatabase() {
  const conn = await mysql.createConnection(dbConfig);
  console.log("🚀 Seeding database...");

  // --- CREATE TABLES (jika belum ada) ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      password VARCHAR(100),
      role VARCHAR(50),
      avatar_url VARCHAR(255),
      is_verified TINYINT DEFAULT 0,
      phone_number VARCHAR(20),
      media_name VARCHAR(100),
      position VARCHAR(100),
      ukw_certification VARCHAR(50)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      content TEXT,
      snippet VARCHAR(255),
      cover_image_url VARCHAR(255),
      status VARCHAR(50),
      authorId INT,
      editor_feedback TEXT
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS site_profile (
      id INT PRIMARY KEY AUTO_INCREMENT,
      about TEXT,
      vision TEXT,
      mission TEXT,
      purpose TEXT,
      legality_text TEXT,
      legality_sk TEXT,
      ad_art TEXT
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS contact_info (
      id INT PRIMARY KEY AUTO_INCREMENT,
      organizationName VARCHAR(100),
      address VARCHAR(255),
      email VARCHAR(100),
      phone VARCHAR(50),
      socials JSON,
      logo_url VARCHAR(255),
      favicon_url VARCHAR(255)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      description TEXT,
      icon VARCHAR(10)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS structure (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      position VARCHAR(100),
      photo_url VARCHAR(255)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      content TEXT
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS gallery (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      imageUrl VARCHAR(255),
      description TEXT
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      articleId INT,
      userId INT,
      content TEXT,
      status VARCHAR(50)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      userId INT,
      message VARCHAR(255),
      isRead TINYINT DEFAULT 0
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS inspiration_notes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      userId INT,
      content TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      logo_url VARCHAR(255),
      link VARCHAR(255)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS legal_content (
      id INT PRIMARY KEY AUTO_INCREMENT,
      page_key VARCHAR(50),
      title VARCHAR(255),
      content TEXT
    )
  `);

  // --- FIX KOMPATIBILITAS KOLOM ---
  await ensureColumn(conn, "users", "avatarUrl", "avatar_url", "VARCHAR(255)");
  await ensureColumn(conn, "users", "isVerified", "is_verified", "TINYINT DEFAULT 0");
  await ensureColumn(conn, "users", "phoneNumber", "phone_number", "VARCHAR(20)");
  await ensureColumn(conn, "users", "mediaName", "media_name", "VARCHAR(100)");
  await ensureColumn(conn, "users", "ukwCertification", "ukw_certification", "VARCHAR(50)");

  await ensureColumn(conn, "contact_info", "site_logo", "logo_url", "VARCHAR(255)");
  await ensureColumn(conn, "contact_info", "faviconUrl", "favicon_url", "VARCHAR(255)");

  await ensureColumn(conn, "structure", "photoUrl", "photo_url", "VARCHAR(255)");
  await ensureColumn(conn, "programs", "icon", "icon", "VARCHAR(10)");

  await ensureColumn(conn, "partners", "logoUrl", "logo_url", "VARCHAR(255)");
  await ensureColumn(conn, "partners", "websiteUrl", "link", "VARCHAR(255)");
 
  // Gallery compatibility (older schemas may lack these)
  // Ensure imageUrl column exists (rename from legacy image_url if present)
  await ensureColumn(conn, "gallery", "image_url", "imageUrl", "VARCHAR(255)");
  await ensureColumn(conn, "gallery", "album", "title", "VARCHAR(255)");
  await ensureColumn(conn, "gallery", "title", "title", "VARCHAR(255)");
  await ensureColumn(conn, "gallery", "caption", "description", "TEXT");
  await ensureColumn(conn, "gallery", "description", "description", "TEXT");
 
  // Articles compatibility
  await ensureColumn(conn, "articles", "editorFeedback", "editor_feedback", "TEXT");
  await ensureColumn(conn, "articles", "author_id", "authorId", "INT");
  await ensureColumn(conn, "articles", "image_url", "cover_image_url", "VARCHAR(255)");
  await ensureColumn(conn, "articles", "imageUrl", "cover_image_url", "VARCHAR(255)");
  await ensureColumn(conn, "articles", "cover_image_url", "cover_image_url", "VARCHAR(255)");

  // Comments compatibility
  await ensureColumn(conn, "comments", "user_id", "userId", "INT");
 
  // Notifications compatibility
  await ensureColumn(conn, "notifications", "user_id", "userId", "INT");
  await ensureColumn(conn, "notifications", "is_read", "isRead", "TINYINT DEFAULT 0");
  await ensureColumn(conn, "notifications", "link", "link", "VARCHAR(255)");
  await ensureColumn(conn, "notifications", "timestamp", "timestamp", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
  try {
    await conn.query('ALTER TABLE notifications MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
  } catch (e) {
    console.warn('Skipping notifications.id type alter:', e?.message || e);
  }

  // --- RESET MODE ---
  if (RESET_MODE) {
    console.log("⚠️ RESET MODE aktif, kosongkan semua tabel");
    const tables = [
      "users","articles","site_profile","contact_info","programs","structure",
      "announcements","gallery","comments","notifications","inspiration_notes",
      "partners","legal_content"
    ];
    for (const t of tables) {
      await conn.query(`DELETE FROM ${t}`);
    }
  }

  // --- SEED DATA ---
  await conn.query(`
    INSERT IGNORE INTO users (id, name, email, password, role, avatar_url, is_verified, phone_number, media_name, position, ukw_certification) VALUES
    (1, 'Admin PWMOI', 'admin@pwmoi.id', 'admin123', 'Admin', 'https://via.placeholder.com/150', 1, '08123456789', 'PWMOI Banyuwangi', 'Administrator', 'Muda'),
    (2, 'Jurnalis Satu', 'jurnalis1@pwmoi.id', 'jurnalis123', 'Jurnalis', 'https://via.placeholder.com/150', 0, '082233445566', 'Media Banyuwangi News', 'Reporter', 'Belum')
  `);

  await conn.query(`
    INSERT IGNORE INTO programs (id, title, description, icon) VALUES
    (1, 'Pelatihan Jurnalistik', 'Meningkatkan kapasitas jurnalis muda', '📰'),
    (2, 'Workshop IT & Media', 'Pemanfaatan teknologi untuk media digital', '💻'),
    (3, 'Forum Diskusi Publik', 'Wadah aspirasi masyarakat Banyuwangi', '👥'),
    (4, 'Uji Kompetensi Wartawan', 'Persiapan sertifikasi UKW', '📑')
  `);

  await conn.query(`
    INSERT IGNORE INTO structure (id, name, position, photo_url) VALUES
    (1, 'Pak Wawan', 'Ketua DPD PWMOI Banyuwangi', 'https://via.placeholder.com/150'),
    (2, 'Bu Ani', 'Sekretaris', 'https://via.placeholder.com/150'),
    (3, 'Bapak Budi', 'Bendahara', 'https://via.placeholder.com/150'),
    (4, 'Mbak Sari', 'Humas', 'https://via.placeholder.com/150')
  `);

  // CONTACT INFO (branding + socials)
  await conn.query(`
    INSERT IGNORE INTO contact_info (id, organizationName, address, email, phone, socials, logo_url, favicon_url) VALUES
    (1,
      'PWMOI Banyuwangi',
      'Jl. Contoh No. 123, Banyuwangi',
      'info@pwmoi.id',
      '0812-3456-7890',
      '{"facebook":"https://facebook.com/pwmoi.banyuwangi","twitter":"https://twitter.com/pwmoi_bwi","instagram":"https://instagram.com/pwmoi.banyuwangi"}',
      'https://picsum.photos/seed/pwmoi-logo/200/200',
      'https://picsum.photos/seed/pwmoi-favicon/32/32'
    )
  `);

  // SITE PROFILE (about/vision/mission/purpose/legal/ad_art)
  await conn.query(`
    INSERT IGNORE INTO site_profile (id, about, vision, mission, purpose, legality_text, legality_sk, ad_art) VALUES
    (1,
      'Perkumpulan Wartawan Media Online Indonesia (PWMOI) DPD Banyuwangi adalah wadah profesional jurnalis media online di Banyuwangi untuk berkarya, berkolaborasi, dan berkontribusi.',
      'Menjadi organisasi jurnalis media online yang profesional, kredibel, dan berdampak bagi masyarakat.',
      '["Meningkatkan kompetensi jurnalis muda","Menguatkan etika dan profesionalisme","Mendorong kolaborasi positif","Melawan hoaks dan disinformasi"]',
      'Mewujudkan ekosistem media online yang sehat, berintegritas, dan bermanfaat.',
      'PWMOI terdaftar resmi sebagai organisasi profesi dan tunduk pada peraturan perundangan yang berlaku.',
      'SK-123/2025',
      'AD/ART PWMOI mengatur tugas, fungsi, dan tata kelola organisasi.'
    )
  `);

  // ANNOUNCEMENTS
  await conn.query(`
    INSERT IGNORE INTO announcements (id, title, content) VALUES
    (1, 'Rapat Koordinasi Bulanan', 'Rapat bulanan pengurus dan anggota akan diadakan pekan depan, mohon kehadirannya.'),
    (2, 'Workshop Jurnalistik', 'Pendaftaran workshop penulisan feature dan investigasi telah dibuka.')
  `);

  // GALLERY
  await conn.query(`
    INSERT IGNORE INTO gallery (id, title, imageUrl, description) VALUES
    (1, 'Pelantikan Pengurus', 'https://picsum.photos/seed/gallery1/800/600', 'Momen pelantikan pengurus PWMOI Banyuwangi'),
    (2, 'Workshop IT & Media', 'https://picsum.photos/seed/gallery2/800/600', 'Suasana workshop IT untuk media'),
    (3, 'Forum Diskusi Publik', 'https://picsum.photos/seed/gallery3/800/600', 'Diskusi publik bersama masyarakat')
  `);

  // PARTNERS
  await conn.query(`
    INSERT IGNORE INTO partners (id, name, logo_url, link) VALUES
    (1, 'Pemerintah Kabupaten Banyuwangi', 'https://picsum.photos/seed/partner1/200/80', 'https://banyuwangikab.go.id'),
    (2, 'Kominfo Banyuwangi', 'https://picsum.photos/seed/partner2/200/80', 'https://kominfo.banyuwangikab.go.id'),
    (3, 'Universitas XYZ', 'https://picsum.photos/seed/partner3/200/80', 'https://www.univ-xyz.ac.id'),
    (4, 'Media Banyuwangi News', 'https://picsum.photos/seed/partner4/200/80', 'https://banyuwanginews.id')
  `);

  // LEGAL CONTENT
  await conn.query(`
    INSERT IGNORE INTO legal_content (id, page_key, title, content) VALUES
    (1, 'kodeEtik', 'Kode Etik Jurnalistik', '1. Bertanggung jawab\n2. Akurat\n3. Berimbang'),
    (2, 'pedomanMediaSiber', 'Pedoman Media Siber', '1. Verifikasi\n2. Klarifikasi\n3. Koreksi'),
    (3, 'standarKompetensi', 'Standar Kompetensi Wartawan', '1. Kompetensi Teknis\n2. Kompetensi Etik\n3. Kompetensi Manajerial'),
    (4, 'advokasi', 'Advokasi dan Bantuan Hukum', 'PWMOI memberikan advokasi dan bantuan hukum bagi anggota.')
  `);

  // EXTRA USERS (Editor + Jurnalis 2)
  await conn.query(`
    INSERT IGNORE INTO users (id, name, email, password, role, avatar_url, is_verified, phone_number, media_name, position, ukw_certification) VALUES
    (3, 'Editor PWMOI', 'editor@pwmoi.id', 'editor123', 'Editor', 'https://via.placeholder.com/150', 1, '08123456780', 'PWMOI Banyuwangi', 'Editor', 'Madya'),
    (4, 'Jurnalis Dua', 'jurnalis2@pwmoi.id', 'jurnalis123', 'Jurnalis', 'https://via.placeholder.com/150', 0, '082211223344', 'Media XYZ', 'Reporter', 'Belum')
  `);

  // ARTICLES (5 items, each with cover_image_url)
  await conn.query(`
    INSERT IGNORE INTO articles (id, title, content, snippet, status, authorId, editor_feedback, cover_image_url) VALUES
    (1, 'Pelantikan Pengurus PWMOI Banyuwangi', 'Konten lengkap artikel pelantikan yang memuat kronologi acara, daftar pengurus, kutipan sambutan, serta harapan organisasi ke depan. Termasuk dokumentasi foto dan keterangan kegiatan untuk arsip media.', 'Ringkasan pelantikan pengurus...', 'Published', 2, NULL, 'https://picsum.photos/seed/news1/1200/630'),
    (2, 'Workshop Jurnalistik Muda', 'Ulasan lengkap workshop yang membahas dasar-dasar penulisan berita, verifikasi informasi, dan optimalisasi platform digital. Disertai kutipan narasumber dan hasil praktik peserta.', 'Ringkasan workshop...', 'Published', 4, NULL, 'https://picsum.photos/seed/news2/1200/630'),
    (3, 'Forum Diskusi Publik Banyuwangi', 'Laporan diskusi publik mengenai isu-isu strategis daerah, partisipasi masyarakat, serta peran media dalam edukasi publik. Memuat poin-poin rekomendasi dan rencana tindak lanjut.', 'Ringkasan diskusi publik...', 'Published', 4, 'Perbaiki struktur paragraf dan tambahkan narasumber.', 'https://picsum.photos/seed/news3/1200/630'),
    (4, 'Pelatihan Literasi Digital untuk Komunitas', 'Berita pelatihan literasi digital yang menekankan keamanan daring, etika bermedia sosial, dan verifikasi fakta. Tersedia materi presentasi dan tautan sumber belajar.', 'Ringkasan literasi digital...', 'Published', 2, NULL, 'https://picsum.photos/seed/news4/1200/630'),
    (5, 'Kolaborasi Media Lokal dengan Kampus', 'Liputan kerja sama media lokal dengan perguruan tinggi untuk riset jurnalisme data, magang mahasiswa, dan pengembangan konten edukatif. Menyertakan jadwal program kolaborasi.', 'Ringkasan kolaborasi kampus...', 'Published', 3, NULL, 'https://picsum.photos/seed/news5/1200/630')
  `);

// Pastikan artikel 1-3 punya cover image jika sudah ada sebelumnya
await conn.query(`
  UPDATE articles 
  SET cover_image_url = 'https://picsum.photos/seed/news1/1200/630'
  WHERE id = 1 AND (cover_image_url IS NULL OR cover_image_url = '')
`);
await conn.query(`
  UPDATE articles 
  SET cover_image_url = 'https://picsum.photos/seed/news2/1200/630'
  WHERE id = 2 AND (cover_image_url IS NULL OR cover_image_url = '')
`);
await conn.query(`
  UPDATE articles 
  SET cover_image_url = 'https://picsum.photos/seed/news3/1200/630'
  WHERE id = 3 AND (cover_image_url IS NULL OR cover_image_url = '')
`);
  // COMMENTS
  await conn.query(`
    INSERT IGNORE INTO comments (id, articleId, userId, content, status) VALUES
    (1, 1, 2, 'Artikel yang sangat informatif, terima kasih.', 'Approved'),
    (2, 1, 4, 'Semoga kegiatan seperti ini rutin diadakan.', 'Pending')
  `);

  // NOTIFICATIONS
  await conn.query(`
    INSERT IGNORE INTO notifications (id, userId, message, isRead) VALUES
    (1, 2, 'Artikel Anda "Pelantikan Pengurus PWMOI Banyuwangi" telah diterbitkan.', 0),
    (2, 4, 'Artikel Anda "Forum Diskusi Publik Banyuwangi" memerlukan revisi.', 0)
  `);

  // INSPIRATION NOTES
  await conn.query(`
    INSERT IGNORE INTO inspiration_notes (id, userId, content) VALUES
    (1, 2, 'Eksplorasi peran pers lokal dalam mendorong transparansi pemerintahan.'),
    (2, 4, 'Ide liputan: Profil UMKM unggulan di desa wisata.')
  `);

  console.log("✅ Database berhasil di-seed!");
  await conn.end();
}

seedDatabase().catch(err => {
  console.error("❌ Error seeding database:", err);
});
