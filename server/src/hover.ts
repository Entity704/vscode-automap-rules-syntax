import type { Hover, TextDocumentPositionParams } from 'vscode-languageserver/node';
import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { deflateSync } from 'node:zlib';
import { hashLocation } from './helpers.js';

const modifierNames: Record<string, string> = {
    XFLIP: '水平翻转',
    YFLIP: '垂直翻转',
    ROTATE: '旋转',
    NONE: '不翻转',
};

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+.!|<>-]/g, '\\$&');
}

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBytes.copy(chunk, 4);
    Buffer.from(data).copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.length);
    return chunk;
}

function imageMarkdown(label: string, png: Uint8Array): string {
    const dataUri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    return `![${label}](${dataUri})`;
}

function describeIndexCondition(tokens: string[]): string {
    const index = tokens[0] ?? '';
    const indexDescription = index === 'FULL'
        ? '索引不为 0'
        : index === 'EMPTY'
            ? '索引为 0'
            : index === 'INDEX'
                ? `索引为 ${tokens[1] ?? '指定值'}`
                : index === 'NOTINDEX'
                    ? `索引不为 ${tokens[1] ?? '指定值'}`
                    : `索引为 ${index}`;
    const modifierStart = index === 'INDEX' || index === 'NOTINDEX' ? 2 : 1;
    const modifiers = tokens.slice(modifierStart).map((token) => modifierNames[token] ?? token);
    return modifiers.length > 0 ? `${indexDescription} 且 ${modifiers.join(' 与 ')}` : indexDescription;
}

function describePos(line: string): string | null {
    const tokens = line.trim().split(/\s+/);
    if (tokens[0] !== 'Pos' || tokens.length < 4) return null;

    const x = escapeMarkdown(tokens[1] ?? '');
    const y = escapeMarkdown(tokens[2] ?? '');
    const groups: string[] = [];
    let group: string[] = [];
    for (const token of tokens.slice(3)) {
        if (token === 'OR') {
            if (group.length > 0) groups.push(describeIndexCondition(group));
            group = [];
        } else {
            group.push(token);
        }
    }
    if (group.length > 0) groups.push(describeIndexCondition(group));
    if (groups.length === 0) return null;
    return `若偏移 (${x}, ${y}) 处的图块 ${groups.join(' 或 ')}`;
}

function isCommand(line: string): boolean {
    return /^(?:Index|Pos|Random|Modulo|NoDefaultRule|NewRun|NoLayerCopy|\[)/.test(line.trim());
}

function describeIndex(lines: string[], lineNumber: number): string | null {
    const tokens = lines[lineNumber]?.trim().split(/\s+/) ?? [];
    if (tokens[0] !== 'Index' || !tokens[1]) return null;

    const modifiers = tokens.slice(2).map((token) => modifierNames[token] ?? token);
    const target = modifiers.length > 0 ? `索引为 ${escapeMarkdown(tokens[1])} 且 ${modifiers.join(' 与 ')}` : `索引为 ${escapeMarkdown(tokens[1])}`;
    const conditions: string[] = [];
    let hasNoDefaultRule = false;
    for (let i = lineNumber + 1; i < lines.length; i++) {
        const line = lines[i]?.trim() ?? '';
        if (isCommand(line)) {
            if (line.startsWith('Pos')) {
                const condition = describePos(line);
                if (condition) conditions.push(condition);
            } else if (line.startsWith('NoDefaultRule')) {
                hasNoDefaultRule = true;
            } else if (!['NoDefaultRule', 'NoLayerCopy', 'Modulo', 'Random'].includes(line.split(/\s+/)[0]!)) {
                break;
            }
        }
    }
    if (!hasNoDefaultRule) {
        conditions.push('*若当前图块索引不为 0（默认规则）*');
    }
    if (conditions.length === 0) return `若下列条件成立，则放置 ${target} 的图块`;
    return [`若下列条件成立，则放置 ${target} 的图块`, ...conditions.map((condition) => `- ${condition}`)].join('\n');
}

function getIndexPreview(lines: string[], lineNumber: number): { moduloRules: Array<[number, number, number, number]>, probability: number } {
    const moduloRules: Array<[number, number, number, number]> = [];
    let probability = 1;
    for (let i = lineNumber + 1; i < lines.length; i++) {
        const tokens = lines[i]?.trim().split(/\s+/) ?? [];
        const command = tokens[0] ?? '';
        if (command === 'Index' || command === 'NewRun' || command.startsWith('[')) break;
        if (command === 'Modulo' && tokens.length >= 5) {
            const values = tokens.slice(1, 5).map(Number);
            if (values.every(Number.isInteger)) {
                const [modX, modY, offsetX, offsetY] = values;
                if (modX !== undefined && modY !== undefined && offsetX !== undefined && offsetY !== undefined) {
                    moduloRules.push([modX || 1, modY || 1, offsetX, offsetY]);
                }
            }
        } else if (command === 'Random') {
            const value = tokens[1];
            if (value && /^\d+(\.\d+)?%?$/.test(value)) {
                const number = Number.parseFloat(value);
                const nextProbability = value.endsWith('%') ? number / 100 : 1 / number;
                if (Number.isFinite(nextProbability)) probability = nextProbability;
            }
        }
    }
    return { moduloRules, probability: Math.max(0, Math.min(1, probability)) };
}

function createModuloImage(modX: number, modY: number, offsetX: number, offsetY: number): Uint8Array {
    const x = ((-offsetX % modX) + modX) % modX;
    const y = ((-offsetY % modY) + modY) % modY;
    return createPixelImage((pixelX, pixelY) => pixelX % modX === x && pixelY % modY === y);
}

function createPixelImage(pixelAt: (x: number, y: number) => boolean): Uint8Array {
    const rows: number[] = [];
    for (let y = 0; y < 64; y++) {
        rows.push(0);
        for (let byteIndex = 0; byteIndex < 8; byteIndex++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                if (pixelAt(byteIndex * 8 + bit, y)) byte |= 1 << (7 - bit);
            }
            rows.push(byte);
        }
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(64, 0);
    header.writeUInt32BE(64, 4);
    header[8] = 1;
    header[9] = 3;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;
    const palette = Buffer.from([0x44, 0x44, 0x44, 0xee, 0xee, 0xee]);
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('PLTE', palette),
        pngChunk('IDAT', deflateSync(Buffer.from(rows))),
        pngChunk('IEND', new Uint8Array()),
    ]);
}

function createRandomImage(seed: number, run: number, rule: number, probability: number): Uint8Array {
    const clampedProbability = Math.max(0, Math.min(1, probability));
    return createPixelImage((x, y) => {
        return hashLocation(seed, run, rule, x, y) < 65536 * clampedProbability;
    });
}

function createIndexImage(seed: number, run: number, rule: number, moduloRules: Array<[number, number, number, number]>, probability: number): Uint8Array {
    return createPixelImage((x, y) => {
        const passesModulo = moduloRules.length === 0 || moduloRules.some(([modX, modY, offsetX, offsetY]) =>
            (x + offsetX) % modX === 0 && (y + offsetY) % modY === 0);
        return passesModulo && hashLocation(seed, run, rule, x, y) < 65536 * probability;
    });
}

function getRunAndRule(lines: string[], lineNumber: number): { run: number, rule: number } {
    let run = 0;
    let rule = 0;
    let inConfiguration = false;
    for (let i = 0; i <= lineNumber; i++) {
        const command = lines[i]?.trim().split(/\s+/)[0] ?? '';
        if (command.startsWith('[')) {
            run = 0;
            rule = 0;
            inConfiguration = true;
        } else if (!inConfiguration) {
            continue;
        } else if (command === 'NewRun') {
            run++;
            rule = 0;
        } else if (command === 'Index') {
            rule++;
        }
    }
    return { run, rule: Math.max(0, rule - 1) };
}

export function provideHover(params: TextDocumentPositionParams, documents: TextDocuments<TextDocument>, randomSeed = 0): Hover | null {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const lines = document.getText().split(/\r?\n/);
    const rawLine = lines[params.position.line];
    if (!rawLine) return null;

    const line = rawLine.trim();
    if (line.startsWith('Index')) {
        const description = describeIndex(lines, params.position.line);
        if (!description) return null;
        const { run, rule } = getRunAndRule(lines, params.position.line);
        const preview = getIndexPreview(lines, params.position.line);
        const image = imageMarkdown('Index pattern', createIndexImage(randomSeed, run, rule, preview.moduloRules, preview.probability));
        return { contents: { kind: 'markdown', value: `${description}\n\n${image}` } };
    }
    if (line.startsWith('Pos')) {
        const description = describePos(line);
        return description ? { contents: { kind: 'markdown', value: description } } : null;
    }
    if (line.startsWith('Modulo')) {
        const tokens = line.split(/\s+/).slice(1).map(Number);
        if (tokens.length < 4 || tokens.some((value) => !Number.isInteger(value))) return null;
        const [modX, modY, offsetX, offsetY] = tokens;
        if (modX === undefined || modY === undefined || offsetX === undefined || offsetY === undefined || modX === 0 || modY === 0) return null;
        return { contents: { kind: 'markdown', value: imageMarkdown('Modulo pattern', createModuloImage(modX, modY, offsetX, offsetY)) } };
    }
    if (line.startsWith('Random')) {
        const value = line.split(/\s+/)[1];
        if (!value || !/^\d+(\.\d+)?%?$/.test(value)) return null;
        const number = Number.parseFloat(value);
        const probability = value.endsWith('%') ? number / 100 : 1 / number;
        if (!Number.isFinite(probability)) return null;
        const { run, rule } = getRunAndRule(lines, params.position.line);
        return { contents: { kind: 'markdown', value: imageMarkdown('Random pattern', createRandomImage(randomSeed, run, rule, Math.max(0, Math.min(1, probability)))) } };
    }
    return null;
}
