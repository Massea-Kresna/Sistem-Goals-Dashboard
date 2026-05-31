const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../lib/db"); // Diubah menjadi pool
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi." });
  }

  try {
    // Cek apakah email sudah terdaftar
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email sudah terdaftar." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Insert user baru dan kembalikan data yang dibuat
    const insertResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email, password_hash, name || null]
    );
    
    const user = insertResult.rows[0]; // Ambil data user dari array rows pertama

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "Registrasi berhasil.",
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal melakukan registrasi." });
  }
});

// POST /api/auth/login  <-- dari sequence diagram: "kirim data login"
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi." });
  }

  try {
    // "cari data pengguna" - dari sequence diagram
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    const user = userResult.rows[0]; // Ambil data user dari array rows pertama

    if (!user) {
      return res.status(401).json({ error: "Email atau password salah." });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Email atau password salah." });
    }

    // "kirimkan token sesi" - dari sequence diagram
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login berhasil.",
      token, // frontend simpan ini, kirim sebagai Bearer token
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal melakukan login." });
  }
});

module.exports = router;