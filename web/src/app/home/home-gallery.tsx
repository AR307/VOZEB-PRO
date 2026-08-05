"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GalleryVerticalEnd, Heart, ImageOff, Music2, Play, RotateCw } from "lucide-react";

import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { userAvatarFallback } from "@/lib/user-avatar";
import { listPublicGallery, type PublicGalleryItem } from "@/services/api/work-governance";
import { HOME_GALLERY_TABS, homeGalleryMatches, homeGalleryTypeLabel, type HomeGalleryTab } from "./home-data";
import styles from "./home.module.css";

export function HomeGallery() {
    const [tab, setTab] = useState<HomeGalleryTab>("all");
    const query = useQuery({
        queryKey: ["home-public-gallery"],
        queryFn: () => listPublicGallery({ limit: 18, sort: "latest" }),
        staleTime: 60_000,
    });
    const items = (query.data?.items || []).filter((item) => homeGalleryMatches(item, tab)).slice(0, 6);

    return (
        <section id="inspiration" className={styles.section} aria-labelledby="home-gallery-title">
            <header className={styles.sectionHeading}>
                <h2 id="home-gallery-title">灵感作品展示</h2>
                <p>探索创作者的优秀作品，激发你的创作灵感</p>
            </header>

            <div className={styles.galleryTabs} role="tablist" aria-label="作品分类">
                {HOME_GALLERY_TABS.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls="home-gallery-panel" className={tab === item.id ? styles.galleryTabActive : undefined} onClick={() => setTab(item.id)}>
                        {item.label}
                    </button>
                ))}
            </div>

            <div id="home-gallery-panel" role="tabpanel" className={styles.galleryPanel}>
                {query.isLoading ? (
                    <div className={styles.galleryGrid} aria-label="正在加载公开作品">
                        {Array.from({ length: 6 }, (_, index) => (
                            <GallerySkeleton key={index} />
                        ))}
                    </div>
                ) : query.isError ? (
                    <GalleryState
                        icon={<RotateCw aria-hidden="true" />}
                        title="作品暂时无法加载"
                        description={query.error instanceof Error ? query.error.message : "请稍后重试"}
                        action={
                            <button type="button" onClick={() => void query.refetch()}>
                                重新加载
                            </button>
                        }
                    />
                ) : items.length ? (
                    <div className={styles.galleryGrid} data-testid="home-public-gallery">
                        {items.map((item) => (
                            <HomeWorkCard key={item.slug} item={item} />
                        ))}
                    </div>
                ) : (
                    <GalleryState
                        icon={<GalleryVerticalEnd aria-hidden="true" />}
                        title={tab === "all" ? "还没有公开作品" : "该分类暂无公开作品"}
                        description={tab === "all" ? "审核通过并公开发布的作品会出现在这里。" : "切换其他分类，探索更多创作灵感。"}
                    />
                )}
            </div>

            <div className={styles.galleryMore}>
                <Link href="/gallery">
                    查看更多作品 <ArrowRight aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}

function HomeWorkCard({ item }: { item: PublicGalleryItem }) {
    const [mediaFailed, setMediaFailed] = useState(false);
    const [duration, setDuration] = useState(0);
    const preview = item.preview;
    const authorName = item.authorName || "匿名作者";

    return (
        <article className={styles.workCard}>
            <Link href={`/share/${encodeURIComponent(item.slug)}`} className={styles.workMedia} aria-label={`查看作品：${item.title}`}>
                {mediaFailed || !preview ? (
                    <span className={styles.mediaFallback} role="img" aria-label="作品预览不可用">
                        <ImageOff aria-hidden="true" />
                        <span>预览不可用</span>
                    </span>
                ) : preview.mediaType === "image" ? (
                    <LazyMediaImage src={imagePreviewUrl(preview.url, 640)} alt={item.title} containerClassName={styles.workImageWrap} imageClassName={styles.workImage} errorLabel="作品图片不可用" />
                ) : preview.mediaType === "video" ? (
                    <video src={preview.url} muted playsInline preload="metadata" className={styles.workImage} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onError={() => setMediaFailed(true)} />
                ) : (
                    <span className={styles.audioWave} aria-label="音频作品">
                        <Music2 aria-hidden="true" />
                        {Array.from({ length: 19 }, (_, index) => (
                            <i key={index} style={{ height: `${24 + ((index * 17) % 58)}%` }} />
                        ))}
                    </span>
                )}
                <span className={styles.workType}>{homeGalleryTypeLabel(item)}</span>
                {preview?.mediaType === "video" ? (
                    <span className={styles.playIcon}>
                        <Play aria-hidden="true" fill="currentColor" />
                    </span>
                ) : null}
                {preview?.mediaType === "video" && duration > 0 ? <span className={styles.duration}>{formatDuration(duration)}</span> : null}
            </Link>
            <div className={styles.workBody}>
                <Link href={`/share/${encodeURIComponent(item.slug)}`} className={styles.workTitle}>
                    {item.title}
                </Link>
                <div className={styles.workMeta}>
                    <span className={styles.author}>
                        <span>{item.authorAvatarUrl ? <img src={item.authorAvatarUrl} alt="" loading="lazy" /> : userAvatarFallback(authorName)}</span>
                        <span>{authorName}</span>
                    </span>
                    <span className={styles.likeCount}>
                        <Heart aria-hidden="true" />
                        {formatCount(item.likeCount)}
                    </span>
                </div>
            </div>
        </article>
    );
}

function GallerySkeleton() {
    return (
        <div className={styles.gallerySkeleton}>
            <span />
            <i />
            <i />
        </div>
    );
}

function GalleryState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
    return (
        <div className={styles.galleryState}>
            <span>{icon}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            {action}
        </div>
    );
}

function formatDuration(seconds: number) {
    const safe = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function formatCount(value: number) {
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}
