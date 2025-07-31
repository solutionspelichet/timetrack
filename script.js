// =====================================
// TimeTrack PWA - Version avec Export Excel corrigé
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
// STOCKAGE HYBRIDE (inchangé)
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
// GESTION DES DONNÉES (version courte)
// =====================================

const TimeData = {
  async performInitialSync() {
    const hasLocalData = Object.keys(this.getLocalData()).length > 0;
    const syncStatus = HybridStorage.local.get('sync_status');
    
    if (!hasLocalData || !syncStatus?.initialSyncDone) {
      showLoadingMessage('🔄 Récupération de vos données historiques...');
      
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - 6);
        
        const formattedStart = startDate.toISOString().split('T')[0];
        const formattedEnd = endDate.toISOString().split('T')[0];
        
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
          Toast.success(`✅ ${importedCount} entrées historiques récupérées`);
        } else {
          Toast.success('✅ Synchronisation initiale terminée');
        }
        
      } catch (error) {
        hideLoadingMessage();
        console.error('❌ Erreur migration initiale:', error);
        Toast.error('Mode hors ligne activé');
        CONFIG.OFFLINE_MODE = true;
      }
    } else {
      CONFIG.INITIAL_SYNC_DONE = true;
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
        Toast.success('💾 Sauvegardé localement (sync en attente)');
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
    return this.formatRangeData(localData, startDate, endDate);
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
  },

  clear() {
    HybridStorage.local.set('timetrack_data', {});
    HybridStorage.local.set('sync_status', { initialSyncDone: false });
    return true;
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
// EXPORT EXCEL CORRIGÉ
// =====================================

async function generateExcel(data, filename) {
  console.log('🚀 [EXCEL] Début génération:', filename);
  console.log('📊 [EXCEL] Données à traiter:', data.length, 'lignes');
  
  try {
    // Charger SheetJS si pas encore chargé
    if (!window.XLSX) {
      console.log('📦 [EXCEL] Chargement de SheetJS...');
      Toast.show('Chargement de la bibliothèque Excel...', 'warning');
      await loadSheetJS();
      console.log('✅ [EXCEL] SheetJS chargé avec succès');
    } else {
      console.log('✅ [EXCEL] SheetJS déjà disponible');
    }

    // Préparer les données
    const headers = ['Date', 'Jour', 'Début', 'Fin', 'Pause (min)', 'Durée', 'Note'];
    const excelData = [];
    excelData.push(headers);
    
    let totalMinutes = 0;
    let daysWorked = 0;
    
    data.forEach(row => {
      const [date, debut, fin, pause, durée, note] = row;
      
      const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
      const pauseMinutes = parseInt(pause) || 60;
      const duration = TimeData.calculateDuration(debut, fin, pauseMinutes);
      
      if (duration > 0) {
        totalMinutes += duration;
        daysWorked++;
      }
      
      excelData.push([
        date,
        dayName.charAt(0).toUpperCase() + dayName.slice(1),
        debut || '',
        fin || '',
        pauseMinutes,
        durée,
        note || ''
      ]);
    });

    // Statistiques
    excelData.push(['', '', '', '', '', '', '']);
    excelData.push(['STATISTIQUES', '', '', '', '', '', '']);
    excelData.push(['Total heures travaillées', '', '', '', '', TimeData.formatMinutes(totalMinutes), '']);
    excelData.push(['Nombre de jours travaillés', '', '', '', '', daysWorked, '']);
    if (daysWorked > 0) {
      excelData.push(['Moyenne par jour', '', '', '', '', TimeData.formatMinutes(Math.round(totalMinutes / daysWorked)), '']);
    }

    console.log('📈 [EXCEL] Statistiques - Total:', TimeData.formatMinutes(totalMinutes), 'Jours:', daysWorked);

    // Créer le fichier Excel
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(excelData);

    // Largeurs de colonnes
    ws['!cols'] = [
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, 
      { wch: 12 }, { wch: 10 }, { wch: 20 }
    ];

    window.XLSX.utils.book_append_sheet(wb, ws, 'TimeTrack');

    console.log('💾 [EXCEL] Génération du fichier binaire...');

    // Générer et télécharger
    const wbout = window.XLSX.write(wb, { 
      bookType: 'xlsx', 
      type: 'array'
    });
    
    const blob = new Blob([wbout], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    console.log('📥 [EXCEL] Téléchargement...', blob.size, 'bytes');
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ [EXCEL] Export terminé avec succès');

  } catch (error) {
    console.error('❌ [EXCEL] Erreur:', error);
    
    // Fallback vers HTML Excel
    console.log('🔄 [EXCEL] Tentative fallback HTML...');
    try {
      generateExcelHTML(data, filename);
      Toast.warning('Export Excel HTML généré (ouvrir avec Excel)');
    } catch (fallbackError) {
      console.error('❌ [EXCEL] Fallback échoué:', fallbackError);
      throw new Error('Impossible d\'exporter en Excel');
    }
  }
}

async function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.crossOrigin = 'anonymous';
    
    const timeout = setTimeout(() => {
      reject(new Error('Timeout chargement SheetJS'));
    }, 15000);
    
    script.onload = () => {
      clearTimeout(timeout);
      if (window.XLSX) {
        resolve();
      } else {
        reject(new Error('SheetJS non disponible après chargement'));
      }
    };
    
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Erreur chargement SheetJS'));
    };
    
    document.head.appendChild(script);
  });
}

function generateExcelHTML(data, filename) {
  console.log('🔄 [EXCEL-HTML] Génération format HTML pour Excel');
  
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"></head>
  <body><table border="1">
  <tr style="background-color: #2563eb; color: white; font-weight: bold;">
    <th>Date</th><th>Jour</th><th>Début</th><th>Fin</th><th>Pause</th><th>Durée</th><th>Note</th>
  </tr>`;
  
  let totalMinutes = 0;
  let daysWorked = 0;
  
  data.forEach(row => {
    const [date, debut, fin, pause, durée, note] = row;
    const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
    const duration = TimeData.calculateDuration(debut, fin, parseInt(pause) || 60);
    
    if (duration > 0) {
      totalMinutes += duration;
      daysWorked++;
    }
    
    html += `<tr>
      <td>${date}</td>
      <td>${dayName}</td>
      <td>${debut}</td>
      <td>${fin}</td>
      <td>${parseInt(pause) || 60}</td>
      <td>${durée}</td>
      <td>${note}</td>
    </tr>`;
  });
  
  html += `
  <tr><td colspan="7"></td></tr>
  <tr style="font-weight: bold;"><td>STATISTIQUES</td><td colspan="6"></td></tr>
  <tr><td>Total</td><td colspan="4"></td><td>${TimeData.formatMinutes(totalMinutes)}</td><td></td></tr>
  <tr><td>Jours</td><td colspan="4"></td><td>${daysWorked}</td><td></td></tr>
  </table></body></html>`;
  
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace('.xlsx', '.xls');
  link.click();
  URL.revokeObjectURL(url);
}

// =====================================
// EXPORTS STANDARDS
// =====================================

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
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =====================================
// GESTION DES EXPORTS
// =====================================

function initializeExportButtons() {
  const csvBtn = document.getElementById("export-csv");
  const jsonBtn = document.getElementById("export-json");
  const excelBtn = document.getElementById("export-excel");
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
        Toast.success('📊 Export CSV téléchargé');
      } catch (error) {
        console.error('Erreur CSV:', error);
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
        Toast.success('📄 Export JSON téléchargé');
      } catch (error) {
        console.error('Erreur JSON:', error);
        Toast.error('Erreur lors de l\'export JSON');
      }
    };
  }

  if (excelBtn) {
    excelBtn.onclick = async () => {
      const startDate = document.getElementById("export-start")?.value;
      const endDate = document.getElementById("export-end")?.value;
      
      if (!startDate || !endDate) {
        Toast.error('Veuillez sélectionner les dates');
        return;
      }
      
      console.log('🚀 [BOUTON] Clic export Excel - Période:', startDate, 'à', endDate);
      
      try {
        const data = await TimeData.getRange(startDate, endDate);
        console.log('📊 [BOUTON] Données récupérées:', data.length, 'lignes');
        
        await generateExcel(data, `timetrack_${startDate}_${endDate}.xlsx`);
        Toast.success('📗 Export Excel téléchargé');
        
      } catch (error) {
        console.error('❌ [BOUTON] Erreur export Excel:', error);
        Toast.error('Erreur lors de l\'export Excel: ' + error.message);
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
        const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        await generateExcel(data, `timetrack_${monthName.replace(' ', '_')}.xlsx`);
        Toast.success(`📗 Export Excel ${monthName} téléchargé`);
      } catch (error) {
        console.error('Erreur Excel mensuel:', error);
        Toast.error('Erreur lors de l\'export du mois');
      }
    };
  }
  
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ?')) {
        if (confirm('Dernière confirmation : toutes vos données seront perdues !')) {
          TimeData.clear();
          Toast.success('Toutes les données ont été effacées');
        }
      }
    };
  }
}

// =====================================
// FONCTIONS SIMPLIFIÉES POUR INIT
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

      if (tabId === "export") {
        initExportTab();
      }
    });
  });
}

function initExportTab() {
  const today = new Date();
  const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startInput = document.getElementById("export-start");
  const endInput = document.getElementById("export-end");
  
  if (startInput) startInput.value = firstDayMonth.toISOString().split('T')[0];
  if (endInput) endInput.value = lastDayMonth.toISOString().split('T')[0];
}

function initializeTimeTracking() {
  const startBtn = document.getElementById("start");
  const submitBtn = document.getElementById("submit");

  if (startBtn) {
    startBtn.onclick = async () => {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const manualStart = document.getElementById("manualStart");
      const startTime = manualStart ? (manualStart.value || now.toTimeString().substring(0, 5)) : now.toTimeString().substring(0, 5);
      
      if (manualStart && !manualStart.value) {
        manualStart.value = startTime;
      }

      const existingData = TimeData.getLocalData()[isoDate] || {};
      existingData.start = startTime;
      existingData.date = isoDate;
      
      await TimeData.saveDay(isoDate, existingData);
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
    };
  }
}

// =====================================
// INITIALISATION SIMPLIFIÉE
// =====================================

async function initializeApp() {
  console.log('🚀 Initialisation TimeTrack...');
  
  try {
    await TimeData.performInitialSync();
    initializeTabs();
    initializeTimeTracking();
    initializeExportButtons();
    
    console.log('✅ TimeTrack initialisé avec succès');
    
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
    Toast.error('Erreur lors de l\'initialisation');
  }
}

// =====================================
// COMMANDES DE DEBUG
// =====================================

window.TimeTrackDebug = {
  testExcel: async () => {
    console.log('🧪 Test export Excel...');
    const testData = [
      ['2025-01-15', '09:00', '17:00', '60 min', '07h00', 'Test'],
      ['2025-01-16', '08:30', '16:30', '30 min', '07h30', 'Test 2']
    ];
    
    try {
      await generateExcel(testData, 'test_export.xlsx');
      console.log('✅ Test Excel réussi');
      return true;
    } catch (error) {
      console.error('❌ Test Excel échoué:', error);
      return false;
    }
  },
  
  showLocal: () => console.log('💾 Données locales:', TimeData.getLocalData()),
  clearLocal: () => TimeData.clear()
};

// =====================================
// DÉMARRAGE
// =====================================

document.addEventListener('DOMContentLoaded', initializeApp);

console.log('🔄 TimeTrack avec Export Excel corrigé chargé');
console.log('🧪 Commandes debug: TimeTrackDebug.testExcel(), TimeTrackDebug.showLocal()');