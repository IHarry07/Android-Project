const { AppError } = require('../utils/errors');

/**
 * QR 코드(상품 페이지 주소)에서 상품명을 알아낸다.
 *
 * 서버가 사용자가 준 주소로 직접 접속하므로(SSRF 위험) 다음을 지킨다.
 *  - https 이고 허용한 호스트(정확히 일치)만 접속한다. 계정 정보·다른 포트가 붙은 주소는 거절한다.
 *  - 다른 주소로의 이동(리다이렉트)은 따라가지 않는다.
 *  - 제한 시간과 응답 크기를 둔다.
 */

const ALLOWED_HOSTS = new Set(['hpimg.gsretail.com']);
const TIMEOUT_MS = 8000;
const MAX_BYTES = 1024 * 1024; // 1MB
const IGNORED_TITLES = ['GS Retail', 'GS리테일'];

const UNSUPPORTED = () => new AppError(400, 'UNSUPPORTED_QR', '지원하지 않는 QR 주소입니다.');

/** 허용된 주소면 URL 객체를, 아니면 null을 돌려준다. */
function parseAllowedUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  return url;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

/** HTML에서 상품명을 찾는다. og:title → twitter:title → title 순서. */
function extractProductName(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  let ogTitle = null;
  let twitterTitle = null;

  for (const tag of metaTags) {
    const propertyMatch = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (!propertyMatch || !contentMatch) continue;

    const property = propertyMatch[1].toLowerCase();
    const content = decodeHtml(contentMatch[1]);
    if (property === 'og:title') ogTitle = content;
    if (property === 'twitter:title') twitterTitle = content;
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]*>/g, '')) : null;

  for (const name of [ogTitle, twitterTitle, pageTitle]) {
    if (name && name.trim() && !IGNORED_TITLES.includes(name.trim())) return name.trim();
  }
  return null;
}

/** 응답 본문을 최대 MAX_BYTES까지만 읽는다. */
async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('응답이 너무 큽니다.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function lookupProductName(rawUrl) {
  const url = parseAllowedUrl(rawUrl);
  if (!url) throw UNSUPPORTED();

  let html;
  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`상품 페이지 접속 실패: ${response.status}`);
    html = await readLimited(response);
  } catch (err) {
    console.error('상품명 조회 실패:', err.message);
    throw new AppError(502, 'LOOKUP_FAILED', '상품 정보를 가져오지 못했습니다. 이름을 직접 입력해 주세요.');
  }

  const productName = extractProductName(html);
  if (!productName) {
    throw new AppError(404, 'PRODUCT_NAME_NOT_FOUND', '상품명을 찾지 못했습니다. 이름을 직접 입력해 주세요.');
  }
  return productName.slice(0, 100);
}

module.exports = { lookupProductName, parseAllowedUrl, extractProductName };
