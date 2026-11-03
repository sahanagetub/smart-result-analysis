document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('dbStatus');
  const errorEl = document.getElementById('dashboardError');
  const cardIds = ['totalStudents', 'totalBatches', 'totalSubjects', 'totalSemesters'];

  // Loading indicators
  cardIds.forEach((id) => {
    const e = document.getElementById(id);
    if (e) e.textContent = '...';
  });

  fetch('/api/dashboard/stats')
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((data) => {
      if (!data || !data.success || !data.data) throw new Error('Invalid response');
      const payload = data.data;
      const s = payload.stats || {};
      const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = (val === null || val === undefined) ? 'N/A' : val; };
      el('totalStudents', s.totalStudents);
      el('totalBatches', s.totalBatches);
      el('totalSubjects', s.totalSubjects);
      el('totalSemesters', s.totalSemesters);

      if (statusEl) {
        if (s.dbAvailable === false) {
          statusEl.textContent = 'Database is disabled (demo mode). Statistics are unavailable.';
          statusEl.className = 'status-banner status-warn';
          statusEl.style.display = 'block';
        } else if (s.demoData) {
          statusEl.textContent = 'Demo data: statistics are sample values, not real database records.';
          statusEl.className = 'status-banner status-info';
          statusEl.style.display = 'block';
        } else {
          statusEl.style.display = 'none';
        }
      }

      // Recent activity
      const list = document.getElementById('recentActivityList');
      if (list && Array.isArray(payload.recentActivity)) {
        list.innerHTML = '';
        if (payload.recentActivity.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'No recent activity.';
          list.appendChild(li);
        } else {
          payload.recentActivity.forEach((item) => {
            const li = document.createElement('li');
            li.innerHTML = '<span>' + escapeHtml(item.message) + '</span><span class="activity-time">' + escapeHtml(item.time) + '</span>';
            list.appendChild(li);
          });
        }
      }
    })
    .catch((err) => {
      if (errorEl) {
        errorEl.textContent = 'Failed to load dashboard data. Please try again.';
        errorEl.style.display = 'block';
      }
      cardIds.forEach((id) => {
        const e = document.getElementById(id);
        if (e) e.textContent = 'N/A';
      });
      console.error('Dashboard load error:', err);
    });

  // Placeholder chart area (static demonstration data)
  const overviewCtx = document.getElementById('overviewChart');
  if (overviewCtx && window.Chart) {
    try {
      new Chart(overviewCtx, {
        type: 'bar',
        data: {
          labels: ['Students', 'Batches', 'Subjects', 'Semesters'],
          datasets: [{ label: 'Counts (demo)', data: [120, 6, 24, 4], backgroundColor: '#1e3a8a' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    } catch (e) {
      console.error('Chart render error:', e);
    }
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
