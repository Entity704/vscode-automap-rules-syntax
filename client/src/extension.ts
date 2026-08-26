import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'automapper' }],
    };

    client = new LanguageClient('automapperServer', 'Automapper Language Server', serverOptions, clientOptions);
    client.start();

    const foldingRangeProvider = vscode.languages.registerFoldingRangeProvider(
        { scheme: 'file' },
        {
            provideFoldingRanges(document: vscode.TextDocument) {
                const ranges: vscode.FoldingRange[] = [];
                const lineCount = document.lineCount;
                const startLines: number[] = [];

                for (let i = 0; i < lineCount; i++) {
                    const text = document.lineAt(i).text.trim();
                    if (text.startsWith('[')) {
                        startLines.push(i);
                    }
                }

                for (let i = 0; i < startLines.length - 1; i++) {
                    const start = startLines[i];
                    const nextStart = startLines[i + 1];
                    if (nextStart !== undefined) {
                        const end = nextStart - 1;
                        if (start !== undefined && end > start) {
                            ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
                        }
                    }
                }

                if (startLines.length > 0) {
                    const lastStart = startLines[startLines.length - 1];
                    if (lastStart !== undefined && lastStart < lineCount - 1) {
                        ranges.push(new vscode.FoldingRange(lastStart, lineCount - 1, vscode.FoldingRangeKind.Region));
                    }
                }

                return ranges;
            }
        }
    );

    context.subscriptions.push(foldingRangeProvider);
}

export function deactivate() {
    return client ? client.stop() : undefined;
}
