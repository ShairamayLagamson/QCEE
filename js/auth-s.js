const container = document.querySelector('.container');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

function clearErrors() { loginError.textContent = ''; registerError.textContent = ''; }

document.querySelector('.register-btn').addEventListener('click', () => { clearErrors(); container.classList.add('active'); });
document.querySelector('.login-btn').addEventListener('click', () => { clearErrors(); container.classList.remove('active'); });

// open the register side from a link: auth_seller.html?mode=register
if (new URLSearchParams(location.search).get('mode') === 'register') container.classList.add('active');

// ---- LOGIN: username, then password
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPassword').value;
  // Supabase later:
  //   email = (look up the e-mail that belongs to this username)
  //   supabase.auth.signInWithPassword({ email, password })
});

// ---- REGISTER: business name, section, e-mail, username, password
registerForm.addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    businessName: document.getElementById('regBusiness').value.trim(),
    section: document.getElementById('regSection').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    username: document.getElementById('regUsername').value.trim(),
    password: document.getElementById('regPassword').value,
  };
  // Supabase later:
  //   supabase.auth.signUp({ email: data.email, password: data.password,
  //     options: { data: { business_name: data.businessName, section: data.section, username: data.username, role: 'seller' } } })
});