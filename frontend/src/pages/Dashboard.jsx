import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  BarChart2, Bell, Calendar, Check, CheckCircle2, ChevronRight, Clock, Edit2,
  FileText, Flag, Grid2X2, LogOut, Mail, MessageSquare, Plus, PlusCircle,
  Search, Target, Trash2, TrendingUp, User, UserPlus, Users, X, Zap,
  ArrowLeft, Activity,
} from "lucide-react";
import {
  getGoals, createGoal, updateGoal, deleteGoal, toggleMilestone, addMilestone,
  deleteMilestone, getGoal, exportReport, getUser, logout, isLoggedIn,
  getActivities, getTeam, addTeamMember, deleteTeamMember, addGoalMember, deleteGoalMember,
} from "../lib/api";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = { high: "#f87171", medium: "#fbbf24", low: "#34d399" };
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b"];

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",    icon: Grid2X2 },
  { id: "create",     label: "Buat Goal",    icon: PlusCircle },
  { id: "tim",        label: "Tim",          icon: Users },
  { id: "notifikasi", label: "Notifikasi",   icon: Bell },
  { id: "analytics",  label: "Analytics",   icon: BarChart2 },
  { id: "export",     label: "Export Report",icon: FileText },
  { id: "profil",     label: "Profil",       icon: User },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeProgress(milestones) {
  if (!milestones || milestones.length === 0) return 0;
  const done = milestones.filter(m => m.is_done).length;
  return Math.round((done / milestones.length) * 100);
}

function formatDate(v, fallback = "–") {
  if (!v) return fallback;
  return new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(v, fallback = "–") {
  if (!v) return fallback;
  return new Date(v).toLocaleDateString("id-ID");
}

function initials(text = "U") {
  return (
    text.split(" ").filter(Boolean).map(p => p[0]).join("").slice(0, 2).toUpperCase() || "U"
  );
}

// ─── SMALL REUSABLE COMPONENTS ────────────────────────────────────────────────
const ProgressBar = memo(({ value, color }) => {
  const safe = Math.max(0, Math.min(100, asNumber(value)));
  return (
    <div className="progress-track">
      <div
        className="progress-fill"
        style={{
          width: `${safe}%`,
          ...(color ? { background: color } : {}),
        }}
      />
    </div>
  );
});

const Badge = memo(({ label }) => {
  const cls = label === "high" ? "badge-high" : label === "low" ? "badge-low" : "badge-medium";
  return <span className={`badge ${cls}`}>{label}</span>;
});

const Avatar = memo(({ name, size = 38 }) => (
  <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.35 }}>
    {initials(name || "U")}
  </div>
));

const Divider = () => <div className="divider" />;

const IconBtn = memo(({ children, onClick, disabled, label, danger }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 32, height: 32,
      border: danger ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(59,130,246,0.15)",
      borderRadius: 8,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: danger ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.04)",
      color: danger ? "#ef4444" : "#475569",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "all 0.18s ease",
      flexShrink: 0,
    }}
    onMouseEnter={e => {
      if (!disabled) {
        e.currentTarget.style.opacity = "0.8";
        if (danger) e.currentTarget.style.boxShadow = "0 0 12px rgba(239,68,68,0.2)";
        else e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)";
      }
    }}
    onMouseLeave={e => {
      e.currentTarget.style.opacity = disabled ? "0.5" : "1";
      e.currentTarget.style.boxShadow = "none";
      e.currentTarget.style.borderColor = danger ? "rgba(239,68,68,0.25)" : "rgba(59,130,246,0.15)";
    }}
  >
    {children}
  </button>
));

const Label = ({ children }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, color: "#475569",
    marginBottom: 6, letterSpacing: "0.07em", textTransform: "uppercase",
  }}>
    {children}
  </div>
);

// ─── APP SHELL ────────────────────────────────────────────────────────────────
function AppShell({ user, activeNav, setActiveNav, onCreate, onExport, onLogout, onNavigate, children }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif", position: "relative" }}>
      {/* SIDEBAR */}
      <aside className="sidebar" style={{ position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{
          height: 62, display: "flex", alignItems: "center", gap: 10,
          padding: "0 18px", borderBottom: "1px solid var(--border-subtle)",
          position: "relative", zIndex: 1,
        }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>
            <span style={{ color: "var(--accent-primary)" }}>Goal Progress Dashboard</span>
          </span>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 10px", flex: 1, position: "relative", zIndex: 1 }}>
          <div className="section-label" style={{ marginTop: 6 }}>Menu</div>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${activeNav === id && id !== "create" && id !== "export" ? "active" : ""}`}
              onClick={() => {
                onNavigate?.();
                if (id === "create") return onCreate();
                if (id === "export") return onExport();
                setActiveNav(id);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "14px 14px 20px", borderTop: "1px solid var(--border-subtle)", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar name={user?.name || user?.email} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name || "Pengguna"}
              </div>
              <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email || ""}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.14)",
              borderRadius: 8, padding: "8px 12px", cursor: "pointer",
              color: "#f87171", fontSize: 12, fontWeight: 700, width: "100%",
              transition: "all 0.18s ease", letterSpacing: "0.02em",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(239,68,68,0.15)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
              e.currentTarget.style.boxShadow = "0 0 15px rgba(239,68,68,0.2)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(239,68,68,0.07)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.14)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{
        flex: 1, overflowY: "auto",
        background: "linear-gradient(160deg, #f8fafc 0%, #eff6ff 50%, #f8fafc 100%)",
        display: "flex", flexDirection: "column", position: "relative", zIndex: 1,
      }}>
        {/* Subtle grid pattern on main */}
        <div style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />

        <div className="topbar" style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, letterSpacing: "0.02em" }}>
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ width: 1, height: 18, background: "var(--border-subtle)" }} />
          <div style={{ position: "relative", cursor: "pointer" }}>
            <Bell size={18} color="#475569" />
          </div>
          <Avatar name={user?.name || user?.email} size={30} />
        </div>

        <div className="fade-slide-up" style={{
          maxWidth: 1200, width: "100%", margin: "0 auto",
          padding: "28px 28px 56px", position: "relative", zIndex: 1,
        }}>
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── CREATE GOAL MODAL ────────────────────────────────────────────────────────
function CreateGoalModal({ onClose, onCreated }) {
  const currentUser = useMemo(() => getUser(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("medium");
  const [type, setType] = useState("individu"); // 'individu' atau 'kelompok'
  
  // Anggota khusus proyek ini (untuk goal kelompok)
  const [members, setMembers] = useState([]);
  
  // State input anggota baru
  const [newMemName, setNewMemName] = useState("");
  const [newMemEmail, setNewMemEmail] = useState("");
  const [newMemRole, setNewMemRole] = useState("");
  
  // Daftar team global untuk quick select
  const [globalTeam, setGlobalTeam] = useState([]);
  
  // Milestones dengan skema { title, assignee_name, assignee_email }
  const [milestones, setMilestones] = useState([
    { title: "", assignee_name: "Diri Sendiri", assignee_email: currentUser?.email || "" }
  ]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitRef = useRef(false);

  useEffect(() => {
    // Ambil daftar tim global agar user bisa memilih dengan cepat
    getTeam()
      .then(res => setGlobalTeam(Array.isArray(res) ? res : []))
      .catch(err => console.error("Gagal memuat kontak tim:", err));
  }, []);

  // Saat berpindah tipe ke kelompok, otomatis tambahkan Diri Sendiri jika belum ada
  useEffect(() => {
    if (type === "kelompok" && members.length === 0) {
      // Diri sendiri tidak perlu ada di database goal_members secara redundant,
      // tetapi untuk pilihan assignee di modal, kita bisa gabungkan currentUser.
    }
  }, [type, members, currentUser]);

  const handleAddMember = (e) => {
    e.preventDefault();
    if (!newMemName.trim() || !newMemEmail.trim()) {
      return alert("Nama dan Email wajib diisi untuk anggota tim.");
    }
    // Cek duplikasi email
    if (members.some(m => m.email.toLowerCase() === newMemEmail.trim().toLowerCase()) || newMemEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) {
      return alert("Anggota dengan email ini sudah terdaftar.");
    }
    const newMem = {
      name: newMemName.trim(),
      email: newMemEmail.trim().toLowerCase(),
      role: newMemRole.trim() || "Anggota Tim"
    };
    setMembers([...members, newMem]);
    setNewMemName("");
    setNewMemEmail("");
    setNewMemRole("");
  };

  const handleSelectGlobalMember = (e) => {
    const memberId = e.target.value;
    if (!memberId) return;
    const selected = globalTeam.find(m => m.id === memberId);
    if (selected) {
      if (members.some(m => m.email.toLowerCase() === selected.email.toLowerCase())) {
        alert("Anggota sudah ditambahkan ke proyek ini.");
        e.target.value = "";
        return;
      }
      setMembers([...members, {
        name: selected.name,
        email: selected.email,
        role: selected.role
      }]);
    }
    e.target.value = "";
  };

  const handleRemoveMember = (email) => {
    setMembers(members.filter(m => m.email !== email));
    // Reset milestone yang terassign ke anggota ini menjadi Diri Sendiri
    setMilestones(milestones.map(ms => 
      ms.assignee_email === email 
        ? { ...ms, assignee_name: "Diri Sendiri", assignee_email: currentUser?.email || "" }
        : ms
    ));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitRef.current) return;
    if (!title.trim()) return setError("Judul goal wajib diisi.");
    
    const validMilestones = milestones
      .filter(m => m.title.trim())
      .map(m => ({
        title: m.title.trim(),
        assignee_name: type === "individu" ? "Diri Sendiri" : m.assignee_name,
        assignee_email: type === "individu" ? currentUser?.email : m.assignee_email
      }));

    if (validMilestones.length === 0) {
      return setError("Minimal buat 1 milestone.");
    }

    submitRef.current = true;
    setLoading(true);
    setError("");

    try {
      await createGoal({
        title: title.trim(),
        description: description.trim(),
        deadline: deadline || undefined,
        priority,
        type,
        members: type === "kelompok" ? members : [],
        milestones: validMilestones
      });
      await onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      submitRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 640, maxHeight: "92vh", overflowY: "auto", padding: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                display: "grid", placeItems: "center",
                boxShadow: "0 4px 14px rgba(37,99,235,0.2)",
              }}>
                <Target size={16} color="#fff" />
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                Buat Goal Baru
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Tetapkan sasaran pencapaian pribadi maupun kolaborasi bersama tim.
            </p>
          </div>
          <IconBtn label="Tutup" onClick={onClose} disabled={loading}><X size={17} /></IconBtn>
        </div>

        {/* Tipe Goal Toggle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <button
            type="button"
            className={`nav-item ${type === "individu" ? "active" : ""}`}
            onClick={() => setType("individu")}
            style={{
              padding: "14px", justifyContent: "center", gap: 8, height: "auto",
              border: `1px solid ${type === "individu" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: 12, fontSize: 14, fontWeight: 700
            }}
          >
            <User size={16} /> Individu
          </button>
          <button
            type="button"
            className={`nav-item ${type === "kelompok" ? "active" : ""}`}
            onClick={() => setType("kelompok")}
            style={{
              padding: "14px", justifyContent: "center", gap: 8, height: "auto",
              border: `1px solid ${type === "kelompok" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: 12, fontSize: 14, fontWeight: 700
            }}
          >
            <Users size={16} /> Kelompok (Kolaboratif)
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Judul Goal *</Label>
            <input className="tech-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Launching Aplikasi Goal Tracker" autoFocus disabled={loading} />
          </div>
          <div>
            <Label>Deskripsi</Label>
            <textarea className="tech-input" style={{ minHeight: 70, resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Deskripsi singkat mengenai goal atau projek ini..." disabled={loading} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Deadline</Label>
              <input className="tech-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ colorScheme: "light" }} disabled={loading} />
            </div>
            <div>
              <Label>Prioritas</Label>
              <select className="tech-input" value={priority} onChange={e => setPriority(e.target.value)} style={{ colorScheme: "light" }} disabled={loading}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Bagian Anggota Tim (Hanya untuk Goal Kelompok) */}
          {type === "kelompok" && (
            <div style={{ padding: "16px", background: "rgba(59,130,246,0.03)", border: "1px solid rgba(59,130,246,0.1)", borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Label>Anggota Tim Proyek ({members.length})</Label>
                {globalTeam.length > 0 && (
                  <select
                    className="tech-input"
                    onChange={handleSelectGlobalMember}
                    style={{ width: "auto", padding: "4px 10px", fontSize: 12, height: "auto" }}
                    defaultValue=""
                  >
                    <option value="" disabled>Pilih dari Kontak...</option>
                    {globalTeam.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Daftar Anggota Proyek Saat Ini */}
              {members.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {members.map(m => (
                    <div key={m.email} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: "#fff", border: "1px solid rgba(59,130,246,0.15)",
                      borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)"
                    }}>
                      <span>{m.name} <span style={{ color: "#475569", fontWeight: 400 }}>({m.role})</span></span>
                      <button type="button" onClick={() => handleRemoveMember(m.email)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13, display: "grid", placeItems: "center" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, fontStyle: "italic" }}>
                  Belum ada anggota kelompok ditambahkan. Tambahkan di bawah ini.
                </div>
              )}

              {/* Input Anggota Baru */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr auto", gap: 8, alignItems: "end" }}>
                <input className="tech-input" style={{ fontSize: 12.5, padding: "8px 10px" }} value={newMemName} onChange={e => setNewMemName(e.target.value)} placeholder="Nama" disabled={loading} />
                <input className="tech-input" style={{ fontSize: 12.5, padding: "8px 10px" }} type="email" value={newMemEmail} onChange={e => setNewMemEmail(e.target.value)} placeholder="Email" disabled={loading} />
                <input className="tech-input" style={{ fontSize: 12.5, padding: "8px 10px" }} value={newMemRole} onChange={e => setNewMemRole(e.target.value)} placeholder="Role (cth: Designer)" disabled={loading} />
                <button type="button" onClick={handleAddMember} disabled={loading} className="btn-success" style={{ padding: "8px 14px", fontSize: 12 }}>
                  Tambah
                </button>
              </div>
            </div>
          )}

          {/* Bagian Milestones */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Label>Breakdown Milestones *</Label>
              {type === "kelompok" && (
                <span style={{ fontSize: 11, color: "var(--accent-primary)", fontWeight: 700 }}>
                  💡 Utamakan buat milestone untuk Diri Sendiri agar tercatat di dashboard utama
                </span>
              )}
            </div>

            {milestones.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: type === "kelompok" ? "1.5fr 1fr auto" : "1fr auto", gap: 8, marginBottom: 8 }}>
                <input
                  className="tech-input"
                  value={m.title}
                  onChange={e => {
                    const u = [...milestones];
                    u[i].title = e.target.value;
                    setMilestones(u);
                  }}
                  placeholder={`Nama milestone ${i + 1}`}
                  disabled={loading}
                />
                
                {/* Dropdown Penerima Tugas (Hanya Tampil Jika Goal Kelompok) */}
                {type === "kelompok" && (
                  <select
                    className="tech-input"
                    value={m.assignee_email}
                    onChange={e => {
                      const u = [...milestones];
                      const email = e.target.value;
                      const name = email === currentUser?.email ? "Diri Sendiri" : (members.find(mem => mem.email === email)?.name || "Diri Sendiri");
                      u[i].assignee_email = email;
                      u[i].assignee_name = name;
                      setMilestones(u);
                    }}
                    style={{ colorScheme: "light" }}
                    disabled={loading}
                  >
                    <option value={currentUser?.email}>👤 {currentUser?.name || "Diri Sendiri"}</option>
                    {members.map(mem => (
                      <option key={mem.email} value={mem.email}>👤 {mem.name}</option>
                    ))}
                  </select>
                )}

                {milestones.length > 1 && (
                  <IconBtn danger label="Hapus" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} disabled={loading}>
                    <X size={14} />
                  </IconBtn>
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={loading}
              onClick={() => setMilestones([...milestones, { title: "", assignee_name: "Diri Sendiri", assignee_email: currentUser?.email || "" }])}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent", border: "1px dashed rgba(59,130,246,0.4)",
                borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                fontSize: 13, color: "var(--accent-primary)", fontWeight: 600, marginTop: 2,
                transition: "all 0.18s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)";
                e.currentTarget.style.background = "rgba(99,102,241,0.06)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Plus size={14} /> Tambah Milestone
            </button>
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} disabled={loading} className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
              Batal
            </button>
            <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 2, justifyContent: "center" }}>
              {loading ? "Menyimpan..." : "Simpan Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── GOAL DETAIL ──────────────────────────────────────────────────────────────
function GoalDetailView({ goalId, onBack, onUpdate }) {
  const currentUser = useMemo(() => getUser(), []);
  const [data, setData] = useState(null);
  const [newMs, setNewMs] = useState("");
  // Penerima tugas untuk milestone baru (jika goal kelompok)
  const [newMsAssigneeEmail, setNewMsAssigneeEmail] = useState(currentUser?.email || "");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [showAllMilestones, setShowAllMilestones] = useState(false);
  const actionRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getGoal(goalId);
      setData(res);
    } catch (err) {
      setError(err.message || "Gagal memuat detail goal.");
    }
  }, [goalId]);

  useEffect(() => { load(); }, [load]);

  async function runAction(name, fn) {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusyAction(name);
    setError("");
    try { await fn(); }
    catch (err) { setError(err.message || "Aksi gagal."); }
    finally { actionRef.current = false; setBusyAction(""); }
  }

  const handleToggle = ms => runAction(`toggle-${ms.id}`, async () => {
    const nextDone = !ms.is_done;
    setData(current => {
      if (!current) return current;
      const nextMilestones = current.milestones.map(item =>
        item.id === ms.id ? { ...item, is_done: nextDone } : item
      );
      
      const total = nextMilestones.length;
      const done = nextMilestones.filter(m => m.is_done).length;
      const projectProgress = total > 0 ? Math.round((done / total) * 100) : 0;
      
      const personalMilestones = nextMilestones.filter(m => 
        current.goal.type === "individu" || m.assignee_email === currentUser.email || !m.assignee_email
      );
      const personalDone = personalMilestones.filter(m => m.is_done).length;
      const personalProgress = personalMilestones.length > 0 ? Math.round((personalDone / personalMilestones.length) * 100) : 0;

      return {
        ...current,
        goal: { 
          ...current.goal, 
          progress: personalProgress,
          personal_progress: personalProgress,
          project_progress: projectProgress
        },
        milestones: nextMilestones,
      };
    });

    try {
      const res = await toggleMilestone(ms.id, nextDone);
      setData(current => {
        if (!current) return current;
        return {
          ...current,
          goal: { 
            ...current.goal, 
            ...(res.goal || {}), 
            progress: res.progress ?? current.goal.progress,
            personal_progress: res.progress ?? current.goal.personal_progress,
            project_progress: res.project_progress ?? current.goal.project_progress
          },
          milestones: current.milestones.map(item =>
            item.id === ms.id ? { ...item, ...(res.milestone || {}), is_done: nextDone } : item
          ),
        };
      });
      onUpdate();
    } catch (err) {
      await load();
      throw err;
    }
  });

  const handleAddMs = () => {
    if (!newMs.trim()) return;
    runAction("add-ms", async () => {
      // Selalu simpan nama asli ke DB agar orang lain bisa membacanya dengan benar
      let assigneeName = currentUser?.name || currentUser?.email || "Anggota";
      if (data?.goal?.type === "kelompok" && newMsAssigneeEmail !== currentUser?.email) {
        assigneeName = data?.members?.find(m => m.email === newMsAssigneeEmail)?.name || "Anggota Tim";
      }
      await addMilestone(goalId, newMs.trim(), assigneeName, newMsAssigneeEmail);
      setNewMs("");
      await load();
      onUpdate();
    });
  };

  const handleDeleteMs = id => runAction(`del-${id}`, async () => {
    await deleteMilestone(id);
    await load();
    onUpdate();
  });

  const handleDeleteGoal = () => {
    if (!window.confirm("Hapus goal ini beserta semua milestone-nya?")) return;
    runAction("delete-goal", async () => {
      await deleteGoal(goalId);
      onUpdate();
      onBack();
    });
  };

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />)}
      </div>
    );
  }

  const { goal, milestones, members } = data;
  const isGroup = goal.type === "kelompok";

  // Filter milestone
  const isOwner = goal.user_id === currentUser?.id;
  const personalMilestones = milestones.filter((ms) => {
    if (!isGroup) return true;
    const isUnassigned = !ms.assignee_email || ms.assignee_email === "";
    // Milestone unassigned hanya milik owner goal, bukan semua anggota
    return ms.assignee_email === currentUser.email || (isUnassigned && isOwner);
  });
  
  const displayedMilestones = showAllMilestones ? milestones : personalMilestones;

  // Hitung progres
  const total = milestones.length;
  const done = milestones.filter(ms => ms.is_done).length;
  const projectProgress = total > 0 ? Math.round((done / total) * 100) : asNumber(goal.project_progress);

  const personalTotal = personalMilestones.length;
  const personalDone = personalMilestones.filter(ms => ms.is_done).length;
  const personalProgress = personalTotal > 0 ? Math.round((personalDone / personalTotal) * 100) : 0;

  const isBusy = !!busyAction;

  return (
    <div className="fade-slide-up">
      <button className="back-btn" onClick={onBack} disabled={isBusy}>
        <ArrowLeft size={14} /> Kembali ke Dashboard
      </button>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 12, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Goal Header Card */}
      <div className="glass-card" style={{ padding: 28, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                {goal.title}
              </h1>
              <Badge label={goal.priority || "medium"} />
              <span className={`badge ${isGroup ? "badge-high" : "badge-low"}`} style={{
                background: isGroup ? "rgba(99,102,241,0.08)" : "rgba(16,185,129,0.08)",
                color: isGroup ? "#6366f1" : "#10b981",
                border: isGroup ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(16,185,129,0.2)",
                textTransform: "uppercase", fontSize: 10, fontWeight: 800, padding: "3px 8px"
              }}>
                {isGroup ? "Kelompok" : "Individu"}
              </span>
            </div>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.65 }}>
              {goal.description || "Belum ada deskripsi."}
            </p>
            {isGroup && members.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Anggota Proyek:</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 600, color: "var(--accent-primary)" }}>
                    Diri Sendiri
                  </span>
                  {members.map(mem => (
                    <span key={mem.email} style={{ background: "rgba(71,85,105,0.05)", border: "1px solid rgba(71,85,105,0.15)", borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 600, color: "#475569" }}>
                      {mem.name} ({mem.role || "Anggota"})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <IconBtn label="Hapus goal" onClick={handleDeleteGoal} disabled={isBusy} danger><Trash2 size={16} /></IconBtn>
        </div>

        <Divider />

        {/* Dashboard Progress Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 20, marginBottom: 22 }}>
          {[
            { icon: Calendar, label: "Deadline", value: formatDate(goal.deadline) },
            { icon: Target, label: isGroup ? "Milestone Saya" : "Milestone", value: `${personalDone} / ${personalTotal} selesai` },
            { icon: TrendingUp, label: isGroup ? "Progres Saya" : "Progress", value: `${personalProgress}%`, highlight: true },
            ...(isGroup ? [{ icon: Users, label: "Progres Projek", value: `${projectProgress}%`, highlight: false }] : [])
          ].map(({ icon: Icon, label, value, highlight }) => (
            <div key={label}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>
                <Icon size={12} /> {label}
              </div>
              <div style={{ fontWeight: 900, color: highlight ? "var(--accent-primary)" : "var(--text-primary)", fontSize: highlight ? 22 : 14, letterSpacing: highlight ? "-0.02em" : "0" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
              <span>PROGRES PERSONAL MURNI</span>
              <span>{personalProgress}%</span>
            </div>
            <ProgressBar value={personalProgress} />
          </div>
          {isGroup && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 4 }}>
                <span>PROGRES TOTAL KELOMPOK (PROJEK)</span>
                <span>{projectProgress}%</span>
              </div>
              <ProgressBar value={projectProgress} color="#6366f1" />
            </div>
          )}
        </div>
      </div>

      {/* Milestones Card */}
      <div className="glass-card" style={{ padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>Milestones</h2>
            {isGroup && (
              <button
                onClick={() => setShowAllMilestones(!showAllMilestones)}
                style={{
                  background: "none", border: "none", color: "var(--accent-primary)",
                  cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: 0, marginTop: 4,
                  display: "inline-flex", alignItems: "center", gap: 4
                }}
              >
                {showAllMilestones ? "Tampilkan Milestone Saya Saja" : `Tampilkan Semua Milestone Proyek (${milestones.length})`}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Input Assignee (jika kelompok) */}
            {isGroup && (
              <select
                className="tech-input"
                value={newMsAssigneeEmail}
                onChange={e => setNewMsAssigneeEmail(e.target.value)}
                style={{ width: 140, padding: "6px 8px", fontSize: 13, height: "auto" }}
                disabled={isBusy}
              >
                <option value={currentUser?.email}>👤 Diri Sendiri</option>
                {/* Tampilkan semua peserta: owner (jika bukan saya) + members (kecuali saya sendiri) */}
                {(() => {
                  const allParticipants = [];
                  // Tambahkan owner jika bukan user yang login
                  if (goal.owner_email && goal.owner_email !== currentUser?.email) {
                    allParticipants.push({ email: goal.owner_email, name: goal.owner_name || goal.owner_email });
                  }
                  // Tambahkan members, kecuali diri sendiri
                  members.forEach(mem => {
                    if (mem.email !== currentUser?.email && !allParticipants.find(p => p.email === mem.email)) {
                      allParticipants.push({ email: mem.email, name: mem.name });
                    }
                  });
                  return allParticipants.map(p => (
                    <option key={p.email} value={p.email}>👤 {p.name}</option>
                  ));
                })()}
              </select>
            )}
            <input
              className="tech-input"
              value={newMs}
              onChange={e => setNewMs(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddMs(); } }}
              disabled={isBusy}
              placeholder="Milestone baru..."
              style={{ width: 180, padding: "6px 10px", fontSize: 13 }}
            />
            <button onClick={handleAddMs} disabled={isBusy || !newMs.trim()} className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {displayedMilestones.length === 0 && (
          <div style={{ textAlign: "center", padding: "44px 0", color: "#475569" }}>
            <Flag size={30} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              {isGroup && !showAllMilestones ? "Anda tidak memiliki milestone di projek ini. Aktifkan 'Tampilkan Semua' untuk memantau anggota lain." : "Belum ada milestone."}
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayedMilestones.map(ms => {
            const msUnassigned = !ms.assignee_email || ms.assignee_email === "";
            const isMine = !isGroup || ms.assignee_email === currentUser?.email || (msUnassigned && isOwner);
            // Helper: resolve nama dari email, cari di semua sumber yang tersedia
            const resolveNameByEmail = (email) => {
              if (!email) return null;
              if (email === currentUser?.email) return currentUser?.name || null;
              const fromMembers = members.find(m => m.email === email);
              if (fromMembers?.name) return fromMembers.name;
              if (email === goal.owner_email && goal.owner_name) return goal.owner_name;
              return null; // tidak ditemukan, akan fallback ke email
            };
            // GANTI MENJADI INI:
            const assigneeLabel = (() => {
              if (!isGroup) return null;
  
              // Normalisasi email untuk menghindari bug case-sensitive
              const currentEmail = currentUser?.email?.toLowerCase().trim();
              const msEmail = ms.assignee_email?.toLowerCase().trim();

              // 1. Jika ini milik user yang sedang login, SELALU tampilkan "Diri Sendiri"
              if (msEmail && msEmail === currentEmail) return "Diri Sendiri";
  
              // 2. Jika bukan milik user yang login, cari nama aslinya dari data members
              const memberData = members.find(m => m.email?.toLowerCase().trim() === msEmail);
              if (memberData?.name) return memberData.name;
  
            // 3. Cek apakah ini milik Owner pembuat goal
              if (msEmail === goal.owner_email?.toLowerCase().trim()) {
                return goal.owner_name || goal.owner_email;
              }
  
            // 4. Fallback jika nama tidak ditemukan
            return (ms.assignee_name && ms.assignee_name !== "Diri Sendiri") 
              ? ms.assignee_name 
              : (ms.assignee_email || "Anggota Tim");
          })();

            return (
              <div key={ms.id} className={`milestone-item ${ms.is_done ? "done" : ""}`} style={{
                border: isMine ? "1px solid rgba(59,130,246,0.12)" : "1px solid rgba(226,232,240,0.4)",
                background: isMine ? "rgba(59,130,246,0.01)" : "rgba(248,250,252,0.5)"
              }}>
                <button
                  className={`milestone-check ${ms.is_done ? "done" : ""}`}
                  onClick={() => handleToggle(ms)}
                  disabled={isBusy}
                  title={ms.is_done ? "Tandai belum selesai" : "Tandai selesai"}
                  style={{ 
                    width: 22, height: 22, flexShrink: 0,
                    border: ms.is_done ? "2px solid #10b981" : "2px solid #cbd5e1",
                    borderRadius: 6, background: ms.is_done ? "#10b981" : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: isBusy ? "not-allowed" : "pointer", padding: 0, transition: "all 0.2s ease"
                  }}
                >
                  {ms.is_done && <Check size={14} strokeWidth={4} color="#fff" />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: ms.is_done ? "var(--accent-emerald)" : "var(--text-primary)",
                    textDecoration: ms.is_done ? "line-through" : "none",
                    transition: "all 0.2s ease",
                  }}>
                    {ms.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {isGroup && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: isMine ? "var(--accent-primary)" : "#64748b" }}>
                        👤 {assigneeLabel}
                      </span>
                    )}
                    {ms.is_done && (
                      <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>
                        ✓ Selesai
                      </span>
                    )}
                  </div>
                </div>
                <IconBtn danger label="Hapus milestone" onClick={() => handleDeleteMs(ms.id)} disabled={isBusy}>
                  <Trash2 size={13} />
                </IconBtn>
              </div>
            );
          })}
        </div>

        {total > 0 && (
          <>
            <Divider />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center", gap: 12 }}>
              {[
                { label: isGroup ? "Projek Selesai" : "Selesai", val: done, color: "#6366f1" },
                { label: isGroup ? "Projek Pending" : "Pending", val: total - done, color: "#fbbf24" },
                { label: "Total Projek", val: total, color: "#a5b4fc" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ padding: "12px 0", background: "rgba(59,130,246,0.04)", borderRadius: 10 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EXPORT MODAL ─────────────────────────────────────────────────────────────
function ExportReportModal({ onClose }) {
  const [format, setFormat] = useState("pdf");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try { await exportReport(format); onClose(); }
    catch (err) { alert(`Gagal ekspor: ${err.message}`); }
    finally { setExporting(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400, overflow: "visible" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>Ekspor Laporan</h3>
          <IconBtn label="Tutup" onClick={onClose}><X size={17} /></IconBtn>
        </div>
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>Pilih format laporan yang ingin diunduh.</p>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {["csv", "pdf"].map(f => (
            <label
              key={f}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                border: `1px solid ${format === f ? "rgba(59,130,246,0.45)" : "rgba(59,130,246,0.08)"}`,
                borderRadius: 12, cursor: "pointer",
                background: format === f ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.02)",
                color: "var(--text-primary)", fontWeight: 600, fontSize: 14,
                transition: "all 0.2s ease",
                boxShadow: format === f ? "0 0 20px rgba(59,130,246,0.1)" : "none",
              }}
            >
              <input type="radio" checked={format === f} onChange={() => setFormat(f)} style={{ accentColor: "var(--accent-primary)" }} />
              <span>Format {f.toUpperCase()}</span>
            </label>
          ))}
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px" }}>
          {exporting ? "Mengunduh..." : "Unduh Laporan"}
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD HOME ───────────────────────────────────────────────────────────
const DashboardHome = memo(({ goals, activities, loading, onCreate, onSelectGoal }) => {
  const total = goals.length;
  const selesai = goals.filter(g => asNumber(g.progress) >= 100).length;
  const dalamProgres = goals.filter(g => asNumber(g.progress) > 0 && asNumber(g.progress) < 100).length;
  const avgProgress = total > 0 ? Math.round(goals.reduce((s, g) => s + asNumber(g.progress), 0) / total) : 0;

  const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const weeklyData = days.map((day, i) => ({
    day,
    progress: Math.max(0, Math.min(100, Math.round(avgProgress * (0.65 + Math.sin(i * 0.9) * 0.35)))),
  }));

  const tertunda = Math.max(0, total - selesai - dalamProgres);
  const pieData = [
    { name: "Selesai", value: selesai },
    { name: "Progres", value: dalamProgres },
    { name: "Pending", value: tertunda },
  ].filter(d => d.value > 0);

  const upcomingGoals = useMemo(() =>
    goals
      .filter(g => g.deadline && asNumber(g.progress) < 100)
      .map(g => ({ ...g, daysLeft: Math.ceil((new Date(g.deadline) - new Date()) / 86400000) }))
      .filter(g => g.daysLeft >= 0 && g.daysLeft <= 14)
      .sort((a, b) => a.daysLeft - b.daysLeft),
    [goals]
  );

  const stats = [
    { label: "Total Goals",      value: total,            icon: Target,       grad: "linear-gradient(135deg,#6366f1,#8b5cf6)", glow: "rgba(99,102,241,0.25)" },
    { label: "Goals Selesai",    value: selesai,          icon: CheckCircle2, grad: "linear-gradient(135deg,#10b981,#34d399)", glow: "rgba(16,185,129,0.25)" },
    { label: "Dalam Progres",    value: dalamProgres,     icon: Clock,        grad: "linear-gradient(135deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.25)" },
    { label: "Rata-rata Progres",value: `${avgProgress}%`,icon: TrendingUp,   grad: "linear-gradient(135deg,#ec4899,#f43f5e)", glow: "rgba(236,72,153,0.25)" },
  ];

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          Dashboard
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
          Ringkasan progres goal dan aktivitas terbaru Anda.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 22 }}>
        {stats.map((s, i) => (
          <div key={s.label} className="stat-card" style={{ animationDelay: `${i * 0.07}s` }}>
            <div className="stat-icon" style={{ background: s.grad, boxShadow: `0 6px 20px ${s.glow}` }}>
              <s.icon size={20} color="#fff" />
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {loading ? <div className="skeleton" style={{ height: 32, width: 60 }} /> : s.value}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(240px,1fr)", gap: 14, marginBottom: 22 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Progres Mingguan
          </h3>
          <ResponsiveContainer width="100%" height={175}>
            <LineChart data={weeklyData}>
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(59, 130, 246, 0.06)" />
              <XAxis dataKey="day" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid rgba(59, 130, 246, 0.15)", borderRadius: 10, color: "var(--text-primary)", boxShadow: "0 8px 25px rgba(59, 130, 246, 0.08)" }}
              />
              <Line type="monotone" dataKey="progress" stroke="url(#lineGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#2563eb" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Status Goals
          </h3>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height={175}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" strokeWidth={0}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(59, 130, 246, 0.15)", borderRadius: 10, color: "var(--text-primary)" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 175, display: "grid", placeItems: "center", color: "#475569", fontSize: 13 }}>
              Belum ada data goal
            </div>
          )}
        </div>
      </div>

      {/* Goals list + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(290px,1fr)", gap: 14, marginBottom: 22 }}>
        {/* Goals Aktif */}
        <div className="glass-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Goals Aktif</h3>
            <button onClick={onCreate} className="btn-primary" style={{ padding: "7px 14px", fontSize: 12 }}>
              <Plus size={13} /> Buat Goal
            </button>
          </div>
          {loading && [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 10, borderRadius: 12 }} />)}
          {!loading && goals.length === 0 && (
            <div style={{ textAlign: "center", padding: "44px 0", color: "#475569" }}>
              <Target size={34} style={{ marginBottom: 12, opacity: 0.25 }} />
              <p style={{ margin: 0, fontSize: 13 }}>Belum ada goal. Buat sekarang!</p>
            </div>
          )}
          {goals.map(goal => (
            <button key={goal.id} className="goal-card" onClick={() => onSelectGoal(goal.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{goal.title}</div>
                  {goal.deadline && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={10} /> {formatShortDate(goal.deadline)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <Badge label={goal.priority || "medium"} />
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 7 }}>
                <span>Progress</span>
                <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{Math.round(asNumber(goal.progress))}%</span>
              </div>
              <ProgressBar value={goal.progress} />
            </button>
          ))}
        </div>

        {/* Aktivitas */}
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Aktivitas Terbaru</h3>
          {activities.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)", fontSize: 13 }}>
              Belum ada aktivitas.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {activities.slice(0, 8).map(act => (
              <div key={act.id} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div className="activity-dot" />
                <div>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{act.description}</p>
                  <span style={{ fontSize: 11, color: "#334155", marginTop: 2, display: "block" }}>{formatShortDate(act.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deadline Terdekat */}
      {upcomingGoals.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            ⏰ Deadline Terdekat
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>
            {upcomingGoals.map(g => (
              <button key={g.id} onClick={() => onSelectGoal(g.id)} className="glass-card" style={{
                padding: 18, cursor: "pointer", textAlign: "left", border: "none", display: "block",
              }}>
                <span className={`deadline-chip ${g.daysLeft === 0 ? "today" : g.daysLeft <= 2 ? "urgent" : ""}`}>
                  {g.daysLeft === 0 ? "Hari ini!" : `${g.daysLeft} hari lagi`}
                </span>
                <h4 style={{ margin: "10px 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.title}</h4>
                <p style={{ margin: 0, color: "#475569", fontSize: 11 }}>{formatDate(g.deadline)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

// ─── TEAM VIEW ────────────────────────────────────────────────────────────────
function TeamView({ goals, activities, onUpdate }) {
  const currentUser = useMemo(() => getUser(), []);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [globalTeam, setGlobalTeam] = useState([]);
  
  // Forms & Actions
  const [newMsTitle, setNewMsTitle] = useState("");
  const [newMsAssigneeEmail, setNewMsAssigneeEmail] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  // Project Members form
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [newMemName, setNewMemName] = useState("");
  const [newMemEmail, setNewMemEmail] = useState("");
  const [newMemRole, setNewMemRole] = useState("");

  // Quick select for project contacts
  const [selectedContactId, setSelectedContactId] = useState("");

  // Loading indicator for collaborative details
  const [selectorLoading, setSelectorLoading] = useState(true);
  const [collaborativeDetails, setCollaborativeDetails] = useState({});

  // 1. Fetch global team contacts
  const loadGlobalTeam = useCallback(async () => {
    try {
      const res = await getTeam();
      setGlobalTeam(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Gagal memuat kontak tim:", err);
    }
  }, []);

  // 2. Fetch details for a specific project
  const loadProjectDetails = useCallback(async (projectId) => {
    if (!projectId) return;
    setProjectLoading(true);
    setError("");
    try {
      const res = await getGoal(projectId);
      setProjectData(res);
      if (res?.goal) {
        setNewMsAssigneeEmail(currentUser?.email || "");
      }
    } catch (err) {
      setError(err.message || "Gagal memuat detail projek.");
    } finally {
      setProjectLoading(false);
    }
  }, [currentUser]);

  // 3. Preload all collaborative details for selectors (stacked avatars, etc.)
  const loadCollaborativeDetails = useCallback(async () => {
    setSelectorLoading(true);
    try {
      const kelompokGoals = goals.filter(g => g.type === 'kelompok');
      const details = {};
      await Promise.all(kelompokGoals.map(async (g) => {
        try {
          const res = await getGoal(g.id);
          details[g.id] = res;
        } catch (e) {
          console.error(`Gagal memuat detail kelompok ${g.id}:`, e);
        }
      }));
      setCollaborativeDetails(details);
    } catch (err) {
      console.error("Gagal memuat detail kolaborasi:", err);
    } finally {
      setSelectorLoading(false);
    }
  }, [goals]);

  useEffect(() => {
    loadGlobalTeam();
  }, [loadGlobalTeam]);

  useEffect(() => {
    if (!selectedProjectId) {
      loadCollaborativeDetails();
      setProjectData(null);
    } else {
      loadProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId, loadCollaborativeDetails, loadProjectDetails]);

  // Handle operations
  const handleToggleMilestone = async (ms) => {
    if (isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await toggleMilestone(ms.id, !ms.is_done);
      await loadProjectDetails(selectedProjectId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "Gagal memperbarui milestone.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddMilestone = async (e) => {
    e.preventDefault();
    if (!newMsTitle.trim() || isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      // Selalu simpan nama asli ke DB agar orang lain bisa membacanya dengan benar
      let assigneeName = currentUser?.name || currentUser?.email || "Anggota";
      if (newMsAssigneeEmail !== currentUser?.email) {
        assigneeName = projectData?.members?.find(m => m.email === newMsAssigneeEmail)?.name || "Anggota Tim";
      }
      await addMilestone(selectedProjectId, newMsTitle.trim(), assigneeName, newMsAssigneeEmail);
      setNewMsTitle("");
      await loadProjectDetails(selectedProjectId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "Gagal menambahkan milestone.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteMilestone = async (msId) => {
    if (!window.confirm("Hapus milestone ini dari projek?")) return;
    if (isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await deleteMilestone(msId);
      await loadProjectDetails(selectedProjectId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "Gagal menghapus milestone.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickContactSelect = (e) => {
    const contactId = e.target.value;
    setSelectedContactId(contactId);
    if (!contactId) return;
    const contact = globalTeam.find(m => m.id === contactId);
    if (contact) {
      setNewMemName(contact.name);
      setNewMemEmail(contact.email);
      setNewMemRole(contact.role);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemName.trim() || !newMemEmail.trim() || isBusy) return;
    
    // Cek jika email adalah milik diri sendiri
    if (newMemEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) {
      return alert("Anda tidak perlu menambahkan Diri Sendiri ke anggota tim secara terpisah.");
    }

    // Cek duplikasi di projek ini
    const isAlreadyMember = projectData?.members?.some(m => m.email.toLowerCase() === newMemEmail.trim().toLowerCase());
    if (isAlreadyMember) {
      return alert("Anggota dengan email ini sudah ada di projek.");
    }

    setIsBusy(true);
    setError("");
    try {
      await addGoalMember(selectedProjectId, {
        name: newMemName.trim(),
        email: newMemEmail.trim().toLowerCase(),
        role: newMemRole.trim() || "Anggota Tim"
      });

      // Simpan ke kontak global jika belum ada
      if (!globalTeam.some(m => m.email.toLowerCase() === newMemEmail.trim().toLowerCase())) {
        try {
          await addTeamMember({
            name: newMemName.trim(),
            email: newMemEmail.trim().toLowerCase(),
            role: newMemRole.trim() || "Anggota Tim",
            status: "Offline"
          });
          loadGlobalTeam();
        } catch (contactErr) {
          console.error("Gagal menyimpan ke kontak global:", contactErr);
        }
      }

      setNewMemName("");
      setNewMemEmail("");
      setNewMemRole("");
      setSelectedContactId("");
      setShowAddMemberForm(false);
      await loadProjectDetails(selectedProjectId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "Gagal mengundang anggota.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteMember = async (mem) => {
    if (!window.confirm(`Hapus ${mem.name} dari projek ini? Milestone yang ditugaskan kepada mereka akan tetap ada.`)) return;
    if (isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await deleteGoalMember(selectedProjectId, mem.id);
      await loadProjectDetails(selectedProjectId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "Gagal menghapus anggota.");
    } finally {
      setIsBusy(false);
    }
  };

  const collaborativeGoals = useMemo(() => {
    return goals.filter(g => g.type === "kelompok");
  }, [goals]);

  // SCREEN 1: PROJECT SELECTOR SCREEN
  if (!selectedProjectId) {
    return (
      <div className="fade-slide-up">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            Kolaborasi Tim
          </h1>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
            Pilih projek kelompok untuk melihat dashboard kolaborasi dan kontribusi tim.
          </p>
        </div>

        {collaborativeGoals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 24px" }} className="glass-card">
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "rgba(99,102,241,0.08)",
              display: "grid", placeItems: "center", margin: "0 auto 20px",
              border: "1px solid rgba(99,102,241,0.2)"
            }}>
              <Users size={30} color="var(--accent-primary)" />
            </div>
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              Belum Ada Projek Kolaboratif
            </h2>
            <p style={{ margin: "0 auto 24px", color: "var(--text-secondary)", fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}>
              Esensi kolaborasi ada di sini! Buat goal baru dan pilih tipe <strong>"Kelompok"</strong> untuk menambahkan anggota tim, menetapkan milestones per orang, dan memantau kemajuan bersama.
            </p>
            <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
              Gunakan menu <strong style={{ color: "var(--accent-primary)" }}>"Buat Goal"</strong> di bilah sisi kiri untuk memulai.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
            {collaborativeGoals.map(g => {
              const details = collaborativeDetails[g.id];
              const membersCount = details?.members?.length || 0;
              const overallProgress = Math.round(g.project_progress || 0);

              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedProjectId(g.id)}
                  className="glass-card"
                  style={{
                    padding: 24, textAlign: "left", cursor: "pointer", border: "1px solid var(--border-subtle)",
                    display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", minHeight: 220
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div className="stat-icon" style={{
                        background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.02))",
                        border: "1px solid rgba(99,102,241,0.2)", width: 40, height: 40, borderRadius: 10, marginBottom: 0
                      }}>
                        <Users size={18} color="var(--accent-primary)" />
                      </div>
                      <Badge label={g.priority || "medium"} />
                    </div>

                    <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                      {g.title}
                    </h3>
                    
                    {g.deadline && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                        <Calendar size={12} /> Deadline: {formatShortDate(g.deadline)}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                      <span>PROGRES KELOMPOK</span>
                      <span style={{ color: "var(--accent-primary)" }}>{overallProgress}%</span>
                    </div>
                    <ProgressBar value={overallProgress} color="#6366f1" />

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(59,130,246,0.06)" }}>
                      {/* Avatar Stack */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ zIndex: 5, border: "2px solid var(--bg-surface)", borderRadius: "50%", background: "#fff" }}>
                          <Avatar name="Diri Sendiri" size={24} />
                        </div>
                        {details?.members?.slice(0, 2).map((m, idx) => (
                          <div key={m.id} style={{ marginLeft: -8, zIndex: 4 - idx, border: "2px solid var(--bg-surface)", borderRadius: "50%", background: "#fff" }}>
                            <Avatar name={m.name} size={24} />
                          </div>
                        ))}
                        {membersCount > 2 && (
                          <div style={{
                            marginLeft: -8, width: 24, height: 24, borderRadius: "50%",
                            background: "var(--accent-primary)", color: "#fff", fontSize: 9, fontWeight: 900,
                            display: "grid", placeItems: "center", border: "2px solid var(--bg-surface)", zIndex: 1
                          }}>
                            +{membersCount - 2}
                          </div>
                        )}
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginLeft: 8 }}>
                          {membersCount + 1} Orang
                        </span>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 700, color: "var(--accent-primary)", gap: 2 }}>
                        Buka <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // SCREEN 2: DETAILED PROJECT TEAM DASHBOARD
  if (projectLoading || !projectData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="skeleton" style={{ height: 40, width: 180, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
          <div className="skeleton" style={{ height: 350, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 350, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  const { goal, milestones, members } = projectData;
  
  // Calculate stats
  const totalMs = milestones.length;
  const doneMs = milestones.filter(m => m.is_done).length;
  const projectPct = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : 0;

  // Filter personal milestones
  const isGoalOwner = goal.user_id === currentUser?.id;
  const myMilestones = milestones.filter(m => {
    const isUnassigned = !m.assignee_email || m.assignee_email === '';
    return m.assignee_email === currentUser?.email || (isUnassigned && isGoalOwner);
  });
  const myTotal = myMilestones.length;
  const myDone = myMilestones.filter(m => m.is_done).length;
  const myPct = myTotal > 0 ? Math.round((myDone / myTotal) * 100) : 0;

  // Compile member specific metrics
  const memberMetrics = [
    {
      name: "Diri Sendiri",
      email: currentUser?.email,
      role: "Pembuat Proyek",
      total: myTotal,
      done: myDone,
      progress: myPct,
      isSelf: true
    },
    ...members.map(m => {
      const memMilestones = milestones.filter(ms => ms.assignee_email === m.email);
      const memTotal = memMilestones.length;
      const memDone = memMilestones.filter(ms => ms.is_done).length;
      const memProgress = memTotal > 0 ? Math.round((memDone / memTotal) * 100) : 0;
      
      return {
        name: m.name,
        email: m.email,
        role: m.role || "Anggota Tim",
        total: memTotal,
        done: memDone,
        progress: memProgress,
        isSelf: false,
        id: m.id
      };
    })
  ];

  return (
    <div className="fade-slide-up">
      {/* Back Button */}
      <button className="back-btn" onClick={() => setSelectedProjectId(null)} style={{ border: "1px solid rgba(59,130,246,0.15)", color: "var(--accent-primary)" }}>
        <ArrowLeft size={14} /> Kembali ke Daftar Projek
      </button>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 12, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Project Header Card */}
      <div className="glass-card" style={{ padding: 26, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                {goal.title}
              </h1>
              <Badge label={goal.priority || "medium"} />
              <span className="badge badge-high" style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)" }}>
                Tim Projek
              </span>
            </div>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 800 }}>
              {goal.description || "Belum ada deskripsi."}
            </p>
          </div>
          {goal.deadline && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Deadline</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{formatDate(goal.deadline)}</div>
            </div>
          )}
        </div>

        <Divider />

        {/* Overall Project Progress Section */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progres Total Projek</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#6366f1" }}>{projectPct}%</span>
          </div>
          <ProgressBar value={projectPct} color="#6366f1" />
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
            <span>🏁 Total: <strong>{totalMs}</strong> Milestone</span>
            <span style={{ color: "var(--accent-emerald)" }}>✓ Selesai: <strong>{doneMs}</strong></span>
            <span style={{ color: "var(--accent-amber)" }}>⏰ Pending: <strong>{totalMs - doneMs}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        
        {/* LEFT COLUMN: Milestone board */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* Milestone checklist board */}
          <div className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>Milestone Board</h2>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Total: {milestones.length} tugas</span>
            </div>

            {/* Input Form for New Milestone */}
            <form onSubmit={handleAddMilestone} style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <input
                className="tech-input"
                value={newMsTitle}
                onChange={e => setNewMsTitle(e.target.value)}
                placeholder="Tulis tugas/milestone baru..."
                disabled={isBusy}
                style={{ flex: 1, minWidth: 200, padding: "8px 12px", fontSize: 13.5 }}
                required
              />
              <select
                className="tech-input"
                value={newMsAssigneeEmail}
                onChange={e => setNewMsAssigneeEmail(e.target.value)}
                disabled={isBusy}
                style={{ width: 160, padding: "8px 12px", fontSize: 13.5, cursor: "pointer", colorScheme: "light" }}
              >
                <option value={currentUser?.email}>👤 Diri Sendiri</option>
                {/* Tampilkan pemilik goal jika viewer bukan pemilik */}
                {goal.user_id !== currentUser?.id && goal.owner_email && (
                  <option value={goal.owner_email}>👤 {goal.owner_name || goal.owner_email}</option>
                )}
                {/* Tampilkan anggota lain, kecuali diri sendiri dan owner (sudah ditampilkan di atas) */}
                {members
                  .filter(m => m.email !== currentUser?.email && m.email !== goal.owner_email)
                  .map(m => (
                    <option key={m.email} value={m.email}>👤 {m.name}</option>
                  ))
                }
              </select>
              <button
                type="submit"
                disabled={isBusy || !newMsTitle.trim()}
                className="btn-primary"
                style={{ padding: "8px 16px", fontSize: 13.5 }}
              >
                <Plus size={14} /> Tambah
              </button>
            </form>

            {milestones.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <Flag size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
                <p style={{ margin: 0, fontSize: 13 }}>Belum ada milestone di projek ini.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {milestones.map(ms => {
                  // Null assignee = milik pemilik goal (bukan semua orang)
                  const isUnassigned = !ms.assignee_email || ms.assignee_email === "";
                  const isOwnerViewing = goal.user_id === currentUser?.id;
                  const isMine = ms.assignee_email === currentUser?.email ||
                    (isUnassigned && isOwnerViewing);

                  const labelName = (() => {
                    const currentEmail = currentUser?.email?.toLowerCase().trim();
                    const msEmail = ms.assignee_email?.toLowerCase().trim();

                    // 1. Jika ini milik user yang login
                    if (msEmail && msEmail === currentEmail) return "Diri Sendiri";
  
                    // 2. Cek dari daftar members tim
                    const memberData = members.find(m => m.email?.toLowerCase().trim() === msEmail);
                    if (memberData?.name) return memberData.name;
  
                    // 3. Cek apakah ini milik Owner
                    if (msEmail === goal.owner_email?.toLowerCase().trim()) {
                      return goal.owner_name || goal.owner_email;
                    }

                    // 4. Fallback default
                    return (ms.assignee_name && ms.assignee_name !== "Diri Sendiri") 
                      ? ms.assignee_name 
                      : (ms.assignee_email || "Anggota Tim");
                  })();
                  
                  return (
                    <div
                      key={ms.id}
                      className={`milestone-item ${ms.is_done ? "done" : ""}`}
                      style={{
                        padding: "12px 16px",
                        border: isMine ? "1px solid rgba(59,130,246,0.12)" : "1px solid rgba(226,232,240,0.5)",
                        background: isMine ? "rgba(59,130,246,0.01)" : "rgba(248,250,252,0.5)"
                      }}
                    >
                      <button
                        type="button"
                        className={`milestone-check ${ms.is_done ? "done" : ""}`}
                        onClick={() => handleToggleMilestone(ms)}
                        disabled={isBusy}
                        style={{ 
                          width: 22, height: 22, flexShrink: 0,
                          border: ms.is_done ? "2px solid #10b981" : "2px solid #cbd5e1",
                          borderRadius: 6, background: ms.is_done ? "#10b981" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: isBusy ? "not-allowed" : "pointer", padding: 0, transition: "all 0.2s ease"
                        }}
                      >
                        {ms.is_done && <Check size={14} strokeWidth={4} color="#fff" />}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5, fontWeight: 600,
                          color: ms.is_done ? "var(--accent-emerald)" : "var(--text-primary)",
                          textDecoration: ms.is_done ? "line-through" : "none",
                          transition: "all 0.2s ease"
                        }}>
                          {ms.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{
                            fontSize: 10.5, fontWeight: 700,
                            padding: "2px 6px", borderRadius: 4,
                            background: isMine ? "rgba(59,130,246,0.06)" : "rgba(71,85,105,0.06)",
                            color: isMine ? "var(--accent-primary)" : "#64748b"
                          }}>
                            👤 {labelName}
                          </span>
                          {ms.is_done && (
                            <span style={{ fontSize: 11, color: "var(--accent-emerald)", fontWeight: 700 }}>
                              ✓ Selesai
                            </span>
                          )}
                        </div>
                      </div>

                      <IconBtn
                        danger
                        label="Hapus milestone"
                        onClick={() => handleDeleteMilestone(ms.id)}
                        disabled={isBusy}
                      >
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Team metrics & Project members */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* Member Progress List */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 14.5, fontWeight: 800, color: "var(--text-primary)" }}>
              Kontribusi Anggota
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {memberMetrics.map(mem => (
                <div key={mem.email} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Avatar name={mem.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {mem.isSelf ? "Diri Sendiri" : mem.name}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)" }}>{mem.progress}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                      {mem.role} • {mem.done}/{mem.total} milestone
                    </div>
                    <ProgressBar value={mem.progress} color={mem.isSelf ? "#2563eb" : "#8b5cf6"} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project Members Manager */}
          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "var(--text-primary)" }}>
                Kelola Tim Projek
              </h2>
              <button
                type="button"
                onClick={() => setShowAddMemberForm(!showAddMemberForm)}
                className="btn-ghost"
                style={{ padding: "4px 8px", fontSize: 11, height: "auto" }}
              >
                {showAddMemberForm ? "Batal" : "+ Anggota"}
              </button>
            </div>

            {/* Invite Form inside project */}
            {showAddMemberForm && (
              <form onSubmit={handleAddMember} className="scale-in" style={{ padding: 12, background: "rgba(59,130,246,0.02)", border: "1px solid rgba(59,130,246,0.08)", borderRadius: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Undang ke Projek</div>
                
                {globalTeam.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>PILIH DARI KONTAK CEPAT</label>
                    <select
                      className="tech-input"
                      value={selectedContactId}
                      onChange={handleQuickContactSelect}
                      style={{ padding: "6px 8px", fontSize: 12, height: "auto", colorScheme: "light" }}
                    >
                      <option value="">-- Pilih Anggota Tim --</option>
                      {globalTeam.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    className="tech-input"
                    value={newMemName}
                    onChange={e => setNewMemName(e.target.value)}
                    placeholder="Nama anggota"
                    style={{ padding: "6px 8px", fontSize: 12 }}
                    required
                  />
                  <input
                    className="tech-input"
                    type="email"
                    value={newMemEmail}
                    onChange={e => setNewMemEmail(e.target.value)}
                    placeholder="Email"
                    style={{ padding: "6px 8px", fontSize: 12 }}
                    required
                  />
                  <input
                    className="tech-input"
                    value={newMemRole}
                    onChange={e => setNewMemRole(e.target.value)}
                    placeholder="Role (contoh: Designer)"
                    style={{ padding: "6px 8px", fontSize: 12 }}
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="btn-success"
                    style={{ width: "100%", padding: "6px 12px", fontSize: 12, justifyContent: "center" }}
                  >
                    Tambah ke Projek
                  </button>
                </div>
              </form>
            )}

            {/* List of project members */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Creator display */}
              <div className="member-card" style={{ padding: "8px 12px", border: "1px dashed rgba(59,130,246,0.2)", background: "none" }}>
                <Avatar name={currentUser?.name || currentUser?.email} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{currentUser?.name || "Pembuat Projek"}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Pemilik Goal (Diri Sendiri)</div>
                </div>
              </div>

              {members.length === 0 && !showAddMemberForm && (
                <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  Belum ada anggota tim lain di projek ini.
                </div>
              )}

              {members.map(mem => (
                <div key={mem.id} className="member-card" style={{ padding: "8px 12px" }}>
                  <Avatar name={mem.name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mem.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mem.role || "Anggota"}
                    </div>
                  </div>
                  <IconBtn
                    danger
                    label="Hapus dari projek"
                    onClick={() => handleDeleteMember(mem)}
                    disabled={isBusy}
                  >
                    <Trash2 size={12} />
                  </IconBtn>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── NOTIFICATIONS VIEW ───────────────────────────────────────────────────────
const NotificationsView = memo(({ goals }) => {
  const deadlineGoals = goals.filter(g => g.deadline && asNumber(g.progress) < 100);
  return (
    <div className="fade-slide-up">
      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
        Notifikasi
      </h1>
      <p style={{ margin: "0 0 24px", color: "var(--text-secondary)", fontSize: 14 }}>
        Sistem menjadwalkan pengingat H-1 sebelum deadline.
      </p>
      <div className="glass-card" style={{ padding: 22 }}>
        {deadlineGoals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 0", color: "var(--text-secondary)" }}>
            <Bell size={32} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ margin: 0, fontSize: 14 }}>Tidak ada pengingat aktif saat ini.</p>
          </div>
        ) : (
          deadlineGoals.map(g => {
            const remind = new Date(g.deadline);
            remind.setDate(remind.getDate() - 1);
            return (
              <div key={g.id} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center", flexShrink: 0,
                  border: "1px solid rgba(59,130,246,0.2)",
                  boxShadow: "0 0 14px rgba(59,130,246,0.1)",
                }}>
                  <Bell size={15} color="var(--accent-primary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>Pengingat H-1: {g.title}</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                    Email notifikasi dijadwalkan pada {formatDate(remind)}.
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
const AnalyticsView = memo(({ goals }) => {
  const avg = goals.length ? Math.round(goals.reduce((s, g) => s + asNumber(g.progress), 0) / goals.length) : 0;
  const selesai = goals.filter(g => asNumber(g.progress) >= 100).length;
  const byPriority = { high: 0, medium: 0, low: 0 };
  goals.forEach(g => { if (byPriority[g.priority] !== undefined) byPriority[g.priority]++; });

  return (
    <div className="fade-slide-up">
      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
        Analytics
      </h1>
      <p style={{ margin: "0 0 24px", color: "var(--text-secondary)", fontSize: 14 }}>Ringkasan performa dan insight goal Anda.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Total Goal",       val: goals.length, icon: Target,       grad: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
          { label: "Rata-rata Progress",val: `${avg}%`,   icon: TrendingUp,   grad: "linear-gradient(135deg,#10b981,#34d399)" },
          { label: "Goal Selesai",     val: selesai,      icon: CheckCircle2, grad: "linear-gradient(135deg,#ec4899,#f43f5e)" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.grad }}>
              <s.icon size={19} color="#fff" />
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{s.val}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Distribusi Prioritas</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "High Priority",   count: byPriority.high,   color: "var(--accent-red)", max: goals.length || 1 },
            { label: "Medium Priority", count: byPriority.medium, color: "var(--accent-amber)", max: goals.length || 1 },
            { label: "Low Priority",    count: byPriority.low,    color: "var(--accent-emerald)", max: goals.length || 1 },
          ].map(p => (
            <div key={p.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)", marginBottom: 7 }}>
                <span>{p.label}</span>
                <span style={{ fontWeight: 700, color: p.color }}>{p.count}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{
                  width: `${(p.count / p.max) * 100}%`,
                  background: p.color,
                  animation: "none",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {goals.length > 0 && (
        <div className="glass-card" style={{ padding: 24, marginTop: 14 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Progress Per Goal</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {goals.map(g => (
              <div key={g.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "72%" }}>{g.title}</span>
                  <span style={{ fontWeight: 700, color: "var(--accent-primary)", flexShrink: 0 }}>{Math.round(asNumber(g.progress))}%</span>
                </div>
                <ProgressBar value={g.progress} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
const ProfileView = memo(({ user, goals }) => {
  const total = goals.length;
  const selesai = goals.filter(g => asNumber(g.progress) >= 100).length;
  const avg = total > 0 ? Math.round(goals.reduce((s, g) => s + asNumber(g.progress), 0) / total) : 0;

  return (
    <div className="fade-slide-up">
      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Profil</h1>
      <p style={{ margin: "0 0 28px", color: "var(--text-secondary)", fontSize: 14 }}>Kelola informasi akun dan tinjau performa Anda.</p>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "start" }}>
        <div className="glass-card" style={{ padding: 28, minWidth: 270 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 68, height: 68, borderRadius: "50%",
              background: "linear-gradient(135deg,#6366f1,#a855f7)",
              display: "grid", placeItems: "center",
              fontSize: 24, fontWeight: 900, color: "#fff",
              boxShadow: "0 8px 25px rgba(99,102,241,0.4), 0 0 1px rgba(255,255,255,0.2) inset",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(255,255,255,0.2) 0%,transparent 60%)", borderRadius: "50%" }} />
              {initials(user?.name || user?.email || "U")}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                {user?.name || "Pengguna"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{user?.email}</div>
            </div>
          </div>
          <Divider />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center" }}>
            {[
              { label: "Goals", val: total, color: "var(--accent-primary)" },
              { label: "Selesai", val: selesai, color: "var(--accent-emerald)" },
              { label: "Avg", val: `${avg}%`, color: "var(--accent-amber)" },
            ].map(s => (
              <div key={s.label} style={{ padding: "12px 0", background: "rgba(59,130,246,0.04)", borderRadius: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Ringkasan Progress</h3>
          {goals.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 14, textAlign: "center", padding: "24px 0" }}>Belum ada goal.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {goals.slice(0, 6).map(g => (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "72%" }}>{g.title}</span>
                    <span style={{ color: "var(--accent-primary)", fontWeight: 700, flexShrink: 0 }}>{Math.round(asNumber(g.progress))}%</span>
                  </div>
                  <ProgressBar value={g.progress} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [goals, setGoals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState(null);

  useEffect(() => {
    if (!isLoggedIn()) navigate("/login");
  }, [navigate]);

  // BUG FIX: hapus loadDashboardData dari dep array useMemo ─ useCallback sudah stabil
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [resGoals, resAct] = await Promise.all([getGoals(), getActivities()]);
      setGoals(resGoals?.goals || []);
      setActivities(resAct?.activities || []);
    } catch (err) {
      console.error("Gagal memuat dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  function handleLogout() { logout(); navigate("/"); }

  // BUG FIX: gunakan key pada TeamView agar komponen di-remount saat navigasi
  // sehingga useEffect loadTeam() selalu dijalankan ulang → tidak stale
  function renderContent() {
    if (selectedGoalId) {
      return (
        <GoalDetailView
          key={selectedGoalId}
          goalId={selectedGoalId}
          onBack={() => setSelectedGoalId(null)}
          onUpdate={loadDashboardData}
        />
      );
    }
    switch (activeNav) {
      case "tim":
        return <TeamView key="tim" goals={goals} activities={activities} onUpdate={loadDashboardData} />;
      case "notifikasi":
        return <NotificationsView goals={goals} />;
      case "analytics":
        return <AnalyticsView goals={goals} />;
      case "profil":
        return <ProfileView user={user} goals={goals} />;
      default:
        return (
          <DashboardHome
            goals={goals}
            activities={activities}
            loading={loading}
            onCreate={() => setShowCreate(true)}
            onSelectGoal={setSelectedGoalId}
          />
        );
    }
  }

  return (
    <AppShell
      user={user}
      activeNav={activeNav}
      setActiveNav={setActiveNav}
      onCreate={() => setShowCreate(true)}
      onExport={() => setShowExport(true)}
      onLogout={handleLogout}
      onNavigate={() => setSelectedGoalId(null)}
    >
      {renderContent()}
      {showCreate && <CreateGoalModal onClose={() => setShowCreate(false)} onCreated={loadDashboardData} />}
      {showExport && <ExportReportModal onClose={() => setShowExport(false)} />}
    </AppShell>
  );
}
