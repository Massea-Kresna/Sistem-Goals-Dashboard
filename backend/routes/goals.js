const express = require("express");
const pool = require("../lib/db");
const { authMiddleware } = require("../middleware/auth");

// Mengimpor fungsi utilitas Notifikasi Email dan Kalender
const { sendEmail } = require("../utils/mailer");
const { createCalendarEvent } = require("../utils/calendar");

const router = express.Router();

router.use(authMiddleware);

// ─── GET /api/goals ───────────────────────────────────────────────────────────
// Menampilkan:
//   1. Goals milik sendiri (user_id = req.user.id)
//   2. Goals kelompok yang email kita ada di goal_members (shared goals)
router.get("/", async (req, res) => {
  try {
    const goalsResult = await pool.query(`
      SELECT
        g.*,
        COUNT(m.id) AS total_milestones,
        COUNT(m.id) FILTER (WHERE m.is_done = true) AS done_milestones,

        -- Milestone personal (milik kita sendiri dalam goal kelompok)
        COUNT(m.id) FILTER (
          WHERE g.type = 'individu'
             OR m.assignee_email = $1
             OR m.assignee_email IS NULL
             OR m.assignee_email = ''
        ) AS personal_total_milestones,
        COUNT(m.id) FILTER (
          WHERE m.is_done = true
            AND (
              g.type = 'individu'
              OR m.assignee_email = $1
              OR m.assignee_email IS NULL
              OR m.assignee_email = ''
            )
        ) AS personal_done_milestones,

        -- Progres keseluruhan projek
        COALESCE(
          ROUND(
            (COUNT(m.id) FILTER (WHERE m.is_done = true)::numeric
              / NULLIF(COUNT(m.id), 0)) * 100, 2
          ),
          g.progress,
          0
        ) AS project_progress,

        -- Tandai apakah goal ini milik sendiri atau shared
        CASE WHEN g.user_id = $2 THEN true ELSE false END AS is_owner

      FROM goals g
      LEFT JOIN milestones m ON m.goal_id = g.id

      -- Gabungkan: goals sendiri ATAU goals yang kita ada di goal_members-nya
      -- Memastikan Soft Delete ter-filter
      WHERE g.deleted_at IS NULL
        AND (
          g.user_id = $2
          OR EXISTS (
            SELECT 1 FROM goal_members gm
            WHERE gm.goal_id = g.id
              AND gm.email = $1
              AND gm.deleted_at IS NULL
          )
        )
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `, [req.user.email, req.user.id]);

    const goals = goalsResult.rows;

    const mappedGoals = goals.map((g) => {
      const personalTotal = parseInt(g.personal_total_milestones);
      const personalDone  = parseInt(g.personal_done_milestones);
      const personalProgress = personalTotal > 0
        ? Math.round((personalDone / personalTotal) * 100 * 100) / 100
        : 0;

      return {
        id:                         g.id,
        user_id:                    g.user_id,
        title:                      g.title,
        description:                g.description,
        deadline:                   g.deadline,
        priority:                   g.priority,
        type:                       g.type || "individu",
        created_at:                 g.created_at,
        updated_at:                 g.updated_at,
        is_owner:                   g.is_owner,
        progress:                   personalProgress,
        personal_progress:          personalProgress,
        project_progress:           parseFloat(g.project_progress),
        total_milestones:           personalTotal,
        done_milestones:            personalDone,
        project_total_milestones:   parseInt(g.total_milestones),
        project_done_milestones:    parseInt(g.done_milestones),
      };
    });

    res.json({ goals: mappedGoals });
  } catch (err) {
    console.error("Gagal mengambil data goals:", err);
    res.status(500).json({ error: "Gagal mengambil data goals." });
  }
});

// ─── GET /api/goals/:id ───────────────────────────────────────────────────────
// Pemilik & anggota goal_members boleh akses
router.get("/:id", async (req, res) => {
  try {
    // Cek akses: pemilik atau anggota goal_members
    const goalResult = await pool.query(`
      SELECT g.*,
        u.email AS owner_email,
        u.name  AS owner_name,
        CASE WHEN g.user_id = $2 THEN true ELSE false END AS is_owner
      FROM goals g
      JOIN users u ON u.id = g.user_id
      WHERE g.id = $1
        AND g.deleted_at IS NULL
        AND (
          g.user_id = $2
          OR EXISTS (
            SELECT 1 FROM goal_members gm
            WHERE gm.goal_id = g.id
              AND gm.email = $3
              AND gm.deleted_at IS NULL
          )
        )
    `, [req.params.id, req.user.id, req.user.email]);

    const goal = goalResult.rows[0];
    if (!goal) return res.status(404).json({ error: "Goal tidak ditemukan atau akses ditolak." });

    const milestonesResult = await pool.query(
      'SELECT * FROM milestones WHERE goal_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    const milestones = milestonesResult.rows;

    const membersResult = await pool.query(
      'SELECT * FROM goal_members WHERE goal_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
      [req.params.id]
    );
    const members = membersResult.rows;

    const total = milestones.length;
    const done  = milestones.filter((ms) => ms.is_done).length;
    const projectProgress = total > 0
      ? Math.round((done / total) * 100 * 100) / 100
      : Number(goal.progress || 0);

    const personalMilestones = milestones.filter(
      (ms) =>
        goal.type === "individu" ||
        ms.assignee_email === req.user.email ||
        !ms.assignee_email ||
        ms.assignee_email === ""
    );
    const personalTotal = personalMilestones.length;
    const personalDone  = personalMilestones.filter((ms) => ms.is_done).length;
    const personalProgress = personalTotal > 0
      ? Math.round((personalDone / personalTotal) * 100 * 100) / 100
      : 0;

    res.json({
      goal: {
        ...goal,
        type:             goal.type || "individu",
        progress:         personalProgress,
        personal_progress: personalProgress,
        project_progress: projectProgress,
        owner_email:      goal.owner_email,
        owner_name:       goal.owner_name,
      },
      milestones,
      members,
    });
  } catch (err) {
    console.error("Gagal mengambil detail goal:", err);
    res.status(500).json({ error: "Gagal mengambil detail goal." });
  }
});

// ─── POST /api/goals ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const {
    title, description, deadline,
    priority = "medium", type = "individu",
    members = [], milestones = []
  } = req.body;
  const cleanTitle = title?.trim();

  if (!cleanTitle) {
    return res.status(400).json({ error: "Judul goal wajib diisi." });
  }

  try {
    // Cegah duplikat dalam 5 detik
    const dupResult = await pool.query(`
      SELECT * FROM goals
      WHERE user_id = $1
        AND lower(title) = lower($2)
        AND created_at > now() - interval '5 seconds'
      ORDER BY created_at DESC LIMIT 1
    `, [req.user.id, cleanTitle]);

    if (dupResult.rows[0]) {
      return res.status(200).json({
        message: "Goal sudah tersimpan.",
        goal: dupResult.rows[0],
        milestones: [],
        members: [],
      });
    }

    const goalResult = await pool.query(`
      INSERT INTO goals (user_id, title, description, deadline, priority, type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user.id, cleanTitle, description?.trim() || null, deadline || null, priority, type]);

    const goal = goalResult.rows[0];

    // Simpan anggota tim ke goal_members
    const savedMembers = [];
    if (type === "kelompok" && Array.isArray(members)) {
      for (const m of members) {
        if (m.name && m.email) {
          const normalizedEmail = m.email.trim().toLowerCase();

          // Cek apakah email ini sudah punya akun
          const userLookup = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [normalizedEmail]
          );
          const existingUserId = userLookup.rows[0]?.id || null;

          const memResult = await pool.query(`
            INSERT INTO goal_members (goal_id, name, email, role, member_user_id, status, joined_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (goal_id, email) DO UPDATE
              SET name = EXCLUDED.name, role = EXCLUDED.role
            RETURNING *
          `, [
            goal.id,
            m.name.trim(),
            normalizedEmail,
            m.role?.trim() || null,
            existingUserId,
            existingUserId ? 'active' : 'pending',
            existingUserId ? new Date().toISOString() : null,
          ]);
          savedMembers.push(memResult.rows[0]);
        }
      }
    }

    // Simpan milestones
    const savedMilestones = [];
    if (Array.isArray(milestones)) {
      const cleanMilestones = milestones
        .map((ms) => ({
          title:          ms?.title?.trim(),
          assignee_name:  ms?.assignee_name?.trim() || null,
          assignee_email: ms?.assignee_email?.trim()?.toLowerCase() || null,
        }))
        .filter((ms) => ms.title);

      for (const ms of cleanMilestones) {
        const msResult = await pool.query(`
          INSERT INTO milestones (goal_id, title, assignee_name, assignee_email)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [goal.id, ms.title, ms.assignee_name, ms.assignee_email]);
        savedMilestones.push(msResult.rows[0]);
      }
    }

    if (deadline) {
      const remindAt = new Date(deadline);
      remindAt.setDate(remindAt.getDate() - 1);
      await pool.query(
        'INSERT INTO reminders (goal_id, remind_at) VALUES ($1, $2)',
        [goal.id, remindAt.toISOString()]
      );

      // --- INTEGRASI GOOGLE CALENDAR ---
      // Jika terdapat batas waktu, kirimkan jadwal ke kalender tim di latar belakang
      const eventDetails = {
        summary: cleanTitle,
        description: description || `Prioritas: ${priority} | Tipe: ${type}`,
        // Setting bawaan: acara di-set jam 08:00 WIB s.d. 10:00 WIB pada hari deadline
        startTime: `${deadline}T08:00:00+07:00`,
        endTime: `${deadline}T10:00:00+07:00`
      };
      createCalendarEvent(eventDetails); 
      // ---------------------------------
    }

    const descStr = `Anda membuat goal ${type === "kelompok" ? "kelompok" : "individu"} baru: "${cleanTitle}"` +
      (priority ? ` dengan prioritas ${priority}` : "");
    await pool.query(
      'INSERT INTO activities (user_id, description) VALUES ($1, $2)',
      [req.user.id, descStr]
    );

    res.status(201).json({
      message: "Goal berhasil dibuat.",
      goal,
      milestones: savedMilestones,
      members: savedMembers,
    });

    // --- INTEGRASI NOTIFIKASI EMAIL SMTP ---
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const userResult = await pool.query(
          'SELECT email, name FROM users WHERE id = $1', [req.user.id]
        );
        const user = userResult.rows[0];

        if (user) {
          const emailTemplate = `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>Halo, ${user.name || "Pengguna"}!</h2>
              <p>Goal baru Anda berjudul <strong>"${cleanTitle}"</strong> telah berhasil dibuat.</p>
              <br>
              <p>Tetap semangat dan pantau progresnya melalui dashboard Anda.</p>
              <p>Salam hangat,</p>
              <p><strong>GoalProgress Team</strong></p>
            </div>
          `;
          
          // Menggunakan helper dari utils/mailer.js (berjalan asinkron)
          sendEmail(user.email, `Goal Baru Dibuat: ${cleanTitle}`, emailTemplate);
        }
    }
    // ---------------------------------------

  } catch (err) {
    console.error("Gagal membuat goal:", err);
    res.status(500).json({ error: "Gagal membuat goal." });
  }
});

// ─── PUT /api/goals/:id ───────────────────────────────────────────────────────
// Hanya pemilik yang bisa edit metadata goal
router.put("/:id", async (req, res) => {
  const { title, description, deadline, priority } = req.body;
  const cleanTitle = title?.trim();

  try {
    const updateResult = await pool.query(`
      UPDATE goals
      SET
        title       = COALESCE($1, title),
        description = COALESCE($2, description),
        deadline    = COALESCE($3, deadline),
        priority    = COALESCE($4, priority),
        updated_at  = now()
      WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL
      RETURNING *
    `, [cleanTitle || null, description?.trim() || null, deadline || null, priority || null, req.params.id, req.user.id]);

    const goal = updateResult.rows[0];
    if (!goal) return res.status(404).json({ error: "Goal tidak ditemukan atau kamu bukan pemiliknya." });

    res.json({ message: "Goal berhasil diupdate.", goal });
  } catch (err) {
    console.error("Gagal mengupdate goal:", err);
    res.status(500).json({ error: "Gagal mengupdate goal." });
  }
});

// ─── POST /api/goals/:id/members ──────────────────────────────────────────────
// Hanya pemilik yang bisa tambah anggota
router.post("/:id/members", async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Nama dan email wajib diisi." });

  try {
    const goalResult = await pool.query(
      'SELECT id FROM goals WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (goalResult.rows.length === 0)
      return res.status(404).json({ error: "Goal tidak ditemukan atau kamu bukan pemiliknya." });

    const normalizedEmail = email.trim().toLowerCase();

    // Cek apakah email ini sudah punya akun
    const userLookup = await pool.query(
      'SELECT id FROM users WHERE email = $1', [normalizedEmail]
    );
    const existingUserId = userLookup.rows[0]?.id || null;

    const memResult = await pool.query(`
      INSERT INTO goal_members (goal_id, name, email, role, member_user_id, status, joined_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (goal_id, email) DO UPDATE
        SET name = EXCLUDED.name, role = EXCLUDED.role
      RETURNING *
    `, [
      req.params.id,
      name.trim(),
      normalizedEmail,
      role?.trim() || null,
      existingUserId,
      existingUserId ? 'active' : 'pending',
      existingUserId ? new Date().toISOString() : null,
    ]);

    res.status(201).json(memResult.rows[0]);
  } catch (err) {
    console.error("Gagal menambahkan anggota:", err);
    res.status(500).json({ error: "Gagal menambahkan anggota." });
  }
});

// ─── DELETE /api/goals/:id/members/:memberId ──────────────────────────────────
router.delete("/:id/members/:memberId", async (req, res) => {
  try {
    const goalResult = await pool.query(
      'SELECT id FROM goals WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (goalResult.rows.length === 0)
      return res.status(404).json({ error: "Goal tidak ditemukan atau kamu bukan pemiliknya." });

    await pool.query(
      'DELETE FROM goal_members WHERE id = $1 AND goal_id = $2',
      [req.params.memberId, req.params.id]
    );

    res.json({ message: "Anggota berhasil dihapus." });
  } catch (err) {
    console.error("Gagal menghapus anggota:", err);
    res.status(500).json({ error: "Gagal menghapus anggota." });
  }
});

// ─── DELETE /api/goals/:id (soft delete) ─────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const deleteResult = await pool.query(`
      UPDATE goals
      SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id, req.user.id]);

    const goal = deleteResult.rows[0];
    if (!goal) return res.status(404).json({ error: "Goal tidak ditemukan atau kamu bukan pemiliknya." });

    res.json({ message: "Goal berhasil dihapus (Soft Delete)." });
  } catch (err) {
    console.error("Gagal menghapus goal:", err);
    res.status(500).json({ error: "Gagal menghapus goal." });
  }
});

module.exports = router;