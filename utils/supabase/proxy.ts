import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_PUBLISHABLE_DEFAULT_KEY:', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * 公共路径 allowlist（游客免登录可访问）。
 * 新增公开路由时，把对应路径前缀加到这里；不在列表里的路径游客会被重定向到 /account。
 * 首页 `/gekaixing` 在 isPublicPath() 中单独精确匹配——其子路径（chat / settings /
 * notifications / gkx / likes / bookmarks / history / ads 等）不在此列，游客仍被拦截。
 */
const PUBLIC_PATHS = [
  // 原有豁免（登录页/静态页/认证回调）
  "/tos",
  "/cookies",
  "/privacy",
  "/account",
  "/about",
  "/help-center",
  "/accessibility",
  "/ads-info",
  "/auth",
  "/api",
  // 游客可浏览的产品内容（首页 /gekaixing 精确匹配，见 isPublicPath）
  "/gekaixing/user", // 个人主页
  "/gekaixing/status", // 帖子详情
  "/gekaixing/reply", // 回复串
  "/gekaixing/explore",
  "/gekaixing/search",
  "/gekaixing/connect_people",
  "/gekaixing/following",
  "/gekaixing/jobs",
  "/gekaixing/help",
  // 公开内容站
  "/blog",
  "/notion",
  "/motion",
];

function isPublicPath(pathname: string): boolean {
  // 首页 feed：仅精确路径公开（?tab= 是查询参数，不影响匹配）；子路径须在列表中单独列出
  if (pathname === "/gekaixing") return true;
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 如果环境变量未设置，跳过代理检查。完成项目设置后可以移除此检查
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // 使用 Fluid compute 时，不要将客户端放在全局变量中，应在每次请求时创建新实例
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 重要：在 createServerClient 和 supabase.auth.getClaims() 之间不要写代码
  // 简单的错误可能导致用户随机登出的问题难以调试

  // 注意：如果移除 getClaims() 并在服务端渲染中使用 Supabase 客户端
  // 用户可能会被随机登出
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!isPublicPath(request.nextUrl.pathname) && !user) {
    // 无用户且路径不在公共 allowlist → 重定向到登录页
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    return NextResponse.redirect(url);
  }

  // 重要：必须返回 supabaseResponse 对象
  // 如果使用 NextResponse.next() 创建新响应对象，请确保：
  // 1. 传入 request 参数，如：const myNewResponse = NextResponse.next({ request })
  // 2. 复制所有 cookie：myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. 根据需要修改 response，但不要修改 cookie
  // 4. 最后返回新 response
  // 否则可能导致浏览器和服务器状态不同步，提前终止用户会话

  return supabaseResponse;
}
