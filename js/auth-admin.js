/* Adds a "show / hide password" eye button to every password box on the page.
   Add  <script src="js/password-toggle.js"></script>  just before </body> on each auth page.
   It styles itself, replaces the little lock icon with the eye, and needs no other files. */
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

// ---- the ready-made admin login: username is fixed, the password is the one you set in Supabase ----
const ADMIN_USERNAME = "QCEEadmin@123$";
const ADMIN_EMAIL = "qcenterpriseecommerce@gmail.com"; // <- the e-mail of the admin user you create in Supabase
const DEBUG = true; // while fixing login problems the real reason is shown in [brackets]. Set to false when it works.

const form = document.getElementById("adminForm");
const err = document.getElementById("adminError");
const BAD = "Incorrect username or password.";
const why = (detail) => new Error(DEBUG ? BAD + " [" + detail + "]" : BAD);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  if (!window.sb)
    return (err.textContent =
      "Cannot reach the server. Check your internet and reload.");
  const user = document.getElementById("adminUser").value.trim();
  const password = document.getElementById("adminPass").value;
  const btn = form.querySelector("button");
  btn.disabled = true;
  try {
    if (user !== ADMIN_USERNAME)
      throw why(
        "username does not match: you typed " +
          user.length +
          " characters, expected " +
          ADMIN_USERNAME.length +
          " (capitals count)",
      );
    const { data: login, error } = await sb.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });
    if (error) throw why("Supabase says: " + error.message);
    const { data: p, error: pe } = await sb
      .from("profiles")
      .select("role")
      .eq("id", login.user.id)
      .maybeSingle();
    if (pe) {
      await sb.auth.signOut();
      throw why("could not read profile: " + pe.message);
    }
    if (!p) {
      await sb.auth.signOut();
      throw why("password is right, but this account has no row in profiles");
    }
    if (p.role !== "admin") {
      await sb.auth.signOut();
      throw why('password is right, but role is "' + p.role + '", not admin');
    } // only the admin gets in
    location.href = "admin-dashboard.html";
  } catch (x) {
    err.textContent = x.message;
  } finally {
    btn.disabled = false;
  }
});
