const express = require('express');
const schemas = require('../utils/schemas');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../utils/errors');
const item = require('../controllers/itemController');
const schedule = require('../controllers/scheduleController');
const cleaning = require('../controllers/cleaningController');
const expense = require('../controllers/expenseController');

// /api/rooms/:roomId 아래에 붙는 방 단위 기능. 인증은 rooms 라우터에서 이미 확인한다.
const router = express.Router({ mergeParams: true });
const params = validate(schemas.idParam, 'params');

// 창고
router.post('/items', params, validate(schemas.createItem), h(item.create));
router.get('/items', params, validate(schemas.listItems, 'query'), h(item.list));
router.get('/items/:itemId', params, h(item.get));
router.patch('/items/:itemId', params, validate(schemas.updateItem), h(item.update));
router.post('/items/:itemId/adjust', params, validate(schemas.adjustItem), h(item.adjust));
router.delete('/items/:itemId', params, h(item.remove));

// 일정
router.post('/schedules', params, validate(schemas.createSchedule), h(schedule.create));
router.get('/schedules', params, validate(schemas.listSchedules, 'query'), h(schedule.list));
router.get('/schedules/:scheduleId', params, h(schedule.get));
router.patch('/schedules/:scheduleId', params, validate(schemas.updateSchedule), h(schedule.update));
router.delete('/schedules/:scheduleId', params, h(schedule.remove));

// 청소
router.post('/cleaning-tasks', params, validate(schemas.createCleaningTask), h(cleaning.create));
router.get('/cleaning-tasks', params, validate(schemas.listCleaningTasks, 'query'), h(cleaning.list));
router.get('/cleaning-tasks/:taskId', params, h(cleaning.get));
router.patch('/cleaning-tasks/:taskId', params, validate(schemas.updateCleaningTask), h(cleaning.update));
router.delete('/cleaning-tasks/:taskId', params, h(cleaning.remove));
router.post('/cleaning-tasks/:taskId/complete', params, validate(schemas.cleaningAction), h(cleaning.complete));
router.post('/cleaning-tasks/:taskId/skip', params, validate(schemas.cleaningAction), h(cleaning.skip));
router.post('/cleaning-tasks/:taskId/postpone', params, validate(schemas.postponeCleaning), h(cleaning.postpone));
router.get('/cleaning-tasks/:taskId/records', params, validate(schemas.listCleaningRecords, 'query'), h(cleaning.records));

// 지출
router.post('/expenses', params, validate(schemas.createExpense), h(expense.create));
router.get('/expenses', params, validate(schemas.listExpenses, 'query'), h(expense.list));
router.get('/expenses/balances', params, h(expense.balances));
router.get('/expenses/:expenseId', params, h(expense.get));
router.patch('/expenses/:expenseId', params, validate(schemas.updateExpense), h(expense.update));
router.delete('/expenses/:expenseId', params, h(expense.remove));
router.patch('/expenses/:expenseId/shares/:userId', params, validate(schemas.settleShare), h(expense.settle));

module.exports = router;
