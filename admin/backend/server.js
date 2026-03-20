const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDatabase, queryAll, queryOne, runSql } = require('./database');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'admin-secret-key-2024';

app.use(cors());
app.use(express.json());

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '未授权访问' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '令牌无效' });
    }
    req.user = user;
    next();
  });
}

function logAction(req, action, module, description) {
  try {
    runSql(
      `INSERT INTO system_logs (user_id, username, action, module, description, ip_address, user_agent, request_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id || null,
        req.user?.username || 'anonymous',
        action,
        module,
        description,
        req.ip || req.connection.remoteAddress || '',
        req.get('user-agent') || '',
        JSON.stringify(req.body || {})
      ]
    );
  } catch (e) {
    console.error('日志记录失败:', e);
  }
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = queryOne('SELECT * FROM admin_users WHERE username = ?', [username]);
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/admin/check', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.get('/api/users', authenticateToken, (req, res) => {
  try {
    const users = queryAll(`
      SELECT id, username, email, role, status, created_at, updated_at
      FROM users ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticateToken, (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const result = runSql(
      `INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)`,
      [username, hashedPassword, email, role || 'user']
    );
    
    logAction(req, 'create', 'user', `创建用户: ${username}`);
    res.json({ id: result.lastInsertRowid, message: '用户创建成功' });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: '用户名或邮箱已存在' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, status } = req.body;
    
    const fields = [];
    const values = [];
    
    if (username) { fields.push('username = ?'); values.push(username); }
    if (email) { fields.push('email = ?'); values.push(email); }
    if (role) { fields.push('role = ?'); values.push(role); }
    if (status) { fields.push('status = ?'); values.push(status); }
    
    fields.push('updated_at = datetime("now")');
    values.push(id);
    
    runSql(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    
    logAction(req, 'update', 'user', `更新用户ID: ${id}`);
    res.json({ message: '用户更新成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    runSql('DELETE FROM users WHERE id = ?', [id]);
    logAction(req, 'delete', 'user', `删除用户ID: ${id}`);
    res.json({ message: '用户删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', authenticateToken, (req, res) => {
  try {
    const projects = queryAll(`
      SELECT p.*, u.username as owner_name
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', authenticateToken, (req, res) => {
  try {
    const { name, description, user_id } = req.body;
    const result = runSql(
      `INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
      [name, description, user_id || req.user.id]
    );
    logAction(req, 'create', 'project', `创建项目: ${name}`);
    res.json({ id: result.lastInsertRowid, message: '项目创建成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/projects/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    const fields = [];
    const values = [];
    
    if (name) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (status) { fields.push('status = ?'); values.push(status); }
    
    fields.push('updated_at = datetime("now")');
    values.push(id);
    
    runSql(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
    logAction(req, 'update', 'project', `更新项目ID: ${id}`);
    res.json({ message: '项目更新成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    runSql('DELETE FROM documents WHERE project_id = ?', [id]);
    runSql('DELETE FROM projects WHERE id = ?', [id]);
    logAction(req, 'delete', 'project', `删除项目ID: ${id}`);
    res.json({ message: '项目删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/documents', authenticateToken, (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT d.*, p.name as project_name, u.username as owner_name
      FROM documents d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u ON d.user_id = u.id
    `;
    
    if (project_id) {
      sql += ' WHERE d.project_id = ?';
      const documents = queryAll(sql + ' ORDER BY d.created_at DESC', [project_id]);
      return res.json(documents);
    }
    
    const documents = queryAll(sql + ' ORDER BY d.created_at DESC');
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents', authenticateToken, (req, res) => {
  try {
    const { name, content, project_id, user_id } = req.body;
    const result = runSql(
      `INSERT INTO documents (name, content, project_id, user_id) VALUES (?, ?, ?, ?)`,
      [name, content, project_id, user_id || req.user.id]
    );
    logAction(req, 'create', 'document', `创建文档: ${name}`);
    res.json({ id: result.lastInsertRowid, message: '文档创建成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/documents/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, content, status } = req.body;
    
    const fields = [];
    const values = [];
    
    if (name) { fields.push('name = ?'); values.push(name); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (status) { fields.push('status = ?'); values.push(status); }
    
    fields.push('updated_at = datetime("now")');
    values.push(id);
    
    runSql(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, values);
    logAction(req, 'update', 'document', `更新文档ID: ${id}`);
    res.json({ message: '文档更新成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/documents/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    runSql('DELETE FROM documents WHERE id = ?', [id]);
    logAction(req, 'delete', 'document', `删除文档ID: ${id}`);
    res.json({ message: '文档删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs', authenticateToken, (req, res) => {
  try {
    const { page = 1, pageSize = 20, module, action, startDate, endDate } = req.query;
    let sql = 'SELECT * FROM system_logs WHERE 1=1';
    const params = [];
    
    if (module) {
      sql += ' AND module = ?';
      params.push(module);
    }
    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }
    
    const countSql = sql;
    const countParams = [...params];
    const { total } = queryOne(`SELECT COUNT(*) as total FROM (${countSql})`, countParams) || { total: 0 };
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    params.push(parseInt(pageSize), offset);
    
    const logs = queryAll(sql, params);
    
    res.json({ logs, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs/export', authenticateToken, (req, res) => {
  try {
    const logs = queryAll('SELECT * FROM system_logs ORDER BY created_at DESC');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authenticateToken, (req, res) => {
  try {
    const userCount = queryOne('SELECT COUNT(*) as count FROM users')?.count || 0;
    const projectCount = queryOne('SELECT COUNT(*) as count FROM projects')?.count || 0;
    const documentCount = queryOne('SELECT COUNT(*) as count FROM documents')?.count || 0;
    const logCount = queryOne('SELECT COUNT(*) as count FROM system_logs')?.count || 0;
    
    const recentLogs = queryAll(`SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10`);
    
    res.json({
      userCount,
      projectCount,
      documentCount,
      logCount,
      recentLogs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  try {
    await initDatabase();
    
    const defaultAdminPassword = bcrypt.hashSync('admin123', 10);
    try {
      runSql(
        `INSERT OR IGNORE INTO admin_users (username, password, email, role) VALUES (?, ?, ?, ?)`,
        ['admin', defaultAdminPassword, 'admin@example.com', 'admin']
      );
    } catch (e) {
      console.log('Admin user already exists');
    }
    
    app.listen(PORT, () => {
      console.log(`后台管理系统API运行在 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('启动失败:', error);
  }
}

startServer();
