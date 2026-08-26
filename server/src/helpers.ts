export function isIntegerOutsideRange(value: string | undefined, min: bigint, max: bigint): boolean {
    if (!value || !/^-?\d+$/.test(value)) return false;
    const integer = BigInt(value);
    return integer < min || integer > max;
}

export function isValidInteger(value: string | undefined, min: bigint, max: bigint): boolean {
    return !!value && /^-?\d+$/.test(value) && !isIntegerOutsideRange(value, min, max);
}

export function getTokenRange(line: number, lineText: string, token: string | undefined, tokenIndex?: number) {
    if (!token) return { start: { line, character: 0 }, end: { line, character: lineText.length } };
    let start = -1;
    if (tokenIndex !== undefined) {
        const tokenRegex = /\S+/g;
        let match: RegExpExecArray | null;
        let currentIndex = 0;
        while ((match = tokenRegex.exec(lineText)) !== null) {
            if (currentIndex === tokenIndex) {
                start = match.index;
                break;
            }
            currentIndex++;
        }
    } else {
        const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = lineText.match(new RegExp(`(?:^|\\s)${escapedToken}(?=\\s|$)`));
        start = match?.index === undefined ? -1 : match.index + match[0].length - token.length;
    }
    const safeStart = start >= 0 ? start : 0;
    return {
        start: { line, character: safeStart },
        end: { line, character: safeStart + token.length },
    };
}

const HASH_MAX = 65536;

export function HashUint32(num: number): number {
    let n = BigInt(num) & 0xFFFFFFFFn;
    n = (n + 1n) & 0xFFFFFFFFn;
    n = (n ^ (n >> 17n)) & 0xFFFFFFFFn;
    n = (n * 0xed5ad4bbn) & 0xFFFFFFFFn;
    n = (n ^ (n >> 11n)) & 0xFFFFFFFFn;
    n = (n * 0xac4c1b51n) & 0xFFFFFFFFn;
    n = (n ^ (n >> 15n)) & 0xFFFFFFFFn;
    n = (n * 0x31848babn) & 0xFFFFFFFFn;
    n = (n ^ (n >> 14n)) & 0xFFFFFFFFn;
    return Number(n);
}

export function HashLocation(seed: number, run: number, rule: number, x: number, y: number): number {
    const prime = 31n;
    let hash = 1n;

    hash = (hash * prime + BigInt(HashUint32(seed))) & 0xFFFFFFFFn;
    hash = (hash * prime + BigInt(HashUint32(run))) & 0xFFFFFFFFn;
    hash = (hash * prime + BigInt(HashUint32(rule))) & 0xFFFFFFFFn;
    hash = (hash * prime + BigInt(HashUint32(x))) & 0xFFFFFFFFn;
    hash = (hash * prime + BigInt(HashUint32(y))) & 0xFFFFFFFFn;

    const finalHash = HashUint32(Number((hash * prime) & 0xFFFFFFFFn));
    return finalHash % HASH_MAX;
}
