# 发布手册(Week 3)

> 本地准备已就绪。下面三步是**对外发布**,需要你的账号 —— 自己执行,别让任何工具替你跑。

## 0. 先保住匿名(最重要)

匿名品牌策略下,用**独立的、非实名的** GitHub 和 npm 账号:

- `npm publish` 会**公开发布者的 npm 用户名**。
- GitHub 提交带 commit 身份(本仓库已设仓库级中性身份 `cc-checkup`,不会泄露你的实名邮箱;但**远程账号本身**别用实名)。

## 1. 替换占位符

把以下三处的 `<you>` / `<你的仓库>` 换成真实 handle,然后重新生成卡片:

- `package.json` → `repository` / `homepage` / `bugs`
- 卡片 footer(`src/render-svg.ts` 里的 `github.com/<you>/cc-checkup`)
- `docs/launch-post-zh.md` 末尾的 `<你的仓库>`

```bash
npx tsx src/index.ts --plan pro --cny --png   # 重出一张带真实仓库名的卡片
```

## 2. 推 GitHub

```bash
# 在 GitHub 上建一个空仓库 cc-checkup(用品牌账号),然后:
git branch -M main
git remote add origin https://github.com/<you>/cc-checkup.git
git push -u origin main
```

## 3. 发 npm

```bash
npm login                 # 用品牌账号
npm publish --dry-run     # 先干跑确认内容
npm publish               # prepublishOnly 会自动 build
```

发完用 `npx cc-checkup@latest` 验证能跑。

## 4. 引爆

用 `docs/launch-post-zh.md`,配 `--png` 生成的卡片,发掘金 / 公众号 / 即刻。
**熔断线**:开源后若零自然增长 → 是渠道或痛点问题,换包装/换渠道,别埋头加功能。
