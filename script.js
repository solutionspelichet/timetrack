// Version corrigée de votre script original avec Google Sheets
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

// Gestion des onglets
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("bg-blue-200"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

    button.classList.add("bg-blue-200");
    const tabId = button.getAttribute("data-tab");
    document.getElementById(tabId).classList.remove("hidden");

    if (tabId === "hebdo") loadWeeklyView();
    if (tabId === "calendrier") loadCalendarView();
  });
});

// Pointage début
document.getElementById("start").onclick = async () => {
  try {
    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];
    const manualStart = document.getElementById("manualStart").value;
    const startTime = manualStart || now.toTimeString().substring(0, 5);
    if (!manualStart) document.getElementById("manualStart").value = startTime;

    const res = await fetch("https://timetrack-api.onrender.com/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: isoDate, start: startTime }),
    });

    if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);

    const data = await res.json();
    localStorage.setItem("row", data.row);
    showToast(`Début enregistré à ${startTime}`, 'success');
  } catch (error) {
    console.error('Erreur:', error);
    showToast('Erreur lors de l\'enregistrement du début', 'error');
  }
};

// Pointage fin
document.getElementById("stop").onclick = () => {
  const now = new Date();
  const time = now.toTimeString().substring(0, 5);
  document.getElementById("manualEnd").value = time;
  showToast("Heure de fin prête à enregistrer !");
};

// Enregistrement
document.getElementById("submit").onclick = async () => {
  try {
    const row = localStorage.getItem("row");
    const end = document.getElementById("manualEnd").value;
    const pause = document.getElementById("pause").value || 60;
    const note = document.getElementById("note").value || "";

    if (!row) {
      showToast('Veuillez d\'abord démarrer le pointage', 'error');
      return;
    }

    const res = await fetch("https://timetrack-api.onrender.com/api/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row, end, pause, note }),
    });

    if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);

    showToast(`Fin de journée enregistrée à ${end}`, 'success');
    document.getElementById("note").value = "";
    localStorage.removeItem("row");
  } catch (error) {
    console.error('Erreur:', error);
    showToast('Erreur lors de l\'enregistrement de la fin', 'error');
  }
};

// Vue hebdomadaire
async function loadWeeklyView() {
  try {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 6);
    const formattedStart = startDate.toISOString().split("T")[0];
    const formattedEnd = today.toISOString().split("T")[0];

    const res = await fetch(`https://timetrack-api.onrender.com/api/range?start=${formattedStart}&end=${formattedEnd}`);
    
    if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
    
    const data = await res.json();
    const tbody = document.getElementById("hebdo-body");
    tbody.innerHTML = "";

    let totalMinutes = 0;

    data.forEach(row => {
      const [date, debut, fin, pause, durée, note] = row;
      const tr = document.createElement("tr");
      tr.className = "hover:bg-gray-50";

      // Date avec nom du jour
      const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' });
      const formattedDate = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      
      const tdDate = document.createElement("td");
      tdDate.innerHTML = `<div class="font-medium">${dayName}</div><div class="text-xs text-gray-500">${formattedDate}</div>`;
      tdDate.className = "p-2 border";
      tr.appendChild(tdDate);

      const tdStart = document.createElement("td");
      const inputStart = document.createElement("input");
      inputStart.type = "time";
      inputStart.value = debut || "";
      inputStart.className = "w-full border rounded px-2 py-1";
      inputStart.onchange = () => updateCell(date, inputStart.value, null, pause, tr);
      tdStart.appendChild(inputStart);
      tdStart.className = "p-2 border";
      tr.appendChild(tdStart);

      const tdEnd = document.createElement("td");
      const inputEnd = document.createElement("input");
      inputEnd.type = "time";
      inputEnd.value = fin || "";
      inputEnd.className = "w-full border rounded px-2 py-1";
      inputEnd.onchange = () => updateCell(date, null, inputEnd.value, pause, tr);
      tdEnd.appendChild(inputEnd);
      tdEnd.className = "p-2 border";
      tr.appendChild(tdEnd);

      const tdPause = document.createElement("td");
      tdPause.textContent = pause || "60 min";
      tdPause.className = "p-2 border text-center";
      tr.appendChild(tdPause);

      const tdDurée = document.createElement("td");
      const durationMinutes = timeDiffInMinutes(debut, fin) - parseInt(pause || 60);
      totalMinutes += durationMinutes > 0 ? durationMinutes : 0;
      tdDurée.textContent = formatMinutes(durationMinutes);
      tdDurée.className = "p-2 border text-center font-mono";
      tdDurée.dataset.durationCell = "true";
      tr.appendChild(tdDurée);

      const tdNote = document.createElement("td");
      tdNote.textContent = note || "";
      tdNote.className = "p-2 border text-xs";
      tr.appendChild(tdNote);

      tbody.appendChild(tr);
    });

    // Total
    const totalRow = document.createElement("tr");
    totalRow.className = "bg-gray-100 font-bold";
    totalRow.innerHTML = `
      <td colspan="4" class="p-2 border text-right">Total semaine</td>
      <td class="p-2 border text-center font-mono">${formatMinutes(totalMinutes)}</td>
      <td class="p-2 border"></td>
    `;
    tbody.appendChild(totalRow);
  } catch (error) {
    console.error('Erreur lors du chargement de la vue hebdomadaire:', error);
    showToast('Erreur lors du chargement des données', 'error');
  }
}

// Mise à jour ligne hebdo
async function updateCell(date, newStart, newEnd, pause, rowElement) {
  try {
    const rowInputs = rowElement.querySelectorAll("input[type='time']");
    const start = newStart || rowInputs[0].value;
    const end = newEnd || rowInputs[1].value;
    const pauseMinutes = parseInt((pause || "60").toString().replace(" min", ""));

    const res = await fetch("https://timetrack-api.onrender.com/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, start, end, pause: pauseMinutes }),
    });

    if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);

    const durationCell = rowElement.querySelector("[data-duration-cell]");
    const minutes = timeDiffInMinutes(start, end) - pauseMinutes;
    durationCell.textContent = formatMinutes(minutes);
    showToast('Mise à jour effectuée', 'success');
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    showToast('Erreur lors de la mise à jour', 'error');
  }
}

// Vue calendrier
async function loadCalendarView() {
  try {
    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    const year = calendarYear;
    const month = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const title = firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    document.getElementById("calendar-title").textContent = title.charAt(0).toUpperCase() + title.slice(1);

    const start = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
    const end = `${year}-${(month + 1).toString().padStart(2, '0')}-${totalDays}`;

    const res = await fetch(`https://timetrack-api.onrender.com/api/range?start=${start}&end=${end}`);
    
    if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
    
    const data = await res.json();

    const datesMap = new Map();
    data.forEach(row => {
      const [date, debut, fin, pause, duration, note] = row;
      const status = debut && fin ? "complet" : debut ? "partiel" : "absent";
      datesMap.set(date, { debut, fin, status, note, pause });
    });

    for (let i = 0; i < (startDayOfWeek === 0 ? 6 : startDayOfWeek - 1); i++) {
      const empty = document.createElement("div");
      grid.appendChild(empty);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const cell = document.createElement("div");
      const data = datesMap.get(dateStr);

      let bg = "bg-gray-200";
      if (data?.status === "complet") bg = "bg-green-300";
      else if (data?.status === "partiel") bg = "bg-yellow-300";

      cell.className = `${bg} p-2 rounded cursor-pointer hover:bg-opacity-70`;
      cell.textContent = d;
      cell.onclick = () => {
        openModal(dateStr, data?.debut, data?.fin, data?.status, data?.note || "", data?.pause || "60");
      };
      grid.appendChild(cell);
    }
  } catch (error) {
    console.error('Erreur lors du chargement du calendrier:', error);
    showToast('Erreur lors du chargement du calendrier', 'error');
  }
}

// Navigation mois
document.getElementById("prev-month").onclick = () => {
  calendarMonth--;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  }
  loadCalendarView();
};

document.getElementById("next-month").onclick = () => {
  calendarMonth++;
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  loadCalendarView();
};

// Modal calendrier
function openModal(date, start = "", end = "", status = "", note = "", pause = "60") {
  document.getElementById("modal-date-label").textContent = date;
  document.getElementById("modal-start").value = start || "";
  document.getElementById("modal-end").value = end || "";
  document.getElementById("modal-pause").value = parseInt(pause) || 60;
  document.getElementById("modal-note").value = note || "";
  document.getElementById("calendar-modal").classList.remove("hidden");

  document.getElementById("modal-save").onclick = async () => {
    try {
      const newStart = document.getElementById("modal-start").value;
      const newEnd = document.getElementById("modal-end").value;
      const newPause = parseInt(document.getElementById("modal-pause").value) || 60;
      const newNote = document.getElementById("modal-note").value;

      const res = await fetch("https://timetrack-api.onrender.com/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          start: newStart,
          end: newEnd,
          pause: newPause,
          note: newNote
        }),
      });

      if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);

      showToast('Pointage mis à jour', 'success');
      closeModal();
      loadCalendarView();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      showToast('Erreur lors de la sauvegarde', 'error');
    }
  };

  document.getElementById("modal-cancel").onclick = closeModal;
}

function closeModal() {
  document.getElementById("calendar-modal").classList.add("hidden");
}

// Utilitaires
function timeDiffInMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatMinutes(minutes) {
  if (minutes <= 0 || isNaN(minutes)) return "00h00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}`;
}

// Système de toast amélioré
function showToast(message, type = 'success') {
  // Créer le toast s'il n'existe pas
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Gestion des erreurs réseau
function handleNetworkError(error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    showToast('Erreur de connexion. Vérifiez votre internet.', 'error');
  } else {
    showToast('Une erreur est survenue.', 'error');
  }
}

// Vérifier la connexion au démarrage
async function checkConnection() {
  try {
    const res = await fetch('https://timetrack-api.onrender.com/api/health');
    if (res.ok) {
      showToast('Connexion au serveur établie', 'success');
    }
  } catch (error) {
    showToast('Impossible de se connecter au serveur', 'error');
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  checkConnection();
  loadWeeklyView();
});