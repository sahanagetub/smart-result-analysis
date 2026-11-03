document.addEventListener('DOMContentLoaded', () => {
  // Fetch dashboard stats
  fetch('/api/dashboard/stats')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.success && data.data) {
        const s = data.data;
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('totalStudents', s.totalStudents);
        el('totalBatches', s.totalBatches);
        el('totalSubjects', s.totalSubjects);
        el('totalResults', s.totalResults);
      }
    })
    .catch(() => {});

  // Sample static chart data
  const semesters = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];
  const semScores = [72, 78, 81, 76];

  const passFailCtx = document.getElementById('passFailChart');
  if (passFailCtx) {
    new Chart(passFailCtx, {
      type: 'pie',
      data: {
        labels: ['Pass', 'Fail'],
        datasets: [{ data: [85, 15], backgroundColor: ['#3b82f6', '#dc2626'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const semCtx = document.getElementById('semesterChart');
  if (semCtx) {
    new Chart(semCtx, {
      type: 'bar',
      data: {
        labels: semesters,
        datasets: [{ label: 'Average %', data: semScores, backgroundColor: '#1e3a8a' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  }

  const subjectCtx = document.getElementById('subjectChart');
  if (subjectCtx) {
    new Chart(subjectCtx, {
      type: 'line',
      data: {
        labels: ['Math', 'Physics', 'Chemistry', 'CS', 'English'],
        datasets: [{ label: 'Average %', data: [80, 74, 77, 88, 82], borderColor: '#3b82f6', fill: false, tension: 0.3 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  }
});
