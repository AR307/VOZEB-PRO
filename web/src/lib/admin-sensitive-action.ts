export type AdminSensitiveActionProof = {
    currentPassword: string;
    totpCode?: string;
};

export type AdminSensitiveActionOptions = {
    title: string;
    description: string;
    confirmText: string;
    danger?: boolean;
};

export type AdminSensitiveActionRequest = (options: AdminSensitiveActionOptions) => Promise<AdminSensitiveActionProof | null>;
