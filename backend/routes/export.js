const express = require("express");
const pool = require("../lib/db"); // Ubah sql menjadi pool
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// GET /api/export  <-- "Ekspor laporan" dari sequence diagram
// "ambil semua data goal" → "kembalikan dataset" → "buat file laporan"
router.get("/", async (req, res) => {
  const format = req.query.format || "pdf"; // pdf atau csv

  try {
    // Ambil data profil user
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // "ambil semua data goal" dari sequence diagram
    // Perhatikan penggunaan $1 untuk parameter req.user.id
    const goalsResult = await pool.query(`
      SELECT
        g.id,
        g.title,
        g.description,
        g.deadline,
        g.priority,
        g.progress,
        g.created_at,
        json_agg(
          json_build_object(
            'id', m.id,
            'title', m.title,
            'is_done', m.is_done
          ) ORDER BY m.created_at
        ) FILTER (WHERE m.id IS NOT NULL) AS milestones
      FROM goals g
      LEFT JOIN milestones m ON m.goal_id = g.id
      WHERE g.user_id = $1
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    
    // Ambil array datanya
    const goals = goalsResult.rows;

    if (format === "csv") {
      // Buat CSV sederhana
      const rows = ["ID,Judul,Deskripsi,Deadline,Prioritas,Progress (%)"];
      for (const g of goals) {
        rows.push(
          `"${g.id}","${g.title}","${g.description || ""}","${g.deadline || ""}","${g.priority || "medium"}","${g.progress}"`
        );
      }
      const csvContent = rows.join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="laporan-goals-${Date.now()}.csv"`
      );
      return res.send(csvContent);
    }

    // Format: PDF
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laporan-goals-${Date.now()}.pdf"`
    );
    doc.pipe(res);

    // Title & Logo
    doc.fillColor("#2563eb").fontSize(26).text("GoalProgress", { continued: true });
    doc.fillColor("#6b7280").fontSize(12).text("  |  Laporan Sasaran & Progres Target", { align: "right" });
    doc.moveDown(0.2);

    // Horizontal line
    doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.moveDown(1);

    // Summary Info Box
    const userName = user?.name || "Pengguna GoalProgress";
    const userEmail = user?.email || "";
    const totalGoals = goals.length;
    const avgProgress = totalGoals > 0 
      ? Math.round((goals.reduce((sum, g) => sum + parseFloat(g.progress), 0) / totalGoals) * 100) / 100 
      : 0;

    const boxY = doc.y;
    doc.fillColor("#f0f7ff").rect(50, boxY, 510, 80).fill();

    doc.fillColor("#1e3a8a").fontSize(10);
    doc.text(`Nama Pengguna: ${userName}`, 65, boxY + 15);
    doc.text(`Email: ${userEmail}`, 65, boxY + 30);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 65, boxY + 45);

    doc.text(`Total Sasaran (Goals): ${totalGoals}`, 350, boxY + 20);
    doc.text(`Rata-rata Progres: ${avgProgress}%`, 350, boxY + 40);

    doc.y = boxY + 95;
    doc.moveDown(1);

    doc.fillColor("#111827").fontSize(16).text("Daftar Sasaran & Progres Kerja", { underline: true });
    doc.moveDown(0.5);

    if (totalGoals === 0) {
      doc.fillColor("#6b7280").fontSize(12).text("Belum ada target/sasaran yang dibuat.", { align: "center" });
    } else {
      goals.forEach((g, index) => {
        // Safe page break if reaching near page bottom
        if (doc.y > 630) {
          doc.addPage();
        }

        doc.moveDown(0.5);
        const priorityLabel = g.priority ? g.priority.toUpperCase() : "MEDIUM";
        const priorityColor = g.priority === "high" ? "#ef4444" : g.priority === "medium" ? "#f59e0b" : "#10b981";

        // Title with Priority tag
        doc.fillColor(priorityColor).fontSize(10).text(`[PRIORITAS: ${priorityLabel}]`, { continued: true });
        doc.fillColor("#111827").fontSize(13).text(`  ${index + 1}. ${g.title}`);
        doc.moveDown(0.2);

        // Deadline
        if (g.deadline) {
          const dateStr = new Date(g.deadline).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' });
          doc.fillColor("#ef4444").fontSize(9).text(`⏰ Target Deadline: ${dateStr}`);
          doc.moveDown(0.2);
        }

        // Description
        if (g.description) {
          doc.fillColor("#4b5563").fontSize(10).text(g.description, { width: 490 });
          doc.moveDown(0.3);
        }

        // Progress Text
        const prog = parseFloat(g.progress) || 0;
        doc.fillColor("#374151").fontSize(10).text(`Progres Pencapaian: ${Math.round(prog)}%`);
        doc.moveDown(0.2);

        // Custom Visual Progress Bar
        const barY = doc.y;
        doc.fillColor("#e5e7eb").rect(50, barY, 300, 8).fill();
        if (prog > 0) {
          doc.fillColor("#2563eb").rect(50, barY, (prog / 100) * 300, 8).fill();
        }
        doc.y = barY + 12;

        // Milestones checklist
        const mList = g.milestones || [];
        const validMsList = mList.filter(m => m && m.id);
        if (validMsList.length > 0) {
          doc.moveDown(0.4);
          doc.fillColor("#1f2937").fontSize(10).text("Tahapan Pencapaian (Milestones):", { indent: 15 });
          doc.moveDown(0.2);

          validMsList.forEach(m => {
            if (doc.y > 700) doc.addPage();
            const checkbox = m.is_done ? "[x] " : "[  ] ";
            const itemColor = m.is_done ? "#9ca3af" : "#374151";
            doc.fillColor(itemColor).fontSize(9.5).text(`${checkbox} ${m.title}`, { indent: 30 });
          });
        }

        doc.moveDown(0.8);
        // Divider line between goals
        doc.moveTo(50, doc.y).lineTo(560, doc.y).strokeColor("#f3f4f6").lineWidth(1).stroke();
        doc.moveDown(0.8);
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membuat laporan PDF." });
  }
});

module.exports = router;