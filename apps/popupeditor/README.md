# popupeditor

纯前端获奖庆祝弹窗编辑器。运行：`pnpm --filter popupeditor dev`。

工作流为：在“资源”tab 上传资源/文件夹 → import review → 确认 logical resource 与建议绑定 → 在“档位”tab 调整或删除图层 → Build production preview → 在“项目”tab 导出 `<id>-popup.zip`。standalone ImgNumber 自动贯穿固定五档；`vni-win-amount-tiers` descriptor 的三份 VNI 只进入同名 bigwin/superwin/megawin 档位；其他图片、VNI 和 Spine 仅建立资源，由用户显式添加图层。同类替换保留既有图层绑定，不重复添加图层。

项目 tab 提供两个金额合同 preset：默认“纯数字整数”直接显示服务器整数，只要求 `0–9` glyph（`rawScale=1`、`fractionDigits=0`，例如 raw `100 → 100`）；“纯数字两位小数”要求 `0–9` 和 `.`（`rawScale=100`、`fractionDigits=2`，例如 raw `100 → 1.00`）。两者都关闭分组且 prefix/suffix 为空。用户仍可修改底层字段形成“自定义”合同；一旦启用小数、分组或货币字符，对应字符必须继续由 ImgNumber 严格提供，运行时不会静默丢字。

支持 PNG、完整 VNI 文件组、official Spine 4.3 文件组和 standalone image-string ZIP/目录。单个文件夹允许同时包含多组上述资源；importer 按每个 project/manifest 的精确依赖闭包分组，允许共享依赖，并识别 `vni-win-amount-tiers` descriptor（例如 `game003-s1/win-amount`）。闭包外的合法图片作为独立 image resource；`.DS_Store`、AppleDouble/`__MACOSX`、`Thumbs.db` 和 `desktop.ini` 等明确的系统元数据会被忽略，其他真正无法识别、缺失、歧义或不完整的文件仍使整个 review 原子失败。普通文件与 ZIP 都受 entry、单文件及累计 bytes 限额保护；owned payload 使用完整 SHA-256 content path，source filename 只存在 editor provenance。

新项目提供 15/25/50 初始阈值，并在档位页同时展示可编辑阈值与 `1×` 标准档边界。descriptor 只提供 VNI 到档位的对应关系及 `durationSeconds/loopStartTime/loopEndTime`，不会静默覆盖项目阈值。五档中任一档未恰好配置一个动态 ImgNumber binding 时禁止导出。preview resolution、zoom、guides、bet/win 是 session state。

ImgNumber 是独立于 tier start/loop/end 的连续金额覆盖层：每档必须恰好声明一个金额 binding，但 runtime 全程只创建一个 renderer。相邻档位使用相同 resource 时只更新文本与 transform；resource 改变时调用同一 renderer 的 `setResource()`，复用容器和 glyph sprite pool，不并存两份金额实例。档位页选择 ImgNumber 执行的是当前档金额 binding 切换，不会新增第二个金额图层。

每档图层按 `order` 升序叠放：数值越小越靠下。单一 ImgNumber runtime 在切档时会被同步移动到当前档容器内对应的 child index，因此只修改 mega 的 order 只影响 mega，不会改变前序档位。

production 合同见 [popup-manifest.md](../../docs/popup-manifest.md)。
