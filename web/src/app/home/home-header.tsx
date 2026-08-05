"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

import { SiteLogo } from "@/components/layout/site-logo";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useThemeStore } from "@/stores/use-theme-store";
import { HOME_NAVIGATION } from "./home-data";
import { useHomeActions } from "./home-actions";
import styles from "./home.module.css";

export function HomeHeader() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { authenticated, site, openLogin, openProtectedPath } = useHomeActions();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);

    const activate = (href: string, protectedPath: boolean) => {
        setMobileOpen(false);
        if (protectedPath) openProtectedPath(href);
    };

    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <Link href="/" className={styles.brand} aria-label={`${site.title} 首页`}>
                    <SiteLogo logoUrl={site.logoUrl} className={styles.brandLogo} />
                    <span>{site.title || "VOZEB PRO"}</span>
                </Link>

                <nav className={styles.desktopNav} aria-label="官网主导航">
                    {HOME_NAVIGATION.map((item) =>
                        item.protected ? (
                            <button key={item.href} type="button" className={styles.navLink} onClick={() => activate(item.href, true)}>
                                {item.label}
                            </button>
                        ) : (
                            <Link key={item.href} href={item.href} className={styles.navLink}>
                                {item.label}
                            </Link>
                        ),
                    )}
                </nav>

                <div className={styles.headerActions}>
                    <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={styles.themeButton} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
                    <button type="button" className={styles.primarySmallButton} onClick={() => (authenticated ? openProtectedPath("/create") : openLogin("/create"))}>
                        {authenticated ? "进入工作台" : "立即体验"} <ArrowRight aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.mobileMenuButton} onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-controls="home-mobile-menu" aria-label={mobileOpen ? "关闭导航菜单" : "打开导航菜单"}>
                        {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                    </button>
                </div>
            </div>

            {mobileOpen ? (
                <nav id="home-mobile-menu" className={styles.mobileNav} aria-label="移动端导航">
                    {HOME_NAVIGATION.map((item) =>
                        item.protected ? (
                            <button key={item.href} type="button" onClick={() => activate(item.href, true)}>
                                {item.label}
                                <ArrowRight aria-hidden="true" />
                            </button>
                        ) : (
                            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                                {item.label}
                                <ArrowRight aria-hidden="true" />
                            </Link>
                        ),
                    )}
                </nav>
            ) : null}
        </header>
    );
}
