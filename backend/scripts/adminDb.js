// 관리자 DB 접속 정보. 서버(.env)는 읽기·쓰기만 되는 roomade_app 계정을 쓰고,
// 표 만들기·마이그레이션·백업·테스트처럼 관리자 권한이 필요한 일은 backend/.env.admin 의 계정을 쓴다.
//   .env.admin 예)  DB_ADMIN_USER=root
//                  DB_ADMIN_PASSWORD=...
// .env.admin 이 없으면 .env 의 DB_USER / DB_PASSWORD 를 그대로 쓴다. (관리자 계정으로 서버를 돌리는 개발 PC)
// .env.admin 은 Git과 배포 서버에 올리지 않는다.
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.join(__dirname, '..');

function loadEnv() {
  dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });
  dotenv.config({ path: path.join(backendDir, '.env.admin'), quiet: true });
}

function adminDb() {
  loadEnv();
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_ADMIN_USER || process.env.DB_USER,
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'roomade',
  };
}

module.exports = { adminDb, loadEnv };
