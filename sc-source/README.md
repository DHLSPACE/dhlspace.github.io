# SC 人物研究知识库

目标地址：<https://162383.xyz/sc/>。当前人物：洪卫、王珺、曾小军、邓强。

这是 2026-10-21 本地整理档案的公开快照：394 条人物论文记录，按 DOI 合并成 320 篇论文；63 条署名排名第一记录；每人 5 篇首轮阅读建议。A/B/C 是人物论文归属的证据层次，不是研究质量评级。

## 目录与本地重建

- `src/`：HTML、CSS、JavaScript、SVG 图标的可维护源文件。
- `tools/build_site.py`：读取 SC 下前三位人物原有 `整理结果_2026-10-21` 及邓强的 `整理结果_2026-10-20`，生成 `dist/sc/`。不修改原档案。
- `dist/sc/`：可直接发布的静态站，发布到 GitHub 仓库 `public/sc/`。
- `tools/verify_site.py`：核对覆盖数、DOI、作者对应、下载链接与来源 SHA-256。
- `tools/smoke_ui.cjs`：在 Node VM 中核对路由渲染、真实数据筛选及阅读状态。不是浏览器布局测试。

在 SC 工作目录运行（仅需 Python 标准库和 Node，无需安装依赖）：

```powershell
python -X utf8 sc-site/tools/build_site.py
python -X utf8 sc-site/tools/verify_site.py
node --check sc-site/src/app.js
node sc-site/tools/smoke_ui.cjs
python -m http.server 8787 --bind 127.0.0.1 --directory sc-site/dist
```

预览地址 `http://127.0.0.1:8787/sc/`。采用 `#/people/hongwei` 形式的哈希路由，在 GitHub Pages 直接刷新人物页也不需要服务器重写。

## 内容组织

1. 总览：人物入口、统计、稳定阅读路径和证据口径。
2. 人物档案：研究主线、教育任职、阶段演变、实验依据、研究伙伴、来源差异。
3. 论文文库：中英文、作者、DOI 搜索；人物、年份、主题、归属证据、一作和收藏筛选；排序、分页、CSV 导出；论文详情与逐位作者 ORCID 对应。
4. 研究关联：本次 DOI 交集，6 篇王珺/洪卫交集、68 篇王珺/邓强交集。邓强已为第四位独立研究对象。曾小军当前清单未发现与其余三位共同 DOI。不推断师生、组员、上下级关系。
5. 阅读工作台：20 篇起步论文、核心问题、实验关注点、来源阅读深度、状态、笔记和 JSON 导入导出。
6. 来源与数据：44 张公开 CSV、人物介绍、精读模板、完整 JSON、SHA-256 清单与口径。

## UI 与适配

浅色 Liquid Glass 风格：半透明玻璃、背景模糊、细高光边缘、柔和冷色光晕。桌面侧栏，小屏底部导航；正文断点覆盖 320px 起的手机、平板与桌面；表格在自己的容器内横向滚动。兼容缺少 backdrop-filter 的浏览器，支持减少动画、高对比偏好与打印。图形为原创 CSS/SVG 装饰，不是任何论文的实验结构或结果。

## 数据、个人记录与来源边界

- 人物内容来自既有中文研究介绍、结构化档案与人物 CSV（前三位各12张，邓强8张）。完整元数据、原文阅读深度、年月精度及未知信息保留。
- 全文、SI 和候选开放链接仍按原档案的核验状态展示；网站没有把它们标为已读或已下载。
- 原始 CSV、完整 API/网页缓存、既有 ZIP 与 Obsidian 包不发布。来源清单记录原表 SHA-256 和公开表 SHA-256。
- 公开数据省略个人笔记、阅读日期、阅读状态、下载状态、补充信息状态和本地 PDF 路径。网页个人记录单独位于浏览器 `localStorage` 的 `sc-reading-v1` 键。
- 元数据单位字段偶尔夹带邮箱、电话或传真；公开构建统一省略这些联系方式，保留单位、DOI 与 ORCID。原始档案继续在本地保留。发布检查要求所有公开文件通过联系方式扫描。
- 导出的阅读 JSON 是个人备份；不要把带有私人笔记的备份提交到公开仓库。导入按 DOI 合并，保留更新时间较新的记录。
- 首屏只加载公共档案与论文元数据。逐位作者 ORCID 明细按需读取，不加载外部字体、分析脚本或第三方 JS。

## GitHub Pages 部署

使用现有 `DHLSPACE/dhlspace.github.io` 的 `main` 分支。将 `dist/sc/` 完整复制到仓库 `public/sc/`；将本项目源文件、构建/校验工具与 README 保留在 `sc-source/`，便于后续维护。

现有 `.github/workflows/jekyll-gh-pages.yml` 的静态打包步骤需追加：

```sh
cp -R public/sc _site/sc
```

现有根首页、CNAME、旧项目路由以及它们的复制步骤都保持原样。工作流由 `main` 的新提交自动触发，之后检查相应 Actions run 与 `https://162383.xyz/sc/` 的静态文件哈希。

从 GitHub 取得 `sc-source/` 后，可以指定本地原档案目录重建；输出位于 `sc-source/dist/sc/`：

```powershell
$env:SC_ARCHIVE_ROOT = 'E:\Codex\Self-Dev\SC'
python -X utf8 sc-source/tools/build_site.py
python -X utf8 sc-source/tools/verify_site.py
node sc-source/tools/smoke_ui.cjs
```

更新资料时，先在本地完成作者消歧及归属核验，再明确调整日期、配置与人物输入路径。以本地原档案为内容入口，重新生成公开快照；网页阅读备份可在新版中按 DOI 导入。后续新增人物需在 `CONFIG` 中添加独立身份与资料来源，先通过核验再发布。

## 验证范围

数据、资源、JavaScript 语法、路由输出、筛选组合与本地阅读记录可自动验证。当前会话未暴露可批准使用的浏览器控制工具，因此未执行真实浏览器、手机设备或 Safari 的视觉与交互验收。CSS 已包含相应响应式与降级规则，但这些规则不等同于实机测试。

## 邓强旧档适配

`tools/deng_adapter.py` 将既有8张CSV与 `dengqiang/report_body.html` 适配为统一网站数据，保留2026-10-20原核验日期、101条论文和13条排名第一记录。全部内容仍来自原档，未声称重新检索或完成个人全集。原档5条官方代表作映射A；51条Crossref作者ORCID及单位/合作链支持映射B；9条仅Crossref单位支持与36条OpenAlex单位/合作链支持保守映射C。每条原始归属说明保留。

网页的五篇起步阅读由原有阅读线索收敛为综述、2015酸催化、2021 Co–N、2022 MAX与2025开放代表作；原主表的完整阅读建议仍可下载。原报告中实验方法、个人贡献限制、任职日期差异与导师待核事项完整保留。邓强人物介绍提供HTML下载，其余三位沿用Markdown。所有人物间共同DOI由四份清单重新计算，界面人数、阅读数量、数据表数按实际数据生成。



## 双金属实验学习模块（2026-10-28）

新增独立入口 `/sc/lab/bimetallic/`，源文件位于 `sc-source/modules/bimetallic/`，发布副本位于 `public/sc/lab/bimetallic/`。学习模块通过无 `allow-same-origin` 的沙箱 iframe 与 SC 人物文库隔离，使用独立存储命名空间与限制网络请求的 CSP。隔离不等于保密：仓库与网站仍为公开；个人笔记只通过下载导出，不提交仓库。

保留原指南知识内容，新增用户提供的 PdCl₂/Co(NO₃)₂·6H₂O/SiO₂ 准备与加料记录、约2:1名义金属原子比及两种质量百分数基准。未加入未知后处理、反应条件或结果。公开版省略未核实的研究生履历。

仅更新模块时执行 `python3 sc-source/tools/sync_lab_module.py`。完整或 `--frontend-only` 构建也会复制该模块，不依赖人物数据重建。已有 Pages workflow 自动发布整个 `public/sc/`，不需要改动部署流程。
