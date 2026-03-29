/**
 * Form validation utility.
 * Provides reusable validation rules and a validateForm() function
 * that can be used across all form pages (reservations, products, users, etc.).
 */
import DOMPurify from 'dompurify';

export const sanitizeHtml = (html) => {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'class', 'style']
  });
};

export const sanitizeText = (text) => {
  if (typeof text !== 'string') return text;
  if (!text) return '';
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] }).trim();
};

// ── Predefined Patterns ──────────────────────────────────────
const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[\d\s+\-().]{10,}$/,
  alphaSpace: /^[a-zA-ZÀ-ÿ\s'-]+$/,
  alphaNumeric: /^[a-zA-Z0-9\s]+$/,
  url: /^https?:\/\/.+/,
  currency: /^\d+(\.\d{1,2})?$/,
};

// ── Validation Rule Sets ─────────────────────────────────────

export const reservationRules = {
  customer: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: 'Customer name is required (2-100 characters)',
  },
  productName: {
    required: true,
    minLength: 2,
    message: 'Product name is required',
  },
  reservationDate: {
    required: true,
    validate: (val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d >= new Date(new Date().toDateString());
    },
    message: 'A valid current or future date is required',
  },
  size: {
    required: true,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'],
    message: 'Please select a valid size',
  },
};

export const productRules = {
  name: {
    required: true,
    minLength: 2,
    maxLength: 200,
    message: 'Product name is required (2-200 characters)',
  },
  price: {
    required: true,
    validate: (val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0;
    },
    message: 'Price must be a positive number',
  },
  category: {
    required: true,
    message: 'Please select a category',
  },
  imageUrl: {
    pattern: PATTERNS.url,
    message: 'Image URL must start with http:// or https://',
  },
};

export const userRules = {
  email: {
    required: true,
    pattern: PATTERNS.email,
    message: 'A valid email address is required',
  },
  firstName: {
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: PATTERNS.alphaSpace,
    message: 'First name is required (letters only)',
  },
  lastName: {
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: PATTERNS.alphaSpace,
    message: 'Last name is required (letters only)',
  },
  phone: {
    pattern: PATTERNS.phone,
    message: 'Phone number must be at least 10 digits',
  },
};

// ── Core Validator ───────────────────────────────────────────

/**
 * Validate form data against a rule set.
 * @param {Object} formData — key-value pairs of form fields
 * @param {Object} rules    — rule definitions (see above)
 * @returns {{ isValid: boolean, errors: Object }} — errors keyed by field name
 *
 * @example
 *   const { isValid, errors } = validateForm({ name: '', price: -1 }, productRules);
 *   // isValid → false
 *   // errors  → { name: 'Product name is required...', price: 'Price must be...' }
 */
export function validateForm(formData, rules) {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field];
    const isEmpty = value === undefined || value === null || String(value).trim() === '';

    // Required check
    if (fieldRules.required && isEmpty) {
      errors[field] = fieldRules.message || `${field} is required`;
      continue;
    }

    // Skip further checks if optional and empty
    if (isEmpty) continue;

    const strValue = String(value).trim();

    // Min length
    if (fieldRules.minLength && strValue.length < fieldRules.minLength) {
      errors[field] =
        fieldRules.message || `${field} must be at least ${fieldRules.minLength} characters`;
      continue;
    }

    // Max length
    if (fieldRules.maxLength && strValue.length > fieldRules.maxLength) {
      errors[field] =
        fieldRules.message || `${field} must be at most ${fieldRules.maxLength} characters`;
      continue;
    }

    // Pattern
    if (fieldRules.pattern && !fieldRules.pattern.test(strValue)) {
      errors[field] = fieldRules.message || `${field} has an invalid format`;
      continue;
    }

    // Enum
    if (fieldRules.enum && !fieldRules.enum.includes(value)) {
      errors[field] =
        fieldRules.message || `${field} must be one of: ${fieldRules.enum.join(', ')}`;
      continue;
    }

    // Custom validator
    if (fieldRules.validate && !fieldRules.validate(value)) {
      errors[field] = fieldRules.message || `${field} is invalid`;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * Quick single-field validators for inline use.
 */
export const validators = {
  isValidEmail: (email) => PATTERNS.email.test(email),
  isValidPhone: (phone) => PATTERNS.phone.test(phone?.replace(/\D/g, '')),
  isValidUrl: (url) => !url || PATTERNS.url.test(url),
  isPositiveNumber: (val) => !isNaN(Number(val)) && Number(val) > 0,
  isNotEmpty: (val) => val !== undefined && val !== null && String(val).trim() !== '',
  sanitizeText,
  sanitizeHtml,
};
