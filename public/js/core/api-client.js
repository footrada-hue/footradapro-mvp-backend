/**
 * FOOTRADAPRO - Unified API Client
 * @version 2.0.0
 */

const APIClient = (function() {
    'use strict';
    
    const TOKEN_COOKIE_NAME = 'footradapro_token';
    
    function getToken() {
        const match = document.cookie.match(new RegExp('(^| )' + TOKEN_COOKIE_NAME + '=([^;]+)'));
        const token = match ? match[2] : null;
        if (token) {
            console.log('[APIClient] Token found in cookie');
        } else {
            console.log('[APIClient] No token in cookie');
        }
        return token;
    }
    
    function getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }
    
    async function request(url, options = {}) {
        const config = {
            method: 'GET',
            credentials: 'include',
            ...options,
            headers: {
                ...getHeaders(),
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, config);
            if (response.status === 401) {
                console.warn(`[APIClient] Unauthorized: ${url}`);
            }
            return response;
        } catch (error) {
            console.error(`[APIClient] Request failed: ${url}`, error);
            throw error;
        }
    }
    
    async function get(url) {
        return request(url, { method: 'GET' });
    }
    
    async function post(url, body) {
        return request(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }
    
    async function put(url, body) {
        return request(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }
    
    async function del(url) {
        return request(url, { method: 'DELETE' });
    }
    
    return {
        get,
        post,
        put,
        delete: del,
        getToken,
        TOKEN_COOKIE_NAME
    };
})();

window.APIClient = APIClient;