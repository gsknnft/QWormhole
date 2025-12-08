

/**
 * Parses a hexadecimal string for correctness and returns it with or without
 * '0x' prefix, and/or with the specified byte length
 * @param a - the string with an hexadecimal number to be parsed
 * @param prefix0x - set to true to prefix the output with '0x'
 * @param byteLength - pad the output to have the desired byte length. Notice
 * that the hex length is double the byte length.
 *
 * @returns
 *
 * @throws RangeError if input string does not hold an hexadecimal number
 * @throws RangeError if requested byte length is less than the input byte length
 */
export function parseHex(
  a: string,
  prefix0x = false,
  byteLength?: number
): string {
  const hexMatch = a.match(/^(0x)?([\da-fA-F]+)$/);
  if (hexMatch == null) {
    throw new RangeError(
      "input must be a hexadecimal string, e.g. '0x124fe3a' or '0214f1b2'"
    );
  }
  let hex = hexMatch[2];
  if (byteLength !== undefined) {
    if (byteLength < hex.length / 2) {
      throw new RangeError(
        `expected byte length ${byteLength} < input hex byte length ${Math.ceil(
          hex.length / 2
        )}`
      );
    }
    hex = hex.padStart(byteLength * 2, "0");
  }
  return prefix0x ? "0x" + hex : hex;
}

/**
 * Converts a hexadecimal string to a bigint
 *
 * @param hexStr
 *
 * @returns a bigint
 *
 * @throws RangeError if input string does not hold an hexadecimal number
 */
export function hexToBigint(hexStr: string): bigint {
  return BigInt(parseHex(hexStr, true));
}


/**
 * Converts a non-negative bigint to a hexadecimal string
 * @param a - a non negative bigint
 * @param prefix0x - set to true to prefix the output with '0x'
 * @param byteLength - pad the output to have the desired byte length. Notice
 * that the hex length is double the byte length.
 *
 * @returns hexadecimal representation of the input bigint
 *
 * @throws RangeError if a < 0
 */
export function bigintToHex(
  a: bigint,
  prefix0x = false,
  byteLength?: number
): string {
  if (a < 0) {
    throw RangeError(
      "a should be a non-negative integer. Negative values are not supported"
    );
  }
  return parseHex(a.toString(16), prefix0x, byteLength);
}
