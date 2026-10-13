
const container = document.querySelector('.container');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

function clearErrors() { loginError.textContent = ''; registerError.textContent = ''; }

document.querySelector('.register-btn').addEventListener('click', () => { clearErrors(); container.classList.add('active'); });
document.querySelector('.login-btn').addEventListener('click', () => { clearErrors(); container.classList.remove('active'); });

// open the register side from a link: auth_customer.html?mode=register
if (new URLSearchParams(location.search).get('mode') === 'register') container.classList.add('active');

// ---- LOGIN: student number OR e-mail, then password
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPassword').value;
  const isEmail = id.includes('@');
  // Supabase later:
  //   email = isEmail ? id : (look up the e-mail that belongs to this student number)
  //   supabase.auth.signInWithPassword({ email, password })
});

// ---- REGISTER: name, student number, e-mail, phone, password
registerForm.addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    name: document.getElementById('regName').value.trim(),
    studentId: document.getElementById('regStudentId').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    password: document.getElementById('regPassword').value,
  };
  // Supabase later:
  //   supabase.auth.signUp({ email: data.email, password: data.password,
  //     options: { data: { name: data.name, student_id: data.studentId, phone: data.phone, role: 'customer' } } })
});