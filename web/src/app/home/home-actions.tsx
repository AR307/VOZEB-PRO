"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Modal } from "antd";
import { useRouter } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { createAgentPromptHref } from "@/lib/create-agent-prompt";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useUserStore } from "@/stores/use-user-store";
import type { HomeSiteSettings } from "./home-data";

type HomeActions = {
    authenticated: boolean;
    sessionReady: boolean;
    site: HomeSiteSettings;
    openLogin: (nextPath?: string) => void;
    openProtectedPath: (path: string) => void;
    startCreating: (prompt?: string) => void;
};

const HomeActionsContext = createContext<HomeActions | null>(null);

export function HomeActionsProvider({ initialSite, children }: { initialSite: HomeSiteSettings; children: ReactNode }) {
    const router = useRouter();
    const [authOpen, setAuthOpen] = useState(false);
    const [authNextPath, setAuthNextPath] = useState("/create");
    const user = useUserStore((state) => state.user);
    const session = usePublicSessionStore((state) => state.payload);
    const sessionReady = usePublicSessionStore((state) => state.ready);
    const sessionSite = session?.settings?.site;
    const site = useMemo<HomeSiteSettings>(
        () => ({
            ...initialSite,
            ...(sessionSite || {}),
            title: sessionSite?.title?.trim() || initialSite.title.trim() || "VOZEB PRO",
            logoUrl: sessionSite?.logoUrl?.trim() || initialSite.logoUrl || "/logo.svg",
            friendLinks: sessionSite?.friendLinks || initialSite.friendLinks,
            socials: (sessionSite?.socials as HomeSiteSettings["socials"] | undefined) || initialSite.socials,
        }),
        [initialSite, sessionSite],
    );
    const authenticated = sessionReady && Boolean(user);

    const openLogin = (nextPath = "/create") => {
        setAuthNextPath(nextPath);
        setAuthOpen(true);
    };
    const openProtectedPath = (path: string) => {
        if (authenticated) router.push(path);
        else openLogin(path);
    };
    const startCreating = (prompt = "") => openProtectedPath(createAgentPromptHref(prompt));

    return (
        <HomeActionsContext.Provider value={{ authenticated, sessionReady, site, openLogin, openProtectedPath, startCreating }}>
            {children}
            <Modal centered open={authOpen} width="min(94vw, 520px)" footer={null} title={null} destroyOnHidden onCancel={() => setAuthOpen(false)} styles={{ container: { padding: 0, overflow: "hidden" }, body: { padding: 0 } }}>
                <AuthForm
                    mode="login"
                    variant="embedded"
                    nextPath={authNextPath}
                    className="min-h-0 bg-transparent p-0 shadow-none"
                    headerSlot={<div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">登录后将继续刚才的创作操作，输入内容不会丢失。</div>}
                />
            </Modal>
        </HomeActionsContext.Provider>
    );
}

export function useHomeActions() {
    const value = useContext(HomeActionsContext);
    if (!value) throw new Error("useHomeActions must be used within HomeActionsProvider");
    return value;
}
