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
  $("#adminEmail").textContent = session.user.email;
  document.body.hidden = false;
  await load();
})();

async function load() {
  const [r, shops, users] = await Promise.all([
    sb
      .from("seller_requests")
      .select("*")
      .order("created_at", { ascending: false }),
    sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "seller"),
    sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer"),
  ]);
  if (r.error) return toast(r.error.message);
  requests = r.data || [];
  counts = { shops: shops.count || 0, users: users.count || 0 };
  who = {};
  const ids = [...new Set(requests.map((x) => x.user_id))];
  if (ids.length) {
    // applicant name + e-mail
    const p = await sb
      .from("profiles")
      .select("id,email,full_name")
      .in("id", ids);
    (p.data || []).forEach((x) => (who[x.id] = x));
  }
  render();
}

function card(r) {
  const w = who[r.user_id] || {};
  return `<div class="req"><div><b>${esc(r.business_name)}</b> <span class="pill-s ${r.status}">${r.status}</span>
    <small>Section ${esc(r.section || "-")} · @${esc(r.username || "-")}</small>
    <small>${esc(w.full_name || "")} ${esc(w.email || "")} · sent ${when(r.created_at)}</small>
    ${r.note ? `<small>"${esc(r.note)}"</small>` : ""}</div>
    ${
      r.status === "pending"
        ? `<div class="row"><button class="btn btn-orange mini" data-act="approve" data-id="${r.id}">Approve</button>
    <button class="btn btn-light mini" data-act="reject" data-id="${r.id}">Reject</button></div>`
        : ""
    }
    ${r.status === "approved" ? `<div class="row"><button class="btn btn-light mini danger" data-act="remove" data-id="${r.id}">Remove seller</button></div>` : ""}</div>`;
}

function render() {
  const n = (s) => requests.filter((r) => s === "all" || r.status === s).length;
  $("#stats").innerHTML = [
    [counts.shops, "Shops in the system", ""],
    [counts.users, "Users (customers)", ""],
    [n("pending"), "Pending requests", n("pending") ? "hot" : ""],
  ]
    .map(
      ([v, t, c]) =>
        `<div class="stat ${c}"><b>${v}</b><span>${t}</span></div>`,
    )
    .join("");
  $("#pendBadge").textContent = n("pending");
  $("#pendBadge").hidden = !n("pending");

  const pend = requests.filter((r) => r.status === "pending");
  $("#latest").innerHTML = pend.length
    ? pend.slice(0, 5).map(card).join("")
    : '<p class="empty">No requests waiting.</p>';

  $("#chips").innerHTML = ["pending", "approved", "rejected", "all"]
    .map(
      (f) =>
        `<button class="chip ${f === filter ? "on" : ""}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)} (${n(f)})</button>`,
    )
    .join("");
  const list = requests.filter((r) => filter === "all" || r.status === filter);
  $("#reqList").innerHTML = list.length
    ? list.map(card).join("")
    : `<p class="empty">No ${filter === "all" ? "" : filter + " "}requests.</p>`;
}

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
    const el = b.closest(".req");
    if (el) {
      el.classList.add("leaving");
      await new Promise((res) => setTimeout(res, 260));
    }
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
    .invoke("notify-seller", { body: { request_id: b.dataset.id } })
    .then((res) => {
      if (res.error) {
        console.warn("notify-seller:", res.error);
        toast(
          (approve ? "Approved" : "Rejected") +
            ", but the e-mail could not be sent.",
        );
      }
    });
  const cardEl = b.closest(".req"); // slide the card away, then refresh
  if (cardEl) {
    cardEl.classList.add("leaving");
    await new Promise((r) => setTimeout(r, 260));
  }
  await load();
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.href = "index.html";
});
