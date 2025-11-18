// ========================================
//   MODEMODE.AI — FINAL SERVER (Render OK)
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
import Database from "better-sqlite3";

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

// ⚠️ Render에서 비동기 JS / inline script 막히는 문제 해결
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
// DB (SQLite)
// ----------------------------
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = wal");

db.exec(`
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
    filename: (_, file, cb) => {
      const safe = Date.now() + "_" + file.originalname.replace(/[^\w.-]/g, "_");
      cb(null, safe);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use("/uploads", express.static(UP_DIR));

// ----------------------------
// JWT
// ----------------------------
function makeToken(u) {
  return jwt.sign(
    { uid: u.id, email: u.email, name: u.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ ok: false });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false });
  }
}

// ----------------------------
// 회원가입
// ----------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const exists = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    if (exists) return res.json({ ok: false, msg: "이미 가입된 이메일" });

    const pw_hash = await bcrypt.hash(password, 10);
    const info = db
      .prepare("INSERT INTO users (email, name, pw_hash) VALUES (?, ?, ?)")
      .run(email, name, pw_hash);

    const token = makeToken({ id: info.lastInsertRowid, email, name });
    res.json({ ok: true, email, name, token });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, msg: "회원가입 실패" });
  }
});

// ----------------------------
// 로그인
// ----------------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!user) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const match = await bcrypt.compare(password, user.pw_hash);
    if (!match) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const token = makeToken(user);
    res.json({ ok: true, email: user.email, name: user.name, token });

  } catch (err) {
    res.json({ ok: false, msg: "로그인 실패" });
  }
});

// ----------------------------
// 내 정보
// ----------------------------
app.get("/api/me", auth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ----------------------------
// 파일 업로드
// ----------------------------
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.json({ ok: false, msg: "파일 없음" });
  res.json({ ok: true, url: "/uploads/" + req.file.filename });
});

// ----------------------------
// Gemini 이미지 생성
// ----------------------------
app.post("/api/gemini-image", async (req, res) => {
  const { prompt, count = 4 } = req.body || {};
  if (!prompt) return res.json({ ok: false, msg: "프롬프트 없음" });

  try {
    // 키 없어도 데모 이미지 지원
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
// 이미지 → 영상 생성 (데모)
// ----------------------------
app.post("/api/video-from-images", (req, res) => {
  res.json({
    ok: true,
    videoUrl:
      "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// ----------------------------
// 정적 파일 서비스
// ----------------------------
app.use(express.static(path.join(__dirname, "public")));

// SPA 라우팅
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/modemode1.html"));
});

// ----------------------------
// 서버 시작
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 MODEMODE.AI SERVER RUNNING http://localhost:${PORT}`);
});
