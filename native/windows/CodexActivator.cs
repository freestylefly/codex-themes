using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

internal static class CodexActivator
{
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const int ErrorInsufficientBuffer = 122;
    private const int AppModelErrorNoPackage = 15700;
    private const uint WmClose = 0x0010;
    private const int SwShowNormal = 1;
    private static readonly Regex AumidPattern = new Regex(
        @"^[A-Za-z0-9._-]+![A-Za-z0-9._-]+$",
        RegexOptions.CultureInvariant);
    private static readonly Regex ActivationArgumentsPattern = new Regex(
        @"^--remote-debugging-address=127\.0\.0\.1 --remote-debugging-port=([1-9][0-9]{0,4})$",
        RegexOptions.CultureInvariant);

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    private class ApplicationActivationManager
    {
    }

    [ComImport]
    [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);

        int ActivateForFile(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            [MarshalAs(UnmanagedType.LPWStr)] string verb,
            out uint processId);

        int ActivateForProtocol(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray,
            out uint processId);
    }

    [Flags]
    private enum ActivateOptions
    {
        None = 0,
        DesignMode = 0x1,
        NoErrorUi = 0x2,
        NoSplashScreen = 0x4,
        Prelaunch = 0x2000000
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetPackageFamilyName(
        IntPtr process,
        ref uint packageFamilyNameLength,
        StringBuilder packageFamilyName);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr ShellExecute(
        IntPtr window,
        string operation,
        string file,
        string parameters,
        string directory,
        int showCommand);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                throw new ArgumentException("A command is required.");
            }

            switch (args[0])
            {
                case "activate":
                    RequireArgumentCount(args, 3);
                    return Activate(args[1], args[2]);
                case "package-family":
                    RequireArgumentCount(args, 2);
                    return PackageFamily(ParseProcessId(args[1]));
                case "close":
                    RequireArgumentCount(args, 2);
                    return Close(ParseProcessId(args[1]));
                case "open-uri":
                    RequireArgumentCount(args, 2);
                    return OpenUri(args[1]);
                default:
                    throw new ArgumentException("Unknown command: " + args[0]);
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("{\"ok\":false,\"error\":\"" + EscapeJson(error.Message) + "\"}");
            return 1;
        }
    }

    private static int Activate(string aumid, string arguments)
    {
        if (!AumidPattern.IsMatch(aumid))
        {
            throw new ArgumentException("The AUMID is invalid.");
        }

        ValidateActivationArguments(arguments);
        IApplicationActivationManager manager =
            (IApplicationActivationManager)new ApplicationActivationManager();
        uint processId;
        int result = manager.ActivateApplication(aumid, arguments, ActivateOptions.NoErrorUi, out processId);
        Marshal.ThrowExceptionForHR(result);
        Console.WriteLine("{\"ok\":true,\"pid\":" + processId + "}");
        return 0;
    }

    private static int PackageFamily(uint processId)
    {
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero)
        {
            throw new InvalidOperationException(
                "OpenProcess failed with Win32 error " + Marshal.GetLastWin32Error() + ".");
        }

        try
        {
            uint length = 0;
            int first = GetPackageFamilyName(process, ref length, null);
            if (first == AppModelErrorNoPackage)
            {
                Console.WriteLine("{\"ok\":true,\"packageFamilyName\":null}");
                return 0;
            }
            if (first != ErrorInsufficientBuffer || length == 0)
            {
                throw new InvalidOperationException("GetPackageFamilyName failed with error " + first + ".");
            }

            StringBuilder family = new StringBuilder((int)length);
            int second = GetPackageFamilyName(process, ref length, family);
            if (second != 0)
            {
                throw new InvalidOperationException("GetPackageFamilyName failed with error " + second + ".");
            }
            Console.WriteLine(
                "{\"ok\":true,\"packageFamilyName\":\"" + EscapeJson(family.ToString()) + "\"}");
            return 0;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    private static int Close(uint processId)
    {
        int posted = 0;
        EnumWindows(
            delegate(IntPtr window, IntPtr parameter)
            {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                if (owner == processId && PostMessage(window, WmClose, IntPtr.Zero, IntPtr.Zero))
                {
                    posted += 1;
                }
                return true;
            },
            IntPtr.Zero);
        Console.WriteLine("{\"ok\":true,\"windowsClosed\":" + posted + "}");
        return 0;
    }

    private static int OpenUri(string uri)
    {
        if (!string.Equals(uri, "codex://threads/new", StringComparison.Ordinal))
        {
            throw new ArgumentException("Only codex://threads/new may be opened.");
        }
        IntPtr result = ShellExecute(IntPtr.Zero, "open", uri, null, null, SwShowNormal);
        long code = result.ToInt64();
        if (code <= 32)
        {
            throw new InvalidOperationException("ShellExecuteW failed with code " + code + ".");
        }
        Console.WriteLine("{\"ok\":true}");
        return 0;
    }

    private static void ValidateActivationArguments(string arguments)
    {
        if (arguments.Length == 0)
        {
            return;
        }
        Match match = ActivationArgumentsPattern.Match(arguments);
        int port;
        if (!match.Success || !int.TryParse(match.Groups[1].Value, out port) || port > 65535)
        {
            throw new ArgumentException("The activation arguments are invalid.");
        }
    }

    private static uint ParseProcessId(string value)
    {
        uint processId;
        if (!uint.TryParse(value, out processId) || processId == 0)
        {
            throw new ArgumentException("The process id is invalid.");
        }
        return processId;
    }

    private static void RequireArgumentCount(string[] args, int expected)
    {
        if (args.Length != expected)
        {
            throw new ArgumentException(args[0] + " expects " + (expected - 1) + " argument(s).");
        }
    }

    private static string EscapeJson(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }
}
