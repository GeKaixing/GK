#!/usr/bin/env node
/*
  Script: Encrypt existing plaintext Gemini API keys in UserSettings.
  Usage:
    GEMINI_KEY_ENC_SECRET=your-secret node scripts/encrypt-gemini-keys.js

  The secret may be a 32-byte base64 string or any passphrase (SHA-256 derived).
*/

const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

function getEncKeyOrNull() {
  const raw = process.env.GEMINI_KEY_ENC_SECRET || process.env.GEMINI_KEY_ENC_KEY || '';
  if (!raw) return null;
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && Buffer.from(raw, 'base64').length === 32) {
      return Buffer.from(raw, 'base64');
    }
    return crypto.createHash('sha256').update(String(raw)).digest();
  } catch (e) {
    return null;
  }
}

function encryptForStorage(plaintext) {
  const key = getEncKeyOrNull();
  if (!key) throw new Error('Encryption key not configured (GEMINI_KEY_ENC_SECRET)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return `enc:${combined.toString('base64')}`;
}

async function main() {
  const key = getEncKeyOrNull();
  if (!key) {
    console.error('GEMINI_KEY_ENC_SECRET is not set. To run this script set the env var and re-run:');
    console.error('  GEMINI_KEY_ENC_SECRET=your-secret node scripts/encrypt-gemini-keys.js');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log('Scanning UserSettings for plaintext geminiApiKey values...');
    const rows = await prisma.userSettings.findMany({
      where: { geminiApiKey: { not: null } },
      select: { userId: true, geminiApiKey: true },
    });

    let updated = 0;
    for (const r of rows) {
      const val = r.geminiApiKey;
      if (!val) continue;
      if (val.startsWith('enc:')) continue; // already encrypted
      try {
        const encrypted = encryptForStorage(val);
        await prisma.userSettings.update({ where: { userId: r.userId }, data: { geminiApiKey: encrypted } });
        updated++;
        console.log(`Encrypted user ${r.userId}`);
      } catch (e) {
        console.error(`Failed to encrypt for user ${r.userId}:`, e.message || e);
      }
    }

    console.log(`Done. Updated ${updated} rows.`);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main();
