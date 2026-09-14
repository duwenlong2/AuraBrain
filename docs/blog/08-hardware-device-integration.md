# 08 · 硬件设备集成：ESP32 如何接入 AuraBrain

> 本文讨论 AuraBrain Runtime 与 ESP32 硬件设备的集成架构：设备如何被发现、如何声明能力、如何被控制、如何上报异常、如何保证安全。
>
> 这是 AuraBrain 系列中"硬件端"的核心设计文档。不涉及具体代码实现，聚焦架构和协议设计。

## 关于 AuraBrain 开源项目

这是我的开源项目 [AuraBrain](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 本地 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（WiFi/蓝牙 控制）       → ⚙️
    两者通过 HTTP + mDNS 通信，从自然语言到真实硬件
```

本文讨论的核心问题：

- 本地 PC 上部署的 AuraBrain 如何"发现"局域网里的 ESP32 设备？
- ESP32 如何告诉 AuraBrain"我能干什么"？
- AuraBrain 的 AI Agent 如何控制 ESP32（机械臂、开关、传感器）？
- 设备异常、通信中断、PC 崩溃时，如何保证物理安全？
- 用户如何"无感"地让设备连上 AuraBrain？

## 一、整体架构

```
┌─────────────────────────────────────────────────────────┐
│  本地 PC (AuraBrain Runtime, 端口 49000)                │
│                                                         │
│  ┌───────────┐    ┌──────────────┐    ┌─────────────┐  │
│  │ Mastra    │    │ Device       │    │ HTTP Server │  │
│  │ Agents    │◄──►│ Gateway      │◄──►│ (49000)     │  │
│  │ (LLM推理) │    │ (设备管理)    │    │             │  │
│  └───────────┘    └──────────────┘    └──────┬──────┘  │
│       │              │                       │          │
│       │         ┌────┴─────┐                 │          │
│       │         │ Device   │                 │          │
│       │         │ Registry │                 │          │
│       │         │ (能力注册)│                 │          │
│       │         └──────────┘                 │          │
│       │                                      │          │
│  ┌────┴──────────────────────────────────────┤          │
│  │ Device Tools (Mastra tools)               │          │
│  │ - robot_arm_move(x,y,z)                   │          │
│  │ - device_switch_on/off(id)                │          │
│  │ - get_sensor_data(id)                     │          │
│  │ - emergency_stop()                        │          │
│  └───────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
                         │
                    WiFi (局域网)
                    mDNS 发现
                         │
┌────────────────────────┴────────────────────────────────┐
│  ESP32 设备 (瘦客户端, 无界面)                           │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ HTTP     │  │ 传感器   │  │ 执行器                │  │
│  │ Client   │  │ (温度/   │  │ (舵机/电机/继电器/    │  │
│  │ (tick)   │  │  距离/   │  │  LED/显示屏)          │  │
│  └──────────┘  │  位置)   │  │                       │  │
│                └──────────┘  └───────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 安全层 (固件本地保证, 不依赖网络)                 │   │
│  │ - 物理急停按钮                                    │   │
│  │ - 运动硬限制                                      │   │
│  │ - tick 超时自停                                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**核心原则**：

- **ESP32 是"瘦客户端"**：不做 AI 决策，只负责"感知"（传感器）和"执行"（电机/开关）
- **AuraBrain 是"大脑"**：接收传感器数据 → LLM 推理 → 下发控制命令
- **安全不依赖网络**：ESP32 固件层有独立的安全逻辑，PC 死了也安全

## 二、能力契约（Capability Contract）

设备连接时声明"我能干什么"，AuraBrain 记录下来，之后**只能按声明的能力控制**。

```
设备说："我能做 A、B、C，限制是 X、Y、Z"
AuraBrain 说："好，我记住了。以后我只会按 A/B/C 的方式控制你"
```

这个契约是**双向约束**的：

- 约束 AuraBrain：不能发设备没声明过的命令（防 LLM 幻觉——不会"发明"一个设备不支持的动作）
- 约束设备：只能执行契约内的命令，收到未知命令直接拒绝

**关键点**：AuraBrain 不需要知道"这是一个 ESP32"或"这是一个机械臂"。它只知道"有一个设备 ID 叫 `robot-01`，它能做 `arm_move(x,y,z)`，范围是 0-300mm"。换硬件、加新设备类型，AuraBrain 核心不用改。

### 能力 vs 状态（两个不同维度）

| | 能力（Capability） | 状态（State） |
|---|---|---|
| 是什么 | 设备**能**做什么 | 设备**现在**是什么情况 |
| 什么时候报 | 连接时声明一次（+ 固件升级时重新声明） | 持续上报（周期 + 事件触发） |
| 例子 | "我有 3 轴机械臂，范围 0-300mm" | "当前位置 x=120, y=45, z=80" |
| 变化频率 | 极低（几乎不变） | 高（1-50Hz） |
| AuraBrain 怎么用 | 生成 tools（给 LLM 看的"我能调什么函数"） | 给 LLM 做决策的上下文（"现在机械臂在哪"） |

**能力是"菜单"，状态是"当前桌面上的菜"。** LLM 看菜单决定点什么，看桌面状态决定怎么点。

### 能力声明示例

ESP32 注册时声明自己的能力：

```json
{
  "deviceId": "esp-a4cf1234",
  "name": "机械臂-01",
  "firmware": "1.2.0",
  "capabilities": {
    "sensors": [
      {"id": "ultrasonic", "type": "distance", "unit": "cm", "range": [0, 400]},
      {"id": "temp", "type": "temperature", "unit": "°C"},
      {"id": "arm_pos", "type": "position", "axes": ["x","y","z"]}
    ],
    "actuators": [
      {"id": "arm", "type": "robot_arm", "axes": ["x","y","z"], "limits": {"x":[0,300],"y":[0,200],"z":[0,150]}},
      {"id": "gripper", "type": "servo", "range": [0, 180]},
      {"id": "relay-1", "type": "relay"}
    ]
  }
}
```

AuraBrain 收到后：
1. 记录到 Device Registry
2. 动态生成对应的 Mastra tools（`arm_move`、`gripper_set`、`relay_toggle`）
3. LLM 只能调这些 tools，不会"发明"不存在的动作

### 能力是动态的

- 传感器坏了 → 设备发 `capability-update` 说"temp 不可用了" → AuraBrain 移除对应 tool
- 固件升级 → 重新声明能力 → AuraBrain 更新
- 夹爪没装 → 能力声明里没有 gripper → LLM 不会调 gripper

## 三、通信协议：HTTP Tick

### 为什么选 HTTP 而不是 WebSocket / MQTT

| | WebSocket | MQTT | HTTP Tick |
|---|---|---|---|
| ESP32 固件复杂度 | 要管理连接/重连/心跳 | 要管理 broker 连接 | **每次请求独立，无状态** |
| WiFi 断了 | 要检测断线、重连 | 要检测断线、重连 | **下次请求失败 → 直接安全模式** |
| PC 关了 | 要检测对端关闭 | 要检测 broker 断开 | **请求失败 → 安全模式** |
| 调试 | 要专用工具 | 要专用工具 | **curl 就能测** |
| 额外组件 | 无 | 需要 MQTT broker | **无** |

**核心洞察**：ESP32 是"瘦客户端"，它不需要"保持连接"。它只需要**不停地问**："我现在该干嘛？"

### Tick 模式

ESP32 的主循环极其简单：

```
循环 {
  读传感器
  把当前状态 POST 给 AuraBrain（/device/{id}/tick）
  收到响应 → 执行里面的命令
  如果请求失败（PC 不在 / WiFi 断了）→ 安全模式（停电机）
  等下一个 tick 周期
}
```

**一次 HTTP 请求 = 一次心跳 + 一次状态上报 + 一次命令下发**，三合一。

- 机械臂：10-50Hz（100-20ms 一次）
- 开关/继电器：1Hz
- 纯传感器节点：1-5Hz

局域网 HTTP 往返 ~5-20ms，10Hz 控制完全够用。

### 接口设计

#### ESP32 → AuraBrain（设备侧调用）

**1. 注册（连接时调一次）**

`POST /device/register`

```
请求：
  deviceId: "esp-a4cf1234"（MAC 派生，或留空让 AuraBrain 分配）
  name: "机械臂-01"
  firmware: "1.2.0"
  capabilities: { sensors: [...], actuators: [...] }

响应：
  ok: true
  deviceId: "esp-a4cf1234"
  token: "xxx"（后续请求带这个，防冒充）
  tickInterval: 100（建议的 tick 周期 ms）
```

**2. Tick（主循环，高频调用）**

`POST /device/{id}/tick`

```
请求：
  token: "xxx"
  state:
    arm: {x: 120, y: 45, z: 80}
    gripper: 45
    temp: 32.5
    battery: 87
    uptime: 3600

响应：
  commands:
    - {action: "arm_move", x: 150, y: 60, z: 80, speed: 50}
    - {action: "gripper_set", angle: 90}
  estop: false
  nextTickIn: 100（下次 tick 间隔，AuraBrain 可动态调）
```

如果 AuraBrain 没新命令：`commands: []`，ESP32 保持当前状态。

**3. 事件上报（异步，非周期）**

`POST /device/{id}/event`

```
请求：
  token: "xxx"
  type: "error" | "button" | "limit" | "info"
  severity: "warning" | "critical" | "fatal"
  data: { ... }

例子：
  {type: "error", severity: "critical", data: {code: "MOTOR_STALL", axis: "x"}}
  {type: "button", severity: "info", data: {button: "estop", pressed: true}}
  {type: "limit", severity: "warning", data: {axis: "z", limit: "max"}}

响应：
  ok: true
  action: "none" | "pause" | "estop"（AuraBrain 的即时响应）
```

**4. 能力更新（固件升级 / 硬件变化时）**

`POST /device/{id}/capability-update`

```
请求：
  token: "xxx"
  capabilities: { ... }（新的能力声明）
  reason: "firmware_update" | "sensor_removed" | "hardware_change"

响应：
  ok: true
```

#### AuraBrain 侧（给 Agent / UI 用）

**5. 设备列表**

`GET /admin/devices`

```
响应：
  devices: [
    {
      id: "esp-a4cf1234",
      name: "机械臂-01",
      status: "running" | "idle" | "lost" | "offline" | "estopped",
      capabilities: { ... },
      currentState: { ... },
      lastTick: "2026-09-10T12:00:00Z",
      health: { errorCount: 0, lastError: null }
    }
  ]
```

**6. 下发一次性命令（Agent/UI 用）**

`POST /admin/devices/{id}/command`

```
请求：
  action: "arm_move"
  params: {x: 200, y: 100, z: 50}

响应：
  ok: true
  delivered: "queued"（会在 ESP32 下次 tick 时送达）
```

**7. 紧急停止**

`POST /admin/devices/{id}/estop`

```
响应：
  ok: true
  （AuraBrain 设置 estop 标志，ESP32 下次 tick 收到 estop:true → 立即停）
```

## 四、设备发现：mDNS（无感连接）

### 问题

AuraBrain 部署的 PC IP 不固定。ESP32 怎么"找到" AuraBrain？用户不应该需要"打开浏览器输入 IP"。

### 答案：mDNS（局域网服务发现）

这就是 AirPrint、Chromecast、HomeKit 用的那套机制：

```
AuraBrain 启动时：
  "嘿，局域网里所有人听好，我是 _aurabrain._tcp.local，在 192.168.1.42:49000"

ESP32 启动时：
  "局域网里有没有 _aurabrain._tcp.local？"
  → 找到了！192.168.1.42:49000
  → 直接连
```

**IP 变了？无所谓。** mDNS 是广播的，AuraBrain 重启后 IP 变了，它重新广播，ESP32 下次查询就拿到新 IP。用户完全无感。

ESP32 的 Arduino 框架**内置 mDNS 支持**（`MDNS.h`），不需要额外库。

### 完整的"无感连接"流程

```
┌─────────────────────────────────────────────────────────────┐
│  一次性设置（只有一步）                                       │
│                                                             │
│  ESP32 第一次上电 → 不知道 WiFi 密码                          │
│  → ESP32 自己开一个热点 "AuraBrain-Setup-XXXX"               │
│  → 用户手机连这个热点 → 自动弹出页面 → 输入家里 WiFi 密码       │
│  → ESP32 存到 flash → 重启 → 连上家里 WiFi                   │
│                                                             │
│  （之后永远不需要再碰这一步）                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  日常使用（完全无感）                                         │
│                                                             │
│  1. 用户打开 PC，启动 AuraBrain                               │
│     → AuraBrain 广播 mDNS: "_aurabrain._tcp.local"          │
│                                                             │
│  2. ESP32 已经通电（一直插着电）                               │
│     → 检测到 AuraBrain 上线（mDNS 查询命中）                   │
│     → POST /device/register                                 │
│     → AuraBrain UI 出现 "robot-01 已连接"                    │
│                                                             │
│  3. 用户说"把机械臂移到左边"                                   │
│     → LLM 决策 → 下次 tick 送达 ESP32 → 执行                 │
│                                                             │
│  4. 用户关 PC / AuraBrain 崩溃                                │
│     → ESP32 连续 3 次 tick 失败 → 自动安全停止                │
│                                                             │
│  5. 用户重新开 PC，启动 AuraBrain                             │
│     → mDNS 重新广播 → ESP32 自动重连 → 恢复控制              │
└─────────────────────────────────────────────────────────────┘
```

**用户视角**：开 PC → 启动 AuraBrain → 设备就在那了。关 PC → 设备安全停了。再开 → 又回来了。全程不需要输入任何 IP、端口、地址。

### ESP32 侧的连接逻辑

```
ESP32 主循环：

  如果 还没连上 AuraBrain：
    做 mDNS 查询 "_aurabrain._tcp.local"
    如果 找到了：
      记住 IP + 端口
      发 register 请求
      如果 成功：标记"已连接"
    如果 没找到：
      等 2 秒，再查一次
      （AuraBrain 可能还没启动，耐心等）

  如果 已连接：
    读传感器
    发 tick 请求（带状态）
    如果 成功：执行响应里的命令
    如果 失败：
      失败计数 +1
      如果 连续失败 >= 3 次：
        进入安全模式（停电机）
        标记"未连接"
        回到上面的 mDNS 查询循环
```

**关键点**：ESP32 不需要"保持连接"。它只是不停地问。问不到就停。问到了就干活。极其简单。

### 设备身份

ESP32 有 MAC 地址，从中派生稳定的设备 ID：

```
MAC: A4:CF:12:34:56:78
→ deviceId: "esp-a4cf1234"（取后 6 位）
```

- 不需要用户手动命名
- 同一块板子重启后 ID 不变
- AuraBrain 认得"这是上次那个 robot-01"
- 用户可以在 AuraBrain UI 里改显示名，但底层 ID 不变

### 认证（轻量）

- **首次注册**：ESP32 发 register（不带 token）→ AuraBrain 生成 token 返回 → ESP32 存 flash
- **后续 tick**：带 token → AuraBrain 验证
- **AuraBrain 重装/换机**：token 失效 → ESP32 收到 401 → 重新 register（自动，用户无感）

防的是"局域网里其他设备冒充"，不是防黑客。够用。

### 多设备

mDNS 支持多个实例：
- AuraBrain 广播一个 `_aurabrain._tcp.local`
- 所有 ESP32 都查这个 → 都找到 → 都来 register
- 每个 ESP32 用自己的 MAC 派生 ID → AuraBrain 区分它们
- UI 里显示：robot-01（机械臂）、switch-01（灯光）、sensor-01（温度）

## 五、安全模型

### 核心原则：安全不依赖网络

ESP32 固件层必须有**独立的安全逻辑**，不能"等 PC 说停才停"。

### ESP32 侧（固件保证）

| 机制 | 说明 |
|------|------|
| 物理急停按钮 | 本地立即停所有电机，不等 PC |
| 运动硬限制 | 固件层拦截（超出范围直接拒绝执行） |
| Tick 超时自停 | 连续 3 次 tick 请求失败 → 自动安全模式 |
| 未知命令拒绝 | 收到 capabilities 里没声明过的 action → 拒绝 + 上报 |
| 连接断开自停 | WiFi 断 / PC 关 → 请求失败 → 安全模式 |

### AuraBrain 侧

| 场景 | 响应 |
|------|------|
| 设备失联（连续 3 个 tick 没来） | 标记 `lost`，停止下发命令 |
| 设备报 critical 异常 | 自动暂停该设备控制 |
| 设备报 fatal 异常 | 标记 `estopped`，需要人工复位 |
| LLM 要调不存在的 action | tools 层直接拒绝（能力契约约束） |

### 异常分级

| 级别 | 例子 | ESP32 行为 | AuraBrain 行为 |
|------|------|-----------|---------------|
| warning | 温度偏高、接近限位 | 继续运行，上报 | 记录日志，通知 LLM |
| critical | 电机堵转、电池低 | 减速/暂停，上报 | 暂停控制，通知 LLM "别动它" |
| fatal | 急停触发、硬件故障 | 立即停止，上报 | 标记 estopped，需人工复位 |

**关键原则：安全相关的自动处理，不经过 LLM。** LLM 可能"理解错"。急停就是急停，不需要 AI 决策。

## 六、设备生命周期

```
[离线]
  │
  │ WiFi 连接 + mDNS 发现 + register
  ▼
[注册中] ← 设备声明能力
  │         AuraBrain 记录能力、生成 tools
  ▼
[就绪] ← 设备上报初始状态
  │
  │ 正常控制（tick 循环）
  ▼
[运行中] ← 持续 state 上报 + 接收 command
  │
  ├── 设备自报 warning ──→ 继续运行（记录）
  ├── 设备自报 critical ──→ [暂停] ──恢复──→ [运行中]
  ├── 设备自报 fatal ──→ [安全停止] ──人工复位──→ [就绪]
  ├── 通信超时 ──→ [失联] ──重连──→ [注册中]（重新声明）
  ├── 物理急停 ──→ [安全停止] ──复位──→ [就绪]
  └── 设备主动断开 ──→ [离线]
```

**"失联"和"离线"的区别**：
- 失联 = AuraBrain 联系不上设备，但**不知道设备在干嘛**（可能还在动！）
- 离线 = 设备明确告知"我关了"

失联时 AuraBrain：
1. 立即停止下发命令
2. 标记该设备为"状态未知"
3. 通知 LLM："设备 X 失联，不要假设它停了，不要发新命令"
4. 等待重连（重连后设备重新声明状态）

## 七、和 Mastra 的集成

完全复用现有的 **tools 模式**（和 mail/calendar tools 一样）：

```
AuraBrain 收到设备能力声明
  → 动态生成 Mastra tools
  → Agent 挂载这些 tools
  → LLM 自然语言 → tool call → HTTP tick 送达 ESP32 → 执行
```

Agent 调用设备 tools 就像调用 mail/calendar tools 一样。LLM 不需要知道"这是 ESP32"，它只知道"有个工具叫 `arm_move`，参数是 x/y/z"。

### 场景示例

```
用户："桌上有个杯子，帮我拿起来"
  → LLM 看到 tools: [get_camera_frame, arm_move, gripper_set, get_ultrasonic]
  → LLM 调 get_camera_frame → 看到杯子位置
  → LLM 调 arm_move(x=120, y=45, z=80) → 下次 tick 送达 ESP32
  → LLM 调 gripper_set(angle=90) → 夹住
  → LLM 调 arm_move(x=200, y=100, z=150) → 移走
```

```
用户："温度超过 30 度就开风扇"
  → LLM 看到 tools: [get_temp, relay_toggle]
  → LLM 设置规则（或 Agent 持续监控）
  → 温度 > 30 → LLM 调 relay_toggle(id="fan", on=true)
  → 下次 tick 送达 ESP32 → 继电器闭合 → 风扇转
```

## 八、设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 通信协议 | HTTP（tick 模式） | ESP32 固件最简单，无状态，断了就停 |
| 设备发现 | mDNS | IP 不固定也能找到，用户无感 |
| 设备身份 | MAC 派生 | 稳定、唯一、不需要用户命名 |
| 认证 | 轻量 token | 防局域网冒充，够用 |
| 安全 | ESP32 本地保证 | 不依赖网络，PC 死了也安全 |
| 能力管理 | 设备自声明 | 换硬件不用改 AuraBrain |
| 异常处理 | 安全相关不经过 LLM | LLM 可能理解错，急停就是急停 |
| 多设备 | 同一 mDNS 服务 | 所有 ESP32 查同一个，用 MAC 区分 |
| 蓝牙 | 不参与日常连接 | WiFi + mDNS 够了，BLE 做备用/配网 |

## 九、待讨论 / 后续

- [ ] ESP32 WiFi 配网方式（softAP / BLE / USB 串口）
- [ ] 一个 ESP32 管多个执行器时的"虚拟设备"拆分策略
- [ ] tick 频率动态调整策略（空闲降频省电）
- [ ] 多 AuraBrain 实例（多 PC）时的设备归属
- [ ] 设备固件 OTA 更新机制
- [ ] 具体 ESP32 硬件选型（哪块板子、什么舵机、什么传感器）
- [ ] 机械臂运动学（正运动学/逆运动学在 ESP32 还是 PC 侧算）
