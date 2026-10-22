# SC 学者与方向地图

展示地址：https://162383.xyz/sc/network/ 。主站入口：https://162383.xyz/sc/ 。

首批30位学者、127条方向、9个主类、38个主题。原有四位的论文与阅读档案继续保留，新增26位目前是身份、研究方向与来源初筛，不代表已完成论文全集或全文精读。

`public/sc/network/index.html` 是可直接部署的独立页面。`downloads/` 提供Excel、方向CSV与公开JSON；页面和JSON不包含原网页/PDF、私人笔记、API密钥或本机路径。

本目录保留页面模板和交互源代码。人物主数据及来源原件继续在本地SC知识库维护；先运行 `scholar-network/tools/build_library.py`，再运行 `sc-site/tools/build_site.py --frontend-only` 更新页面与新目录，同时保留原论文快照。构建器会把本地的公开网络目录复制到 `sc-site/dist/sc/network/`。发布时只更新经过检查的 `public/sc/` 文件和对应源文件。

本次保留既有论文快照；当前本地CSV的日期格式已与此前发布时不同。`verify_site.py --published-snapshot` 单独报告这种来源快照差异，同时仍核验公开下载哈希、论文覆盖与接口。真正更新论文数据时须重新核验并执行完整构建，不能用展示更新顺便替换旧快照。

现有GitHub Pages工作流递归复制 `public/sc` 到 `_site/sc`，因此新子目录沿用同一发布过程。网站根目录及其他项目路由不需要修改。

验证包括数据与来源引用、下载文件、主站回归、方向页面渲染逻辑、导师关系方向和公开字段检查。未执行真实浏览器或手机设备视觉验收。
