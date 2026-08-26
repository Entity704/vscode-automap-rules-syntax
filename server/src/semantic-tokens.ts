import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import type { SemanticTokens, SemanticTokensParams, TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { constants, keywords, modifiers, operators, parameters, tokenTypes } from './constants.js';

export function provideSemanticTokens(params: SemanticTokensParams, documents: TextDocuments<TextDocument>): SemanticTokens {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };

    const builder = new SemanticTokensBuilder();
    const lines = document.getText().split(/\r?\n/);
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
            if (word === 'Index') tokenType = tokenTypes.indexOf('namespace');
            else if (keywords.includes(word)) tokenType = tokenTypes.indexOf('keyword');
            else if (parameters.includes(word)) tokenType = tokenTypes.indexOf('parameter');
            else if (constants.includes(word)) tokenType = tokenTypes.indexOf('type');
            else if (modifiers.includes(word)) tokenType = tokenTypes.indexOf('modifier');
            else if (operators.includes(word)) tokenType = tokenTypes.indexOf('operator');
            else if (/^\d+%?$/.test(word)) tokenType = tokenTypes.indexOf('number');
            if (tokenType !== -1) builder.push(lineNumber, startChar, word.length, tokenType, 0);
        }
    });
    return builder.build();
}
