// /src/config/permissions.js

// 权限定义
export const PERMISSIONS = {
    // 用户管理
    'users.view': '查看用户列表',
    'users.detail': '查看用户详情',
    'users.edit': '编辑用户信息',
    'users.toggle': '启用/禁用用户',
    
    // 财务管理
    'finance.view': '查看财务记录',
    'finance.adjust': '手动调整余额',
    
    // 比赛管理
    'matches.view': '查看比赛',
    'matches.create': '创建比赛',
    'matches.edit': '编辑比赛',
    'matches.settle': '结算比赛',
    
    // 报告管理
    'reports.view': '查看报告',
    'reports.edit': '编辑报告',
    'reports.publish': '发布报告',
    
    // 管理员管理
    'admins.view': '查看管理员列表',
    'admins.create': '创建管理员',
    'admins.edit': '编辑管理员',
    
    // 系统设置
    'system.config': '系统配置',
    'system.logs': '查看日志'
};

// 角色权限映射
export const ROLES = {
    super_admin: {
        name: '超级管理员',
        permissions: Object.keys(PERMISSIONS) // 所有权限
    },
    admin: {
        name: '管理员',
        permissions: [
            'users.view', 'users.detail', 'users.edit', 'users.toggle',
            'finance.view', 'finance.adjust',
            'matches.view', 'matches.create', 'matches.edit', 'matches.settle',
            'reports.view', 'reports.edit', 'reports.publish'
        ]
    },
    operator: {
        name: '运营人员',
        permissions: [
            'users.view', 'users.detail',
            'matches.view',
            'reports.view'
        ]
    },
    auditor: {
        name: '审计员',
        permissions: [
            'users.view',
            'finance.view',
            'matches.view',
            'reports.view',
            'system.logs'
        ]
    }
};

// 根据角色获取权限列表
export function getPermissionsByRole(role) {
    return ROLES[role]?.permissions || [];
}