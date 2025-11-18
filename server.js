import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ENV
try { (await import("dotenv")).config(); } catch {}
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// APP
const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// DB 초기화
const dbDir = path.join(__dirname, "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const db = new Database(path.join(dbDir, "app.db"));
db.pragma("journal_mode = wal");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL
)
`);

// JWT
function makeToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// 회원가입
app.post("/api/signup", async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password)
      return res.json({ ok: false, msg: "필수값 없음" });

    const exists = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    if (exists) return res.json({ ok: false, msg: "이미 존재하는 이메일" });

    const hash = await bcrypt.hash(password, 10);
    const info = db
      .prepare("INSERT INTO users (email, name, pw_hash) VALUES (?, ?, ?)")
      .run(email, name, hash);

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, msg: "오류" });
  }
});

// 로그인
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user) return res.json({ ok: false, msg: "잘못된 계정" });

  const ok = await bcrypt.compare(password, user.pw_hash);
  if (!ok) return res.json({ ok: false, msg: "잘못된 계정" });

  const token = makeToken(user);
  res.json({ ok: true, token, name: user.name });
});

// 이미지 생성
app.post("/api/gen-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.json({ ok: false });

  // 데모 이미지
  if (!GEMINI_API_KEY) {
    return res.json({
      ok: true,
      images: [
        `https://picsum.photos/seed/${encodeURIComponent(prompt)}/800/1200`
      ],
      demo: true
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
      ?.filter((p) => p.inlineData)
      ?.map((p) => `data:image/png;base64,${p.inlineData.data}`) || [];

  res.json({ ok: true, images: imgs });
});

// 영상 생성 (데모)
app.post("/api/gen-video", (req, res) => {
  res.json({
    ok: true,
    video:
      "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
  });
});

// SPA Routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => console.log("SERVER ON", PORT));