import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    TextDocumentSyncKind,
    CompletionItem,
    CompletionItemKind,
    Hover,
} from 'vscode-languageserver/node';
import type { InitializeParams, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                triggerCharacters: [' ', '['],
            },
            hoverProvider: true,
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
        // 跳过空行与注释
        if (trimmed === '' || trimmed.startsWith('#')) {
            return;
        }

        const startChar = line.indexOf(trimmed);
        const endChar = startChar + trimmed.length;

        // 1. 配置组匹配 [ConfigName]
        if (trimmed.startsWith('[')) {
            if (!/^\[.+\]$/.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: startChar },
                        end: { line: lineNumber, character: endChar },
                    },
                    message: '配置头格式应为 [ConfigName]',
                    source: 'automapper',
                });
            }
            return;
        }

        // 2. Index 指令匹配：支持可选的方向标志 (XFLIP, YFLIP, ROTATE)
        if (trimmed.startsWith('Index')) {
            const indexRegex = /^Index\s+\d+(\s+(XFLIP|YFLIP|ROTATE|NONE)){0,3}$/i;
            if (!indexRegex.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: startChar },
                        end: { line: lineNumber, character: endChar },
                    },
                    message: 'Index 格式应为: Index <id> [XFLIP] [YFLIP] [ROTATE]',
                    source: 'automapper',
                });
            }
            return;
        }

        // 3. Pos 指令匹配：坐标支持负数，如 Pos -1 0 INDEX 1
        if (trimmed.startsWith('Pos')) {
            const posRegex = /^Pos\s+-?\d+\s+-?\d+\s+(EMPTY|FULL|(INDEX|NOTINDEX)(\s+.*)?)$/i;
            if (!posRegex.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: startChar },
                        end: { line: lineNumber, character: endChar },
                    },
                    message: 'Pos 格式应为: Pos <x> <y> <EMPTY|FULL|INDEX|NOTINDEX> [id] [flags]',
                    source: 'automapper',
                });
            }
            return;
        }

        // 4. Random 指令匹配 (支持百分比和比例值)
        if (trimmed.startsWith('Random')) {
            if (!/^Random\s+\d+(\.\d+)?%?$/i.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: startChar },
                        end: { line: lineNumber, character: endChar },
                    },
                    message: 'Random 格式应为: Random <value> 或 Random <value>%',
                    source: 'automapper',
                });
            }
            return;
        }

        // 5. Modulo 指令匹配
        if (trimmed.startsWith('Modulo')) {
            if (!/^Modulo\s+\d+\s+\d+\s+-?\d+\s+-?\d+$/i.test(trimmed)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNumber, character: startChar },
                        end: { line: lineNumber, character: endChar },
                    },
                    message: 'Modulo 格式应为: Modulo <modX> <modY> <offsetX> <offsetY>',
                    source: 'automapper',
                });
            }
            return;
        }

        // 6. 无参数关键字检查
        const validKeywords = ['NewRun', 'NoDefaultRule', 'NoLayerCopy'];
        if (!validKeywords.includes(trimmed) && !trimmed.startsWith('Index') && !trimmed.startsWith('Pos')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineNumber, character: startChar },
                    end: { line: lineNumber, character: endChar },
                },
                message: `意外的语法: '${trimmed}'`,
                source: 'automapper',
            });
        }
    });

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// 自动补全支持
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    return [
        { label: 'NewRun', kind: CompletionItemKind.Keyword, detail: '创建新的运行轮次' },
        { label: 'Index', kind: CompletionItemKind.Snippet, detail: 'Index <id> [Flags]' },
        { label: 'Pos', kind: CompletionItemKind.Snippet, detail: 'Pos <x> <y> <EMPTY|FULL|INDEX|NOTINDEX>' },
        { label: 'Random', kind: CompletionItemKind.Keyword, detail: '随机概率设置' },
        { label: 'Modulo', kind: CompletionItemKind.Keyword, detail: 'Modulo <modX> <modY> <offX> <offY>' },
        { label: 'NoDefaultRule', kind: CompletionItemKind.Keyword, detail: '禁用默认规则' },
        { label: 'NoLayerCopy', kind: CompletionItemKind.Keyword, detail: '禁用图层拷贝' },
        { label: 'XFLIP', kind: CompletionItemKind.EnumMember },
        { label: 'YFLIP', kind: CompletionItemKind.EnumMember },
        { label: 'ROTATE', kind: CompletionItemKind.EnumMember },
        { label: 'EMPTY', kind: CompletionItemKind.EnumMember },
        { label: 'FULL', kind: CompletionItemKind.EnumMember },
        { label: 'INDEX', kind: CompletionItemKind.EnumMember },
        { label: 'NOTINDEX', kind: CompletionItemKind.EnumMember },
    ];
});

// 悬停提示支持
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const lines = document.getText().split(/\r?\n/);
    const rawLine = lines[params.position.line];
    if (!rawLine) return null;

    const line = rawLine.trim();

    if (line.startsWith('Index')) {
        return { contents: { kind: 'markdown', value: '**Index 指令**\n用于定义当前自动映射匹配成功后输出的目标 Tile ID 及旋转翻转属性。' } };
    }
    if (line.startsWith('Pos')) {
        return { contents: { kind: 'markdown', value: '**Pos 指令**\n定义相对于当前位置 `(x, y)` 的图块条件。支持 `EMPTY`, `FULL`, `INDEX`, `NOTINDEX` 匹配。' } };
    }
    if (line.startsWith('Modulo')) {
        return { contents: { kind: 'markdown', value: '**Modulo 指令**\n基于坐标的周期取模逻辑约束。例如 `Modulo 2 2 0 0` 可实现棋盘格交替效果。' } };
    }

    return null;
});

documents.listen(connection);
connection.listen();
