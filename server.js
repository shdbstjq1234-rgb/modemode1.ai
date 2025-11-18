// ========================================
//   MODEMODE1.AI — FINAL SERVER (NO SQLITE)
//   JSON DB (lowdb) 기반 — Render 완전 호환
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
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

// -------------------------
// 경로
// -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------
// 환경변수
// -------------------------
try { (await import("dotenv")).config(); } catch {}
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// -------------------------
// EXPRESS
// -------------------------
const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: "*",
    credentials: true
  })
);

app.use(express.json({ limit: "12mb" }));
app.set("trust proxy", 1);

// -------------------------
// Rate Limit (API 보호)
// -------------------------
app.use("/api/", rateLimit({ windowMs: 60000, max: 120 }));

// -------------------------
// JSON DB (lowdb)
// -------------------------
const dbFile = path.join(__dirname, "data.json");
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [] }));

const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

await db.read();
db.data ||= { users: [] };

// -------------------------
// 파일 업로드
// -------------------------
const UP_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UP_DIR),
    filename: (_req, file, cb) =>
      cb(null, Date.now() + "_" + file.originalname.replace(/[^\w.-]/g, "_"))
  })
});
app.use("/uploads", express.static(UP_DIR));

// -------------------------
// JWT
// -------------------------
function makeToken(u) {
  return jwt.sign(
    { uid: u.id, email: u.email, name: u.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// -------------------------
// 회원가입
// -------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const exists = db.data.users.find(u => u.email === email);
    if (exists) return res.json({ ok: false, msg: "이미 가입된 이메일" });

    const pw_hash = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now(),
      name,
      email,
      pw_hash
    };

    db.data.users.push(user);
    await db.write();

    res.json({ ok: true, token: makeToken(user), name, email });
  } catch (e) {
    console.error(e);
    res.json({ ok: false });
  }
});

// -------------------------
// 로그인
// -------------------------
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  const user = db.data.users.find(u => u.email === email);
  if (!user) return res.json({ ok: false, msg: "이메일/비번 불일치" });

  const ok = await bcrypt.compare(password, user.pw_hash);
  if (!ok) return res.json({ ok: false, msg: "이메일/비번 불일치" });

  res.json({
    ok: true,
    name: user.name,
    email: user.email,
    token: makeToken(user)
  });
});

// -------------------------
// AI 이미지 생성
// -------------------------
app.post("/api/gemini-image", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) return res.json({ ok: false, msg: "프롬프트 없음" });

    if (!GEMINI_API_KEY) {
      return res.json({
        ok: true,
        demo: true,
        images: [
          `https://picsum.photos/seed/${encodeURIComponent(prompt)}1/800/1200`,
          `https://picsum.photos/seed/${encodeURIComponent(prompt)}2/800/1200`,
          `https://picsum.photos/seed/${encodeURIComponent(prompt)}3/800/1200`,
          `https://picsum.photos/seed/${encodeURIComponent(prompt)}4/800/1200`
        ]
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
  } catch (e) {
    console.error(e);
    res.json({ ok: false });
  }
});

// -------------------------
// 영상 생성 MOCK
// -------------------------
app.post("/api/video-from-images", (req, res) => {
  res.json({
    ok: true,
    videoUrl:
      "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// -------------------------
// 정적 파일 — ★ path-to-regexp 오류 해결
// -------------------------
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// -------------------------
// 서버 시작
// -------------------------
app.listen(PORT, () => {
  console.log("🚀 MODEMODE1.AI SERVER RUNNING ON PORT " + PORT);
});