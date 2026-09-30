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
            var packageRoot = Path.Combine(_payloadRoot, "payload");
            if (!Directory.Exists(packageRoot)) throw new InvalidOperationException("安装包缺少 payload 目录。");
            _status.Text = "正在准备安装文件...";
            var staging = Path.Combine(Path.GetTempPath(), $"AuraBrain-setup-{Guid.NewGuid():N}");
            Directory.CreateDirectory(staging);
            CopyDirectory(packageRoot, staging);
            _status.Text = "正在检查并准备 Node.js...";
            var script = Path.Combine(staging, "scripts", "install-windows.ps1");
            var arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -InstallRoot \"{_installRoot}\"";
            if (!_startup.Checked) arguments += " -NoStartup";
            if (!_tray.Checked) arguments += " -NoTray";
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
                if (!string.IsNullOrWhiteSpace(eventArgs.Data))
                    BeginInvoke(() => _status.Text = eventArgs.Data);
            };
            process.ErrorDataReceived += (_, eventArgs) =>
            {
                if (!string.IsNullOrWhiteSpace(eventArgs.Data))
                    BeginInvoke(() => _status.Text = eventArgs.Data);
            };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0) throw new InvalidOperationException("安装步骤失败。请检查网络连接和安装日志后重试。");
            _status.Text = "安装完成，正在启动 AuraBrain...";
            var node = Path.Combine(_installRoot, "node", "node.exe");
            var cli = Path.Combine(_installRoot, "bin", "aurabrain.mjs");
            if (!File.Exists(node)) node = "node.exe";
            Process.Start(new ProcessStartInfo { FileName = node, Arguments = $"\"{cli}\" dev", WorkingDirectory = _installRoot, UseShellExecute = false, CreateNoWindow = true });
            MessageBox.Show("AuraBrain 安装完成。", "AuraBrain", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception error)
        {
            _status.Text = "安装失败，旧版本未被修改。";
            MessageBox.Show(error.Message, "AuraBrain 安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            _install.Enabled = true;
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
