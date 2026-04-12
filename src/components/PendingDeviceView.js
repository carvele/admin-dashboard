import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, MonitorSmartphone, XCircle } from 'lucide-react';
const PendingDeviceView = () => {
    const { deviceStatus, deviceFingerprint, logout, isAdminUnlocked } = useAuth();
    // If the owner has successfully used their role to bypass
    if (isAdminUnlocked) {
        return null;
    }
    return (_jsx("div", { className: "flex-center", style: { minHeight: '100vh', backgroundColor: 'var(--cream)', padding: '2rem' }, children: _jsxs("div", { className: "card text-center", style: { maxWidth: 480, width: '100%', padding: '3rem 2rem' }, children: [deviceStatus === 'revoked' ? (_jsx("div", { className: "mb-4 text-danger", children: _jsx(XCircle, { size: 64, style: { margin: '0 auto' } }) })) : (_jsx("div", { className: "mb-4", style: { color: 'var(--charcoal)' }, children: _jsx(Shield, { size: 64, style: { margin: '0 auto' } }) })), _jsx("h1", { className: "mb-2 text-2xl", style: { color: 'var(--charcoal)' }, children: deviceStatus === 'revoked' ? 'Device Access Revoked' : 'Device Pending Approval' }), _jsx("p", { className: "text-secondary mb-4 line-height-relaxed", children: deviceStatus === 'revoked'
                        ? 'This device has been permanently blocked by an administrator from accessing the dashboard.'
                        : 'To ensure system security, all devices must be explicitly approved before accessing JezSy Collection data.' }), _jsxs("div", { className: "mb-6 p-4 rounded bg-white text-left shadow-sm border", children: [_jsx("p", { className: "text-sm text-secondary font-medium mb-1", children: "Your Device ID" }), _jsxs("div", { className: "flex-between align-center", children: [_jsx("code", { className: "text-lg", style: { color: 'var(--accent)' }, children: deviceFingerprint || 'Loading...' }), _jsx(MonitorSmartphone, { size: 20, className: "text-secondary" })] })] }), _jsx("div", { className: "flex gap-3 justify-center", children: _jsx("button", { className: "btn-outline flex-1", onClick: logout, children: "Sign Out" }) })] }) }));
};
export default PendingDeviceView;
