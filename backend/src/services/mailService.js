const nodemailer = require('nodemailer');
const config = require('../config/env');

/**
 * 메일 발송. .env 의 SMTP 설정이 있을 때만 실제로 보낸다.
 *   SMTP_HOST, SMTP_PORT(기본 587), SMTP_SECURE(true면 465 같은 SSL), SMTP_USER, SMTP_PASSWORD, MAIL_FROM(기본은 SMTP_USER)
 * 설정이 없으면 isConfigured()가 false이고, 이메일로 비밀번호 찾기는 "준비 중" 안내를 돌려준다.
 * 테스트에서는 메일을 보내지 않고 outbox 에 쌓아 두어 내용을 확인한다.
 */

const outbox = [];
let transporter;

function isConfigured() {
  if (config.isTest) return true;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

async function send({ to, subject, text }) {
  if (config.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = { isConfigured, send, outbox };