const express = require("express");
const pool = require("../lib/db"); // Diubah dari sql menjadi pool
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// GET /api/team
router.get("/", async (req, res) => {
  try {
    const membersResult = await pool.query(
      `SELECT * FROM team_members
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(membersResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil data tim." });
  }
});

// POST /api/team
router.post("/", async (req, res) => {
  const { name, role, email, status } = req.body;
  const cleanName = name?.trim();
  const cleanRole = role?.trim();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanName || !cleanRole || !cleanEmail) {
    return res.status(400).json({ error: "Nama, role, dan email wajib diisi." });
  }

  try {
    const dupResult = await pool.query(`
      SELECT * FROM team_members
      WHERE user_id = $1
        AND lower(email) = $2
        AND created_at > now() - interval '5 seconds'
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.user.id, cleanEmail]);
    
    const recentDuplicate = dupResult.rows[0];

    if (recentDuplicate) {
      return res.status(200).json({ message: "Anggota tim sudah tersimpan.", member: recentDuplicate });
    }

    const memberResult = await pool.query(`
      INSERT INTO team_members (user_id, name, role, email, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, cleanName, cleanRole, cleanEmail, status || "Offline"]);
    
    const member = memberResult.rows[0];

    // Log ke activities
    try {
      const userResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];
      const displayName = user?.name || user?.email || "Seorang pengguna";
      
      await pool.query(
        'INSERT INTO activities (user_id, description) VALUES ($1, $2)',
        [req.user.id, `${displayName} menambahkan "${cleanName}" (${cleanRole}) ke dalam tim.`]
      );
    } catch (actErr) {
      console.error("⚠️ Gagal mencatat aktivitas tim:", actErr.message);
    }

    res.status(201).json({ message: "Anggota tim berhasil ditambahkan.", member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menambahkan anggota tim." });
  }
});

// DELETE /api/team/:id
router.delete("/:id", async (req, res) => {
  try {
    const existingResult = await pool.query(
      'SELECT * FROM team_members WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    const existing = existingResult.rows[0];

    if (!existing) {
      return res.status(404).json({ error: "Anggota tim tidak ditemukan." });
    }

    await pool.query('DELETE FROM team_members WHERE id = $1', [req.params.id]);

    // Log ke activities
    try {
      const userResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];
      const displayName = user?.name || user?.email || "Seorang pengguna";
      
      await pool.query(
        'INSERT INTO activities (user_id, description) VALUES ($1, $2)',
        [req.user.id, `${displayName} menghapus "${existing.name}" dari tim.`]
      );
    } catch (actErr) {
      console.error("⚠️ Gagal mencatat aktivitas tim:", actErr.message);
    }

    res.json({ message: "Anggota tim berhasil dihapus." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus anggota tim." });
  }
});

module.exports = router;