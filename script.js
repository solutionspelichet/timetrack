// Configuration et variables globales
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let currentTimer = null;
let startTime = null;

// Utilitaires de stockage local
const Storage = {
  get: (key) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Erreur lecture localStorage:', e);
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Erreur écriture localStorage:', e);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Erreur suppression localStorage:', e);
      return false;
    }
  }
};

// Gestion des données de pointage
const TimeData = {
  // Récupérer toutes les données
  getAll: () => Storage.get('timetrack_data') || {},
  
  // Sauvegarder toutes les données
  saveAll: (data) => Storage.set('timetrack_data', data),
  
  // Récupérer une journée spécifique
  getDay: (date) => {
    const data = TimeData.getAll();
    return data[date] || null;
  },
  
  // Sauvegarder une journée
  saveDay: (date, dayData) => {
    const data = TimeData.getAll();
    data[date] = dayData;
    return TimeData.saveAll(data);
  },
  
  // Supprimer une journée
  deleteDay: (date) => {
    const data = TimeData.getAll();
    delete data[date];
    return TimeData.saveAll(data);
  },
  
  // Récupérer une plage de dates
  getRange: (startDate, endDate) => {
    const data = TimeData.getAll();
    const result = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayData = data[dateStr];
      
      if (dayData) {
        const duration = calculateDuration(dayData.start, dayData.end, dayData.pause || 60);
        result.push([
          dateStr,
          dayData.start || '',
          dayData.end || '',
          (dayData.pause || 60) + ' min',
          formatMinutes(duration),
          dayData.note || ''
        ]);
      } else {
        result.push([dateStr, '', '', '60 min', '00h00', '']);
      }
    }
    
    return result;
  },
  
  // Effacer toutes les données
  clear: () => Storage.remove('timetrack_data')
};

// Utilitaires de notification
const Toast = {
  show: (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },
  
  success: (message) => Toast.show(message, 'success'),
  error: (message) => Toast.show(message, 'error')
};

// Gestion des onglets
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => {
      b.classList.remove("bg-blue-200");
      b.classList.add("bg-gray-200");
    });
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

    button.classList.remove("bg-gray-200");
    button.classList.add("bg-blue-200");
    const tabId = button.getAttribute("data-tab");
    document.getElementById(tabId).classList.remove("hidden");

    // Charger les données selon l'onglet
    switch(tabId) {
      case "hebdo":
        loadWeeklyView();
        break;
      case "calendrier":
        loadCalendarView();
        break;
      case "export":
        initExportTab();
        break;
    }
  });
});

// Gestion du pointage
document.getElementById("start").onclick = () => {
  const now = new Date();
  const isoDate = now.toISOString().split('T')[0];
  const manualStart = document.getElementById("manualStart").value;
  const startTimeValue = manualStart || now.toTimeString().substring(0, 5);
  
  if (!manualStart) {
    document.getElementById("manualStart").value = startTimeValue;
  }

  // Sauvegarder le début
  const existingData = TimeData.getDay(isoDate) || {};
  existingData.start = startTimeValue;
  existingData.date = isoDate;
  
  if (TimeData.saveDay(isoDate, existingData)) {
    Toast.success(`Début enregistré à ${startTimeValue}`);
    startTimer(startTimeValue);
  } else {
    Toast.error('Erreur lors de la sauvegarde');
  }
};

document.getElementById("stop").onclick = () => {
  const now = new Date();
  const time = now.toTimeString().substring(0, 5);
  document.getElementById("manualEnd").value = time;
  stopTimer();
  Toast.success("Heure de fin prête à enregistrer !");
};

document.getElementById("submit").onclick = () => {
  const now = new Date();
  const isoDate = now.toISOString().split('T')[0];
  const start = document.getElementById("manualStart").value;
  const end = document.getElementById("manualEnd").value;
  const pause = parseInt(document.getElementById("pause").value) || 60;
  const note = document.getElementById("note").value || "";

  if (!start || !end) {
    Toast.error('Veuillez renseigner les heures de début et fin');
    return;
  }

  const dayData = {
    date: isoDate,
    start: start,
    end: end,
    pause: pause,
    note: note
  };

  if (TimeData.saveDay(isoDate, dayData)) {
    Toast.success(`Journée enregistrée (${start} - ${end})`);
    
    // Réinitialiser le formulaire
    document.getElementById("note").value = "";
    stopTimer();
  } else {
    Toast.error('Erreur lors de la sauvegarde');
  }
};

// Minuteur en temps réel
function startTimer(startTimeValue) {
  startTime = startTimeValue;
  const display = document.getElementById('duration-display');
  const container = document.getElementById('current-duration');
  
  container.classList.remove('hidden');
  
  currentTimer = setInterval(() => {
    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5);
    const elapsed = timeDiffInMinutes(startTime, currentTime);
    display.textContent = formatMinutes(elapsed);
  }, 1000);
}

function stopTimer() {
  if (currentTimer) {
    clearInterval(currentTimer);
    currentTimer = null;
  }
  startTime = null;
  document.getElementById('current-duration').classList.add('hidden');
}

// Vue hebdomadaire
async function loadWeeklyView() {
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 6);
  const formattedStart = startDate.toISOString().split("T")[0];
  const formattedEnd = today.toISOString().split("T")[0];

  const data = TimeData.getRange(formattedStart, formattedEnd);
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

    // Heures de début et fin éditables
    const tdStart = document.createElement("td");
    const inputStart = document.createElement("input");
    inputStart.type = "time";
    inputStart.value = debut || "";
    inputStart.className = "w-full border rounded px-2 py-1";
    inputStart.onchange = () => updateWeeklyCell(date, inputStart.value, null, parseInt(pause) || 60, tr);
    tdStart.appendChild(inputStart);
    tdStart.className = "p-2 border";
    tr.appendChild(tdStart);

    const tdEnd = document.createElement("td");
    const inputEnd = document.createElement("input");
    inputEnd.type = "time";
    inputEnd.value = fin || "";
    inputEnd.className = "w-full border rounded px-2 py-1";
    inputEnd.onchange = () => updateWeeklyCell(date, null, inputEnd.value, parseInt(pause) || 60, tr);
    tdEnd.appendChild(inputEnd);
    tdEnd.className = "p-2 border";
    tr.appendChild(tdEnd);

    // Pause
    const tdPause = document.createElement("td");
    tdPause.textContent = pause || "60 min";
    tdPause.className = "p-2 border text-center";
    tr.appendChild(tdPause);

    // Durée
    const tdDurée = document.createElement("td");
    const durationMinutes = calculateDuration(debut, fin, parseInt(pause) || 60);
    totalMinutes += durationMinutes > 0 ? durationMinutes : 0;
    tdDurée.textContent = formatMinutes(durationMinutes);
    tdDurée.className = "p-2 border text-center font-mono";
    tdDurée.dataset.durationCell = "true";
    tr.appendChild(tdDurée);

    // Note
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
  
  // Mettre à jour l'affichage du total
  document.getElementById('weekly-total').textContent = formatMinutes(totalMinutes);
}

// Mise à jour d'une cellule hebdomadaire
function updateWeeklyCell(date, newStart, newEnd, pause, rowElement) {
  const rowInputs = rowElement.querySelectorAll("input[type='time']");
  const start = newStart || rowInputs[0].value;
  const end = newEnd || rowInputs[1].value;
  const pauseMinutes = pause || 60;

  const dayData = {
    date: date,
    start: start,
    end: end,
    pause: pauseMinutes,
    note: TimeData.getDay(date)?.note || ''
  };

  if (TimeData.saveDay(date, dayData)) {
    const durationCell = rowElement.querySelector("[data-duration-cell]");
    const minutes = calculateDuration(start