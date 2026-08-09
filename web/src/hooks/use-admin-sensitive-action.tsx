"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Input, Modal } from "antd";
import { KeyRound, ShieldCheck } from "lucide-react";

import type { AdminSensitiveActionOptions, AdminSensitiveActionProof } from "@/lib/admin-sensitive-action";
import { useUserStore } from "@/stores/use-user-store";

type PendingRequest = {
    resolve: (proof: AdminSensitiveActionProof | null) => void;
};

export function useAdminSensitiveAction() {
    const mfaEnabled = useUserStore((state) => state.user?.mfaEnabled === true);
    const [form] = Form.useForm<AdminSensitiveActionProof>();
    const pendingRef = useRef<PendingRequest | null>(null);
    const [options, setOptions] = useState<AdminSensitiveActionOptions | null>(null);

    const close = useCallback(
        (proof: AdminSensitiveActionProof | null) => {
            const pending = pendingRef.current;
            pendingRef.current = null;
            setOptions(null);
            form.resetFields();
            pending?.resolve(proof);
        },
        [form],
    );

    useEffect(
        () => () => {
            pendingRef.current?.resolve(null);
            pendingRef.current = null;
            form.resetFields();
        },
        [form],
    );

    const requestSensitiveAction = useCallback(
        (nextOptions: AdminSensitiveActionOptions) => {
            pendingRef.current?.resolve(null);
            form.resetFields();
            setOptions(nextOptions);
            return new Promise<AdminSensitiveActionProof | null>((resolve) => {
                pendingRef.current = { resolve };
            });
        },
        [form],
    );

    const confirm = useCallback(async () => {
        const value = await form.validateFields().catch(() => null);
        if (!value) return;
        close({
            currentPassword: value.currentPassword,
            ...(mfaEnabled ? { totpCode: value.totpCode } : {}),
        });
    }, [close, form, mfaEnabled]);

    const sensitiveActionModal = (
        <Modal
            title={options?.title || "身份复核"}
            open={Boolean(options)}
            centered
            destroyOnHidden
            mask={{ closable: false }}
            closable={{ "aria-label": "关闭身份复核" }}
            onCancel={() => close(null)}
            footer={[
                <Button key="cancel" onClick={() => close(null)}>
                    取消
                </Button>,
                <Button key="confirm" type="primary" danger={options?.danger} icon={<ShieldCheck className="size-4" />} onClick={() => void confirm()}>
                    {options?.confirmText || "确认"}
                </Button>,
            ]}
        >
            <div className="space-y-4 pt-1">
                <div className="flex gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300">
                    <KeyRound className="mt-0.5 size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                    <span>{options?.description}</span>
                </div>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
                        <Input.Password autoFocus autoComplete="current-password" placeholder="输入当前管理员密码" />
                    </Form.Item>
                    {mfaEnabled ? (
                        <Form.Item name="totpCode" label="动态验证码" rules={[{ required: true, message: "请输入动态验证码" }]} className="mb-0">
                            <Input autoComplete="one-time-code" inputMode="numeric" placeholder="输入身份验证器动态码" />
                        </Form.Item>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );

    return { requestSensitiveAction, sensitiveActionModal };
}
