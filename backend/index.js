require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const goalsRoutes = require("./routes/goals");
const milestonesRoutes = require("./routes/milestones");
const exportRoutes = require("./routes/export");
const activitiesRoutes = require("./routes/activities");
const teamRoutes = require("./routes/team");

const app = express();

// --- PENGATURAN CORS BARU ---
app.use(cors({
  origin: [
    "http://localhost:5173", // Mengizinkan akses dari laptop saat development (lokal)
    "https://sistem-goals-dashboard.vercel.app" // GANTI DENGAN URL VERCEL ASLI KALIAN
  ],
  credentials: true
}));
// -----------------------------

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/goals", goalsRoutes);
app.use("/api/milestones", milestonesRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/team", teamRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Goal Dashboard API is running 🚀" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Listen to port for local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
  });
}

module.exports = app;