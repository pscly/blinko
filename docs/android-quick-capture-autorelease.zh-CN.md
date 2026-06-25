# Android 快速速记自动同步发布维护说明

## 适用范围

这份说明只覆盖 Android 快速速记相关的自动同步与发布链路，核心入口是 `.github/workflows/sync-upstream-android-release.yml`。

## 快速速记行为与限制

- Android QS Tile 点击后会通过 `blinko://shortcut/quick_capture` 打开 `MainActivity`，再把 `quick_capture` action 交给前端消费。
- 前端收到 action 后，会打开创建态编辑器，进入 `quick_capture` 上下文，并在移动端显示快捷工具区。
- 快捷工具区里的“时”会插入 `> YYYY-MM-DD HH:mm:ss`，后面保留空行。
- “续写”短按会尝试打开最近一条可编辑笔记，长按会在应用内弹出最近历史列表。
- Android 系统 QS Tile 本身没有可靠的应用自定义长按回调，所以“长按续写”只在应用内工具区支持，不在系统磁贴上支持。
- 如果当前已有未保存草稿，新的 quick-capture 或分享内容不会静默覆盖，必须由用户明确选择恢复草稿、使用新内容，或清空草稿。

## 必备 GitHub Secrets

### 发布必需

- `SYNC_PAT`
  - 用途：非 `dry_run` 时推送 `custom/android-quick-capture` 与 marker branch。
  - 要求：至少具备目标仓库 `contents:write`。
  - 缺失结果：workflow 会在任何 push、marker、Release、APK 发布前直接失败。

- `UPLOAD_KEYSTORE`
  - 用途：Android 签名。
  - 格式：Base64 编码后的 `.jks` 内容。
  - 缺失结果：workflow 会在 Android build 和 Release 上传前直接失败。

### Telegram 通知，可选但推荐

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_GROUP_ID_1`
- `TELEGRAM_GROUP_ID_2`

如果这三个值没有配全，workflow 不会伪造通知成功，而是明确回退到 GitHub Actions summary、workflow 链接和 GitHub Release 页面。

## 签名别名与密码约定

当前 workflow 没有单独读取 `KEYSTORE_PASSWORD` 或 `KEY_ALIAS` secrets，而是沿用仓库现有 Android 发布约定：

- `password=106111`
- `keyAlias=upload`

这代表你上传到 `UPLOAD_KEYSTORE` 的 keystore 必须和上面的别名、密码匹配。如果你要改 keystore 别名或密码，先同步更新下面两个 workflow，再触发发布：

- `.github/workflows/sync-upstream-android-release.yml`
- `.github/workflows/app-release.yml`

不要把 keystore 原文、PAT、Telegram token 或任何 secret 值写入仓库、issue、evidence log 或截图。

## 如何手动触发同步发布

1. 打开 GitHub 仓库的 Actions 页面。
2. 选择 `Sync Upstream Android Release`。
3. 点击 `Run workflow`。
4. 按需填写输入项：
   - `upstream_repo`，默认 `https://github.com/blinko-space/blinko`
   - `upstream_branch`，默认 `main`
   - `custom_branch`，默认 `custom/android-quick-capture`
   - `marker_prefix`，默认 `sync/android-quick-capture`
   - `dry_run`，只做本地合并验证时设为 `true`

### 推荐触发顺序

- 先跑一次 `dry_run=true`，确认 fetch、merge 和输入值都没问题。
- 需要真正同步并发布 APK 时，再跑一次 `dry_run=false`。

### 成功路径会做什么

当 `dry_run=false` 且所有 gate 都通过时，workflow 会依次：

1. 把上游 `main` 合并进 `custom/android-quick-capture`
2. 推送更新后的 custom branch
3. 推送唯一 marker branch
4. 构建并签名 Android APK
5. 生成 GitHub Release，并上传 `Blinko_android-quick-capture-<run-id>-<attempt>_universal.apk`
6. 向 Telegram 发送结果，或回退到 GitHub summary

## 冲突、失败与恢复

### 上游合并冲突

- 行为：workflow 会 `git merge --abort`，并直接失败。
- 不会发生的事：不会 force-push，不会自动选 `ours` 或 `theirs`，不会发布 marker、Release 或 APK。
- 恢复方式：
  1. 在本地拉取 `custom/android-quick-capture` 和上游 `main`
  2. 手动解决冲突并提交到 custom branch
  3. 先重新跑一次 `dry_run=true`
  4. 确认无误后再跑 `dry_run=false`

### 缺少 `SYNC_PAT`

- 行为：在任何 push 前失败。
- 恢复方式：补齐 secret，再重新触发 workflow。

### 缺少 `UPLOAD_KEYSTORE`

- 行为：在 Android build 与 Release 上传前失败。
- 恢复方式：补齐 secret，并确认 keystore 的 alias/password 与当前 workflow 约定一致，再重跑 workflow。

### Android build 失败，或 APK 没生成

- 行为：workflow 会停止，且不会创建假 Release。
- 恢复方式：查看构建日志，修复依赖、SDK、Gradle、Rust、Tauri 或签名问题，再重跑 workflow。

### Telegram 发送失败

- 行为：如果 Release 已经生成，发布结果不会回滚，但 workflow 会把通知步骤标成失败，提醒维护者处理通知问题。
- 恢复方式：修复 Telegram secrets 后重新运行 `.github/workflows/test-telegram-notification.yml`，确认机器人与群组配置正确。

## 什么会自动发布，什么不会自动发布

### 会自动发布

- 更新后的 `custom/android-quick-capture`
- 唯一 marker branch
- 已签名的 Android APK GitHub Release 资产
- Telegram 结果通知，前提是 Telegram secrets 配置完整

### 不会自动发布

- `dry_run=true` 时的任何 branch、Release、APK
- 冲突状态下的半成品 merge
- 缺 secret、build 失败、缺 APK 时的假 Release
- Desktop 产物
- Play Store / AAB 分发
- 系统 QS Tile 长按续写能力

## 现有证据与 proof

- Task 4 proof：`.omo/proofs/task-4-android-quick-capture-actions.mjs`
- Task 4 evidence：`.omo/evidence/task-4-android-quick-capture-autorelease.log`
- Task 5 proof：`.omo/proofs/task-5-android-quick-capture-drafts.mjs`
- Task 5 evidence：`.omo/evidence/task-5-android-quick-capture-autorelease.log`
- Task 7 proof：`.omo/proofs/task-7-sync-release-workflow.py`
- Task 7 evidence：`.omo/evidence/task-7-android-quick-capture-autorelease.log`
- Task 8 proof：`.omo/proofs/task-8-docs-and-verification.mjs`
- Task 8 validation log：`.omo/evidence/task-8-android-quick-capture-autorelease.log`

维护时先看上面的 proof 和 evidence，再决定是修 workflow、修文档，还是只补 secret 配置。
