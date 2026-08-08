"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { cn } from "@/lib/utils";

export type CreativeResultActionContext = {
    mediaWidth: number;
    shellWidth: number;
};

export function hasMultipleCreativeResults(results: readonly unknown[]) {
    return results.length > 1;
}

export function useSelectedCreativeResult(results: CreativeAsset[]) {
    const [selectedId, setSelectedId] = useState(results[0]?.id || "");
    const selectedIndex = Math.max(
        0,
        results.findIndex((result) => result.id === selectedId),
    );
    const selectedResult = results[selectedIndex];

    useEffect(() => {
        if (!results.some((result) => result.id === selectedId)) setSelectedId(results[0]?.id || "");
    }, [results, selectedId]);

    return { selectedResult, selectedIndex, selectResult: (index: number) => setSelectedId(results[index]?.id || results[0]?.id || "") };
}

export function CreativeResultSwitcher({
    results,
    selectedIndex,
    width,
    thumbnailWidth = 76,
    renderThumbnail,
    onSelect,
}: {
    results: CreativeAsset[];
    selectedIndex: number;
    width: number;
    thumbnailWidth?: number;
    renderThumbnail: (result: CreativeAsset, index: number) => ReactNode;
    onSelect: (index: number) => void;
}) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ left: false, right: false });

    useEffect(() => {
        if (!hasMultipleCreativeResults(results)) return;
        const strip = stripRef.current;
        if (!strip) return;
        const update = () => {
            const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
            setScrollState({ left: strip.scrollLeft > 2, right: strip.scrollLeft < maxScrollLeft - 2 });
        };
        const frame = window.requestAnimationFrame(update);
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(strip);
        strip.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update, { passive: true });
        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            strip.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [results]);

    if (!hasMultipleCreativeResults(results)) return null;
    const scroll = (direction: -1 | 1) => stripRef.current?.scrollBy({ left: direction * Math.max(240, width * 0.72), behavior: "smooth" });

    return (
        <div data-testid="creative-result-switcher" data-results-count={results.length} className="mt-3 max-w-full" style={{ width: `${width}px` }}>
            <div className="mb-2 flex h-8 items-center justify-between gap-3">
                <span className="text-xs font-medium leading-5 text-[#7b8491] dark:text-[#8f99a6]">更多生成结果</span>
                {scrollState.left || scrollState.right ? (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border border-[#e4e7ec] bg-white text-[#667085] transition hover:border-[#cfd4dc] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#343a43] dark:bg-[#181b20] dark:text-[#aab2bc] dark:hover:bg-[#22262c]"
                            disabled={!scrollState.left}
                            onClick={() => scroll(-1)}
                            aria-label="查看上一组生成结果"
                        >
                            <ChevronLeft className="size-4" />
                        </button>
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border border-[#e4e7ec] bg-white text-[#667085] transition hover:border-[#cfd4dc] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#343a43] dark:bg-[#181b20] dark:text-[#aab2bc] dark:hover:bg-[#22262c]"
                            disabled={!scrollState.right}
                            onClick={() => scroll(1)}
                            aria-label="查看更多生成结果"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>
                ) : null}
            </div>
            <div ref={stripRef} className="hide-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="更多生成结果">
                {results.map((result, index) => {
                    const selected = index === selectedIndex;
                    return (
                        <button
                            key={result.id}
                            type="button"
                            className={cn(
                                "relative h-16 shrink-0 overflow-hidden rounded-lg border bg-[#f5f6f8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#615cff]/35 dark:bg-[#22262c]",
                                selected ? "border-2 border-[#615cff]" : "border-[#e4e7ec] hover:border-[#b8bdc7] dark:border-[#383e47] dark:hover:border-[#59616c]",
                            )}
                            style={{ width: `${thumbnailWidth}px` }}
                            onClick={() => onSelect(index)}
                            aria-label={`查看生成结果 ${index + 1}`}
                            aria-pressed={selected}
                        >
                            {renderThumbnail(result, index)}
                            {selected ? (
                                <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-[#615cff] text-white shadow-sm" aria-hidden>
                                    <Check className="size-3" strokeWidth={2.5} />
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
