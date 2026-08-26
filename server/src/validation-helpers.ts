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
