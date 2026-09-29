using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Windows.Forms;

namespace AuraBrain.Tray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly HttpClient _http = new();
    private readonly System.Windows.Forms.Timer _timer;
    private readonly string _baseUrl;
    private readonly string _runtimeRoot;
    private bool _running;

    public TrayApplicationContext()
    {
        _baseUrl = Environment.GetEnvironmentVariable("AURABRAIN_URL") ?? "http://127.0.0.1:49000";
        _runtimeRoot = Environment.GetEnvironmentVariable("AURABRAIN_RUNTIME_ROOT")
            ?? AppContext.BaseDirectory;
        _timer = new System.Windows.Forms.Timer { Interval = 5000 };
        _timer.Tick += async (_, _) => await RefreshStatusAsync();

        var menu = new ContextMenuStrip();
        menu.Items.Add("打开管理页面", null, (_, _) => OpenUrl("/"));
        menu.Items.Add("查看状态", null, async (_, _) => await ShowStatusAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("启动 Runtime", null, async (_, _) => await RunCliAsync("dev"));
        menu.Items.Add("停止 Runtime", null, async (_, _) => await RunCliAsync("stop"));
        menu.Items.Add("重启 Runtime", null, async (_, _) => await RestartAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出托盘", null, (_, _) => ExitThread());

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "AuraBrain Runtime",
            Visible = true,
            ContextMenuStrip = menu,
        };
        _trayIcon.DoubleClick += (_, _) => OpenUrl("/");
        _trayIcon.BalloonTipClicked += (_, _) => OpenUrl("/");
        _timer.Start();
        _ = RefreshStatusAsync();
    }

    private async Task RefreshStatusAsync()
    {
        try
        {
            using var response = await _http.GetAsync($"{_baseUrl}/health");
            _running = response.IsSuccessStatusCode;
            _trayIcon.Text = _running ? "AuraBrain Runtime · 运行中" : "AuraBrain Runtime · 已停止";
        }
        catch
        {
            _running = false;
            _trayIcon.Text = "AuraBrain Runtime · 已停止";
        }
    }

    private async Task ShowStatusAsync()
    {
        try
        {
            var metrics = await _http.GetFromJsonAsync<JsonElement>($"{_baseUrl}/admin/runtime/status");
            var memory = metrics.GetProperty("memory");
            var rss = memory.GetProperty("rssBytes").GetInt64() / 1024d / 1024d;
            MessageBox.Show($"地址：{_baseUrl}\nPID：{metrics.GetProperty("pid")}\nRSS：{rss:F1} MB\n运行时间：{metrics.GetProperty("uptimeSeconds")} 秒", "AuraBrain 状态", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            MessageBox.Show($"Runtime 当前不可用。\n{error.Message}", "AuraBrain 状态", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task RestartAsync()
    {
        await RunCliAsync("stop");
        await RunCliAsync("dev");
    }

    private async Task RunCliAsync(string command)
    {
        var node = Environment.GetEnvironmentVariable("AURABRAIN_NODE") ?? "node.exe";
        var cli = Path.Combine(_runtimeRoot, "bin", "aurabrain.mjs");
        if (!File.Exists(cli))
        {
            MessageBox.Show($"找不到 Runtime CLI：{cli}", "AuraBrain", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = node,
                Arguments = $"\"{cli}\" {command}",
                WorkingDirectory = _runtimeRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            if (process is not null) await process.WaitForExitAsync();
            await RefreshStatusAsync();
        }
        catch (Exception error)
        {
            MessageBox.Show($"无法执行 Runtime 命令。\n{error.Message}", "AuraBrain", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenUrl(string path)
    {
        Process.Start(new ProcessStartInfo($"{_baseUrl}{path}") { UseShellExecute = true });
    }

    protected override void ExitThreadCore()
    {
        _timer.Stop();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _http.Dispose();
        base.ExitThreadCore();
    }
}
