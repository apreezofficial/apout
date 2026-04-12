import mysql from 'mysql2/promise';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export let pool;

export async function initDB() {
    try {
        const connectionConfig = {
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
        };

        const tmp = await mysql.createConnection(connectionConfig);
        await tmp.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'apout_db'}`);
        await tmp.end();

        pool = mysql.createPool({ 
            ...connectionConfig, 
            database: process.env.DB_NAME || 'apout_db', 
            waitForConnections: true, 
             connectionLimit: 10 
        });

        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255), token VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS oauth_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, provider VARCHAR(50) NOT NULL,
            provider_id VARCHAR(255) NOT NULL, email VARCHAR(255),
            UNIQUE KEY uniq_provider (provider, provider_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS organizations (
            id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE NOT NULL,
            created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS organization_members (
            org_id INT, user_id INT, role VARCHAR(50) DEFAULT 'member',
            PRIMARY KEY (org_id, user_id),
            FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS tunnels (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, org_id INT, subdomain VARCHAR(255) UNIQUE,
            local_port INT, status VARCHAR(50) DEFAULT 'offline', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS subdomains (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, org_id INT, name VARCHAR(255) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS domains (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, org_id INT, domain VARCHAR(255) UNIQUE,
            verified TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS api_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, name VARCHAR(255), token_value VARCHAR(255) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS organization_invites (
            id INT AUTO_INCREMENT PRIMARY KEY, org_id INT, user_id INT, role VARCHAR(50) DEFAULT 'member',
            invited_by INT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        await pool.query(`CREATE TABLE IF NOT EXISTS request_logs (
            id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, tunnel VARCHAR(255), method VARCHAR(10),
            path TEXT, status INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);

        console.log('✅ DB ready.');
    } catch(e) { console.error('❌ DB init error:', e.message); }
}

async function createPersonalOrg(userId, username) {
    const orgName = `${username}'s Org`;
    const slug = username.toLowerCase().replace(/[^a-z0-9]/g,'-') + '-' + crypto.randomBytes(2).toString('hex');
    const [r] = await pool.query('INSERT INTO organizations (name,slug,created_by) VALUES(?,?,?)',[orgName,slug,userId]);
    await pool.query('INSERT INTO organization_members (org_id,user_id,role) VALUES(?,?,?)',[r.insertId,userId,'owner']);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function authenticate(username, password) {
    if(!pool) return null;
    const [r] = await pool.query('SELECT * FROM users WHERE username=? AND password=?',[username,password]);
    return r[0]??null;
}
export async function createUser(username, password) {
    if(!pool) return null;
    const [e] = await pool.query('SELECT id FROM users WHERE username=?',[username]);
    if(e.length>0) return null;
    const token='ap_'+crypto.randomBytes(16).toString('hex');
    try {
        const [r] = await pool.query('INSERT INTO users (username,password,token) VALUES(?,?,?)',[username,password,token]);
        await createPersonalOrg(r.insertId, username);
        const [u] = await pool.query('SELECT * FROM users WHERE id=?',[r.insertId]);
        return u[0];
    } catch(e){return null;}
}
export async function findOrCreateOAuthUser({provider,providerId,username,email}) {
    if(!pool) return null;
    const [ex] = await pool.query('SELECT u.* FROM users u JOIN oauth_accounts oa ON u.id=oa.user_id WHERE oa.provider=? AND oa.provider_id=?',[provider,providerId]);
    if(ex.length>0) return ex[0];
    let safe=(username||'user').replace(/[^a-zA-Z0-9_]/g,'_').substring(0,30);
    const [d]=await pool.query('SELECT id FROM users WHERE username=?',[safe]);
    if(d.length>0) safe+='_'+crypto.randomBytes(2).toString('hex');
    const token='ap_'+crypto.randomBytes(16).toString('hex');
    const [r]=await pool.query('INSERT INTO users (username,token) VALUES(?,?)',[safe,token]);
    await pool.query('INSERT INTO oauth_accounts (user_id,provider,provider_id,email) VALUES(?,?,?,?)',[r.insertId,provider,providerId,email]);
    await createPersonalOrg(r.insertId,safe);
    const [u]=await pool.query('SELECT * FROM users WHERE id=?',[r.insertId]);
    return u[0];
}

// ── Organizations ─────────────────────────────────────────────────────────────
export async function getUserOrganizations(userId) {
    if(!pool) return [];
    const [r]=await pool.query('SELECT o.*,om.role FROM organizations o JOIN organization_members om ON o.id=om.org_id WHERE om.user_id=?',[userId]);
    return r;
}
export async function createOrganization(name, slug, userId) {
    if(!pool) return false;
    try {
        const [r]=await pool.query('INSERT INTO organizations (name,slug,created_by) VALUES(?,?,?)',[name,slug,userId]);
        await pool.query('INSERT INTO organization_members (org_id,user_id,role) VALUES(?,?,?)',[r.insertId,userId,'owner']);
        return true;
    } catch(e){return false;}
}
export async function getOrgBySlug(slug) {
    if(!pool) return null;
    const [r]=await pool.query('SELECT * FROM organizations WHERE slug=?',[slug]);
    return r[0]??null;
}
export async function updateOrgName(orgId,name){
    if(!pool) return;
    await pool.query('UPDATE organizations SET name=? WHERE id=?',[name,orgId]);
}

// ── Tunnels ───────────────────────────────────────────────────────────────────
export async function getUserTunnels(userId) {
    if(!pool) return [];
    const [r]=await pool.query('SELECT * FROM tunnels WHERE user_id=? AND status="online" ORDER BY created_at DESC',[userId]);
    return r;
}

// ── Subdomains ────────────────────────────────────────────────────────────────
export async function getUserSubdomains(userId){
    if(!pool) return [];
    const [r]=await pool.query('SELECT * FROM subdomains WHERE user_id=? ORDER BY created_at DESC',[userId]);
    return r;
}
export async function createSubdomain(userId,orgId,name){
    if(!pool) return false;
    try { await pool.query('INSERT INTO subdomains (user_id,org_id,name) VALUES(?,?,?)',[userId,orgId,name]); return true;}
    catch(e){return false;}
}
export async function deleteSubdomain(id,userId){
    if(!pool) return;
    await pool.query('DELETE FROM subdomains WHERE id=? AND user_id=?',[id,userId]);
}

// ── Domains ───────────────────────────────────────────────────────────────────
export async function getUserDomains(userId){
    if(!pool) return [];
    const [r]=await pool.query('SELECT * FROM domains WHERE user_id=? ORDER BY created_at DESC',[userId]);
    return r;
}
export async function createDomain(userId,orgId,domain){
    if(!pool) return false;
    try { await pool.query('INSERT INTO domains (user_id,org_id,domain) VALUES(?,?,?)',[userId,orgId,domain]); return true;}
    catch(e){return false;}
}
export async function deleteDomain(id,userId){
    if(!pool) return;
    await pool.query('DELETE FROM domains WHERE id=? AND user_id=?',[id,userId]);
}

// ── API Tokens ────────────────────────────────────────────────────────────────
export async function getExtraTokens(userId){
    if(!pool) return [];
    const [r]=await pool.query('SELECT * FROM api_tokens WHERE user_id=? ORDER BY created_at DESC',[userId]);
    return r;
}
export async function generateToken(userId, name){
    if(!pool) return;
    const t='apt_'+crypto.randomBytes(20).toString('hex');
    await pool.query('INSERT INTO api_tokens (user_id, name, token_value) VALUES(?,?,?)',[userId, name || 'New Token', t]);
}
export async function deleteToken(id,userId){
    if(!pool) return;
    await pool.query('DELETE FROM api_tokens WHERE id=? AND user_id=?',[id,userId]);
}

// ── Requests ──────────────────────────────────────────────────────────────────
export async function getRequestLogs(userId){
    if(!pool) return [];
    const [r]=await pool.query('SELECT * FROM request_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[userId]);
    return r;
}

// ── Members ───────────────────────────────────────────────────────────────────
export async function getOrgMembers(orgId){
    if(!pool) return [];
    const [r]=await pool.query('SELECT u.*,om.role FROM users u JOIN organization_members om ON u.id=om.user_id WHERE om.org_id=?',[orgId]);
    return r;
}
export async function inviteMember(orgId, username, role, invitedById) {
    if(!pool) return { ok: false, msg: 'Database error' };
    const [u] = await pool.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!u.length) return { ok: false, msg: 'User not found' };
    const targetUserId = u[0].id;

    // Check if already a member
    const [existing] = await pool.query('SELECT * FROM organization_members WHERE org_id = ? AND user_id = ?', [orgId, targetUserId]);
    if (existing.length) return { ok: false, msg: 'User is already a member' };

    // Check if already invited
    const [pending] = await pool.query('SELECT * FROM organization_invites WHERE org_id = ? AND user_id = ? AND status = "pending"', [orgId, targetUserId]);
    if (pending.length) return { ok: false, msg: 'Invitation already pending' };

    await pool.query('INSERT INTO organization_invites (org_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)', [orgId, targetUserId, role, invitedById]);
    return { ok: true };
}

export async function getUserInvites(userId) {
    if(!pool) return [];
    const [r] = await pool.query(`
        SELECT i.*, o.name as org_name, o.slug as org_slug, u.username as inviter_name 
        FROM organization_invites i 
        JOIN organizations o ON i.org_id = o.id 
        JOIN users u ON i.invited_by = u.id 
        WHERE i.user_id = ? AND i.status = 'pending'
    `, [userId]);
    return r;
}

export async function respondToInvite(inviteId, userId, action) {
    if(!pool) return false;
    const [i] = await pool.query('SELECT * FROM organization_invites WHERE id = ? AND user_id = ? AND status = "pending"', [inviteId, userId]);
    if (!i.length) return false;

    if (action === 'accept') {
        await pool.query('UPDATE organization_invites SET status = "accepted" WHERE id = ?', [inviteId]);
        await pool.query('INSERT IGNORE INTO organization_members (org_id, user_id, role) VALUES (?, ?, ?)', [i[0].org_id, userId, i[0].role]);
    } else {
        await pool.query('UPDATE organization_invites SET status = "declined" WHERE id = ?', [inviteId]);
    }
    return true;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function updateUsername(userId,username){
    if(!pool) return false;
    try { await pool.query('UPDATE users SET username=? WHERE id=?',[username,userId]); return true;}
    catch(e){return false;}
}
export async function updatePassword(userId,oldPass,newPass){
    if(!pool) return false;
    const [r]=await pool.query('SELECT id FROM users WHERE id=? AND password=?',[userId,oldPass]);
    if(!r.length) return false;
    await pool.query('UPDATE users SET password=? WHERE id=?',[newPass,userId]);
    return true;
}
export async function deleteAccount(userId, password){
    if(!pool) return { ok: false, msg: 'Database error' };
    const [r] = await pool.query('SELECT id FROM users WHERE id = ? AND password = ?', [userId, password]);
    if (!r.length) return { ok: false, msg: 'Invalid password' };
    
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return { ok: true };
}

export async function transferOrgOwnership(orgId, oldOwnerId, newUsername) {
    if(!pool) return { ok: false, msg: 'Database connection lost' };
    
    // 1. Find the new user
    const [users] = await pool.query('SELECT id FROM users WHERE username = ?', [newUsername]);
    if (users.length === 0) return { ok: false, msg: 'User not found' };
    const newOwnerId = users[0].id;
    
    if (newOwnerId === oldOwnerId) return { ok: false, msg: 'You are already the owner' };
    
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        // 2. Update the organization record
        await conn.query('UPDATE organizations SET created_by = ? WHERE id = ?', [newOwnerId, orgId]);
        
        // 3. Make the old owner an admin
        await conn.query('UPDATE organization_members SET role = "admin" WHERE org_id = ? AND user_id = ?', [orgId, oldOwnerId]);
        
        // 4. Upsert the new owner as owner
        const [existing] = await conn.query('SELECT * FROM organization_members WHERE org_id = ? AND user_id = ?', [orgId, newOwnerId]);
        if (existing.length > 0) {
            await conn.query('UPDATE organization_members SET role = "owner" WHERE org_id = ? AND user_id = ?', [orgId, newOwnerId]);
        } else {
            await conn.query('INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, "owner")', [orgId, newOwnerId]);
        }
        
        await conn.commit();
        return { ok: true };
    } catch (e) {
        await conn.rollback();
        return { ok: false, msg: 'Transfer failed' };
    } finally {
        conn.release();
    }
}
