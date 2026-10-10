# YC自用

个人使用，请勿传播。

游戏入口：https://chen13754.github.io/cookieclicker/

Cookie Clicker 2.058 的个人修改版，默认原版简体中文，自动加载中文资源面板和存档工具。浏览器标题固定为 **YC自用**，保留原作布局、游戏机制和离线收益规则。

## 使用

- **资源增益**：饼干 +1千、+100万、+10亿或自定义有限正数（支持 `1e12`）。糖块按原版解锁后可 +1、+10。使用原版资源接口，影响累计统计，也可能触发成就；每次打开页面首次使用前提示风险。非法数值、溢出或受浮点精度限制而没有实际增量时拒绝执行。
- **导出存档**：点击时调用原生序列化，下载文件名带时间的 `.txt`，包括建筑、升级、成就、转生和小游戏进度。浏览器没有下载时，可复制完整存档文本。
- **导入存档**：选择文件或粘贴完整文本，检查版本和结构并预览保存时间，确认覆盖后才执行。失败时恢复导入前快照；双重失败时暂停自动保存并提供该快照下载。原版“选项”中的导入、文件读写也使用新增入口。
- **换设备**：在设备 A 导出，手动把文件发到设备 B，再导入。各设备独立保存在自己的浏览器中，没有服务器存档或自动云同步。不要同时在多台设备继续同一进度。
- 支持本版及同版本官网原生存档；较新版本直接拒绝。兼容读取 2.0046 及以上旧格式，由原版引擎迁移；更早的存档请先在官网转换。建议覆盖前手动导出备份。

独立存储键为 `CookieClickerGame-YC`，语言键为 `CookieClickerLang-YC`，避免与同一 GitHub Pages 域名下其他游戏冲突。工具走原版 Mod API，因此原生 `Third-party` 隐藏成就可能出现。浏览器清理网站数据会删除本地存档，请定期导出。

这是**公开网页及公开仓库**。“自用／请勿传播”仅为文字提示，不提供登录、批准名单或访问限制。

## 来源和原作者说明

- 原作：[Cookie Clicker / Orteil、DashNet](https://orteil.dashnet.org/cookieclicker/)。代码和图像原始版权声明保留在 `index.html` 中；原作者相关链接仍在页面内。
- 固定镜像：[ozh/cookieclicker](https://github.com/ozh/cookieclicker)，`gh-pages`，提交 [`c77f00c51854a667da35a3135120797a579c2d72`](https://github.com/ozh/cookieclicker/commit/c77f00c51854a667da35a3135120797a579c2d72)，游戏版本 **2.058**。原镜像 README 保留为 [UPSTREAM.md](UPSTREAM.md)。
- 原作声明原文：

  > Code and graphics copyright Orteil, 2013-2026
  > Feel free to alter this code to your liking, but please do not re-host it, do not profit from it and do not present it as your own.

上述声明包含“请勿重新托管”的要求；个人使用、公开仓库或此提示均不改变该要求，也不代表已获得转载授权。此项目不将原作标为自己创作，也不另行授予原作许可。

图片、声音、字体和语言包随站点发布。已移除页面的广告、统计和 Cloudflare 挑战注入脚本；保留原版用于游戏版本、heralds、奶奶姓名和公告的 `orteil.dashnet.org/data/` 数据请求。

## 开发和发布

依赖与浏览器缓存均放在本工程内；运行时不依赖 npm。

```powershell
npm ci --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\playwright"
npx playwright-core install chromium
npm test
npm run test:browser
npm run package
```

浏览器测试使用独立临时配置和合成进度，不读取真实浏览器存档。可设置 `YC_BROWSER=chrome` 或 `msedge` 复用现有浏览器。`npm run package` 通过白名单生成 `dist/`，排除测试、依赖、缓存、个人存档及上游抓取索引。推送 `main` 后由 GitHub Actions 发布 Pages。

验证详情见 [VALIDATION.md](VALIDATION.md)。手机和平板尺寸的浏览器模拟不能代替 Android、iPhone 或 iPad 实机验证。