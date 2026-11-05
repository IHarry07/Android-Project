const expenses = require('../services/expenseService');

const ids = (req) => [req.auth.userId, req.params.roomId];

module.exports = {
  async create(req, res) { res.status(201).json({ expense: await expenses.createExpense(...ids(req), req.body) }); },
  async list(req, res) { res.json({ expenses: await expenses.listExpenses(...ids(req), req.query) }); },
  async balances(req, res) { res.json(await expenses.getBalances(...ids(req))); },
  async get(req, res) { res.json({ expense: await expenses.getExpense(...ids(req), req.params.expenseId) }); },
  async update(req, res) { res.json({ expense: await expenses.updateExpense(...ids(req), req.params.expenseId, req.body) }); },
  async remove(req, res) { await expenses.deleteExpense(...ids(req), req.params.expenseId); res.status(204).end(); },
  async settle(req, res) {
    const expense = await expenses.settleShare(...ids(req), req.params.expenseId, req.params.userId, req.body.isSettled);
    res.json({ expense });
  },
};
