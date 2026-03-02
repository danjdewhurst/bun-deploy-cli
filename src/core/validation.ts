/**
 * Validation and sanitisation utilities
 */

/** Valid name pattern: alphanumeric, hyphens, underscores */
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Valid branch name pattern */
const VALID_BRANCH_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

/** Valid git URL pattern */
// Git URL pattern for future use in stricter validation
// const VALID_GIT_URL_PATTERN = /^(https?:\/\/|git@)[\w.-]+[/:][\w.-]+\/[\w.-]+(?:\.git)?$/;

/**
 * Validates an app or server name
 * Names must contain only alphanumeric characters, hyphens, and underscores
 */
export function validateName(
  name: string,
  type: "app" | "server",
): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: `${type} name is required` };
  }
  if (name.length > 64) {
    return { valid: false, error: `${type} name must be 64 characters or less` };
  }
  if (!VALID_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: `${type} name must contain only letters, numbers, hyphens, and underscores`,
    };
  }
  if (name.startsWith("-") || name.startsWith("_")) {
    return { valid: false, error: `${type} name cannot start with a hyphen or underscore` };
  }
  return { valid: true };
}

/**
 * Validates a git branch name
 */
export function validateBranchName(branch: string): { valid: boolean; error?: string } {
  if (!branch || branch.length === 0) {
    return { valid: false, error: "Branch name is required" };
  }
  if (branch.length > 255) {
    return { valid: false, error: "Branch name must be 255 characters or less" };
  }
  if (!VALID_BRANCH_PATTERN.test(branch)) {
    return { valid: false, error: "Branch name contains invalid characters" };
  }
  if (branch.startsWith("/") || branch.endsWith("/")) {
    return { valid: false, error: "Branch name cannot start or end with a slash" };
  }
  return { valid: true };
}

/**
 * Validates a git repository URL
 */
export function validateGitUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.length === 0) {
    return { valid: false, error: "Git repository URL is required" };
  }
  // Basic validation - URL should start with http/https/git@ and contain no spaces
  if (url.includes(" ") || url.includes("\t")) {
    return { valid: false, error: "Git URL cannot contain whitespace" };
  }
  if (url.includes(";") || url.includes("|") || url.includes("&") || url.includes("$")) {
    return { valid: false, error: "Git URL contains invalid shell characters" };
  }
  // Check for common injection patterns
  if (url.includes("`") || url.includes("$(")) {
    return { valid: false, error: "Git URL contains invalid characters" };
  }
  return { valid: true };
}

/**
 * Validates a port number
 */
export function validatePort(port: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(port)) {
    return { valid: false, error: "Port must be an integer" };
  }
  if (port < 1 || port > 65535) {
    return { valid: false, error: "Port must be between 1 and 65535" };
  }
  // Reserved ports (well-known ports)
  if (port < 1024) {
    return { valid: false, error: "Ports below 1024 require root privileges" };
  }
  return { valid: true };
}

/**
 * Validates environment variable key
 * Keys should be alphanumeric with underscores, starting with a letter or underscore
 */
export function validateEnvKey(key: string): { valid: boolean; error?: string } {
  if (!key || key.length === 0) {
    return { valid: false, error: "Environment variable key is required" };
  }
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!validPattern.test(key)) {
    return { valid: false, error: "Invalid environment variable key format" };
  }
  return { valid: true };
}

/**
 * Escapes a string for use in shell commands
 * Handles single quotes by using the '$'"...""'"... pattern
 */
export function shellEscape(str: string): string {
  // Use single quotes and escape any single quotes in the string
  // ' -> '\'' (close quote, add escaped quote, open quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Escapes a string for use in double-quoted shell contexts
 */
export function shellEscapeDouble(str: string): string {
  // Escape $, `, ", \, and !
  return str.replace(/([$`"\\!])/g, "\\$1");
}

/**
 * Validates and sanitises a path component to prevent directory traversal
 */
export function sanitisePathComponent(component: string): {
  valid: boolean;
  sanitised?: string;
  error?: string;
} {
  if (!component) {
    return { valid: false, error: "Path component is required" };
  }

  // Remove any path traversal attempts
  let sanitised = component.replace(/\.\.[/\\]/g, "");
  sanitised = sanitised.replace(/[/\\]\.\./g, "");

  // Check for remaining traversal patterns
  if (sanitised.includes("..") || sanitised.startsWith("/") || sanitised.startsWith("\\")) {
    return { valid: false, error: "Path component contains invalid characters" };
  }

  return { valid: true, sanitised };
}

/**
 * Escapes a string for use in MySQL commands
 * Only escapes double quotes (for shell context) - proper escaping should use prepared statements
 */
export function mysqlEscape(str: string): string {
  // Escape double quotes and backslashes for shell context
  return str.replace(/["\\]/g, "\\$&");
}
