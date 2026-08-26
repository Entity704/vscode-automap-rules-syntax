import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import type {
    InitializeParams,
    TextDocumentPositionParams,
    SemanticTokensParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { legend } from './constants.js';
import { provideCompletions } from './completion.js';
import { provideHover } from './hover.js';
import { provideSemanticTokens } from './semantic-tokens.js';
import { validateTextDocument } from './validator.js';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: { triggerCharacters: [' '] },
            hoverProvider: true,
            semanticTokensProvider: {
                legend,
                full: true,
            },
        },
    };
});

documents.onDidChangeContent((change) => {
    connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: validateTextDocument(change.document),
    });
});

connection.onCompletion(() => provideCompletions());
connection.onHover((params: TextDocumentPositionParams) => provideHover(params, documents));
connection.languages.semanticTokens.on((params: SemanticTokensParams) => provideSemanticTokens(params, documents));

documents.listen(connection);
connection.listen();
