// 테스트 공용 도구. 실제 MySQL의 roomade_test 데이터베이스를 사용한다.
// 이 파일을 가장 먼저 불러와야 DB 이름이 roomade_test로 바뀐다.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'roomade_test';

const assert = require('node:assert/strict');
const env = require('../src/config/env');
const { pool } = require('../src/config/db');
const app = require('../src/app');

if (!env.db.database.endsWith('_test')) {
  throw new Error('테스트는 이름이 _test로 끝나는 DB에서만 실행할 수 있습니다.');
}

let server;
let baseUrl;

/** raw를 주면 JSON으로 바꾸지 않고 문자열 그대로 보낸다. (잘못된 JSON 시험용) */
async function api(method, path, { body, token, raw } = {}) {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) payload = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

let seq = 0;
function newUserBody(overrides = {}) {
  seq += 1;
  return {
    loginId: `user${seq}`,
    password: 'password1',
    name: `사용자${seq}`,
    nickname: `닉네임${seq}`,
    phone: `010-0000-${String(seq).padStart(4, '0')}`,
    accountInfo: `국민 123456-78-90${String(seq).padStart(4, '0')}`,
    birthDate: '2000-01-01',
    gender: 'FEMALE',
    ...overrides,
  };
}

/** 회원가입 + 로그인까지 하고 { token, userId, body, login } 을 돌려준다. */
async function makeUser(overrides = {}, keepLogin = false) {
  const body = newUserBody(overrides);
  const signup = await api('POST', '/api/auth/signup', { body });
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  const login = await api('POST', '/api/auth/login', { body: { loginId: body.loginId, password: body.password, keepLogin } });
  assert.equal(login.status, 200);
  return { token: login.body.token, userId: login.body.user.userId, nickname: body.nickname, body, login: login.body };
}

/** 방장 1명 + 구성원 (memberCount - 1)명이 있는 방을 만든다. */
async function makeRoom(memberCount = 3, capacity = 10) {
  const owner = await makeUser();
  const created = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '테스트방', capacity } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const roomId = created.body.room.roomId;
  const code = created.body.invite.code;
  const members = [];
  for (let i = 1; i < memberCount; i += 1) {
    const u = await makeUser();
    const joined = await api('POST', '/api/rooms/join', { token: u.token, body: { code } });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    members.push(u);
  }
  return { owner, members, roomId, code, base: `/api/rooms/${roomId}` };
}

async function clearTables() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['room_departures', 'expense_shares', 'expenses', 'cleaning_records', 'cleaning_tasks', 'schedules',
    'items', 'room_invitations', 'room_members', 'rooms', 'users']) {
    await pool.query(`TRUNCATE TABLE ${t}`);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function startServer() {
  await clearTables();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stopServer() {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

/** DB 기준 오늘 날짜(YYYY-MM-DD) */
async function dbToday() {
  const [rows] = await pool.query('SELECT CURDATE() AS d');
  return rows[0].d;
}

module.exports = { api, makeUser, makeRoom, newUserBody, startServer, stopServer, dbToday, pool, env };
