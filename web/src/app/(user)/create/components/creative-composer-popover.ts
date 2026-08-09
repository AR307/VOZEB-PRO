import { useEffect, useState } from "react";

export type CreativeComposerPopoverPlacement = "topLeft" | "bottomLeft" | "top" | "bottom";

const horizontalViewportOverflow = { adjustX: 1, adjustY: 0 } as const;

export function resolveCreativeComposerPopoverPlacement(placement: "topLeft" | "bottomLeft", narrowViewport: boolean): CreativeComposerPopoverPlacement {
    if (!narrowViewport) return placement;
    return placement === "bottomLeft" ? "bottom" : "top";
}

export function creativeComposerPopoverOverflow(placement: CreativeComposerPopoverPlacement) {
    return placement === "top" || placement === "bottom" ? horizontalViewportOverflow : false;
}

export function useCreativeComposerPopoverPlacement(placement: "topLeft" | "bottomLeft") {
    const [narrowViewport, setNarrowViewport] = useState(false);

    useEffect(() => {
        const media = window.matchMedia("(max-width: 640px)");
        const update = () => setNarrowViewport(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return resolveCreativeComposerPopoverPlacement(placement, narrowViewport);
}
