// 서비스 공지사항 관리 (운영자용). 서버 PC에서 backend 폴더 기준으로 실행한다.
//   목록   : node scripts/notice.js list
//   등록   : node scripts/notice.js add "제목" "내용" [--pin]
//            node scripts/notice.js add "제목" --file 내용.txt [--pin]
//   수정   : node scripts/notice.js edit <번호> [--title "새 제목"] [--body "새 내용" | --file 내용.txt] [--pin | --unpin]
//   삭제   : node scripts/notice.js delete <번호>
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
    const [rows] = await pool.query('SELECT notice_id, title, is_pinned, created_at FROM notices ORDER BY is_pinned DESC, notice_id DESC');
    if (rows.length === 0) console.log('등록된 공지가 없습니다.');
    rows.forEach((r) => console.log(`#${r.notice_id} ${r.is_pinned ? '[고정] ' : ''}${r.title}  (${String(r.created_at).slice(0, 16)})`));
    return;
  }

  if (command === 'add') {
    const file = option('file');
    const pin = flag('pin');
    const [title, bodyArg] = args;
    const body = file ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : bodyArg;
    if (!title || !body) throw new Error('사용법: node scripts/notice.js add "제목" "내용" [--pin]  (내용 대신 --file 파일)');
    if (title.length > 150) throw new Error('제목은 150자 이하여야 합니다.');
    const [r] = await pool.query('INSERT INTO notices (title, body, is_pinned) VALUES (?, ?, ?)', [title, body.trim(), pin ? 1 : 0]);
    console.log(`공지 #${r.insertId} 를 등록했습니다.`);
    return;
  }

  if (command === 'edit') {
    const id = Number(args[0]);
    if (!id) throw new Error('사용법: node scripts/notice.js edit <번호> [--title ..] [--body .. | --file ..] [--pin | --unpin]');
    const title = option('title');
    const file = option('file');
    const bodyArg = option('body');
    const pin = flag('pin');
    const unpin = flag('unpin');
    const sets = [];
    const values = [];
    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    if (file) { sets.push('body = ?'); values.push(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim()); }
    else if (bodyArg !== undefined) { sets.push('body = ?'); values.push(bodyArg); }
    if (pin) { sets.push('is_pinned = 1'); }
    if (unpin) { sets.push('is_pinned = 0'); }
    if (sets.length === 0) throw new Error('바꿀 항목이 없습니다.');
    const [r] = await pool.query(`UPDATE notices SET ${sets.join(', ')} WHERE notice_id = ?`, [...values, id]);
    console.log(r.affectedRows ? `공지 #${id} 를 수정했습니다.` : `공지 #${id} 를 찾을 수 없습니다.`);
    return;
  }

  if (command === 'delete') {
    const id = Number(args[0]);
    if (!id) throw new Error('사용법: node scripts/notice.js delete <번호>');
    const [r] = await pool.query('DELETE FROM notices WHERE notice_id = ?', [id]);
    console.log(r.affectedRows ? `공지 #${id} 를 삭제했습니다.` : `공지 #${id} 를 찾을 수 없습니다.`);
    return;
  }

  console.log('명령: list | add | edit | delete   (자세한 사용법은 이 파일 맨 위 설명 참고)');
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());