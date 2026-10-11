import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const isStaging = process.env.NODE_ENV === 'staging' || process.env.STAGING_MODE === 'true';

if (isStaging) {
    const stagingEnvPath = path.resolve(process.cwd(), '.env.staging');
    if (fs.existsSync(stagingEnvPath)) {
        dotenv.config({ path: stagingEnvPath, override: true });
    }
}

const config = {
    token: isStaging ? (process.env.STAGING_DISCORD_TOKEN || "") : (process.env.TOKEN || ""),
    clientId: isStaging ? (process.env.STAGING_CLIENT_ID || process.env.CLIENT_ID || "") : (process.env.CLIENT_ID || ""),
    prefix: process.env.PREFIX || '!',
    color: process.env.BOT_COLOR ? (isNaN(process.env.BOT_COLOR) ? process.env.BOT_COLOR : parseInt(process.env.BOT_COLOR)) : 2829616,
    owners: process.env.OWNERS ? process.env.OWNERS.split(',').map(id => id.trim()) : [
        '788970167907778562'
    ],
    developers: process.env.DEVELOPERS ? process.env.DEVELOPERS.split(',').map(id => id.trim()) : [
        '788970167907778562'
    ],
    avatar: "https://cdn.discordapp.com/avatars/1558715279528165476/a_474949642653fe1b699d1238e1e334e4.gif?size=1024",
    banner: "https://cdn.discordapp.com/banners/1558715279528165476/a_350a7e514e06cb36ffef4c39635f5518.gif?size=1024",
    links: {
        supportServer: "https://discord.gg/XA4VZMYsbP",
    },
    webhooks: {
        error: process.env.ERROR_WEBHOOK_URL || "",
    }
};

export default config;
