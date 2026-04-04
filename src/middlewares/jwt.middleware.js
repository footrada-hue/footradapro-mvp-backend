import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'footradapro-jwt-secret-key-2024';

// 生成 JWT token
export const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            uid: user.uid, 
            username: user.username, 
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// 验证 JWT token（从 Cookie 读取）
export const authJWT = (req, res, next) => {
    const token = req.cookies.footradapro_token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'UNAUTHORIZED',
            message: 'No token provided'
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(401).json({ 
            success: false, 
            error: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
        });
    }
};

// 可选认证（不强制）
export const optionalAuthJWT = (req, res, next) => {
    const token = req.cookies.footradapro_token;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            req.userId = decoded.id;
        } catch (err) {
            // token 无效，忽略
        }
    }
    next();
};