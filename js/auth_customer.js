(function () {
  var st = document.createElement("style");
  st.textContent =
    ".pw-toggle{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:38px;height:38px;" +
    "display:grid;place-items:center;background:none;border:0;border-radius:50%;color:#888;cursor:pointer;padding:0}" +
    ".pw-toggle:hover{color:#EDA03F}.pw-toggle:focus-visible{outline:2px solid #EDA03F}" +
    ".pw-toggle svg{width:22px;height:22px}";
  document.head.appendChild(st);

  var base =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var EYE =
    "<svg " +
    base +
    '><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF =
    "<svg " +
    base +
    '><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    var box = input.closest(".input-box") || input.parentElement;
    box.querySelectorAll("i").forEach(function (icon) {
      icon.remove();
    }); // swap the lock icon for the eye

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    btn.innerHTML = EYE;
    btn.setAttribute("aria-label", "Show password");
    btn.setAttribute("aria-pressed", "false");
    box.appendChild(btn);

    btn.addEventListener("mousedown", function (e) {
      e.preventDefault();
    }); // keep the cursor in the box
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", String(show));
    });
  });
})();

const container = document.querySelector(".container");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const otpForm = document.getElementById("otpForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const otpError = document.getElementById("otpError");
const otpCode = document.getElementById("otpCode");
const otpEmail = document.getElementById("otpEmail");
const otpResend = document.getElementById("otpResend");
const otpBack = document.getElementById("otpBack");

// where each kind of user lands after logging in (rename these to your real pages)
const ROLE_HOME = {
  customer: "customer-home.html",
  seller: "seller-dashboard.html",
};

// The role is read from the profiles table (users cannot change it), never from data the browser sends.
async function goHome(user) {
  let role = "customer";
  try {
    const { data } = await sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (data && data.role) role = data.role;
  } catch (_) {
    /* fall back to customer */
  }
  location.href = ROLE_HOME[role] || ROLE_HOME.customer;
}

function clearErrors() {
  [loginError, registerError, otpError].forEach((el) => {
    el.textContent = "";
    el.style.color = "";
  });
}
function showMessage(el, text, ok) {
  el.textContent = text;
  el.style.color = ok ? "#2e7d32" : "";
}
function setBusy(form, busy) {
  const b = form.querySelector('button[type="submit"]');
  if (b) b.disabled = busy;
}

document.querySelector(".register-btn").addEventListener("click", () => {
  clearErrors();
  container.classList.add("active");
});
document.querySelector(".login-btn").addEventListener("click", () => {
  clearErrors();
  container.classList.remove("active");
});

// open the register side from a link: auth_customer.html?mode=register
if (new URLSearchParams(location.search).get("mode") === "register")
  container.classList.add("active");

// ---- LOGIN: student number OR e-mail, then password
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  if (!window.sb)
    return showMessage(
      loginError,
      "Cannot reach the server. Check your internet and reload.",
    );
  const id = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value;

  setBusy(loginForm, true);
  try {
    let email = id;
    if (!id.includes("@")) {
      // student number -> find the e-mail it belongs to
      const { data, error } = await sb.rpc("email_for_student_id", { sid: id });
      if (error || !data)
        throw new Error("Incorrect e-mail / student number or password.");
      email = data;
    }
    const { data: login, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(
        /not confirmed/i.test(error.message)
          ? "Please verify your e-mail first. Register again with the same e-mail to get a new code."
          : "Incorrect e-mail / student number or password.",
      );
    }
    await goHome(login.user);
  } catch (err) {
    showMessage(loginError, err.message);
  } finally {
    setBusy(loginForm, false);
  }
});

// ---- REGISTER, step 1: name, student number, e-mail, phone, password  ->  a 6-digit code is e-mailed
let pendingEmail = "";
let cooldownTimer = null;

function startCooldown(seconds) {
  clearInterval(cooldownTimer);
  let left = seconds;
  otpResend.disabled = true;
  otpResend.textContent = `Resend code (${left}s)`;
  cooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(cooldownTimer);
      otpResend.disabled = false;
      otpResend.textContent = "Resend code";
    } else {
      otpResend.textContent = `Resend code (${left}s)`;
    }
  }, 1000);
}
function showOtpStep(email) {
  pendingEmail = email;
  otpEmail.textContent = email;
  registerForm.hidden = true;
  otpForm.hidden = false;
  otpCode.value = "";
  otpCode.focus();
  startCooldown(60);
}
function showRegisterStep() {
  clearInterval(cooldownTimer);
  clearErrors();
  otpForm.hidden = true;
  registerForm.hidden = false;
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  if (!window.sb)
    return showMessage(
      registerError,
      "Cannot reach the server. Check your internet and reload.",
    );
  const data = {
    name: document.getElementById("regName").value.trim(),
    studentId: document.getElementById("regStudentId").value.trim(),
    email: document.getElementById("regEmail").value.trim(),
    phone: document.getElementById("regPhone").value.trim(),
    password: document.getElementById("regPassword").value,
  };

  setBusy(registerForm, true);
  try {
    // friendly duplicate check (the database enforces it as well)
    const check = await sb.rpc("student_id_available", { sid: data.studentId });
    if (check.data === false)
      throw new Error("That student number is already registered.");

    const { data: res, error } = await sb.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          student_id: data.studentId,
          phone: data.phone,
        },
      },
    });
    if (error) throw new Error(error.message);

    // Supabase answers "ok" with no identities when the e-mail already has a verified account
    if (res.user && res.user.identities && res.user.identities.length === 0) {
      throw new Error("This e-mail is already registered. Try logging in.");
    }
    if (res.session) {
      // only happens if "Confirm email" is switched OFF in Supabase
      console.warn(
        '"Confirm email" is OFF in Supabase, so no verification code was sent.',
      );
      await goHome(res.user);
      return;
    }
    showOtpStep(data.email);
  } catch (err) {
    showMessage(registerError, err.message);
  } finally {
    setBusy(registerForm, false);
  }
});

// ---- REGISTER, step 2: the buyer types the code from their inbox; only then is the account created
otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  const token = otpCode.value.trim();

  setBusy(otpForm, true);
  try {
    let { data: v, error } = await sb.auth.verifyOtp({
      email: pendingEmail,
      token,
      type: "signup",
    });
    if (error)
      ({ data: v, error } = await sb.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
      }));
    if (error) {
      throw new Error(
        /database error/i.test(error.message)
          ? "That student number is already registered."
          : "That code is incorrect or has expired. Request a new one.",
      );
    }
    registerForm.reset();
    await goHome(v.user);
  } catch (err) {
    showMessage(otpError, err.message);
  } finally {
    setBusy(otpForm, false);
  }
});

otpResend.addEventListener("click", async () => {
  clearErrors();
  otpResend.disabled = true;
  const { error } = await sb.auth.resend({
    type: "signup",
    email: pendingEmail,
  });
  if (error) {
    showMessage(otpError, error.message);
    otpResend.disabled = false;
    return;
  }
  showMessage(otpError, "A new code was sent.", true);
  startCooldown(60);
});
otpBack.addEventListener("click", showRegisterStep);
