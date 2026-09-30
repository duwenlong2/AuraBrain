using System.Diagnostics;
using System.Windows.Forms;

namespace AuraBrain.Setup;

internal sealed class SetupForm : Form
{
    private readonly CheckBox _startup = new() { Text = "登录 Windows 时自动启动 AuraBrain", Checked = true, AutoSize = true };
    private readonly CheckBox _tray = new() { Text = "创建系统托盘图标", Checked = true, AutoSize = true };
    private readonly Label _status = new() { AutoSize = true, Text = "准备安装..." };
    private readonly Button _install = new() { Text = "开始安装", AutoSize = true, Anchor = AnchorStyles.Right };
    private readonly ProgressBar _progress = new() { Dock = DockStyle.Fill, Style = ProgressBarStyle.Marquee };
    private readonly string _payloadRoot;
    private readonly string _installRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraBrain", "Runtime");
    private readonly string _logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraBrain", "Logs", "installer.log");
    private readonly object _logLock = new();
    private long _lastStatusTick;

    public SetupForm()
    {
        Text = "AuraBrain 安装程序";
        Width = 560;
        Height = 360;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        _payloadRoot = AppContext.BaseDirectory;
        var title = new Label { Text = "安装 AuraBrain", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
        var description = new Label { Text = "安装 Runtime、准备 Node.js，并创建可选的启动入口。", AutoSize = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(32), ColumnCount = 2, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(title, 0, 0); layout.SetColumnSpan(title, 2);
        layout.Controls.Add(description, 0, 1); layout.SetColumnSpan(description, 2);
        layout.Controls.Add(_startup, 0, 3); layout.SetColumnSpan(_startup, 2);
        layout.Controls.Add(_tray, 0, 4); layout.SetColumnSpan(_tray, 2);
        layout.Controls.Add(_progress, 0, 5); layout.SetColumnSpan(_progress, 2);
        layout.Controls.Add(_status, 0, 6);
        layout.Controls.Add(_install, 1, 7);
        _install.Click += async (_, _) => await InstallAsync();
        Controls.Add(layout);
    }

    private async Task InstallAsync()
    {
        _install.Enabled = false;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_logPath)!);
            File.AppendAllText(_logPath, $"\r\n[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Installation started.\r\n");
            var packageRoot = Path.Combine(_payloadRoot, "payload");
            if (!Directory.Exists(packageRoot)) throw new InvalidOperationException("安装包缺少 payload 目录。");
            SetStatus("正在准备安装文件...");
            var staging = Path.Combine(Path.GetTempPath(), $"AuraBrain-setup-{Guid.NewGuid():N}");
            Directory.CreateDirectory(staging);
            await Task.Run(() => CopyDirectory(packageRoot, staging));
            SetStatus("正在检查并准备 Node.js...");
            var script = Path.Combine(staging, "scripts", "install-windows.ps1");
            var arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -InstallRoot \"{_installRoot}\"";
            if (!_startup.Checked) arguments += " -NoStartup";
            if (!_tray.Checked) arguments += " -NoTray";
            SetStatus("正在安装 Runtime 依赖...");
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = arguments,
                WorkingDirectory = staging,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            }) ?? throw new InvalidOperationException("无法启动安装步骤。");
            process.OutputDataReceived += (_, eventArgs) =>
            {
                HandleOutput(eventArgs.Data);
            };
            process.ErrorDataReceived += (_, eventArgs) =>
            {
                HandleOutput(eventArgs.Data);
            };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0) throw new InvalidOperationException("安装步骤失败。请检查网络连接和安装日志后重试。");
            SetStatus("安装完成，正在启动 AuraBrain...");
            var node = Path.Combine(_installRoot, "node", "node.exe");
            var cli = Path.Combine(_installRoot, "bin", "aurabrain.mjs");
            if (!File.Exists(node)) node = "node.exe";
            Process.Start(new ProcessStartInfo { FileName = node, Arguments = $"\"{cli}\" dev", WorkingDirectory = _installRoot, UseShellExecute = false, CreateNoWindow = true });
            MessageBox.Show("AuraBrain 安装完成。", "AuraBrain", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception error)
        {
            Log($"ERROR: {error}");
            SetStatus("安装失败，旧版本未被修改。日志已保存。");
            MessageBox.Show(error.Message, "AuraBrain 安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            _install.Enabled = true;
        }
    }

    private void HandleOutput(string? output)
    {
        if (string.IsNullOrWhiteSpace(output)) return;
        Log(output);
        var status = output switch
        {
            var line when line.Contains("Downloading Node.js", StringComparison.OrdinalIgnoreCase) => "正在下载 Node.js...",
            var line when line.Contains("npm ci", StringComparison.OrdinalIgnoreCase) => "正在安装 Runtime 依赖...",
            var line when line.Contains("installation complete", StringComparison.OrdinalIgnoreCase) => "正在创建启动入口...",
            var line when line.Contains("Startup:", StringComparison.OrdinalIgnoreCase) => "正在配置开机启动...",
            var line when line.Contains("Tray:", StringComparison.OrdinalIgnoreCase) => "正在配置系统托盘...",
            _ => null
        };
        if (status is null || Environment.TickCount64 - Interlocked.Read(ref _lastStatusTick) <= 250) return;
        Interlocked.Exchange(ref _lastStatusTick, Environment.TickCount64);
        SetStatus(status);
    }

    private void SetStatus(string status)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            BeginInvoke(() => SetStatus(status));
            return;
        }
        _status.Text = status;
    }

    private void Log(string message)
    {
        try
        {
            lock (_logLock)
                File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            var target = Path.Combine(destination, Path.GetRelativePath(source, file));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, true);
        }
    }
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new SetupForm());
    }
}
