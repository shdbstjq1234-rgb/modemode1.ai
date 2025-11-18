/* ===========================
   기본 설정
=========================== */

const API = {
  signup: "/api/auth/signup",
  login: "/api/auth/login",
  image: "/api/gemini-image",
  video: "/api/video-from-images"
};

let AUTH = null;   // 로그인 사용자 정보
let LAST_IMAGES = [];

/* ===========================
   Toast
=========================== */
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.opacity = 1;
  setTimeout(()=> t.style.opacity=0, 2000);
}

/* ===========================
   SIGNUP / LOGIN MODAL
=========================== */
function openSignup(){
  document.getElementById("signupModal").style.display = "flex";
}
function closeSignup(){
  document.getElementById("signupModal").style.display = "none";
}
function openLogin(){
  document.getElementById("loginModal").style.display = "flex";
}
function closeLogin(){
  document.getElementById("loginModal").style.display = "none";
}

/* ===========================
   SIGNUP
=========================== */
async function doSignup(){
  const name  = document.getElementById("sg_name").value.trim();
  const email = document.getElementById("sg_email").value.trim();
  const pw    = document.getElementById("sg_pw").value.trim();

  if(!name || !email || !pw){
    toast("모든 항목을 입력하세요");
    return;
  }

  try{
    toast("가입 중...");
    const r = await fetch(API.signup, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ name, email, password:pw })
    });

    const data = await r.json();
    if(!data.ok){
      toast(data.msg || "가입 실패");
      return;
    }

    toast("회원가입 완료");
    closeSignup();
    openLogin();

  }catch(err){
    console.error(err);
    toast("서버 오류");
  }
}

/* ===========================
   LOGIN
=========================== */
async function doLogin(){
  const email = document.getElementById("lg_email").value.trim();
  const pw    = document.getElementById("lg_pw").value.trim();

  if(!email || !pw){
    toast("이메일/비밀번호 입력하세요");
    return;
  }

  try{
    toast("로그인 중...");
    const r = await fetch(API.login, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ email, password:pw })
    });

    const data = await r.json();
    if(!data.ok){
      toast(data.msg || "로그인 실패");
      return;
    }

    AUTH = data;
    toast("로그인 성공");
    closeLogin();

  }catch(err){
    console.error(err);
    toast("서버 오류");
  }
}

/* ===========================
   IMAGE GENERATION
=========================== */
document.getElementById("genImageBtn").addEventListener("click", async () => {
  const prompt = document.getElementById("promptInput").value.trim();
  const box = document.getElementById("previewBox");

  if(!prompt){
    toast("프롬프트를 입력하세요");
    return;
  }

  toast("이미지 생성 중...");
  box.innerHTML = "⏳ 이미지 생성 중...";

  try{
    const r = await fetch(API.image, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ prompt, count:4 })
    });

    const data = await r.json();
    if(!data.ok){
      toast(data.msg || "이미지 생성 오류");
      return;
    }

    LAST_IMAGES = data.images;

    box.innerHTML = `<img src="${data.images[0]}" style="max-width:100%; max-height:100%;">`;
    toast("생성 완료");

  }catch(err){
    console.error(err);
    toast("서버 오류");
  }
});

/* ===========================
   VIDEO GENERATION
=========================== */
document.getElementById("genVideoBtn").addEventListener("click", async () => {
  const box = document.getElementById("previewBox");

  if(LAST_IMAGES.length === 0){
    toast("먼저 이미지를 생성하세요");
    return;
  }

  toast("영상 생성 중...");
  box.innerHTML = "⏳ 영상 생성 중...";

  try{
    const r = await fetch(API.video, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        frames: LAST_IMAGES.map(u => ({ imageUrl:u, duration:3 })),
        size:"1080x1920",
        fps:30
      })
    });

    if(!r.ok){
      toast("영상 생성 실패");
      return;
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);

    const vid = document.createElement("video");
    vid.src = url;
    vid.controls = true;
    vid.autoplay = true;
    vid.style.maxWidth = "100%";

    box.innerHTML = "";
    box.appendChild(vid);

    toast("영상 생성 완료");

  }catch(err){
    console.error(err);
    toast("서버 오류");
  }
});