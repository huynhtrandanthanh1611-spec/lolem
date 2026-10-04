// Self-contained, versioned quiz snapshots for static GitHub Pages hosting.
// No storage lookup is needed to open a link on a different device.
export const SHARE_VERSION = '20261004-share-21';
export const MAX_SHARE_URL_LENGTH = 8000;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
const INVALID = 'Không tìm thấy bộ câu hỏi.';
const INCOMPLETE = 'Vui lòng hoàn tất câu hỏi và đáp án đúng trước khi chia sẻ.';
const TOO_LARGE = 'Bộ câu hỏi quá lớn để chia sẻ bằng link. Hãy chia thành các bộ nhỏ hơn.';

export function validQuestions(questions) {
  return Array.isArray(questions) && questions.every(q => q &&
    typeof q.text === 'string' && q.text.trim() && q.text.length <= 300 &&
    typeof q.left === 'string' && q.left.trim() && q.left.length <= 150 &&
    typeof q.right === 'string' && q.right.trim() && q.right.length <= 150 &&
    (q.correct === 0 || q.correct === 1));
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Preserve additional question metadata, but never embed files or local URLs.
function checkMetadata(value, depth = 0) {
  if (depth > 12) throw Error(INCOMPLETE);
  if (typeof value === 'string' && /(?:data:|blob:|file:)/i.test(value)) {
    throw Error('Không thể đưa ảnh hoặc file trên thiết bị vào link. Hãy dùng URL ảnh công khai.');
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error(INCOMPLETE);
      checkMetadata(child, depth + 1);
    }
  }
}

export function createSnapshot(questions, title = '', settings = {}) {
  if (!validQuestions(questions) || !questions.length || typeof title !== 'string' || title.length > 100) {
    throw Error(INCOMPLETE);
  }
  const saved = JSON.parse(JSON.stringify(questions));
  checkMetadata(saved);
  const ids = new Set();
  const snapshot = {
    version: 1,
    quizId: 'q_' + crypto.randomUUID().replaceAll('-', ''),
    title: title.trim(),
    createdAt: new Date().toISOString(),
    settings: {shuffle: settings.shuffle === true, seconds: [0,10,15,20,30,60].includes(settings.seconds) ? settings.seconds : 0},
    questions: saved.map((q, i) => {
      const {id, text, left, right, correct, ...extra} = q;
      let key = typeof id === 'string' && id && !ids.has(id) ? id : 'question-' + (i + 1);
      while (ids.has(key)) key += '-copy';
      ids.add(key);
      return {id: key, questionText: text, options: [left, right], correctAnswer: correct,
        ...(Object.keys(extra).length ? {extra} : {})};
    }),
  };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_SNAPSHOT_BYTES) throw Error(TOO_LARGE);
  return freeze(snapshot);
}

function validateSnapshot(snapshot, quizId) {
  if (!snapshot || snapshot.version !== 1 || snapshot.quizId !== quizId ||
      !/^q_[a-f0-9]{32}$/.test(quizId) || typeof snapshot.title !== 'string' ||
      snapshot.title.length > 100 || typeof snapshot.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(snapshot.createdAt)) || !Array.isArray(snapshot.questions) ||
      !snapshot.questions.length || !snapshot.settings || typeof snapshot.settings.shuffle !== 'boolean' ||
      ![0,10,15,20,30,60].includes(snapshot.settings.seconds)) throw Error(INVALID);
  const ids = new Set();
  for (const q of snapshot.questions) {
    if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id) ||
        !Array.isArray(q.options) || q.options.length !== 2 ||
        !validQuestions([{text:q.questionText,left:q.options[0],right:q.options[1],correct:q.correctAnswer}]) ||
        (q.extra !== undefined && (!q.extra || Array.isArray(q.extra) || typeof q.extra !== 'object'))) throw Error(INVALID);
    ids.add(q.id);
  }
  checkMetadata(snapshot);
  return freeze(snapshot);
}

export function questionsFromSnapshot(snapshot) {
  return freeze(snapshot.questions.map(q => ({...q.extra, id:q.id, text:q.questionText,
    left:q.options[0], right:q.options[1], correct:q.correctAnswer})));
}

function encode64(bytes) {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decode64(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw Error(INVALID);
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

async function readLimited(stream, limit) {
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {await reader.cancel(); throw Error(TOO_LARGE);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {result.set(chunk, offset); offset += chunk.length;}
  return result;
}

export async function createShareLink(baseURL, questions, title = '', settings = {}) {
  if (typeof CompressionStream !== 'function') throw Error('Hãy cập nhật trình duyệt để tạo link học sinh.');
  const snapshot = createSnapshot(questions, title, settings);
  const bytes = await readLimited(new Blob([JSON.stringify(snapshot)]).stream()
    .pipeThrough(new CompressionStream('gzip')), MAX_SNAPSHOT_BYTES);
  const url = new URL(baseURL);
  url.search = '';
  url.hash = '';
  url.searchParams.set('v', SHARE_VERSION);
  url.searchParams.set('quiz', snapshot.quizId);
  url.hash = 'data=1.' + encode64(bytes);
  if (url.href.length > MAX_SHARE_URL_LENGTH) throw Error(TOO_LARGE);
  return Object.freeze({url:url.href, snapshot});
}

export function hasSharedQuiz(url) {
  const u = new URL(url), hash = new URLSearchParams(u.hash.slice(1));
  return u.searchParams.has('quiz') || u.searchParams.has('data') || hash.has('data');
}

export async function loadSharedQuiz(url) {
  try {
    const u = new URL(url), hash = new URLSearchParams(u.hash.slice(1));
    if (u.href.length > MAX_SHARE_URL_LENGTH || u.searchParams.getAll('quiz').length !== 1 ||
        hash.getAll('data').length !== 1 || u.searchParams.has('data')) throw Error(INVALID);
    const payload = hash.get('data');
    if (!payload.startsWith('1.') || typeof DecompressionStream !== 'function') throw Error(INVALID);
    const packed = decode64(payload.slice(2));
    const bytes = await readLimited(new Blob([packed]).stream()
      .pipeThrough(new DecompressionStream('gzip')), MAX_SNAPSHOT_BYTES);
    const snapshot = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    return validateSnapshot(snapshot, u.searchParams.get('quiz'));
  } catch {throw Error(INVALID);}
}
