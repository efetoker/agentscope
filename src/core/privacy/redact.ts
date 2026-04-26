const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_-]*)\s*[:=]\s*["']?[^"'\s]+["']?/gi;
const TOKEN_PREFIX_PATTERN = /\b(?:sk|ghp|xoxb|xoxp|xoxa|xoxr)[-_][A-Za-z0-9_-]{8,}\b/g;
const POSIX_USER_PATH_PATTERN = /\/(Users|home)\/([^/\s"']+)(?=\/|\s|$)/g;
const WINDOWS_USER_PATH_PATTERN = /\b([A-Za-z]:\\Users\\)([^\\\s"']+)(?=\\|\s|$)/g;

export function redactPreview(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[redacted-secret]')
    .replace(TOKEN_PREFIX_PATTERN, '[redacted-secret]')
    .replace(POSIX_USER_PATH_PATTERN, '/$1/[redacted-user]')
    .replace(WINDOWS_USER_PATH_PATTERN, '$1[redacted-user]');
}
