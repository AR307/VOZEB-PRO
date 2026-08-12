export const YUMENG_MODEL_CENTER_CREATE_PATH = "/kyyReactApiServer/v2/model-center/tasks";
export const YUMENG_MODEL_CENTER_QUERY_PATH = "/kyyReactApiServer/v2/model-center/tasks/:task_id";

// These IDs are the models published in the current 昱梦 V2 documentation.
// They are a documented preset, not a fallback request to an undocumented catalog endpoint.
export const YUMENG_MODEL_CENTER_MODELS = [
    { id: "seedream_5.0Pro", label: "seedream_5.0Pro", capability: "image" },
    { id: "seedream-5.0", label: "seedream-5.0", capability: "image" },
    { id: "seedance-2.5", label: "Seedance 2.5", capability: "video" },
    { id: "seedance-2.5-c2", label: "seedance-2.5-c2", capability: "video" },
    { id: "sd_2.0_fast_special", label: "sd_2.0_fast_special", capability: "video" },
    { id: "sd_2.0_special", label: "sd_2.0_special", capability: "video" },
    { id: "sd_2.0_discount", label: "sd_2.0_discount", capability: "video" },
    { id: "sd_2.0_fast_discount", label: "sd_2.0_fast_discount", capability: "video" },
    { id: "seedance_1_5_pro_1080p", label: "seedance_1_5_pro_1080p", capability: "video" },
    { id: "seedance_1_5_pro_480p", label: "seedance_1_5_pro_480p", capability: "video" },
    { id: "seedance_1_5_pro_720p", label: "seedance_1_5_pro_720p", capability: "video" },
    { id: "minimax-h3", label: "MiniMax H3 视频生成", capability: "video" },
    { id: "minimax-h3-c4", label: "MiniMax-H3-c4", capability: "video" },
    { id: "videos_stable", label: "videos_stable", capability: "video" },
    { id: "videos_stable_fast", label: "videos_stable_fast", capability: "video" },
    { id: "happyhorse-1.0-r2v", label: "HappyHorse 1.0 参考生视频", capability: "video" },
    { id: "happyhorse-1.0-i2v", label: "HappyHorse 1.0 图生视频", capability: "video" },
    { id: "happyhorse-1.0-t2v", label: "HappyHorse 1.0 文生视频", capability: "video" },
    { id: "hh-1.1-r2v-o", label: "HappyHorse 1.1 v2 参考生视频", capability: "video" },
    { id: "hh-1.1-i2v-o", label: "HappyHorse 1.1 v2 图生视频", capability: "video" },
    { id: "hh-1.1-t2v-o", label: "HappyHorse 1.1 v2 文生视频", capability: "video" },
    { id: "happyhorse-1.1-r2v", label: "HappyHorse 1.1 参考生视频", capability: "video" },
    { id: "happyhorse-1.1-i2v", label: "HappyHorse 1.1 图生视频", capability: "video" },
    { id: "happyhorse-1.1-t2v", label: "HappyHorse 1.1 文生视频", capability: "video" },
    { id: "wan2.7-r2v", label: "Wan2.7 参考生视频", capability: "video" },
    { id: "wan2.7-i2v", label: "Wan2.7 图生视频", capability: "video" },
    { id: "wan2.7-t2v", label: "Wan2.7 文生视频", capability: "video" },
    { id: "wan2.7-videoedit", label: "Wan2.7 编辑视频", capability: "video" },
    { id: "klingo3", label: "Kling O3 视频生成", capability: "video" },
] as const;
