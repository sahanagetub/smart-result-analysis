const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_DISABLED = 'false';
const model = require('../models/analyticsModel');
const controller = require('../controllers/analyticsController');
const express = require('express');
const routes = require('../routes/analyticsRoutes');
const handlers = [controller.getOverview,controller.getSemesterAnalytics,controller.getSubjectAnalytics,controller.getStudentAnalytics,controller.getExaminationAnalytics,controller.getGradeDistribution,controller.getPerformanceComparison];
function invoke(fn, query={}) { return new Promise(resolve=>{const res={code:200,status(n){this.code=n;return this;},json(body){resolve({status:this.code,body});}};fn({query},res);}); }
test('all analytics handlers return structured empty results; overview zeroes and metadata are correct',async()=>{
 const old=model.executeQuery; model.executeQuery=async()=>[];
 try { for(const fn of handlers){const r=await invoke(fn);assert.equal(r.status,200);assert.equal(r.body.success,true);}const o=await invoke(controller.getOverview);assert.equal(o.body.data.totalResults,0);assert.equal(o.body.data.totalStudents,0);assert.equal(o.body.data.passedResults,0);assert.equal(o.body.data.failedResults,0);assert.equal(o.body.data.passPercentage,0);assert.equal(o.body.data.failurePercentage,0);assert.equal(o.body.data.averagePercentage,0);assert.deepEqual(o.body.data.gradeSummary,[]);assert.equal(o.body.meta.filteredResultCount,0); }
 finally {model.executeQuery=old;}
});
test('parameterized valid and combined filters reach queries; invalid filters are rejected',async()=>{const old=model.executeQuery,calls=[];model.executeQuery=async(sql,p)=>{calls.push({sql,p});return [{totalResults:2,appearedStudents:2,passedResults:1,failedResults:1,passPercentage:50,averagePercentage:50}];};try{const r=await invoke(controller.getOverview,{batchId:'2',semesterId:'3',sessionId:'4',subjectCode:'CS-1'});assert.equal(r.status,200);assert.equal(r.body.meta.filteredResultCount,2);assert.deepEqual(calls[0].p,['2','3','4','CS-1']);assert.match(calls[0].sql,/b\.id\s*=\s*\?/);assert.equal((await invoke(controller.getSemesterAnalytics,{batchId:'x;DROP'})).status,400);assert.equal((await invoke(controller.getPerformanceComparison,{dimension:'bogus'})).status,400);assert.equal((await invoke(controller.getOverview,{examType:'Quiz'})).status,400);}finally{model.executeQuery=old;}});
test('database query errors return 500 and are not converted to empty success',async()=>{const old=model.executeQuery;model.executeQuery=async()=>{throw Error('mock query failure');};try{for(const fn of handlers){const r=await invoke(fn);assert.equal(r.status,500);assert.equal(r.body.success,false);}}finally{model.executeQuery=old;}});
test('analytics routes require authentication',async t=>{const app=express();app.use('/api/analytics',routes);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());for(const path of ['filters','overview','semester','subject','student','examination','grade-distribution','comparison']){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/analytics/${path}`);assert.equal(r.status,401,path);}});
