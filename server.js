// ========================================
//   MODEMODE1.AI — FINAL SERVER (sqlite3 + Express5)
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
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// ----------------------------
// 경로
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------
// 환경변수
// ----------------------------
try { (await import("dotenv")).config(); } catch {}
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const CORS_ALLOW = process.env.CORS_ORIGIN || "*";

// ----------------------------
// EXPRESS APP
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
// SQLite3 DB 연결
// ----------------------------
sqlite3.verbose();

const dbDir = path.join(__dirname, "data");
const dbPath = path.join(dbDir, "app.db");

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const db = await open({
  filename: dbPath,
  driver: sqlite3.Database
});

await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ----------------------------
// 파일 업로드
// ----------------------------
const UP_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UP_DIR),
    filename: (_, file, cb) =>
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
// AUTH API
// ----------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const exists = await db.get("SELECT id FROM users WHERE email=?", email);
    if (exists) return res.json({ ok: false, msg: "이미 가입된 이메일" });

    const pw_hash = await bcrypt.hash(password, 10);

    const result = await db.run(
      "INSERT INTO users (email, name, pw_hash) VALUES (?, ?, ?)",
      email,
      name,
      pw_hash
    );

    const token = makeToken({
      id: result.lastID,
      email,
      name
    });

    res.json({ ok: true, email, name, token });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "회원가입 실패" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const user = await db.get("SELECT * FROM users WHERE email=?", email);
    if (!user) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const ok = await bcrypt.compare(password, user.pw_hash);
    if (!ok) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const token = makeToken(user);
    res.json({ ok: true, email: user.email, name: user.name, token });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "로그인 실패" });
  }
});

// ----------------------------
// AI 이미지 생성
// ----------------------------
app.post("/api/gemini-image", async (req, res) => {
  const { prompt, count = 4 } = req.body || {};
  if (!prompt) return res.json({ ok: false, msg: "프롬프트 없음" });

  try {
    if (!GEMINI_API_KEY) {
      const imgs = Array.from({ length: Math.min(count, 4) }).map((_, i) =>
        `https://picsum.photos/seed/${encodeURIComponent(prompt + "-" + i)}/800/1200`
      );
      return res.json({ ok: true, images: imgs, demo: true });
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
    const images =
      data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.inlineData)
        ?.map(p => `data:image/png;base64,${p.inlineData.data}`) || [];

    res.json({ ok: true, images });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "Gemini 오류" });
  }
});

// ----------------------------
// VIDEO MOCK API
// ----------------------------
app.post("/api/video-from-images", (req, res) => {
  res.json({
    ok: true,
    videoUrl: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// ----------------------------
// 정적 파일 제공
// ----------------------------
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------
// Express 5 — SPA Fallback FIX
// ----------------------------
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ----------------------------
// 서버 시작
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 MODEMODE1.AI SERVER RUNNING http://localhost:${PORT}`);
});