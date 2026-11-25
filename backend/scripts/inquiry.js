// 고객센터 문의 관리 (운영자용). 서버 PC에서 backend 폴더 기준으로 실행한다.
//   목록        : node scripts/inquiry.js list [--waiting]
//   내용 보기   : node scripts/inquiry.js show <번호>
//   답변 등록   : node scripts/inquiry.js reply <번호> "답변 내용"
//                 node scripts/inquiry.js reply <번호> --file 답변.txt
// 답변하면 그 회원의 앱 [프로필 > 고객센터 > 내 문의]에 답변이 보이고 "답변 완료"로 바뀐다.
require('../src/config/env');
const fs = require('fs');
const { pool } = require('../src/config/db');

const args = process.argv.slice(2);
const command = args.shift();

function option(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return args.splice(i, 2)[1];
}
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

async function main() {
  if (command === 'list') {
    const waiting = flag('waiting');
    const [rows] = await pool.query(
      `SELECT i.inquiry_id, i.title, i.status, i.created_at, u.nickname, u.login_id
         FROM inquiries i JOIN users u ON u.user_id = i.user_id
        ${waiting ? "WHERE i.status = 'WAITING'" : ''}
        ORDER BY i.inquiry_id DESC LIMIT 100`,
    );
    if (rows.length === 0) console.log('문의가 없습니다.');
    rows.forEach((r) => console.log(`#${r.inquiry_id} [${r.status === 'WAITING' ? '대기' : '완료'}] ${r.title}  - ${r.nickname}(${r.login_id}) ${String(r.created_at).slice(0, 16)}`));
    return;
  }

  if (command === 'show') {
    const id = Number(args[0]);
    if (!id) throw new Error('사용법: node scripts/inquiry.js show <번호>');
    const [[r]] = await pool.query(
      `SELECT i.*, u.nickname, u.login_id, u.email FROM inquiries i JOIN users u ON u.user_id = i.user_id WHERE i.inquiry_id = ?`, [id]);
    if (!r) throw new Error(`문의 #${id} 를 찾을 수 없습니다.`);
    console.log(`#${r.inquiry_id} ${r.title}\n작성: ${r.nickname}(${r.login_id}) ${r.email ? `<${r.email}>` : ''} ${String(r.created_at).slice(0, 16)}\n상태: ${r.status === 'WAITING' ? '답변 대기' : '답변 완료'}\n\n${r.content}`);
    if (r.answer) console.log(`\n--- 답변 (${String(r.answered_at).slice(0, 16)}) ---\n${r.answer}`);
    return;
  }

  if (command === 'reply') {
    const id = Number(args.shift());
    const file = option('file');
    const answer = file ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim() : args[0];
    if (!id || !answer) throw new Error('사용법: node scripts/inquiry.js reply <번호> "답변 내용"  (또는 --file 파일)');
    const [r] = await pool.query(
      "UPDATE inquiries SET answer = ?, status = 'ANSWERED', answered_at = NOW() WHERE inquiry_id = ?", [answer, id]);
    console.log(r.affectedRows ? `문의 #${id} 에 답변을 등록했습니다.` : `문의 #${id} 를 찾을 수 없습니다.`);
    return;
  }

  console.log('명령: list | show | reply   (자세한 사용법은 이 파일 맨 위 설명 참고)');
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());