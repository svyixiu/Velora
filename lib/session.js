import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";

function getSecret() {
  const secret = process.env.VELORA_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "VELORA_SESSION_SECRET must be configured with at least 32 characters.",
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function sealChallenge(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecret(), iv);
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

export function openChallenge(token) {
  if (!token) return null;

  const [version, ivText, tagText, encryptedText] = token.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSecret(),
      Buffer.from(ivText, "base64url"),
    );
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
