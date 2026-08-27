import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient;

const randomSeedKey = 'automapper.randomSeed';
const maxRandomSeed = 1_000_000_000;

class ConfigurationsViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml(webviewView.webview);

        const configuration = vscode.workspace.getConfiguration();
        const sendSeed = (seed: number) => client.sendNotification('automapper/setSeed', seed);
        webviewView.webview.onDidReceiveMessage(async (message: { type?: string, value?: unknown }) => {
            if (message.type !== 'setSeed' || typeof message.value !== 'string' && typeof message.value !== 'number') return;
            const seed = Number(message.value);
            if (!Number.isInteger(seed) || seed < 0 || seed > maxRandomSeed) return;
            await configuration.update(randomSeedKey, seed, vscode.ConfigurationTarget.Global);
            sendSeed(seed);
        }, undefined, this.context.subscriptions);

        const updateView = () => {
            const seed = vscode.workspace.getConfiguration().get<number>(randomSeedKey, 0);
            webviewView.webview.postMessage({ type: 'setSeed', value: seed });
            sendSeed(seed);
        };
        const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(randomSeedKey)) updateView();
        });
        this.context.subscriptions.push(configurationSubscription);
        updateView();
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html>
<body>
    <label for="seed">Seed: </label>
    <input id="seed" type="number" min="0" max="${maxRandomSeed}" step="1" value="0" />

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const input = document.getElementById('seed');
        input.addEventListener('change', () => {
            const value = Number(input.value);
            if (Number.isInteger(value) && value >= 0 && value <= ${maxRandomSeed}) {
                vscode.postMessage({ type: 'setSeed', value });
            }
        });
        window.addEventListener('message', event => {
            if (event.data.type === 'setSeed') input.value = event.data.value;
        });
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

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
    const sendConfiguredSeed = () => {
        const seed = vscode.workspace.getConfiguration().get<number>(randomSeedKey, 0);
        client.sendNotification('automapper/setSeed', seed);
    };
    sendConfiguredSeed();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(randomSeedKey)) sendConfiguredSeed();
    }));
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('automapper-configurations', new ConfigurationsViewProvider(context)));

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

                function findLastNonEmpty(start: number, limit: number): number {
                    for (let i = limit; i >= start; i--) {
                        if (document.lineAt(i).text.trim() !== '') {
                            return i;
                        }
                    }
                    return start;
                }

                for (let i = 0; i < startLines.length - 1; i++) {
                    const start = startLines[i]!;
                    const nextStart = startLines[i + 1]!;

                    const end = findLastNonEmpty(start, nextStart - 1);
                    if (end > start) {
                        ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
                    }
                }

                if (startLines.length > 0) {
                    const lastStart = startLines[startLines.length - 1]!;
                    const end = findLastNonEmpty(lastStart, lineCount - 1);
                    if (end > lastStart) {
                        ranges.push(new vscode.FoldingRange(lastStart, end, vscode.FoldingRangeKind.Region));
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
