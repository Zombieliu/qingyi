/**
 * API 版本化工具
 *
 * 提供版本常量和从请求中读取版本的辅助函数，
 * 为未来版本差异化处理做准备。
 */

/** 支持的 API 版本 */
export const API_VERSIONS = ["v1"] as const;

export type ApiVersion = (typeof API_VERSIONS)[number];

/** 默认版本（未携带版本 header 时使用） */
export const DEFAULT_API_VERSION: ApiVersion = "v1";

/** 版本 header 名称 */
export const API_VERSION_HEADER = "x-api-version";

/**
 * 从请求 header 中读取 API 版本
 *
 * @param req - 包含 headers 的请求对象
 * @returns 解析到的 API 版本，无效或缺失时返回默认版本
 */
export function getApiVersion(req: { headers: { get(name: string): string | null } }): ApiVersion {
  const raw = req.headers.get(API_VERSION_HEADER);
  if (raw && (API_VERSIONS as readonly string[]).includes(raw)) {
    return raw as ApiVersion;
  }
  return DEFAULT_API_VERSION;
}

/**
 * 判断给定字符串是否为有效的 API 版本
 */
export function isValidApiVersion(value: string): value is ApiVersion {
  return (API_VERSIONS as readonly string[]).includes(value);
}
