/* My Store: login guard, floating menu, and the shop's products, categories, pickup location / hours and open status.
   Everything is locked until the seller presses Edit. Data lives in Supabase (see my-store.sql);
   until those tables exist, sample products are shown and changes are not saved. */
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };

  /* ---------- floating menu ---------- */
  var btn = $("menuBtn"),
    chip = $("chipBtn"),
    menu = $("floatMenu"),
    back = $("menuBackdrop");
  function setMenu(open) {
    menu.hidden = !open;
    back.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
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

  /* ---------- toast ---------- */
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

  /* ---------- helpers ---------- */
  // names, categories and variants are typed by the seller, so they are always inserted as text
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function peso(n) {
    return (
      "₱ " +
      Number(n || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function time12(t) {
    if (!t) return "";
    var p = String(t).split(":"),
      h = +p[0],
      ap = h >= 12 ? "PM" : "AM";
    return (h % 12 || 12) + ":" + (p[1] || "00") + " " + ap;
  }
  function hhmm(t) {
    return t ? String(t).slice(0, 5) : "";
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 3) | 8).toString(16);
      },
    );
  }
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var SUGGEST = ["Arts & Crafts", "Bakes & Sweets", "Fashion & Accessories"];
  var TINTS = ["#fbd4e3", "#fde7a8", "#d9ecfb"];
  function tint(id) {
    var n = 0,
      s = String(id);
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i);
    return TINTS[n % 3];
  }
  function errText(err) {
    var m = String((err && err.message) || err);
    if (/permission denied/i.test(m))
      return "Couldn't save: Supabase is blocking it. Run the grant lines in my-store.sql.";
    return /relation|column|schema cache|does not exist/i.test(m)
      ? "Couldn't save yet: run my-store.sql in Supabase."
      : "Couldn't save: " + m;
  }

  /* ---------- floating windows ---------- */
  var stack = [];
  function openModal(el) {
    el.hidden = false;
    stack.push(el);
    document.body.style.overflow = "hidden";
    var f =
      el.querySelector("[data-autofocus]") ||
      el.querySelector("input, select, button");
    if (f)
      setTimeout(function () {
        f.focus();
      }, 30);
  }
  function closeModal(el) {
    if (el.hidden) return;
    el.hidden = true;
    stack = stack.filter(function (x) {
      return x !== el;
    });
    if (!stack.length) document.body.style.overflow = "";
    if (el.onClosed) el.onClosed();
  }
  Array.prototype.forEach.call(
    document.querySelectorAll(".m-modal"),
    function (m) {
      m.addEventListener("click", function (e) {
        if (e.target === m || e.target.closest("[data-close]")) closeModal(m);
      });
    },
  );
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (stack.length) closeModal(stack[stack.length - 1]);
    else {
      setMenu(false);
      setPop(false);
    }
  });

  var cfResolve = null;
  function ask(title, text, okLabel) {
    return new Promise(function (resolve) {
      $("cfTitle").textContent = title;
      $("cfText").textContent = text;
      $("cfOk").textContent = okLabel || "Delete";
      cfResolve = resolve;
      openModal($("confirmModal"));
    });
  }
  $("confirmModal").onClosed = function () {
    if (cfResolve) {
      var r = cfResolve;
      cfResolve = null;
      r(false);
    }
  };
  $("cfOk").addEventListener("click", function () {
    var r = cfResolve;
    cfResolve = null;
    closeModal($("confirmModal"));
    if (r) r(true);
  });

  /* ---------- state ---------- */
  var BUCKET = "shop-banners"; // the same bucket as the shop picture; files go in <user id>/products/
  var user = null,
    biz = null,
    demo = false,
    noShop = false;
  var cats = [],
    prods = [];
  var editing = false,
    selected = {};
  var isOpen = true;
  var where = {
    location: "",
    day_from: null,
    day_to: null,
    open_time: "",
    close_time: "",
  };
  var shopName = "My Shop";

  function catName(id) {
    var c = cats.filter(function (x) {
      return String(x.id) === String(id);
    })[0];
    return c ? c.name : "";
  }
  function sel() {
    return Object.keys(selected);
  }

  /* ---------- edit lock ---------- */
  function setEditing(on) {
    editing = on;
    selected = {};
    $("store").classList.toggle("is-locked", !on);
    $("editLabel").textContent = on ? "Done" : "Edit";
    $("editBtn").setAttribute(
      "aria-label",
      on ? "Done editing" : "Edit store menu",
    );
    $("editBtn").title = on ? "Done" : "Edit";
    $("catBtn").disabled = !on;
    $("addBtn").disabled = !on;
    updateDel();
    renderProducts();
  }
  function updateDel() {
    var n = sel().length;
    $("delBtn").disabled = !(editing && n);
    $("delLabel").textContent = n ? "Delete (" + n + ")" : "Delete";
    $("delBtn").dataset.count = n ? String(n) : "";
  }
  $("editBtn").addEventListener("click", function () {
    if (!noShop) setEditing(!editing);
  });

  /* ---------- shop name, status, location ---------- */
  function setName(n) {
    shopName = n || "My Shop";
    Array.prototype.forEach.call(
      document.querySelectorAll(".js-shopname"),
      function (el) {
        el.textContent = shopName;
      },
    );
    document.title = "My Store | " + shopName;
    var av = $("shopAvatar");
    if (!av.style.backgroundImage)
      av.textContent = shopName.trim().charAt(0).toUpperCase() || "S";
  }
  function renderOpen() {
    $("openLabel").textContent = isOpen ? "Open" : "Closed";
    $("openBtn").dataset.state = isOpen ? "open" : "closed";
    $("openToggle").textContent = isOpen ? "Close shop" : "Open shop";
    $("openToggle").dataset.to = isOpen ? "closed" : "open";
    $("closedNote").hidden = isOpen;
    var st = $("shopStatus");
    st.textContent = isOpen ? "Active" : "Closed";
    st.style.color = isOpen ? "" : "#ff8a7a";
  }
  function renderWhere() {
    $("whereText").textContent = where.location || "Add your pickup location";
    var a = where.day_from,
      b = where.day_to;
    $("hoursDays").textContent =
      a == null || b == null
        ? "Set your days"
        : a === b
          ? DAYS[a]
          : DAYS[a] + " - " + DAYS[b];
    $("hoursTime").textContent =
      where.open_time && where.close_time
        ? time12(where.open_time) + " - " + time12(where.close_time)
        : "Set your hours";
  }

  var pop = $("openPop"),
    openBtn = $("openBtn");
  function setPop(open) {
    pop.hidden = !open;
    openBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  openBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setPop(pop.hidden);
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".m-openwrap")) setPop(false);
  });
  $("openToggle").addEventListener("click", async function () {
    var next = !isOpen;
    setPop(false);
    if (!demo && biz) {
      var r = await sb
        .from("businesses")
        .update({ is_open: next })
        .eq("id", biz.id)
        .select("id");
      if (r.error || !r.data || !r.data.length) {
        console.warn("is_open:", r.error);
        toast("Couldn't change the shop status.");
        return;
      }
    }
    isOpen = next;
    renderOpen();
    toast(next ? "Your shop is open." : "Your shop is closed.");
  });

  /* ---------- products grid ---------- */
  var ICON_EDIT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="17" height="17" rx="3"/><path d="M9 15l1-4 8-8a1.8 1.8 0 0 1 2.6 2.6l-8 8z"/></svg>';
  var ICON_TRASH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';
  var ICON_HEART =
    '<svg class="m-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4.2 4.2 0 0 1 7-3 4.2 4.2 0 0 1 7 3c0 5.6-7 10-7 10z"/></svg>';

  function card(p) {
    var pic = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="">'
      : '<span class="m-ph" style="--tint:' +
        tint(p.id) +
        '">' +
        esc((p.name || "?").trim().charAt(0).toUpperCase()) +
        "</span>";
    var cat = catName(p.category_id);
    var stock = Number(p.stock) > 0 ? p.stock + " left" : "Sold out";
    return (
      '<article class="m-prod" data-id="' +
      esc(p.id) +
      '">' +
      '<button type="button" class="m-pic' +
      (selected[p.id] ? " sel" : "") +
      '" data-pic aria-pressed="' +
      (selected[p.id] ? "true" : "false") +
      '" aria-label="' +
      esc(p.name) +
      '">' +
      pic +
      '<span class="m-stock' +
      (Number(p.stock) > 0 ? "" : " out") +
      '">' +
      esc(stock) +
      "</span></button>" +
      '<div class="m-info">' +
      '<div class="m-nrow"><strong class="m-pname">' +
      esc(p.name) +
      "</strong>" +
      ICON_HEART +
      "</div>" +
      (cat ? '<span class="m-cat">Category: ' + esc(cat) + "</span>" : "") +
      (p.variant
        ? '<span class="m-var">Variant: ' + esc(p.variant) + "</span>"
        : "") +
      '<div class="m-price">' +
      peso(p.price) +
      "</div>" +
      '<div class="m-tools">' +
      '<button type="button" class="m-ic" data-act="edit" aria-label="Edit ' +
      esc(p.name) +
      '">' +
      ICON_EDIT +
      "</button>" +
      '<button type="button" class="m-ic m-trash" data-act="del" aria-label="Delete ' +
      esc(p.name) +
      '">' +
      ICON_TRASH +
      "</button>" +
      "</div>" +
      "</div></article>"
    );
  }
  function renderProducts() {
    $("products").innerHTML = prods.map(card).join("");
    var e = $("empty");
    e.hidden = prods.length > 0;
    e.textContent = noShop
      ? ""
      : editing
        ? "No products yet. Press Add Product to create your first one."
        : "No products yet. Press Edit, then Add Product.";
    $("countText").textContent =
      prods.length + (prods.length === 1 ? " product" : " products");
  }

  $("products").addEventListener("click", async function (e) {
    if (!editing) return;
    var art = e.target.closest(".m-prod");
    if (!art) return;
    var id = art.dataset.id;
    var act = e.target.closest("[data-act]");
    if (act && act.dataset.act === "edit") {
      openProduct(id);
      return;
    }
    if (act && act.dataset.act === "del") {
      await removeProducts([id]);
      return;
    }
    var pic = e.target.closest("[data-pic]");
    if (pic) {
      if (selected[id]) delete selected[id];
      else selected[id] = true;
      pic.classList.toggle("sel", !!selected[id]);
      pic.setAttribute("aria-pressed", selected[id] ? "true" : "false");
      updateDel();
    }
  });
  $("delBtn").addEventListener("click", function () {
    if (editing) removeProducts(sel());
  });

  async function removeProducts(ids) {
    if (!ids.length) return;
    var one =
      ids.length === 1 &&
      prods.filter(function (p) {
        return String(p.id) === String(ids[0]);
      })[0];
    var ok = await ask(
      one ? "Delete this product?" : "Delete " + ids.length + " products?",
      one
        ? '"' + one.name + '" will be removed from your menu.'
        : "They will be removed from your menu. This cannot be undone.",
    );
    if (!ok) return;
    try {
      if (!demo) {
        var r = await sb.from("products").delete().in("id", ids).select("id");
        if (r.error) throw r.error;
        try {
          await sb.storage.from(BUCKET).remove(
            ids.map(function (id) {
              return user.id + "/products/" + id + ".jpg";
            }),
          );
        } catch (x) {
          /* the picture is cleaned up when it can be */
        }
      }
      prods = prods.filter(function (p) {
        return ids.indexOf(String(p.id)) < 0;
      });
      ids.forEach(function (id) {
        delete selected[id];
      });
      updateDel();
      renderProducts();
      toast(
        ids.length === 1
          ? "Product deleted."
          : ids.length + " products deleted.",
      );
    } catch (err) {
      console.warn("delete:", err);
      toast(errText(err));
    }
  }

  /* ---------- add / edit product ---------- */
  var pm = {
    id: null,
    blob: null,
    url: null,
    remove: false,
    orig: null,
    saved: false,
  };
  var pmModal = $("productModal"),
    pmFile = $("pmFile");

  function showPmImage() {
    var src = pm.url || (!pm.remove && pm.orig) || null;
    $("pmImg").hidden = !src;
    if (src) $("pmImg").src = src;
    $("pmEmpty").hidden = !!src;
    $("pmRemoveImg").hidden = !src;
  }
  function fillCats(selectedId) {
    var s = $("pmCat");
    s.innerHTML =
      '<option value="" disabled hidden' +
      (selectedId ? "" : " selected") +
      "></option>" +
      cats
        .map(function (c) {
          return (
            '<option value="' +
            esc(c.id) +
            '"' +
            (String(c.id) === String(selectedId) ? " selected" : "") +
            ">" +
            esc(c.name) +
            "</option>"
          );
        })
        .join("");
    $("pmNoCat").hidden = cats.length > 0;
  }
  function openProduct(id) {
    var p = id
      ? prods.filter(function (x) {
          return String(x.id) === String(id);
        })[0]
      : null;
    pm = {
      id: p ? p.id : null,
      blob: null,
      url: null,
      remove: false,
      orig: p ? p.image_url : null,
      saved: false,
    };
    $("pmTitle").textContent = p ? "Edit Product" : "Add New Product";
    $("pmName").value = p ? p.name : "";
    $("pmPrice").value = p ? p.price : "";
    $("pmStock").value = p ? p.stock : "";
    $("pmVariant").value = p && p.variant ? p.variant : "";
    fillCats(p ? p.category_id : null);
    showPmImage();
    openModal(pmModal);
  }
  pmModal.onClosed = function () {
    if (pm.url && !pm.saved) URL.revokeObjectURL(pm.url);
  };
  $("addBtn").addEventListener("click", function () {
    if (editing) openProduct(null);
  });
  $("pmGoCat").addEventListener("click", function () {
    closeModal(pmModal);
    openCats();
  });

  $("pmDrop").addEventListener("click", function () {
    pmFile.click();
  });
  $("pmRemoveImg").addEventListener("click", function () {
    if (pm.url) {
      URL.revokeObjectURL(pm.url);
      pm.url = null;
      pm.blob = null;
    } else if (pm.orig) pm.remove = true;
    showPmImage();
  });
  // pictures are cut to a square so every product tile looks the same
  function squareBlob(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file),
        img = new Image();
      img.onload = function () {
        var side = Math.min(img.naturalWidth, img.naturalHeight),
          out = 800;
        var c = document.createElement("canvas");
        c.width = out;
        c.height = out;
        var g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, out, out);
        g.imageSmoothingQuality = "high";
        g.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          out,
          out,
        );
        URL.revokeObjectURL(u);
        c.toBlob(
          function (b) {
            b ? resolve(b) : reject(new Error("blob"));
          },
          "image/jpeg",
          0.9,
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(u);
        reject(new Error("load"));
      };
      img.src = u;
    });
  }
  pmFile.addEventListener("change", async function () {
    var f = pmFile.files[0];
    pmFile.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast("Please choose an image file.");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast("Image is too big. Max 15 MB.");
      return;
    }
    try {
      var blob = await squareBlob(f);
      if (pm.url) URL.revokeObjectURL(pm.url);
      pm.blob = blob;
      pm.url = URL.createObjectURL(blob);
      pm.remove = false;
      showPmImage();
    } catch (err) {
      toast("Couldn't open that picture. Try another one.");
    }
  });

  $("pmForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var catId = $("pmCat").value;
    if (!catId) {
      toast("Choose a category first.");
      return;
    }
    var fields = {
      name: $("pmName").value.trim(),
      category_id: catId,
      price: Math.round(parseFloat($("pmPrice").value) * 100) / 100,
      stock: parseInt($("pmStock").value, 10),
      variant: $("pmVariant").value.trim() || null,
    };
    if (!fields.name) {
      toast("Add a product title.");
      return;
    }
    if (isNaN(fields.price) || fields.price < 0) {
      toast("Enter a valid price.");
      return;
    }
    if (isNaN(fields.stock) || fields.stock < 0) {
      toast("Enter a valid stock quantity.");
      return;
    }

    var save = $("pmSave");
    save.classList.add("busy");
    save.disabled = true;
    try {
      var id = pm.id || uuid();
      var image = pm.orig && !pm.remove ? pm.orig : null;
      if (demo) {
        if (pm.blob) image = pm.url; // kept for this visit only
      } else {
        var path = user.id + "/products/" + id + ".jpg";
        if (pm.blob) {
          var up = await sb.storage
            .from(BUCKET)
            .upload(path, pm.blob, { upsert: true, contentType: "image/jpeg" });
          if (up.error) throw up.error;
          image =
            sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl +
            "?v=" +
            Date.now();
        } else if (pm.remove && pm.orig) {
          await sb.storage.from(BUCKET).remove([path]);
          image = null;
        }
      }
      fields.image_url = image;

      if (!demo) {
        var r = pm.id
          ? await sb.from("products").update(fields).eq("id", id).select("id")
          : await sb
              .from("products")
              .insert(Object.assign({ id: id, business_id: biz.id }, fields))
              .select("id");
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error("product not found");
      }
      var rec = Object.assign(
        { id: id, created_at: new Date().toISOString() },
        fields,
      );
      var i = prods.findIndex(function (p) {
        return String(p.id) === String(id);
      });
      if (i >= 0)
        prods[i] = Object.assign(prods[i], rec, {
          created_at: prods[i].created_at,
        });
      else prods.unshift(rec);
      pm.saved = true;
      closeModal(pmModal);
      renderProducts();
      toast(i >= 0 ? "Product updated." : "Product added.");
    } catch (err) {
      console.warn("save product:", err);
      toast(errText(err));
    } finally {
      save.classList.remove("busy");
      save.disabled = false;
    }
  });

  /* ---------- categories ---------- */
  var catModal = $("catModal");
  function renderCats() {
    $("catList").innerHTML = cats
      .map(function (c) {
        return (
          '<li data-id="' +
          esc(c.id) +
          '"><span>' +
          esc(c.name) +
          "</span>" +
          '<button type="button" class="m-ic m-trash" data-del aria-label="Delete ' +
          esc(c.name) +
          '">' +
          ICON_TRASH +
          "</button></li>"
        );
      })
      .join("");
    $("catEmpty").hidden = cats.length > 0;
    var have = cats.map(function (c) {
      return c.name.toLowerCase();
    });
    $("catChips").innerHTML = SUGGEST.filter(function (s) {
      return have.indexOf(s.toLowerCase()) < 0;
    })
      .map(function (s) {
        return (
          '<button type="button" class="m-chip" data-add="' +
          esc(s) +
          '">+ ' +
          esc(s) +
          "</button>"
        );
      })
      .join("");
  }
  function openCats() {
    renderCats();
    $("catName").value = "";
    openModal(catModal);
  }
  $("catBtn").addEventListener("click", function () {
    if (editing) openCats();
  });

  async function addCategory(name) {
    name = name.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (
      cats.some(function (c) {
        return c.name.toLowerCase() === name.toLowerCase();
      })
    ) {
      toast("You already have that category.");
      return;
    }
    try {
      var rec;
      if (demo) rec = { id: "c" + Date.now(), name: name };
      else {
        var r = await sb
          .from("product_categories")
          .insert({ business_id: biz.id, name: name })
          .select("id, name")
          .single();
        if (r.error) throw r.error;
        rec = r.data;
      }
      cats.push(rec);
      cats.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
      renderCats();
      renderProducts();
    } catch (err) {
      console.warn("add category:", err);
      toast(errText(err));
    }
  }
  $("catForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = $("catName").value;
    $("catName").value = "";
    await addCategory(v);
    $("catName").focus();
  });
  $("catChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]");
    if (b) addCategory(b.dataset.add);
  });
  $("catList").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-del]");
    if (!b) return;
    var id = b.closest("li").dataset.id;
    var c = cats.filter(function (x) {
      return String(x.id) === id;
    })[0];
    if (!c) return;
    var inUse = prods.filter(function (p) {
      return String(p.category_id) === id;
    }).length;
    var ok = await ask(
      'Delete "' + c.name + '"?',
      inUse
        ? inUse +
            " product" +
            (inUse === 1 ? "" : "s") +
            " in this category will have no category."
        : "This category will be removed.",
    );
    if (!ok) return;
    try {
      if (!demo) {
        var r = await sb
          .from("product_categories")
          .delete()
          .eq("id", id)
          .select("id");
        if (r.error) throw r.error;
      }
      cats = cats.filter(function (x) {
        return String(x.id) !== id;
      });
      prods.forEach(function (p) {
        if (String(p.category_id) === id) p.category_id = null;
      });
      renderCats();
      renderProducts();
    } catch (err) {
      console.warn("delete category:", err);
      toast(errText(err));
    }
  });

  /* ---------- location and hours ---------- */
  var whereModal = $("whereModal");
  (function fillDays() {
    var html = DAY_ORDER.map(function (d) {
      return '<option value="' + d + '">' + DAYS[d] + "</option>";
    }).join("");
    $("wmFrom").innerHTML = html;
    $("wmTo").innerHTML = html;
  })();
  $("whereBtn").addEventListener("click", function () {
    if (!editing) return;
    $("wmLoc").value = where.location || "";
    $("wmFrom").value = where.day_from != null ? where.day_from : 1;
    $("wmTo").value = where.day_to != null ? where.day_to : 5;
    $("wmOpen").value = hhmm(where.open_time) || "08:00";
    $("wmClose").value = hhmm(where.close_time) || "17:00";
    openModal(whereModal);
  });
  $("whereForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = {
      location: $("wmLoc").value.trim(),
      day_from: +$("wmFrom").value,
      day_to: +$("wmTo").value,
      open_time: $("wmOpen").value,
      close_time: $("wmClose").value,
    };
    if (!f.location) {
      toast("Add your pickup location.");
      return;
    }
    if (f.close_time <= f.open_time) {
      toast("Closing time must be after opening time.");
      return;
    }
    var save = $("wmSave");
    save.classList.add("busy");
    save.disabled = true;
    try {
      if (!demo) {
        var r = await sb
          .from("businesses")
          .update(f)
          .eq("id", biz.id)
          .select("id");
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error("shop not found");
      }
      where = f;
      renderWhere();
      closeModal(whereModal);
      toast("Location and hours saved.");
    } catch (err) {
      console.warn("save location:", err);
      toast(errText(err));
    } finally {
      save.classList.remove("busy");
      save.disabled = false;
    }
  });

  /* ---------- login guard + data ---------- */
  $("logout").addEventListener("click", async function () {
    if (window.sb) await sb.auth.signOut();
    location.href = "index.html";
  });

  function sampleData() {
    demo = true;
    cats = [{ id: "c1", name: "Bakes & Sweets" }];
    prods = [
      {
        id: "p1",
        name: "Chockie",
        category_id: "c1",
        price: 67,
        stock: 24,
        variant: "Chocolate chip",
        image_url: null,
      },
      {
        id: "p2",
        name: "Hearkie",
        category_id: "c1",
        price: 50,
        stock: 12,
        variant: null,
        image_url: null,
      },
      {
        id: "p3",
        name: "Pinkie",
        category_id: "c1",
        price: 70,
        stock: 0,
        variant: "Strawberry",
        image_url: null,
      },
    ];
    $("demoNote").hidden = false;
  }

  function finish() {
    renderOpen();
    renderWhere();
    renderProducts();
    if (noShop) {
      $("noShopNote").hidden = false;
      $("editBtn").disabled = true;
      $("editBtn").style.opacity = 0.45;
    }
  }

  (async function () {
    if (!window.sb) {
      setName("My Shop");
      sampleData();
      finish();
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
      .select(
        "id, name, is_open, logo_url, location, day_from, day_to, open_time, close_time",
      )
      .eq("owner_id", user.id)
      .maybeSingle();
    if (b.error)
      b = await sb
        .from("businesses")
        .select("id, name, is_open")
        .eq("owner_id", user.id)
        .maybeSingle(); // new columns not added yet
    biz = b.data || null;
    setName(
      (biz && biz.name) || (prof.data && prof.data.full_name) || "My Shop",
    );
    if (!biz) {
      noShop = true;
      finish();
      return;
    }
    if (biz.logo_url) {
      var av = $("shopAvatar");
      av.style.backgroundImage = 'url("' + biz.logo_url + '")';
      av.textContent = "";
    }
    isOpen = biz.is_open !== false;
    where = {
      location: biz.location || "",
      day_from: biz.day_from == null ? null : +biz.day_from,
      day_to: biz.day_to == null ? null : +biz.day_to,
      open_time: biz.open_time || "",
      close_time: biz.close_time || "",
    };

    var c = await sb
      .from("product_categories")
      .select("id, name")
      .eq("business_id", biz.id)
      .order("name");
    var p = await sb
      .from("products")
      .select(
        "id, name, price, stock, variant, image_url, category_id, created_at",
      )
      .eq("business_id", biz.id)
      .order("created_at", { ascending: false });
    if (c.error || p.error) {
      console.warn("store tables:", c.error || p.error);
      sampleData();
      toast("Couldn't load your products yet: run my-store.sql in Supabase.");
    } else {
      cats = c.data || [];
      prods = p.data || [];
    }
    finish();
  })();
})();
