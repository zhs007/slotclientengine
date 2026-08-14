# Crave Popup v6 接入说明

任务 210 不修改 Crave 项目代码或 `assets/`。RenderCore 与 Scene Layout 的 award facade、金额输入和任务 209 的 string handle API 均保持兼容，Crave 运行时代码原则上不需要调整。

最终资源负责人需要完成以下交付动作：

1. 用最新版 Popup Editor 打开现有获奖庆祝 Popup ZIP。导入会先严格校验源版本，再升级为 canonical v6。
2. 检查五档配置：`base`、`standard` 只保留其自身画面；`bigwin`、`superwin`、`megawin` 的 VNI 只存在于对应档。需要跨档复用的同一逻辑图层应在 Editor 中使用相同 exact id；每档金额层固定为 `win-amount`。
3. 从 Popup Editor 重新导出 v6 ZIP，再通过既有 Game Layout dependency 替换流程更新 Crave 的 Popup 包。不要手改 manifest、assets map 或 production ZIP。
4. 在 Crave 浏览器场景验收 threshold 进入、连续档位互斥、点击即时进入 VNI end、end drain 后隐藏，以及下一轮复用。

如果现有美术希望同一 VNI runtime 跨 `bigwin/superwin/megawin` 复用，三档配置必须使用相同 layer id 和相同 VNI resource key；transform、alpha、order、attachment 与 playback 可以按档不同。资源 key 不同会使用 Popup 内已准备的独立变体，这是明确配置而非错误。
