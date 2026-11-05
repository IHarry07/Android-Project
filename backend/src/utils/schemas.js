const { z } = require('zod');
const { normalizePhone } = require('./phone');

const loginId = z
  .string({ error: '아이디를 입력해 주세요.' })
  .regex(/^[a-z0-9_]{4,20}$/, '아이디는 영문 소문자, 숫자, 밑줄(_)로 4~20자여야 합니다.');

const password = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, '비밀번호가 너무 깁니다.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), '비밀번호에는 영문자와 숫자가 모두 들어가야 합니다.');

const name = z
  .string({ error: '이름을 입력해 주세요.' })
  .trim()
  .min(1, '이름을 입력해 주세요.')
  .max(50, '이름은 50자 이하여야 합니다.');

const nickname = z
  .string({ error: '닉네임을 입력해 주세요.' })
  .trim()
  .regex(/^[가-힣a-zA-Z0-9_]{2,20}$/, '닉네임은 한글, 영문, 숫자, 밑줄(_)로 2~20자여야 합니다.');

const phone = z
  .string({ error: '전화번호를 입력해 주세요.' })
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: '전화번호 형식이 올바르지 않습니다.' });
      return z.NEVER;
    }
    return normalized;
  });

const accountInfo = z
  .string({ error: '계좌 정보를 입력해 주세요.' })
  .trim()
  .min(5, '계좌 정보는 5자 이상 입력해 주세요.')
  .max(100, '계좌 정보는 100자 이하여야 합니다.')
  .refine((v) => /\d{4,}/.test(v.replace(/[-\s]/g, '')), '계좌번호(숫자)가 포함되어야 합니다.');

const birthDate = z
  .string({ error: '생년월일을 입력해 주세요.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, '생년월일은 YYYY-MM-DD 형식이어야 합니다.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, '존재하지 않는 날짜입니다.')
  .refine((v) => v >= '1900-01-01' && v <= new Date().toISOString().slice(0, 10), '생년월일이 올바르지 않습니다.');

const gender = z.enum(['MALE', 'FEMALE', 'OTHER'], { error: '성별은 MALE, FEMALE, OTHER 중 하나여야 합니다.' });

const roomName = z
  .string({ error: '방 이름을 입력해 주세요.' })
  .trim()
  .min(1, '방 이름을 입력해 주세요.')
  .max(100, '방 이름은 100자 이하여야 합니다.');

const capacity = z
  .number({ error: '정원은 숫자여야 합니다.' })
  .int('정원은 정수여야 합니다.')
  .min(2, '정원은 2명 이상이어야 합니다.')
  .max(10, '정원은 10명 이하여야 합니다.');

const inviteCode = z
  .string({ error: '초대 코드를 입력해 주세요.' })
  .trim()
  .min(4, '초대 코드를 확인해 주세요.')
  .max(64, '초대 코드를 확인해 주세요.');

const expiresInDays = z
  .number({ error: '유효 기간은 숫자여야 합니다.' })
  .int('유효 기간은 정수여야 합니다.')
  .min(1, '유효 기간은 1일 이상이어야 합니다.')
  .max(30, '유효 기간은 30일 이하여야 합니다.');

const positiveId = z.coerce.number().int().positive();
const idParam = z.object({
  roomId: positiveId.optional(),
  userId: positiveId.optional(),
  itemId: positiveId.optional(),
  scheduleId: positiveId.optional(),
  taskId: positiveId.optional(),
  expenseId: positiveId.optional(),
  notificationId: positiveId.optional(),
});

const listNotifications = z.object({
  filter: z.enum(['all', 'unread', 'read'], { error: 'filter는 all, unread, read 중 하나여야 합니다.' }).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  beforeId: z.coerce.number().int().positive().optional(),
});

const leaveQuery = z.object({
  sharedItems: z.enum(['TRANSFER', 'DELETE'], { error: 'sharedItems는 TRANSFER 또는 DELETE여야 합니다.' }).optional(),
});

const nonEmpty = (v) => Object.keys(v).length > 0;
const NOTHING_TO_UPDATE = '수정할 항목이 없습니다.';

// ---- 날짜·시각 ----
const dateOnly = (label) => z
  .string({ error: `${label}을(를) 입력해 주세요.` })
  .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식이어야 합니다.`)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, `${label}이(가) 존재하지 않는 날짜입니다.`);

/** "2026-11-06T09:00", "2026-11-06 09:00:00" 모두 받아 "YYYY-MM-DD HH:mm:ss"로 맞춘다. */
const dateTime = (label) => z
  .string({ error: `${label}을(를) 입력해 주세요.` })
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, `${label}은(는) YYYY-MM-DD HH:mm 형식이어야 합니다.`)
  .transform((v) => {
    const s = v.replace('T', ' ');
    return s.length === 16 ? `${s}:00` : s;
  })
  .refine((v) => {
    const d = new Date(`${v.replace(' ', 'T')}Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19).replace('T', ' ') === v;
  }, `${label}이(가) 존재하지 않는 시각입니다.`);

const limit = (def, max) => z.coerce.number().int().min(1).max(max).default(def);

// ---- 물품 ----
const itemName = z.string({ error: '물품 이름을 입력해 주세요.' }).trim().min(1, '물품 이름을 입력해 주세요.').max(100, '물품 이름은 100자 이하여야 합니다.');
const itemCategory = z.enum(['FOOD', 'SUPPLY'], { error: 'category는 FOOD 또는 SUPPLY여야 합니다.' });
const ownershipType = z.enum(['PERSONAL', 'SHARED'], { error: 'ownershipType은 PERSONAL 또는 SHARED여야 합니다.' });
const quantity = z.number({ error: '수량은 숫자여야 합니다.' }).min(0, '수량은 0 이상이어야 합니다.').max(99999999.99, '수량이 너무 큽니다.');
const optText = (max, label) => z.string().trim().max(max, `${label}은(는) ${max}자 이하여야 합니다.`).nullable();
const itemStatus = z.enum(['STORED', 'USED_UP', 'DISCARDED'], { error: 'status는 STORED, USED_UP, DISCARDED 중 하나여야 합니다.' });

const createItem = z.object({
  name: itemName,
  category: itemCategory,
  ownershipType,
  quantity: quantity.optional().default(1),
  unit: optText(20, '단위').optional(),
  expiryDate: dateOnly('유통기한').nullable().optional(),
  barcode: optText(100, '바코드').optional(),
  storageLocation: optText(50, '보관 위치').optional(),
});

const updateItem = z.object({
  name: itemName.optional(),
  category: itemCategory.optional(),
  ownershipType: ownershipType.optional(),
  quantity: quantity.optional(),
  unit: optText(20, '단위').optional(),
  expiryDate: dateOnly('유통기한').nullable().optional(),
  barcode: optText(100, '바코드').optional(),
  storageLocation: optText(50, '보관 위치').optional(),
  status: itemStatus.optional(),
}).refine(nonEmpty, NOTHING_TO_UPDATE);

const adjustItem = z.object({
  delta: z.number({ error: 'delta는 숫자여야 합니다.' }).refine((v) => v !== 0, 'delta는 0이 될 수 없습니다.')
    .refine((v) => Math.abs(v) <= 99999999.99, 'delta가 너무 큽니다.'),
});

const listItems = z.object({
  scope: z.enum(['all', 'mine', 'shared']).default('all'),
  status: z.enum(['STORED', 'USED_UP', 'DISCARDED', 'ALL']).default('STORED'),
  category: itemCategory.optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  search: z.string().trim().max(50).optional(),
  limit: limit(200, 500),
});

// ---- 일정 ----
const scheduleTitle = z.string({ error: '일정 제목을 입력해 주세요.' }).trim().min(1, '일정 제목을 입력해 주세요.').max(150, '일정 제목은 150자 이하여야 합니다.');

const createSchedule = z.object({
  title: scheduleTitle,
  startAt: dateTime('시작 시각'),
  endAt: dateTime('종료 시각'),
}).refine((v) => v.endAt >= v.startAt, { message: '종료 시각은 시작 시각 이후여야 합니다.', path: ['endAt'] });

const updateSchedule = z.object({
  title: scheduleTitle.optional(),
  startAt: dateTime('시작 시각').optional(),
  endAt: dateTime('종료 시각').optional(),
}).refine(nonEmpty, NOTHING_TO_UPDATE);

const listSchedules = z.object({
  from: dateOnly('시작 날짜').optional(),
  to: dateOnly('종료 날짜').optional(),
  limit: limit(300, 500),
}).refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'to는 from 이후여야 합니다.', path: ['to'] });

// ---- 청소 ----
const areaName = z.string({ error: '청소 항목을 입력해 주세요.' }).trim().min(1, '청소 항목을 입력해 주세요.').max(100, '청소 항목은 100자 이하여야 합니다.');
const repeatType = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'], { error: 'repeatType은 NONE, DAILY, WEEKLY, MONTHLY 중 하나여야 합니다.' });
const repeatInterval = z.number({ error: '반복 간격은 숫자여야 합니다.' }).int('반복 간격은 정수여야 합니다.').min(1, '반복 간격은 1 이상이어야 합니다.').max(365, '반복 간격은 365 이하여야 합니다.');
const memo = z.string().trim().max(255, '메모는 255자 이하여야 합니다.').optional();

const createCleaningTask = z.object({
  areaName,
  assigneeUserId: z.number().int().positive().nullable().optional(),
  nextDueDate: dateOnly('청소 날짜'),
  repeatType: repeatType.optional().default('NONE'),
  repeatInterval: repeatInterval.optional().default(1),
});

const updateCleaningTask = z.object({
  areaName: areaName.optional(),
  assigneeUserId: z.number().int().positive().nullable().optional(),
  nextDueDate: dateOnly('청소 날짜').optional(),
  repeatType: repeatType.optional(),
  repeatInterval: repeatInterval.optional(),
  isActive: z.boolean().optional(),
}).refine(nonEmpty, NOTHING_TO_UPDATE);

const listCleaningTasks = z.object({
  active: z.enum(['true', 'false', 'all']).default('true'),
  dueBy: dateOnly('기준 날짜').optional(),
});

// dueDate는 앱 화면에 보이던 예정일이다. 그 사이 다른 사람이 먼저 처리했다면 STALE_DUE_DATE로 거절한다.
const cleaningAction = z.object({ dueDate: dateOnly('예정일').optional(), memo });
const postponeCleaning = z.object({
  dueDate: dateOnly('예정일').optional(),
  postponedTo: dateOnly('미룰 날짜'),
  memo,
});
const listCleaningRecords = z.object({ limit: limit(50, 200) });

// ---- 지출 ----
const expenseTitle = z.string({ error: '지출 항목을 입력해 주세요.' }).trim().min(1, '지출 항목을 입력해 주세요.').max(100, '지출 항목은 100자 이하여야 합니다.');
const amount = z.number({ error: '금액은 숫자여야 합니다.' }).int('금액은 원 단위 정수여야 합니다.').min(1, '금액은 1원 이상이어야 합니다.').max(1000000000, '금액이 너무 큽니다.');
const shareList = z.array(z.object({
  userId: z.number({ error: '분담 회원번호가 필요합니다.' }).int().positive(),
  amount: z.number({ error: '분담 금액은 숫자여야 합니다.' }).int('분담 금액은 원 단위 정수여야 합니다.').min(0, '분담 금액은 0 이상이어야 합니다.').max(1000000000),
})).min(1, '분담할 사람이 한 명 이상 필요합니다.').max(10, '분담 인원이 너무 많습니다.');
const participantList = z.array(z.number().int().positive()).min(1, '분담할 사람이 한 명 이상 필요합니다.').max(10, '분담 인원이 너무 많습니다.');

const createExpense = z.object({
  title: expenseTitle,
  amount,
  expenseDate: dateOnly('지출 날짜'),
  shares: shareList.optional(),
  participantUserIds: participantList.optional(),
}).refine((v) => (v.shares === undefined) !== (v.participantUserIds === undefined), {
  message: 'shares(금액 직접 지정) 또는 participantUserIds(균등 분담) 중 하나만 보내 주세요.',
  path: ['shares'],
});

const updateExpense = z.object({
  title: expenseTitle.optional(),
  amount: amount.optional(),
  expenseDate: dateOnly('지출 날짜').optional(),
  shares: shareList.optional(),
  participantUserIds: participantList.optional(),
}).refine(nonEmpty, NOTHING_TO_UPDATE)
  .refine((v) => !(v.shares !== undefined && v.participantUserIds !== undefined), {
    message: 'shares와 participantUserIds는 함께 보낼 수 없습니다.',
    path: ['shares'],
  });

const listExpenses = z.object({
  from: dateOnly('시작 날짜').optional(),
  to: dateOnly('종료 날짜').optional(),
  limit: limit(100, 300),
}).refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'to는 from 이후여야 합니다.', path: ['to'] });

const settleShare = z.object({ isSettled: z.boolean({ error: 'isSettled는 true 또는 false여야 합니다.' }) });

module.exports = {
  signup: z.object({ loginId, password, name, nickname, phone, accountInfo, birthDate, gender }),
  login: z.object({
    loginId: z.string({ error: '아이디를 입력해 주세요.' }).min(1, '아이디를 입력해 주세요.'),
    password: z.string({ error: '비밀번호를 입력해 주세요.' }).min(1, '비밀번호를 입력해 주세요.'),
    keepLogin: z.boolean().optional().default(false),
  }),
  checkLoginId: z.object({ loginId }),
  checkNickname: z.object({ nickname }),
  updateMe: z
    .object({ name: name.optional(), nickname: nickname.optional(), phone: phone.optional() })
    .refine((v) => Object.keys(v).length > 0, '수정할 항목이 없습니다.'),
  changePassword: z.object({
    currentPassword: z.string({ error: '현재 비밀번호를 입력해 주세요.' }).min(1, '현재 비밀번호를 입력해 주세요.'),
    newPassword: password,
  }),
  changeAccount: z.object({
    currentPassword: z.string({ error: '현재 비밀번호를 입력해 주세요.' }).min(1, '현재 비밀번호를 입력해 주세요.'),
    accountInfo,
  }),
  createRoom: z.object({
    roomName,
    capacity: capacity.optional().default(10),
    inviteExpiresInDays: expiresInDays.optional(),
  }),
  updateRoom: z
    .object({ roomName: roomName.optional(), capacity: capacity.optional() })
    .refine((v) => Object.keys(v).length > 0, '수정할 항목이 없습니다.'),
  joinRoom: z.object({ code: inviteCode }),
  newInvite: z.object({ expiresInDays: expiresInDays.optional() }),
  transferOwner: z.object({
    userId: z.number({ error: '새 방장의 회원번호가 필요합니다.' }).int().positive(),
  }),
  idParam,
  listNotifications,
  leaveQuery,
  createItem, updateItem, adjustItem, listItems,
  createSchedule, updateSchedule, listSchedules,
  createCleaningTask, updateCleaningTask, listCleaningTasks,
  cleaningAction, postponeCleaning, listCleaningRecords,
  createExpense, updateExpense, listExpenses, settleShare,
};
