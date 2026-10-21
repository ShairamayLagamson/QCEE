/* Order Dashboard: login guard, menu, the seller's orders, status changes and PDF reports.
   Orders come from the "orders" + "order_items" tables (orders.sql). Until those exist, sample orders are shown. */
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var LABEL = {
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  var STATUSES = ["ready", "completed", "cancelled"],
    ONGOING = ["ready"];
  var orders = [],
    tab = "ongoing",
    query = "",
    demo = false,
    user = null,
    biz = null,
    shopName = "My Shop",
    current = null;
  var sbOk = !!window.sb;

  /* ---------- floating menu ---------- */
  var btn = $("menuBtn"),
    chip = $("chipBtn"),
    menu = $("floatMenu"),
    back = $("menuBackdrop");
  function setMenu(open) {
    menu.hidden = !open;
    back.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    chip.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function () {
    setMenu(menu.hidden);
  });
  chip.addEventListener("click", function () {
    setMenu(menu.hidden);
  });
  back.addEventListener("click", function () {
    setMenu(false);
  });
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      setMenu(false);
      closeDlg();
    }
  });
  $("logout").addEventListener("click", async function () {
    if (window.sb) await sb.auth.signOut();
    location.href = "index.html";
  });

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("show");
    }, 3200);
  }

  /* ---------- helpers (order data comes from customers, so it is always inserted as text) ---------- */
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  var num = function (n) {
    return Number(n || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  var peso = function (n) {
    return "\u20B1" + num(n);
  };
  var orderNo = function (o) {
    return "QC - " + o.order_no;
  };
  function clock(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString()
      ? t
      : d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + t;
  }
  function itemsText(o) {
    return (o.items || [])
      .map(function (i) {
        return i.qty + "x " + i.name;
      })
      .join(", ");
  }
  function byStatus(list) {
    return orders.filter(function (o) {
      return list.indexOf(o.status) > -1;
    });
  }
  function madeToday() {
    var t = new Date().toDateString();
    return orders.filter(function (o) {
      return (
        o.status === "completed" && new Date(o.created_at).toDateString() === t
      );
    });
  }
  var sum = function (list) {
    return list.reduce(function (s, o) {
      return s + Number(o.total || 0);
    }, 0);
  };

  function setName(n) {
    shopName = n || "My Shop";
    Array.prototype.forEach.call(
      document.querySelectorAll(".js-shopname"),
      function (el) {
        el.textContent = shopName;
      },
    );
    document.title = "Order Dashboard | " + shopName;
    var av = $("shopAvatar");
    if (!av.style.backgroundImage)
      av.textContent = shopName.trim().charAt(0).toUpperCase() || "S";
  }

  /* ---------- sample orders (shown until the orders table exists) ---------- */
  function sample() {
    var now = Date.now(),
      m = 60000;
    function at(min) {
      return new Date(now - min * m).toISOString();
    }
    return [
      {
        id: "s1",
        order_no: 1234,
        status: "preparing",
        customer_name: "Meowrin",
        created_at: at(4),
        note: "More choco",
        total: 80,
        items: [{ name: "Chockies", qty: 2, price: 40 }],
      },
      {
        id: "s2",
        order_no: 6567,
        status: "ready",
        customer_name: "Hyei",
        created_at: at(35),
        note: "More nuts",
        total: 160,
        items: [{ name: "Go nut or kies me", qty: 4, price: 40 }],
      },
      {
        id: "s3",
        order_no: 563,
        status: "completed",
        customer_name: "Jishi",
        created_at: at(60),
        note: "More Ube",
        total: 60,
        items: [{ name: "Ube-utiful kies", qty: 2, price: 30 }],
      },
      {
        id: "s4",
        order_no: 1037,
        status: "cancelled",
        customer_name: "Rico Tan",
        created_at: at(200),
        note: "",
        total: 67,
        items: [{ name: "Chockie", qty: 1, price: 67 }],
      },
    ];
  }

  async function load(quiet) {
    if (!sbOk || !biz) {
      demo = true;
      orders = sample();
      draw();
      return;
    }
    var res = await sb
      .from("orders")
      .select(
        "id, order_no, status, total, note, pickup_time, created_at, customer_name, order_items(name, qty, price)",
      )
      .eq("business_id", biz.id)
      .order("created_at", { ascending: false });
    if (res.error) {
      console.warn("orders:", res.error);
      demo = true;
      orders = sample();
      if (!quiet)
        toast("Couldn't load orders yet: run orders.sql in Supabase.");
    } else {
      demo = false;
      orders = (res.data || []).map(function (o) {
        o.items = o.order_items || [];
        return o;
      });
    }
    draw();
  }

  /* ---------- draw ---------- */
  function card(kind, lab, ico, n, cls) {
    var inner =
      '<div class="top"><span class="lab">' +
      lab +
      '</span><span class="ico i-' +
      cls +
      '">' +
      ico +
      '</span></div><div class="num">' +
      n +
      "</div>";
    return kind
      ? '<button type="button" class="od-stat" data-report="' +
          kind +
          '" title="Save a PDF report">' +
          inner +
          "</button>"
      : '<div class="od-stat">' + inner + "</div>";
  }
  function draw() {
    var done = madeToday();
    $("stats").innerHTML =
      '<button type="button" class="od-stat profit" data-report="profit" title="Save a PDF report"><div class="top"><span class="lab">Profit today</span><span class="ico"><img src="images/stonks-ico.png" alt="" onerror="this.style.visibility=\'hidden\'"></span></div>' +
      '<div class="num">' +
      peso(sum(done)) +
      '</div><small><span class="up">\u2197</span>From completed orders</small></button>' +
      card(
        "cancelled",
        "Cancelled",
        '<img src="images/cancelled-ico.png" alt="" onerror="this.style.visibility=\'hidden\'">',
        byStatus(["cancelled"]).length,
        "cancelled",
      ) +
      card(
        "ready",
        "Ready",
        '<img src="images/ready-ico.png" alt="" onerror="this.style.visibility=\'hidden\'">',
        byStatus(["ready"]).length,
        "ready",
      ) +
      card("completed", "Completed", '<img src="images/completed-ico.png" alt="" onerror="this.style.visibility=\'hidden\'">', done.length, "completed");
    document.querySelector('[data-n="ongoing"]').textContent =
      byStatus(ONGOING).length;
    document.querySelector('[data-n="completed"]').textContent = byStatus([
      "completed",
    ]).length;
    document.querySelector('[data-n="cancelled"]').textContent = byStatus([
      "cancelled",
    ]).length;
    $("demoNote").hidden = !demo;

    var show = tab === "ongoing" ? ONGOING : [tab],
      q = query.toLowerCase();
    var list = orders.filter(function (o) {
      return (
        show.indexOf(o.status) > -1 &&
        (!q ||
          (o.customer_name + " " + orderNo(o) + " " + itemsText(o))
            .toLowerCase()
            .indexOf(q) > -1)
      );
    });
    $("rows").innerHTML = list.length
      ? list
          .map(function (o) {
            var opts = STATUSES.map(function (s) {
              return (
                '<option value="' +
                s +
                '"' +
                (s === o.status ? " selected" : "") +
                ">" +
                LABEL[s] +
                "</option>"
              );
            }).join("");
            return (
              '<div class="od-row" data-id="' +
              esc(o.id) +
              '"><div class="c-name">' +
              esc(o.customer_name || "Customer") +
              "</div>" +
              '<div class="c-order"><b class="c-no">' +
              esc(orderNo(o)) +
              '</b><small class="c-items">' +
              esc(itemsText(o)) +
              "</small></div>" +
              '<div class="c-status"><select class="od-status od-st-' +
              esc(o.status) +
              '" aria-label="Order status">' +
              opts +
              "</select></div>" +
              '<div class="c-time">' +
              esc(clock(o.created_at)) +
              '</div><div class="c-amount">' +
              peso(o.total) +
              "</div>" +
              '<div class="c-remarks">' +
              esc(o.note || "-") +
              "</div></div>"
            );
          })
          .join("")
      : '<p class="od-empty">' +
        (q ? "No orders match your search." : "No " + tab + " orders yet.") +
        "</p>";
  }

  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    Array.prototype.forEach.call(
      document.querySelectorAll(".od-tab"),
      function (t) {
        t.classList.toggle("on", t === b);
      },
    );
    draw();
  });
  $("q").addEventListener("input", function (e) {
    query = e.target.value.trim();
    draw();
  });

  /* ---------- change an order's status ---------- */
  $("rows").addEventListener("change", async function (e) {
    var sel = e.target.closest(".od-status");
    if (!sel) return;
    var id = sel.closest(".od-row").dataset.id,
      o = orders.filter(function (x) {
        return String(x.id) === id;
      })[0];
    if (!o) return;
    var prev = o.status,
      next = sel.value;
    if (
      next === "cancelled" &&
      !window.confirm("Cancel order " + orderNo(o) + "?")
    ) {
      draw();
      return;
    }
    if (!demo) {
      var r = await sb
        .from("orders")
        .update({ status: next })
        .eq("id", o.id)
        .select("id");
      if (r.error || !r.data || !r.data.length) {
        console.warn("update order:", r.error);
        o.status = prev;
        draw();
        toast("Couldn't update that order. Please try again.");
        return;
      }
    }
    o.status = next;
    draw();
    toast("Order " + orderNo(o) + " is now " + LABEL[next].toLowerCase() + ".");
  });

  /* ---------- PDF reports (Profit, Pending, Ready, Completed) ---------- */
  function reportFor(kind) {
    var done = madeToday();
    var m = {
      profit: ["Profit report: completed orders made today", done],
      completed: ["Completed orders made today", done],
      ready: ["Ready orders", byStatus(["ready"])],
      cancelled: ["Cancelled orders", byStatus(["cancelled"])],
    }[kind];
    return { kind: kind, title: m[0], rows: m[1], total: sum(m[1]) };
  }
  function closeDlg() {
    $("dlg").hidden = true;
  }
  $("stats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-report]");
    if (!b) return;
    current = reportFor(b.dataset.report);
    var n = current.rows.length;
    $("dlgBody").textContent = n
      ? current.title +
        ": " +
        n +
        " order" +
        (n > 1 ? "s" : "") +
        ", total " +
        peso(current.total) +
        ". Save this report as a PDF?"
      : current.title + ": there are no orders to report yet.";
    $("dlgYes").disabled = !n;
    $("dlg").hidden = false;
    $("dlgNo").focus();
  });
  $("dlgNo").addEventListener("click", closeDlg);
  $("dlg").addEventListener("click", function (e) {
    if (e.target === $("dlg")) closeDlg();
  });

  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = no;
      document.head.appendChild(s);
    });
  }
  async function pdfLibs() {
    // loaded only when a report is saved
    if (!(window.jspdf && window.jspdf.jsPDF))
      await loadScript(
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      );
    if (!window.jspdf.jsPDF.API.autoTable)
      await loadScript(
        "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
      );
  }
  $("dlgYes").addEventListener("click", async function () {
    var r = current,
      yes = $("dlgYes");
    if (!r) return;
    yes.disabled = true;
    yes.textContent = "Preparing...";
    try {
      await pdfLibs();
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
      doc.setFontSize(18);
      doc.text(shopName, 40, 50);
      doc.setFontSize(12);
      doc.text(r.title, 40, 70);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text("Generated " + new Date().toLocaleString(), 40, 86);
      var php = function (n) {
        return "PHP " + num(n);
      }; // the peso sign is not in the PDF's built-in font
      doc.autoTable({
        startY: 100,
        theme: "grid",
        styles: { fontSize: 9 },
        head: [
          ["#", "Order No.", "Customer", "Items", "Time", "Status", "Amount"],
        ],
        body: r.rows.map(function (o, i) {
          return [
            i + 1,
            orderNo(o),
            o.customer_name || "Customer",
            itemsText(o),
            clock(o.created_at),
            LABEL[o.status],
            php(o.total),
          ];
        }),
        foot: [["", "", "", "", "", "Total", php(r.total)]],
        headStyles: { fillColor: [43, 26, 18], textColor: [255, 214, 163] },
        footStyles: { fillColor: [250, 240, 228], textColor: [43, 26, 18] },
        columnStyles: { 6: { halign: "right" } },
      });
      doc.save(
        "qcee-" +
          r.kind +
          "-report-" +
          new Date().toISOString().slice(0, 10) +
          ".pdf",
      );
      closeDlg();
      toast("PDF saved.");
    } catch (err) {
      toast("Could not make the PDF. Check your internet and try again.");
    } finally {
      yes.textContent = "Save as PDF";
      yes.disabled = false;
    }
  });

  /* ---------- login guard, shop info, live updates ---------- */
  (async function () {
    if (!sbOk) {
      setName("My Shop");
      await load(true);
      return;
    } // no Supabase client yet: sample data only
    var s = (await sb.auth.getSession()).data.session;
    if (!s) {
      location.replace("auth-s.html");
      return;
    }
    user = s.user;
    var prof = await sb
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    var role = prof.data && prof.data.role;
    if (role && role !== "seller") {
      location.replace(
        role === "admin" ? "admin-dashboard.html" : "customer-home.html",
      );
      return;
    }

    var b = await sb
      .from("businesses")
      .select("id, name, logo_url, is_open")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (b.error)
      b = await sb
        .from("businesses")
        .select("id, name, is_open")
        .eq("owner_id", user.id)
        .maybeSingle(); // logo column not added yet
    biz = b.data || null;
    setName(
      (biz && biz.name) || (prof.data && prof.data.full_name) || "My Shop",
    );
    if (biz && biz.logo_url) {
      var av = $("shopAvatar");
      av.style.backgroundImage = 'url("' + biz.logo_url + '")';
      av.textContent = "";
    }
    if (biz && biz.is_open === false) {
      var st = $("shopStatus");
      st.textContent = "Closed";
      st.style.color = "#ff8a7a";
    }

    await load(false);
    if (biz && !demo) {
      // new orders and status changes appear without refreshing (needs the realtime line in orders.sql)
      try {
        sb.channel("orders-" + biz.id)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "orders",
              filter: "business_id=eq." + biz.id,
            },
            function () {
              load(true);
            },
          )
          .subscribe();
      } catch (err) {
        console.warn("realtime:", err);
      }
    }
  })();
})();