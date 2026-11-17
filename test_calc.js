const svc = require('./services/resultCalculationService.js');

// Test calculateTotalMarks
console.log('calculateTotalMarks(30, 35):', svc.calculateTotalMarks(30, 35));
console.log('calculateTotalMarks(20, 35):', svc.calculateTotalMarks(20, 35));
console.log('calculateTotalMarks(35, 15):', svc.calculateTotalMarks(35, 15));
console.log('calculateTotalMarks(25, 25):', svc.calculateTotalMarks(25, 25));
console.log('calculateTotalMarks():', svc.calculateTotalMarks());
console.log('calculateTotalMarks(null, 35):', svc.calculateTotalMarks(null, 35));

// Test determineSubjectResult
console.log('');
console.log('determineSubjectResult(30, 35, 65):', JSON.stringify(svc.determineSubjectResult(30, 35, 65)));
console.log('determineSubjectResult(20, 35, 55):', JSON.stringify(svc.determineSubjectResult(20, 35, 55)));
console.log('determineSubjectResult(35, 15, 50):', JSON.stringify(svc.determineSubjectResult(35, 15, 50)));
console.log('determineSubjectResult(25, 25, 50):', JSON.stringify(svc.determineSubjectResult(25, 25, 50)));

// Test calculateGrade
console.log('');
console.log('calculateGrade(65):', svc.calculateGrade(65));
console.log('calculateGrade(55):', svc.calculateGrade(55));
console.log('calculateGrade(50):', svc.calculateGrade(50));
console.log('calculateGrade(49):', svc.calculateGrade(49));

// Test calculateGradePoint
console.log('');
console.log('calculateGradePoint(O):', svc.calculateGradePoint('O'));
console.log('calculateGradePoint(A+):', svc.calculateGradePoint('A+'));
console.log('calculateGradePoint(F):', svc.calculateGradePoint('F'));

// Test calculateSGPA
console.log('');
console.log('calculateSGPA([{credit:4, grade:A, status:Pass}]):', svc.calculateSGPA([{credit:4, grade:'A', status:'Pass'}]));
console.log('calculateSGPA([{credit:4, grade:F, status:Fail}]):', svc.calculateSGPA([{credit:4, grade:'F', status:'Fail'}]));

// Test calculateCGPA
console.log('');
console.log('calculateCGPA([{credit:4, grade:A, status:Pass}]):', svc.calculateCGPA([{credit:4, grade:'A', status:'Pass'}]));
console.log('calculateCGPA([{credit:4, grade:F, status:Pass}], {excludeFailed:false}):', svc.calculateCGPA([{credit:4, grade:'F', status:'Pass'}], {excludeFailed:false}));

// Test calculateOverallResult
console.log('');
console.log('calculateOverallResult([{cie:30, see:35, subject_name:"Math"}]):', JSON.stringify(svc.calculateOverallResult([{cie:30, see:35, subject_name:'Math'}])));

// Test getMinimumComponent
console.log('');
console.log('getMinimumComponent(30, 35):', JSON.stringify(svc.getMinimumComponent(30, 35)));
console.log('getMinimumComponent(20, 35):', JSON.stringify(svc.getMinimumComponent(20, 35)));

// Test getGradeSummary
console.log('');
console.log('getGradeSummary([{cie:30, see:35, subject_name:"Math"}]):', JSON.stringify(svc.getGradeSummary([{cie:30, see:35, subject_name:'Math'}])));

console.log('');
console.log('All tests completed!');