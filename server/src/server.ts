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
const modifiers = ['XFLIP', 'YFLIP', 'ROTATE', 'NONE'];
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

function isIntegerOutsideRange(value: string | undefined, min: bigint, max: bigint): boolean {
    if (!value || !/^-?\d+$/.test(value)) return false;
    const integer = BigInt(value);
    return integer < min || integer > max;
}

function isValidInteger(value: string | undefined, min: bigint, max: bigint): boolean {
    return !!value && /^-?\d+$/.test(value) && !isIntegerOutsideRange(value, min, max);
}

function getTokenRange(line: number, lineText: string, token: string | undefined, tokenIndex?: number) {
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

connection.onInitialize((params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                triggerCharacters: [' '],
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

    let hasConf = false;
    let hasRun = false;
    let hasIndex = false;

    lines.forEach((line, lineNumber) => {
        if (line.trim().length === 0) return;

        const trimmed = line.trimEnd();
        const startChar = 0;
        const endChar = trimmed.length;

        if (line.trimStart()[0] === '#') return;

        const inlineCommentIndex = line.indexOf('#');
        if (inlineCommentIndex !== -1) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: lineNumber, character: inlineCommentIndex }, end: { line: lineNumber, character: line.length } },
                message: '行内注释可能导致非预期行为',
                source: 'automapper',
            });
        }

        const firstChar = line[0] ?? '';
        if ([' ', '\t', '\v', '\r', '\n'].includes(firstChar)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: line.length } },
                message: '行首存在空格或空白字符，此行会被忽略',
                source: 'automapper',
            });
            return;
        }

        if (trimmed.startsWith('[')) {
            hasConf = true;
            hasRun = true;
            hasIndex = false;

            if (!trimmed.endsWith(']')) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: '配置头括号未闭合，格式应为 [配置名称]',
                    source: 'automapper',
                });
            } else if (trimmed.length <= 2) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: '配置头名称不能为空',
                    source: 'automapper',
                });
            }
            return;
        }

        const tokens = trimmed.split(/\s+/);
        const command = tokens[0] ?? '';

        if (command === 'NewRun') {
            if (tokens.length > 1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'NewRun 参数过多',
                    source: 'automapper',
                });
            }
            if (!hasConf) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'NewRun 指令必须位于配置块内部',
                    source: 'automapper',
                });
            } else {
                hasRun = true;
                hasIndex = false;
            }
            return;
        }

        if (command === 'NoLayerCopy') {
            if (tokens.length > 1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'NoLayerCopy 参数过多',
                    source: 'automapper',
                });
            }
            if (!hasRun) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'NoLayerCopy 指令必须位于有效的 NewRun 或配置块内部',
                    source: 'automapper',
                });
            }
            return;
        }

        if (command === 'Index') {
            if (!hasRun) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Index 指令必须位于有效的 NewRun 或配置块内部',
                    source: 'automapper',
                });
                return;
            }
            hasIndex = true;

            const idToken = tokens[1];
            if (!idToken) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: "Index 缺少索引参数，格式: Index i[id] ?s['XFLIP'|'YFLIP'|'ROTATE']",
                    source: 'automapper',
                });
                return;
            }

            if (!isValidInteger(idToken, TILE_INDEX_MIN, TILE_INDEX_MAX)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: getTokenRange(lineNumber, trimmed, idToken, 1),
                    message: `无效的索引 '${idToken}'，必须是 0 到 255 之间的整数`,
                    source: 'automapper',
                });
            }

            if (tokens.length > 5) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'Index 参数过多',
                    source: 'automapper',
                });
            }

            const indexModifiers = tokens.slice(2);
            const seenIndexModifiers = new Set<string>();
            for (let i = 0; i < Math.min(indexModifiers.length, 3); i++) {
                const flagToken = indexModifiers[i];
                if (flagToken && !modifiers.includes(flagToken)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: getTokenRange(lineNumber, trimmed, flagToken, i + 2),
                        message: `未知的翻转标志 '${flagToken}'`,
                        source: 'automapper',
                    });
                } else if (flagToken) {
                    if (seenIndexModifiers.has(flagToken) || (flagToken === 'NONE' && indexModifiers.some((modifier) => modifier !== 'NONE')) || (flagToken !== 'NONE' && indexModifiers.includes('NONE'))) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Information,
                            range: getTokenRange(lineNumber, trimmed, flagToken, i + 2),
                            message: '令人困惑的标志组合',
                            source: 'automapper',
                        });
                    }
                    seenIndexModifiers.add(flagToken);
                }
            }
            if (indexModifiers.includes('NONE')) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: getTokenRange(lineNumber, trimmed, 'NONE', indexModifiers.indexOf('NONE') + 2),
                    message: '无用处',
                    source: 'automapper',
                });
            }
            return;
        }

        if (command === 'Pos') {
            if (!hasIndex) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Pos 规则必须紧跟在 Index 指令之后声明',
                    source: 'automapper',
                });
                return;
            }

            const xToken = tokens[1];
            const yToken = tokens[2];
            const valueToken = tokens[3];

            if (!xToken || !yToken || !valueToken) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: "Pos 参数不足，格式应为: Pos i[x] i[y] ?s['EMPTY'|'FULL'|'INDEX'|'NOTINDEX']",
                    source: 'automapper',
                });
                return;
            }

            if (!/^-?\d+$/.test(xToken) || isIntegerOutsideRange(xToken, INT32_MIN, INT32_MAX)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: getTokenRange(lineNumber, trimmed, xToken, 1),
                    message: `Pos X 坐标 '${xToken}' 必须是有效的 32 位整数`,
                    source: 'automapper',
                });
            }

            if (!/^-?\d+$/.test(yToken) || isIntegerOutsideRange(yToken, INT32_MIN, INT32_MAX)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: getTokenRange(lineNumber, trimmed, yToken, 2),
                    message: `Pos Y 坐标 '${yToken}' 必须是有效的 32 位整数`,
                    source: 'automapper',
                });
            }

            const upperValue = valueToken.toUpperCase();
            if (!['EMPTY', 'FULL', 'INDEX', 'NOTINDEX'].includes(upperValue)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: getTokenRange(lineNumber, trimmed, valueToken, 3),
                    message: `无效的 Pos 匹配模式 '${valueToken}'，应为 EMPTY、FULL、INDEX 或 NOTINDEX`,
                    source: 'automapper',
                });
                return;
            }

            if ((upperValue === 'EMPTY' || upperValue === 'FULL') && tokens.length > 4) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'Pos 参数过多',
                    source: 'automapper',
                });
            }

            if (upperValue === 'INDEX' || upperValue === 'NOTINDEX') {
                if (tokens.length < 5) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                        message: `Pos ${upperValue} 模式缺失具体的索引参数`,
                        source: 'automapper',
                    });
                    return;
                }

                let i = 4;
                while (i < tokens.length) {
                    const idTok = tokens[i];
                    if (!idTok) break;

                    if (!isValidInteger(idTok, TILE_INDEX_MIN, TILE_INDEX_MAX)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: getTokenRange(lineNumber, trimmed, idTok, i),
                            message: `无效的索引 '${idTok}'，必须是 0 到 255 之间的整数`,
                            source: 'automapper',
                        });
                    }

                    const idTokenIndex = i;
                    i++;
                    const groupModifiers: Array<{ value: string; index: number }> = [];
                    while (i < tokens.length) {
                        const tok = tokens[i];
                        if (!tok) break;
                        if (tok === 'OR') {
                            if (i === tokens.length - 1 || !tokens[i + 1]) {
                                diagnostics.push({
                                    severity: DiagnosticSeverity.Error,
                                    range: getTokenRange(lineNumber, trimmed, tok, i),
                                    message: 'OR 后缺少索引条件',
                                    source: 'automapper',
                                });
                            }
                            i++;
                            break;
                        }
                        if (groupModifiers.length >= 3) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Warning,
                                range: getTokenRange(lineNumber, trimmed, tok, i),
                                message: 'Pos 参数过多',
                                source: 'automapper',
                            });
                        }
                        if (!['XFLIP', 'YFLIP', 'ROTATE', 'NONE'].includes(tok)) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Warning,
                                range: getTokenRange(lineNumber, trimmed, tok, i),
                                message: `Pos 指令中未知的修饰符或组合符 '${tok}'`,
                                source: 'automapper',
                            });
                        }
                        groupModifiers.push({ value: tok, index: i });
                        i++;
                    }

                    if (groupModifiers.length === 0) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Hint,
                            range: getTokenRange(lineNumber, trimmed, idTok, idTokenIndex),
                            message: '将匹配所有翻转状态',
                            source: 'automapper',
                        });
                    }

                    const seenModifiers = new Set<string>();
                    for (const modifier of groupModifiers) {
                        if (seenModifiers.has(modifier.value) || (modifier.value === 'NONE' && groupModifiers.some((item) => item.value !== 'NONE')) || (modifier.value !== 'NONE' && groupModifiers.some((item) => item.value === 'NONE'))) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Information,
                                range: getTokenRange(lineNumber, trimmed, modifier.value, modifier.index),
                                message: '令人困惑的标志组合',
                                source: 'automapper',
                            });
                        }
                        seenModifiers.add(modifier.value);
                    }
                }
            }
            return;
        }

        if (command === 'Random') {
            if (!hasIndex) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Random 规则必须位于 Index 指令之后',
                    source: 'automapper',
                });
                return;
            }

            const valStr = tokens[1];
            if (!valStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Random 缺少数值参数，格式: Random f[value] 或 Random f[value]%',
                    source: 'automapper',
                });
                return;
            }

            if (!/^\d+(\.\d+)?%?$/.test(valStr)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: getTokenRange(lineNumber, trimmed, valStr, 1),
                    message: `无效的 Random 概率格式 '${valStr}'`,
                    source: 'automapper',
                });
                return;
            }

            if (tokens.length > 2) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'Random 参数过多',
                    source: 'automapper',
                });
            }

            const randomValue = Number.parseFloat(valStr.endsWith('%') ? valStr.slice(0, -1) : valStr);
            if (valStr.endsWith('%')) {
                if (randomValue <= 0) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information,
                        range: getTokenRange(lineNumber, trimmed, valStr, 1),
                        message: '不可能',
                        source: 'automapper',
                    });
                } else if (randomValue >= 100) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information,
                        range: getTokenRange(lineNumber, trimmed, valStr, 1),
                        message: '始终为真',
                        source: 'automapper',
                    });
                }
            } else if (randomValue === 0) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: getTokenRange(lineNumber, trimmed, valStr, 1),
                    message: '除以零，始终为真',
                    source: 'automapper',
                });
            } else if (randomValue < 0) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: getTokenRange(lineNumber, trimmed, valStr, 1),
                    message: '不可能',
                    source: 'automapper',
                });
            } else if (randomValue <= 1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: getTokenRange(lineNumber, trimmed, valStr),
                    message: '始终为真',
                    source: 'automapper',
                });
            }
            return;
        }

        if (command === 'Modulo') {
            if (!hasIndex) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Modulo 规则必须位于 Index 指令之后',
                    source: 'automapper',
                });
                return;
            }

            if (tokens.length < 5) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Modulo 参数不足，格式: Modulo i[modX] i[modY] i[offsetX] i[offsetY]',
                    source: 'automapper',
                });
                return;
            }

            if (tokens.length > 5) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'Modulo 参数过多',
                    source: 'automapper',
                });
            }

            for (let i = 1; i <= 4; i++) {
                const param = tokens[i];
                if (!isValidInteger(param, INT32_MIN, INT32_MAX)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: getTokenRange(lineNumber, trimmed, param, i),
                        message: `Modulo 参数 ${i} '${param ?? ''}' 必须是整数`,
                        source: 'automapper',
                    });
                }
            }

            if (tokens[1] === '0' || tokens[2] === '0') {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'Modulo 的 modX 或 modY 为 0 时，将被自动重置为 1',
                    source: 'automapper',
                });
            }
            return;
        }

        if (command === 'NoDefaultRule') {
            if (tokens.length > 1) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: trimmed.length } },
                    message: 'NoDefaultRule 参数过多',
                    source: 'automapper',
                });
            }
            if (!hasIndex) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
                    message: 'NoDefaultRule 指令必须位于 Index 指令之后',
                    source: 'automapper',
                });
            }
            return;
        }

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: lineNumber, character: startChar }, end: { line: lineNumber, character: endChar } },
            message: `无法解析的语法或指令: '${trimmed}'`,
            source: 'automapper',
        });
    });

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    return [
        {
            label: 'Index',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Index ${1:id}${2| , XFLIP, YFLIP, ROTATE|}',
            detail: '选择要放置的图块索引',
            documentation: "用法: Index i[id] ?s['XFLIP'|'YFLIP'|'ROTATE']\n示例: Index 42 XFLIP YFLIP",
        },
        { label: 'Index', kind: CompletionItemKind.Keyword, detail: '选择要放置的图块索引' },
        {
            label: 'Pos',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Pos ${1:x} ${2:y} ${3|EMPTY,FULL,INDEX ,NOTINDEX |}',
            detail: '定义放置条件，检查相对位置状态',
            documentation: "用法: Pos i[x] i[y] s['EMPTY'|'FULL'|'INDEX'|'NOTINDEX']",
        },
        { label: 'Pos', kind: CompletionItemKind.Keyword, detail: '定义放置条件，检查相对位置状态' },
        {
            label: 'Random',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Random ${1:value}',
            detail: '设置随机放置概率',
            documentation: '用法: Random f[value]% 或 Random f[value]\n非百分数时概率为 1 / value。\n示例: Random 20%',
        },
        { label: 'Random', kind: CompletionItemKind.Keyword, detail: '设置随机放置概率' },
        {
            label: 'Modulo',
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Modulo ${1:modX} ${2:modY} ${3:offsetX} ${4:offsetY}',
            detail: '基于坐标模运算的过滤器',
            documentation: '在 `(x + offsetX) % modX` 与 `(y + offsetY) % modY` 都为 0 时放置图块。\n用法: Modulo i[modX] i[modY] i[offsetX] i[offsetY]\n示例: Modulo 2 3 0 -1',
        },
        { label: 'Modulo', kind: CompletionItemKind.Keyword, detail: '基于坐标模运算的过滤器' },
        {
            label: 'NoDefaultRule',
            kind: CompletionItemKind.Keyword,
            detail: '禁用默认隐含条件',
            documentation: '禁用当前 Index 规则的默认隐含条件（`Pos 0 0 NOTINDEX 0`）。',
        },
        {
            label: 'NewRun',
            kind: CompletionItemKind.Keyword,
            detail: '开始新一轮运行',
            documentation: '在当前配置中开始新一轮运行。',
        },
        {
            label: 'NoLayerCopy',
            kind: CompletionItemKind.Keyword,
            detail: '禁用图层复制（就地修改）',
            documentation: '在当前运行中禁用图层复制，可提升性能但需谨慎。',
        },
        { label: 'EMPTY', kind: CompletionItemKind.EnumMember, detail: '图块索引为 0' },
        { label: 'FULL', kind: CompletionItemKind.EnumMember, detail: '图块索引不为 0' },
        { label: 'INDEX', kind: CompletionItemKind.EnumMember, detail: '匹配指定的图块索引' },
        { label: 'NOTINDEX', kind: CompletionItemKind.EnumMember, detail: '排除特定的图块索引' },
        { label: 'XFLIP', kind: CompletionItemKind.EnumMember, detail: '水平翻转' },
        { label: 'YFLIP', kind: CompletionItemKind.EnumMember, detail: '垂直翻转' },
        { label: 'ROTATE', kind: CompletionItemKind.EnumMember, detail: '顺时针旋转 90°' },
        { label: 'NONE', kind: CompletionItemKind.EnumMember, detail: '无翻转' },
        { label: 'OR', kind: CompletionItemKind.Operator, detail: '逻辑或组合条件' },
        {
            label: 'ROT90',
            kind: CompletionItemKind.EnumMember,
            insertTextFormat: InsertTextFormat.PlainText,
            insertText: 'ROTATE',
            detail: '顺时针旋转 90° 标识'
        },
        {
            label: 'ROT180',
            kind: CompletionItemKind.EnumMember,
            insertTextFormat: InsertTextFormat.PlainText,
            insertText: 'XFLIP YFLIP',
            detail: '顺时针旋转 180° 标识'
        },
        {
            label: 'ROT270',
            kind: CompletionItemKind.EnumMember,
            insertTextFormat: InsertTextFormat.PlainText,
            insertText: 'XFLIP YFLIP ROTATE',
            detail: '顺时针旋转 270° 标识'
        }
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
