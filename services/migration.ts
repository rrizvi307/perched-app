/**
 * Data migration utilities for Perched app
 *
 * Handles backward compatibility during data schema changes
 */

/**
 * Convert old 3-level noise scale to new 5-level scale
 *
 * Migration mapping:
 * - 'quiet' → 2 (quiet but not silent)
 * - 'moderate' → 3 (balanced)
 * - 'lively' → 4 (energetic but not loud)
 *
 * @param old - Old noise level (string) or new (number)
 * @returns Numeric noise level (1-5)
 */
export function convertNoiseLevel(old: string | number): number {
	if (typeof old === 'number') return old; // Already migrated

	switch (old) {
		case 'quiet':
			return 2;
		case 'moderate':
			return 3;
		case 'lively':
			return 4;
		default:
			return 3; // Default to moderate if unknown
	}
}
