const { validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    errors: errors.array()
  });
};

module.exports = {
  handleValidationErrors
};
