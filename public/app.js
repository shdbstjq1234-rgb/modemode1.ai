/* ============================
    환경 설정
============================ */
const API = {
  signup: "/api/auth/signup",
  login: "/api/auth/login",
  me: "/api/me",
  image: "/api/gemini-image",
  video: "/api/video-from-images"
};

/* ============================
    공용 토스트 메시지
============================ */
const toastBox = document.getElementById("toast");
function toast(msg) {
  if (!toastBox) return alert(msg);
  toastBox.textContent = msg;
  toastBox.classList.add("show");
  setTimeout(() => toastBox.classList.remove("show"), 2000);
}

/* ============================
    모달 제어
============================ */
function openLogin() {
  document.getElementById("loginModal")?.classList.remove("hidden");
}
function openSignup() {
  document.getElementById("signupModal")?.classList.remove("hidden");
}
function closeLogin() {
  document.getElementById("loginModal")?.classList.add("hidden");
}
function closeSignup() {
  document.getElementById("signupModal")?.classList.add("hidden");
}

/* ============================
    로그인
============================ */
async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPw").value.trim();
  if (!email || !pw) return toast("이메일/비밀번호를 입력하세요.");

  try {
    const r = await fetch(API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw })
    });

    const data = await r.json().catch(() => null);
    if (!data || !data.ok) return toast(data?.msg || "로그인 실패");

    localStorage.setItem("token", data.token);

    toast("로그인 성공");
    closeLogin();
  } catch (err) {
    console.error(err);
    toast("서버 오류");
  }
}

/* ============================
    회원가입
============================ */
async function doSignup() {
  const name = document.getElementById("sName").value.trim();
  const email = document.getElementById("sEmail").value.trim();
  const pw = document.getElementById("sPw").value.trim();

  if (!name || !email || !pw)
    return toast("모든 정보를 입력하세요.");

  try {
    const r = await fetch(API.signup, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: pw })
    });

    const data = await r.json().catch(() => null);
    if (!data || !data.ok) return toast(data?.msg || "회원가입 실패");

    toast("회원가입 완료! 로그인하세요.");
    closeSignup();
    openLogin();
  } catch (err) {
    console.error(err);
    toast("서버 오류");
  }
}

/* ============================
    AI 이미지 생성
============================ */
document
  .getElementById("btnGenerateImage")
  ?.addEventListener("click", async () => {
    const prompt = document
      .getElementById("promptOutput")
      .textContent.trim();

    if (!prompt) return toast("프롬프트가 없습니다.");

    try {
      toast("이미지 생성 중...");

      const r = await fetch(API.image, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count: 4 })
      });

      const data = await r.json().catch(() => null);

      if (!data || !data.ok || !data.images)
        return toast(data?.msg || "이미지를 생성할 수 없습니다.");

      const url = data.images[0];
      const preview = document.getElementById("previewBox");
      preview.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:12px;">`;

      window._lastImages = data.images;

      toast("이미지 생성 완료!");
    } catch (err) {
      console.error(err);
      toast("이미지 생성 실패(서버)");
    }
  });

/* ============================
    AI 영상 생성
============================ */
document
  .getElementById("btnGenerateVideo")
  ?.addEventListener("click", async () => {
    if (!window._lastImages || window._lastImages.length === 0)
      return toast("먼저 이미지를 생성하세요.");

    toast("영상 생성 중...");

    try {
      const r = await fetch(API.video, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: window._lastImages })
      });

      const data = await r.json().catch(() => null);
      if (!data || !data.ok) return toast("영상 생성 실패");

      const preview = document.getElementById("previewBox");
      preview.innerHTML = `
        <video controls autoplay style="max-width:100%;border-radius:12px;">
          <source src="${data.videoUrl}">
        </video>
      `;

      toast("영상 생성 완료!");
    } catch (err) {
      console.error(err);
      toast("서버 오류");
    }
  });
