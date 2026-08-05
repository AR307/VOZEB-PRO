import type { SiteFriendLink, SiteShowcaseMode, SiteSocialSettings } from "@/lib/auth/store-types";
import type { PublicGalleryItem } from "@/services/api/work-governance";

export type HomeSiteSettings = {
    title: string;
    logoUrl: string;
    seoDescription: string;
    footerCopyright: string;
    termsUrl: string;
    privacyUrl: string;
    homeShowcaseMode: SiteShowcaseMode;
    friendLinks: SiteFriendLink[];
    socials: SiteSocialSettings;
};

export const HOME_NAVIGATION = [
    { label: "创作 Agent", href: "/create", protected: true },
    { label: "图片工作台", href: "/image", protected: true },
    { label: "视频工作台", href: "/video", protected: true },
    { label: "短剧制作", href: "/drama", protected: true },
    { label: "作品广场", href: "/gallery", protected: false },
    { label: "价格方案", href: "/billing", protected: true },
] as const;

export const HOME_PROMPT_EXAMPLES = ["生成一张科幻城市概念图", "制作一段产品宣传视频", "为美妆产品生成宣传图", "创作一个短篇分镜脚本"] as const;

export const HOME_CREATION_MODES = [
    { id: "writing", label: "AI 写作", icon: "writing" },
    { id: "image", label: "AI 绘图", icon: "image" },
    { id: "video", label: "AI 视频", icon: "video" },
    { id: "audio", label: "AI 音频", icon: "audio" },
    { id: "script", label: "AI 脚本", icon: "script" },
] as const;

export type HomeCreationMode = (typeof HOME_CREATION_MODES)[number]["id"];

export const HOME_STEPS = [
    { number: "01", title: "选择场景", description: "选择合适的创作场景，明确创作类型", icon: "grid" },
    { number: "02", title: "输入需求", description: "描述你的想法，上传必要的参考素材", icon: "edit" },
    { number: "03", title: "生成内容", description: "AI 多模态生成高质量创作内容", icon: "rocket" },
    { number: "04", title: "发布与分享", description: "一键发布并分享创作成果", icon: "share" },
] as const;

export const HOME_ADVANTAGES = [
    { title: "100+ 创作模板", description: "覆盖多行业与多场景", icon: "layers" },
    { title: "多模型协同", description: "按任务智能匹配能力", icon: "network" },
    { title: "长任务不中断", description: "稳定续取创作进度", icon: "history" },
    { title: "企业级存储", description: "可靠保存创作资产", icon: "cloud" },
] as const;

export const HOME_GALLERY_TABS = [
    { id: "all", label: "全部" },
    { id: "image", label: "图片设计" },
    { id: "video", label: "视频作品" },
    { id: "drama", label: "短剧分镜" },
    { id: "poster", label: "海报设计" },
    { id: "audio", label: "音频作品" },
] as const;

export type HomeGalleryTab = (typeof HOME_GALLERY_TABS)[number]["id"];

export function homeGalleryMatches(item: PublicGalleryItem, tab: HomeGalleryTab) {
    const mediaType = item.preview?.mediaType;
    if (tab === "all") return true;
    if (tab === "image") return mediaType === "image" && item.sourceType !== "drama";
    if (tab === "video") return mediaType === "video" && item.sourceType !== "drama";
    if (tab === "drama") return item.sourceType === "drama" || item.category === "短剧";
    if (tab === "poster") return mediaType === "image" && (item.category === "品牌内容" || item.category === "视觉设计");
    return mediaType === "audio";
}

export function homeGalleryTypeLabel(item: PublicGalleryItem) {
    if (item.sourceType === "drama" || item.category === "短剧") return "短剧分镜";
    if (item.preview?.mediaType === "video") return "视频作品";
    if (item.preview?.mediaType === "audio") return "音频作品";
    if (item.category === "品牌内容") return "海报设计";
    return "图片设计";
}
