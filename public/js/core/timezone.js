/**
 * FOOTRADAPRO - 国际化时间处理工具
 * @description 支持自动检测用户时区，统一显示本地时间，面向全球用户
 * @version 3.0.0
 * @since 2026-03-28
 * 
 * i18n标记格式: // i18n: "key" - 用于后续多语言转换
 */

const TimezoneManager = (function() {
    'use strict';
    
    // 用户选择的时区（默认自动检测）
    let userTimezoneOffset = null;
    
    /**
     * 获取当前生效的时区偏移（分钟）
     * 优先使用用户手动设置的时区，否则使用浏览器时区
     */
    function getEffectiveOffset() {
        if (userTimezoneOffset !== null) {
            return userTimezoneOffset;
        }
        return -new Date().getTimezoneOffset();
    }
    
    /**
     * 获取用户本地时区偏移（分钟）- 自动检测
     */
    function getLocalTimezoneOffset() {
        return -new Date().getTimezoneOffset();
    }
    
    /**
     * 格式化比赛时间（用户本地时区）
     * @param {string} utcString - UTC 时间字符串，如 "2026-03-26T20:00:00Z"
     * @param {string} format - 格式: 'full' | 'date' | 'time' | 'short'
     * @returns {string} 本地化时间字符串
     */
    function formatMatchTime(utcString, format = 'short') {
        if (!utcString) return 'TBD'; // i18n: "time.tbd"
        
        try {
            const date = new Date(utcString);
            if (isNaN(date.getTime())) return 'Invalid Date'; // i18n: "time.invalid"
            
            switch (format) {
                case 'date':
                    return date.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                case 'time':
                    return date.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                case 'short':
                    return date.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                case 'full':
                default:
                    return date.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                        timeZoneName: 'short'
                    });
            }
        } catch (e) {
            return utcString;
        }
    }
    
    /**
     * 获取比赛的本地日期（用于筛选）
     * @param {string} utcString - UTC 时间字符串
     * @returns {string} 本地日期 YYYY-MM-DD
     */
    function getLocalDate(utcString) {
        const date = new Date(utcString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    /**
     * 判断比赛是否在今天（用户本地时区）
     * @param {string} utcString - UTC 时间字符串
     * @returns {boolean}
     */
    function isToday(utcString) {
        const matchDate = new Date(utcString);
        const now = new Date();
        return matchDate.getDate() === now.getDate() &&
               matchDate.getMonth() === now.getMonth() &&
               matchDate.getFullYear() === now.getFullYear();
    }
    
    /**
     * 判断比赛是否在明天（用户本地时区）
     */
    function isTomorrow(utcString) {
        const matchDate = new Date(utcString);
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        return matchDate.getDate() === tomorrow.getDate() &&
               matchDate.getMonth() === tomorrow.getMonth() &&
               matchDate.getFullYear() === tomorrow.getFullYear();
    }
    
    /**
     * 判断比赛是否在本周内（用户本地时区）
     */
    function isThisWeek(utcString) {
        const matchDate = new Date(utcString);
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return matchDate >= weekStart && matchDate < weekEnd;
    }
    
    /**
     * 获取用户时区信息
     */
    function getUserTimezoneInfo() {
        const offset = getEffectiveOffset();
        const sign = offset >= 0 ? '+' : '-';
        const hours = Math.floor(Math.abs(offset) / 60);
        const minutes = Math.abs(offset) % 60;
        const offsetStr = `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        return {
            offset: offset,
            offsetString: `UTC${offsetStr}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleString(),
            isManual: userTimezoneOffset !== null
        };
    }
    
    /**
     * 手动设置时区（用于用户偏好）
     * @param {number} offsetMinutes - 时区偏移分钟数，如 480 表示 UTC+8
     */
    function setUserTimezone(offsetMinutes) {
        userTimezoneOffset = offsetMinutes;
        localStorage.setItem('user_timezone_offset', offsetMinutes);
        
        // 触发时区变更事件
        window.dispatchEvent(new CustomEvent('timezoneChanged', { 
            detail: { offset: offsetMinutes, isManual: true }
        }));
    }
    
    /**
     * 重置为自动检测时区
     */
    function resetToAuto() {
        userTimezoneOffset = null;
        localStorage.removeItem('user_timezone_offset');
        
        // 触发时区变更事件
        window.dispatchEvent(new CustomEvent('timezoneChanged', { 
            detail: { offset: getLocalTimezoneOffset(), isManual: false }
        }));
    }
    
    /**
     * 加载用户保存的时区偏好
     */
    function loadUserTimezonePreference() {
        const saved = localStorage.getItem('user_timezone_offset');
        if (saved !== null) {
            userTimezoneOffset = parseInt(saved);
        }
        return userTimezoneOffset;
    }
    
    /**
     * 初始化时区切换器（需要在 DOM 加载后调用）
     */
    function initTimezoneSwitcher() {
        const switcher = document.getElementById('timezoneSwitcher');
        const trigger = document.getElementById('timezoneTrigger');
        const dropdown = document.getElementById('timezoneDropdown');
        const currentLabel = document.getElementById('currentTimezoneLabel');
        
        if (!switcher || !trigger) return;
        
        // 更新当前时区显示
        function updateTimezoneLabel() {
            if (currentLabel) {
                const saved = localStorage.getItem('user_timezone_offset');
                if (saved !== null) {
                    const offset = parseInt(saved);
                    const sign = offset >= 0 ? '+' : '-';
                    const hours = Math.floor(Math.abs(offset) / 60);
                    currentLabel.textContent = `UTC${sign}${hours}`;
                } else {
                    const info = getUserTimezoneInfo();
                    currentLabel.textContent = `Auto (${info.offsetString})`;
                }
            }
        }
        
        // 切换下拉菜单
        trigger.onclick = (e) => {
            e.stopPropagation();
            switcher.classList.toggle('open');
        };
        
        // 点击其他地方关闭
        document.addEventListener('click', (e) => {
            if (!switcher.contains(e.target)) {
                switcher.classList.remove('open');
            }
        });
        
        // 时区选项点击事件
        document.querySelectorAll('.dropdown-option').forEach(option => {
            option.onclick = (e) => {
                e.stopPropagation();
                const tzValue = option.dataset.tz;
                
                // 移除所有 active 类
                document.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                if (tzValue === 'auto') {
                    resetToAuto();
                } else {
                    // 解析时区偏移，如 "UTC+8" -> 480 分钟
                    const match = tzValue.match(/UTC([+-])(\d+)/);
                    if (match) {
                        const sign = match[1] === '+' ? 1 : -1;
                        const hours = parseInt(match[2]);
                        const offsetMinutes = sign * hours * 60;
                        setUserTimezone(offsetMinutes);
                    }
                }
                
                updateTimezoneLabel();
                switcher.classList.remove('open');
            };
            
            // 高亮当前选中的时区
            const saved = localStorage.getItem('user_timezone_offset');
            if (saved === null && option.dataset.tz === 'auto') {
                option.classList.add('active');
            } else if (saved !== null) {
                const offset = parseInt(saved);
                const sign = offset >= 0 ? '+' : '-';
                const hours = Math.floor(Math.abs(offset) / 60);
                const tzString = `UTC${sign}${hours}`;
                if (option.dataset.tz === tzString) {
                    option.classList.add('active');
                }
            }
        });
        
        updateTimezoneLabel();
    }
    
    // ==================== 兼容旧版 time.js API ====================
    
    /**
     * 智能时间格式化（根据时间长短自动选择）
     * @param {string|Date} dateInput - 日期字符串或Date对象
     * @returns {string} 格式化后的时间字符串
     */
    function format(dateInput) {
        if (!dateInput) return '-';
        
        let date;
        try {
            date = new Date(dateInput);
            if (isNaN(date.getTime())) return '-';
        } catch (e) {
            return '-';
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now'; // i18n: "time.just_now"
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`; // i18n: "time.minutes_ago"
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`; // i18n: "time.hours_ago"
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`; // i18n: "time.days_ago"
        
        return formatMatchTime(dateInput, 'full');
    }
    
    /**
     * 格式化完整日期时间（用户本地时区）
     */
    function formatFull(dateInput) {
        return formatMatchTime(dateInput, 'full');
    }
    
    /**
     * 格式化简短日期（不包含时间）
     */
    function formatShortDate(dateInput) {
        if (!dateInput) return '-';
        try {
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return '-';
        }
    }
    
    /**
     * 获取当前时间的 ISO 字符串
     */
    function getNowISO() {
        return new Date().toISOString();
    }
    
    /**
     * 判断是否为昨天
     */
    function isYesterday(dateInput) {
        if (!dateInput) return false;
        try {
            const date = new Date(dateInput);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return date.toDateString() === yesterday.toDateString();
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 获取时区缩写
     */
    function getTimeZoneAbbr() {
        try {
            return new Date().toLocaleTimeString('en-US', { 
                timeZoneName: 'short' 
            }).split(' ')[2] || 'UTC';
        } catch (e) {
            return 'UTC';
        }
    }
    
    /**
     * 格式化 UTC 时间
     */
    function formatUTC(dateInput) {
        if (!dateInput) return '-';
        try {
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'UTC'
            }) + ' UTC';
        } catch (e) {
            return '-';
        }
    }
    
    // 加载保存的时区偏好
    loadUserTimezonePreference();
    
    // 公开 API
    return {
        // 新版 API
        formatMatchTime,
        getLocalDate,
        isToday,
        isTomorrow,
        isThisWeek,
        getUserTimezoneInfo,
        setUserTimezone,
        resetToAuto,
        loadUserTimezonePreference,
        getLocalTimezoneOffset,
        getEffectiveOffset,
        initTimezoneSwitcher,
        // 兼容旧版 API
        format,
        formatFull,
        formatShortDate,
        getNowISO,
        isYesterday,
        getTimeZoneAbbr,
        formatUTC
    };
})();

// 导出到全局（兼容两种命名方式）
window.FOOTRADA_TIMEZONE = TimezoneManager;
window.FOOTRADAPRO_TIME = TimezoneManager; // 兼容旧版 time.js 的命名

// 页面加载完成后自动初始化时区切换器（如果存在）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('timezoneSwitcher')) {
            TimezoneManager.initTimezoneSwitcher();
        }
    });
} else {
    if (document.getElementById('timezoneSwitcher')) {
        TimezoneManager.initTimezoneSwitcher();
    }
}

console.log('✅ Global time utility loaded (Timezone enabled)');