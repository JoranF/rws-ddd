using Npgsql;

namespace Monitoring.Infrastructure.Persistence;

public static class NpgsqlVerbinding
{
    /// <summary>Npgsql accepteert geen URI-vorm; zet postgres://user:pass@host:port/db om.</summary>
    public static string VanUrl(string databaseUrl)
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port < 0 ? 5432 : uri.Port,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            Database = uri.AbsolutePath.TrimStart('/'),
        };
        return builder.ConnectionString;
    }
}
