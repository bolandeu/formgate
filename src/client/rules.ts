// The field rules the server checks, from one data file that the Lite defaults read too.
import fieldRules from '../../lite/src/Settings/field-rules.json' with { type: 'json' };

export const rules = {
  phoneDigitsMin: fieldRules.phone_digits_min,
  phoneDigitsMax: fieldRules.phone_digits_max,
  maxValueLength: fieldRules.max_value_length,
  maxFields: fieldRules.max_fields,
  maxMetaFields: fieldRules.max_meta_fields,
  maxMetaValueLength: fieldRules.max_meta_value_length,
  maxBodyBytes: fieldRules.max_body_bytes,
};

// The address syntax of PHP filter_var FILTER_VALIDATE_EMAIL with FILTER_FLAG_EMAIL_UNICODE (php-src
// ext/filter/logical_filters.c): unicode letters only in the local part, an ASCII or punycode domain whose last label
// starts with a letter, or an IP literal. The server also wants a dot in the domain.
const localUnit = String.raw`(?:\x22?\x5C[\x00-\x7E]\x22?|\x22?[^\x5C\x22]\x22?)`;
const atom = String.raw`[\x21\x23-\x27\x2A\x2B\x2D\x2F-\x39\x3D\x3F\x5E-\x7E\p{L}\p{N}]+`;
const quoted = String.raw`\x22(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F\p{L}\p{N}]|\x5C[\x00-\x7F])*\x22`;
const word = `(?:${atom}|${quoted})`;
const hostname = String.raw`(?!.*[^.]{64,})(?:(?:xn--)?[a-z0-9]+(?:-+[a-z0-9]+)*\.)+(?:[a-z][a-z0-9]*|xn--[a-z0-9]+)(?:-+[a-z0-9]+)*`;
const hex = '[a-f0-9]{1,4}';
const ipv6Full = String.raw`IPv6:(?:${hex}(?::${hex}){7}|(?!(?:.*[a-f0-9][:\]]){7,})(?:${hex}(?::${hex}){0,5})?::(?:${hex}(?::${hex}){0,5})?)`;
const ipv6Prefix = String.raw`IPv6:(?:${hex}(?::${hex}){5}:|(?!(?:.*[a-f0-9]:){5,})(?:${hex}(?::${hex}){0,3})?::(?:${hex}(?::${hex}){0,3}:)?)`;
const octet = '(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])';
const ipv4 = String.raw`(?:${ipv6Prefix})?${octet}(?:\.${octet}){3}`;
const domain = String.raw`(?:${hostname}|\[(?:${ipv6Full}|${ipv4})\])`;
const address = new RegExp(
  String.raw`^(?!${localUnit}{255,})(?!${localUnit}{65,}@)${word}(?:\.${word})*@${domain}$`,
  'iu',
);
const maxAddressBytes = 320;

export function checkPhone(value: string) {
  const digits = value.replace(/\D/g, '').length;
  return digits >= rules.phoneDigitsMin && digits <= rules.phoneDigitsMax;
}

export function checkEmail(value: string) {
  const domainPart = value.slice(value.lastIndexOf('@') + 1);
  return new TextEncoder().encode(value).length <= maxAddressBytes && address.test(value) && domainPart.includes('.');
}
