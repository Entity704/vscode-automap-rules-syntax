import type { Hover, TextDocumentPositionParams } from 'vscode-languageserver/node';
import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export function provideHover(params: TextDocumentPositionParams, documents: TextDocuments<TextDocument>): Hover | null {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const lines = document.getText().split(/\r?\n/);
    const rawLine = lines[params.position.line];
    if (!rawLine) return null;

    const line = rawLine.trim();
    if (line.startsWith('Index')) return { contents: { kind: 'markdown', value: '**Index 指令**\n用于定义匹配成功后输出的目标 Tile ID 及属性。' } };
    if (line.startsWith('Pos')) return { contents: { kind: 'markdown', value: '**Pos 指令**\n定义相对位置 `(x, y)` 的图块条件。' } };
    if (line.startsWith('Modulo')) return { contents: { kind: 'markdown', value: '**Modulo 指令**\n基于坐标的周期取模逻辑约束。' } };
    return null;
}
