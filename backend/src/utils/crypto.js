const crypto = require('crypto');
const env = require('../config/env');

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0,O,1,I 제외
const INVITE_LENGTH = 8;

/** 계좌 정보를 AES-256-GCM으로 암호화한다. 결과는 "v1:" + base64(iv | tag | 암호문). */
function encryptAccount(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.accountEncKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptAccount(stored) {
  if (!stored || !stored.startsWith('v1:')) {
    throw new Error('알 수 없는 계좌 암호화 형식입니다.');
  }
  const raw = Buffer.from(stored.slice(3), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', env.accountEncKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** 숫자 중 마지막 4자리만 남기고 *로 가린다. 예: 국민 123456-78-901234 -> 국민 ******-**-**1234 */
function maskAccount(plain) {
  const digitCount = (plain.match(/\d/g) || []).length;
  let seen = 0;
  return plain.replace(/\d/g, (d) => {
    seen += 1;
    return seen > digitCount - 4 ? d : '*';
  });
}

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

/** 초대 코드는 DB에 SHA-256 해시로만 저장한다. 대소문자와 공백은 무시한다. */
function hashInviteCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = {
  encryptAccount,
  decryptAccount,
  maskAccount,
  generateInviteCode,
  hashInviteCode,
  sha256Hex,
};
