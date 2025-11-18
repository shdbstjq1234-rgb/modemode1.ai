console.log("app.js loaded");

// API BASE
const API = {
  signup: "/api/signup",
  login: "/api/login",
  genImage: "/api/gen-image",
  genVideo: "/api/gen-video"
};

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  alert(msg);
}

// 로그인
$("btnLogin").onclick = async () => {
  const email = $("loginEmail").value.trim();
  const pw = $("loginPw").value;

  const r = await fetch(API.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw })
  });

  const data = await r.json();
  if (!data.ok) return toast(data.msg);

  localStorage.setItem("token", data.token);
  toast("로그인 성공");
};

// 회원가입
$("btnSignup").onclick = async () => {
  const n = $("suName").value.trim();
  const e = $("suEmail").value.trim();
  const p = $("suPw").value;

  const r = await fetch(API.signup, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n, email: e, password: p })
  });

  const data = await r.json();
  if (!data.ok) return toast(data.msg);
  toast("회원가입 성공");
};

// 이미지 생성
$("btnGenImg").onclick = async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt) return toast("프롬프트 입력");

  const r = await fetch(API.genImage, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await r.json();
  if (!data.ok) return toast("생성 실패");

  $("preview").src = data.images[0];
};

// 비디오 생성
$("btnGenVid").onclick = async () => {
  const r = await fetch(API.genVideo, { method: "POST" });
  const data = await r.json();

  $("videoBox").src = data.video;
};