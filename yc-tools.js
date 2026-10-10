/* Personal tools, automatically registered with Cookie Clicker's native Mod API. */
(function () {
    'use strict';
    const id = 'YC Tools';
    if (Game.mods[id]) return;
    const core = window.YCSaveCore;
    let ready = false, warned = false, recovery = null, selection = 0, view = '';
    let bar, dialog, status, toggle;
    const byId = name => document.getElementById(name);
    const format = value => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumSignificantDigits: 6 }).format(value);
    const busyGame = () => !!(Game.OnAscend || Game.AscendTimer || Game.ReincarnateTimer || Game.ObjectsById.some(me => me.minigameLoading));
    function message(text) { status.textContent = text; }
    function enable() {
        ready = true;
        toggle.disabled = false;
        bar.querySelectorAll('[data-yc-ready]').forEach(button => { button.disabled = false; });
        message('个人使用，请勿传播');
    }
    function screen() {
        const viewport = window.visualViewport;
        const unit = viewport ? 1 / viewport.scale : 1;
        const width = viewport ? viewport.width : window.innerWidth;
        const height = viewport ? viewport.height : window.innerHeight;
        const style = document.documentElement.style;
        style.setProperty('--yc-unit', unit);
        style.setProperty('--yc-vw', width + 'px');
        style.setProperty('--yc-vh', height + 'px');
        style.setProperty('--yc-left', (viewport ? viewport.offsetLeft : 0) + 'px');
        style.setProperty('--yc-top', (viewport ? viewport.offsetTop : 0) + 'px');
        bar.dataset.narrow = String(width / unit < 620);
    }
    function show(title, html, kind) {
        selection++;
        if (bar.open) { bar.close(); toggle.setAttribute('aria-expanded', 'false'); }
        if (dialog.open) dialog.close();
        view = kind || '';
        dialog.innerHTML = '<header><h2 id="yc-dialog-title"></h2><button type="button" id="yc-close" aria-label="关闭">关闭</button></header>' + html;
        byId('yc-dialog-title').textContent = title;
        byId('yc-close').addEventListener('click', () => dialog.close());
        dialog.showModal();
        (dialog.querySelector('[data-yc-focus]') || byId('yc-close')).focus();
    }
    function error(text) {
        show('未执行操作', '<p id="yc-error" role="alert"></p><p>当前进度未修改。</p>');
        byId('yc-error').textContent = text;
    }
    function filename() {
        const date = new Date();
        const pad = number => String(number).padStart(2, '0');
        return 'yc-save-' + date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + '_' + pad(date.getHours()) + '-' + pad(date.getMinutes()) + '-' + pad(date.getSeconds()) + '.txt';
    }
    function download(code, name) {
        const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = name; link.hidden = true;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    }
    function exportSave() {
        if (!ready) return;
        let code;
        try { code = recovery || Game.WriteSave(1); } catch (_) { error('无法生成存档，请保持页面开启。'); return; }
        const name = filename();
        show(recovery ? '导入前的恢复备份' : '导出存档', '<p>已请求下载原生 .txt 存档。把文件传到另一台设备，再选择“导入存档”。</p><p id="yc-export-name"></p><div class="yc-actions"><button id="yc-download" type="button">再次下载</button><button id="yc-copy" type="button">复制文本</button></div><p>若浏览器没有下载文件，可复制下方完整文本，保存为 .txt，或在另一台设备粘贴导入。</p><textarea id="yc-save-text" aria-label="完整存档文本" readonly spellcheck="false"></textarea><p id="yc-copy-status" role="status"></p>');
        byId('yc-export-name').textContent = name;
        byId('yc-save-text').value = code;
        byId('yc-download').addEventListener('click', () => {
            try { download(code, name); } catch (_) { byId('yc-copy-status').textContent = '下载不可用，请复制存档文本。'; }
        });
        byId('yc-copy').addEventListener('click', async () => {
            const field = byId('yc-save-text'), hint = byId('yc-copy-status');
            try { await navigator.clipboard.writeText(code); hint.textContent = '已复制完整存档文本。'; }
            catch (_) { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); hint.textContent = '请使用浏览器的复制功能复制已选中的完整文本。'; }
        });
        try { download(code, name); } catch (_) { byId('yc-copy-status').textContent = '下载不可用，请复制存档文本。'; }
    }
    function checkImport(code) {
        if (!ready || recovery) return;
        if (busyGame()) { error('正在转生、返回游戏或加载小游戏，请稍后再导入。'); return; }
        const validate = text => core.parseSave(text, Game.version, b64_to_utf8, { buildings: Game.ObjectsById.filter(me => me.vanilla).length, upgrades: Object.values(Game.UpgradesById).filter(me => me.vanilla).length, achievements: Object.values(Game.AchievementsById).filter(me => me.vanilla).length });
        let parsed;
        try { parsed = validate(code); }
        catch (problem) { error(problem.message); return; }
        show('确认覆盖当前进度', '<p>导入会替换本浏览器的当前进度。想保留当前进度，请先取消并导出。</p><dl><dt>保存时间</dt><dd id="yc-import-time"></dd><dt>游戏版本</dt><dd id="yc-import-version"></dd><dt>饼干店</dt><dd id="yc-import-bakery"></dd><dt>饼干库存</dt><dd id="yc-import-cookies"></dd></dl><div class="yc-actions"><button id="yc-cancel-import" type="button" data-yc-focus>取消</button><button id="yc-confirm-import" class="yc-primary" type="button">覆盖并导入</button></div>', 'confirm');
        byId('yc-import-time').textContent = new Date(parsed.savedAt).toLocaleString('zh-CN');
        byId('yc-import-version').textContent = parsed.version;
        byId('yc-import-bakery').textContent = parsed.bakery;
        byId('yc-import-cookies').textContent = format(parsed.cookies);
        byId('yc-cancel-import').addEventListener('click', () => dialog.close());
        byId('yc-confirm-import').addEventListener('click', () => {
            if (busyGame()) { error('当前正在转生或加载小游戏，请稍后再试。'); return; }
            let result;
            try { result = core.importSave(Game, window.localStorage, parsed.code, validate); }
            catch (_) { error('浏览器拒绝读取本地存档，无法安全导入；仍可导出当前进度。'); return; }
            if (result.ok) {
                dialog.close();
                message('已导入并保存进度。');
            } else if (result.restored) {
                show('导入失败', '<p id="yc-import-failure" role="alert"></p><p>可以继续游玩或导出当前进度。</p>');
                byId('yc-import-failure').textContent = result.message;
            } else {
                recovery = result.snapshot;
                exportSave();
                byId('yc-copy-status').textContent = result.message;
                byId('yc-import').disabled = true;
                byId('yc-boost').disabled = true;
                message('恢复未完成，请保留导入前备份，不要刷新。');
            }
        });
    }
    async function readFile(event) {
        const input = event.target, file = input.files[0];
        input.value = '';
        if (!file) return;
        if (file.size > core.MAX_BYTES) { error('存档超过 4 MB，无法读取。'); return; }
        const ticket = ++selection;
        message('正在读取存档…');
        try {
            const text = await file.text();
            if (ticket !== selection) return;
            message('个人使用，请勿传播');
            checkImport(text);
        } catch (_) { if (ticket === selection) error('无法读取文件，请重新选择。'); }
    }
    function importPanel() {
        if (!ready || recovery) return;
        show('导入存档', '<p>选择本页面或官网导出的原生 .txt 文件。读取文件后还需要确认，才会覆盖进度。</p><label class="yc-file">选择存档文件<input id="yc-file" type="file" accept=".txt,text/plain" aria-label="选择存档文件"></label><details><summary>粘贴存档文本</summary><textarea id="yc-paste" aria-label="粘贴存档文本" spellcheck="false" placeholder="在这里粘贴完整存档文本"></textarea><button id="yc-check-paste" type="button">检查并继续</button></details><p>存档只在本浏览器读取，不上传。各设备需要手动传递文件。</p>');
        byId('yc-file').addEventListener('change', readFile);
        byId('yc-check-paste').addEventListener('click', () => checkImport(byId('yc-paste').value));
    }
    function boost(amount, lumps) {
        const hint = byId('yc-boost-status');
        if (!ready || recovery || busyGame()) { hint.textContent = '正在转生或加载小游戏，暂时不能使用增益。'; return; }
        if (lumps && !Game.canLumps()) { hint.textContent = '糖块尚未解锁，请先按原版规则解锁。'; return; }
        try {
            const delta = core.increment(lumps ? Math.max(0, Game.lumps) : Game.cookies, lumps ? Math.max(0, Game.lumpsTotal) : Game.cookiesEarned, amount);
            if (lumps) Game.gainLumps(delta); else Game.Earn(delta);
            Game.recalculateGains = 1;
            updateBoost();
            hint.textContent = '已增加 ' + format(delta) + (lumps ? ' 个糖块。' : ' 块饼干。');
        } catch (problem) { hint.textContent = problem.message; }
    }
    function updateBoost() {
        if (view !== 'boost' || !dialog.open) return;
        byId('yc-cookies').textContent = format(Game.cookies);
        const unlocked = Game.canLumps();
        byId('yc-lumps').textContent = unlocked ? format(Math.max(0, Game.lumps)) : '尚未解锁';
        dialog.querySelectorAll('[data-cookies], #yc-custom-add').forEach(button => { button.disabled = busyGame(); });
        dialog.querySelectorAll('[data-lumps]').forEach(button => { button.disabled = !unlocked || busyGame(); });
    }
    function boostPanel() {
        if (!ready || recovery) return;
        if (!warned) {
            show('资源增益提示', '<p>首次游玩不建议使用资源增益，以免破坏探索和成长的体验。</p><p>增益会改变资源、累计统计，并可能触发原版成就和糖块解锁。</p><div class="yc-actions"><button id="yc-cancel-boost" type="button" data-yc-focus>取消</button><button id="yc-accept-boost" class="yc-primary" type="button">了解风险，继续</button></div>');
            byId('yc-cancel-boost').addEventListener('click', () => dialog.close());
            byId('yc-accept-boost').addEventListener('click', () => { warned = true; boostPanel(); });
            return;
        }
        show('资源增益', '<h3>饼干 <span id="yc-cookies"></span></h3><div class="yc-actions"><button type="button" data-cookies="1000">+1千</button><button type="button" data-cookies="1000000">+100万</button><button type="button" data-cookies="1000000000">+10亿</button></div><label for="yc-custom">自定义饼干增量（正数，也可输入 1e12）</label><div class="yc-custom"><input id="yc-custom" type="text" inputmode="decimal" value="1000" autocomplete="off"><button id="yc-custom-add" type="button">增加</button></div><h3>糖块 <span id="yc-lumps"></span></h3><div class="yc-actions"><button type="button" data-lumps="1">+1</button><button type="button" data-lumps="10">+10</button></div><p>糖块需先按原版规则解锁。增益沿用原版自动保存，也可立即导出存档。</p><p id="yc-boost-status" role="status"></p>', 'boost');
        dialog.querySelectorAll('[data-cookies]').forEach(button => button.addEventListener('click', () => boost(button.dataset.cookies, false)));
        dialog.querySelectorAll('[data-lumps]').forEach(button => button.addEventListener('click', () => boost(button.dataset.lumps, true)));
        byId('yc-custom-add').addEventListener('click', () => boost(byId('yc-custom').value, false));
        byId('yc-custom').addEventListener('keydown', event => { if (event.key === 'Enter') boost(byId('yc-custom').value, false); });
        updateBoost();
    }
    Game.registerMod(id, {
        name: 'YC自用工具',
        init: function () {
            toggle = byId('yc-tools-toggle');
            bar = document.createElement('dialog');
            bar.id = 'yc-toolbar'; bar.setAttribute('aria-labelledby', 'yc-tools-title');
            bar.innerHTML = '<header class="yc-drawer-head"><div class="yc-brand"><h2 id="yc-tools-title">YC自用</h2><span id="yc-status" role="status">正在初始化…</span></div><button type="button" id="yc-collapse">收起</button></header><div class="yc-actions"><button type="button" id="yc-export" data-yc-ready disabled>导出存档</button><button type="button" id="yc-import" data-yc-ready disabled>导入存档</button><button type="button" id="yc-boost" data-yc-ready disabled>资源增益</button></div>';
            document.body.appendChild(bar);
            status = byId('yc-status');
            dialog = document.createElement('dialog');
            dialog.id = 'yc-dialog'; dialog.setAttribute('aria-labelledby', 'yc-dialog-title');
            document.body.appendChild(dialog);
            [bar, dialog, toggle].forEach(element => {
                ['keydown', 'keyup', 'pointerdown', 'mousedown', 'touchstart'].forEach(type => element.addEventListener(type, event => event.stopPropagation()));
            });
            dialog.addEventListener('close', () => { if (!dialog.open) { view = ''; selection++; toggle.focus({ preventScroll: true }); } });
            toggle.addEventListener('click', () => {
                if (!ready || bar.open) return;
                screen();
                bar.showModal();
                bar.scrollTop = 0;
                toggle.setAttribute('aria-expanded', 'true');
                byId('yc-collapse').focus();
            });
            byId('yc-collapse').addEventListener('click', () => bar.close());
            bar.addEventListener('close', () => {
                if (!bar.open) {
                    toggle.setAttribute('aria-expanded', 'false');
                    if (!dialog.open) toggle.focus({ preventScroll: true });
                }
            });
            [bar, dialog].forEach(panel => panel.addEventListener('click', event => {
                if (event.target === panel) {
                    const rect = panel.getBoundingClientRect();
                    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) panel.close();
                }
            }));
            byId('yc-export').addEventListener('click', exportSave);
            byId('yc-import').addEventListener('click', importPanel);
            byId('yc-boost').addEventListener('click', boostPanel);
            // Native Options file/import buttons use the same preview and rollback protection.
            Game.ImportSave = importPanel;
            Game.FileLoad = readFile;
            Game.FileSave = exportSave;
            window.addEventListener('yc-initial-save-ready', enable, { once: true });
            window.addEventListener('resize', screen);
            if (window.visualViewport) {
                visualViewport.addEventListener('resize', screen);
                visualViewport.addEventListener('scroll', screen);
            }
            screen();
            Game.registerHook('logic', function () { if (Game.T % Game.fps === 0) updateBoost(); });
        }
    });
}());