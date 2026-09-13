# WinUI 3 使用 WebView2 + Native AOT 复盘：把应用本体做小

需要先说明一个边界：本文讨论的是 **Native AOT + Windows App SDK framework-dependent 部署**。Native AOT 应用本身按 .NET 官方定义采用 self-contained；只有 Windows App SDK Runtime 不放进应用发布目录，由安装器安装，升级时复用已经安装的 Runtime。


## 1. 一句话先说结论

当前项目采用下面的组合：

```text
PublishAot=true
    应用本体使用 Native AOT

Native AOT
    .NET 官方规定 Native AOT 使用 self-contained 部署

WindowsAppSDKSelfContained=false
    Windows App SDK Runtime 不放入应用目录

首次安装包
    应用文件 + Windows App SDK Runtime

升级包
    只更新应用文件；Runtime 版本不变时不重复传输
```

注意：这里有两个不同层次的 Runtime，不能混为一谈。

```text
Native AOT 的 self-contained
    AOT 必须把 .NET 代码编译成可直接运行的 native 程序

WindowsAppSDKSelfContained
    只控制 Windows App SDK Runtime 是否随应用目录部署
```

Microsoft 官方说明：Native AOT 使用 self-contained 部署；framework-dependent 的应用需要目标机预先安装对应 .NET Runtime。当前项目的 Native AOT 不依赖目标机 .NET Runtime，但仍依赖安装器提供 Windows App SDK Runtime。

## 3. 我踩过的关键点

### 3.1 Native AOT 不是万能压缩器

Native AOT 的核心是把 .NET IL 预编译成本机代码，主要收益是：

- 启动更快；
- 不依赖 JIT；
- 应用本体通常更小；
- 运行时行为更稳定。

它不会自动删除所有外部 native DLL。WebView2、Windows App SDK、C++ Host 等本机依赖仍然要单独处理。

### 3.2 裁剪只针对可分析的托管代码

```text
PublishTrimmed=true
```

主要裁剪 .NET 托管代码。它不能把 WebView2 或 Windows App SDK 的 native 依赖变没。

如果代码使用反射、COM、动态加载或序列化，需要在 Release 发布后测试核心路径。

### 3.3 体积最大的开关是 Windows App SDK 自包含

```text
WindowsAppSDKSelfContained=true
    应用目录包含 Windows App SDK Runtime
    部署更独立，但目录更大

WindowsAppSDKSelfContained=false
    应用目录不包含 Windows App SDK Runtime
    目标机需要由安装器提供 Runtime
```

本项目选择 `false`，不是为了让用户手工安装，而是为了把 Runtime 从应用升级包中分离出来：

```text
首次安装：安装 Runtime
后续升级：检查版本，版本满足就跳过
```

### 3.4 不要用完整聚合包带入不需要的组件

当前项目只需要 WinUI 3 和 WebView2，不需要 ML/AI 能力。因此不要引用：

```xml
<PackageReference Include="Microsoft.WindowsAppSDK" />
```

完整聚合包可能把下面这些文件带入依赖图：

```text
onnxruntime.dll
DirectML.dll
Microsoft.Windows.AI.MachineLearning.dll
```

正确做法是先控制 NuGet 依赖，再做 AOT。不要发布后手工删除 DLL。

## 4. 参数说明

### 4.1 `PublishAot`

```text
PublishAot=true
```

启用 Native AOT。它是本文的核心参数。

### 4.2 Native AOT 与 `SelfContained`

Microsoft 官方文档把 Native AOT 列为 self-contained 部署。当前项目按下面方式配置：

```powershell
dotnet publish -c Release -r win-x64 -p:PublishAot=true
```

这条命令生成可以直接运行的 Native AOT 程序，目标机不需要安装 .NET Runtime。Windows App SDK 使用单独的 framework-dependent 配置：

```xml
<WindowsAppSDKSelfContained>false</WindowsAppSDKSelfContained>
```

因此最终结果是：**.NET 运行时随 Native AOT 编译进应用；Windows App SDK Runtime 由安装器安装。**

### 4.3 `PublishTrimmed`

```text
PublishTrimmed=true
```

裁剪可静态分析的托管代码，通常可以进一步减小应用本体。开启后必须测试。


### 4.4 `WindowsAppSDKSelfContained`

```text
WindowsAppSDKSelfContained=false
```

不把 Windows App SDK Runtime 放到应用发布目录。首次安装器需要安装匹配版本的 Windows App Runtime，升级器检查已安装版本即可。

Microsoft 官方对 unpackaged / framework-dependent Windows App SDK 应用的要求是：应用负责部署 Windows App SDK Runtime，可以运行 Windows App SDK Installer，也可以由自己的 MSI/安装程序安装 MSIX Runtime 包。本项目采用前一种方式，并在首次安装时执行安装器。

### 4.5 `DebugType` 和 `DebugSymbols`

正式升级包可以关闭 PDB：

```text
DebugType=None
DebugSymbols=false
```

问题定位版本建议保留符号文件：

```text
DebugType=portable
DebugSymbols=true
```

PDB 不影响应用运行，但会明显增加发布目录大小。

### 4.6 `PublishSingleFile`

WinUI 3、WebView2 和 Windows App SDK 有多个本机文件，当前不把单文件作为目标：

```text
PublishSingleFile=false
```

先保证依赖清晰、启动稳定，再考虑进一步打包。

## 5. 当前项目的最终配置

的关键部分如下：

```xml
<PropertyGroup>
  <RuntimeIdentifiers>win-x64</RuntimeIdentifiers> <!-- 发布目标为 Windows x64 -->
  <WindowsPackageType>None</WindowsPackageType> <!-- 不生成 MSIX，使用 unpackaged 部署 -->
  <UseWinUI>true</UseWinUI> <!-- 启用 WinUI 3 -->
  <WindowsAppSDKSelfContained>false</WindowsAppSDKSelfContained> <!-- Windows App SDK Runtime 由安装器提供 -->
</PropertyGroup>

<ItemGroup>
    <PackageReference Include="Microsoft.WindowsAppSDK.WinUI" Version="2.3.0" /> <!-- WinUI 3 -->
    <PackageReference Include="Microsoft.WindowsAppSDK.Runtime" Version="2.3.1" /> <!-- framework-dependent 模式使用的 Runtime 依赖 -->
  <PackageReference Include="Microsoft.WindowsAppSDK.Foundation" Version="2.3.5" /> <!-- Runtime 基础组件 -->
  <PackageReference Include="Microsoft.WindowsAppSDK.InteractiveExperiences" Version="2.1.3" /> <!-- Runtime 交互组件 -->
  <PackageReference Include="Microsoft.Web.WebView2" Version="1.0.3719.77" /> <!-- WebView2 -->
</ItemGroup>
```

这里的版本必须保持匹配。不要只修改 `Microsoft.WindowsAppSDK.WinUI`，却忽略 Foundation、InteractiveExperiences 和 Runtime 的版本关系。

## 6. 完整发布步骤

下面的命令都从仓库根目录执行。

### 6.1 进入仓库目录

```powershell
Set-Location D:\Codes\Lenovo\workspace
```
 
### 6.3 发布 Native AOT 应用

```powershell
dotnet publish .\winui3\native\winui3.App\winui3.App.csproj `
  -c Release `
  -r win-x64 `
  -p:Platform=x64 `
  -p:PublishAot=true `
  -p:PublishTrimmed=true `
  -p:WindowsAppSDKSelfContained=false `
  -p:PublishSingleFile=false `
  -p:DebugType=None `
  -p:DebugSymbols=false `
  -o .\winui3\native\artifacts\AotFrameworkDependent\Release\x64
```

这个命令的含义是：

```text
PublishAot=true
    按 Native AOT 规则生成 self-contained native 应用

-p:WindowsAppSDKSelfContained=false
    不把 Windows App SDK Runtime 放入应用目录，由安装器提供

-r win-x64
    发布 Windows x64 的 native 应用
```

  
## 9. 发布验收

```powershell
Set-Location D:\Codes\winui3\workspace

$out = '.\winui3\native\artifacts\AotFrameworkDependent\Release\x64'

Get-ChildItem $out -File -Recurse |
  Sort-Object Length -Descending |
  Select-Object -First 20 FullName, Length

Test-Path "$out\winui3.App.exe"
Test-Path "$out\onnxruntime.dll"
Test-Path "$out\DirectML.dll"
Test-Path "$out\Microsoft.Windows.AI.MachineLearning.dll"
```

预期结果：

```text
winui3.App.exe                            True
NativeCapabilityHost.exe                  True
onnxruntime.dll                           False
DirectML.dll                              False
Microsoft.Windows.AI.MachineLearning.dll False
```

还要验证运行行为：

```text
[ ] 目标机不安装 .NET SDK 也能启动 AOT 应用
[ ] 首次安装器已安装 Windows App Runtime
[ ] WebView2 页面加载成功
```

## 10. 结语

WinUI 3 + WebView2 + Native AOT 的发布优化不是只打开一个开关，而是拆成三件事：

```text
Native AOT
    决定应用本体的编译方式和启动性能

PublishTrimmed
    尽可能裁剪托管代码

WindowsAppSDKSelfContained=false
    把稳定的 Windows App SDK Runtime 从应用升级包中分离
```

当前项目最终采用：

```text
应用本体：Native AOT + trimming
Windows App SDK：framework-dependent
首次安装：安装 Runtime
后续升级：复用 Runtime，只更新应用文件
```

这样既保留 Native AOT 的启动和体积优势，也避免每次升级都重复传输稳定不变的 Windows App SDK Runtime。

## 官方资料

- [.NET application publishing overview](https://learn.microsoft.com/en-us/dotnet/core/deploying/)
- [Windows App SDK deployment guide for framework-dependent unpackaged apps](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/deploy-unpackaged-apps)
