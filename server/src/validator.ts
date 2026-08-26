import type { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { INT32_MAX, INT32_MIN, TILE_INDEX_MAX, TILE_INDEX_MIN, modifiers } from './constants.js';
import { getTokenRange, isIntegerOutsideRange, isValidInteger } from './validation-helpers.js';

export function validateTextDocument(textDocument: TextDocument): Diagnostic[] {
    const lines = textDocument.getText().split(/\r?\n/);
    const diagnostics: Diagnostic[] = [];
    const posCoordinates = new Set<string>();
    let hasConf = false;
    let hasRun = false;
    let hasIndex = false;
    const add = (line: number, message: string, severity: DiagnosticSeverity, token?: string, tokenIndex?: number) => {
        const lineText = lines[line] ?? '';
        diagnostics.push({
            severity,
            range: token === undefined
                ? { start: { line, character: 0 }, end: { line, character: lineText.trimEnd().length } }
                : getTokenRange(line, lineText.trimEnd(), token, tokenIndex),
            message,
            source: 'automapper',
        });
    };

    lines.forEach((line, lineNumber) => {
        if (line.trim().length === 0) return;
        const trimmed = line.trimEnd();
        if (line.trimStart()[0] === '#') return;
        const inlineCommentIndex = line.indexOf('#');
        if (inlineCommentIndex !== -1) {
            diagnostics.push({ severity: DiagnosticSeverity.Warning, range: { start: { line: lineNumber, character: inlineCommentIndex }, end: { line: lineNumber, character: line.length } }, message: '行内注释可能导致非预期行为', source: 'automapper' });
        }
        const firstChar = line[0] ?? '';
        if ([' ', '\t', '\v', '\r', '\n'].includes(firstChar)) {
            add(lineNumber, '行首存在空格或空白字符，此行会被忽略', DiagnosticSeverity.Warning);
            return;
        }
        if (trimmed.startsWith('[')) {
            hasConf = true; hasRun = true; hasIndex = false;
            if (!trimmed.endsWith(']')) add(lineNumber, '配置头括号未闭合，格式应为 [配置名称]', DiagnosticSeverity.Warning);
            else if (trimmed.length <= 2) add(lineNumber, '配置头名称不能为空', DiagnosticSeverity.Error);
            return;
        }
        const tokens = trimmed.split(/\s+/);
        const command = tokens[0] ?? '';
        if (command === 'NewRun') {
            if (tokens.length > 1) add(lineNumber, 'NewRun 参数过多', DiagnosticSeverity.Warning);
            if (!hasConf) add(lineNumber, 'NewRun 指令必须位于配置块内部', DiagnosticSeverity.Error);
            else { hasRun = true; hasIndex = false; }
            return;
        }
        if (command === 'NoLayerCopy') {
            if (tokens.length > 1) add(lineNumber, 'NoLayerCopy 参数过多', DiagnosticSeverity.Warning);
            if (!hasRun) add(lineNumber, 'NoLayerCopy 指令必须位于有效的 NewRun 或配置块内部', DiagnosticSeverity.Error);
            return;
        }
        if (command === 'Index') {
            if (!hasRun) { add(lineNumber, 'Index 指令必须位于有效的 NewRun 或配置块内部', DiagnosticSeverity.Error); return; }
            hasIndex = true;
            posCoordinates.clear();
            const idToken = tokens[1];
            if (!idToken) { add(lineNumber, "Index 缺少索引参数，格式: Index i[id] ?s['XFLIP'|'YFLIP'|'ROTATE']", DiagnosticSeverity.Error); return; }
            if (!isValidInteger(idToken, TILE_INDEX_MIN, TILE_INDEX_MAX)) add(lineNumber, `无效的索引 '${idToken}'，必须是 0 到 255 之间的整数`, DiagnosticSeverity.Error, idToken, 1);
            if (tokens.length > 5) add(lineNumber, 'Index 参数过多', DiagnosticSeverity.Warning);
            const indexModifiers = tokens.slice(2);
            const seen = new Set<string>();
            for (let i = 0; i < Math.min(indexModifiers.length, 3); i++) {
                const flag = indexModifiers[i];
                if (!flag) continue;
                if (!modifiers.includes(flag)) add(lineNumber, `未知的翻转标志 '${flag}'`, DiagnosticSeverity.Warning, flag, i + 2);
                else {
                    if (seen.has(flag) || (flag === 'NONE' && indexModifiers.some((item) => item !== 'NONE')) || (flag !== 'NONE' && indexModifiers.includes('NONE'))) add(lineNumber, '令人困惑的标志组合', DiagnosticSeverity.Information, flag, i + 2);
                    seen.add(flag);
                }
            }
            if (indexModifiers.includes('NONE')) add(lineNumber, '无用处', DiagnosticSeverity.Information, 'NONE', indexModifiers.indexOf('NONE') + 2);
            return;
        }
        if (command === 'Pos') {
            if (!hasIndex) { add(lineNumber, 'Pos 规则必须紧跟在 Index 指令之后声明', DiagnosticSeverity.Error); return; }
            const xToken = tokens[1], yToken = tokens[2], valueToken = tokens[3];
            if (!xToken || !yToken || !valueToken) { add(lineNumber, "Pos 参数不足，格式应为: Pos i[x] i[y] ?s['EMPTY'|'FULL'|'INDEX'|'NOTINDEX']", DiagnosticSeverity.Error); return; }
            if (!/^-?\d+$/.test(xToken) || isIntegerOutsideRange(xToken, INT32_MIN, INT32_MAX)) add(lineNumber, `Pos X 坐标 '${xToken}' 必须是有效的 32 位整数`, DiagnosticSeverity.Error, xToken, 1);
            if (!/^-?\d+$/.test(yToken) || isIntegerOutsideRange(yToken, INT32_MIN, INT32_MAX)) add(lineNumber, `Pos Y 坐标 '${yToken}' 必须是有效的 32 位整数`, DiagnosticSeverity.Error, yToken, 2);
            const coordKey = `${xToken},${yToken}`;
            if (posCoordinates.has(coordKey)) add(lineNumber, '重复的 Pos 规则坐标', DiagnosticSeverity.Information);
            else posCoordinates.add(coordKey);
            const upperValue = valueToken.toUpperCase();
            if (!['EMPTY', 'FULL', 'INDEX', 'NOTINDEX'].includes(upperValue)) { add(lineNumber, `无效的 Pos 匹配模式 '${valueToken}'，应为 EMPTY、FULL、INDEX 或 NOTINDEX`, DiagnosticSeverity.Error, valueToken, 3); return; }
            if ((upperValue === 'EMPTY' || upperValue === 'FULL') && tokens.length > 4) add(lineNumber, 'Pos 参数过多', DiagnosticSeverity.Warning);
            if (upperValue === 'INDEX' || upperValue === 'NOTINDEX') {
                if (tokens.length < 5) { add(lineNumber, `Pos ${upperValue} 模式缺失具体的索引参数`, DiagnosticSeverity.Error); return; }
                let i = 4;
                while (i < tokens.length) {
                    const id = tokens[i]; if (!id) break;
                    if (!isValidInteger(id, TILE_INDEX_MIN, TILE_INDEX_MAX)) add(lineNumber, `无效的索引 '${id}'，必须是 0 到 255 之间的整数`, DiagnosticSeverity.Error, id, i);
                    const idIndex = i++; const group: Array<{ value: string; index: number }> = [];
                    while (i < tokens.length) {
                        const tok = tokens[i]; if (!tok) break;
                        if (tok === 'OR') { if (i === tokens.length - 1) add(lineNumber, 'OR 后缺少索引条件', DiagnosticSeverity.Error, tok, i); i++; break; }
                        if (group.length >= 3) add(lineNumber, 'Pos 参数过多', DiagnosticSeverity.Warning, tok, i);
                        if (!['XFLIP', 'YFLIP', 'ROTATE', 'NONE'].includes(tok)) add(lineNumber, `Pos 指令中未知的修饰符或组合符 '${tok}'`, DiagnosticSeverity.Warning, tok, i);
                        group.push({ value: tok, index: i++ });
                    }
                    if (group.length === 0) add(lineNumber, '将匹配所有翻转状态', DiagnosticSeverity.Hint, id, idIndex);
                    const seenModifiers = new Set<string>();
                    for (const modifier of group) {
                        if (seenModifiers.has(modifier.value) || (modifier.value === 'NONE' && group.some((item) => item.value !== 'NONE')) || (modifier.value !== 'NONE' && group.some((item) => item.value === 'NONE'))) add(lineNumber, '令人困惑的标志组合', DiagnosticSeverity.Information, modifier.value, modifier.index);
                        seenModifiers.add(modifier.value);
                    }
                }
            }
            return;
        }
        if (command === 'Random') {
            if (!hasIndex) { add(lineNumber, 'Random 规则必须位于 Index 指令之后', DiagnosticSeverity.Error); return; }
            const val = tokens[1];
            if (!val) { add(lineNumber, 'Random 缺少数值参数，格式: Random f[value] 或 Random f[value]%', DiagnosticSeverity.Error); return; }
            if (!/^\d+(\.\d+)?%?$/.test(val)) { add(lineNumber, `无效的 Random 概率格式 '${val}'`, DiagnosticSeverity.Error, val, 1); return; }
            if (tokens.length > 2) add(lineNumber, 'Random 参数过多', DiagnosticSeverity.Warning);
            const number = Number.parseFloat(val.endsWith('%') ? val.slice(0, -1) : val);
            if (val.endsWith('%')) { if (number <= 0) add(lineNumber, '不可能', DiagnosticSeverity.Information, val, 1); else if (number >= 100) add(lineNumber, '始终为真', DiagnosticSeverity.Information, val, 1); }
            else if (number === 0) add(lineNumber, '除以零，始终为真', DiagnosticSeverity.Warning, val, 1);
            else if (number < 0) add(lineNumber, '不可能', DiagnosticSeverity.Information, val, 1);
            else if (number <= 1) add(lineNumber, '始终为真', DiagnosticSeverity.Information, val);
            return;
        }
        if (command === 'Modulo') {
            if (!hasIndex) { add(lineNumber, 'Modulo 规则必须位于 Index 指令之后', DiagnosticSeverity.Error); return; }
            if (tokens.length < 5) { add(lineNumber, 'Modulo 参数不足，格式: Modulo i[modX] i[modY] i[offsetX] i[offsetY]', DiagnosticSeverity.Error); return; }
            if (tokens.length > 5) add(lineNumber, 'Modulo 参数过多', DiagnosticSeverity.Warning);
            for (let i = 1; i <= 4; i++) { const param = tokens[i]; if (!isValidInteger(param, INT32_MIN, INT32_MAX)) add(lineNumber, `Modulo 参数 ${i} '${param ?? ''}' 必须是整数`, DiagnosticSeverity.Error, param, i); }
            if (tokens[1] === '0' || tokens[2] === '0') add(lineNumber, 'Modulo 的 modX 或 modY 为 0 时，将被自动重置为 1', DiagnosticSeverity.Warning);
            return;
        }
        if (command === 'NoDefaultRule') {
            if (tokens.length > 1) add(lineNumber, 'NoDefaultRule 参数过多', DiagnosticSeverity.Warning);
            if (!hasIndex) add(lineNumber, 'NoDefaultRule 指令必须位于 Index 指令之后', DiagnosticSeverity.Error);
            return;
        }
        add(lineNumber, `无法解析的语法或指令: '${trimmed}'`, DiagnosticSeverity.Warning);
    });
    return diagnostics;
}
