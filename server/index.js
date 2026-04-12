import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();
import {
    initDB, createUser, authenticate, findOrCreateOAuthUser,
    getUserOrganizations, createOrganization, updateOrgName, getOrgBySlug,
    getUserTunnels, getUserSubdomains, createSubdomain, deleteSubdomain,
    getUserDomains, createDomain, deleteDomain,
    getExtraTokens, generateToken, deleteToken,
    getRequestLogs, getOrgMembers, inviteMember,
    updateUsername, updatePassword, deleteAccount,
    pool
} from './db.js';

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ── Active Tunnels ───────────────────────────────────────────────────────────
const activeTunnels = new Map(); // subdomain -> { ws, userId, orgId }
const pendingRequests = new Map(); // reqId -> { res, timeout }

// ── Middleware (Static Files First) ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Debug Logger & CSP Override ─────────────────────────────────────────────
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval';");
    next();
});

// ── Proxy Middleware ─────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
    const host = req.headers.host;
    // Assuming the main dashboard is app.apout.dev or localhost:8080
    // We detect subdomains like myapp.apout.dev
    const mainHost = 'localhost:8080'; // Change to your actual domain in production
    
    if (host && host !== mainHost && !host.startsWith('localhost')) {
        const subdomain = host.split('.')[0];
        const tunnel = activeTunnels.get(subdomain);
        
        if (tunnel) {
            const requestId = uuidv4();
            const requestData = {
                type: 'request',
                id: requestId,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body
            };
            
            pendingRequests.set(requestId, { 
                res, 
                reqMethod: req.method,
                reqUrl: req.url,
                timeout: setTimeout(() => {
                    if (pendingRequests.has(requestId)) {
                        pendingRequests.delete(requestId);
                        res.status(504).send('Tunnel Timeout');
                    }
                }, 30000) 
            });
            
            tunnel.ws.send(JSON.stringify(requestData));
            return; // Pipeline handled by WS response
        }
    }
    next();
});

// ── Subdomain Redirect Helper ────────────────────────────────────────────────
// If user hits myapp.apout-server.com/dashboard/xxx, redirect them back to main site?
// Actually the middleware above should handle it.

// (Keep existing Reserved Slugs, Middleware, Auth, Routes...)
const RESERVED_SLUGS = new Set([
    'admin','api','www','app','dashboard','login','logout','register','auth',
    'support','help','billing','settings','static','assets','public','status',
    'docs','blog','about','contact','pricing','terms','privacy','security',
    'legal','mail','smtp','ftp','vpn','git','dev','test','staging','prod',
    'apout','apcodesphere','organization','org','tunnel','tunnels','webhook'
]);

// ── App Settings ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(session({ 
    secret: process.env.SESSION_SECRET || 'apout_fallback_secret_2025', 
    resave: false, 
    saveUninitialized: false 
}));
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

// ── OAuth Strategies ──────────────────────────────────────────────────────────
passport.use(new GitHubStrategy(
    { 
        clientID: process.env.GITHUB_CLIENT_ID, 
        clientSecret: process.env.GITHUB_CLIENT_SECRET, 
        callbackURL: '/auth/github/callback' 
    },
    async (at,rt,profile,done) => { try { done(null, await findOrCreateOAuthUser({provider:'github',providerId:String(profile.id),username:profile.username,email:profile.emails?.[0]?.value})); } catch(e){done(e);}}
));
passport.use(new GoogleStrategy(
    { 
        clientID: process.env.GOOGLE_CLIENT_ID, 
        clientSecret: process.env.GOOGLE_CLIENT_SECRET, 
        callbackURL: '/auth/google/callback' 
    },
    async (at,rt,profile,done) => { try { done(null, await findOrCreateOAuthUser({provider:'google',providerId:String(profile.id),username:profile.displayName,email:profile.emails?.[0]?.value})); } catch(e){done(e);}}
));

initDB();

// ── Helpers ───────────────────────────────────────────────────────────────────
const getUser = (req) => req.session.user || req.user;

const requireAuth = (req, res, next) => {
    if (getUser(req)) return next();
    res.redirect('/login');
};

// Requires user has at minimum 1 org, else redirect to create-org
const requireOrg = async (req, res, next) => {
    const user = getUser(req);
    if (!user) return res.redirect('/login');
    const orgs = await getUserOrganizations(user.id).catch(() => []);
    if (orgs.length === 0) return res.redirect('/organization/create');
    req.userOrgs = orgs;
    next();
};

// Load page-level data for org-scoped pages
const loadOrgPage = async (req, res, view, activeNav, pageTitle, extra = {}) => {
    const user = getUser(req);
    const orgs = req.userOrgs || await getUserOrganizations(user.id).catch(() => []);
    const slug = req.params.slug;
    const activeOrg = orgs.find(o => o.slug === slug) || orgs[0];
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const latestRequests = await getRequestLogs(user.id).then(logs => logs.slice(0, 5)).catch(() => []);
    res.render(view, { user, orgs, activeOrg, tunnelCount: tunnels.length, tunnels, activeNav, pageTitle, latestRequests, ...extra });
};

// ── Public Routes ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.render('index'));
app.get('/pricing', (req, res) => res.render('pricing'));
app.get('/features', (req, res) => res.render('features'));
app.get('/docs', (req, res) => res.render('docs'));
app.get('/privacy', (req, res) => res.render('privacy'));
app.get('/terms', (req, res) => res.render('privacy')); // Reuse privacy style for now
app.get('/login',    (req, res) => res.render('login',    { error: null }));
app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/login', async (req, res) => {
    const user = await authenticate(req.body.username, req.body.password);
    if (user) { req.session.user = user; return res.redirect('/dashboard'); }
    res.render('login', { error: 'Invalid username or password' });
});
app.post('/register', async (req, res) => {
    const user = await createUser(req.body.username, req.body.password);
    if (user) { req.session.user = user; return res.redirect('/dashboard'); }
    res.render('register', { error: 'Username already taken' });
});
app.get('/logout', (req, res) => { req.session.destroy(); req.logout?.(() => {}); res.redirect('/'); });

// ── OAuth ─────────────────────────────────────────────────────────────────────
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), (req, res) => res.redirect('/dashboard'));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => res.redirect('/dashboard'));

// ── /dashboard redirect → org-scoped URL ─────────────────────────────────────
app.get('/dashboard', requireAuth, requireOrg, async (req, res) => {
    const orgs = req.userOrgs;
    res.redirect(`/dashboard/${orgs[0].slug}`);
});

// ── Organization Create ───────────────────────────────────────────────────────
app.get('/organization/create', requireAuth, async (req, res) => {
    const user = getUser(req);
    const orgs = await getUserOrganizations(user.id).catch(() => []);
    const activeOrg = orgs[0] || null;
    res.render('create-org', { user, orgs, activeOrg, activeNav: 'dashboard', pageTitle: 'Create Organization', tunnelCount: 0, error: null });
});
app.post('/organization/create', requireAuth, async (req, res) => {
    const user = getUser(req);
    const { name, slug } = req.body;

    // Validate slug
    const cleanSlug = slug?.toLowerCase().trim();
    const orgs = await getUserOrganizations(user.id).catch(() => []);
    const activeOrg = orgs[0] || null;

    if (RESERVED_SLUGS.has(cleanSlug)) {
        return res.render('create-org', { user, orgs, activeOrg, activeNav: 'dashboard', pageTitle: 'Create Organization', tunnelCount: 0, error: `"${cleanSlug}" is a reserved name. Please choose a different slug.` });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(cleanSlug)) {
        return res.render('create-org', { user, orgs, activeOrg, activeNav:'dashboard', pageTitle:'Create Organization', tunnelCount:0, error:'Slug must be 3-40 chars: lowercase letters, numbers, hyphens only (no leading/trailing hyphens).' });
    }

    const ok = await createOrganization(name, cleanSlug, user.id);
    if (!ok) {
        return res.render('create-org', { user, orgs, activeOrg, activeNav:'dashboard', pageTitle:'Create Organization', tunnelCount:0, error:'Slug already taken. Please choose another.' });
    }
    res.redirect(`/dashboard/${cleanSlug}`);
});

// ── Org-scoped dashboard routes ───────────────────────────────────────────────
const orgRouter = express.Router({ mergeParams: true });

orgRouter.use(requireAuth, requireOrg);

// Verify the slug belongs to this user
orgRouter.use(async (req, res, next) => {
    const user = getUser(req);
    const orgs = req.userOrgs;
    const org = orgs.find(o => o.slug === req.params.slug);
    if (!org) return res.redirect('/dashboard');
    req.activeOrg = org;
    next();
});

orgRouter.get('/', async (req, res) => {
    const user = getUser(req);
    const orgs = req.userOrgs;
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const subdomains = await getUserSubdomains(user.id).catch(() => []);
    const extraTokens = await getExtraTokens(user.id).catch(() => []);
    const members = await getOrgMembers(req.activeOrg.id).catch(() => []);
    const invites = await getUserInvites(user.id).catch(() => []);
    const latestRequests = await getRequestLogs(user.id).then(logs => logs.slice(0, 5)).catch(() => []);
    res.render('dashboard', { user, orgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'dashboard', pageTitle: 'Overview', subdomainCount: subdomains.length, tokenCount: extraTokens.length + 1, memberCount: members.length, invites, latestRequests });
});

orgRouter.get('/tunnels', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    res.render('tunnels', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'tunnels', pageTitle: 'Active Tunnels' });
});

orgRouter.get('/requests', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const requests = await getRequestLogs(user.id).catch(() => []);
    res.render('requests', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'requests', pageTitle: 'Requests', requests });
});

orgRouter.get('/subdomains', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const subdomains = await getUserSubdomains(user.id).catch(() => []);
    res.render('subdomains', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'subdomains', pageTitle: 'Subdomains', subdomains });
});
orgRouter.post('/subdomains', async (req, res) => {
    const user = getUser(req);
    await createSubdomain(user.id, req.activeOrg.id, req.body.name);
    res.redirect(`/dashboard/${req.params.slug}/subdomains`);
});
orgRouter.post('/subdomains/:id/delete', async (req, res) => {
    await deleteSubdomain(req.params.id, getUser(req).id);
    res.redirect(`/dashboard/${req.params.slug}/subdomains`);
});

orgRouter.get('/domains', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const domains = await getUserDomains(user.id).catch(() => []);
    res.render('domains', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'domains', pageTitle: 'Domains', domains });
});
orgRouter.post('/domains', async (req, res) => {
    const user = getUser(req);
    await createDomain(user.id, req.activeOrg.id, req.body.domain);
    res.redirect(`/dashboard/${req.params.slug}/domains`);
});
orgRouter.post('/domains/:id/delete', async (req, res) => {
    await deleteDomain(req.params.id, getUser(req).id);
    res.redirect(`/dashboard/${req.params.slug}/domains`);
});

orgRouter.get('/billing', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    res.render('billing', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'billing', pageTitle: 'Billing' });
});

orgRouter.get('/members', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const members = await getOrgMembers(req.activeOrg.id).catch(() => []);
    res.render('members', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'members', pageTitle: 'Members', members });
});
orgRouter.post('/members/invite', async (req, res) => {
    const user = getUser(req);
    const result = await inviteMember(req.activeOrg.id, req.body.username, req.body.role || 'member', user.id);
    if (!result.ok) {
        req.session.flash = { type: 'error', msg: result.msg };
    } else {
        req.session.flash = { type: 'success', msg: 'Invitation sent successfully!' };
    }
    res.redirect(`/dashboard/${req.params.slug}/members`);
});
orgRouter.post('/settings/transfer-ownership', async (req, res) => {
    const user = getUser(req);
    const result = await transferOrgOwnership(req.activeOrg.id, user.id, req.body.new_owner);
    if (result.ok) {
        req.session.flash = { type: 'success', msg: `Ownership successfully transferred to ${req.body.new_owner}` };
        res.redirect('/dashboard');
    } else {
        req.session.flash = { type: 'error', msg: result.msg || 'Transfer failed' };
        res.redirect(`/dashboard/${req.params.slug}/settings?tab=org`);
    }
});

orgRouter.get('/api-tokens', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    const extraTokens = await getExtraTokens(user.id).catch(() => []);
    res.render('api-tokens', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'api-tokens', pageTitle: 'API Tokens', extraTokens });
});
orgRouter.post('/api-tokens/generate', async (req, res) => {
    await generateToken(getUser(req).id, req.body.name);
    res.redirect(`/dashboard/${req.params.slug}/api-tokens`);
});
orgRouter.post('/api-tokens/:id/delete', async (req, res) => {
    await deleteToken(req.params.id, getUser(req).id);
    res.redirect(`/dashboard/${req.params.slug}/api-tokens`);
});

orgRouter.get('/settings', async (req, res) => {
    const user = getUser(req);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    res.render('settings', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'settings', pageTitle: 'Settings', flash: null });
});
orgRouter.post('/settings/profile', async (req, res) => {
    const user = getUser(req);
    const ok = await updateUsername(user.id, req.body.username);
    if (ok && req.session.user) req.session.user.username = req.body.username;
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    res.render('settings', { user: getUser(req), orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'settings', pageTitle: 'Settings', flash: { type: ok ? 'success' : 'error', msg: ok ? 'Username updated!' : 'Username taken.' } });
});
orgRouter.post('/settings/password', async (req, res) => {
    const user = getUser(req);
    const ok = await updatePassword(user.id, req.body.current_password, req.body.new_password);
    const tunnels = await getUserTunnels(user.id).catch(() => []);
    res.render('settings', { user, orgs: req.userOrgs, activeOrg: req.activeOrg, tunnelCount: tunnels.length, tunnels, activeNav: 'settings', pageTitle: 'Settings', flash: { type: ok ? 'success' : 'error', msg: ok ? 'Password updated!' : 'Current password incorrect.' } });
});
orgRouter.post('/settings/org', async (req, res) => {
    await updateOrgName(req.activeOrg.id, req.body.org_name);
    res.redirect(`/dashboard/${req.params.slug}/settings?tab=org`);
});

app.post('/invites/respond/:id', requireAuth, async (req, res) => {
    const user = getUser(req);
    const ok = await respondToInvite(req.params.id, user.id, req.body.action);
    if (ok) {
        req.session.flash = { type: 'success', msg: `Invitation ${req.body.action}ed!` };
    }
    res.redirect('/dashboard');
});

orgRouter.post('/settings/delete-account', async (req, res) => {
    const user = getUser(req);
    const result = await deleteAccount(user.id, req.body.password);
    if (result.ok) {
        req.logout(() => res.redirect('/'));
    } else {
        req.session.flash = { type: 'error', msg: result.msg };
        res.redirect(`/dashboard/${req.params.slug}/settings?tab=security`);
    }
});

// Mount org router
app.use('/dashboard/:slug', orgRouter);

// ── WebSocket Logic ──────────────────────────────────────────────────────────
wss.on('connection', async (ws, req) => {
    let tunnelInfo = null;

    ws.on('message', async (data) => {
        try {
            const raw = data.toString();
            console.log(`[WS] Message received: ${raw.substring(0, 100)}...`);
            const msg = JSON.parse(raw);
            
            if (msg.type === 'auth') {
                const { token, subdomain, local_port } = msg;
                console.log(`[WS] Auth attempt for subdomain: ${subdomain}`);
                
                const [users] = await pool.query('SELECT * FROM users WHERE token = ?', [token]);
                console.log(`[WS] DB query finished. User found: ${users.length > 0}`);
                
                if (users.length === 0) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
                    return ws.close();
                }
                
                const user = users[0];
                if (activeTunnels.has(subdomain)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Subdomain already in use' }));
                    return ws.close();
                }

                tunnelInfo = { ws, userId: user.id, subdomain };
                activeTunnels.set(subdomain, tunnelInfo);
                
                // Track in DB
                await pool.query('INSERT INTO tunnels (user_id, subdomain, local_port, status) VALUES (?, ?, ?, "online") ON DUPLICATE KEY UPDATE local_port=?, status="online"', [user.id, subdomain, local_port, local_port]);
                
                ws.send(JSON.stringify({ type: 'authenticated', subdomain }));
                console.log(`📡 Tunnel started: ${subdomain} for user ${user.username}`);
            }

            if (msg.type === 'response') {
                const { id, status, headers, body } = msg;
                const pending = pendingRequests.get(id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    pendingRequests.delete(id);
                    
                    // Save log to DB
                    await pool.query('INSERT INTO request_logs (user_id, tunnel, method, path, status) VALUES (?, ?, ?, ?, ?)', 
                        [tunnelInfo.userId, tunnelInfo.subdomain, pending.reqMethod, pending.reqUrl, status || 200]);
                    
                    Object.entries(headers || {}).forEach(([k, v]) => pending.res.setHeader(k, v));
                    pending.res.status(status || 200).send(body);
                }
            }
        } catch (e) { console.error('WS Error:', e); }
    });

    ws.on('close', async () => {
        if (tunnelInfo) {
            activeTunnels.delete(tunnelInfo.subdomain);
            await pool.query('UPDATE tunnels SET status="offline" WHERE subdomain=?', [tunnelInfo.subdomain]);
            console.log(`🛑 Tunnel stopped: ${tunnelInfo.subdomain}`);
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`✅ Apout → http://localhost:${PORT}`));
