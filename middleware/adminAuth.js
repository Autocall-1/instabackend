const { verifyToken, getUserById } = require('../services/firebase');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = await verifyToken(token);
    const user    = await getUserById(decoded.uid);
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });
    req.user  = decoded;
    req.admin = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
