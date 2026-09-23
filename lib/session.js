import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = "v2";
const AAD = Buffer.from("velora.quick-login.v2", "utf8");

function decodeSessionKey(sessionKey) {
  if (!sessionKey) return null;

  try {
    const key = Buffer.from(sessionKey, "base64url");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function generateSessionKey() {
  return randomBytes(32).toString("base64url");
}

export function sealChallenge(payload, sessionKey) {
  const key = decodeSessionKey(sessionKey);

  if (!key) {
    throw new Error("Velora could not create an ephemeral session key.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function openChallenge(token, sessionKey) {
  if (!token) return null;

  const key = decodeSessionKey(sessionKey);
  if (!key) return null;

  const [version, ivText, tagText, encryptedText] = token.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivText, "base64url"),
    );

    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}
