/* YC tools: native save validation and resource/import operations. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.YCSaveCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const MAX_BYTES = 4 * 1024 * 1024;
    const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
    function number(value, label) {
        if (typeof value !== 'string' || !numeric.test(value) || !Number.isFinite(Number(value))) {
            throw new Error('存档中的' + label + '无效。');
        }
        return Number(value);
    }
    function minigame(data, id) {
        if (!data || ![2, 5, 6, 7].includes(id)) return;
        const fail = () => { throw new Error('存档的小游戏数据损坏。'); };
        const list = (text, separator, count, trailing) => {
            const fields = text.split(separator);
            if (trailing && fields.at(-1) === '') fields.pop();
            if (fields.length !== count) fail();
            return fields.map(value => number(value, '小游戏数值'));
        };
        const chunks = data.split(' ');
        if (id === 2) {
            if (chunks.length !== 3 || !/^[01]+$/.test(chunks[1])) fail();
            list(chunks[0], ':', 9, true);
            const cells = list(chunks[2], ':', 72, true);
            if (cells.some((value, i) => !Number.isInteger(value) || value < 0 || i % 2 === 0 && value > chunks[1].length)) fail();
        } else if (id === 5) {
            if (chunks.length !== 3 || !/^[01]$/.test(chunks[2])) fail();
            list(chunks[0], ':', 5, true);
            const goods = chunks[1].split('!');
            if (goods.pop() !== '' || !goods.length) fail();
            goods.forEach(good => list(good, ':', 8, false));
        } else if (id === 6) {
            if (chunks.length !== 4 || !/^[01]$/.test(chunks[3])) fail();
            list(chunks[0], '/', 3, false);
            chunks.slice(1).forEach(value => number(value, '小游戏数值'));
        } else {
            if (chunks.length !== 4 || !/^[01]$/.test(chunks[3])) fail();
            chunks.forEach(value => number(value, '小游戏数值'));
        }
    }
    function parseSave(input, currentVersion, decode, schema) {
        if (typeof input !== 'string' || !input.trim()) throw new Error('存档内容为空。');
        if (input.length > MAX_BYTES) throw new Error('存档超过 4 MB，无法读取。');
        let text;
        try { text = unescape(input.trim()).replace(/\s/g, ''); }
        catch (_) { throw new Error('无法识别存档编码。'); }
        if (!text.endsWith('!END!')) throw new Error('不是完整的原生文本存档，可能选错了文件。');
        const encoded = text.slice(0, -5);
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || !encoded) {
            throw new Error('存档编码损坏。');
        }
        let decoded;
        try { decoded = decode(encoded); } catch (_) { throw new Error('存档无法解码。'); }
        const parts = decoded.split('|');
        if (parts.length < 8 || !/^\d+(?:\.\d+)?$/.test(parts[0])) throw new Error('存档结构不完整。');
        const version = Number(parts[0]);
        if (version > currentVersion) throw new Error('存档来自较新版本 ' + version + '；当前为 ' + currentVersion + '，请先升级网页。');
        if (version < 2.0046) throw new Error('此工具支持 2.0046 及以上的存档；更早存档请先在官网转换。');
        const stats = parts[2].split(';');
        if (stats.length < 5) throw new Error('存档缺少保存信息。');
        for (let i = 0; i < 3; i++) {
            const date = number(stats[i], '时间');
            if (date <= 0 || !Number.isInteger(date) || Number.isNaN(new Date(date).getTime())) throw new Error('存档时间无效。');
        }
        if (!/^[01]+$/.test(parts[3]) || !/^[01]+$/.test(parts[6]) || !/^[01]+$/.test(parts[7])) {
            throw new Error('存档的设置、升级或成就数据损坏。');
        }
        const values = parts[4].split(';');
        if (values.length < (version >= 2.058 ? 55 : 44)) throw new Error('存档缺少游戏进度。');
        values.forEach((value, index) => {
            if (index === 22 || (index === 47 && !value) || index === values.length - 1 && !value) return; // season, empty vault, trailing separator
            if (!value) throw new Error('存档的游戏数值缺失。');
            if (index === 47) {
                if (!/^\d+(?:,\d+)*$/.test(value)) throw new Error('存档的收藏数据损坏。');
            } else number(value, '游戏数值');
        });
        number(values[0], '饼干数量'); number(values[1], '累计饼干');
        const buildings = parts[5].split(';').filter(Boolean);
        if (!buildings.length) throw new Error('存档缺少建筑数据。');
        if (schema && version === currentVersion && (buildings.length !== schema.buildings || parts[6].length !== schema.upgrades * 2 || parts[7].length !== schema.achievements)) throw new Error('存档的建筑、升级或成就数据不完整。');
        buildings.forEach((building, id) => {
            const fields = building.split(',');
            if (version >= 2.058) minigame(fields[4], id);
            if (fields.length < (version >= 2.024 ? 7 : 4)) throw new Error('存档的建筑数据不完整。');
            [0, 1, 2, 3].concat(version >= 2.024 ? [5, 6] : []).forEach(index => {
                const value = number(fields[index], '建筑数值');
                if (index !== 2 && (!Number.isInteger(value) || value < 0)) throw new Error('存档的建筑数量无效。');
            });
        });
        // Buffs are numeric tuples; Mod strings remain opaque to preserve native compatibility.
        (parts[8] || '').split(';').filter(Boolean).forEach(buff => {
            const fields = buff.split(',');
            if (fields.length < 3) throw new Error('存档的效果数据不完整。');
            fields.forEach(value => number(value, '效果数值'));
        });
        return { code: text, version, savedAt: Number(stats[2]), bakery: stats[3], cookies: Number(values[0]) };
    }
    function increment(current, total, input) {
        const text = String(input).trim();
        const delta = numeric.test(text) ? Number(text) : NaN;
        if (!Number.isFinite(delta) || delta <= 0) throw new Error('请输入有限的正数，可使用 1e12 这样的写法。');
        if (![current, total].every(Number.isFinite)) throw new Error('当前资源数值异常，未执行增益。');
        if (![current, total].every(value => Number.isFinite(value + delta))) throw new Error('增量过大，会导致数值溢出。');
        if (![current, total].every(value => value + delta > value)) throw new Error('增量低于当前数值的精度，请使用更大的增量。');
        return delta;
    }
    function importSave(game, storage, code) {
        // Caller validates before invoking this operation. Native ImportSaveCode resets first.
        const previousStorage = storage.getItem(game.SaveTo); // fail before touching the game if storage is denied
        const snapshot = game.WriteSave(1);
        let writing = false;
        try {
            game.modSaveData = {};
            if (!game.ImportSaveCode(code)) throw new Error('原生读档未成功。');
            const current = game.WriteSave(1);
            writing = true;
            storage.setItem(game.SaveTo, current);
            if (storage.getItem(game.SaveTo) !== current) throw new Error('浏览器未保存导入后的进度。');
            return { ok: true };
        } catch (error) {
            let restored = true;
            try {
                game.modSaveData = {};
                if (!game.ImportSaveCode(snapshot)) restored = false;
            } catch (_) { restored = false; }
            if (writing) {
                try {
                    if (storage.getItem(game.SaveTo) !== previousStorage) {
                        if (previousStorage === null) storage.removeItem(game.SaveTo);
                        else storage.setItem(game.SaveTo, previousStorage);
                    }
                } catch (_) { restored = false; }
            }
            if (!restored) { game.prefs.autosave = 0; game.toSave = false; }
            return { ok: false, restored, snapshot, message: restored ? '导入失败，已恢复原进度。' : '恢复未完成，已暂停自动保存。请导出下方的导入前备份，不要刷新。', cause: error.message };
        }
    }
    return { MAX_BYTES, parseSave, increment, importSave };
}));