import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
} from 'vscode-languageserver/node';

export function provideCompletions(): CompletionItem[] {
    return [
        {
            label: 'Index', kind: CompletionItemKind.Snippet, insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Index ${1:id}${2| , XFLIP, YFLIP, ROTATE|}', detail: '选择要放置的图块索引',
            documentation: "用法: Index i[id] ?s['XFLIP'|'YFLIP'|'ROTATE']\n示例: Index 42 XFLIP YFLIP",
        },
        { label: 'Index', kind: CompletionItemKind.Keyword, detail: '选择要放置的图块索引' },
        {
            label: 'Pos', kind: CompletionItemKind.Snippet, insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Pos ${1:x} ${2:y} ${3|EMPTY,FULL,INDEX ,NOTINDEX |}', detail: '定义放置条件，检查相对位置状态',
            documentation: "用法: Pos i[x] i[y] s['EMPTY'|'FULL'|'INDEX'|'NOTINDEX']",
        },
        { label: 'Pos', kind: CompletionItemKind.Keyword, detail: '定义放置条件，检查相对位置状态' },
        {
            label: 'Random', kind: CompletionItemKind.Snippet, insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Random ${1:value}', detail: '设置随机放置概率',
            documentation: '用法: Random f[value]% 或 Random f[value]\n非百分数时概率为 1 / value。\n示例: Random 20%',
        },
        { label: 'Random', kind: CompletionItemKind.Keyword, detail: '设置随机放置概率' },
        {
            label: 'Modulo', kind: CompletionItemKind.Snippet, insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'Modulo ${1:modX} ${2:modY} ${3:offsetX} ${4:offsetY}', detail: '基于坐标模运算的过滤器',
            documentation: '在 `(x + offsetX) % modX` 与 `(y + offsetY) % modY` 都为 0 时放置图块。\n用法: Modulo i[modX] i[modY] i[offsetX] i[offsetY]\n示例: Modulo 2 3 0 -1',
        },
        { label: 'Modulo', kind: CompletionItemKind.Keyword, detail: '基于坐标模运算的过滤器' },
        { label: 'NoDefaultRule', kind: CompletionItemKind.Keyword, detail: '禁用默认隐含条件', documentation: '禁用当前 Index 规则的默认隐含条件（`Pos 0 0 NOTINDEX 0`）。' },
        { label: 'NewRun', kind: CompletionItemKind.Keyword, detail: '开始新一轮运行', documentation: '在当前配置中开始新一轮运行。' },
        { label: 'NoLayerCopy', kind: CompletionItemKind.Keyword, detail: '禁用图层复制（就地修改）', documentation: '在当前运行中禁用图层复制，可提升性能但需谨慎。' },
        { label: 'EMPTY', kind: CompletionItemKind.EnumMember, detail: '图块索引为 0' },
        { label: 'FULL', kind: CompletionItemKind.EnumMember, detail: '图块索引不为 0' },
        { label: 'INDEX', kind: CompletionItemKind.EnumMember, detail: '匹配指定的图块索引' },
        { label: 'NOTINDEX', kind: CompletionItemKind.EnumMember, detail: '排除特定的图块索引' },
        { label: 'XFLIP', kind: CompletionItemKind.EnumMember, detail: '水平翻转' },
        { label: 'YFLIP', kind: CompletionItemKind.EnumMember, detail: '垂直翻转' },
        { label: 'ROTATE', kind: CompletionItemKind.EnumMember, detail: '顺时针旋转 90°' },
        { label: 'NONE', kind: CompletionItemKind.EnumMember, detail: '无翻转' },
        { label: 'OR', kind: CompletionItemKind.Operator, detail: '逻辑或组合条件' },
        { label: 'ROT90', kind: CompletionItemKind.EnumMember, insertTextFormat: InsertTextFormat.PlainText, insertText: 'ROTATE', detail: '顺时针旋转 90° 标识' },
        { label: 'ROT180', kind: CompletionItemKind.EnumMember, insertTextFormat: InsertTextFormat.PlainText, insertText: 'XFLIP YFLIP', detail: '顺时针旋转 180° 标识' },
        { label: 'ROT270', kind: CompletionItemKind.EnumMember, insertTextFormat: InsertTextFormat.PlainText, insertText: 'XFLIP YFLIP ROTATE', detail: '顺时针旋转 270° 标识' },
    ];
}
