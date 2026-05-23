const express = require("express");
const pool = require("../lib/db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// Helper: cek apakah user punya akses ke goal (pemilik atau anggota)
async function getGoalAccess(goalId, userId, userEmail) {
  const result = await pool.query(`
    SELECT g.*,
      CASE WHEN g.user_id = $2 THEN true ELSE false END AS is_owner
    FROM goals g
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
  `, [goalId, userId, userEmail]);
  return result.rows[0] || null;
}

// PATCH /api/milestones/:id/done
router.patch("/:id/done", async (req, res) => {
  const { is_done } = req.body;
  if (typeof is_done !== "boolean") {
    return res.status(400).json({ error: "Status milestone harus bernilai true atau false." });
  }

  try {
    const userResult = await pool.query(
      'SELECT email, name FROM users WHERE id = $1', [req.user.id]
    );
    const user = userResult.rows[0];
    const userEmail = user?.email;

    const existingResult = await pool.query(`
      SELECT m.*, g.user_id AS goal_creator_id, g.type AS goal_type
      FROM milestones m
      JOIN goals g ON g.id = m.goal_id
      WHERE m.id = $1
    `, [req.params.id]);
    const ms = existingResult.rows[0];
    if (!ms) return res.status(404).json({ error: "Milestone tidak ditemukan." });

    const isOwner    = ms.goal_creator_id === req.user.id;
    // Null assignee = milik pemilik goal
    const isAssignee = ms.assignee_email
      ? ms.assignee_email.toLowerCase() === userEmail.toLowerCase()
      : isOwner;

    if (!isOwner && !isAssignee) {
      return res.status(403).json({ error: "Akses ditolak. Anda tidak memiliki izin pada milestone ini." });
    }

    const milestoneResult = await pool.query(`
      UPDATE milestones SET is_done = $1, updated_at = now()
      WHERE id = $2 RETURNING *
    `, [is_done, req.params.id]);
    const milestone = milestoneResult.rows[0];

    const goalResult = await pool.query('SELECT * FROM goals WHERE id = $1', [milestone.goal_id]);
    const goal = goalResult.rows[0];

    const milestonesResult = await pool.query(
      'SELECT * FROM milestones WHERE goal_id = $1', [milestone.goal_id]
    );
    const milestones = milestonesResult.rows;

    const total = milestones.length;
    const done  = milestones.filter(m => m.is_done).length;
    const projectProgress = total > 0 ? Math.round((done / total) * 100 * 100) / 100 : 0;

    const personalMilestones = milestones.filter(m =>
      goal.type === "individu" ||
      (m.assignee_email ? m.assignee_email === userEmail : ms.goal_creator_id === req.user.id)
    );
    const personalTotal = personalMilestones.length;
    const personalDone  = personalMilestones.filter(m => m.is_done).length;
    const personalProgress = personalTotal > 0
      ? Math.round((personalDone / personalTotal) * 100 * 100) / 100
      : 0;

    await pool.query(
      'UPDATE goals SET progress = $1, updated_at = now() WHERE id = $2',
      [projectProgress, milestone.goal_id]
    );

    if (is_done) {
      try {
        const displayName = user?.name || user?.email || "Seorang pengguna";
        await pool.query(
          'INSERT INTO activities (user_id, description) VALUES ($1, $2)',
          [req.user.id, `${displayName} menyelesaikan milestone "${milestone.title}" di goal "${goal.title}"`]
        );
      } catch (actErr) {
        console.error("⚠️ Gagal mencatat aktivitas:", actErr.message);
      }
    }

    res.json({
      message: "Milestone diupdate.",
      milestone,
      progress: personalProgress,
      project_progress: projectProgress,
      goal: {
        ...goal,
        type: goal.type || "individu",
        progress: personalProgress,
        personal_progress: personalProgress,
        project_progress: projectProgress,
      },
    });
  } catch (err) {
    console.error("Gagal mengupdate milestone:", err);
    res.status(500).json({ error: `Gagal mengupdate milestone: ${err.message}` });
  }
});

// POST /api/milestones
router.post("/", async (req, res) => {
  const { goal_id, title, assignee_name, assignee_email } = req.body;
  const cleanTitle = title?.trim();

  if (!goal_id || !cleanTitle) {
    return res.status(400).json({ error: "goal_id dan title wajib diisi." });
  }

  try {
    // Ambil info user yang sedang login
    const userResult = await pool.query(
      'SELECT email, name FROM users WHERE id = $1', [req.user.id]
    );
    const currentUser = userResult.rows[0];

    // Cek akses: pemilik ATAU anggota goal_members
    const goal = await getGoalAccess(goal_id, req.user.id, currentUser?.email);
    if (!goal) return res.status(403).json({ error: "Akses ditolak." });

    // Jika assignee tidak diisi → default ke user yang membuat milestone
    const finalAssigneeEmail = assignee_email?.trim()?.toLowerCase() || currentUser?.email;
    const finalAssigneeName  = assignee_name?.trim() || currentUser?.name || currentUser?.email;

    const dupResult = await pool.query(`
      SELECT * FROM milestones
      WHERE goal_id = $1
        AND lower(title) = lower($2)
        AND created_at > now() - interval '5 seconds'
      LIMIT 1
    `, [goal_id, cleanTitle]);
    if (dupResult.rows[0]) {
      return res.status(200).json({ message: "Milestone sudah tersimpan.", milestone: dupResult.rows[0] });
    }

    const milestoneResult = await pool.query(`
      INSERT INTO milestones (goal_id, title, assignee_name, assignee_email)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [goal_id, cleanTitle, finalAssigneeName, finalAssigneeEmail]);
    const milestone = milestoneResult.rows[0];

    const milestonesResult = await pool.query(
      'SELECT * FROM milestones WHERE goal_id = $1', [goal_id]
    );
    const milestones = milestonesResult.rows;

    const total = milestones.length;
    const done  = milestones.filter(m => m.is_done).length;
    const projectProgress = total > 0 ? Math.round((done / total) * 100 * 100) / 100 : 0;

    await pool.query(
      'UPDATE goals SET progress = $1, updated_at = now() WHERE id = $2',
      [projectProgress, goal_id]
    );

    const personalMilestones = milestones.filter(m =>
      goal.type === "individu" ||
      (m.assignee_email
        ? m.assignee_email === currentUser?.email
        : goal.user_id === req.user.id)
    );
    const personalTotal = personalMilestones.length;
    const personalDone  = personalMilestones.filter(m => m.is_done).length;
    const personalProgress = personalTotal > 0
      ? Math.round((personalDone / personalTotal) * 100 * 100) / 100
      : 0;

    res.status(201).json({
      message: "Milestone ditambahkan.",
      milestone,
      progress: personalProgress,
      project_progress: projectProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menambahkan milestone." });
  }
});

// DELETE /api/milestones/:id
router.delete("/:id", async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT email FROM users WHERE id = $1', [req.user.id]
    );
    const userEmail = userResult.rows[0]?.email;

    const milestoneResult = await pool.query(`
      SELECT m.*, g.type AS goal_type, g.user_id AS goal_owner_id
      FROM milestones m
      JOIN goals g ON g.id = m.goal_id
      WHERE m.id = $1
    `, [req.params.id]);
    const milestone = milestoneResult.rows[0];
    if (!milestone) return res.status(404).json({ error: "Milestone tidak ditemukan." });

    // Boleh hapus jika: pemilik goal ATAU assignee milestone ini
    const isOwner    = milestone.goal_owner_id === req.user.id;
    const isAssignee = milestone.assignee_email
      ? milestone.assignee_email.toLowerCase() === userEmail.toLowerCase()
      : isOwner;

    if (!isOwner && !isAssignee) {
      return res.status(403).json({ error: "Akses ditolak. Hanya pemilik goal atau assignee yang bisa hapus milestone." });
    }

    await pool.query('DELETE FROM milestones WHERE id = $1', [req.params.id]);

    const milestonesResult = await pool.query(
      'SELECT * FROM milestones WHERE goal_id = $1', [milestone.goal_id]
    );
    const milestones = milestonesResult.rows;

    const total = milestones.length;
    const done  = milestones.filter(m => m.is_done).length;
    const projectProgress = total > 0 ? Math.round((done / total) * 100 * 100) / 100 : 0;

    await pool.query(
      'UPDATE goals SET progress = $1, updated_at = now() WHERE id = $2',
      [projectProgress, milestone.goal_id]
    );

    const personalMilestones = milestones.filter(m =>
      milestone.goal_type === "individu" ||
      (m.assignee_email
        ? m.assignee_email === userEmail
        : milestone.goal_owner_id === req.user.id)
    );
    const personalTotal = personalMilestones.length;
    const personalDone  = personalMilestones.filter(m => m.is_done).length;
    const personalProgress = personalTotal > 0
      ? Math.round((personalDone / personalTotal) * 100 * 100) / 100
      : 0;

    res.json({
      message: "Milestone dihapus.",
      progress: personalProgress,
      project_progress: projectProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus milestone." });
  }
});

module.exports = router;
