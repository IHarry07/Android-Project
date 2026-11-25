const { AppError } = require('../utils/errors');

/** zod 스키마로 req[source]를 검사하고, 통과한 값으로 교체한다. source: body | query | params */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return next(new AppError(400, 'VALIDATION_ERROR', details[0]?.message || '입력값이 올바르지 않습니다.', details));
  }
  req[source] = result.data;
  return next();
};

module.exports = { validate };
