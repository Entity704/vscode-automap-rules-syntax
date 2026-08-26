import type { SemanticTokensLegend } from 'vscode-languageserver/node';

export const keywords = ['Index', 'Pos', 'Random', 'Modulo', 'NoDefaultRule', 'NewRun', 'NoLayerCopy'];
export const parameters = ['INDEX', 'NOTINDEX'];
export const constants = ['FULL', 'EMPTY'];
export const modifiers = ['XFLIP', 'YFLIP', 'ROTATE', 'NONE'];
export const operators = ['OR'];

export const tokenTypes = [
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
export const tokenModifiers = [
    'declaration',
    'definition'
];
export const legend: SemanticTokensLegend = { tokenTypes, tokenModifiers };

export const INT32_MIN = -2147483648n;
export const INT32_MAX = 2147483647n;
export const TILE_INDEX_MIN = 0n;
export const TILE_INDEX_MAX = 255n;
