const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const when = (d) =>
  d
    ? new Date(d).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
let requests = [],
  who = {},
  counts = { shops: 0, users: 0 },
  filter = "pending";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3500);
}

(async function init() {
  if (!window.sb) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return location.replace("auth_customer.html");
  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (!me || me.role !== "admin") return location.replace("index.html"); // the database enforces this too
  $("#adminName").textContent = "Admin";
  $("#adminEmail").textContent = session.user.email;
  document.body.hidden = false;
  await load();
})();

let accounts = [], shopCount = 0;
let accSearch = "", accRole = "all", accStatus = "all";

function avatarFor(a) {
  if (a.avatar_url) return a.avatar_url;
  // a stable placeholder avatar, seeded by the account's id
  return `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(a.id)}&backgroundType=gradientLinear`;
}

async function load() {
  const [r, users, sellers, biz] = await Promise.all([
    sb.from("seller_requests").select("*").order("created_at", { ascending: false }),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "seller"),
    sb.from("businesses").select("id", { count: "exact", head: true }),
  ]);
  if (r.error) return toast(r.error.message);
  requests = r.data || [];
  counts = { shops: sellers.count || 0, users: users.count || 0 };
  shopCount = biz.count || 0;
  who = {};
  const ids = [...new Set(requests.map((x) => x.user_id))];
  if (ids.length) {
    // applicant name + e-mail
    const p = await sb.from("profiles").select("id,email,full_name").in("id", ids);
    (p.data || []).forEach((x) => (who[x.id] = x));
  }
  const acc = await sb
    .from("profiles")
    .select("id,full_name,username,email,role,avatar_url,suspended")
    .in("role", ["customer", "seller"])
    .order("full_name")
    .limit(300);
  const rawAccounts = acc.error ? [] : acc.data || [];

  // sellers show their shop's name/logo/open-status instead of the profile's own
  const sellerIds = rawAccounts.filter((a) => a.role === "seller").map((a) => a.id);
  let shopsByOwner = {};
  if (sellerIds.length) {
    const biz = await sb.from("businesses").select("owner_id,name,logo_url,is_open").in("owner_id", sellerIds);
    (biz.data || []).forEach((b) => (shopsByOwner[b.owner_id] = b));
  }

  let sNo = 0, cNo = 0;
  accounts = rawAccounts.map((a) => {
    const shop = shopsByOwner[a.id];
    const active = a.role === "seller" ? (shop ? shop.is_open !== false : true) : !a.suspended;
    return {
      ...a,
      displayName: (a.role === "seller" && shop ? shop.name : a.full_name) || "-",
      avatar: a.role === "seller" && shop && shop.logo_url ? shop.logo_url : avatarFor(a),
      active,
      acctNo: a.role === "seller" ? "S-" + ++sNo : "C-" + ++cNo,
    };
  });
  render();
}

function reqRow(r) {
  const w = who[r.user_id] || {};
  let actions = `<button class="ad-details" data-view="${r.id}">Details</button>`;
  if (r.status === "pending") {
    actions = `<button class="ad-approve" data-act="approve" data-id="${r.id}">✓ Approve</button>
       <button class="ad-reject" data-act="reject" data-id="${r.id}">✕ Reject</button>` + actions;
  } else if (r.status === "approved") {
    actions += `<button class="ad-rmseller" data-act="remove" data-id="${r.id}">Remove Seller</button>`;
  }
  return `<div class="ad-tr ad-reqtr">
    <div class="ad-name" data-label="Business Name">${esc(r.business_name)}<small>${esc(w.full_name || "")}</small></div>
    <div data-label="Username">@${esc(r.username || "-")}</div>
    <div data-label="Status"><span class="ad-pill ${r.status}">${r.status.toUpperCase()}</span></div>
    <div class="ad-quick" data-label="Actions">${actions}</div></div>`;
}

function shortDate(d) {
  return d ? new Date(d).toLocaleDateString("en-US") : "-";
}

function waitingRow(r) {
  const w = who[r.user_id] || {};
  return `<div class="ad-tr">
    <div class="ad-name" data-label="Business Name">${esc(r.business_name)}<small>${esc(w.full_name || "")}</small></div>
    <div data-label="Username">@${esc(r.username || "-")}</div>
    <div class="ad-muted" data-label="Submission Date">${shortDate(r.created_at)}</div>
    <div data-label="Status"><span class="ad-pill">PENDING</span></div>
    <div class="ad-quick" data-label="Quick Actions">
      <button class="ad-approve" data-act="approve" data-id="${r.id}">✓ Approve</button>
      <button class="ad-reject" data-act="reject" data-id="${r.id}">✕ Reject</button>
    </div></div>`;
}

function render() {
  const n = (s) => requests.filter((r) => s === "all" || r.status === s).length;
  $("#stats").innerHTML = [
    [shopCount, "Shops in the system"],
    [counts.users, "Buyer"],
    [counts.shops, "Seller"],
    [n("pending"), "Pending Request"],
  ]
    .map(([v, t]) => `<div class="ad-stat"><span>${t}</span><b>${v}</b></div>`)
    .join("");
  $("#pendBadge").textContent = n("pending");
  $("#pendBadge").hidden = !n("pending");

  const pend = requests.filter((r) => r.status === "pending");
  $("#latest").innerHTML = `<div class="ad-thead"><div>Business Name</div><div>Username</div><div>Submission Date</div><div>Status</div><div>Quick Actions</div></div>
    <div class="ad-tbody">${pend.length ? pend.map(waitingRow).join("") : '<p class="ad-empty">Requests waiting.</p>'}</div>`;

  $("#chips").innerHTML = ["pending", "approved", "rejected", "all"]
    .map(
      (f) =>
        `<button class="chip ${f === filter ? "on" : ""}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)} (${n(f)})</button>`,
    )
    .join("");
  const list = requests.filter((r) => filter === "all" || r.status === filter);
  $("#reqList").innerHTML = `<div class="ad-thead ad-reqtr"><div>Business Name</div><div>Username</div><div>Status</div><div>Actions</div></div>
    <div class="ad-tbody">${list.length ? list.map(reqRow).join("") : `<p class="ad-empty">No ${filter === "all" ? "" : filter + " "}requests.</p>`}</div>`;
  $("#reqCount").textContent = `Showing ${list.length} Total ${list.length === 1 ? "Entry" : "Entries"}`;

  renderAccounts();
}

function accCard(a) {
  return `<div class="ad-acc-card" data-acc="${a.id}">
    <div class="ad-acc-top">
      <img class="ad-acc-av" src="${esc(a.avatar)}" alt="" onerror="this.style.visibility='hidden'">
      <b>${esc(a.displayName)}</b>
      <span class="ad-acc-status ${a.active ? "active" : "suspended"}">${a.active ? "Active" : "Suspended"}</span>
    </div>
    <div class="ad-acc-info">
      <div><span>Username:</span><span>@${esc(a.username || "-")}</span></div>
      <div><span>Email:</span><span>${esc(a.email || "-")}</span></div>
      <div><span>Account ID:</span><span>${esc(a.acctNo)}</span></div>
    </div>
    <div class="ad-acc-actions">
      <button type="button" class="ad-acc-btn" data-toggle="${a.id}" data-role="${a.role}" data-active="${a.active}">
        ${a.active ? "Suspend" : "Activate"}
      </button>
      <button type="button" class="ad-acc-btn ad-acc-remove" data-remove="${a.id}" data-name="${esc(a.displayName)}">
        Remove
      </button>
    </div>
  </div>`;
}

function renderAccounts() {
  const q = accSearch.trim().toLowerCase();
  const list = accounts.filter((a) => {
    if (accRole !== "all" && a.role !== accRole) return false;
    if (accStatus === "active" && !a.active) return false;
    if (accStatus === "suspended" && a.active) return false;
    if (!q) return true;
    return (
      (a.displayName || "").toLowerCase().includes(q) ||
      (a.username || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q)
    );
  });
  $("#accountsList").innerHTML = list.length
    ? list.map(accCard).join("")
    : '<p class="ad-acc-empty">No accounts match.</p>';
  $("#accCount").textContent = `Showing ${list.length} Total ${list.length === 1 ? "Entry" : "Entries"}`;
}

$("#accSearch").addEventListener("input", (e) => {
  accSearch = e.target.value;
  renderAccounts();
});
$("#accRole").addEventListener("change", (e) => {
  accRole = e.target.value;
  renderAccounts();
});
$("#accStatus").addEventListener("change", (e) => {
  accStatus = e.target.value;
  renderAccounts();
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-toggle]");
  if (!b) return;
  const id = b.dataset.toggle,
    role = b.dataset.role,
    wasActive = b.dataset.active === "true";
  b.disabled = true;
  const { error } = await sb.rpc("admin_set_account_status", {
    p_role: role,
    p_id: id,
    p_active: !wasActive,
  });
  if (error) {
    toast(error.message);
    b.disabled = false;
    return;
  }
  toast(wasActive ? "Account suspended." : "Account activated.");
  await load();
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  if (
    !(await confirmBox(
      "Remove this account?",
      `${b.dataset.name || "This account"} and its data will be permanently deleted. This cannot be undone.`,
      "Remove",
    ))
  )
    return;
  b.disabled = true;
  b.classList.add("busy");
  const { error } = await sb.rpc("admin_remove_account", { p_id: b.dataset.remove });
  if (error) {
    toast(error.message);
    b.disabled = false;
    b.classList.remove("busy");
    return;
  }
  toast("Account removed.");
  await load();
});

function showTab(name) {
  document
    .querySelectorAll(".admin-menu [data-tab]")
    .forEach((x) => x.classList.toggle("on", x.dataset.tab === name));
  document
    .querySelectorAll(".tab")
    .forEach((t) => (t.hidden = t.id !== "tab-" + name));
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (t) {
    e.preventDefault();
    showTab(t.dataset.tab);
  }
  const f = e.target.closest("[data-f]");
  if (f) {
    filter = f.dataset.f;
    render();
  }
});

function openDetails(id) {
  const r = requests.find((x) => x.id === id);
  if (!r) return;
  const w = who[r.user_id] || {};
  $("#rdBusiness").textContent = r.business_name || "-";
  $("#rdDate").textContent = when(r.created_at);
  $("#rdUsername").textContent = "@" + (r.username || "-");
  $("#rdEmail").textContent = w.email || "-";
  $("#rdSection").textContent = r.section || "-";
  const st = $("#rdStatus");
  st.textContent = r.status.toUpperCase();
  st.className = "ad-pill " + r.status;
  $("#rdActions").hidden = r.status !== "pending";
  $("#rdApprove").dataset.id = r.id;
  $("#rdReject").dataset.id = r.id;
  $("#reqDlg").hidden = false;
}
document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]");
  if (v) openDetails(v.dataset.view);
  if (e.target.closest("#rdClose") || e.target === $("#reqDlg")) {
    $("#reqDlg").hidden = true;
  }
});

function confirmBox(title, body, yes) {
  return new Promise((res) => {
    $("#dTitle").textContent = title;
    $("#dBody").textContent = body;
    $("#dYes").textContent = yes;
    const done = (v) => {
      $("#dlg").hidden = true;
      res(v);
    };
    $("#dYes").onclick = () => done(true);
    $("#dNo").onclick = () => done(false);
    $("#dlg").hidden = false;
    $("#dNo").focus();
  });
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const r = requests.find((x) => x.id === b.dataset.id);
  if (b.dataset.act === "remove") {
    // remove an approved seller (deletes the account and shop)
    if (
      !(await confirmBox(
        "Remove this seller?",
        `${r?.business_name || "This seller"} and its shop will be deleted. They can register again later.`,
        "Remove",
      ))
    )
      return;
    b.disabled = true;
    b.classList.add("busy");
    const { error } = await sb.rpc("admin_remove_seller", {
      req: b.dataset.id,
    });
    if (error) {
      toast(error.message);
      b.disabled = false;
      b.classList.remove("busy");
      return;
    }
    toast("Seller removed.");
    $("#reqDlg").hidden = true;
    await load();
    return;
  }
  const approve = b.dataset.act === "approve";
  if (
    !approve &&
    !(await confirmBox(
      "Reject this request?",
      `${r?.business_name || "This shop"} will not become a seller.`,
      "Reject",
    ))
  )
    return;
  b.disabled = true;
  b.classList.add("busy"); // spinner on the pressed button
  const { error } = await sb.rpc("admin_review_request", {
    req: b.dataset.id,
    approve,
  });
  if (error) {
    toast(error.message);
    b.disabled = false;
    b.classList.remove("busy");
    return;
  }
  toast(approve ? "Shop approved." : "Request rejected.");
  // e-mail the seller about the decision (runs in the background; a failure never undoes the approval)
  sb.functions
    .invoke("notify-seller", {
      body: { request_id: b.dataset.id },
    })
    .then(async (res) => {
      if (res.error) {
        let detail = "";
        try {
          detail = await res.error.context.text();
        } catch (e) {} // the function's real reply (may be plain text, not JSON)
        console.warn(
          "notify-seller " + (res.error.context && res.error.context.status) + ":",
          detail || res.error,
        );
        toast(
          (approve ? "Approved" : "Rejected") +
            ", but the e-mail could not be sent.",
        );
      }
    });
  $("#reqDlg").hidden = true;
  await load();
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.href = "index.html";
});