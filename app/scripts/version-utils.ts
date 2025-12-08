/**
 * Simple version utilities without external dependencies
 */

/**
 * Extract clean version number from a version string
 * Handles: "^1.2.3", "~1.2.3", "1.2.3", "v1.2.3", ">=1.2.3"
 */
export function cleanVersion(version: string | undefined): string | null {
  if (!version) return null;
  
  // Remove common prefixes and operators
  const cleaned = version.replace(/^[\^~>=<v]+/, '').trim();
  
  // Match semver pattern (x.y.z with optional suffixes)
  const match = cleaned.match(/^(\d+\.\d+\.\d+)/);
  
  return match ? match[1] : cleaned;
}

/**
 * Compare two version strings
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] || 0;
    const bNum = bParts[i] || 0;
    
    if (aNum < bNum) return -1;
    if (aNum > bNum) return 1;
  }
  
  return 0;
}

/**
 * Check if version string is valid
 */
export function isValidVersion(version: string): boolean {
  const cleaned = cleanVersion(version);
  return cleaned !== null && /^\d+\.\d+\.\d+/.test(cleaned);
}

export default {
  clean: cleanVersion,
  compare: compareVersions,
  isValid: isValidVersion,
};
