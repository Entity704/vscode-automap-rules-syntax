import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    TextDocumentSyncKind,
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    Hover,
    SemanticTokensBuilder,
} from 'vscode-languageserver/node';
import type {
    InitializeParams,
    TextDocumentPositionParams,
    SemanticTokensParams,
    SemanticTokens,
    SemanticTokensLegend,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const keywords = ['Index', 'Pos', 'Random', 'Modulo', 'NoDefaultRule', 'NewRun', 'NoLayerCopy'];
const parameters = ['INDEX', 'NOTINDEX'];
const constants = ['FULL', 'EMPTY'];
const modifiers = ['XFLIP', 'YFLIP', 'ROTATE'];
const operators = ['OR'];

const tokenTypes = [
    'comment',
    'class',
    'namespace',
    'keyword',
    'parameter',
    'type',
    'variable',
    'modifier',
    'operator',
    'number',
];
const tokenModifiers = [
    'declaration',
    'definition'
];
const legend: SemanticTokensLegend = { tokenTypes, tokenModifiers };

const INT32_MIN = -2147483648n;
const INT32_MAX = 2147483647n;
const TILE_INDEX_MIN = 0n;
const TILE_INDEX_MAX = 255n;

function isIntegerOutsideRange(value: string, min: bigint, max: bigint): boolean {
    if (!/^-?\d+$/.test(value)) return false;
    const integer = BigInt(value);
    return integer < min || integer > max;
}

connection.onInitialize((params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                triggerCharacters: [' ', '\n'],
            },
            hoverProvider: true,
            semanticTokensProvider: {
                legend,
                full: true,
            },
        },
    };
});

documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/);
    const diagnostics: Diagnostic[] = [];

    lines.forEach((line, lineNumber) => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) return;

        const leadingWhitespace = line.match(/^\s+/)?.[0] ?? '';
        if (leadingWhitespace.includes(' ')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: leadingWhitespace.length } },
                message: '行首空格可能导致此行被忽略',
                source: 'automapper',
            });
        }

        const startChar = line.indexOf(trimmed);
        const endChar = startChar + trimmed.length;

        if (trimmed.startsWith('[')) {
            if (!/^\[.+\]$/.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: '配置头格式应为 [ConfigName]',
                    source: 'automapper',
                });
            }
            return;
        }

        if (trimmed.startsWith('Index')) {
            const indexValue = trimmed.match(/^Index\s+(-?\d+)/i)?.[1];
            if (indexValue && isIntegerOutsideRange(indexValue, TILE_INDEX_MIN, TILE_INDEX_MAX)) {
                const indexStart = startChar + trimmed.indexOf(indexValue);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: indexStart }, end: { line: lineNumber, character: indexStart + indexValue.length } },
                    message: '无效的索引，应在 0 到 255 之间',
                    source: 'automapper',
                });
            }

            const indexRegex = /^Index\s+\d+(\s+(XFLIP|YFLIP|ROTATE|NONE)){0,3}$/i;
            if (!indexRegex.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Index 格式应为: Index <id> [XFLIP] [YFLIP] [ROTATE]',
                    source: 'automapper',
                });
            }
            return;
        }

        if (trimmed.startsWith('Pos')) {
            const posTokens = trimmed.split(/\s+/);
            for (const tokenIndex of [1, 2]) {
                const coordinate = posTokens[tokenIndex];
                if (coordinate && isIntegerOutsideRange(coordinate, INT32_MIN, INT32_MAX)) {
                    const coordinateStart = startChar + trimmed.indexOf(coordinate);
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: { start: { line: lineNumber, character: coordinateStart }, end: { line: lineNumber, character: coordinateStart + coordinate.length } },
                        message: 'Pos 坐标超出 int32 范围，可能发生溢出',
                        source: 'automapper',
                    });
                }
            }

            if (posTokens[3]?.toUpperCase() === 'INDEX' || posTokens[3]?.toUpperCase() === 'NOTINDEX') {
                let indexSearchStart = trimmed.indexOf(posTokens[3]) + (posTokens[3]?.length ?? 0);
                for (const token of posTokens.slice(4)) {
                    const indexStartInTrimmed = trimmed.indexOf(token, indexSearchStart);
                    indexSearchStart = indexStartInTrimmed + token.length;
                    if (isIntegerOutsideRange(token, TILE_INDEX_MIN, TILE_INDEX_MAX)) {
                        const indexStart = startChar + indexStartInTrimmed;
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: { start: { line: lineNumber, character: indexStart }, end: { line: lineNumber, character: indexStart + token.length } },
                            message: '无效的索引，应在 0 到 255 之间',
                            source: 'automapper',
                        });
                    }
                }
            }

            const posRegex = /^Pos\s+-?\d+\s+-?\d+\s+(EMPTY|FULL|(INDEX|NOTINDEX)(\s+.*)?)$/i;
            if (!posRegex.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Pos 格式应为: Pos <x> <y> <EMPTY|FULL|INDEX|NOTINDEX> [id] [flags]',
                    source: 'automapper',
                });
            }
            return;
        }

        if (trimmed.startsWith('Random')) {
            if (!/^Random\s+\d+(\.\d+)?%?$/i.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Random 格式应为: Random <value> 或 Random <value>%',
                    source: 'automapper',
                });
            }
            return;
        }

        if (trimmed.startsWith('Modulo')) {
            if (!/^Modulo\s+\d+\s+\d+\s+-?\d+\s+-?\d+$/i.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Modulo 格式应为: Modulo <modX> <modY> <offsetX> <offsetY>',
                    source: 'automapper',
                });
            }
            return;
        }

        const validKeywords = ['NewRun', 'NoDefaultRule', 'NoLayerCopy'];
        if (!validKeywords.includes(trimmed) && !trimmed.startsWith('Index') && !trimmed.startsWith('Pos') && !trimmed.startsWith('Random') && !trimmed.startsWith('Modulo')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                message: `意外的语法: '${trimmed}'`,
                source: 'automapper',
            });
        }
    });

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    return [
        {
            label: 'Index',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Index ${1:id} ${2|XFLIP,YFLIP,ROTATE|}',
            detail: '选择要放置的图块索引',
            documentation: '用法: Index <id> [XFLIP] [YFLIP] [ROTATE]\n示例: Index 42 XFLIP YFLIP',
        },
        {
            label: 'Pos',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Pos ${1:x} ${2:y} ${3|EMPTY,FULL,INDEX,NOTINDEX|}',
            detail: '定义放置条件，检查相对位置状态',
            documentation: '用法: Pos <x> <y> <条件>\n条件可为 EMPTY / FULL / INDEX <id> / NOTINDEX <id>',
        },
        {
            label: 'Random',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Random ${1:value}%',
            detail: '设置随机放置概率',
            documentation: '用法: Random <数值>% 或 Random <数值>\n示例: Random 20%',
        },
        {
            label: 'Modulo',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Modulo ${1:x_mod} ${2:y_mod} ${3:x_offset} ${4:y_offset}',
            detail: '基于坐标模运算的过滤器',
            documentation: '用法: Modulo <x_mod> <y_mod> <x_offset> <y_offset>\n示例: Modulo 2 3 0 -1',
        },
        {
            label: 'NoDefaultRule',
            kind: CompletionItemKind.Keyword,
            detail: '禁用默认隐含条件',
            documentation: '禁用当前 Index 规则的默认隐含条件。单独一行。',
        },
        {
            label: 'NewRun',
            kind: CompletionItemKind.Keyword,
            detail: '开始新一轮运行',
            documentation: '在当前配置中开始新一轮运行。单独一行。',
        },
        {
            label: 'NoLayerCopy',
            kind: CompletionItemKind.Keyword,
            detail: '禁用图层复制（就地修改）',
            documentation: '在当前运行中禁用图层复制，可提升性能但需谨慎。单独一行。',
        },
        { label: 'EMPTY', kind: CompletionItemKind.EnumMember, detail: '图块索引为 0' },
        { label: 'FULL', kind: CompletionItemKind.EnumMember, detail: '图块索引不为 0' },
        { label: 'INDEX', kind: CompletionItemKind.EnumMember, detail: '匹配指定的图块索引' },
        { label: 'NOTINDEX', kind: CompletionItemKind.EnumMember, detail: '排除特定的图块索引' },
        { label: 'XFLIP', kind: CompletionItemKind.EnumMember, detail: '水平翻转' },
        { label: 'YFLIP', kind: CompletionItemKind.EnumMember, detail: '垂直翻转' },
        { label: 'ROTATE', kind: CompletionItemKind.EnumMember, detail: '顺时针旋转 90°' },
        { label: 'OR', kind: CompletionItemKind.Operator, detail: '逻辑或组合条件' },
    ];
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const lines = document.getText().split(/\r?\n/);
    const rawLine = lines[params.position.line];
    if (!rawLine) return null;

    const line = rawLine.trim();
    if (line.startsWith('Index')) {
        return { contents: { kind: 'markdown', value: '**Index 指令**\n用于定义匹配成功后输出的目标 Tile ID 及属性。' } };
    }
    if (line.startsWith('Pos')) {
        return { contents: { kind: 'markdown', value: '**Pos 指令**\n定义相对位置 `(x, y)` 的图块条件。' } };
    }
    if (line.startsWith('Modulo')) {
        return { contents: { kind: 'markdown', value: '**Modulo 指令**\n基于坐标的周期取模逻辑约束。' } };
    }
    return null;
});

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { data: [] };
    }

    const builder = new SemanticTokensBuilder();
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineNumber) => {
        const commentIndex = line.indexOf('#');
        if (commentIndex !== -1) {
            builder.push(lineNumber, commentIndex, line.length - commentIndex, tokenTypes.indexOf('comment'), 0);
            line = line.substring(0, commentIndex);
        }

        const headerMatch = line.match(/^\[.+\]$/);
        if (headerMatch) {
            builder.push(lineNumber, line.indexOf('['), line.length, tokenTypes.indexOf('class'), 0);
            return;
        }

        const tokenRegex = /\b[A-Za-z0-9%]+\b/g;
        let match: RegExpExecArray | null;

        while ((match = tokenRegex.exec(line)) !== null) {
            const word = match[0];
            const startChar = match.index;
            let tokenType = -1;
            let modifiersMask = 0;

            if (word === 'Index') {
                tokenType = tokenTypes.indexOf('namespace');
            } else if (keywords.includes(word)) {
                tokenType = tokenTypes.indexOf('keyword');
            } else if (parameters.includes(word)) {
                tokenType = tokenTypes.indexOf('parameter');
            } else if (constants.includes(word)) {
                tokenType = tokenTypes.indexOf('type');
            } else if (modifiers.includes(word)) {
                tokenType = tokenTypes.indexOf('modifier');
            } else if (operators.includes(word)) {
                tokenType = tokenTypes.indexOf('operator');
            } else if (/^\d+%?$/.test(word)) {
                tokenType = tokenTypes.indexOf('number');
            }

            if (tokenType !== -1) {
                builder.push(lineNumber, startChar, word.length, tokenType, modifiersMask);
            }
        }
    });

    return builder.build();
});

documents.listen(connection);
connection.listen();
