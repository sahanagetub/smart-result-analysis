const resultService = require('../services/resultService');
const { getPool, isDbDisabled } = require('../config/db');

exports.getStats = async (req, res) => {
  try {
    const dbAvailable = !isDbDisabled();
    let pool = null;
    
    if (dbAvailable) {
      pool = getPool();
      if (!pool) dbAvailable = false;
    }
    
    let totalStudents = 0, totalResults = 0, totalPassed = 0, totalFailed = 0;
    let overallPassPercentage = 0, averageMarks = 0, highestMarks = 0, lowestMarks = 0;
    let dbAvailableFlag = false;
    
    if (dbAvailable && pool) {
      try {
        const [students] = await pool.execute('SELECT COUNT(*) AS cnt FROM students');
        const [results] = await pool.execute('SELECT COUNT(*) AS cnt FROM results');
        const [passed] = await pool.execute("SELECT COUNT(*) AS cnt FROM results WHERE status = 'Pass'");
        const [failed] = await pool.execute("SELECT COUNT(*) AS cnt FROM results WHERE status = 'Fail'");
        const [totalMarks] = await pool.execute('SELECT SUM(marks_obtained) AS total FROM results');
        const [avgMarks] = await pool.execute('SELECT AVG(marks_obtained) AS avg FROM results');
        const [highest] = await pool.execute('SELECT MAX(marks_obtained) AS max FROM results');
        const [lowest] = await pool.execute('SELECT MIN(marks_obtained) AS min FROM results');
        
        totalStudents = Number(students[0].cnt);
        totalResults = Number(results[0].cnt);
        totalPassed = Number(passed[0].cnt);
        totalFailed = Number(failed[0].cnt);
        overallPassPercentage = results[0].cnt > 0 ? Math.round((passed[0].cnt / results[0].cnt) * 100) : 0;
        averageMarks = Math.round(Number(avgMarks[0].avg) * 100) / 100;
        highestMarks = Number(highest[0].max);
        lowestMarks = Number(lowest[0].min);
        dbAvailableFlag = true;
      } catch (err) {
        console.error('Dashboard stats DB error:', err.message);
      }
    }
    
    const stats = {
      dbAvailable: dbAvailableFlag,
      demoData: false,
      totalStudents,
      totalResults,
      totalPassed,
      totalFailed,
      overallPassPercentage,
      averageMarks,
      highestMarks,
      lowestMarks
    };
    
    const recentActivity = [
      { message: 'System initialized.', time: 'Just now' }
    ];
    
    res.json({ success: true, data: { stats, recentActivity } });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
