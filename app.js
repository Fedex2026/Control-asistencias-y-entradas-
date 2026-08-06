import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, notificationWebhookUrl } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

function togglePassword(inputId, buttonId) {
  const input = $(inputId);
  const button = $(buttonId);

  if (!input || !button) return;

  button.addEventListener("click", () => {
    const hidden = input.type === "password";

    input.type = hidden ? "text" : "password";
    button.textContent = hidden ? "🙈" : "👁";
    button.setAttribute(
      "aria-label",
      hidden ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    button.setAttribute(
      "title",
      hidden ? "Ocultar contraseña" : "Mostrar contraseña"
    );
  });
}

const state = {
  user: null,
  profile: null,
  activeShift: null,
  records: [],
  users: [],
  units: [],
  whatsappSettings: {
    number: "",
    autoOpen: false
  },
  unsubscribers: []
};

const els = {
  loginView: $("loginView"),
  appView: $("appView"),
  loginForm: $("loginForm"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),
  loginBtn: $("loginBtn"),
  logoutBtn: $("logoutBtn"),
  sidebar: $("sidebar"),
  menuBtn: $("menuBtn"),
  pageTitle: $("pageTitle"),
  pageSubtitle: $("pageSubtitle"),
  attendanceBtn: $("attendanceBtn"),
  myRecordsBtn: $("myRecordsBtn"),
  loadingModal: $("loadingModal"),
  loadingTitle: $("loadingTitle"),
  loadingText: $("loadingText"),
  toast: $("toast")
};

function showToast(message, type = "") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.className = "toast", 3500);
}

function showLoading(title, text = "No cierres esta ventana.") {
  $("loadingTitle").textContent = title;
  $("loadingText").textContent = text;
  els.loadingModal.classList.remove("hidden");
}

function hideLoading() {
  els.loadingModal.classList.add("hidden");
}

function clearListeners() {
  state.unsubscribers.forEach(unsub => {
    try { unsub(); } catch {}
  });
  state.unsubscribers = [];
}

function isAdmin() {
  const rol = String(state.profile?.rol || state.profile?.role || "").trim().toLowerCase();
  return rol === "administrador" || rol === "admin";
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "--/--/----";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: true
  }).format(date);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
}

function durationMs(record) {
  const start = toDate(record.entryAt);
  const end = toDate(record.exitAt);
  if (!start) return 0;
  return Math.max(0, (end || new Date()).getTime() - start.getTime());
}

function formatDuration(ms) {
  if (!ms) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function mapsUrl(location) {
  if (!location?.lat || !location?.lng) return "";
  return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
}

function locationLabel(location) {
  if (!location) return "No disponible";
  if (location.address) return location.address;
  if (location.lat && location.lng) return `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
  return "No disponible";
}

async function getPosition() {
  if (!navigator.geolocation) throw new Error("Este dispositivo no permite geolocalización.");

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        capturedAt: new Date().toISOString()
      }),
      err => {
        const messages = {
          1: "Permiso de ubicación rechazado. Actívalo en el navegador.",
          2: "No fue posible obtener la ubicación.",
          3: "La ubicación tardó demasiado. Intenta nuevamente."
        };
        reject(new Error(messages[err.code] || "Error de ubicación."));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

async function reverseGeocode(location) {
  // OpenStreetMap/Nominatim. Si falla, el registro se conserva con coordenadas.
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`;
    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!response.ok) return location;
    const data = await response.json();
    return { ...location, address: data.display_name || "" };
  } catch {
    return location;
  }
}

function buildWhatsAppMessage(type, record, profile) {
  const isEntry = type === "entry";
  const at = isEntry ? record.entryAtClient : record.exitAtClient;
  const location = isEntry ? record.entryLocation : record.exitLocation;
  const icon = isEntry ? "🟢" : "🔴";
  const title = isEntry ? "ENTRADA REGISTRADA" : "SALIDA REGISTRADA";
  const lines = [
    `${icon} *${title}*`,
    `Operador: ${profile.nombre || profile.name || "Sin nombre"}`,
    `Unidad: ${profile.unidad || profile.unit || "Sin unidad"}`,
    `Fecha: ${formatDate(at)}`,
    `Hora: ${formatTime(at)}`
  ];
  if (!isEntry) lines.push(`Tiempo trabajado: ${formatDuration(durationMs(record))}`);
  const url = mapsUrl(location);
  if (url) lines.push(`📍 Ubicación: ${url}`);
  return lines.join("\n");
}

async function loadWhatsAppSettings() {
  try {
    const settingsSnap = await getDoc(doc(db, "configuracion", "whatsapp"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    state.whatsappSettings = {
      number: String(settings.number || "").replace(/\D/g, ""),
      autoOpen: Boolean(settings.autoOpen)
    };
  } catch (error) {
    console.warn("No se pudo cargar la configuración de WhatsApp:", error);
    state.whatsappSettings = {
      number: "",
      autoOpen: false
    };
  }
}

function prepareWhatsAppWindow() {
  if (!state.whatsappSettings.autoOpen) return null;

  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

async function notifyWhatsApp(type, record, popupWindow = null) {
  const message = buildWhatsAppMessage(type, record, state.profile);
  const number = state.whatsappSettings.number;

  if (notificationWebhookUrl) {
    try {
      const response = await fetch(notificationWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message,
          recordId: record.id,
          operatorUid: state.user.uid
        })
      });

      if (!response.ok) throw new Error("Webhook rechazó el aviso.");

      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }

      return;
    } catch (error) {
      console.warn("Webhook WhatsApp:", error);
    }
  }

  if (!state.whatsappSettings.autoOpen) {
    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }
    return;
  }

  const target = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (popupWindow && !popupWindow.closed) {
    popupWindow.location.href = target;
  } else {
    window.location.href = target;
  }
}

async function loadProfile(uid) {
  let snap = await getDoc(doc(db, "usuarios", uid));

  if (!snap.exists()) {
    try {
      const legacySnap = await getDoc(doc(db, uid, uid));
      if (legacySnap.exists()) snap = legacySnap;
    } catch (error) {
      console.warn("No se pudo revisar la ruta alternativa del perfil:", error);
    }
  }

  if (!snap.exists()) {
    throw new Error("Tu usuario no tiene perfil en Firestore. Verifica usuarios/{UID}.");
  }

  const data = snap.data();
  state.profile = {
    id: snap.id,
    ...data,
    nombre: data.nombre || data.name || "",
    correo: data.correo || data.email || state.user?.email || "",
    rol: String(data.rol || data.role || "operador").trim().toLowerCase(),
    unidad: data.unidad || data.unit || "",
    telefono: data.telefono || data.phone || "",
    activo: data.activo ?? data.active ?? true,
    autorizado: data.autorizado ?? data.authorized ?? true,
    fotoUrl: data.fotoUrl || data.photoUrl || ""
  };
}

function applyProfileToUI() {
  const p = state.profile;
  $("topUserName").textContent = p.nombre || state.user.email;
  $("topUserRole").textContent = isAdmin() ? "Administrador" : "Operador";
  $("topAvatar").textContent = (p.nombre || "U").slice(0, 1).toUpperCase();

  $("operatorName").textContent = p.nombre || "Operador";
  $("operatorUnit").textContent = `Unidad: ${p.unidad || "--"}`;
  $("operatorAvatar").textContent = (p.nombre || "OP").slice(0, 2).toUpperCase();

  if (p.fotoUrl) {
    $("operatorAvatar").style.backgroundImage = `url("${p.fotoUrl}")`;
    $("operatorAvatar").textContent = "";
  }

  $("profileName").value = p.nombre || "";
  $("profileUnit").value = p.unidad || "";
  $("profilePhone").value = p.telefono || "";
  $("profilePhoto").value = p.fotoUrl || "";

  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin());
  });

  $("operatorDashboard").classList.toggle("hidden", isAdmin());
  $("adminDashboard").classList.toggle("hidden", !isAdmin());
}

function setupRealtimeData() {
  clearListeners();

  const recordsRef = collection(db, "registros");
  const recordsQuery = isAdmin()
    ? query(recordsRef, orderBy("entryAt", "desc"), limit(500))
    : query(
        recordsRef,
        where("operatorUid", "==", state.user.uid),
        limit(200)
      );

  state.unsubscribers.push(onSnapshot(recordsQuery, snap => {
    state.records = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aDate = toDate(a.entryAt) || toDate(a.entryAtClient) || new Date(0);
        const bDate = toDate(b.entryAt) || toDate(b.entryAtClient) || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    state.activeShift =
      state.records.find(r => r.status === "active") || null;

    renderAll();
  }, error => {
    console.error(error);
    showToast(
      "No se pudieron leer los registros. Revisa las reglas de Firestore.",
      "error"
    );
  }));

  if (isAdmin()) {
    state.unsubscribers.push(onSnapshot(collection(db, "usuarios"), snap => {
      state.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderOperators();
      renderAdminStats();
    }));

    state.unsubscribers.push(onSnapshot(collection(db, "unidades"), snap => {
      state.units = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderUnits();
    }));
  }
}

function renderAll() {
  renderOperatorStatus();
  renderAdminStats();
  renderTodayTable();
  renderRecordsTable();
  renderReportsSummary();
}

function renderOperatorStatus() {
  if (isAdmin()) return;
  const active = state.activeShift;
  const last = state.records[0];

  $("currentStatusBox").className = `status-box ${active ? "status-on" : "status-off"}`;
  $("currentStatusText").textContent = active ? "DENTRO DE TURNO" : "FUERA DE TURNO";
  $("currentStatusDetail").textContent = active ? "Entrada registrada" : "Sin entrada abierta";

  els.attendanceBtn.textContent = active ? "↩ MARCAR SALIDA" : "↪ MARCAR ENTRADA";
  els.attendanceBtn.className = `btn ${active ? "btn-exit" : "btn-entry"}`;

  if (!last) {
    $("lastRecordType").textContent = "Sin registros";
    $("lastRecordLocation").textContent = "Ubicación no disponible";
    $("lastRecordTime").textContent = "--:--";
    $("lastRecordDate").textContent = "--/--/----";
    return;
  }

  const useExit = Boolean(last.exitAt);
  const at = useExit ? last.exitAt : last.entryAt;
  const loc = useExit ? last.exitLocation : last.entryLocation;
  $("lastRecordType").textContent = useExit ? "Salida" : "Entrada";
  $("lastRecordLocation").textContent = locationLabel(loc);
  $("lastRecordTime").textContent = formatTime(at);
  $("lastRecordDate").textContent = formatDate(at);
  $("lastRecordIcon").textContent = useExit ? "↩" : "↪";
  $("lastRecordIcon").style.background = useExit ? "#e53632" : "#1f8f42";
}

function recordRow(record) {
  const entryMap = mapsUrl(record.entryLocation);
  const exitMap = mapsUrl(record.exitLocation);
  const completed = record.status === "completed";
  return `
    <tr>
      <td><strong>${escapeHtml(record.operatorName || "Sin nombre")}</strong><span class="td-muted">${escapeHtml(record.operatorEmail || "")}</span></td>
      <td>${escapeHtml(record.unit || "—")}</td>
      <td><strong>${formatTime(record.entryAt)}</strong><span class="td-muted">${formatDate(record.entryAt)}</span></td>
      <td>${entryMap ? `<span>${escapeHtml(locationLabel(record.entryLocation))}</span><a class="map-link" href="${entryMap}" target="_blank" rel="noopener">Ver mapa</a>` : "—"}</td>
      <td>${record.exitAt ? `<strong>${formatTime(record.exitAt)}</strong><span class="td-muted">${formatDate(record.exitAt)}</span>` : "—"}</td>
      <td>${exitMap ? `<span>${escapeHtml(locationLabel(record.exitLocation))}</span><a class="map-link" href="${exitMap}" target="_blank" rel="noopener">Ver mapa</a>` : "—"}</td>
      <td>${formatDuration(durationMs(record))}</td>
      <td><span class="status-pill ${completed ? "completed" : "active"}">${completed ? "Completado" : "En turno"}</span></td>
    </tr>
  `;
}

function renderTodayTable() {
  if (!isAdmin()) return;
  const today = localDateKey();
  const rows = state.records.filter(r => r.dateKey === today);
  $("todayTableBody").innerHTML = rows.length
    ? rows.map(recordRow).join("")
    : `<tr><td class="empty-row" colspan="8">No hay registros hoy.</td></tr>`;
}

function filteredRecords() {
  let rows = [...state.records];
  const from = $("filterDateFrom").value;
  const to = $("filterDateTo").value;
  const status = $("filterStatus").value;

  if (from) rows = rows.filter(r => r.dateKey >= from);
  if (to) rows = rows.filter(r => r.dateKey <= to);
  if (status) rows = rows.filter(r => r.status === status);
  return rows;
}

function renderRecordsTable() {
  const rows = filteredRecords();
  $("recordsTableBody").innerHTML = rows.length
    ? rows.map(recordRow).join("")
    : `<tr><td class="empty-row" colspan="8">No se encontraron registros.</td></tr>`;
}

function renderAdminStats() {
  if (!isAdmin()) return;
  const today = localDateKey();
  const todayRows = state.records.filter(r => r.dateKey === today);
  $("statOperators").textContent = state.users.filter(u => {
    const rol = String(u.rol || u.role || "").trim().toLowerCase();
    return rol === "operador" || rol === "operator";
  }).length;
  $("statEntries").textContent = todayRows.length;
  $("statExits").textContent = todayRows.filter(r => r.exitAt).length;
  $("statActive").textContent = state.records.filter(r => r.status === "active").length;
}

function renderOperators() {
  if (!isAdmin()) return;
  const operators = state.users.filter(u => {
    const rol = String(u.rol || u.role || "").trim().toLowerCase();
    return rol === "operador" || rol === "operator";
  });
  $("operatorsGrid").innerHTML = operators.length ? operators.map(u => `
    <article class="person-card">
      <h4>${escapeHtml(u.nombre || u.name || "Sin nombre")}</h4>
      <p>${escapeHtml(u.correo || u.email || "")}</p>
      <p>Unidad: <b>${escapeHtml(u.unidad || u.unit || "Sin asignar")}</b></p>
      <p>Teléfono: ${escapeHtml(u.telefono || u.phone || "—")}</p>
      <span class="status-pill completed badge">Operador</span>
    </article>
  `).join("") : `<p>No hay operadores.</p>`;
}

function renderUnits() {
  if (!isAdmin()) return;
  $("unitsGrid").innerHTML = state.units.length ? state.units.map(u => `
    <article class="unit-card">
      <h4>Unidad ${escapeHtml(u.number || "—")}</h4>
      <p>${escapeHtml(u.type || "Sin tipo")}</p>
      <p>Placas: <b>${escapeHtml(u.plates || "—")}</b></p>
      <p>Capacidad: ${escapeHtml(u.capacity || "—")}</p>
    </article>
  `).join("") : `<p>No hay unidades.</p>`;
}

function renderReportsSummary() {
  if (!isAdmin()) return;
  const from = $("reportFrom").value;
  const to = $("reportTo").value;
  let rows = [...state.records];
  if (from) rows = rows.filter(r => r.dateKey >= from);
  if (to) rows = rows.filter(r => r.dateKey <= to);
  const totalMs = rows.reduce((sum, r) => sum + (r.exitAt ? durationMs(r) : 0), 0);
  $("reportTotal").textContent = rows.length;
  $("reportHours").textContent = `${(totalMs / 3600000).toFixed(1)} h`;
  $("reportOpen").textContent = rows.filter(r => r.status === "active").length;
}

async function registerEntry(popupWindow = null) {
  showLoading(
    "Obteniendo ubicación",
    "Autoriza el acceso a la ubicación precisa."
  );

  els.attendanceBtn.disabled = true;

  try {
    let location = await getPosition();
    location = await reverseGeocode(location);

    const now = new Date();
    const payload = {
      operatorUid: state.user.uid,
      operatorName: state.profile.nombre || "",
      operatorEmail: state.user.email || state.profile.correo || "",
      unit: state.profile.unidad || "",
      dateKey: localDateKey(now),
      status: "active",
      entryAt: serverTimestamp(),
      entryAtClient: now.toISOString(),
      entryLocation: location,
      exitAt: null,
      exitAtClient: null,
      exitLocation: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const ref = await addDoc(collection(db, "registros"), payload);

    const record = {
      id: ref.id,
      ...payload,
      entryAt: now
    };

    // Actualización inmediata de la pantalla, sin esperar al listener.
    state.records = [
      record,
      ...state.records.filter(item => item.id !== record.id)
    ];
    state.activeShift = record;
    renderAll();

    await notifyWhatsApp("entry", record, popupWindow);

    showToast("Entrada registrada correctamente.", "success");
  } catch (error) {
    console.error(error);

    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }

    showToast(
      error.message || "No se pudo registrar la entrada.",
      "error"
    );
  } finally {
    els.attendanceBtn.disabled = false;
    hideLoading();
  }
}

async function registerExit(popupWindow = null) {
  if (!state.activeShift) {
    if (popupWindow && !popupWindow.closed) popupWindow.close();
    return;
  }

  showLoading(
    "Registrando salida",
    "Obteniendo ubicación precisa."
  );

  els.attendanceBtn.disabled = true;

  try {
    let location = await getPosition();
    location = await reverseGeocode(location);

    const now = new Date();
    const activeId = state.activeShift.id;

    await updateDoc(doc(db, "registros", activeId), {
      status: "completed",
      exitAt: serverTimestamp(),
      exitAtClient: now.toISOString(),
      exitLocation: location,
      updatedAt: serverTimestamp()
    });

    const record = {
      ...state.activeShift,
      exitAt: now,
      exitAtClient: now.toISOString(),
      exitLocation: location,
      status: "completed"
    };

    // Actualización inmediata de la pantalla.
    state.records = state.records.map(item =>
      item.id === activeId ? record : item
    );
    state.activeShift = null;
    renderAll();

    await notifyWhatsApp("exit", record, popupWindow);

    showToast("Salida registrada correctamente.", "success");
  } catch (error) {
    console.error(error);

    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }

    showToast(
      error.message || "No se pudo registrar la salida.",
      "error"
    );
  } finally {
    els.attendanceBtn.disabled = false;
    hideLoading();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function navigate(section) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  $(`section-${section}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add("active");
  const titles = {
    dashboard: ["Dashboard", "Control de entrada y salida de personal"],
    registros: ["Registros", "Historial de entradas y salidas"],
    operadores: ["Operadores", "Administración de personal"],
    unidades: ["Unidades", "Catálogo de vehículos"],
    reportes: ["Reportes", "Exportación y resumen"],
    perfil: ["Perfil", "Datos del usuario"]
  };
  els.pageTitle.textContent = titles[section]?.[0] || "Dashboard";
  els.pageSubtitle.textContent = titles[section]?.[1] || "";
  els.sidebar.classList.remove("open");
}

async function saveProfile(event) {
  event.preventDefault();
  try {
    const updates = {
      nombre: $("profileName").value.trim(),
      unidad: $("profileUnit").value.trim(),
      telefono: $("profilePhone").value.trim(),
      fotoUrl: $("profilePhoto").value.trim(),
      updatedAt: serverTimestamp()
    };
    await updateDoc(doc(db, "usuarios", state.user.uid), updates);
    state.profile = { ...state.profile, ...updates };
    applyProfileToUI();
    showToast("Perfil actualizado.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveNewOperator(event) {
  event.preventDefault();
  const uid = $("newOperatorUid").value.trim();
  try {
    await setDoc(doc(db, "usuarios", uid), {
      nombre: $("newOperatorName").value.trim(),
      correo: $("newOperatorEmail").value.trim(),
      unidad: $("newOperatorUnit").value.trim(),
      telefono: $("newOperatorPhone").value.trim(),
      rol: "operador",
      activo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    $("operatorModal").classList.add("hidden");
    event.target.reset();
    showToast("Operador guardado.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveNewUnit(event) {
  event.preventDefault();
  try {
    await addDoc(collection(db, "unidades"), {
      number: $("unitNumber").value.trim(),
      type: $("unitType").value.trim(),
      plates: $("unitPlates").value.trim(),
      capacity: $("unitCapacity").value.trim(),
      createdAt: serverTimestamp()
    });
    $("unitModal").classList.add("hidden");
    event.target.reset();
    showToast("Unidad guardada.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveWhatsAppSettings(event) {
  event.preventDefault();
  try {
    const number = $("whatsappNumber").value.trim();
    const autoOpen = $("whatsappAutoOpen").checked;

    await setDoc(doc(db, "configuracion", "whatsapp"), {
      number,
      autoOpen,
      updatedAt: serverTimestamp()
    }, { merge: true });

    state.whatsappSettings = {
      number: number.replace(/\D/g, ""),
      autoOpen
    };
    $("whatsappModal").classList.add("hidden");
    showToast("Configuración guardada.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function openWhatsAppSettings() {
  await loadWhatsAppSettings();

  $("whatsappNumber").value =
    state.whatsappSettings.number || "";

  $("whatsappAutoOpen").checked =
    state.whatsappSettings.autoOpen;

  $("whatsappModal").classList.remove("hidden");
}

function downloadCsv() {
  const from = $("reportFrom").value;
  const to = $("reportTo").value;
  let rows = [...state.records];
  if (from) rows = rows.filter(r => r.dateKey >= from);
  if (to) rows = rows.filter(r => r.dateKey <= to);

  const headers = [
    "Operador", "Correo", "Unidad", "Fecha entrada", "Hora entrada",
    "Latitud entrada", "Longitud entrada", "Mapa entrada",
    "Fecha salida", "Hora salida", "Latitud salida", "Longitud salida",
    "Mapa salida", "Horas trabajadas", "Estado"
  ];

  const csvRows = rows.map(r => [
    r.operatorName || "", r.operatorEmail || "", r.unit || "",
    formatDate(r.entryAt), formatTime(r.entryAt),
    r.entryLocation?.lat || "", r.entryLocation?.lng || "", mapsUrl(r.entryLocation),
    r.exitAt ? formatDate(r.exitAt) : "", r.exitAt ? formatTime(r.exitAt) : "",
    r.exitLocation?.lat || "", r.exitLocation?.lng || "", mapsUrl(r.exitLocation),
    (durationMs(r) / 3600000).toFixed(2),
    r.status === "completed" ? "Completado" : "En turno"
  ]);

  const csv = [headers, ...csvRows]
    .map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `registros_${from || "inicio"}_${to || "hoy"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


async function registerOperator(event) {
  event.preventDefault();

  const nombre = $("registerName")?.value.trim() || "";
  const correo = $("registerEmail")?.value.trim() || "";
  const telefono = $("registerPhone")?.value.trim() || "";
  const unidad = $("registerUnit")?.value.trim() || "";
  const password = $("registerPassword")?.value || "";
  const passwordConfirm = $("registerPasswordConfirm")?.value || "";
  const registerBtn = $("registerBtn");

  if (!nombre || !correo || !telefono || !unidad || !password || !passwordConfirm) {
    showToast("Completa todos los campos.", "error");
    return;
  }

  if (password.length < 6) {
    showToast("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }

  if (password !== passwordConfirm) {
    showToast("Las contraseñas no coinciden.", "error");
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = "Creando cuenta...";

  let credential = null;

  try {
    credential = await createUserWithEmailAndPassword(auth, correo, password);

    await setDoc(doc(db, "usuarios", credential.user.uid), {
      nombre,
      correo,
      telefono,
      unidad,
      rol: "operador",
      activo: false,
      autorizado: false,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    });

    await signOut(auth);

    $("registerForm").reset();
    $("registerModal").classList.add("hidden");
    $("loginEmail").value = correo;

    showToast(
      "Cuenta creada. Espera la autorización del administrador.",
      "success"
    );
  } catch (error) {
    console.error(error);

    // Si Authentication creó la cuenta pero Firestore falló,
    // cerramos sesión para evitar que quede abierta.
    try {
      if (credential?.user) await signOut(auth);
    } catch {}

    const messages = {
      "auth/email-already-in-use": "Ese correo ya está registrado.",
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/weak-password": "La contraseña es demasiado débil.",
      "auth/network-request-failed": "No fue posible conectarse con Firebase."
    };

    showToast(
      messages[error.code] || error.message || "No se pudo crear la cuenta.",
      "error"
    );
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Crear cuenta";
  }
}

async function recoverPassword() {
  const correo = els.loginEmail.value.trim();

  if (!correo) {
    showToast("Escribe primero tu correo.", "error");
    els.loginEmail.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, correo);
    showToast(
      "Se envió un enlace para cambiar tu contraseña.",
      "success"
    );
  } catch (error) {
    console.error(error);

    const messages = {
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/user-not-found": "No existe una cuenta con ese correo.",
      "auth/network-request-failed": "No fue posible conectarse con Firebase."
    };

    showToast(
      messages[error.code] ||
      "No fue posible enviar el correo de recuperación.",
      "error"
    );
  }
}

els.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  els.loginBtn.disabled = true;
  els.loginBtn.textContent = "Ingresando...";
  try {
    await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value);
  } catch (error) {
    console.error(error);

    const messages = {
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/user-disabled": "Esta cuenta está desactivada.",
      "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
      "auth/network-request-failed": "No fue posible conectarse con Firebase."
    };

    showToast(
      messages[error.code] || "No se pudo iniciar sesión.",
      "error"
    );
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = "Ingresar";
  }
});


togglePassword("loginPassword", "toggleLoginPassword");
togglePassword("registerPassword", "toggleRegisterPassword");
togglePassword("registerPasswordConfirm", "toggleRegisterPasswordConfirm");

$("showRegisterBtn")?.addEventListener("click", () => {
  $("registerModal")?.classList.remove("hidden");
});

$("closeRegisterModal")?.addEventListener("click", () => {
  $("registerModal")?.classList.add("hidden");
});

$("registerForm")?.addEventListener("submit", registerOperator);

$("forgotPasswordBtn")?.addEventListener("click", recoverPassword);

els.logoutBtn.addEventListener("click", () => signOut(auth));
els.menuBtn.addEventListener("click", () => els.sidebar.classList.toggle("open"));
els.attendanceBtn.addEventListener("click", () => {
  const popupWindow = prepareWhatsAppWindow();

  if (state.activeShift) {
    registerExit(popupWindow);
  } else {
    registerEntry(popupWindow);
  }
});
els.myRecordsBtn.addEventListener("click", () => navigate("registros"));
$("refreshBtn").addEventListener("click", renderAll);
$("applyFiltersBtn").addEventListener("click", renderRecordsTable);
$("profileForm").addEventListener("submit", saveProfile);
$("newOperatorBtn").addEventListener("click", () => $("operatorModal").classList.remove("hidden"));
$("newUnitBtn").addEventListener("click", () => $("unitModal").classList.remove("hidden"));
$("operatorForm").addEventListener("submit", saveNewOperator);
$("unitForm").addEventListener("submit", saveNewUnit);
$("whatsappSettingsBtn").addEventListener("click", openWhatsAppSettings);
$("whatsappForm").addEventListener("submit", saveWhatsAppSettings);
$("downloadCsvBtn").addEventListener("click", downloadCsv);
$("reportFrom").addEventListener("change", renderReportsSummary);
$("reportTo").addEventListener("change", renderReportsSummary);

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.section));
});
document.querySelectorAll(".close-modal").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".modal").classList.add("hidden"));
});
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal && modal.id !== "loadingModal") modal.classList.add("hidden");
  });
});

onAuthStateChanged(auth, async user => {
  clearListeners();
  state.user = user;
  state.profile = null;
  state.records = [];
  state.users = [];
  state.units = [];

  if (!user) {
    els.appView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
    return;
  }

  showLoading("Cargando sistema", "Validando perfil y permisos.");
  try {
    await loadProfile(user.uid);

    if (
      !isAdmin()
      && state.profile.rol === "operador"
      && (
        state.profile.activo !== true
        || state.profile.autorizado === false
      )
    ) {
      await signOut(auth);
      throw new Error(
        "Tu cuenta está pendiente de autorización por el administrador."
      );
    }

    await loadWhatsAppSettings();
    applyProfileToUI();
    setupRealtimeData();
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    navigate("dashboard");
  } catch (error) {
    console.error(error);
    await signOut(auth);
    showToast(error.message || "No se pudo iniciar el sistema.", "error");
  } finally {
    hideLoading();
  }
});
