const HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i

/** "#rrggbb" to the "r g b" triplet the tokens store; anything else passes through. */
export function hexToTriplet(value: string): string {
  const match = HEX.exec(value)
  if (!match) return value
  return match
    .slice(1)
    .map((part) => parseInt(part, 16))
    .join(' ')
}

export function tripletToHex(value: string): string {
  const parts = value.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return '#000000'
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`
}
