// =====================================
// TimeTrack PWA HYBRIDE - VERSION FINALE SANS ERREURS
// Compatible avec timetrack-api.onrender.com + Export + Calendrier
// =====================================

const CONFIG = {
  API_BASE: 'https://timetrack-api.onrender.com/api',
  SYNC_INTERVAL: 30000,
  OFFLINE_MODE: false,
  INITIAL_SYNC_DONE: false
};

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let syncTimer = null;

// =====================================
// STOCKAGE HYBRIDE
// =====================================

const HybridStorage = {
  local: {
    get: (key) => {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('Erreur localStorage:', e);
        return null;
      }
    },
    
    set: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('Erreur localStorage:', e);
        return false;
      }
    }
  },

  cloud: {
    async get(endpoint) {
      try {
        const res = await fetch(`${CONFIG.API_BASE}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (error) {
        console.error('Erreur cloud:', error);
        CONFIG.OFFLINE_MODE = true;
        updateConnectionStatus(false);
        throw error;
      }
    },

    async post(endpoint, data) {
      try {
        const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        CONFIG.OFFLINE_MODE = false;
        updateConnectionStatus(true);
        return await res.json();
      } catch (error) {
        console.error('Erreur cloud:', error);
        CONFIG.OFFLINE_MODE = true;
        updateConnectionStatus(false);
        throw error;
      }
    }
  }
};

// =====================================
// GESTION DES DONNÉES AVEC MIGRATION
// =====================================

const TimeData = {
  
  // 🔄 MIGRATION INITIALE : Récupérer toutes les données historiques
  async performInitialSync() {
    const hasLocalData = Object.keys(this.getLocalData()).length > 0;
    const syncStatus = HybridStorage.local.get('sync_status');
    
    if (!hasLocalData || !syncStatus?.initialSyncDone) {
      showLoadingMessage('🔄 Récupération de vos données historiques depuis Google Sheets...');
      
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - 6);
        
        const formattedStart = startDate.toISOString().split('T')[0];
        const formattedEnd = endDate.toISOString().split('T')[0];
        
        console.log(`📥 Récupération historique: ${formattedStart} à ${formattedEnd}`);
        
        const historicalData = await HybridStorage.cloud.get(`/range?start=${formattedStart}&end=${formattedEnd}`);
        
        const localData = this.getLocalData();
        let importedCount = 0;
        
        historicalData.forEach(row => {
          const [date, start, end, pause, duration, note] = row;
          
          if (start || end || note) {
            localData[date] = {
              start: start || '',
              end: end || '',
              pause: parseInt(pause) || 60,
              note: note || '',
              needsSync: false,
              lastModified: Date.now(),
              source: 'cloud'
            };
            importedCount++;
          }
        });
        
        HybridStorage.local.set('timetrack_data', localData);
        HybridStorage.local.set('sync_status', {
          initialSyncDone: true,
          lastSync: Date.now(),
          importedCount
        });
        
        CONFIG.INITIAL_SYNC_DONE = true;
        hideLoadingMessage();
        
        if (importedCount > 0) {
          Toast.success(`✅ ${importedCount} entrées historiques récupérées depuis Google Sheets`);
        } else {
          Toast.success('✅ Synchronisation initiale terminée');
        }
        
        console.log(`✅ Migration terminée: ${importedCount} entrées importées`);
        
      } catch (error) {
        hideLoadingMessage();
        console.error('❌ Erreur migration initiale:', error);
        Toast.error('Impossible de récupérer les données. Mode hors ligne activé.');
        CONFIG.OFFLINE_MODE = true;
      }
    } else {
      CONFIG.INITIAL_SYNC_DONE = true;
      console.log('✅ Données locales existantes trouvées');
    }
  },

  async saveDay(date, dayData) {
    if (!CONFIG.INITIAL_SYNC_DONE) {
      await this.performInitialSync();
    }
    
    const localData = this.getLocalData();
    localData[date] = { 
      ...dayData, 
      lastModified: Date.now(), 
      needsSync: true,
      source: 'user'
    };
    HybridStorage.local.set('timetrack_data', localData);
    
    if (!CONFIG.OFFLINE_MODE) {
      try {
        await HybridStorage.cloud.post('/update', {
          date,
          start: dayData.start,
          end: dayData.end,
          pause: dayData.pause,
          note: dayData.note
        });
        
        localData[date].needsSync = false;
        HybridStorage.local.set('timetrack_data', localData);
        Toast.success('💾 Sauvegardé localement et sur Google Sheets');
        
      } catch (error) {
        Toast.success('💾 Sauvegardé localement (synchronisation en attente)');
        this.scheduleSync();
      }
    } else {
      Toast.success('💾 Sauvegardé localement (mode hors ligne)');
    }
    
    return true;
  },

  async getRange(startDate, endDate) {
    if (!CONFIG.INITIAL_SYNC_DONE) {
      await this.performInitialSync();
    }
    
    const localData = this.getLocalData();
    const result = this.formatRangeData(localData, startDate, endDate);
    
    if (!CONFIG.OFFLINE_MODE) {
      this.refreshFromCloud(startDate, endDate).catch(console.error);
    }
    
    return result;
  },

  async refreshFromCloud(startDate, endDate) {
    try {
      const cloudData = await HybridStorage.cloud.get(`/range?start=${startDate}&end=${endDate}`);
      const localData = this.getLocalData();
      let updatedCount = 0;
      
      cloudData.forEach(row => {
        const [date, start, end, pause, duration, note] = row;
        const localEntry = localData[date];
        
        if (!localEntry || (!localEntry.needsSync && localEntry.source !== 'user')) {
          if (start || end || note) {
            localData[date] = {
              start: start || '',
              end: end || '',
              pause: parseInt(pause) || 60,
              note: note || '',
              needsSync: false,
              lastModified: Date.now(),
              source: 'cloud'
            };
            updatedCount++;
          }
        }
      });
      
      if (updatedCount > 0) {
        HybridStorage.local.set('timetrack_data', localData);
        console.log(`🔄 ${updatedCount} entrées mises à jour depuis le cloud`);
      }
      
    } catch (error) {
      console.error('Erreur rafraîchissement:', error);
    }
  },

  getLocalData() {
    return HybridStorage.local.get('timetrack_data') || {};
  },

  formatRangeData(localData, startDate, endDate) {
    const result = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayData = localData[dateStr];
      
      if (dayData && (dayData.start || dayData.end || dayData.note)) {
        const duration = this.calculateDuration(dayData.start, dayData.end, dayData.pause || 60);
        result.push([
          dateStr,
          dayData.start || '',
          dayData.end || '',
          (dayData.pause || 60) + ' min',
          this.formatMinutes(duration),
          dayData.note || ''
        ]);
      } else {
        result.push([dateStr, '', '', '60 min', '00h00', '']);
      }
    }
    
    return result;
  },

  async syncPendingData() {
    const localData = this.getLocalData();
    const pendingData = Object.entries(localData).filter(([date, data]) => data.needsSync);
    
    if (pendingData.length === 0) return;

    let syncedCount = 0;
    
    for (const [date, data] of pendingData) {
      try {
        await HybridStorage.cloud.post('/update', {
          date,
          start: data.start,
          end: data.end,
          pause: data.pause,
          note: data.note
        });
        
        localData[date].needsSync = false;
        syncedCount++;
      } catch (error) {
        console.error(`Erreur sync ${date}:`, error);
        break;
      }
    }
    
    if (syncedCount > 0) {
      HybridStorage.local.set('timetrack_data', localData);
      Toast.success(`🔄 ${syncedCount} modification(s) synchronisée(s) avec Google Sheets`);
    }
  },

  scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer);
    
    syncTimer = setTimeout(async () => {
      if (!CONFIG.OFFLINE_MODE) {
        await this.syncPendingData();
      }
      this.scheduleSync();
    }, CONFIG.SYNC_INTERVAL);
  },

  deleteDay(date) {
    const localData = this.getLocalData();
    delete localData[date];
    HybridStorage.local.set('timetrack_data', localData);
    return true;
  },

  clear() {
    HybridStorage.local.set('timetrack_data', {});
    HybridStorage.local.set('sync_status', { initialSyncDone: false });
    return true;
  },

  getSyncStats() {
    const localData = this.getLocalData();
    const syncStatus = HybridStorage.local.get('sync_status');
    
    return {
      totalEntries: Object.keys(localData).length,
      pendingSync: Object.values(localData).filter(d => d.needsSync).length,
      lastSync: syncStatus?.lastSync,
      initialSyncDone: syncStatus?.initialSyncDone || false
    };
  },

  calculateDuration(start, end, pause = 60) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm) - pause;
    return Math.max(0, minutes);
  },

  formatMinutes(minutes) {
    if (minutes <= 0 || isNaN(minutes)) return "00h00";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}`;
  }
};

// =====================================
// INTERFACE UTILISATEUR
// =====================================

const Toast = {
  show(message, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'fixed top-4 right-4 px-4 py-2 rounded shadow-lg text-white transform translate-x-full transition-transform duration-300 z-50';
      document.body.appendChild(toast);
    }
    
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-orange-500'
    };
    
    toast.textContent = message;
    toast.className = `fixed top-4 right-4 px-4 py-2 rounded shadow-lg text-white transition-transform duration-300 z-50 ${colors[type] || colors.success}`;
    
    setTimeout(() => {
      toast.style.transform = 'translateX(0)';
    }, 100);
    
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
    }, 3000);
  },
  
  success: (msg) => Toast.show(msg, 'success'),
  error: (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning')
};

function updateConnectionStatus(online) {
  const indicator = document.getElementById('status-indicator');
  if (!indicator) return;
  
  if (online) {
    indicator.className = 'ml-4 w-3 h-3 rounded-full bg-green-400';
    indicator.title = 'En ligne - Synchronisé avec Google Sheets';
  } else {
    indicator.className = 'ml-4 w-3 h-3 rounded-full bg-orange-400';
    indicator.title = 'Mode hors ligne - Synchronisation en attente';
  }
}

function showLoadingMessage(message) {
  let loading = document.getElementById('loading-overlay');
  if (!loading) {
    loading = document.createElement('div');
    loading.id = 'loading-overlay';
    loading.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    loading.innerHTML = `
      <div class="bg-white rounded-lg p-6 text-center max-w-sm mx-4">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <div id="loading-message" class="text-gray-700 font-medium">Chargement...</div>
        <div class="text-sm text-gray-500 mt-2">Cela peut prendre quelques secondes...</div>
      </div>
    `;
    document.body.appendChild(loading);
  }
  
  const messageEl = document.getElementById('loading-message');
  if (messageEl) messageEl.textContent = message;
  loading.style.display = 'flex';
}

function hideLoadingMessage() {
  const loading = document.getElementById('loading-overlay');
  if (loading) {
    loading.style.display = 'none';
  }
}

// =====================================
// GESTION DU POINTAGE
// =====================================

function initializeTimeTracking() {
  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const submitBtn = document.getElementById("submit");

  if (startBtn) {
    startBtn.onclick = async () => {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const manualStart = document.getElementById("manualStart").value;
      const startTime = manualStart || now.toTimeString().substring(0, 5);
      
      if (!manualStart) {
        const startInput = document.getElementById("manualStart");
        if (startInput) startInput.value = startTime;
      }

      const existingData = TimeData.getLocalData()[isoDate] || {};
      existingData.start = startTime;
      existingData.date = isoDate;
      
      await TimeData.saveDay(isoDate, existingData);
      localStorage.setItem("row", isoDate);
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      const now = new Date();
      const time = now.toTimeString().substring(0, 5);
      const endInput = document.getElementById("manualEnd");
      if (endInput) endInput.value = time;
      Toast.success("Heure de fin prête à enregistrer !");
    };
  }

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const startInput = document.getElementById("manualStart");
      const endInput = document.getElementById("manualEnd");
      const pauseInput = document.getElementById("pause");
      const noteInput = document.getElementById("note");
      
      const start = startInput ? startInput.value : '';
      const end = endInput ? endInput.value : '';
      const pause = pauseInput ? parseInt(pauseInput.value) || 60 : 60;
      const note = noteInput ? noteInput.value || "" : "";

      if (!start || !end) {
        Toast.error('Veuillez renseigner les heures de début et fin');
        return;
      }

      const dayData = { date: isoDate, start, end, pause, note };
      await TimeData.saveDay(isoDate, dayData);
      
      if (noteInput) noteInput.value = "";
      localStorage.removeItem("row");
    };
  }
}

// =====================================
// VUE HEBDOMADAIRE
// =====================================

async function loadWeeklyView() {
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 6);
  const formattedStart = startDate.toISOString().split("T")[0];
  const formattedEnd = today.toISOString().split("T")[0];

  try {
    const data = await TimeData.getRange(formattedStart, formattedEnd);
    renderWeeklyTable(data);
  } catch (error) {
    console.error('Erreur chargement semaine:', error);
    Toast.error('Erreur lors du chargement de la semaine');
  }
}

function renderWeeklyTable(data) {
  const tbody = document.getElementById("hebdo-body");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  let totalMinutes = 0;

  data.forEach(row => {
    const [date, debut, fin, pause, durée, note] = row;
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50";

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
    inputStart.onchange = () => updateCellHybrid(date, inputStart.value, null, pause, tr);
    tdStart.appendChild(inputStart);
    tdStart.className = "p-2 border";
    tr.appendChild(tdStart);

    const tdEnd = document.createElement("td");
    const inputEnd = document.createElement("input");
    inputEnd.type = "time";
    inputEnd.value = fin || "";
    inputEnd.className = "w-full border rounded px-2 py-1";
    inputEnd.onchange = () => updateCellHybrid(date, null, inputEnd.value, pause, tr);
    tdEnd.appendChild(inputEnd);
    tdEnd.className = "p-2 border";
    tr.appendChild(tdEnd);

    const tdPause = document.createElement("td");
    tdPause.textContent = pause || "60 min";
    tdPause.className = "p-2 border text-center";
    tr.appendChild(tdPause);

    const tdDurée = document.createElement("td");
    const durationMinutes = TimeData.calculateDuration(debut, fin, parseInt(pause) || 60);
    totalMinutes += durationMinutes > 0 ? durationMinutes : 0;
    tdDurée.textContent = TimeData.formatMinutes(durationMinutes);
    tdDurée.className = "p-2 border text-center font-mono";
    tdDurée.dataset.durationCell = "true";
    tr.appendChild(tdDurée);

    const tdNote = document.createElement("td");
    tdNote.textContent = note || "";
    tdNote.className = "p-2 border text-xs";
    tr.appendChild(tdNote);

    tbody.appendChild(tr);
  });

  const totalRow = document.createElement("tr");
  totalRow.className = "bg-gray-100 font-bold";
  totalRow.innerHTML = `
    <td colspan="4" class="p-2 border text-right">Total semaine</td>
    <td class="p-2 border text-center font-mono">${TimeData.formatMinutes(totalMinutes)}</td>
    <td class="p-2 border"></td>
  `;
  tbody.appendChild(totalRow);
}

async function updateCellHybrid(date, newStart, newEnd, pause, rowElement) {
  const rowInputs = rowElement.querySelectorAll("input[type='time']");
  const start = newStart || (rowInputs[0] ? rowInputs[0].value : '');
  const end = newEnd || (rowInputs[1] ? rowInputs[1].value : '');
  const pauseMinutes = parseInt((pause || "60").toString().replace(" min", ""));

  const localData = TimeData.getLocalData();
  const existingData = localData[date] || {};
  
  const dayData = {
    ...existingData,
    start,
    end,
    pause: pauseMinutes
  };

  await TimeData.saveDay(date, dayData);

  const durationCell = rowElement.querySelector("[data-duration-cell]");
  if (durationCell) {
    const minutes = TimeData.calculateDuration(start, end, pauseMinutes);
    durationCell.textContent = TimeData.formatMinutes(minutes);
  }
}

// =====================================
// VUE CALENDRIER
// =====================================

async function loadCalendarView() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  
  grid.innerHTML = "";

  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;

  const title = firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const titleElement = document.getElementById("calendar-title");
  if (titleElement) {
    titleElement.textContent = title.charAt(0).toUpperCase() + title.slice(1);
  }

  const start = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
  const end = `${year}-${(month + 1).toString().padStart(2, '0')}-${totalDays.toString().padStart(2, '0')}`;
  
  try {
    const data = await TimeData.getRange(start, end);
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
  } catch (error) {
    console.error('Erreur chargement calendrier:', error);
    Toast.error('Erreur lors du chargement du calendrier');
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

  const saveBtn = document.getElementById("modal-save");
  const deleteBtn = document.getElementById("modal-delete");
  const cancelBtn = document.getElementById("modal-cancel");
  
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const newStart = startInput ? startInput.value : '';
      const newEnd = endInput ? endInput.value : '';
      const newPause = pauseInput ? parseInt(pauseInput.value) || 60 : 60;
      const newNote = noteInput ? noteInput.value : '';

      const dayData = {
        date: date,
        start: newStart,
        end: newEnd,
        pause: newPause,
        note: newNote
      };

      await TimeData.saveDay(date, dayData);
      Toast.success('Pointage mis à jour');
      closeModal();
      loadCalendarView();
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm('Supprimer ce pointage ?')) {
        TimeData.deleteDay(date);
        Toast.success('Pointage supprimé');
        closeModal();
        loadCalendarView();
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
    csvBtn.onclick = async () => {
      const startDate = document.getElementById("export-start")?.value;
      const endDate = document.getElementById("export-end")?.value;
      
      if (!startDate || !endDate) {
        Toast.error('Veuillez sélectionner les dates');
        return;
      }
      
      try {
        const data = await TimeData.getRange(startDate, endDate);
        const csvContent = generateCSV(data);
        downloadFile(csvContent, `timetrack_${startDate}_${endDate}.csv`, 'text/csv');
        Toast.success('Export CSV téléchargé');
      } catch (error) {
        Toast.error('Erreur lors de l\'export CSV');
      }
    };
  }
  
  if (jsonBtn) {
    jsonBtn.onclick = async () => {
      const startDate = document.getElementById("export-start")?.value;
      const endDate = document.getElementById("export-end")?.value;
      
      if (!startDate || !endDate) {
        Toast.error('Veuillez sélectionner les dates');
        return;
      }
      
      try {
        const data = await TimeData.getRange(startDate, endDate);
        const jsonContent = JSON.stringify(data, null, 2);
        downloadFile(jsonContent, `timetrack_${startDate}_${endDate}.json`, 'application/json');
        Toast.success('Export JSON téléchargé');
      } catch (error) {
        Toast.error('Erreur lors de l\'export JSON');
      }
    };
  }
  
  if (monthBtn) {
    monthBtn.onclick = async () => {
      const year = calendarYear;
      const month = calendarMonth + 1;
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      try {
        const data = await TimeData.getRange(startDate, endDate);
        const csvContent = generateCSV(data);
        const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        downloadFile(csvContent, `timetrack_${monthName.replace(' ', '_')}.csv`, 'text/csv');
        Toast.success(`Export ${monthName} téléchargé`);
      } catch (error) {
        Toast.error('Erreur lors de l\'export du mois');
      }
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
// GESTION DES ONGLETS
// =====================================

function initializeTabs() {
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
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.remove("hidden");
      }

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
// VÉRIFICATION DE CONNEXION (SANS /health)
// =====================================

async function checkConnection() {
  try {
    // ✅ Tester avec un endpoint existant, pas /health
    const testDate = new Date().toISOString().split('T')[0];
    const res = await fetch(`${CONFIG.API_BASE}/range?start=${testDate}&end=${testDate}`);
    
    if (res.ok) {
      CONFIG.OFFLINE_MODE = false;
      updateConnectionStatus(true);
      console.log('✅ Connexion Google Sheets OK');
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (error) {
    CONFIG.OFFLINE_MODE = true;
    updateConnectionStatus(false);
    console.log('⚠️ Mode hors ligne activé');
    return false;
  }
}

// =====================================
// INITIALISATION PRINCIPALE
// =====================================

async function initializeHybridApp() {
  console.log('🚀 Initialisation TimeTrack Hybride...');
  
  // Vérifier la connexion SANS utiliser /health
  await checkConnection();
  
  // Migration initiale des données historiques
  await TimeData.performInitialSync();

  // Initialiser tous les composants
  initializeTabs();
  initializeTimeTracking();
  initializeCalendarNavigation();
  initializeExportButtons();
  
  // Démarrer la synchronisation automatique
  TimeData.scheduleSync();

  // Charger la vue par défaut
  await loadWeeklyView();
  
  console.log('✅ TimeTrack Hybride initialisé avec succès');
}

// =====================================
// COMMANDES DE DEBUG
// =====================================

if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('github'))) {
  window.TimeTrackDebug = {
    showStats: () => console.log('📊 Stats:', TimeData.getSyncStats()),
    forceSync: () => TimeData.performInitialSync(),
    showLocal: () => console.log('💾 Local:', TimeData.getLocalData()),
    clearLocal: () => {
      TimeData.clear();
      console.log('🗑️ Données locales effacées');
    },
    testConnection: () => checkConnection()
  };
  
  console.log(`
🔧 Commandes debug disponibles:
- TimeTrackDebug.showStats() : Voir les stats de sync
- TimeTrackDebug.forceSync() : Forcer une re-synchronisation
- TimeTrackDebug.showLocal() : Voir les données locales
- TimeTrackDebug.clearLocal() : Effacer les données locales
- TimeTrackDebug.testConnection() : Tester la connexion
  `);
}

// =====================================
// DÉMARRAGE
// =====================================

document.addEventListener('DOMContentLoaded', initializeHybridApp);

console.log('🔄 TimeTrack Hybride COMPLET (sans erreurs /health) chargé');