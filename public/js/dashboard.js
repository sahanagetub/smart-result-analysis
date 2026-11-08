// Dashboard JavaScript - Phase 10 Implementation

document.addEventListener('DOMContentLoaded', () => {
  const apiBase = '/api/dashboard';

  // Elements
  const summaryCards = {
    totalStudents: document.getElementById('totalStudents'),
    resultsAvailable: document.getElementById('resultsAvailable'),
    passedStudents: document.getElementById('passedStudents'),
    failedStudents: document.getElementById('failedStudents'),
    overallPassPercentage: document.getElementById('overallPassPercentage'),
    totalSubjects: document.getElementById('totalSubjects'),
  };

  const chartElements = {
    overviewChart: document.getElementById('overviewChart'),
    overviewPassPercentage: document.getElementById('overviewPassPercentage'),
    averageMarks: document.getElementById('averageMarks'),
    highestMarks: document.getElementById('highestMarks'),
    lowestMarks: document.getElementById('lowestMarks'),
    subjectBarChart: document.getElementById('subjectBarChart'),
  };

  const tableElements = {
    topPerformersBody: document.getElementById('topPerformersBody'),
    subjectAveragesBody: document.getElementById('subjectAveragesBody'),
    subjectPassFailBody: document.getElementById('subjectPassFailBody'),
  };

  const performanceElements = {
    totalAppeared: document.getElementById('totalAppeared'),
    overallAverage: document.getElementById('overallAverage'),
    highestPercentage: document.getElementById('highestPercentage'),
    lowestPercentage: document.getElementById('lowestPercentage'),
  };

  const distributionElements = {
    distribution90_100: { bar: document.querySelector('.distribution-card:nth-child(1) .bar-fill'), value: document.querySelector('.distribution-card:nth-child(1) .bar-value') },
    distribution80_89: { bar: document.querySelector('.distribution-card:nth-child(2) .bar-fill'), value: document.querySelector('.distribution-card:nth-child(2) .bar-value') },
    distribution70_79: { bar: document.querySelector('.distribution-card:nth-child(3) .bar-fill'), value: document.querySelector('.distribution-card:nth-child(3) .bar-value') },
    distribution60_69: { bar: document.querySelector('.distribution-card:nth-child(4) .bar-fill'), value: document.querySelector('.distribution-card:nth-child(4) .bar-value') },
    distributionBelow60: { bar: document.querySelector('.distribution-card:nth-child(5) .bar-fill'), value: document.querySelector('.distribution-card:nth-child(5) .bar-value') },
  };

  const subjectPassFailElements = {
    passed: {},
    failed: {},
    totalAppeared: {},
  };

  function showLoading() {
    Object.values(stateElements).forEach(el => el.style.display = 'none');
    stateElements.loadingState.style.display = 'block';
  }

  function hideLoading() {
    stateElements.loadingState.style.display = 'none';
  }

  function showError(message) {
    hideLoading();
    stateElements.errorMessage.textContent = message;
    stateElements.errorState.style.display = 'block';
  }

  function hideError() {
    stateElements.errorState.style.display = 'none';
  }

  function showEmpty() {
    hideLoading();
    stateElements.emptyState.style.display = 'block';
  }

  function hideAllStates() {
    Object.values(stateElements).forEach(el => el.style.display = 'none');
  }
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  async function fetchDashboardSummary() {
    showLoading();
    hideError();
    hideEmpty();

    try {
      const response = await fetch(apiBase + '/summary');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dashboard summary');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Dashboard summary request failed');
      }

      const summary = data.data;
      displaySummary(summary);
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      showError(error.message);
    }
  }

  function displaySummary(summary) {
    hideLoading();
    hideError();
    hideEmpty();

    const hasData = summary.totalStudents !== undefined && summary.totalStudents > 0;

    if (!hasData) {
      showEmpty();
      return;
    }

    summaryCards.totalStudents.textContent = formatNumber(summary.totalStudents);
    summaryCards.resultsAvailable.textContent = formatNumber(summary.resultsAvailable || 0);
    summaryCards.passedStudents.textContent = formatNumber(summary.passedStudents || 0);
    summaryCards.failedStudents.textContent = formatNumber(summary.failedStudents || 0);
    summaryCards.overallPassPercentage.textContent = summary.overallPassPercentage + '%';
    summaryCards.totalSubjects.textContent = formatNumber(summary.totalSubjects || 0);

    chartElements.averageMarks.textContent = summary.averageMarks !== undefined ? summary.averageMarks + '%' : '-';
    chartElements.highestMarks.textContent = summary.highestMarks !== undefined ? formatNumber(summary.highestMarks) : '-';
    chartElements.lowestMarks.textContent = summary.lowestMarks !== undefined ? formatNumber(summary.lowestMarks) : '-';

    renderPassFailChart(summary.passedStudents || 0, summary.failedStudents || 0);
    renderSubjectPerformanceChart();
  }

  function renderPassFailChart(passed, failed) {
    const total = passed + failed;

    if (total === 0) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      chartElements.overviewPassPercentage.textContent = '0%';
      return;
    }

    const passPercentage = Math.round((passed / total) * 100);
    const failPercentage = 100 - passPercentage;

    const ctx = chartElements.overviewChart.getContext('2d');

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Passed', 'Failed'],
        datasets: [{
          data: [passed, failed],
          backgroundColor: ['#28a745', '#dc3545'],
          hoverBackgroundColor: ['#218838', '#c82333'],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed;
                const percentage = Math.round((value / total) * 100);
                return label + ': ' + value + ' students (' + percentage + '%)';
              }
            }
          }
        }
      }
    });

    chartElements.overviewPassPercentage.textContent = passPercentage + '%';
  }

  async function renderSubjectPerformanceChart() {
    try {
      const response = await fetch(apiBase + '/subject-performance');

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Subject performance error:', errorData);
        return;
      }

      const data = await response.json();

      if (!data.success || data.data.length === 0) {
        if (subjectChartInstance) {
          subjectChartInstance.destroy();
          subjectChartInstance = null;
        }
        return;
      }

      const subjectData = data.data;
      renderSubjectPerformanceBarChart(subjectData);
    } catch (error) {
      console.error('Error fetching subject performance:', error);
    }
  }

  async function renderTopPerformers() {
    try {
      showLoading();
      hideError();
      hideEmpty();

      const response = await fetch(apiBase + '/top-performers');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch top performers');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Top performers request failed');
      }

      const performers = data.data;
      const topPerformersBody = tableElements.topPerformersBody;

      hideLoading();
      hideError();

      if (!performers || performers.length === 0) {
        showEmpty();
        topPerformersBody.innerHTML = '<tr><td colspan=\"5\" class="no-data">No performer data available</td></tr>';
        return;
      }

      topPerformersBody.innerHTML = performers.map((student, index) => `
        <tr>
          <td>${student.rank}</td>
          <td>${student.usn}</td>
          <td>${student.name}</td>
          <td>${student.batchId || 'N/A'}</td>
          <td>${student.averagePercentage !== undefined ? student.averagePercentage + '%' : 'N/A'}</td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error fetching top performers:', error);
      hideLoading();
      showError(error.message || 'Failed to load top performers');
      topPerformersBody.innerHTML = '<tr><td colspan=\"5\" class="no-data">Error loading performer data</td></tr>';
    }
  }

  function renderSubjectPerformanceBarChart(subjectData) {
    const ctx = chartElements.subjectBarChart.getContext('2d');

    // Destroy existing instance if present
    if (subjectChartInstance) {
      subjectChartInstance.destroy();
    }

    // Sort subjects by average marks descending
    const sorted = [...subjectData].sort((a, b) => b.avgMarks - a.avgMarks);

    subjectChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(s => s.subjectName),
        datasets: [{
          label: 'Average Marks',
          data: sorted.map(s => s.avgMarks),
          backgroundColor: function(context) {
            const index = context.dataIndex;
            const percentage = (sorted[index].avgMarks / 100) * 100;
            return percentage >= 80 ? '#28a745' : percentage >= 70 ? '#ffc107' : percentage >= 60 ? '#fd7e14' : '#dc3545';
          },
          borderColor: '#6c757d',
          borderWidth: 1
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ' ' + context.parsed + '/100';
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Average Marks' } },
          x: { title: { display: true, text: 'Subject' } }
        }
      }
    });
  }

  async function init() {
    await fetchDashboardSummary();
    await renderSubjectPerformanceChart();
    await renderTopPerformers();
    await renderSubjectAverages();
    await renderOverallClassPerformance();
    await renderResultDistribution();
    await renderSubjectPassFailAnalysis();
  }

  init();
});