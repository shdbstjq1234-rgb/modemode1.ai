// ========================================
// MODEMODE1.AI — FINAL SERVER (sql.js + local wasm)
// ========================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import initSqlJs from "sql.js";

// ----------------------------
// 경로
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------
// ENV
// ----------------------------
try { (await import("dotenv")).config(); } catch {}
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const CORS_ALLOW = process.env.CORS_ORIGIN || "*";

// ----------------------------
// Express
// ----------------------------
const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

app.use(cors({ origin: CORS_ALLOW, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1);

app.use("/api/", rateLimit({ windowMs: 60000, max: 120 }));

// ----------------------------
// SQL.js + local wasm
// ----------------------------
console.log("⏳ Loading SQL.js with local wasm...");

const SQL = await initSqlJs({
  locateFile: (file) => path.join(__dirname, "sqljs", file)
});

console.log("✅ SQL.js Loaded!");

// ----------------------------
// DB 준비
// ----------------------------
const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "app.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

let db;

// 기존 DB 로드
if (fs.existsSync(DB_PATH)) {
  const fileBuf = fs.readFileSync(DB_PATH);
  db = new SQL.Database(fileBuf);
} else {
  db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pw_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  saveDB();
}

function saveDB() {
  const data = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, data);
}

// ----------------------------
// 파일 업로드
// ----------------------------
const UP_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UP_DIR),
    filename: (_req, file, cb) =>
      cb(null, Date.now() + "_" + file.originalname.replace(/[^\w.-]/g, "_"))
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use("/uploads", express.static(UP_DIR));

// ----------------------------
// JWT
// ----------------------------
function makeToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ----------------------------
// AUTH Signup
// ----------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const check = db.exec(
      "SELECT id FROM users WHERE email=$email",
      { $email: email }
    );
    if (check.length > 0)
      return res.json({ ok: false, msg: "이미 가입된 이메일" });

    const pw_hash = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (email, name, pw_hash) VALUES ($e,$n,$p)",
      { $e: email, $n: name, $p: pw_hash }
    );

    saveDB();

    return res.json({
      ok: true,
      email,
      name,
      token: makeToken({ id: Date.now(), email, name })
    });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "회원가입 실패" });
  }
});

// ----------------------------
// AUTH Login
// ----------------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = db.exec(
      "SELECT * FROM users WHERE email=$email LIMIT 1",
      { $email: email }
    );

    if (result.length === 0)
      return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const row = result[0].values[0];

    const user = {
      id: row[0],
      email: row[1],
      name: row[2],
      pw_hash: row[3]
    };

    const ok = await bcrypt.compare(password, user.pw_hash);
    if (!ok) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    res.json({
      ok: true,
      email: user.email,
      name: user.name,
      token: makeToken(user)
    });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "로그인 실패" });
  }
});

// ----------------------------
// Gemini 이미지 생성
// ----------------------------
app.post("/api/gemini-image", async (req, res) => {
  const { prompt, count = 4 } = req.body;

  if (!prompt)
    return res.json({ ok: false, msg: "프롬프트 없음" });

  try {
    if (!GEMINI_API_KEY) {
      return res.json({
        ok: true,
        demo: true,
        images: Array.from({ length: count }).map((_, i) =>
          `https://picsum.photos/seed/${prompt}-${i}/800/1200`
        )
      });
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "image/png" }
        })
      }
    );

    const data = await r.json();
    const imgs =
      data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.inlineData)
        ?.map(p => `data:image/png;base64,${p.inlineData.data}`) || [];

    res.json({ ok: true, images: imgs });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "Gemini 오류" });
  }
});

// ----------------------------
// Video Mock
// ----------------------------
app.post("/api/video-from-images", (req, res) => {
  res.json({
    ok: true,
    videoUrl: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// ----------------------------
// 정적 파일 (SPA)
// ----------------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ----------------------------
// Start Server
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 MODEMODE1.AI SERVER RUNNING http://localhost:${PORT}`);
});