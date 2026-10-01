import crypto from "crypto";
import db from "./db.js";

const AUTH_COOKIE_NAME = "userId";
const AUTH_COOKIE_OPTIONS = {
  signed: true,
  httpOnly: true,
  sameSite: "lax",
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
};

// Protected exclusion list (public pages and assets)
const publicPaths = ["/login.html", "/style.css"];

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    crypto.scryptSync(password, salt, 64),
  );
};

const createUser = (username, password) => {
  db.prepare("INSERT INTO users (name, password_hash) VALUES (?, ?)").run(
    username,
    hashPassword(password),
  );
};

// Returns the user if the credentials are valid, otherwise null.
const authenticateUser = (username, password) => {
  const user = db.prepare("SELECT * FROM users WHERE name = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
};

const requireAuth = (req, res, next) => {
  if (publicPaths.includes(req.path)) return next();

  const userId = req.signedCookies[AUTH_COOKIE_NAME];

  if (!userId) {
    return req.path === "/" || req.path.endsWith(".html")
      ? res.redirect("/login.html")
      : res.sendStatus(401);
  }
  req.userId = Number(userId);
  next();
};

export {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  createUser,
  authenticateUser,
  requireAuth,
};
