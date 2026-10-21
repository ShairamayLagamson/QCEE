// ---- Sample data (replace names/emojis with real ones from your sellers later)
const shops = [
  { name: "Brew & Bean", cat: "Cold drinks", icon: "☕" },
  { name: "Sweet Crumbs", cat: "Bakes & Sweets", icon: "🍪" },
  { name: "Crafty Hands", cat: "Arts & Crafts", icon: "🎨" },
  { name: "Ribbon & Co.", cat: "Fashion & Accessories", icon: "🎀" },
];
const lockedShops = Array.from({ length: 4 }, () => ({
  name: "More shops",
  cat: "Login to view",
  icon: "🛍️",
}));

const card = (s) => `
  <button class="shop" data-gate="shop">
    <div class="thumb">${s.icon}</div>
    <div class="info"><strong>${s.name}</strong><span>${s.cat}</span></div>
  </button>`;

document.getElementById("shops").innerHTML = shops.map(card).join("");
document.getElementById("lockedShops").innerHTML = lockedShops
  .map(card)
  .join("");

// ---- Login prompt modal
const overlay = document.getElementById("overlay");
const mTitle = document.getElementById("mTitle");
const mText = document.getElementById("mText");
const mEmoji = document.getElementById("mEmoji");

const messages = {
  cart: ["🛒", "Your cart is waiting", "Log in to add items and check out."],
  search: [
    "🔍",
    "Search all QCee shops",
    "Log in to search products and sellers.",
  ],
  shop: [
    "🏪",
    "Step inside this shop",
    "Register or log in to browse its products.",
  ],
  order: ["☕", "Ready to order?", "Log in to place your pre-order."],
  pill: [
    "✨",
    "See every category",
    "Register or log in to explore all products.",
  ],
  default: [
    "👋",
    "Join QCee",
    "Register or log in to explore the full marketplace.",
  ],
};

function openGate(type) {
  const [emoji, title, text] = messages[type] || messages.default;
  mEmoji.textContent = emoji;
  mTitle.textContent = title;
  mText.textContent = text;
  overlay.classList.add("open");
  overlay.querySelector("a.btn-orange").focus();
}
function closeGate() {
  overlay.classList.remove("open");
}

// Any element with data-gate opens the prompt instead of doing its normal action
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-gate]");
  if (el) {
    e.preventDefault();
    openGate(el.dataset.gate);
  }
});
// Search: prompt as soon as they tap into the box
document.getElementById("searchInput").addEventListener("focus", (e) => {
  e.target.blur();
  openGate("search");
});

overlay.addEventListener("click", (e) => {
  if (e.target === overlay || e.target.closest("[data-close]")) closeGate();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeGate();
});

// ---- Scroll: bottom bar slides up once the locked section comes into view
const bar = document.getElementById("stickyCta");
new IntersectionObserver(
  ([entry]) => {
    if (bar && entry.isIntersecting) bar.classList.add("show"); // bar is optional (the strip is commented out in index.html)
  },
  { threshold: 0.25 },
).observe(document.getElementById("locked"));
