// ============================================================
//  SightTwin · Outlook 真·事件驱动 Sink（路线 C 事件推送，零轮询）
//
//  原理（手动 COM EventSink，零 PIA / 零 tlbimp / 零安装）：
//   1) late-binding 拿到 Inbox(6)/Calendar(9) 的 Items 对象（__ComObject）
//   2) 裸 P/Invoke QueryInterface（vtable slot 0）QI 到 IConnectionPointContainer
//   3) 裸 P/Invoke GetConnectionPoint（vtable slot 3）拿 IItemsEvents 连接点
//   4) 裸 P/Invoke Connect（vtable slot 3）挂上本进程实现的 IItemsEvents sink
//   5) 主线程跑 STA 消息泵（GetMessage 阻塞，空闲 0% CPU），
//      Outlook 通过 COM marshal 投递 ItemAdd → 回调读属性 → stdout 写 JSON 行
//
//  为什么不用 .NET cast (IConnectionPointContainer)items：
//   实测 .NET 对手写 ComImport 接口的 QI 返回 E_NOINTERFACE（bug），
//   但 .NET 内置 ComTypes 版本和裸 QI 都成功。裸 P/Invoke 最可靠。
//
//  编译：Framework64\v4.0.30319\csc.exe /nologo /target:exe outlook-sink.cs
//  用法：outlook-sink.exe [baselineISO]
//        baseline 默认=进程启动时刻。stdin 收到行 → 优雅退出。
//        本进程绝不 Quit 用户的 Outlook（COM 单实例，退出时连接点自动释放）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace SightTwin
{
    // ---------- IItemsEvents（唯一需要的 .NET 接口声明，给 sink 实现用）----------
    // InterfaceIsIDispatch：CLR 生成 dual vtable = IUnknown(0-2) + IDispatch(3-6) + ItemAdd(7) + ItemChange(8) + ItemDelete(9)
    [ComImport]
    [Guid("00063001-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    interface IItemsEvents
    {
        void ItemAdd(object Item);
        void ItemChange(object Item);
        void ItemDelete(object Item);
    }

    // ---------- Sink 实现 ----------
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.None)]
    class ItemsEventsSink : IItemsEvents
    {
        public Emitter Emitter;
        public bool IsCalendar;

        public void ItemAdd(object Item)
        {
            try
            {
                if (Emitter == null) return;
                if (IsCalendar) Emitter.EmitCalendar(Item);
                else Emitter.EmitMail(Item);
            }
            catch (Exception e) { if (Emitter != null) Emitter.Log("ItemAdd err: " + e.Message); }
        }
        public void ItemChange(object Item) { }
        public void ItemDelete(object Item) { }
    }

    // ---------- JSON 发射器 ----------
    class Emitter
    {
        public DateTime Baseline = DateTime.MinValue;
        readonly object _lock = new object();

        public void Log(string s)
        {
            try { Console.Error.WriteLine("[sink] " + s); } catch { }
        }

        public void EmitLine(string json)
        {
            lock (_lock)
            {
                try { Console.Out.Write(json + "\n"); Console.Out.Flush(); }
                catch (Exception e) { Log("emit err: " + e.Message); }
            }
        }

        public void EmitMail(object item)
        {
            try
            {
                int cls = GetInt(item, "Class");
                if (cls != 43) return;
                DateTime rt = GetDate(item, "ReceivedTime");
                if (rt < Baseline) return;
                EmitLine("{\"type\":\"mail\",\"subject\":\"" + JsonEscape(GetStr(item, "Subject"))
                    + "\",\"from\":\"" + JsonEscape(GetStr(item, "SenderName"))
                    + "\",\"fromEmail\":\"" + JsonEscape(GetStr(item, "SenderEmailAddress"))
                    + "\",\"received\":\"" + rt.ToString("o")
                    + "\",\"unread\":" + (GetBool(item, "UnRead") ? "true" : "false") + "}");
            }
            catch (Exception e) { Log("EmitMail err: " + e.Message); }
        }

        public void EmitCalendar(object item)
        {
            try
            {
                int cls = GetInt(item, "Class");
                if (cls != 26) return;
                DateTime st = GetDate(item, "Start");
                if (st < Baseline) return;
                EmitLine("{\"type\":\"event\",\"subject\":\"" + JsonEscape(GetStr(item, "Subject"))
                    + "\",\"start\":\"" + st.ToString("o")
                    + "\",\"end\":\"" + GetDate(item, "End").ToString("o")
                    + "\",\"location\":\"" + JsonEscape(GetStr(item, "Location"))
                    + "\",\"organizer\":\"" + JsonEscape(GetStr(item, "Organizer")) + "}");
            }
            catch (Exception e) { Log("EmitCalendar err: " + e.Message); }
        }

        static object Prop(object o, string name)
        {
            return o.GetType().InvokeMember(name, BindingFlags.GetProperty, null, o, null);
        }
        static string GetStr(object o, string name)
        {
            try { object v = Prop(o, name); return v == null ? "" : Convert.ToString(v, null); }
            catch { return ""; }
        }
        static int GetInt(object o, string name)
        {
            try { return Convert.ToInt32(Prop(o, name)); }
            catch { return -1; }
        }
        static bool GetBool(object o, string name)
        {
            try { return Convert.ToBoolean(Prop(o, name)); }
            catch { return false; }
        }
        static DateTime GetDate(object o, string name)
        {
            try { return Convert.ToDateTime(Prop(o, name)); }
            catch { return DateTime.MinValue; }
        }

        static string JsonEscape(string s)
        {
            if (s == null) return "";
            var sb = new StringBuilder();
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }

    // ---------- 主程序 ----------
    class Program
    {
        static readonly Guid IID_IItemsEvents = new Guid("00063001-0000-0000-C000-000000000046");
        static readonly Guid IID_ICPC = new Guid("BC000C60-0000-0000-C000-000000000046");
        static readonly List<object> _keepAlive = new List<object>();
        static object _app;

        // ---- 裸 COM vtable 调用委托（x64: StdCall=Cdecl，不区分）----
        // IUnknown::QueryInterface(pThis, riid*, ppv*)
        delegate int QIDelegate(IntPtr pThis, ref Guid riid, out IntPtr ppv);
        // IConnectionPointContainer::GetConnectionPoint(pThis, riid*, ppConnPoint*)
        delegate int GetCPDelegate(IntPtr pThis, ref Guid riid, out IntPtr ppConnPoint);
        // IConnectionPoint::Connect(pThis, punk, riid*, psink, pdwCookie*)
        delegate int ConnectDelegate(IntPtr pThis, IntPtr punk, ref Guid riid, IntPtr psink, out int pdwCookie);
        // IConnectionPoint::Disconnect(pThis, dwCookie)
        delegate int DisconnectDelegate(IntPtr pThis, int dwCookie);

        // ---- Win32 消息泵 ----
        [StructLayout(LayoutKind.Sequential)]
        struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int ptX;
            public int ptY;
        }
        [DllImport("user32.dll")]
        static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMin, uint wMax);
        [DllImport("user32.dll")]
        static extern int TranslateMessage(ref MSG lpMsg);
        [DllImport("user32.dll")]
        static extern int DispatchMessage(ref MSG lpMsg);
        [DllImport("user32.dll")]
        static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
        const uint WM_QUIT = 0x0012;

        // ---- 从 COM 对象指针取 vtable 函数指针 ----
        static IntPtr VtblFn(IntPtr comObj, int slot)
        {
            IntPtr vtbl = Marshal.ReadIntPtr(comObj); // slot 0 = vtable ptr
            return Marshal.ReadIntPtr(vtbl, slot * IntPtr.Size);
        }

        static string ErrMsg(Exception e)
        {
            try { return e.GetType().Name + ": " + e.Message; } catch { return "unknown"; }
        }

        [STAThread]
        static int Main(string[] args)
        {
            DateTime baseline = DateTime.Now;
            if (args.Length > 0) { DateTime b; if (DateTime.TryParse(args[0], out b)) baseline = b; }
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }

            var em = new Emitter { Baseline = baseline };
            em.Log("sink starting, baseline=" + baseline.ToString("o"));

            try
            {
                _app = Activator.CreateInstance(Type.GetTypeFromProgID("Outlook.Application"));
                em.Log("app ok");
                object ns = _app.GetType().InvokeMember("GetNamespace",
                    BindingFlags.InvokeMethod, null, _app, new object[] { "MAPI" });
                em.Log("ns ok");

                bool okMail = Hook(em, ns, 6, false);
                bool okCal = Hook(em, ns, 9, true);

                em.EmitLine("{\"type\":\"status\",\"message\":\"C# EventSink ready (ItemAdd \u4e8b\u4ef6\u9a71\u52a8\uff0c\u96f6\u8f6e\u8be2)\","
                    + "\"baselineMail\":\"" + baseline.ToString("o")
                    + "\",\"baselineEvent\":\"" + baseline.ToString("o")
                    + "\",\"mailHook\":" + (okMail ? "true" : "false")
                    + ",\"calHook\":" + (okCal ? "true" : "false")
                    + ",\"intervalSec\":0}");
                em.Log("hooks mail=" + okMail + " cal=" + okCal + ", entering message pump");
            }
            catch (Exception e)
            {
                em.EmitLine("{\"type\":\"watcher-error\",\"message\":\"sink \u542f\u52a8\u5931\u8d25: " + ErrMsg(e) + "\"}");
                em.Log("start err: " + e);
                return 1;
            }

            // stdin: 收到行 → WM_QUIT 优雅退出（NUL stdin 首次 EOF 不退出，由 Node kill）
            Thread stdinThread = new Thread(delegate ()
            {
                try { string l = Console.In.ReadLine(); if (l != null) PostMessage(IntPtr.Zero, WM_QUIT, IntPtr.Zero, IntPtr.Zero); }
                catch { }
            });
            stdinThread.IsBackground = true;
            stdinThread.Start();

            // STA 消息泵
            MSG msg;
            while (true)
            {
                int ret = GetMessage(out msg, IntPtr.Zero, 0, 0);
                if (ret == 0 || ret == -1) break;
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            em.Log("pump exited, releasing");
            for (int i = _keepAlive.Count - 1; i >= 0; i--)
            {
                object o = _keepAlive[i];
                if (o is IntPtr) { try { Marshal.Release((IntPtr)o); } catch { } }
            }
            em.Log("done");
            return 0;
        }

        // ---- 对文件夹 Items 挂接 IItemsEvents（全裸 P/Invoke vtable 调用）----
        static bool Hook(Emitter em, object ns, int folderId, bool isCalendar)
        {
            IntPtr pCpc = IntPtr.Zero;
            IntPtr pCp = IntPtr.Zero;
            IntPtr pUnkItems = IntPtr.Zero;
            try
            {
                object folder = ns.GetType().InvokeMember("GetDefaultFolder",
                    BindingFlags.InvokeMethod, null, ns, new object[] { folderId });
                object items = folder.GetType().InvokeMember("Items",
                    BindingFlags.GetProperty, null, folder, null);
                em.Log("folder " + folderId + " items type=" + items.GetType().Name);

                // 1) GetIUnknownForObject → IUnknown 指针
                pUnkItems = Marshal.GetIUnknownForObject(items);
                em.Log("  pUnkItems=" + pUnkItems);

                // 2) 裸 QI: IUnknown::QueryInterface(pThis, &IID_ICPC, &pCpc)
                QIDelegate qi = (QIDelegate)Marshal.GetDelegateForFunctionPointer(
                    VtblFn(pUnkItems, 0), typeof(QIDelegate));
                Guid iidCPC = IID_ICPC;
                int hr = qi(pUnkItems, ref iidCPC, out pCpc);
                em.Log("  QI ICPC hr=" + hr.ToString("X8") + " pCpc=" + pCpc);
                if (hr != 0 || pCpc == IntPtr.Zero) return false;

                // 3) 裸 GetConnectionPoint: ICPC::GetConnectionPoint(pThis, &IID_IItemsEvents, &pCp)
                GetCPDelegate getcp = (GetCPDelegate)Marshal.GetDelegateForFunctionPointer(
                    VtblFn(pCpc, 3), typeof(GetCPDelegate));
                Guid iidEv = IID_IItemsEvents;
                hr = getcp(pCpc, ref iidEv, out pCp);
                em.Log("  GetConnectionPoint hr=" + hr.ToString("X8") + " pCp=" + pCp);
                if (hr != 0 || pCp == IntPtr.Zero) return false;

                // 4) 创建 sink 对象，拿 IUnknown + IItemsEvents 接口指针
                var sink = new ItemsEventsSink { Emitter = em, IsCalendar = isCalendar };
                IntPtr sinkUnk = Marshal.GetIUnknownForObject(sink);
                IntPtr sinkIface = Marshal.GetComInterfaceForObject(sink, typeof(IItemsEvents));
                _keepAlive.Add(sink);
                _keepAlive.Add(sinkUnk);
                _keepAlive.Add(sinkIface);
                em.Log("  sink created, sinkUnk=" + sinkUnk + " sinkIface=" + sinkIface);

                // 5) 裸 Connect: ICP::Connect(pThis, punk, &riid, psink, &cookie)
                ConnectDelegate connect = (ConnectDelegate)Marshal.GetDelegateForFunctionPointer(
                    VtblFn(pCp, 3), typeof(ConnectDelegate));
                int cookie;
                hr = connect(pCp, sinkUnk, ref iidEv, sinkIface, out cookie);
                em.Log("  Connect hr=" + hr.ToString("X8") + " cookie=" + cookie);
                return hr == 0;
            }
            catch (Exception e)
            {
                em.Log("  HOOK folder " + folderId + " FAILED: " + ErrMsg(e));
                if (pCpc != IntPtr.Zero) try { Marshal.Release(pCpc); } catch { }
                if (pCp != IntPtr.Zero) try { Marshal.Release(pCp); } catch { }
                if (pUnkItems != IntPtr.Zero) try { Marshal.Release(pUnkItems); } catch { }
                return false;
            }
        }
    }
}
