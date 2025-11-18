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

// ----------------------------
// 경로 설정
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------
// 환경변수 설정
// ----------------------------
try { (await import("dotenv")).config(); } catch {}
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const CORS_ALLOW = process.env.CORS_ORIGIN || "*";

// ----------------------------
// Express App 설정
// ----------------------------
const app = express();

// CSP 해제 (Render에서 버튼, JS 실행 막힘 방지)
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
// JSON DB (lowdb)
// ----------------------------
const dbFile = path.join(__dirname, "data.json");

// 파일이 없으면 생성
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify({ users: [] }, null, 2));
}

const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

// 데이터 로드 / 초기화
await db.read();
db.data ||= { users: [] };
await db.write();

// ----------------------------
// 파일 업로드 (uploads 폴더)
// ----------------------------
const UP_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UP_DIR),
    filename: (_req, file, cb) => {
      const safeName = Date.now() + "_" + file.originalname.replace(/[^\w.-]/g, "_");
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});
app.use("/uploads", express.static(UP_DIR));

// ----------------------------
// JWT 토큰 생성
// ----------------------------
function makeToken(user) {
  return jwt.sign(
    { uid: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ----------------------------
// 회원가입
// ----------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const exists = db.data.users.find(u => u.email === email);
    if (exists) return res.json({ ok: false, msg: "이미 가입된 이메일" });

    const pw_hash = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now(),
      name,
      email,
      pw_hash,
      created_at: new Date().toISOString()
    };

    db.data.users.push(newUser);
    await db.write();

    return res.json({
      ok: true,
      name,
      email,
      token: makeToken(newUser)
    });

  } catch (e) {
    console.error(e);
    return res.json({ ok: false, msg: "회원가입 실패" });
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

    const user = db.data.users.find(u => u.email === email);
    if (!user) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    const ok = await bcrypt.compare(password, user.pw_hash);
    if (!ok) return res.json({ ok: false, msg: "이메일/비번 불일치" });

    return res.json({
      ok: true,
      name: user.name,
      email: user.email,
      token: makeToken(user)
    });

  } catch (e) {
    console.error(e);
    return res.json({ ok: false, msg: "로그인 실패" });
  }
});

// ----------------------------
// Gemini 이미지 생성
// ----------------------------
app.post("/api/gemini-image", async (req, res) => {
  const { prompt, count = 4 } = req.body || {};
  if (!prompt) return res.json({ ok: false, msg: "프롬프트 없음" });

  try {
    // 데모 모드 (키 없을 때)
    if (!GEMINI_API_KEY) {
      const demoImages = Array.from({ length: Math.min(count, 4) }).map((_, i) =>
        `https://picsum.photos/seed/${encodeURIComponent(prompt + "-" + i)}/800/1200`
      );
      return res.json({ ok: true, images: demoImages, demo: true });
    }

    // 실제 생성
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

    return res.json({ ok: true, images });

  } catch (e) {
    console.error(e);
    return res.json({ ok: false, msg: "Gemini 오류" });
  }
});

// ----------------------------
// 비디오 생성 MOCK
// ----------------------------
app.post("/api/video-from-images", (req, res) => {
  return res.json({
    ok: true,
    videoUrl:
      "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// ----------------------------
// 정적 웹 (public 폴더)
// ----------------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ----------------------------
// 서버 시작
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 MODEMODE1.AI SERVER RUNNING http://localhost:${PORT}`);
});