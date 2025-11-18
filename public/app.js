// ==========================
//  Client-side JS
// ==========================

const toast = msg => {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.style.opacity = 1;
  setTimeout(() => (t.style.opacity = 0), 1600);
};

const previewBox = document.getElementById("previewBox");

// ----------------------
// AI 이미지 생성
// ----------------------
document.getElementById("genImageBtn").addEventListener("click", async () => {
  const prompt = document.getElementById("promptInput").value.trim();
  if (!prompt) return toast("프롬프트 입력 필요");

  previewBox.innerHTML = "⏳ 생성 중...";

  const r = await fetch("/api/gemini-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await r.json();

  if (!data.ok) return toast("생성 실패");

  previewBox.innerHTML = "";
  data.images.forEach(src => {
    const img = document.createElement("img");
    img.src = src;
    img.style.maxWidth = "100%";
    img.style.marginBottom = "12px";
    previewBox.appendChild(img);
  });
});

// ----------------------
// 영상 생성
// ----------------------
document.getElementById("genVideoBtn").addEventListener("click", async () => {
  previewBox.innerHTML = "🎬 영상 생성 중...";

  const r = await fetch("/api/video-from-images", {
    method: "POST"
  });

  const data = await r.json();

  if (!data.ok) return toast("영상 생성 실패");

  previewBox.innerHTML = `
    <video controls style="width:100%; max-width:480px;">
      <source src="${data.videoUrl}">
    </video>
  `;
});

// ----------------------
// 회원가입 / 로그인 모달
// ----------------------
function openSignup() {
  document.getElementById("signupModal").style.display = "flex";
}
function closeSignup() {
  document.getElementById("signupModal").style.display = "none";
}
function openLogin() {
  document.getElementById("loginModal").style.display = "flex";
}
function closeLogin() {
  document.getElementById("loginModal").style.display = "none";
}

// ----------------------
// 회원가입
// ----------------------
async function doSignup() {
  const name = document.getElementById("sg_name").value.trim();
  const email = document.getElementById("sg_email").value.trim();
  const pw = document.getElementById("sg_pw").value.trim();

  const r = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: pw })
  });

  const d = await r.json();
  if (!d.ok) return toast(d.msg || "회원가입 실패");

  toast("회원가입 완료!");
  closeSignup();
}

// ----------------------
// 로그인
// ----------------------
async function doLogin() {
  const email = document.getElementById("lg_email").value.trim();
  const pw = document.getElementById("lg_pw").value.trim();

  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw })
  });

  const d = await r.json();
  if (!d.ok) return toast(d.msg || "로그인 실패");

  toast("로그인 성공");
  closeLogin();
}