// =====================================
// TimeTrack PWA - Version SIMPLIFIÉE SANS ERREURS
// =====================================

const CONFIG = {
  API_BASE: 'https://timetrack-api.onrender.com/api',
  OFFLINE_MODE: false,
  INITIAL_SYNC_DONE: false
};

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

// =====================================
// STOCKAGE LOCAL
// =====================================
const Storage = {
  get: (key) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
};

// =====================================
// GESTION DES DONNÉES
// =====================================
const TimeData = {
  getAll: () => Storage.get('timetrack_data') || {},
  
  saveDay: async (date, data) => {
    const allData = TimeData.getAll();
    allData[date] = data;
    Storage.set('timetrack_data', allData);
    
    // Essayer de sauvegarder sur le cloud
    if (!CONFIG.OFFLINE_MODE) {
      try {
        await fetch(`${CONFIG.API_BASE}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: date,
            start: data.start,
            end: data.end,
            pause: data.pause,
            note: data.note
          })
        });
        showToast('Sauvegardé localement et sur Google Sheets', 'success');
      } catch (error) {
        showToast('Sauvegardé localement seulement', 'warning');
      }
    } else {
      showToast('Sauvegardé localement', 'success');
    }
    
    return true;
  },
  
  getRange: async (startDate, endDate) => {
    // Essayer de récupérer depuis le cloud d'abord
    if (!CONFIG.OFFLINE_MODE) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/range?start=${startDate}&end=${endDate}`);
        if (response.ok) {
          const cloudData = await response.json();
          return cloudData;
        }
      } catch (error) {
        console.log('Utilisation des données locales');
      }
    }
    
    // Utiliser les données locales
    const localData = TimeData.getAll();
    const result = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayData = localData[dateStr];
      
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
  
  clear: () => {
    Storage.set('timetrack_data', {});
    return true;
  }
};

// =====================================
// UTILITAIRES
// =====================================
function calculateDuration(start, end, pause) {
  if (!start || !end) return 0;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const duration = endMinutes - startMinutes - (pause || 60);
  return Math.max(0, duration);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function formatMinutes(minutes) {
  if (minutes <= 0) return "00h00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h.toString().padStart(2, '0') + 'h' + m.toString().padStart(2, '0');
}

function showToast(message, type) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = 'toast show ' + (type || 'success');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// =====================================
// EXPORT EXCEL SIMPLE
// =====================================
async function exportToExcel(data, filename) {
  console.log('🚀 Export Excel:', filename);
  
  try {
    // Charger SheetJS
    if (!window.XLSX) {
      showToast('Chargement de la bibliothèque Excel...', 'warning');
      await loadSheetJS();
    }
    
    // Préparer les données
    const excelData = [];
    excelData.push(['Date', 'Jour', 'Début', 'Fin', 'Pause', 'Durée', 'Note']);
    
    let totalMinutes = 0;
    let daysWorked = 0;
    
    data.forEach(row => {
      const date = row[0];
      const start = row[1];
      const end = row[2];
      const pause = row[3];  
      const duration = row[4];
      const note = row[5];
      
      const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
      const pauseNum = parseInt(pause) || 60;
      const durationMinutes = calculateDuration(start, end, pauseNum);
      
      if (durationMinutes > 0) {
        totalMinutes += durationMinutes;
        daysWorked++;
      }
      
      excelData.push([
        date,
        dayName,
        start,
        end,
        pauseNum + ' min',
        duration,
        note
      ]);
    });
    
    // Ajouter les statistiques
    excelData.push(['', '', '', '', '', '', '']);
    excelData.push(['TOTAL', '', '', '', '', formatMinutes(totalMinutes), '']);
    excelData.push(['JOURS TRAVAILLÉS', '', '', '', '', daysWorked, '']);
    
    // Créer le fichier Excel
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(excelData);
    window.XLSX.utils.book_append_sheet(wb, ws, 'TimeTrack');
    
    // Télécharger
    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Export Excel terminé !', 'success');
    
  } catch (error) {
    console.error('Erreur Excel:', error);
    
    // Fallback HTML
    exportToHTML(data, filename.replace('.xlsx', '.xls'));
    showToast('Export HTML Excel créé', 'warning');
  }
}

function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erreur chargement SheetJS'));
    document.head.appendChild(script);
  });
}

function exportToHTML(data, filename) {
  let html = '<table border="1">';
  html += '<tr style="background: #2563eb; color: white;"><th>Date</th><th>Jour</th><th>Début</th><th>Fin</th><th>Pause</th><th>Durée</th><th>Note</th></tr>';
  
  data.forEach(row => {
    const date = row[0];
    const dayName = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
    html += '<tr>';
    html += '<td>' + date + '</td>';
    html += '<td>' + dayName + '</td>';
    html += '<td>' + (row[1] || '') + '</td>';
    html += '<td>' + (row[2] || '') + '</td>';
    html += '<td>' + (row[3] || '60 min') + '</td>';
    html += '<td>' + (row[4] || '00h00') + '</td>';
    html += '<td>' + (row[5] || '') + '</td>';
    html += '</tr>';
  });
  
  html += '</table>';
  
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
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
// EXPORTS STANDARDS
// =====================================
function exportToCSV(data, filename) {
  const headers = ['Date', 'Début', 'Fin', 'Pause', 'Durée', 'Note'];
  let csv = headers.join(',') + '\n';
  
  data.forEach(row => {
    const csvRow = row.map(cell => {
      const str = String(cell || '');
      if (str.includes(',') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    csv += csvRow.join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
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
function initTabs() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      // Désactiver tous les onglets
      document.querySelectorAll('.tab-button').forEach(b => {
        b.classList.remove('bg-blue-200');
        b.classList.add('bg-gray-200');
      });
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.add('hidden');
      });
      
      // Activer l'onglet cliqué
      button.classList.remove('bg-gray-200');
      button.classList.add('bg-blue-200');
      const tabId = button.getAttribute('data-tab');
      const content = document.getElementById(tabId);
      if (content) {
        content.classList.remove('hidden');
      }
      
      // Initialiser l'onglet export
      if (tabId === 'export') {
        initExportTab();
      }
    });
  });
}

function initExportTab() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startInput = document.getElementById('export-start');
  const endInput = document.getElementById('export-end');
  
  if (startInput) startInput.value = firstDay.toISOString().split('T')[0];
  if (endInput) endInput.value = lastDay.toISOString().split('T')[0];
}

// =====================================
// GESTION DU POINTAGE
// =====================================
function initPointage() {
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  const submitBtn = document.getElementById('submit');
  
  if (startBtn) {
    startBtn.onclick = async () => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().substring(0, 5);
      
      const startInput = document.getElementById('manualStart');
      if (startInput && !startInput.value) {
        startInput.value = time;
      }
      
      const data = TimeData.getAll()[date] || {};
      data.start = startInput ? startInput.value : time;
      data.date = date;
      
      await TimeData.saveDay(date, data);
    };
  }
  
  if (stopBtn) {
    stopBtn.onclick = () => {
      const now = new Date();
      const time = now.toTimeString().substring(0, 5);
      const endInput = document.getElementById('manualEnd');
      if (endInput) {
        endInput.value = time;
      }
      showToast('Heure de fin prête !');
    };
  }
  
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      
      const startInput = document.getElementById('manualStart');
      const endInput = document.getElementById('manualEnd');
      const pauseInput = document.getElementById('pause');
      const noteInput = document.getElementById('note');
      
      const start = startInput ? startInput.value : '';
      const end = endInput ? endInput.value : '';
      const pause = pauseInput ? parseInt(pauseInput.value) || 60 : 60;
      const note = noteInput ? noteInput.value : '';
      
      if (!start || !end) {
        showToast('Veuillez renseigner début et fin', 'error');
        return;
      }
      
      const data = { date, start, end, pause, note };
      await TimeData.saveDay(date, data);
      
      if (noteInput) noteInput.value = '';
    };
  }
}

// =====================================
// GESTION DES EXPORTS
// =====================================
function initExports() {
  const csvBtn = document.getElementById('export-csv');
  const excelBtn = document.getElementById('export-excel');
  const jsonBtn = document.getElementById('export-json');
  const clearBtn = document.getElementById('clear-data');
  
  if (csvBtn) {
    csvBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        exportToCSV(data, `timetrack_${start}_${end}.csv`);
        showToast('Export CSV terminé', 'success');
      } catch (error) {
        showToast('Erreur export CSV', 'error');
      }
    };
  }
  
  if (excelBtn) {
    excelBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        await exportToExcel(data, `timetrack_${start}_${end}.xlsx`);
      } catch (error) {
        console.error('Erreur:', error);
        showToast('Erreur export Excel', 'error');
      }
    };
  }
  
  if (jsonBtn) {
    jsonBtn.onclick = async () => {
      const start = document.getElementById('export-start').value;
      const end = document.getElementById('export-end').value;
      
      if (!start || !end) {
        showToast('Sélectionnez les dates', 'error');
        return;
      }
      
      try {
        const data = await TimeData.getRange(start, end);
        exportToJSON(data, `timetrack_${start}_${end}.json`);
        showToast('Export JSON terminé', 'success');
      } catch (error) {
        showToast('Erreur export JSON', 'error');
      }
    };
  }
  
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Effacer toutes les données ?')) {
        TimeData.clear();
        showToast('Données effacées', 'success');
      }
    };
  }
}

// =====================================
// INITIALISATION
// =====================================
async function initApp() {
  console.log('🚀 Initialisation TimeTrack...');
  
  try {
    // Vérifier la connexion
    try {
      const testDate = new Date().toISOString().split('T')[0];
      const response = await fetch(`${CONFIG.API_BASE}/range?start=${testDate}&end=${testDate}`);
      CONFIG.OFFLINE_MODE = !response.ok;
    } catch (error) {
      CONFIG.OFFLINE_MODE = true;
    }
    
    // Initialiser les composants
    initTabs();
    initPointage();
    initExports();
    
    console.log('✅ TimeTrack initialisé');
    showToast('Application prête !', 'success');
    
  } catch (error) {
    console.error('Erreur init:', error);
    showToast('Erreur initialisation', 'error');
  }
}

// =====================================
// DEBUG
// =====================================
window.TimeTrackDebug = {
  testExcel: async () => {
    const testData = [
      ['2025-01-15', '09:00', '17:00', '60 min', '07h00', 'Test'],
      ['2025-01-16', '08:30', '16:30', '30 min', '07h30', 'Test 2']
    ];
    await exportToExcel(testData, 'test.xlsx');
  },
  showData: () => console.log(TimeData.getAll()),
  clearData: () => TimeData.clear()
};

// =====================================
// DÉMARRAGE
// =====================================
document.addEventListener('DOMContentLoaded', initApp);

console.log('🔄 TimeTrack Simple chargé');
console.log('🧪 Test Excel: TimeTrackDebug.testExcel()');