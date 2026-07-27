/**
 * [INPUT]: 依赖生产域名、GitHub 仓库与 codexthemes 协议约定
 * [OUTPUT]: 提供官网、下载 API、社区和桌面深链的唯一常量来源
 * [POS]: web/src 的部署配置边界，页面组件不得重复硬编码地址
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const SITE_NAME = "Codex Themes";
export const SITE_URL = "https://theme.codexguide.ai";
export const APP_PROTOCOL = "codexthemes";
export const GITHUB_REPO_URL = "https://github.com/freestylefly/codex-themes";
export const COMMUNITY_JOIN_URL = "https://codexguide.ai/community/join.html";
export const DOWNLOAD_PAGE_PATH = "/download";
export const WINDOWS_DOWNLOAD_URL = "/api/v1/downloads/latest?format=exe";
export const MAC_DMG_DOWNLOAD_URL = "/api/v1/downloads/latest?format=dmg";
export const MAC_ZIP_DOWNLOAD_URL = "/api/v1/downloads/latest?format=zip";
