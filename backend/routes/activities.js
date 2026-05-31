const express = require("express");
const pool = require("../lib/db"); // Ganti nama variabel jadi pool agar lebih intuitif
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// GET /api/activities - Ambil aktivitas terbaru pengguna
router.get("/", async (req, res) => {
  try {
    // Gunakan pool.query dan ganti ${req.user.id} menjadi $1
    const result = await pool.query(
      `SELECT * FROM activities
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id] // Nilai $1 diambil dari array ini
    );
    
    // Ambil datanya menggunakan result.rows
    res.json({ activities: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil aktivitas terbaru." });
  }
});

module.exports = router;