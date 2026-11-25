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

function hasSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

/** 인증번호를 보낼 수 있는지: SMTP 설정이 있거나, 개발용 콘솔 출력(MAIL_DEV_CONSOLE=true)이 켜져 있을 때 */
function isConfigured() {
  return config.isTest || hasSmtp() || config.mailDevConsole;
}

/** 실제 메일 발송이 가능한지 (보안 알림 메일은 콘솔 출력으로 대신하지 않는다) */
function canSend() {
  return config.isTest || hasSmtp();
}

async function send({ to, subject, text }) {
  if (config.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  if (!hasSmtp() && config.mailDevConsole) {
    // 개발용: 메일 대신 서버 콘솔에 출력한다.
    console.log(`[개발용 메일] 받는 사람: ${to}\n제목: ${subject}\n${text}\n`);
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

module.exports = { isConfigured, canSend, send, outbox };