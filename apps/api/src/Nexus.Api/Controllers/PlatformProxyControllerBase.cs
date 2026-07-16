using System.Net.Http;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Nexus.Api.Services;
using Nexus.Application.Services;

namespace Nexus.Api.Controllers;

/// <summary>
/// Shared helpers for Super Admin platform proxies → Python crew.
/// Path <c>workspaceId</c> is the tenant scope (may differ from JWT tenant for ops).
/// </summary>
public abstract class PlatformProxyControllerBase : ControllerBase
{
    protected readonly IPlatformCrewClient Crew;
    protected readonly IPermissionService PermissionService;

    protected PlatformProxyControllerBase(
        IPlatformCrewClient crew,
        IPermissionService permissionService)
    {
        Crew = crew;
        PermissionService = permissionService;
    }

    /// <summary>
    /// Platform operate: Owner/Admin (users.manage). Cross-tenant path workspace is intentional.
    /// </summary>
    protected async Task<IActionResult?> EnsurePlatformAccessAsync(CancellationToken cancellationToken)
    {
        if (!await PermissionService.HasPermissionAsync(Permissions.UsersManage, cancellationToken)
            && !await PermissionService.HasPermissionAsync(Permissions.PlatformOperate, cancellationToken))
        {
            return Forbid();
        }

        return null;
    }

    protected async Task<IActionResult> ProxyJsonAsync(
        HttpMethod method,
        Guid workspaceId,
        string relativePath,
        CancellationToken cancellationToken,
        bool forwardBody = false)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        HttpContent? content = null;
        if (forwardBody
            && (HttpMethods.IsPost(method.Method)
                || HttpMethods.IsPut(method.Method)
                || HttpMethods.IsPatch(method.Method)))
        {
            // Buffer body so upstream can read after middleware consumed the stream.
            Request.EnableBuffering();
            using var reader = new StreamReader(Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
            var raw = await reader.ReadToEndAsync(cancellationToken);
            Request.Body.Position = 0;
            content = new StringContent(raw, Encoding.UTF8, Request.ContentType ?? "application/json");
        }

        var qs = Request.QueryString.HasValue ? Request.QueryString.Value : string.Empty;
        var path = relativePath + qs;

        using var upstream = await Crew.SendAsync(method, path, workspaceId, content, cancellationToken);
        var body = await upstream.Content.ReadAsStringAsync(cancellationToken);
        var mediaType = upstream.Content.Headers.ContentType?.MediaType ?? "application/json";
        return new ContentResult
        {
            Content = body,
            ContentType = mediaType,
            StatusCode = (int)upstream.StatusCode,
        };
    }
}
