/* ==========================================================
   MODEMODE1.AI — Frontend JS (app.js)
   모든 버튼/모달/이벤트 정상 작동 보장
========================================================== */

/* -------------------------------
   API ENDPOINT 설정
--------------------------------*/
const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : window.location.origin;

const API = {
  signup: API_BASE + "/api/auth/signup",
  login: API_BASE + "/api/auth/login",
  me: API_BASE + "/api/me",
  image: API_BASE + "/api/gemini-image",
  video: API_BASE + "/api/video-from-images",
};

/* -------------------------------
   간단 토스트 메시지
--------------------------------*/
function toast(msg) {
  alert(msg); // 프리뷰 환경 최소 기능
}

/* -------------------------------
   모달 열기/닫기
--------------------------------*/
function openModal(id) {
  document.getElementById(id)?.classList.add("show");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("show");
}

/* -------------------------------
   회원가입 스텝 이동
--------------------------------*/
(function(){
  const tabs = document.querySelectorAll('#signupModal .tab');
  function setStep(n){
    ['st1','st2','st3','st4','st5'].forEach((id,idx)=>{
      const el = document.getElementById(id);
      if(el) el.style.display = (idx===n-1)?'block':'none';
    });
    tabs.forEach(t=> t.classList.toggle('on', Number(t.dataset.step)===n));
  }
  setStep(1);

  /* STEP 1 → 2 */
  document.getElementById('s1next')?.addEventListener('click', ()=>{
    const nm = document.getElementById('s1name').value.trim();
    const em = document.getElementById('s1e').value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
    document.getElementById('s1nameErr').classList.toggle('show', !nm);
    document.getElementById('s1err').classList.toggle('show', !ok);
    if(nm && ok) setStep(2);
  });

  /* STEP 2 → 3 */
  document.getElementById('s2next')?.addEventListener('click', ()=>{
    const cd = document.getElementById('s2c').value.trim();
    const ok = /^\d{6}$/.test(cd);
    document.getElementById('s2err').classList.toggle('show', !ok);
    if(ok) setStep(3);
  });

  document.getElementById('s2resend')?.addEventListener('click', e=>{
    e.preventDefault();
    toast('인증코드 재전송 (데모)');
  });

  /* STEP 3 → 4 (비번 체크) */
  function pwPolicy(s){
    const rules=[/[A-Z]/,/[a-z]/,/\d/,/[^A-Za-z0-9]/]; 
    let c=0; rules.forEach(r=>{ if(r.test(s)) c++; });
    return s.length>=8 && c>=3;
  }

  document.getElementById('s3next')?.addEventListener('click', ()=>{
    const p1=document.getElementById('s3p1').value;
    const p2=document.getElementById('s3p2').value;
    const ok = pwPolicy(p1) && p1===p2;
    document.getElementById('s3err').classList.toggle('show', !ok);
    if(ok) setStep(4);
  });

  /* STEP 4 → 회원가입 요청 */
  const need=['c_tos','c_privacy','c_age'];

  document.getElementById('c_all')?.addEventListener('change', e=>{
    ['c_tos','c_privacy','c_age','c_mkt_email','c_mkt_sms','c_xfer'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.checked = e.target.checked;
    });
  });

  document.getElementById('s4next')?.addEventListener('click', async ()=>{
    const missing = need.some(id=> !document.getElementById(id).checked);
    document.getElementById('cErr').classList.toggle('show', missing);
    if(missing){
      toast('필수 동의 항목을 확인해 주세요.');
      return;
    }

    const name  = document.getElementById('s1name').value.trim();
    const email = document.getElementById('s1e').value.trim();
    const pw    = document.getElementById('s3p1').value;

    if(!name || !email || !pw){
      toast('이름/이메일/비밀번호를 다시 확인해 주세요.');
      return;
    }

    try{
      toast('회원가입 중...');
      const r = await fetch(API.signup,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ name,email,password: pw })
      });

      const data = await r.json().catch(()=>null);

      if(!r.ok || !data || data.ok === false){
        toast(data?.msg || '회원가입에 실패했습니다.');
        return;
      }

      setStep(5);
      const loginEmail = document.getElementById('loginEmail');
      if(loginEmail) loginEmail.value = email;
      toast('회원가입 완료!');

    }catch(err){
      console.error(err);
      toast('서버 오류로 회원가입에 실패했습니다.');
    }
  });

  document.getElementById('toLogin')?.addEventListener('click', ()=>{
    closeModal('signupModal'); 
    openModal('loginModal');
  });
})();

/* ==========================================================
   로그인 이벤트
========================================================== */

document.getElementById("loginBtn")?.addEventListener("click", async ()=>{
  const email = document.getElementById("loginEmail").value.trim();
  const pw    = document.getElementById("loginPw").value.trim();

  if(!email || !pw){
    toast("이메일/비밀번호를 입력하세요");
    return;
  }

  try {
    const r = await fetch(API.login, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ email, password: pw })
    });

    const data = await r.json().catch(()=>null);

    if(!data || !data.ok){
      toast(data?.msg || "로그인 실패");
      return;
    }

    localStorage.setItem("token", data.token);
    toast("로그인 성공!");
    closeModal("loginModal");

  } catch(err){
    console.error(err);
    toast("서버 오류");
  }
});


/* ==========================================================
   프리뷰 : 이미지 생성 + 영상 생성
========================================================== */

(function(){
  const previewBox = document.getElementById('previewBox');
  const promptCode = document.getElementById('promptOutput');
  if(!previewBox || !promptCode) return;

  const bar = document.createElement('div');
  bar.style.display='flex';
  bar.style.gap='8px';
  bar.style.margin='4px 0 10px';

  const imgBtn = document.createElement('button');
  imgBtn.className='btn';
  imgBtn.textContent='AI 이미지 생성';

  const vidBtn = document.createElement('button');
  vidBtn.className='btn soft';
  vidBtn.textContent='이미지로 영상 만들기';

  bar.appendChild(imgBtn);
  bar.appendChild(vidBtn);
  previewBox.insertAdjacentElement('afterend', bar);

  let lastImages = [];

  /* 이미지 생성 */
  imgBtn.addEventListener('click', async ()=>{

    const prompt = (promptCode.textContent || '').trim();
    if(!prompt){
      toast('프롬프트가 비어 있어요.');
      return;
    }

    toast("이미지 생성 중...");

    try {
      const r = await fetch(API.image,{
        method: "POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ prompt, count:4 })
      });

      const data = await r.json().catch(()=>null);

      if(!data || !data.images){
        toast("이미지 생성 실패");
        return;
      }

      lastImages = data.images;
      previewBox.innerHTML =
        `<img src="${lastImages[0]}" style="max-width:100%;border-radius:10px;">`;

      toast("이미지 생성 완료");

    } catch(err){
      console.error(err);
      toast("서버 오류");
    }
  });


  /* 영상 생성 */
  vidBtn.addEventListener('click', async ()=>{
    if(!lastImages.length){
      toast("먼저 이미지를 생성하세요.");
      return;
    }

    toast("영상 생성 중...");

    try {
      const r = await fetch(API.video,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ images: lastImages })
      });

      const data = await r.json();

      const vid = document.createElement("video");
      vid.src = data.videoUrl;
      vid.controls = true;
      vid.autoplay = true;

      previewBox.innerHTML = "";
      previewBox.appendChild(vid);

      toast("영상 생성 완료!");

    } catch(err){
      console.error(err);
      toast("서버 오류");
    }
  });

})();
