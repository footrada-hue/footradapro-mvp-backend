/**
 * 管理员登录
 */
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/v1/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            localStorage.setItem('admin_token', result.token);
            window.location.href = '/admin/dashboard.html';
        } else {
            errorEl.textContent = '用户名或密码错误';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = '登录失败，请重试';
        errorEl.style.display = 'block';
    }
});