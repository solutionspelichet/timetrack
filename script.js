// =====================================
// TimeTrack PWA - Script Principal
// Version corrigée et optimisée
// =====================================

// Variables globales
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let currentTimer = null;
let startTime = null;

// =====================================
// UTILITAIRES DE STOCKAGE LOCAL
// =====================================

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

// =====================================
// GESTION DES DONNÉES
// =====================================

const TimeData = {
  getAll: () => Storage.get('timetrack_data') || {},
  
  saveAll: (data) => Storage.set('timetrack_data', data),
  
  getDay: (date) => {
    const data = TimeData.getAll();
    return data[date] || null;
  },
  
  saveDay: (date, dayData) => {
    const data = TimeData.getAll();
    data[date] = dayData;
    return TimeData.saveAll(data);
  },
  
  deleteDay: (date) => {
    const data = TimeData.getAll();
    delete data[date];
    return TimeData.saveAll(data);
  },
  
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
  
  clear: () => Storage.remove('timetrack_data')
};

// =====================================
// SYSTÈME DE NOTIFICATIONS
// =====================================

const Toast = {
  show: (message, type = 'success') => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
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

// =====================================
// FONCTIONS DE CALCUL
// =====================================

function calculateDuration(start, end, pauseMinutes = 60) {
  if (!start || !end) return 0;
  const minutes = timeDiffInMinutes(start, end) - pauseMinutes;
  return Math.max(0, minutes);
}

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

function parseDurationToMinutes(durationText) {
  if (!durationText || durationText === "00h00") return 0;
  const match = durationText.match(/(\d+)h(\d+)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    return hours * 60 + minutes;
  }
  return 0;
}

// =====================================
// GESTION DES ONGLETS
// =====================================

function initializeTabs() {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      // Désactiver tous les onglets
      document.querySelectorAll(".tab-button").forEach(b => {
        b.classList.remove("bg-blue-200");
        b.classList.add("bg-gray-200");
      });
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

      // Activer l'onglet sélectionné
      button.classList.remove("bg-gray-200");
      button.classList.add("bg-blue-200");
      const tabId = button.getAttribute("data-tab");
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.remove("hidden");
      }

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
}

// =====================================
// GESTION DU POINTAGE
// =====================================

function initializeTimeTracking() {
  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const submitBtn = document.getElementById("submit");

  if (startBtn) {
    startBtn.onclick = () => {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const manualStart = document.getElementById("manualStart");
      const startTimeValue = manualStart?.value || now.toTimeString().substring(0, 5);
      
      if (manualStart && !manualStart.value) {
        manualStart.value = startTimeValue;
      }

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
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      const now = new Date();
      const time = now.toTimeString().substring(0, 5);
      const manualEnd = document.getElementById("manualEnd");
      if (manualEnd) {
        manualEnd.value = time;
      }
      stopTimer();
      Toast.success("Heure de fin prête à enregistrer !");
    };
  }

  if (submitBtn) {
    submitBtn.onclick = () => {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const startInput = document.getElementById("manualStart");
      const endInput = document.getElementById("manualEnd");
      const pauseInput = document.getElementById("pause");
      const noteInput = document.getElementById("note");
      
      const start = startInput?.value;
      const end = endInput?.value;
      const pause = parseInt(pauseInput?.value) || 60;
      const note = noteInput?.value || "";

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
        
        if (noteInput) noteInput.value = "";
        stopTimer();
      } else {
        Toast.error('Erreur lors de la sauvegarde');
      }
    };
  }
}

// =====================================
// MINUTEUR EN TEMPS RÉEL
// =====================================

function startTimer(startTimeValue) {
  startTime = startTimeValue;
  const display = document.getElementById('duration-display');
  const container = document.getElementById('current-duration');
  
  if (container) container.classList.remove('hidden');
  
  currentTimer = setInterval(() => {
    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5);
    const elapsed = timeDiffInMinutes(startTime, currentTime);
    if (display) display.textContent = formatMinutes(elapsed);
  }, 1000);
}

function stopTimer() {
  if (currentTimer) {
    clearInterval(currentTimer);
    currentTimer = null;
  }
  startTime = null;
  const container = document.getElementById('current-duration');
  if (container) container.classList.add('hidden');
}

// =====================================
// VUE HEBDOMADAIRE
// =====================================

function loadWeeklyView() {
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 6);
  const formattedStart = startDate.toISOString().split("T")[0];
  const formattedEnd = today.toISOString().split("T")[0];

  const data = TimeData.getRange(formattedStart, formattedEnd);
  const tbody = document.getElementById("hebdo-body");
  
  if (!tbody) return;
  
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

    // Début
    const tdStart = document.createElement("td");
    const inputStart = document.createElement("input");
    inputStart.type = "time";
    inputStart.value = debut || "";
    inputStart.className = "w-full border rounded px-2 py-1";
    inputStart.onchange = () => updateWeeklyCell(date, inputStart.value, null, parseInt(pause) || 60, tr);
    tdStart.appendChild(inputStart);
    tdStart.className = "p-2 border";
    tr.appendChild(tdStart);

    // Fin
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
  const weeklyTotal = document.getElementById('weekly-total');
  if (weeklyTotal) {
    weeklyTotal.textContent = formatMinutes(totalMinutes);
  }
}

function updateWeeklyCell(date, newStart, newEnd, pause, rowElement) {
  const rowInputs = rowElement.querySelectorAll("input[type='time']");
  const start = newStart || rowInputs[0]?.value;
  const end = newEnd || rowInputs[1]?.value;
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
    if (durationCell) {
      const minutes = calculateDuration(start, end, pauseMinutes);
      durationCell.textContent = formatMinutes(minutes);
    }
    
    recalculateWeeklyTotal();
    Toast.success('Mise à jour effectuée');
  } else {
    Toast.error('Erreur lors de la mise à jour');
  }
}

function recalculateWeeklyTotal() {
  const tbody = document.getElementById("hebdo-body");
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll("tr:not(:last-child)");
  let totalMinutes = 0;

  rows.forEach(row => {
    const durationCell = row.querySelector("[data-duration-cell]");
    if (durationCell) {
      const durationText = durationCell.textContent;
      const minutes = parseDurationToMinutes(durationText);
      totalMinutes += minutes;
    }
  });

  const totalRow = tbody.querySelector("tr:last-child");
  if (totalRow) {
    const totalCell = totalRow.querySelector("td:nth-child(5)");
    if (totalCell) {
      totalCell.textContent = formatMinutes(totalMinutes);
    }
  }

  const weeklyTotalDisplay = document.getElementById('weekly-total');
  if (weeklyTotalDisplay) {
    weeklyTotalDisplay.textContent = formatMinutes(totalMinutes);
  }
}

// =====================================
// VUE CALENDRIER
// =====================================

function loadCalendarView() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  
  grid.innerHTML = "";

  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Lundi = 0

  const title = firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const titleElement = document.getElementById("calendar-title");
  if (titleElement) {
    titleElement.textContent = title.charAt(0).toUpperCase() + title.slice(1);
  }

  const start = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
  const end = `${year}-${(month + 1).toString().padStart(2, '0')}-${totalDays.toString().padStart(2, '0')}`;
  
  const data = TimeData.getRange(start, end);
  const datesMap = new Map();
  
  data.forEach(row => {
    const [date, debut, fin, pause, duration, note] = row;
    let status = "absent";
    if (debut && fin) status = "complet";
    else if (debut) status = "partiel";
    
    datesMap.set(date, { 
      debut, 
      fin, 
      status, 
      note, 
      pause: parseInt(pause) || 60,
      duration
    });
  });

  // Cases vides pour aligner le premier jour
  for (let i = 0; i < startDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "p-2";
    grid.appendChild(empty);
  }

  // Jours du mois
  const today = new Date().toISOString().split('T')[0];
  
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const cell = document.createElement("div");
    const dayData = datesMap.get(dateStr);

    let bg = "bg-gray-200";
    let textColor = "text-gray-700";
    
    if (dayData?.status === "complet") {
      bg = "bg-green-300";
      textColor = "text-green-800";
    } else if (dayData?.status === "partiel") {
      bg = "bg-yellow-300";
      textColor = "text-yellow-800";
    }
    
    if (dateStr === today) {
      bg += " ring-2 ring-blue-500";
    }

    cell.className = `${bg} ${textColor} p-2 rounded cursor-pointer hover:bg-opacity-70 transition-colors text-center relative`;
    
    const dayNumber = document.createElement("div");
    dayNumber.textContent = d;
    dayNumber.className = "font-semibold";
    cell.appendChild(dayNumber);
    
    if (dayData?.duration && dayData.duration !== "00h00") {
      const duration = document.createElement("div");
      duration.textContent = dayData.duration;
      duration.className = "text-xs mt-1";
      cell.appendChild(duration);
    }
    
    cell.onclick = () => {
      openModal(dateStr, dayData?.debut, dayData?.fin, dayData?.status, dayData?.note || "", dayData?.pause || 60);
    };
    
    grid.appendChild(cell);
  }
}

function initializeCalendarNavigation() {
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      loadCalendarView();
    };
  }
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      loadCalendarView();
    };
  }
}

// =====================================
// MODAL DE MODIFICATION
// =====================================

function openModal(date, start = "", end = "", status = "", note = "", pause = 60) {
  const modal = document.getElementById("calendar-modal");
  const dateLabel = document.getElementById("modal-date-label");
  
  if (!modal || !dateLabel) return;
  
  dateLabel.textContent = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const startInput = document.getElementById("modal-start");
  const endInput = document.getElementById("modal-end");
  const pauseInput = document.getElementById("modal-pause");
  const noteInput = document.getElementById("modal-note");
  
  if (startInput) startInput.value = start || "";
  if (endInput) endInput.value = end || "";
  if (pauseInput) pauseInput.value = pause;
  if (noteInput) noteInput.value = note || "";
  
  modal.classList.remove("hidden");

  // Gestionnaires d'événements
  const saveBtn = document.getElementById("modal-save");
  const deleteBtn = document.getElementById("modal-delete");
  const cancelBtn = document.getElementById("modal-cancel");
  
  if (saveBtn) {
    saveBtn.onclick = () => {
      const newStart = startInput?.value;
      const newEnd = endInput?.value;
      const newPause = parseInt(pauseInput?.value) || 60;
      const newNote = noteInput?.value;

      const dayData = {
        date: date,
        start: newStart,
        end: newEnd,
        pause: newPause,
        note: newNote
      };

      if (TimeData.saveDay(date, dayData)) {
        Toast.success('Pointage mis à jour');
        closeModal();
        loadCalendarView();
      } else {
        Toast.error('Erreur lors de la sauvegarde');
      }
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm('Supprimer ce pointage ?')) {
        if (TimeData.deleteDay(date)) {
          Toast.success('Pointage supprimé');
          closeModal();
          loadCalendarView();
        } else {
          Toast.error('Erreur lors de la suppression');
        }
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = closeModal;
  }
}

function closeModal() {
  const modal = document.getElementById("calendar-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

// =====================================
// EXPORT DES DONNÉES
// =====================================

function initExportTab() {
  const today = new Date();
  const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startInput = document.getElementById("export-start");
  const endInput = document.getElementById("export-end");
  
  if (startInput) startInput.value = firstDayMonth.toISOString().split('T')[0];
  if (endInput) endInput.value = lastDayMonth.toISOString().split('T')[0];
}

function initializeExportButtons() {
  const csvBtn = document.getElementById("export-csv");
  const jsonBtn = document.getElementById("export-json");
  const monthBtn = document.getElementById("export-month");
  const clearBtn = document.getElementById("clear-data");
  
  if (csvBtn) {
    csvBtn.onclick = () => {
      const startDate = document.getElementById("export-start")?.value;
      const endDate = document.getElementById("export-end")?.value;
      
      if (!startDate || !endDate) {
        Toast.error('Veuillez sélectionner les dates');
        return;
      }
      
      const data = TimeData.getRange(startDate, endDate);
      const csvContent = generateCSV(data);
      downloadFile(csvContent, `timetrack_${startDate}_${endDate}.csv`, 'text/csv');
      Toast.success('Export CSV téléchargé');
    };
  }
  
  if (jsonBtn) {
    jsonBtn.onclick = () => {
      const startDate = document.getElementById("export-start")?.value;
      const endDate = document.getElementById("export-end")?.value;
      
      if (!startDate || !endDate) {
        Toast.error('Veuillez sélectionner les dates');
        return;
      }
      
      const data = TimeData.getRange(startDate, endDate);
      const jsonContent = JSON.stringify(data, null, 2);
      downloadFile(jsonContent, `timetrack_${startDate}_${endDate}.json`, 'application/json');
      Toast.success('Export JSON téléchargé');
    };
  }
  
  if (monthBtn) {
    monthBtn.onclick = () => {
      const year = calendarYear;
      const month = calendarMonth + 1;
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      const data = TimeData.getRange(startDate, endDate);
      const csvContent = generateCSV(data);
      const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      downloadFile(csvContent, `timetrack_${monthName.replace(' ', '_')}.csv`, 'text/csv');
      Toast.success(`Export ${monthName} téléchargé`);
    };
  }
  
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ? Cette action est irréversible.')) {
        if (confirm('Dernière confirmation : toutes vos données de pointage seront perdues !')) {
          TimeData.clear();
          Toast.success('Toutes les données ont été effacées');
          loadWeeklyView();
          loadCalendarView();
        }
      }
    };
  }
}

function generateCSV(data) {
  const headers = ['Date', 'Début', 'Fin', 'Pause', 'Durée', 'Note'];
  const csvRows = [headers.join(',')];
  
  data.forEach(row => {
    const csvRow = row.map(cell => {
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    });
    csvRows.push(csvRow.join(','));
  });
  
  return csvRows.join('\n');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =====================================
// GESTION DES PARAMÈTRES URL
// =====================================

function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const tab = params.get('tab');
  
  if (action === 'start') {
    const startBtn = document.getElementById('start');
    if (startBtn) startBtn.click();
  }
  
  if (tab) {
    const tabButton = document.querySelector(`[data-tab="${tab}"]`);
    if (tabButton) tabButton.click();
  }
}

// =====================================
// INITIALISATION PRINCIPALE
// =====================================

function initializeApp() {
  // Initialiser tous les composants
  initializeTabs();
  initializeTimeTracking();
  initializeCalendarNavigation();
  initializeExportButtons();
  
  // Charger la vue par défaut
  loadWeeklyView();
  
  // Gérer les paramètres URL
  handleURLParams();
  
  // Restaurer session en cours
  const today = new Date().toISOString().split('T')[0];
  const todayData = TimeData.getDay(today);
  if (todayData?.start && !todayData?.end) {
    const startInput = document.getElementById('manualStart');
    if (startInput) startInput.value = todayData.start;
    startTimer(todayData.start);
    Toast.success('Session en cours restaurée');
  }
}

// =====================================
// GESTION DES ERREURS ET ÉVÉNEMENTS
// =====================================

// Sauvegarde automatique avant fermeture
window.addEventListener('beforeunload', (e) => {
  if (currentTimer) {
    e.preventDefault();
    e.returnValue = 'Vous avez une session de pointage en cours. Êtes-vous sûr de vouloir quitter ?';
  }
});

// Gestion des erreurs globales
window.addEventListener('error', (e) => {
  console.error('Erreur JavaScript:', e.error);
  Toast.error('Une erreur est survenue. Vérifiez la console.');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Promesse rejetée:', e.reason);
  Toast.error('Erreur de chargement. Vérifiez votre connexion.');
});

// =====================================
// DÉMARRAGE DE L'APPLICATION
// =====================================

document.addEventListener('DOMContentLoaded', initializeApp);

console.log('✅ TimeTrack PWA Script chargé avec succès');