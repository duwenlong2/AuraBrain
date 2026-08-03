# 04 · TypeScript 红线不一定是代码错：一次 Mastra Workflow 调试记录

学习 Mastra Workflow 时，我遇到过一个很影响阅读的问题：代码可以正常启动，Studio 也能打开，但 VS Code 的 Problems 面板出现了几处红线：

```text
找不到模块“@mastra/core/mastra”或其相应的类型声明
找不到模块“./workflows/climate-workflow”或其相应的类型声明
找不到“node”的类型定义文件
```

这些错误看起来像是代码写错了，但实际情况是 TypeScript Server 没有及时解析到项目依赖和源码文件。

## 一、先区分三件事

开发 Mastra 项目时，至少有三个不同的检查者：

```text
VS Code TypeScript Server   编辑器实时提示红线
TypeScript compiler (tsc)  检查 TypeScript 类型
Mastra CLI                 打包并启动 Mastra 应用
```

它们关注的事情不完全一样。

### 1. VS Code TypeScript Server

它负责：

- 在编辑器中显示类型错误
- 提供自动补全
- 跳转到定义
- 显示模块是否能够解析

它使用的是编辑器自己的后台服务，有时会保留旧的解析缓存。

### 2. `tsc`

项目中运行：

```bash
npx tsc --noEmit
```

含义是：

```text
使用项目 tsconfig.json 检查 TypeScript
只检查，不生成 JavaScript 文件
```

如果这个命令通过，说明当前项目的 TypeScript 类型检查是正常的。

### 3. Mastra CLI

运行：

```bash
npm run dev
npm run build
```

Mastra CLI 会分析依赖并打包应用。它主要关心的是：

```text
代码能不能被打包
应用能不能启动
Studio 能不能运行
```

因此，偶尔会出现：

```text
Mastra 可以启动
但 VS Code 暂时显示红线
```

## 二、这次问题是怎么发生的

当时的 Workflow 文件经历了修改、删除、重新创建和热更新。与此同时，项目依赖也刚刚安装完成。

这时 VS Code 的 TypeScript Server 可能仍然保留着旧状态：

```text
旧状态：文件或依赖不存在
当前状态：文件和依赖已经存在
```

所以编辑器继续显示：

```text
找不到 @mastra/core/mastra
找不到 climate-workflow
找不到 node 类型定义
```

但实际文件已经存在，依赖也已经安装：

```text
node_modules/@mastra/core
node_modules/@types/node
src/mastra/index.ts
src/mastra/workflows/climate-workflow.ts
```

## 三、正确的排查顺序

### 第一步：先运行 TypeScript 检查

进入具体示例目录：

```bash
cd examples/03-workflow
npx tsc --noEmit
```

如果没有任何输出，并且退出码是 `0`，说明 TypeScript 检查通过。

### 第二步：再运行 Mastra 构建

```bash
npm run build
```

如果看到：

```text
Build successful
```

说明 Mastra 应用可以正常打包。

### 第三步：检查依赖是否存在

```bash
test -f node_modules/@mastra/core/package.json && echo "@mastra/core 存在"
test -d node_modules/@types/node && echo "@types/node 存在"
```

如果依赖不存在，再执行：

```bash
npm install
```

## 四、引入第三方包的正确方式

这次给 Workflow 添加 Storage 和 Observability 时，代码中需要引入：

```ts
import { LibSQLStore } from '@mastra/libsql';
import { Observability } from '@mastra/observability';
```

但是，单独添加 `import` 并不会安装这些包。`import` 只是告诉代码：

```text
我要使用这个包
```

项目还需要通过包管理器安装依赖：

```bash
npm install @mastra/libsql @mastra/observability
```

这个命令会自动完成三件事：

```text
1. 下载包到 node_modules
2. 把依赖写入 package.json
3. 更新 package-lock.json
```

因此，完整流程是：

```text
npm install 包名
   ↓
package.json 记录依赖
   ↓
node_modules 安装实际代码
   ↓
TypeScript 才能解析 import
```

通常不需要手动编辑 `package.json`。手动编辑虽然可以，但容易忘记安装依赖，或者忘记更新锁文件。

如果使用的是开发工具，例如 TypeScript，可以使用 `-D`：

```bash
npm install -D typescript
```

业务代码运行时需要的包放在 `dependencies`，只在开发阶段使用的工具放在 `devDependencies`。

### 热更新时的临时报错

执行 `npm run dev` 时，如果正在修改 `package.json`、入口文件和依赖，Mastra Dev 可能会连续重启。
这段时间偶尔会看到：

```text
No storage configured
ReferenceError: Observability is not defined
Cannot find package '@mastra/observability'
```

如果后面重新启动成功，并看到：

```text
MastraStorageExporter shutdown complete
[Observability] Shutdown completed
```

说明 Storage 和 Observability 已经成功加载。此时应以最后一次启动结果为准，而不是只看热更新过程中的临时错误。

## 五、解决 VS Code 红线

如果 `npx tsc --noEmit` 已经通过，但 VS Code 仍然有红线，执行下面的操作：

```text
Ctrl + Shift + P
```

打开命令面板，然后输入：

```text
TypeScript: Restart TS Server
```

选择它并回车。

这会重启 VS Code 后台的 TypeScript 服务，让它重新读取：

```text
当前项目的 tsconfig.json
node_modules 中的依赖
src 目录中的源码
```

通常几秒后红线就会消失。

## 六、什么时候不能只重启 TS Server

如果重启后仍然有红线，要继续看 `npx tsc --noEmit` 的结果。

### 情况一：`tsc` 通过，VS Code 还有红线

大概率是编辑器缓存或项目目录识别问题：

```text
优先执行 TypeScript: Restart TS Server
```

也可以确认当前打开的文件属于正确的项目目录。

### 情况二：`tsc` 也失败

这就是真实的 TypeScript 错误，需要修代码或配置。例如：

```text
两个 Workflow step 的 inputSchema 不兼容
找不到实际安装的依赖
tsconfig.json 配置错误
```

这类错误不能只靠重启服务解决。

## 七、这次 Workflow 中遇到的真实类型错误

除了编辑器缓存问题，这个示例还遇到过一个真实错误。

三个分支最初分别声明了：

```ts
level: z.literal('hot')
level: z.literal('cold')
level: z.literal('mild')
```

但是 Mastra 的 `.branch()` 要求所有分支的输入结构一致。于是 TypeScript 报错。

修复后，三个分支统一声明为：

```ts
level: z.enum(['hot', 'cold', 'mild'])
```

然后仍然由条件函数决定执行哪一个：

```ts
.branch([
  [async ({ inputData }) => inputData.level === 'hot', coolDownStep],
  [async ({ inputData }) => inputData.level === 'cold', heatUpStep],
  [async ({ inputData }) => inputData.level === 'mild', keepComfortableStep],
])
```

这里要区分：

```text
schema 负责保证输入结构兼容
condition 负责决定实际走哪条路径
```

## 八、最后形成一个判断口诀

看到 VS Code 红线时，不要马上修改业务代码，先问三个问题：

```text
1. npx tsc --noEmit 通过了吗？
2. npm run build 通过了吗？
3. node_modules 和源码文件真的存在吗？
```

可以按下面的顺序处理：

```text
红线出现
   ↓
运行 npx tsc --noEmit
   ↓
通过？ ── 是 ──> Ctrl + Shift + P
                    TypeScript: Restart TS Server
   │
   否
   ↓
根据 tsc 的真实错误修代码或配置
```

## 总结

这次问题让我认识到：

```text
VS Code 红线       = 编辑器当前看到的问题
TypeScript 错误    = 编译器确认的问题
Mastra 启动成功    = 应用可以被打包和运行
```

三者经常一致，但不保证永远一致。

对现在的学习阶段，最实用的判断方式是：

```bash
npx tsc --noEmit
npm run build
```

如果两者都通过，而 VS Code 还有红线，优先执行：

```text
Ctrl + Shift + P
TypeScript: Restart TS Server
```

这不是“掩盖错误”，而是让编辑器重新加载当前真实的项目状态。

---

_作者：杜文龙 · 2026-08-03_
_标签：[typescript][vscode][debugging][mastra][workflow]_
